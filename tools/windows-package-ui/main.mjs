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
  await window.loadFile(join(import.meta.dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
