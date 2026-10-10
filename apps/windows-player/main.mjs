import { app, BrowserWindow, dialog, Menu, net, protocol, session } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

protocol.registerSchemesAsPrivileged([{ scheme: 'world-game', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.setName('WorLd Player');
const testProfile = process.argv.find(value => value.startsWith('--test-profile='))?.slice(15);
app.setPath('userData', testProfile ?? join(app.getPath('appData'), 'WorLdPlayer'));
let window;
let opening = false;
async function openGame(directory) {
  if (opening) return;
  opening = true;
  try {
    if (!directory) {
      const choice = await dialog.showOpenDialog({ title: '选择完整解压后的 Web 游戏目录', properties: ['openDirectory'] });
      if (choice.canceled) { if (!window) app.quit(); return; }
      directory = choice.filePaths[0];
    }
    const root = resolve(directory);
    const info = JSON.parse(await readFile(join(root, 'build-info.json'), 'utf8'));
    if (info.format !== 'world-web-directory' || typeof info.projectId !== 'string' || !info.projectId) throw new Error('请选择编辑器导出的完整 Web 目录包，不是 ZIP 文件或单文件 HTML。');
    const allowed = new Set(info.files.map(file => file.path));
    for (const path of ['index.html', 'player.js', 'player.css']) if (!allowed.has(path) || !(await stat(join(root, path))).isFile()) throw new Error('游戏缺少必要文件，请完整解压后再打开。');
    const id = createHash('sha256').update(info.projectId).digest('hex');
    const storage = session.fromPartition('persist:game-' + id);
    if (await storage.protocol.isProtocolHandled('world-game')) storage.protocol.unhandle('world-game');
    storage.protocol.handle('world-game', request => {
      const url = new URL(request.url);
      const path = decodeURIComponent(url.pathname.slice(1)) || 'index.html';
      const target = resolve(root, path);
      if (url.hostname !== 'game' || !allowed.has(path) || !target.startsWith(root + sep)) return new Response('游戏文件不存在，请重新解压。', { status: 404 });
      return net.fetch(pathToFileURL(target).href);
    });
    storage.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    storage.setPermissionCheckHandler(() => false);
    const previous = window;
    const next = new BrowserWindow({ title: info.projectTitle || 'WorLd Player', width: 1280, height: 800, minWidth: 390, minHeight: 600, show: !process.argv.includes('--test-hidden'), webPreferences: { session: storage, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    next.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    next.webContents.on('will-navigate', event => event.preventDefault());
    next.on('closed', () => { if (window === next) window = undefined; });
    window = next;
    previous?.close();
    await next.loadURL('world-game://game/index.html');
  } catch (error) {
    if (process.argv.includes('--test-hidden')) { console.error(String(error)); app.exit(1); }
    else {
      const result = await dialog.showMessageBox({ type: 'error', title: '无法打开作品', message: '游戏未能打开', detail: `${error.message}\n请确认完整解压目录包，再重新选择。`, buttons: ['重新选择', window ? '返回游戏' : '退出'], cancelId: 1 });
      if (result.response === 0) { setImmediate(() => void openGame()); return; }
      if (!window) app.quit();
    }
  } finally { opening = false; }
}
app.whenReady().then(async () => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: '作品', submenu: [{ label: '打开作品…', accelerator: 'CmdOrCtrl+O', click: () => void openGame() }, { label: '存档位置', click: () => void dialog.showMessageBox({ message: '存档由播放器自动保存在本机', detail: `${app.getPath('userData')}\n移动游戏目录不会更改存档位置；不同 projectId 的作品隔离。更新作品的存档兼容由现有 Player 判断。` }) }, { type: 'separator' }, { role: 'quit', label: '退出' }] }, { label: '显示', submenu: [{ role: 'togglefullscreen', label: '全屏' }, { role: 'resetzoom', label: '恢复缩放' }] }]));
  await openGame(process.argv.find(value => value.startsWith('--game='))?.slice(7));
});
app.on('window-all-closed', () => { if (!opening) app.quit(); });
