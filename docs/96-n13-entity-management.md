# N13 章节、场景、角色和变量管理审计

> 日期：2026-08-13
> 节点：N13
> 对齐需求：`REQ-PRJ`、`REQ-SEQ`、`REQ-SCRIPT`；为 N20、N21、N40 和 AC-02/03 提供故事骨架
> 状态：通过（本地完整门与 Draft PR Windows CI 均通过）

## 1. 节点目标

N13 让创作者从 N12 选中的真实工程中建立故事骨架，而不是只能编辑固定样例。生产启动路径现在是：项目首页 → 项目结构管理 → 保存到原 Workspace → 内容编辑器。结构操作全部经过 N11 Project Service，并由 N12 生命周期服务执行带宿主版本的保存。

## 2. 需求逐项对齐

| N13 要求 | 实现 | 自动证据 | 状态 |
|---|---|---|---|
| 章节/场景创建、删除、排序、重命名 | Project Service 命令与树形管理 UI | `project-service.test.ts`、`project-entity-manager.test.tsx` | 通过 |
| 场景跨章节移动和入口设置 | 章节选择器、上下移按钮、`scene.set-entry` | Domain/UI 测试 | 通过 |
| 角色完整属性 | 显示名、颜色、立绘槽位、默认表情的创建与编辑 | `project-entities.test.ts`、管理 UI E2E | 通过 |
| 类型化变量 | Boolean/Number/String 默认值，Story/Chapter/Scene/Meta 作用域 | 同上 | 通过 |
| 删除前引用分析 | Canonical Project 结构化 `*Id/*Ids` 路径报告 | `project-entities.test.ts` | 通过 |
| 安全迁移 | Scene/Character/Variable 可指定替代实体后原子迁移引用并删除 | Domain/UI 迁移测试 | 通过 |
| 手机等价操作 | 所有排序/跨章节移动使用按钮和选择器，不要求拖拽；窄屏单列 | UI 测试与响应式 CSS | 通过基础链；真机属于 N91 |
| 全局搜索覆盖新实体 | Canonical entity 搜索覆盖 Chapter/Scene/Character/Variable 的名称、ID、类型和作用域 | `project-entities.test.ts`、管理 UI 测试 | 通过 |

## 3. 数据与事务不变量

1. 每个 UI 操作生成唯一 `commandId` 并携带当前 `expectedRevision`；陈旧 Revision、重复 ID、无效引用不会部分写入。
2. 角色构造器校验六位颜色、稳定立绘槽位和默认表情；变量构造器校验类型与默认值一致、作用域枚举有效。
3. 删除被引用的 Scene、Character 或 Variable 时，未选择替代实体必定返回 `REFERENCE_CONFLICT`。
4. 迁移与删除在同一 Project Service 命令中完成；替代实体不存在或等于被删实体时拒绝。
5. 保存使用 N12 `hostVersion` 乐观并发；外部版本变化时不覆盖目录。
6. UI 状态不是权威数据；验收以关闭后从 Workspace 重开并比较稳定 ID 和 Canonical Project 为准。

## 4. N13 验收任务

自动用户任务从新建工程执行：

1. 保留默认 1 章，在其中增加 2 个场景，共 3 场景；
2. 创建 2 个角色，包含颜色、立绘槽位和默认表情；
3. 创建 Boolean、Number、String 三种变量；
4. 设置新的入口场景；
5. 保存工程，销毁当前编辑会话，再从同一 Workspace 重开；
6. 验证 1 章、3 场景、2 角色、3 变量，类型、属性、入口和全部稳定 ID 不变。

附加故障任务创建一条引用角色 A 的对白，尝试删除 A 时必须展示精确引用路径；选择角色 B 后迁移并删除，保存重开后对白 `speakerId` 必须指向 B。

针对性命令：

```text
npm exec -- vitest run packages/project-domain/src/project-service.test.ts packages/project-domain/src/project-entities.test.ts apps/editor/src/project-entity-manager.test.tsx --maxWorkers=2
npm exec -- tsc -b packages/project-domain apps/editor
```

当前结果：3 个测试文件、14 个测试通过，类型检查通过。

完整 `npm run check` 通过：常规 76 个测试文件/463 个测试、重型 VM 5 个测试、10 个 Workspace 构建，以及 Workspace、50 项需求、PR 追踪、7 类 Golden、架构和两类性能门全部成功。

远端证据：Draft PR #28 首轮 Windows / Node 22 全量检查 run `31717787727`、job `94506790906` 成功，耗时 3 分 9 秒。

## 5. 诚实边界与下一节点

- 当前引用分析覆盖 Canonical JSON 的结构化 `*Id/*Ids` 字段；脚本文本中的变量表达式引用需要 N20 Story Language AST，不能在 N13 用字符串猜测。
- 管理页提供 Canonical entity 全局搜索；内容编辑器原有场景/语句搜索仍是独立投影。统一七模式搜索导航属于 N43。
- 角色立绘槽位在 N13 是项目元数据；实际 Asset 绑定、缩略图和 Stage 表情预览属于 N22/N42/N70。
- 变量已经类型化建模，但条件、赋值语法、引用补全和运行时状态属于 N20/N30/N31。
- Android 真机触控、SAF 和进程恢复仍属于 N91/N92；响应式 Web 测试不冒充真机证据。

N13 已完成实现、自审、本地完整门、推送和远端 Windows CI。下一节点按顺序进入 N20：Story Language P0。
