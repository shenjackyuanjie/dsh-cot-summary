# DSH Summary-CoT 浏览器插件

这是无需 DSH 补丁的默认浏览器包。它把保存后的 Summary-CoT 渲染为独立 Chat 行；若 host 启用了实时 delta，它也能逐帧更新该行。

默认配置不会写入 delta，因此摘要会在每段总结完成后出现。需要把摘要嵌入原 Think 行时，请改用 `@shenjack/dsh-client-cot-summary-overlay`，并先应用工作区根目录 `patches/dsh-summary-cot-live.patch`。
