/** Summary-CoT 事件到浏览器投影的纯折叠逻辑。 */

import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { cotSummaryKey, type CotSummaryProjection, type CotSummarySegment } from './projection-types.ts'
import type {} from './types.ts'

const SegmentSchema = z.object({
  turn: z.number().int().nonnegative(),
  step: z.number().int().nonnegative(),
  reasoningIndex: z.number().int().nonnegative(),
  segmentIndex: z.number().int().nonnegative(),
  text: z.string(),
  status: z.union([z.literal('streaming'), z.literal('settled')]),
})

export const CotSummaryProjectionSchema = z.object({
  segments: z.array(SegmentSchema),
})

const EMPTY: CotSummaryProjection = Object.freeze({ segments: Object.freeze([]) })

/** 生成空的 Summary-CoT 投影。 */
export function emptyCotSummaryProjection(): CotSummaryProjection {
  return EMPTY
}

function sortSegments(segments: readonly CotSummarySegment[]): readonly CotSummarySegment[] {
  return [...segments].sort((left, right) => left.turn - right.turn
    || left.step - right.step
    || left.reasoningIndex - right.reasoningIndex
    || left.segmentIndex - right.segmentIndex)
}

function replaceSegment(
  state: CotSummaryProjection,
  next: CotSummarySegment,
): CotSummaryProjection {
  const key = cotSummaryKey(next)
  const index = state.segments.findIndex(segment => cotSummaryKey(segment) === key)
  const segments = index === -1
    ? [...state.segments, next]
    : state.segments.with(index, next)
  return { segments: sortSegments(segments) }
}

/** 将一条 Summary-CoT 事件折叠为新的完整投影。 */
export function applyCotSummaryProjection(
  state: CotSummaryProjection,
  event: SessionEvent,
): CotSummaryProjection {
  switch (event.type) {
    case 'cot-summary/delta': {
      const delta = event.data
      const key = cotSummaryKey(delta)
      const index = state.segments.findIndex(segment => cotSummaryKey(segment) === key)
      if (delta.kind === 'discard') {
        if (index === -1) return state
        return { segments: state.segments.toSpliced(index, 1) }
      }
      const previous = index === -1 ? undefined : state.segments[index]
      return replaceSegment(state, {
        turn: delta.turn,
        step: delta.step,
        reasoningIndex: delta.reasoningIndex,
        segmentIndex: delta.segmentIndex,
        text: (previous?.text ?? '') + delta.text,
        status: 'streaming',
      })
    }
    case 'cot-summary/settled':
      return replaceSegment(state, event.data)
    case 'cot-summary/reset': {
      const segments = state.segments.filter(segment => segment.turn !== event.data.turn || segment.step !== event.data.step)
      return segments.length === state.segments.length ? state : { segments }
    }
    default:
      return state
  }
}
