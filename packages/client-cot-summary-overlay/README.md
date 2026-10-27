# Summary-CoT Think 覆盖展示

此包是可选增强：只有在 DSH 已应用仓库 `patches/dsh-summary-cot-live.patch` 后才能启用。

浏览器端 slot 类型由本包的 `slot-contract.ts` 自持：patch 后的 DSH 也会在
`ui-conversation` 导出相同的 `ReasoningBlockOwnerProps`/`AssistantNodeViewProps`，
但本包保留自己的声明合并，保证在未打 patch 的已发布版本上也能独立编译。
实际 render slot 仍必须由该 DSH patch 声明并渲染。

它将原有 Think 行替换为“思考摘要”，并提供“查看原始思考”开关。请使用 `cordis.overlay.patch.yml`，不要与独立摘要行的浏览器包同时启用。
