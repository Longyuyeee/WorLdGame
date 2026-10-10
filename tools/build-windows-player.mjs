import { cp, mkdir, writeFile, rename, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(process.argv[2] ?? join(root, 'dist/windows-player-' + Date.now()));
try { await access(output); throw new Error('输出目录已存在，请选择新的目录：' + output); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const runtime = join(root, 'node_modules/electron/dist');
await access(join(runtime, 'electron.exe'));
await mkdir(output, { recursive: true });
await cp(runtime, output, { recursive: true });
await rename(join(output, 'electron.exe'), join(output, 'WorLdPlayer.exe'));
const application = join(output, 'resources/app');
await mkdir(application, { recursive: true });
await cp(join(root, 'apps/windows-player/main.mjs'), join(application, 'main.mjs'));
await writeFile(join(application, 'package.json'), JSON.stringify({ name: 'world-player', version: '0.1.0', main: 'main.mjs', type: 'module' }));
await writeFile(join(output, '使用说明.txt'), 'WorLd Player Windows 便携版（开发版本）\n\n1. 保持播放器文件夹完整，双击 WorLdPlayer.exe，无需安装 Node.js。\n2. 选择从编辑器导出并完整解压的 Web 游戏目录（含 build-info.json）。\n3. 使用正式 Player 的存读档；再次启动选择同一作品即可读取。\n4. 菜单“作品 → 打开作品”可换游戏，请先保存。存档不在游戏目录，不会随复制游戏自动迁移到其他电脑。\n\n当前复用 Web Player 行为，不代表 Windows 专属 Profile、安装/卸载、自动更新或签名发布已完成。未签名开发包可能被 Windows 提醒；本工具不修改系统安全设置。\n');
console.log(output);
