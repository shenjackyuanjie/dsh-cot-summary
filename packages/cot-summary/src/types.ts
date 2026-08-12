/** Summary-CoT 的 host 事件契约。 */

import type { CotSummaryRef, CotSummarySegment } from './projection-types.ts'

export type { CotSummaryProjection, CotSummaryRef, CotSummarySegment } from './projection-types.ts'

/** 一次仅留在内存中的摘要流更新；仅在启用 DSH 可选补丁后写入。 */
export type CotSummaryDelta =
  | ({ readonly kind: 'append'; readonly text: string } & CotSummaryRef)
  | ({ readonly kind: 'discard' } & CotSummaryRef)

/** 一段可在 session 持久化后恢复的完整摘要。 */
export type CotSummarySettled = CotSummarySegment & {
  readonly status: 'settled'
}

/** 主模型 retry 时使同一步旧摘要失效的持久控制记录。 */
export interface CotSummaryReset {
  readonly turn: number
  readonly step: number
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** 仅用于实时 UI 的流式摘要增量；RDB 会因 ignorable 标记自动跳过。 */
    'cot-summary/delta': CotSummaryDelta
    /** 一段完成后的完整摘要。 */
    'cot-summary/settled': CotSummarySettled
    /** 清除某个 retry 前的 Summary-CoT。 */
    'cot-summary/reset': CotSummaryReset
  }
}
