# Summary-CoT Think 覆盖展示

此包是可选增强：只有在 DSH 已应用仓库 `patches/dsh-summary-cot-live.patch` 后才能启用。

浏览器端 slot 类型由本包的 `slot-contract.ts` 持有；0812 snapshot 不再导出这份
可选 patch 类型，因此升级 snapshot 时无需再从 DSH 的 `ui-conversation` 私有导出
导入。实际 render slot 仍必须由该 DSH patch 声明并渲染。

它将原有 Think 行替换为“思考摘要”，并提供“查看原始思考”开关。请使用 `cordis.overlay.patch.yml`，不要与独立摘要行的浏览器包同时启用。
