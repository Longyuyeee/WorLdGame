export function WebReleaseGuide({ format, ready, productionReady = false }: { format: "html" | "directory"; ready: boolean; productionReady?: boolean }) {
  return <section className="web-release-guide" aria-label="试玩与部署说明">
    <h3>{ready ? "文件已生成，接下来验证你的作品" : "先生成游戏，再完成交付检查"}</h3>
    <p className="publication-section-intro">导出只会生成文件。文件可以独立运行，上传网站后才会有玩家能访问的网址。</p>
    <ol className="release-next-steps">
      <li><strong>下载并试玩</strong><p>{format === "html" ? "下载右侧的 HTML，用浏览器打开；也可以点击“打开试玩”。" : "下载右侧 ZIP 并完整解压。打开 index.html 试玩；需要检查离线与更新时，按包内说明启动本地站点。"}</p></li>
      <li><strong>检查两条路线和存档</strong><p>从标题开始，走完选择和结局。中途存档、刷新、读档，检查画面、文字和声音，再用目标手机实际体验。</p></li>
      <li><strong>保留可编辑工程</strong><p>{productionReady ? "下载右侧的制作交付包。源工程、游戏与交付清单来自这次保存，可在编辑器首页重新导入继续制作。" : "可在导出方式中勾选“同时生成制作交付包”，重新生成；也可在左上角项目菜单单独导出工程 ZIP。"}游戏文件给玩家，工程文件用于继续制作和备份。</p></li>
      <li><strong>{format === "html" ? "准备网站目录" : "部署完整目录"}</strong><p>{format === "html" ? "要放到网站时，返回“导出方式”生成网页目录 ZIP，里面包含网站入口、素材和部署说明。" : "上传完整游戏目录，以 index.html 为入口。保持素材路径不变，按“使用说明.txt”处理离线与更新；本地预览地址仅本机可用。"}</p></li>
    </ol>
    <details><summary>上线与更新前检查</summary><ul>
      <li>在实际网址重新检查所有素材、两条路线、声音、保存刷新与读取。</li>
      <li>确认展示资料、署名和素材使用许可；导出不会替你完成这些确认。</li>
      <li>更新前在发布设置核对上一版工程 ZIP。只有版本号变化、内容完全一致时支持旧档；其他变化需要保留原版入口。完整替换同一构建的文件。</li>
    </ul></details>
  </section>;
}
