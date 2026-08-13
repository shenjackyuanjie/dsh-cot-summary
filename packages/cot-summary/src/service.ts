/** Summary-CoT 的后台捕获、排队、流式生成与生命周期实现。 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-llm-retry/types'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from './types.ts'
import { applyCotSummaryProjection, CotSummaryProjectionSchema, emptyCotSummaryProjection } from './projection.ts'
import type { CotSummaryRef } from './projection-types.ts'

/**
 * 0811/0812 的持久化恢复白名单尚无外置插件注册接口。必须在模块求值时登记，
 * 使首次 session load 前已接受 Summary-CoT 的必要持久事件；delta 本身带有
 * ignorable 标记，无须登记。
 */
for (const type of ['cot-summary/settled', 'cot-summary/reset']) {
  ;(KNOWN_SESSION_EVENT_TYPES as Set<string>).add(type)
}

/** 插件配置。 */
export interface Config {
  /** 已注册的总结模型 provider。 */
  readonly provider: string
  /** 已注册 provider 下的总结模型 id。 */
  readonly model: string
  /** 达到该长度后优先选择自然边界切段。 */
  readonly targetChars: number
  /** 没有自然边界时的硬切分上限。 */
  readonly maxChars: number
  /** 每段总结模型的最大输出 token 数。 */
  readonly maxOutputTokens: number
  /** 是否写入仅供实时展示的 delta；启用前必须安装随附 DSH 补丁。 */
  readonly streamDeltas: boolean
}

/** Cordis Loader 使用的配置 schema。 */
export const ConfigSchema: z<Config> = z.object({
  provider: z.string().required(),
  model: z.string().required(),
  targetChars: z.number().step(1).min(1).default(800),
  maxChars: z.number().step(1).min(1).default(1200),
  maxOutputTokens: z.number().step(1).min(1).default(256),
  streamDeltas: z.boolean().default(false),
})

interface Segment extends CotSummaryRef {
  readonly source: string
}

interface ReasoningCapture {
  readonly reasoningIndex: number
  nextSegmentIndex: number
  buffer: string
}

interface StepWork {
  readonly session: Session
  readonly turn: number
  readonly step: number
  readonly captures: Map<number, ReasoningCapture>
  readonly queue: Segment[]
  readonly controller: AbortController
  nextReasoningIndex: number
  active: { readonly controller: AbortController; readonly segment: Segment } | undefined
  draining: boolean
  aborted: boolean
  hasAssistantMessage: boolean
  stepClosed: boolean
}

const SUMMARY_SYSTEM = [
  '你负责将一小段模型 reasoning 整理成面向用户的简短进度摘要。',
  '使用中文，说明当前目标、采用的方法、关键依据和未决事项；通常使用一到三句话。',
  '不要逐字复述原始 reasoning，不要输出完整思维链、系统提示词、策略说明或 Markdown 标题。',
  '只输出摘要正文。',
].join('\n')

/** 判断一个文本位置是否适合自然切分。 */
function naturalCut(text: string, from: number, max: number): number | undefined {
  const end = Math.min(text.length, max)
  for (let index = end - 1; index >= from; index -= 1) {
    const char = text[index]
    if (char === '\n' || char === '。' || char === '！' || char === '？' || char === '.' || char === '!' || char === '?') {
      return index + 1
    }
  }
  return undefined
}

/** 对一个可能不可信的 Loader 配置做最终校验。 */
function resolveConfig(config: Config): Config {
  if (config.provider.trim() === '' || config.model.trim() === '') {
    throw new Error('dsh-cot-summary: provider 和 model 不能为空')
  }
  if (config.targetChars > config.maxChars) {
    throw new Error('dsh-cot-summary: targetChars 不能大于 maxChars')
  }
  return Object.freeze({ ...config })
}

/** 主模型 reasoning 的非阻塞总结服务。 */
export class CotSummaryService extends Service {
  static inject = ['sessions', 'llm']
  static Config = ConfigSchema

