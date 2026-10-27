# DSH Summary-CoT

该 host 插件监听顶层主会话的 `assistant/chunk` reasoning delta，将其在后台按顺序交给指定的总结模型。主模型输出不会等待总结请求。

- 默认 `streamDeltas: false`：不写 delta，只保存完整的 `cot-summary/settled`，可直接运行在未修改的 DSH 上。
- 应用可选 DSH 补丁后可设置 `streamDeltas: true`：`cot-summary/delta` 以 `ignorable: true` 只供实时 UI；持久化后端保存该标记，加载时未识别类型凭它跳过，不会拒绝重建。
- `cot-summary/settled` 保存完整摘要，重开 session 后仍可恢复；`cot-summary/reset` 会保存 retry 的清理结果。
- 总结调用强制 `reasoningEffort: 'off'`，不带 tools。

默认使用随附的 `cordis.patch.yml`（`streamDeltas: false`）；补丁版实时配置见工作区根目录的 `cordis.overlay.patch.yml` 与 `README.md`。
