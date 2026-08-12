/** 无补丁模式下展示完整摘要的独立 Chat 行。 */

import { useState } from 'react'
import { DisclosureRow, IconThinkOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CotSummaryRowData } from './cot-summary-definition.ts'

type CotSummaryRowProps = PropsRuntime<'conversation.chat.node', 'cot-summary-row'>

function preview(data: CotSummaryRowData): string {
  if (data.running) return '正在整理思考摘要…'
  const text = data.segments.map(segment => segment.text).join(' ')
  const firstLine = text.split('\n', 1)[0] ?? ''
  return firstLine === '' ? '思考摘要已完成' : firstLine
}

/** 展示已完成摘要；启用实时 delta 时也会逐帧更新。 */
export function CotSummaryRow({ node }: CotSummaryRowProps) {
  const [open, setOpen] = useState(true)
  const data: CotSummaryRowData = node.data
  const text = data.segments.map(segment => segment.text).join('\n\n')
  return (
    <section data-cot-summary-row>
      <DisclosureRow
        icon={<IconThinkOutline14 size={14} />}
        title="思考摘要"
        open={open}
        expandable
        expandOnRowClick
        onToggle={() => { setOpen(value => !value) }}
        collapsedContent={<span>{preview(data)}</span>}
      >
        <div style={{ padding: '4px 0 4px 22px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {text}
        </div>
      </DisclosureRow>
    </section>
  )
}
