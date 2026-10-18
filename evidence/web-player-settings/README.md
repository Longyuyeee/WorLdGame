# 《雨停之前》1.5.0 玩家设置与全屏证据

本目录的当前工程/HTML/目录 ZIP 通过生产 Editor UI 从 1.4.0 导入、更新发布版本并导出。源正文/稳定 ID/演出/媒体保持；个人偏好不进入工程。当前结果与复现见 `docs/310-player-personal-settings-and-fullscreen.md`。

- `artifact-audit.json`：62 源条目、原文/ID、22 媒体字节、HTML/目录 Canonical、build-info 与三产物 SHA/大小。
- `browser-checks.json`、`browser.log`：最终八组生产创作/导出/阅读任务；三条完整路线及 native touch/Auto 时钟/长文。
- `settings-checks.json`、`settings-final.log`：同一最终包的三引擎设置/存档/画幅/完整路线与全屏结果，以及 Chromium 非系统减动效的文字速度/立即显示案例。Chromium/Firefox 全屏进入成功；Windows WebKit 进入不可用，窗口回退通过，不是 iOS Safari 通过。
- `regression.log`：最终 16 文件/161 项定向回归；jsdom 媒体日志不是音频实播证明。
- `phone-*`、`desktop-stay-*`、`touch-leave-*`、`http-touch-stay-*`、`http-expanded-toolbar.png`：最终包实际浏览器截图。
- `{chromium,firefox,webkit}-*`：引擎内设置、大字、结局，以及全屏成功或不可用截图；不是物理手机。
- `before-host-bar-checks.json`：首轮目录展开失败；`before-reduced-motion-checks.json`、`before-reduced-motion-layout.png`（同源 `failure-player-layout.png`）：微任务补丁后仍失败的准确几何及画面。它们不算最终通过。
- `failure-editor.png` 是该次失败时仍打开的编辑器，不是最终游戏界面；`http-layout-inspection.png` 是定位时等待布局完成后的画面，不能证明首帧正确。

人工阅读/发音/计时、物理手机、iOS Safari、素材/系统声线再分发、公网、长时性能/旧长帧及最终完整作品/M1 仍待验。未部署公网，旧证据保留。
