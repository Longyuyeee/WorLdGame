import type { PublicationWorkflow } from './studio-work-position';

export function WebReleaseGuide({ format, ready, productionReady = false }: { format: PublicationWorkflow['format']; ready: boolean; productionReady?: boolean }) {
  return <section className="web-release-guide" aria-label="试玩与部署说明">
    <h3>{ready ? "文件已生成，接下来验证你的作品" : "先生成游戏，再完成交付检查"}</h3>
    <p className="publication-section-intro">导出只会生成文件。文件可以独立运行，上传网站后才会有玩家能访问的网址。</p>
    <ol className="release-next-steps">
      <li><strong>下载并试玩</strong><p>{format === "html" ? "下载右侧的 HTML，用浏览器打开；也可以点击“打开试玩”。" : format === 'website' ? '下载右侧“网站上传包”并完整解压，index.html 与 media 等文件保持原位置。可先用浏览器打开 index.html 检查普通阅读；网站离线和更新需在 HTTPS 或本地站点验证。此包不含本地启动助手。' : "下载右侧 ZIP 并完整解压。打开 index.html 试玩；需要检查离线与更新时，按包内说明启动本地站点。"}</p></li>
      <li><strong>检查各条路线和存档</strong><p>从标题开始，走完选择和结局。中途存档、刷新、读档，检查画面、文字和声音，再用目标手机实际体验。</p></li>
      <li><strong>保留可编辑工程</strong><p>{productionReady ? "下载右侧的制作交付包。源工程、游戏与交付清单来自这次保存，可在编辑器首页重新导入继续制作。" : "可在导出方式中勾选“同时生成制作交付包”，重新生成；也可在左上角项目菜单单独导出工程 ZIP。"}游戏文件给玩家，工程文件用于继续制作和备份。</p></li>
      <li><strong>{format === "html" ? "准备网站上传包" : format === 'website' ? '上传公开文件并核对实际网址' : "生成纯网站目录并核对"}</strong><p>{format === "html" ? "要放到网站时，返回“导出方式”选择“网站上传 ZIP”，可直接生成不含作者资料的公开文件，无需先安装 Node.js。" : format === 'website' ? '把解压出的内容放到目标网站目录根层，不要多套一层文件夹；包含 build-info.json，最后更新 sw.js。不要把制作交付包、源工程、release 或 review 资料上传。生成上传包无需 Node.js，但仍需你有权限的网站空间；此处不执行上传，不生成网址。保留同版“网页目录 ZIP”时，可用其中检查器对实际 HTTPS 地址只读核对，检查器本身需要 Node.js。' : "完整解压 ZIP，双击 check-deployment.cmd，选择“生成纯网站目录”；也可返回导出方式直接选择“网站上传 ZIP”，省去本地生成步骤。只上传纯网站目录中的内容，最后上传 sw.js。已有网站时用检查器只读核对最终 HTTPS 目录地址，定位漏传或混版。检查器需 Node.js 22+，无需 npm install；本地预览地址不代表公网。"}</p></li>
    </ol>
    <details><summary>上线与更新前检查</summary><ul>
      <li>在实际网址重新检查所有素材、两条路线、声音、保存刷新与读取。</li>
      <li>“离线内容已就绪”只说明文件已缓存；上线前还需在目标浏览器断网重开，检查画面、声音及存读档。媒体失败时应提供联网重试或完整文件下载的退路。</li>
      <li>在作品信息中填写制作名单与致谢；玩家可在游戏内查看，目录包同时提供 credits.txt。确认展示资料和素材使用许可。</li>
      <li>更新前在发布设置核对上一版工程 ZIP。只有版本号变化、内容完全一致时支持旧档；其他变化需要保留原版入口。完整替换同一构建的文件。</li>
    </ul></details>
  </section>;
}
