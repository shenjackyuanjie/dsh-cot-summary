import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { applyCotSummaryProjection, emptyCotSummaryProjection } from '../packages/cot-summary/src/projection.ts'

function event(type: string, data: unknown): SessionEvent {
  return { type, data, seq: 0, time: 0 } as SessionEvent
}

describe('Summary-CoT 投影', () => {
  it('实时 delta 只在内存投影中累积，settled 覆盖为最终完整文本', () => {
    let state = emptyCotSummaryProjection()
    state = applyCotSummaryProjection(state, event('cot-summary/delta', {
      kind: 'append', turn: 1, step: 1, reasoningIndex: 0, segmentIndex: 0, text: '正在',
    }))
    state = applyCotSummaryProjection(state, event('cot-summary/delta', {
      kind: 'append', turn: 1, step: 1, reasoningIndex: 0, segmentIndex: 0, text: '整理',
    }))
    expect(state.segments).toEqual([{
      turn: 1, step: 1, reasoningIndex: 0, segmentIndex: 0, text: '正在整理', status: 'streaming',
    }])

    state = applyCotSummaryProjection(state, event('cot-summary/settled', {
      turn: 1, step: 1, reasoningIndex: 0, segmentIndex: 0, text: '已整理完成。', status: 'settled',
    }))
    expect(state.segments).toEqual([{
      turn: 1, step: 1, reasoningIndex: 0, segmentIndex: 0, text: '已整理完成。', status: 'settled',
    }])
  })
})
