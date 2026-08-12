/** 无 DSH 补丁时使用的 Summary-CoT 浏览器展示插件。 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { CotSummaryRow } from './CotSummaryRow.tsx'
import { cotSummaryRowDefinition } from './cot-summary-definition.ts'

/** 浏览器 Cordis 入口。 */
export const inject = ['conversationEvents', 'slots']

/** 注册独立摘要行；这条路径不依赖 DSH 源码补丁。 */
export function apply(ctx: ClientContext): void {
  ctx.conversationEvents.register(cotSummaryRowDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'cot-summary-row',
  }, CotSummaryRow))
}
