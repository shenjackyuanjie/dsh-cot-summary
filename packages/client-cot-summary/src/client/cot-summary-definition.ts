/** 将 Summary-CoT 事件映射为独立的 Chat 行。 */

import type {
  ChatConversationViewNode, ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@shenjack/dsh-cot-summary/types'
import { cotSummaryKey, type CotSummarySegment } from '@shenjack/dsh-cot-summary/projection'

/** 独立摘要行交给渲染器的不可变数据。 */
export interface CotSummaryRowData {
  readonly turn: number
  readonly step: number
  readonly segments: readonly CotSummarySegment[]
  readonly running: boolean
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    /** 不依赖 DSH 补丁的独立 Summary-CoT 行。 */
    'cot-summary-row': CotSummaryRowData
  }
}

interface CotSummaryRowState {
  readonly turn: number
  readonly step: number
  readonly segments: readonly CotSummarySegment[]
}

function replaceSegment(
  segments: readonly CotSummarySegment[],
  next: CotSummarySegment,
): readonly CotSummarySegment[] {
  const key = cotSummaryKey(next)
  const index = segments.findIndex(segment => cotSummaryKey(segment) === key)
  const updated = index === -1 ? [...segments, next] : segments.with(index, next)
  return updated.toSorted((left, right) => left.reasoningIndex - right.reasoningIndex
    || left.segmentIndex - right.segmentIndex)
}

/** 以 step/start 作为稳定起点，使无 delta 模式的 settled 事件也能直接显示。 */
export const cotSummaryRowDefinition: ConversationNodeDefinition<CotSummaryRowState> = {
  kind: 'cot-summary-row',
  target: 'chat',
  match: (event) => {
    if (event.type === 'step/start') return { id: `${event.data.turn}:${event.data.step}`, role: 'start' }
    if (event.type === 'cot-summary/delta'
      || event.type === 'cot-summary/settled'
      || event.type === 'cot-summary/reset') {
      return { id: `${event.data.turn}:${event.data.step}`, role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'step/start') throw new Error('cot-summary-row 必须由 step/start 启动')
    return { turn: match.event.data.turn, step: match.event.data.step, segments: [] }
  },
  update: (context, match) => {
    const state = context.state
    if (match.event.type === 'cot-summary/reset') return { ...state, segments: [] }
    if (match.event.type === 'cot-summary/settled') {
      return { ...state, segments: replaceSegment(state.segments, match.event.data) }
    }
    if (match.event.type === 'cot-summary/delta') {
      const index = state.segments.findIndex(segment => cotSummaryKey(segment) === cotSummaryKey(match.event.data))
      if (match.event.data.kind === 'discard') {
        return index === -1 ? state : { ...state, segments: state.segments.toSpliced(index, 1) }
      }
      const previous = index === -1 ? undefined : state.segments[index]
      return {
        ...state,
        segments: replaceSegment(state.segments, {
          turn: match.event.data.turn,
          step: match.event.data.step,
          reasoningIndex: match.event.data.reasoningIndex,
          segmentIndex: match.event.data.segmentIndex,
          text: (previous?.text ?? '') + match.event.data.text,
          status: 'streaming',
        }),
      }
    }
    return state
  },
  publication: match => match.event.type === 'cot-summary/delta' ? 'animation-frame' : 'immediate',
  buildViewNode: (context): ChatConversationViewNode | null => {
    const state = context.state
    const start = context.start
    if (state === undefined || start === undefined || state.segments.length === 0) return null
    const latest = context.matches.at(-1)?.event.seq ?? start.event.seq
    return {
      key: context.key,
      kind: 'cot-summary-row',
      id: context.id,
      target: 'chat',
      anchorSeq: latest + 0.1,
      location: start.location,
      visibility: 'visible',
      data: {
        turn: state.turn,
        step: state.step,
        segments: state.segments,
        running: state.segments.some(segment => segment.status === 'streaming'),
      },
    }
  },
}
