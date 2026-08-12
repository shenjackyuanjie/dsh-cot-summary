import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  createAssistantMessage, LlmAdapter, LlmService, ReasoningEffortId,
} from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { CotSummaryService } from '../packages/cot-summary/src/service.ts'

class SummaryAdapter extends LlmAdapter {
  readonly calls: GenerateOptions[] = []

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      reasoning: { efforts: [{ id: ReasoningEffortId('off'), name: '关闭思考' }] },
    })
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.calls.push(options)
    yield { type: 'text-delta', index: 0, text: '已完成本段推理的简要整理。' }
  }
}

async function setup() {
  const ctx = new Context()
  const adapter = new SummaryAdapter()
  await ctx.plugin(SessionStore)
  await ctx.plugin(LlmService)
  ctx.llm.registerAdapter(['summary'], adapter)
  await ctx.plugin(CotSummaryService, {
    provider: 'summary',
    model: 'summary-model',
    targetChars: 100,
    maxChars: 120,
    maxOutputTokens: 64,
    streamDeltas: false,
  })
  return { ctx, adapter }
}

/** 默认无补丁路径只写完整摘要，不把临时 delta 放进 session。 */
describe('CotSummaryService', () => {
  it('以 nonthinking 总结模型异步产出可持久化 settled 事件', async () => {
    const { ctx, adapter } = await setup()
    try {
      const session = ctx.sessions.create(SessionId('cot-summary-default'))
      session.append('turn/start', { turn: 1 })
      session.append('step/start', { turn: 1, step: 1 })
      session.append('assistant/chunk', {
        turn: 1,
        step: 1,
        chunk: { type: 'block-start', index: 0, blockType: 'reasoning' },
      })
      session.append('assistant/chunk', {
        turn: 1,
        step: 1,
        chunk: { type: 'reasoning-delta', index: 0, text: '先检查输入，再选择实现方案。' },
      })
      session.append('assistant/chunk', {
        turn: 1,
        step: 1,
        chunk: { type: 'block-end', index: 0, block: { type: 'reasoning', text: '先检查输入，再选择实现方案。' } },
      })
      session.append('assistant/message', {
        turn: 1,
        step: 1,
        message: createAssistantMessage({
          content: [{ type: 'text', text: '最终回答' }],
          source: { provider: 'main', model: 'main-model' },
        }),
      }, { surfaceOp: 'append' })
      session.append('step/end', { turn: 1, step: 1 })

      await vi.waitFor(() => {
        expect(adapter.calls).toHaveLength(1)
      })
      await vi.waitFor(() => {
        expect(session.events.filter(event => event.type === 'cot-summary/settled')).toHaveLength(1)
      })

      const settled = session.events.find(event => event.type === 'cot-summary/settled')
      expect(settled?.data).toMatchObject({
        turn: 1,
        step: 1,
        reasoningIndex: 0,
        segmentIndex: 0,
        text: '已完成本段推理的简要整理。',
        status: 'settled',
      })
      expect(session.events.some(event => event.type === 'cot-summary/delta')).toBe(false)
      expect(adapter.calls).toHaveLength(1)
      expect(adapter.calls[0]).toMatchObject({
        provider: 'summary',
        model: 'summary-model',
        reasoningEffort: 'off',
        maxTokens: 64,
      })
      expect(adapter.calls[0]?.messages[0]?.role).toBe('user')
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