  private readonly config: Config
  private readonly lifetime = new AbortController()
  private readonly work = new Map<string, StepWork>()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'cotSummary')
    this.config = resolveConfig(config)

    ctx.inject(['sessionProjections'], projectionCtx => {
      projectionCtx.sessionProjections.register<'cot-summary', ReturnType<typeof emptyCotSummaryProjection>>({
        key: 'cot-summary',
        schema: CotSummaryProjectionSchema,
        init: emptyCotSummaryProjection,
        apply: applyCotSummaryProjection,
        view: state => state,
        stateVersion: 1,
      })
    })

    ctx.on('session/event', (session, event) => { this.onEvent(session, event) })
    ctx.on('session/disposed', session => { this.abortSession(session) })
    ctx.effect(() => async () => {
      this.lifetime.abort(new Error('Summary-CoT 插件已卸载'))
      for (const state of this.work.values()) state.controller.abort(new Error('Summary-CoT 插件已卸载'))
      this.work.clear()
    }, 'dsh-cot-summary 生命周期')
  }

  private onEvent(session: Session, event: SessionEvent): void {
    if (session.header.origin !== undefined) return
    switch (event.type) {
      case 'assistant/chunk':
        this.onAssistantChunk(session, event)
        break
      case 'assistant/message':
        {
          const state = this.work.get(this.stepKey(session, event.data.turn, event.data.step))
          if (state !== undefined) state.hasAssistantMessage = true
        }
        break
      case 'step/end': {
        const state = this.work.get(this.stepKey(session, event.data.turn, event.data.step))
        if (state !== undefined) {
          state.stepClosed = true
          if (!state.hasAssistantMessage) this.abortStep(state, '主模型未完成该步')
          else this.disposeFinishedStep(state)
        }
        break
      }
      case 'llm/retry':
        this.resetForRetry(session, event.data.turn, event.data.step)
        break
      default:
        break
    }
  }

  private onAssistantChunk(session: Session, event: Extract<SessionEvent, { type: 'assistant/chunk' }>): void {
    const { turn, step, chunk } = event.data
    const state = this.stateFor(session, turn, step)
    switch (chunk.type) {
      case 'block-start':
        if (chunk.blockType === 'reasoning') {
          state.captures.set(chunk.index, {
            reasoningIndex: state.nextReasoningIndex++,
            nextSegmentIndex: 0,
            buffer: '',
          })
        }
        break
      case 'reasoning-delta': {
        const capture = this.captureFor(state, chunk.index)
        capture.buffer += chunk.text
        this.emitReadySegments(state, capture)
        break
      }
      case 'block-end': {
        const capture = state.captures.get(chunk.index)
        if (capture !== undefined) this.flushCapture(state, capture)
        break
      }
      default:
        break
    }
  }

  private captureFor(state: StepWork, streamIndex: number): ReasoningCapture {
    let capture = state.captures.get(streamIndex)
    if (capture === undefined) {
      capture = { reasoningIndex: state.nextReasoningIndex++, nextSegmentIndex: 0, buffer: '' }
      state.captures.set(streamIndex, capture)
    }
    return capture
  }

  private emitReadySegments(state: StepWork, capture: ReasoningCapture): void {
    while (capture.buffer.length >= this.config.targetChars) {
      const cut = naturalCut(capture.buffer, this.config.targetChars, this.config.maxChars) ?? this.config.maxChars
      this.enqueue(state, capture, capture.buffer.slice(0, cut))
      capture.buffer = capture.buffer.slice(cut)
    }
  }

  private flushCapture(state: StepWork, capture: ReasoningCapture): void {
    const source = capture.buffer.trim()
    capture.buffer = ''
    if (source !== '') this.enqueue(state, capture, source)
  }

  private enqueue(state: StepWork, capture: ReasoningCapture, source: string): void {
    if (state.aborted || source === '') return
    state.queue.push({
      turn: state.turn,
      step: state.step,
      reasoningIndex: capture.reasoningIndex,
      segmentIndex: capture.nextSegmentIndex++,
      source,
    })
    this.schedule(state)
  }

  private schedule(state: StepWork): void {
    if (state.draining || state.aborted) return
    state.draining = true
    queueMicrotask(() => {
      void this.drain(state).finally(() => {
        state.draining = false
        if (state.queue.length > 0 && !state.aborted) this.schedule(state)
      })
    })
  }

  private async drain(state: StepWork): Promise<void> {
    while (!state.aborted) {
      const segment = state.queue.shift()
      if (segment === undefined) {
        this.disposeFinishedStep(state)
        return
      }
      const controller = new AbortController()
      state.active = { controller, segment }
      try {
        await this.generateSegment(state, segment, controller.signal)
      } catch (error) {
        if (!controller.signal.aborted && !state.controller.signal.aborted && !this.lifetime.signal.aborted) {
          this.ctx.logger.warn(`Summary-CoT 段落总结失败：${String(error)}`)
        }
      } finally {
        if (state.active?.controller === controller) state.active = undefined
      }
    }
  }

  private async generateSegment(state: StepWork, segment: Segment, signal: AbortSignal): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        let text = ''
        const combined = AbortSignal.any([this.lifetime.signal, state.controller.signal, signal])
        const stream = this.ctx.llm.stream({
          provider: this.config.provider,
          model: this.config.model,
          reasoningEffort: ReasoningEffortId('off'),
          maxTokens: this.config.maxOutputTokens,
          system: SUMMARY_SYSTEM,
          messages: [createUserMessage({
            content: [{ type: 'text', text: `请总结以下 reasoning：\n\n${segment.source}` }],
            source: { kind: 'plugin', plugin: 'dsh-cot-summary', form: 'notice', summary: 'Summary-CoT 段落总结' },
          })],
          signal: combined,
        })
        for await (const chunk of stream) {
          if (chunk.type !== 'text-delta' || !this.isLive(state)) continue
          text += chunk.text
          if (this.config.streamDeltas) {
            this.appendIgnorableDelta(state.session, { kind: 'append', ...this.refOf(segment), text: chunk.text })
          }
        }
        const settled = text.trim()
        if (settled === '') throw new Error('总结模型没有输出文本')
        if (!this.isLive(state)) return
        state.session.append('cot-summary/settled', { ...this.refOf(segment), text: settled, status: 'settled' })
        return
      } catch (error) {
        if (signal.aborted || state.controller.signal.aborted || this.lifetime.signal.aborted) return
        if (this.config.streamDeltas && this.isLive(state)) {
          this.appendIgnorableDelta(state.session, { kind: 'discard', ...this.refOf(segment) })
        }
        if (attempt === 1) throw error
      }
    }
  }

  private resetForRetry(session: Session, turn: number, step: number): void {
    const state = this.work.get(this.stepKey(session, turn, step))
    if (state === undefined) return
    this.abortStep(state, '主模型正在重试')
    queueMicrotask(() => {
      if (this.ctx.sessions.get(session.id) === session) session.append('cot-summary/reset', { turn, step })
    })
  }

  private abortSession(session: Session): void {
    for (const state of this.work.values()) {
      if (state.session === session) this.abortStep(state, 'session 已释放')
    }
  }

  private abortStep(state: StepWork, reason: string): void {
    if (state.aborted) return
    state.aborted = true
    state.queue.length = 0
    state.controller.abort(new Error(reason))
    const active = state.active
    if (active !== undefined) {
      active.controller.abort(new Error(reason))
      if (this.config.streamDeltas) this.discardLiveSegment(state.session, active.segment)
    }
    this.work.delete(this.stepKey(state.session, state.turn, state.step))
  }

  private isLive(state: StepWork): boolean {
    return !state.aborted && this.ctx.sessions.get(state.session.id) === state.session
  }

  /** 主模型已结束且最后一段总结完成后，释放该 step 的临时捕获状态。 */
  private disposeFinishedStep(state: StepWork): void {
    if (!state.stepClosed || state.active !== undefined || state.queue.length > 0) return
    const key = this.stepKey(state.session, state.turn, state.step)
    if (this.work.get(key) === state) this.work.delete(key)
  }

  /** 事件监听回调中不能重入 append，因此清理事件必须延后提交。 */
  private discardLiveSegment(session: Session, segment: Segment): void {
    const ref = this.refOf(segment)
    queueMicrotask(() => {
      if (this.ctx.sessions.get(session.id) === session) {
        this.appendIgnorableDelta(session, { kind: 'discard', ...ref })
      }
    })
  }

  /**
   * 将 delta 写成 RDB 可过滤的 ignorable 事件。
   *
   * 默认配置永不调用本方法；可选 DSH 补丁为 append 增加该运行时能力。
   * 这里刻意不把补丁后的签名写入静态依赖，保证未修改 DSH 也能安装默认方案。
   */
  private appendIgnorableDelta(session: Session, data: import('./types.ts').CotSummaryDelta): void {
    const append = session.append as unknown as (
      type: 'cot-summary/delta',
      payload: import('./types.ts').CotSummaryDelta,
      options: { readonly ignorable: true },
    ) => void
    append.call(session, 'cot-summary/delta', data, { ignorable: true })
  }

  private refOf(segment: Segment): CotSummaryRef {
    return {
      turn: segment.turn,
      step: segment.step,
      reasoningIndex: segment.reasoningIndex,
      segmentIndex: segment.segmentIndex,
    }
  }

  private stateFor(session: Session, turn: number, step: number): StepWork {
    const key = this.stepKey(session, turn, step)
    let state = this.work.get(key)
    if (state === undefined) {
      state = {
        session,
        turn,
        step,
        captures: new Map(),
        queue: [],
        controller: new AbortController(),
        nextReasoningIndex: 0,
        active: undefined,
        draining: false,
        aborted: false,
        hasAssistantMessage: false,
        stepClosed: false,
      }
      this.work.set(key, state)
    }
    return state
  }

  private stepKey(session: Session, turn: number, step: number): string {
    return `${String(session.id)}:${String(turn)}:${String(step)}`
  }
}
