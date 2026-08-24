# CL-04 Spike 01 Result

## 结论

`498ae94` 在开发宿主通过 VM 定向测试和全仓门。VM-01 的基础路径已形成可重复的 6 步 State Hash Golden；当前证据只足以把 CL-04 从“未开始”改为“进行中”。

## 已观察结果

- SHA-256 空串与 `abc` 标准向量一致；
- canonical object key 使用 Unicode code point 排序，数组保序，数字只接受 safe integer，字符串必须为 NFC 且不得包含孤立 surrogate；
- 同一 VM-01 程序的两个独立运行产生完全相同的 6 个 Hash；
- `set → add → jumpIf → checkpoint → end` 得到 `score = 3`、`stateRevision = 5` 和 `ending.good`；
- Checkpoint 绑定转换后精确 State Hash；
- 缺失变量、损坏/扩展 State、浮点 IR、错误 Source Map、未知 jump target、非法 fallthrough 与终态重入均不修改原状态；
- 全仓 `npm.cmd run check` 为 PASS。

## 固定 Hash 流

```text
1b41e727c29cd533de36bc0f83fa02d3661b3b723f70b5ba010be904cc74275a
83a28830c9160691cabab345ed4a7893c114fe2ce5d35d28fd62eb7ab384e1b8
cfa7a9b727928eb8e3a3f01c65e1fcc66bea92c4783eaa9238cc0fe8e3862864
0e176e92a42aa19eb3b07cb7c694b8cc15f25286e344f04b89d417a34cbd2df0
68075ee2f92af2cf4a9b57809cf5c0b0f3e06a758ec94a357be92b911ac41c9a
1f55885b9389fcf0adb8acb43bc76b15d78cdc3a0833e11a7a21dbcb847474ba
```

## 未完成

VM-02–VM-15、10k 生成序列和三宿主比较尚无证据；不得把本结果解释为正式 VM、玩家 Runtime 或 CL-04 通过。
