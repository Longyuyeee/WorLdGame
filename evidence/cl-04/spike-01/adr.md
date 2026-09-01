# CL-04 Spike 01 临时决策

状态：**保留为下一 Spike 输入，不形成正式采用 ADR**。

理由：纯转换、safe integer、NFC/Unicode scalar、code-point key order、领域分隔 SHA-256、精确 Schema 和 fail-closed 诊断已通过本批次测试，值得继续验证；但缺少 PRNG、调用栈、Effect、History、Save、Skip、生成测试和三宿主证据，不能冻结为 M1 `runtime-vm`。

下一决策点：Spike 02 完成 VM-02/VM-03 的 `call/return/random/wait`、PRNG Save Corpus 与固定 Hash 后，重新审查状态结构是否仍足够。
