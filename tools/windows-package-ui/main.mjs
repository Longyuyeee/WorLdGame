import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
app.setName('WorLd Packager');
const testProfile = process.argv.find(value => value.startsWith('--test-profile='))?.slice(15);
if (testProfile) app.setPath('userData', testProfile);
let window;
let building = false;
let completed;
let preview;
app.whenReady().then(async () => {
  window = new BrowserWindow({ width: 820, height: 710, minWidth: 620, minHeight: 600, show: !process.argv.includes('--test-hidden'), webPreferences: { preload: join(import.meta.dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  window.setMenu(null);
  window.on('close', event => { if (building) { event.preventDefault(); window.webContents.send('progress', '正在打包，请等完成后再关闭窗口。'); } });
  ipcMain.handle('choose-directory', async () => {
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('build', async (_event, { source, parent, name }) => {
    if (building) return { error: '正在打包，请稍候。' };
    completed = undefined;
    if (!source?.trim() || !parent?.trim() || !name?.trim() || /[<>:"/\\|?*]/.test(name) || /[. ]$/.test(name) || name === '.' || name === '..' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) return { error: '请选择游戏目录、保存位置，并填写有效的新文件夹名。' };
    building = true;
    const output = join(parent, name);
    try {
      await new Promise((done, fail) => {
        const child = spawn(process.execPath, [join(root, 'tools/build-windows-player.mjs'), output, `--game=${source}`], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let errors = '';
        child.stderr.on('data', data => { errors += data.toString(); });
        child.stdout.on('data', data => window.webContents.send('progress', data.toString().trim()));
        child.once('error', fail);
        child.once('exit', code => code === 0 ? done() : fail(new Error(errors.match(/Error: ([^\r\n]+)/)?.[1] ?? '打包失败，请检查可用磁盘空间与目录权限，并选择新的输出文件夹重试。')));
      });
      completed = output;
      return { output };
    } catch (error) { return { error: error.message }; }
    finally { building = false; }
  });
  ipcMain.handle('open-output', async () => completed ? shell.openPath(completed) : '请先完成打包。');
  ipcMain.handle('play-output', async () => {
    if (!completed || building) return '请先完成打包。';
    if (preview) return '游戏已经启动，请切换到游戏窗口；退出游戏后可以再次试玩。';
    const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
    const args = process.argv.includes('--test-hidden') ? ['--test-hidden', '--remote-debugging-port=9238', `--test-profile=${join(testProfile ?? app.getPath('userData'), 'preview')}`] : [];
    try {
      await new Promise((done, fail) => {
        const child = spawn(join(completed, 'WorLdPlayer.exe'), args, { env: environment, windowsHide: true, stdio: 'ignore' });
        preview = child;
        child.once('spawn', done);
        child.once('error', error => { preview = undefined; fail(error); });
        child.once('exit', () => { preview = undefined; if (!window.isDestroyed()) window.webContents.send('preview-ended'); });
      });
      return '';
    } catch { return '无法启动游戏，请检查游戏包是否被移动或删除，重新打包后再试。'; }
  });
  await window.loadFile(join(import.meta.dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
