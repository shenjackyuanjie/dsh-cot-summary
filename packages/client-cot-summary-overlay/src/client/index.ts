/** 使用 DSH 可选补丁接管 Think 行的 Summary-CoT 浏览器插件。 */

import { createElement, useEffect, useRef, useState } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ReasoningBlockOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { DisclosureRow, IconThinkOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CotSummaryProjection } from '@shenjack/dsh-cot-summary/projection'

/** 注入 hooks 使用的最小快照源契约。 */
interface SnapshotSource<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

interface Toggle {
  readonly source: SnapshotSource<boolean>
  set(value: boolean): void
}

interface CotReasoningInjected {
  readonly setSummaryVisible: (visible: boolean) => void
  readonly hooks: {
    readonly summaryVisible: SnapshotSource<boolean>
  }
}

type CotReasoningRowProps =
  PropsRuntime<'conversation.chat.reasoning'>
  & { readonly matched: ReasoningBlockOwnerProps }
  & InjectFace<CotReasoningInjected>

/** 创建仅在当前页面生命周期内有效的全局展示开关。 */
function createToggle(): Toggle {
  let value = true
  const listeners = new Set<() => void>()
  return {
    source: {
      getSnapshot: () => value,
      subscribe(listener) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    set(next) {
      if (value === next) return
      value = next
      for (const listener of listeners) listener()
    },
  }
}

/** 将当前 reasoning 区块对应的所有摘要段拼成可展示文本。 */
function summaryText(
  projection: CotSummaryProjection | undefined,
  owner: ReasoningBlockOwnerProps,
): string {
  if (projection === undefined) return ''
  return projection.segments
    .filter(segment => segment.turn === owner.turn
      && segment.step === owner.step
      && segment.reasoningIndex === owner.reasoningIndex)
    .map(segment => segment.text)
    .join('\n\n')
}

/** Summary-CoT 接管后的 reasoning 行。 */
function CotReasoningRow({
  matched, useProjection, useSummaryVisible, setSummaryVisible,
}: CotReasoningRowProps) {
  const summaryVisible = useSummaryVisible()
  const summary = useProjection('cot-summary', projection => summaryText(projection, matched))
  const [summaryExpanded, setSummaryExpanded] = useState(true)
  const [rawExpanded, setRawExpanded] = useState(true)
  const previousRunning = useRef(matched.running)

  useEffect(() => {
    if (previousRunning.current && !matched.running) setSummaryExpanded(false)
    previousRunning.current = matched.running
  }, [matched.running])

  if (!summaryVisible) {
    return createElement(
      DisclosureRow,
      {
        title: '原始思考',
        icon: createElement(IconThinkOutline14, { size: 14 }),
        open: rawExpanded,
        expandable: true,
        expandOnRowClick: true,
        onToggle: () => { setRawExpanded(value => !value) },
      },
      createElement('div', null, matched.text),
    )
  }

  const body = summary === ''
    ? createElement('p', null, matched.running ? '正在整理思考摘要…' : '等待摘要完成…')
    : createElement('div', null, summary)
  const switchToRaw = (event: { stopPropagation(): void }) => {
    event.stopPropagation()
    setSummaryVisible(false)
  }
  return createElement(
    DisclosureRow,
    {
      title: '思考摘要',
      icon: createElement(IconThinkOutline14, { size: 14 }),
      open: summaryExpanded,
      expandable: true,
      expandOnRowClick: true,
      onToggle: () => { setSummaryExpanded(value => !value) },
      collapsedContent: createElement('button', { type: 'button', onClick: switchToRaw }, '查看原始思考'),
    },
    body,
    createElement('button', { type: 'button', onClick: switchToRaw }, '查看原始思考'),
  )
}

/** 浏览器 Cordis 入口。 */
export const inject = ['slots']

/** 此包只可与 dsh-summary-cot-live.patch 一起启用。 */
export function apply(ctx: ClientContext): void {
  const toggle = createToggle()
  ctx.slots.inject('conversation.chat.reasoning', () => ctx.slots.register({
    name: 'conversation.chat.reasoning',
    select: owner => owner,
    inject: (): CotReasoningInjected => ({
      setSummaryVisible: visible => { toggle.set(visible) },
      hooks: { summaryVisible: toggle.source },
    }),
  }, CotReasoningRow))
}
