# N23-E3 自包含资源工程 ZIP 审计

> 审计日期：2026-08-15
> 变更前基线：`444233de05568ad0ea47a688ee5176ec8a92604c`
> 分支：`agent/n22-stage-media`
> 结论：N23-E3 工程门通过；N21/N23 产品门、M1 Stable 与公开发布仍未通过

## 1. 需求与验收结论

| 验收点 | 结果 | 可复核证据 |
|---|---|---|
| 工程 ZIP 同时携带 Canonical 文档、Asset Index 与源 Blob | 通过 | `.world-assets/bundle.json`、`index.json`、`blobs/sha256/*`；bundle 单测 |
| 导出前拒绝缺失或摘要不符的 Blob | 通过 | SHA-256 逐 Blob 复算；损坏导出测试 |
| 导入前校验路径、CRC、条目/单项/总量预算、摘要、长度和清单总数 | 通过 | 4096 条目、64 MiB/项、512 MiB/包；损坏/缺失/游离条目测试 |
| 资源发布不出现半写 Index | 通过 | Writer lease + fencing；Blob、Index、Lifecycle 同一 IndexedDB 严格事务；故障无部分发布测试 |
| 旧版纯文本 ZIP 可继续导入 | 通过 | 旧包映射为空 Asset Index；兼容测试 |
| 导入新工作区后实际编辑、显示背景、播放 BGM | 通过 | 原生文件选择器导入；3 场景、2 角色、2 资源 / Index r2；Canvas 解码背景，BGM 显示播放中 |
| 两路线与页面重载后重开 | 通过 | “晨光抵达”“星空抵达”；重载后从最近工程重开，资源仍存在 |
| 导入后再次导出仍可移植 | 通过 | Manifest 绑定 Canonical Project ID 而不是新工作区引用；回归测试覆盖两者不同 |

## 2. 格式与安全边界

ZIP 根目录继续保存可读 Canonical Project 文件，资源扩展放在保留命名空间：

```text
project.json / chapters/* / scenes/* / scripts/* / layouts/*
.world-assets/bundle.json
.world-assets/index.json
.world-assets/blobs/sha256/<digest path>
```

导出只收集 Asset Index 引用的唯一源 Blob，按路径排序并使用确定性 stored ZIP32。派生缩略图、Sidecar、Dicing/Atlas 产物不进入工程源包，它们仍是可重建缓存。导入先完整解析和校验，再取得工作区 Writer lease，把 Blob、Index 与 Lifecycle 原子发布。Canonical 文档与 IndexedDB 不能跨两种存储介质形成单个物理事务；资源失败时工程不会进入最近列表，但可能留下未发布的 OPFS 工作区，这是后续恢复/清理体验项，不能宣称跨介质强原子。

## 3. 实现落点

- `packages/project-domain/src/project-archive.ts`：兼容原文本 API 的二进制确定性 ZIP 读写和预算限制；
- `apps/editor/src/portable-project-bundle.ts`：资源包组装、Legacy 识别、Manifest/Index/Blob 校验；
- `apps/editor/src/indexeddb-asset-repository.ts`：fenced 原子恢复、幂等重导入与损坏拒绝；
- `apps/editor/src/studio-launcher.tsx`、`project-home.tsx`：产品首页真实导入和“准备→下载”导出交互；
- `tools/materialize-portable-project-golden.ts`：只依赖仓库固定 Media Golden 的可重复验收包生成器。

## 4. 自动化与浏览器 Golden

定向门：4 个测试文件、35 项测试通过。覆盖确定性二进制往返、Legacy 兼容、非 UTF-8 拒绝、缺失/损坏/游离资源、原子发布、幂等重导入、导出错误呈现和旧下载链接清理。全仓 `npm run check` 同步通过：常规 94 文件 / 559 项，storage 1 项、VM 重型 5 项，10 workspace 构建、架构门和全部性能门均通过；Editor bundle 为 609.81 kB（gzip 174.07 kB），仍保留超过 500 kB 的体积警告。

物化命令：

```bash
npx vite-node tools/materialize-portable-project-golden.ts <output.zip>
```

本次包为 9,852 bytes，SHA-256 `d8f6de276ac3cab1ceea42c977ec454451d1ae4676eb118fc8cefe8aa7487450`。浏览器结构化记录见 [`evidence/n23/portable-resource-bundle-browser.json`](../evidence/n23/portable-resource-bundle-browser.json)。浏览器内下载事件未被测试宿主捕获，因此没有把“自动下载捕获”登记为通过；页面已生成带文件名、字节数和 Blob URL 的真实下载链接，包字节由同一导出函数的自动化和物化器验证。

## 5. 尚未完成与下一顺序

N23-E3 关闭的是“工程资源可搬运”缺口，不等于可发布游戏：

1. 执行 N21-HV-01 真人 T01–T08，失败先修复创作流程；
2. 扩充为真实五分钟内容并由两名未参与实现者完成 N23 产品验收，关闭 `RA-N21-002`；
3. 再进入 N30 Compiler、N31 共享确定性 Runtime/Player；
4. 之后才是 Web/Windows/Android 构建、安装、签名与 Release Assurance。

当前仍缺正式 Player、存档/恢复、完整 Stage/镜头/动画、三端构建与设备证据，27 条 M1 验收保持 `0/27` 完整通过。
