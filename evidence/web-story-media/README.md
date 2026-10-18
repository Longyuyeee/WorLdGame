# 《雨停之前》1.2.0 · 剧情候选与演出制作

接续 `dc5e9fb`。实际 UI 从上一包工程继续制作；9 场景、90 段旁白、9 句角色对白、9,544 正文字符、143 步、35 个演出、7 项素材。设计/审计/接续见 `docs/307-web-story-media-production.md`。

- `before-rain-stops-project.zip`：导入编辑器继续写作。包含新增原始素材及发布配置。
- `before-rain-stops.html`：浏览器打开独立试玩，两条路线各六场景。
- `before-rain-stops-web.zip`：完整解压目录，按包内说明在本地或静态托管运行。已在本地 `/gal/` 验证，不是公网发布结果。
- `browser-checks.json` / `browser.log`：生产编辑器制作、保存重开、正式导出及两条路线/本地 HTTP 11 组任务；每条路线 60 段实际呈现。
- `review-checks.json`：320/390 文字裁切与操作区、320 作者草稿、UI 制作的 1,400 字临时压力导出内部滚动（4 项）。
- `artifact-refresh.json`：最后小屏文字框高度精修后，通过 UI 重导出；源工程/媒体载荷/Runtime JS 相对完整流程完全不变。4 项阅读检查在最后 CSS 下重跑，三条完整游玩在其前版本完成，区别详见 #307。
- `regression.log`：相关回归 20 文件/191 项。媒体未实现日志来自 jsdom，实播使用浏览器单独验证。
- `review-before-mobile-clipping.png` 和 `attempts/`：纠偏前截图/失败捕获，非当前通过状态。其他 station/cafe/ending/review 截图为当前实际界面。

图像原始文件、生成要求/透明度说明及音频合成来源在 `assets/rain-story`。原车站继续标记测试背景；未录制配音，未确认整部作品公开发布授权。阅读时长只是字数预算，人工计时、物理手机、跨浏览器、公网、最终内容/美术精修和历史性能项未关闭。
