import { createRequire } from 'node:module';
import { resolve, join, dirname, sep } from 'node:path';
import { createHash } from 'node:crypto';

// Electron's patched fs interprets .asar archives as directories. Copy runtime
// archives as ordinary files when the graphical packager runs this script.
const { cp, mkdir, writeFile, rename, access, readFile } = process.versions.electron
  ? createRequire(import.meta.url)('original-fs').promises
  : await import('node:fs/promises');

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const output = resolve(args.find(value => !value.startsWith('--')) ?? join(root, 'dist/windows-player-' + Date.now()));
const gameArgument = args.find(value => value.startsWith('--game='))?.slice(7);
if (args.some(value => value.startsWith('--') && !value.startsWith('--game=')) || gameArgument === '') throw new Error('用法：node tools/build-windows-player.mjs <新输出目录> [--game=<已解压的 Web 游戏目录>]');
let game;
console.log('正在检查游戏与输出目录…');
if (gameArgument) {
  const source = resolve(gameArgument);
  const info = await readFile(join(source, 'build-info.json'), 'utf8').then(JSON.parse).catch(() => { throw new Error('找不到有效的 build-info.json，请选择完整解压的 Web 游戏目录。'); });
  if (info.format !== 'world-web-directory' || typeof info.projectId !== 'string' || !info.projectId || !Array.isArray(info.files)) throw new Error('请选择编辑器导出的完整 Web 目录（含 build-info.json），不要选择 ZIP 或单文件 HTML。');
  const paths = new Set(info.files.map(file => file.path));
  for (const path of ['index.html', 'player.js', 'player.css']) if (!paths.has(path)) throw new Error('游戏缺少必要文件：' + path + '，请重新导出。');
  // Validate the export before creating a large runtime directory. Ship only its inventory,
  // not author preview scripts, personal files or a nested output directory.
  for (const file of info.files) {
    if (typeof file.path !== 'string' || !resolve(source, file.path).startsWith(source + sep)) throw new Error('游戏文件路径无效，请重新导出。');
    const bytes = await readFile(resolve(source, file.path)).catch(() => { throw new Error('游戏文件缺失：' + file.path + '，请完整解压或重新导出。'); });
    if (bytes.length !== file.byteLength || 'sha256:' + createHash('sha256').update(bytes).digest('hex') !== file.digest) throw new Error('游戏文件已改变：' + file.path + '，请重新导出完整目录包。');
  }
  game = { source, info };
}
try { await access(output); throw new Error('输出目录已存在，请选择新的目录：' + output); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const runtime = join(root, 'node_modules/electron/dist');
await access(join(runtime, 'electron.exe'));
await mkdir(output, { recursive: true });
console.log('正在复制 Windows 播放器，请稍候…');
await cp(runtime, output, { recursive: true });
await rename(join(output, 'electron.exe'), join(output, 'WorLdPlayer.exe'));
const application = join(output, 'resources/app');
await mkdir(application, { recursive: true });
await cp(join(root, 'apps/windows-player/main.mjs'), join(application, 'main.mjs'));
await writeFile(join(application, 'package.json'), JSON.stringify({ name: 'world-player', version: '0.1.0', main: 'main.mjs', type: 'module' }));
if (game) {
  console.log('正在打包游戏与素材…');
  const destination = join(application, 'game');
  await mkdir(destination, { recursive: true });
  for (const { path } of game.info.files) {
    await mkdir(dirname(join(destination, path)), { recursive: true });
    await cp(join(game.source, path), join(destination, path));
  }
  await writeFile(join(destination, 'build-info.json'), JSON.stringify(game.info, null, 2));
  await writeFile(join(application, 'bundled-game.json'), JSON.stringify({ directory: 'game' }));
}
await writeFile(join(output, '使用说明.txt'), 'WorLd Player Windows 便携版（开发版本）\n\n1. 保持播放器文件夹完整，双击 WorLdPlayer.exe，无需安装 Node.js。\n2. 选择从编辑器导出并完整解压的 Web 游戏目录（含 build-info.json）。\n3. 使用正式 Player 的存读档；再次启动选择同一作品即可读取。\n4. 菜单“作品 → 打开作品”可换游戏，请先保存。存档不在游戏目录，不会随复制游戏自动迁移到其他电脑。\n\n当前复用 Web Player 行为，不代表 Windows 专属 Profile、安装/卸载、自动更新或签名发布已完成。未签名开发包可能被 Windows 提醒；本工具不修改系统安全设置。\n');
if (game) await writeFile(join(output, '使用说明.txt'), `${game.info.projectTitle} — Windows 便携版\n版本：${game.info.publication?.version ?? '未指定'}\n\n1. 完整解压整个文件夹，双击 WorLdPlayer.exe 即可开始，不需要安装 Node.js 或另选游戏目录。不要只复制 exe。\n2. 请先在游戏内保存，再退出或更新。新版请完整解压到新目录后启动，保留旧包以便恢复；不要混合覆盖文件。\n3. 同一台电脑、同一系统用户下，移动目录或重新打包同一 projectId 不会改变存档位置（%APPDATA%/WorLdPlayer）。剧情内容变化后的存档兼容由 Player 判断，不保证任意新版都能读取旧档。换电脑不会自动带走存档。\n4. 无法启动时重新完整解压；缺失游戏时可重新选择完整 Web 游戏目录。菜单“作品 → 存档位置”可查看本机位置。\n\n此包复用 Web Player；未签名，无安装器和自动更新。exe 文件图标/系统版本信息仍是运行时默认值，不代表作品品牌已配置。\n`);
console.log(output);
