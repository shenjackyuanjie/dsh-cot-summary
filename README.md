# DSH Summary-CoT

该工作区实现了一个不阻塞主模型的 Summary-CoT 插件：主模型输出 reasoning 时，后台按段调用指定的总结模型，并强制使用 `reasoningEffort: 'off'`。最终摘要写入 session，重新打开会话仍能恢复。

## 默认兼容方案（无需修改 DSH）

使用 `packages/cot-summary/cordis.patch.yml`。它保持 `streamDeltas: false`，因此不会把流式 delta 写入 session；总结模型完成一个段落后，才写入可持久化的 `cot-summary/settled`。浏览器通过 `@shenjack/dsh-client-cot-summary` 把摘要显示为独立 Chat 行。

这条路径是无 DSH 修改时的 workaround：没有逐 token 展示摘要，但最终内容会保存，且不会向 `session-persistence-rdb` 写入临时 delta。

## 可选实时增强

实时 delta 与 Think 行内覆盖显示需要 DSH 的两个很小的扩展：允许 `Session.append()` 标记 `ignorable: true`，以及提供 `conversation.chat.reasoning` slot。完整改动已保存为 [dsh-summary-cot-live.patch](patches/dsh-summary-cot-live.patch)。

在 `test-shenjackyuanjie`（DSH 源码根目录）执行：

```powershell
git apply --check ..\dsh-cot-summary\patches\dsh-summary-cot-live.patch
git apply ..\dsh-cot-summary\patches\dsh-summary-cot-live.patch
```

然后使用 `cordis.overlay.patch.yml`，它会启用 `streamDeltas: true` 和 `@shenjack/dsh-client-cot-summary-overlay`。

此时 `cot-summary/delta` 带有 `ignorable: true`：它通过 host 到浏览器的实时 event/projection 流更新 UI，但 `session-persistence-rdb` 会过滤这类记录；只有完整的 `cot-summary/settled` 与 retry 用的 `cot-summary/reset` 会保存。

两个浏览器展示包不可同时启用。请将示例中的 `provider` 和 `model` 改成你的总结模型路由。

## npm 配置

`.npmrc` 已包含：

```ini
@deepseek-ai:registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```
