/** 可选 Think 行覆盖补丁与浏览器插件共享的 slot 契约。 */

import type { SlotEntryDef } from '@deepseek-ai/dsh-client-ui-slots'

/** 一段 reasoning block 在 Assistant 消息中的稳定定位。 */
export interface ReasoningBlockOwnerProps {
  readonly turn: number
  readonly step: number
  readonly reasoningIndex: number
  readonly text: string
  readonly running: boolean
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** 可选补丁在每个原始 Think 行的渲染点声明的可替换链。 */
    'conversation.chat.reasoning': SlotEntryDef & {
      readonly kind: 'chain'
      readonly scope: 'session'
      readonly owner: ReasoningBlockOwnerProps
    }
  }
}
