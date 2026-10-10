// Distributed with the game. Uses only Node.js built-ins; no npm install.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('需要 Node.js 22 或更高版本。安装后重新打开预览入口。');
  const info = JSON.parse(await readFile(resolve(root, 'build-info.json'), 'utf8'));
  const allowed = new Set(info.files.map(file => file.path));
  for (const file of ['index.html', 'player.js', 'player.css']) {
    if (!allowed.has(file)) throw new Error('游戏目录不完整，请完整解压 ZIP 后重试。');
    await stat(resolve(root, file));
  }
  const base = '/game/' + encodeURIComponent(info.projectId ?? info.projectDigest) + '/';
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname === '/') { response.writeHead(302, { Location: base }); response.end(); return; }
      const path = url.pathname.startsWith(base) ? decodeURIComponent(url.pathname.slice(base.length)) || 'index.html' : '';
      const target = resolve(root, path);
      if (!allowed.has(path) || !target.startsWith(root + sep)) { response.writeHead(404); response.end('文件不存在，请检查是否完整解压。'); return; }
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
      const file = await stat(target);
      if (!file.isFile()) { response.writeHead(404); response.end(); return; }
      let start = 0, end = file.size - 1, status = 200;
      const headers = { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
      if (request.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        if (!match || (!match[1] && !match[2])) { response.writeHead(416, { 'Content-Range': 'bytes */' + file.size }); response.end(); return; }
        start = match[1] ? Number(match[1]) : Math.max(0, file.size - Number(match[2]));
        end = match[1] && match[2] ? Math.min(Number(match[2]), file.size - 1) : file.size - 1;
        if (start > end) { response.writeHead(416, { 'Content-Range': 'bytes */' + file.size }); response.end(); return; }
        status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${file.size}`;
      }
      headers['Content-Length'] = String(Math.max(0, end - start + 1));
      response.writeHead(status, headers);
      if (request.method === 'HEAD' || file.size === 0) { response.end(); return; }
      const stream = createReadStream(target, { start, end });
      stream.on('error', () => response.destroy()); response.on('close', () => stream.destroy()); stream.pipe(response);
    } catch { if (!response.headersSent) response.writeHead(404); response.end('无法读取游戏文件，请完整解压后重试。'); }
  });
  const portArgument = process.argv.find(value => value.startsWith('--port='));
  const requested = portArgument ? Number(portArgument.slice(7)) : 4178;
  if (!Number.isInteger(requested) || requested < 0 || requested > 65535) throw new Error('端口无效。');
  let bound = false;
  for (let offset = 0; offset < 20 && requested + offset <= 65535; offset++) {
    try {
      await new Promise((done, fail) => {
        const failure = error => { server.off('listening', success); fail(error); };
        const success = () => { server.off('error', failure); done(); };
        server.once('error', failure); server.once('listening', success);
        server.listen(requested === 0 ? 0 : requested + offset, '127.0.0.1');
      });
      bound = true; break;
    } catch (error) { if (error.code !== 'EADDRINUSE') throw error; }
  }
  if (!bound) throw new Error('预览端口都被占用，请关闭以前的预览窗口后重试。');
  const url = `http://127.0.0.1:${server.address().port}${base}`;
  console.log('本地站点预览已启动（仅本机可访问）\n' + url);
  console.log('保持此窗口打开。输入 q 后回车，或按 Ctrl+C 停止。\n若浏览器没有自动打开，请复制上方网址。\n端口变化会改变浏览器存档/缓存位置；正式游玩请保持原网址。');
  const stop = () => { server.closeAllConnections(); server.close(() => { console.log('预览已停止。'); process.exit(0); }); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  process.stdin.setEncoding('utf8'); process.stdin.on('data', value => { if (value.trim().toLowerCase() === 'q') stop(); });
  if (!process.argv.includes('--no-open')) {
    const command = process.platform === 'win32' ? 'powershell.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', `Start-Process -FilePath '${url.replaceAll("'", "''")}'`] : [url];
    const opener = spawn(command, args, { windowsHide: true, stdio: 'ignore' });
    opener.on('error', () => console.log('浏览器未能自动打开，请复制上方网址。'));
    opener.on('exit', code => { if (code) console.log('浏览器未能自动打开，请复制上方网址。'); });
  }
}

main().catch(error => { console.error('无法启动本地预览：' + error.message + '\n请确认完整解压游戏目录，并安装 Node.js 22+。'); process.exitCode = 1; });
