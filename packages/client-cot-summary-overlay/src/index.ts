/** 浏览器覆盖展示包的 host 空入口；真正展示逻辑位于 ./client。 */

import type { Context } from '@deepseek-ai/cordis'

/** 该包仅用于让 DSH 发现并加载浏览器 bundle。 */
export function apply(_ctx: Context): void {}
