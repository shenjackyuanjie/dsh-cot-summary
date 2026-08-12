/** Summary-CoT host 插件入口。 */

export { CotSummaryService, ConfigSchema, type Config } from './service.ts'
export { applyCotSummaryProjection, CotSummaryProjectionSchema, emptyCotSummaryProjection } from './projection.ts'
export type * from './types.ts'
export type * from './projection-types.ts'

/** Cordis 默认插件入口。 */
export { CotSummaryService as default } from './service.ts'
