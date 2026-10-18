// Author-side helper shipped with a directory export. Node.js built-ins only.
import { createHash } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, readFile, rename } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';

const maximumBytes = 512 * 1024 * 1024;
const names = new Set(['index.html', 'player.js', 'player.css', 'offline.js', 'offline.css', 'sw.js', 'manifest.webmanifest', 'app-icon.svg', 'optimization-report.json', 'save-compatibility.json', 'credits.txt']);
const required = ['index.html', 'player.js', 'player.css', 'offline.js', 'offline.css', 'sw.js', 'manifest.webmanifest'];
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const problem = (code, path, message) => Object.assign(new Error(`${path}：${message}`), { code, path });
const safePath = path => typeof path === 'string' && (names.has(path) || /^media\/[a-f0-9]{64}\.[a-z0-9]+$/u.test(path));
export function parseSiteBuildInfo(bytes) {
  if (bytes.length > 2 * 1024 * 1024) throw problem('INVALID_MANIFEST', 'build-info.json', '清单超过 2 MiB，请重新导出目录包。');
  let info;
  try { info = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw problem('INVALID_MANIFEST', 'build-info.json', '不是有效 UTF-8 JSON，请重新导出。'); }
  if (!info || info.schemaVersion !== 1 || info.format !== 'world-web-directory' || info.entry !== 'index.html' || typeof info.projectId !== 'string' || typeof info.projectDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(info.projectDigest) || !info.publication || typeof info.publication.name !== 'string' || typeof info.publication.version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(info.publication.version) || !Array.isArray(info.files) || info.files.length > 8192) throw problem('INVALID_MANIFEST', 'build-info.json', '作品或文件清单格式不正确。');
  const seen = new Set(); let total = 0;
  for (const row of info.files) {
    if (!row || !safePath(row.path) || seen.has(row.path) || !Number.isSafeInteger(row.byteLength) || row.byteLength < 0 || row.byteLength > maximumBytes || typeof row.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(row.digest)) throw problem('INVALID_MANIFEST', 'build-info.json', '包含重复、越界、作者私有文件或无效文件记录。');
    seen.add(row.path); total += row.byteLength;
  }
  if (total > maximumBytes || required.some(path => !seen.has(path))) throw problem('INVALID_MANIFEST', 'build-info.json', '缺少必要网站文件或超过 512 MiB，请重新导出。');
  return info;
}
async function confinedFile(root, path) {
  const target = resolve(root, path);
  if (!target.startsWith(root + sep)) throw problem('UNSAFE_PATH', path, '文件路径不在游戏目录中。');
  let current = root;
  for (const part of path.split('/')) {
    current = resolve(current, part); let stats;
    try { stats = await lstat(current); } catch { throw problem('MISSING_FILE', path, '文件缺失或无法读取，请完整解压同一版本的目录包。'); }
    if (stats.isSymbolicLink()) throw problem('UNSAFE_PATH', path, '不接受链接文件/目录，请使用解压后的真实文件。');
    if (current === target && !stats.isFile()) throw problem('MISSING_FILE', path, '不是普通文件。');
  }
  return target;
}
async function fileDigest(target, expected, label) {
  const hasher = createHash('sha256'); let length = 0;
  for await (const chunk of createReadStream(target)) {
    length += chunk.length;
    if (length > expected.byteLength) throw problem('FILE_MISMATCH', label, '大小不符，可能混入旧版或损坏文件；请重新完整解压。');
    hasher.update(chunk);
  }
  if (length !== expected.byteLength || 'sha256:' + hasher.digest('hex') !== expected.digest) throw problem('FILE_MISMATCH', label, '大小/摘要不符，可能混入旧版或损坏文件；请重新完整解压。');
}
export async function inspectLocalSite(directory, onProgress = () => {}) {
  const root = resolve(directory), manifestPath = await confinedFile(root, 'build-info.json');
  if ((await lstat(manifestPath)).size > 2 * 1024 * 1024) throw problem('INVALID_MANIFEST', 'build-info.json', '清单超过 2 MiB，请重新导出目录包。');
  const bytes = await readFile(manifestPath);
  const info = parseSiteBuildInfo(bytes);
  for (const [index, row] of info.files.entries()) { await fileDigest(await confinedFile(root, row.path), row, row.path); onProgress(index + 1, info.files.length, row.path); }
  let offline;
  try { const line = (await readFile(await confinedFile(root, 'sw.js'), 'utf8')).split('\n', 1)[0]; if (!line.startsWith('const inventory = ') || !line.endsWith(';')) throw Error('missing inventory'); offline = JSON.parse(line.slice('const inventory = '.length, -1)); } catch { throw problem('INVALID_OFFLINE_MANIFEST', 'sw.js', '无法读取离线清单，请重新导出目录包。'); }
  const expectedOffline = Object.fromEntries(info.files.filter(row => row.path !== 'sw.js').map(row => [row.path, row.digest]));
  if (!offline || Array.isArray(offline) || Object.keys(offline).length !== Object.keys(expectedOffline).length || Object.entries(expectedOffline).some(([path, digest]) => offline[path] !== digest)) throw problem('INVALID_OFFLINE_MANIFEST', 'sw.js', '离线清单与网站文件清单不一致，请重新导出，不要手工删改清单。');
  return { schemaVersion: 1, kind: 'world-web-deployment-check', mode: 'local', fileIntegrityPassed: true, projectId: info.projectId, projectDigest: info.projectDigest, publication: info.publication, manifestDigest: hash(bytes), checkedFiles: info.files.length + 1, permissionVerified: false, playthroughVerified: false, deviceVerified: false, offlineLifecycleVerified: false, warnings: [], info };
}
export async function prepareWebsiteDirectory(directory, onProgress) {
  const root = resolve(directory), report = await inspectLocalSite(root, onProgress);
  const staging = await mkdtemp(resolve(root, '.website-building-'));
  // Unique owned staging, no overwrite/merge and no recursive deletion of user directories.
  for (const path of ['build-info.json', ...report.info.files.map(row => row.path)]) {
    const target = resolve(staging, path); await mkdir(dirname(target), { recursive: true });
    await copyFile(await confinedFile(root, path), target, constants.COPYFILE_EXCL);
  }
  const copied = await inspectLocalSite(staging);
  if (copied.manifestDigest !== report.manifestDigest) throw problem('SOURCE_CHANGED', 'build-info.json', '生成期间源目录发生变化；未生成可上传目录，请重新核对。');
  const output = resolve(root, `website-ready-${report.publication.version}-${staging.slice(staging.lastIndexOf('-') + 1)}`);
  try { await lstat(output); throw problem('OUTPUT_EXISTS', output, '目标已存在，不覆盖已有目录。'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await rename(staging, output);
  return { ...report, mode: 'prepared', outputDirectory: output };
}
export function deploymentBaseUrl(value) {
  let url; try { url = new URL(value); } catch { throw problem('INVALID_URL', '网站地址', '请输入完整 HTTPS 目录地址；本机验证可用 http://127.0.0.1。'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!(url.protocol === 'https:' || url.protocol === 'http:' && loopback) || url.username || url.password || url.search || url.hash) throw problem('INVALID_URL', '网站地址', '只接受无账号、查询参数和片段的 HTTPS 地址（本机可用 HTTP）。');
  if (url.pathname.endsWith('/index.html')) url.pathname = url.pathname.slice(0, -10);
  else if (/\.[^/]+$/u.test(url.pathname)) throw problem('INVALID_URL', '网站地址', '这里需要目录包的网站地址，不是单文件游戏或压缩包。');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}
const expectedMime = path => path.endsWith('.js') ? ['text/javascript', 'application/javascript', 'application/x-javascript'] : path.endsWith('.css') ? ['text/css'] : path.endsWith('.html') ? ['text/html'] : path.endsWith('.json') ? ['application/json', 'text/json'] : path.endsWith('.webmanifest') ? ['application/manifest+json', 'application/json'] : null;
async function inspectRemoteFile(url, row, warnings, timeoutMs) {
  const response = await fetch(url, { redirect: 'manual', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(timeoutMs) });
  try {
    if (response.status >= 300 && response.status < 400) throw problem('REDIRECT', row.path, '网站返回跳转；请填写最终目录地址，检查器不会自动访问跳转目标。');
    if (response.status !== 200 || !response.body) throw problem('HTTP_ERROR', row.path, `网站返回 HTTP ${response.status}，请补齐文件后重试。`);
    const mime = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase(), expected = expectedMime(row.path);
    if (expected && !expected.includes(mime)) throw problem('MIME_ERROR', row.path, `类型为 ${mime || '空'}；请修复静态文件类型/登录页/SPA 回退配置。`);
    if (row.path === 'sw.js' && !/(?:^|,)\s*(?:no-cache|no-store|max-age\s*=\s*0)(?:\s|,|$)/iu.test(response.headers.get('cache-control') ?? '')) warnings.push('sw.js 未声明 no-cache/no-store/max-age=0，请确认更新能及时取得新 Worker。');
    const hasher = createHash('sha256'); let length = 0;
    for await (const chunk of response.body) {
      length += chunk.byteLength;
      if (length > row.byteLength) throw problem('REMOTE_MISMATCH', row.path, '网站文件大小不符，可能有旧缓存、错误页或混合版本。');
      hasher.update(chunk);
    }
    if (length !== row.byteLength || 'sha256:' + hasher.digest('hex') !== row.digest) throw problem('REMOTE_MISMATCH', row.path, '网站字节与本包不一致；请完整上传同一构建，不要混合版本。');
  } finally { await response.body?.cancel().catch(() => {}); }
}
export async function inspectDeployedSite(directory, value, { onProgress = () => {}, timeoutMs = 15000 } = {}) {
  const base = deploymentBaseUrl(value), report = await inspectLocalSite(directory), warnings = [];
  const rows = [{ path: 'build-info.json', byteLength: (await lstat(await confinedFile(resolve(directory), 'build-info.json'))).size, digest: report.manifestDigest }, ...report.info.files];
  for (const [index, row] of rows.entries()) {
    try { await inspectRemoteFile(new URL(row.path, base), row, warnings, timeoutMs); }
    catch (error) { if (error.code && error.path) throw error; throw problem('NETWORK_ERROR', row.path, `网络/证书/超时错误：${error.message}。未继续猜测其他地址，请检查后重试。`); }
    onProgress(index + 1, rows.length, row.path);
  }
  return { ...report, mode: 'remote', deploymentUrl: base.href, loopback: ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), warnings };
}
async function main() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw Error('请安装 Node.js 22 或更高版本，无需 npm install。');
  const root = dirname(fileURLToPath(import.meta.url)), args = process.argv.slice(2), json = args.includes('--json');
  if (args.some(value => !['--prepare', '--json', '--interactive', '--check'].includes(value) && !value.startsWith('--url=')) || args.filter(value => value.startsWith('--url=')).length > 1 || args.includes('--prepare') && args.some(value => value.startsWith('--url=')) || args.includes('--interactive') && args.length !== 1) throw Error('参数组合不正确。使用 --prepare，或 --url=完整地址，或单独使用 --interactive。');
  let mode = args.includes('--prepare') ? 'prepare' : 'check', target = args.find(value => value.startsWith('--url='))?.slice(6);
  if (target === '') throw Error('网站地址为空，未执行网站核对。');
  if (args.includes('--interactive')) {
    const input = createInterface({ input: process.stdin, output: process.stdout });
    try { console.log('1 核对本地目录\n2 生成纯网站目录（不上传）\n3 只读核对已部署网站'); const choice = (await input.question('请选择 1 / 2 / 3：')).trim(); if (!['1', '2', '3'].includes(choice)) throw Error('选项无效，未执行操作。'); mode = choice === '2' ? 'prepare' : 'check'; if (choice === '3') { target = (await input.question('请输入你有权限核对的 HTTPS 目录地址：')).trim(); if (!target) throw Error('地址为空，未访问网站。'); } } finally { input.close(); }
  }
  const progress = json ? () => {} : (done, total, path) => console.log(`核对 ${done}/${total} · ${path}`);
  const report = mode === 'prepare' ? await prepareWebsiteDirectory(root, progress) : target ? await inspectDeployedSite(root, target, { onProgress: progress }) : await inspectLocalSite(root, progress);
  const { info: _info, ...summary } = report;
  if (json) console.log(JSON.stringify(summary, null, 2));
  else { console.log(`\n文件核对通过：${report.publication.name} · ${report.publication.version}`); if (report.outputDirectory) console.log(`只上传此目录里的内容：\n${report.outputDirectory}\n目录已排除本地助手、源工程、内部报告；最后上传 sw.js。`); if (report.deploymentUrl) console.log(`已逐份核对：${report.deploymentUrl}`); for (const warning of report.warnings) console.log('提醒：' + warning); console.log('这只核对文件，不代表许可、真机、完整游玩或离线升级已验收。'); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(error => { console.error('核对未通过：' + error.message + '\n没有上传文件、修改网站或覆盖原目录。'); process.exitCode = 1; });
