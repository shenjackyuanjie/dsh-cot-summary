/** Summary-CoT 的浏览器安全投影契约。 */

/** 一段 reasoning 的稳定定位。 */
export interface CotSummaryRef {
  readonly turn: number
  readonly step: number
  readonly reasoningIndex: number
  readonly segmentIndex: number
}

/** 已完成或正在流式生成的一段摘要。 */
export interface CotSummarySegment extends CotSummaryRef {
  readonly text: string
  readonly status: 'streaming' | 'settled'
}

/** 当前 session 的完整 Summary-CoT 投影视图。 */
export interface CotSummaryProjection {
  readonly segments: readonly CotSummarySegment[]
}

/** 用于 Map 与事件折叠的稳定段 key。 */
export function cotSummaryKey(ref: CotSummaryRef): string {
  return `${String(ref.turn)}:${String(ref.step)}:${String(ref.reasoningIndex)}:${String(ref.segmentIndex)}`
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Summary-CoT 的完整投影；未安装插件时该 key 不存在。 */
    'cot-summary': CotSummaryProjection
  }
}
