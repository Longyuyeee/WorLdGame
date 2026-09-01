# CL-04 Spike 01 Claim

Source Revision：`498ae94f386c6d7ca614d8afb5ea0726a4987631`

本批次只证明平台中立 VM 基础能够以精确 Schema 执行 `set/add/jump/jumpIf/checkpoint/end`，并对同一初始状态产生稳定的 canonical State Hash。它为 VM-01 提供初始证据，同时证明损坏 IR/State、整数溢出、缺失变量、非法 fallthrough 和终态重复执行 fail closed。

本批次不证明 `say/choice/call/return/random/wait/emit`、外部输入幂等、Effect/取消/Barrier、Runtime History、Back/Forward/Fork、Save/Load、Meta Progress、Skip、10k 生成序列、Web/Windows/Android 三宿主一致性或 CL-04 通过。
