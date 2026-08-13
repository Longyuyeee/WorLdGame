export function ProjectConflictPanel({ changedPaths, onKeepLocal, onReloadExternal, onCancel }: {
  readonly changedPaths: readonly string[];
  readonly onKeepLocal: () => void;
  readonly onReloadExternal: () => void;
  readonly onCancel: () => void;
}) {
  return <section role="alertdialog" aria-labelledby="project-conflict-title" className="project-conflict">
    <h2 id="project-conflict-title">工程在外部被修改</h2>
    <p>本地也有未保存修改。请选择保留哪一侧；不会静默覆盖文件。</p>
    <ul>{changedPaths.map((path) => <li key={path}><code>{path}</code></li>)}</ul>
    <div className="project-home__actions"><button onClick={onKeepLocal}>保留本地版本</button><button onClick={onReloadExternal}>重新载入外部版本</button><button onClick={onCancel}>暂不处理</button></div>
  </section>;
}
