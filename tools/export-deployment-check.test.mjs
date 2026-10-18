import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, rename, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, relative } from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { inspectLocalSite, prepareWebsiteDirectory, deploymentBaseUrl, inspectDeployedSite, parseSiteBuildInfo } from '../apps/editor/src/export-deployment-check.mjs';

const owned = [], servers = [], children = [], prefix = join(tmpdir(), 'world-site-test-');
const digest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const json = data => Buffer.from(JSON.stringify(data));
async function fixture() {
  const root = await mkdtemp(prefix); owned.push(root);
  const media = `media/${'a'.repeat(64)}.wav`;
  const files = Object.fromEntries(['index.html', 'player.js', 'player.css', 'offline.js', 'offline.css', 'sw.js', 'manifest.webmanifest', media].map(path => [path, Buffer.from(`content for ${path}`)]));
  files['sw.js'] = Buffer.from(`const inventory = ${JSON.stringify(Object.fromEntries(Object.entries(files).filter(([path]) => path !== 'sw.js').map(([path, bytes]) => [path, digest(bytes)])))};\n// test worker`);
  const info = { schemaVersion: 1, format: 'world-web-directory', projectId: 'work', projectDigest: 'b'.repeat(64), publication: { name: '测试作品', version: '1.0.0' }, entry: 'index.html', files: Object.entries(files).map(([path, bytes]) => ({ path, byteLength: bytes.length, digest: digest(bytes) })) };
  files['build-info.json'] = json(info);
  for (const [path, bytes] of Object.entries(files)) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), bytes); }
  await mkdir(join(root, 'source')); await writeFile(join(root, 'source/project.zip'), 'PRIVATE_SOURCE'); await writeFile(join(root, 'internal-evidence.txt'), 'PRIVATE_EVIDENCE');
  return { root, files, info, media };
}
async function server(files, options = {}) {
  const hits = [], methods = []; const service = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://local').pathname).replace(/^\/game\//u, ''); hits.push(path); methods.push(request.method);
    if (options.redirect === path) { response.writeHead(302, { Location: 'https://example.invalid/never-follow' }).end(); return; }
    if (options.hang === path) return;
    const bytes = options.override?.[path] ?? files[path];
    const mime = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.html') ? 'text/html' : path.endsWith('.wav') ? 'audio/wav' : 'application/json';
    response.writeHead(bytes ? 200 : 404, { 'Content-Type': options.mime?.[path] ?? mime, 'Cache-Control': options.cacheControl ?? 'no-cache' }).end(bytes ?? 'missing');
  });
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve)); servers.push(service);
  return { url: `http://127.0.0.1:${service.address().port}/game/`, hits, methods };
}
afterEach(async () => {
  for (const child of children.splice(0)) if (child.exitCode === null) { child.kill(); await once(child, 'exit').catch(() => {}); }
  for (const service of servers.splice(0)) { service.closeAllConnections(); await new Promise(resolve => service.close(resolve)); }
  for (const directory of owned.splice(0)) { const target = resolve(directory); assert.ok(target.startsWith(resolve(prefix)) && target !== resolve(tmpdir())); await rm(target, { recursive: true, force: true }); }
});
test('checks every exact local file without counting author extras or declaring product acceptance', async () => {
  const { root, info } = await fixture(), steps = [];
  const report = await inspectLocalSite(root, (done, total, path) => steps.push({ done, total, path }));
  assert.equal(report.checkedFiles, info.files.length + 1); assert.equal(steps.length, info.files.length); assert.equal(report.fileIntegrityPassed, true);
  for (const field of ['permissionVerified', 'playthroughVerified', 'deviceVerified', 'offlineLifecycleVerified']) assert.equal(report[field], false);
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});
test('detects missing, same-size corrupt and longer files with an actionable file path', async () => {
  const { root, media, files } = await fixture(); await rename(join(root, media), join(root, 'temporarily-moved.wav'));
  await assert.rejects(inspectLocalSite(root), error => error.code === 'MISSING_FILE' && error.path === media);
  await writeFile(join(root, media), Buffer.alloc(files[media].length, 9)); await assert.rejects(inspectLocalSite(root), { code: 'FILE_MISMATCH', path: media });
  await writeFile(join(root, media), Buffer.alloc(files[media].length + 1)); await assert.rejects(inspectLocalSite(root), { code: 'FILE_MISMATCH', path: media });
});
test('rejects malformed, duplicate, private, traversal, absolute and incomplete manifest inventories', async () => {
  const { info } = await fixture();
  for (const data of [null, { ...info, schemaVersion: 2 }, { ...info, publication: { name: 'x', version: ['1'] } }, { ...info, files: [...info.files, info.files[0]] }, { ...info, files: info.files.slice(1) }, ...['source/project.zip', 'release/preparation.json', 'review/private.json', 'preview.mjs', '../secret', 'C:/secret', '/secret', 'media/../../secret'].map(path => ({ ...info, files: [...info.files, { path, byteLength: 1, digest: digest('x') }] }))]) assert.throws(() => parseSiteBuildInfo(json(data)), { code: 'INVALID_MANIFEST' });
  assert.throws(() => parseSiteBuildInfo(Buffer.from([255])), { code: 'INVALID_MANIFEST' });
});
test('generates a new exact public-only directory without merging existing output or touching the source', async () => {
  const { root, files } = await fixture(), first = await prepareWebsiteDirectory(root), second = await prepareWebsiteDirectory(root);
  assert.notEqual(first.outputDirectory, second.outputDirectory); assert.ok(relative(root, first.outputDirectory).startsWith('website-ready-1.0.0-'));
  for (const report of [first, second]) { const paths = (await readdir(report.outputDirectory, { recursive: true })).filter(path => !['media'].includes(path)).map(path => path.replaceAll('\\', '/')).sort(); assert.deepEqual(paths, Object.keys(files).sort()); for (const [path, bytes] of Object.entries(files)) assert.deepEqual(await readFile(join(report.outputDirectory, path)), bytes); }
  assert.equal(await readFile(join(root, 'source/project.zip'), 'utf8'), 'PRIVATE_SOURCE');
});
test('does not create a ready folder from a corrupt source', async () => {
  const { root } = await fixture(); await writeFile(join(root, 'player.js'), 'bad'); await assert.rejects(prepareWebsiteDirectory(root), { code: 'FILE_MISMATCH' }); assert.ok(!(await readdir(root)).some(path => path.startsWith('website-ready-')));
});
test('rejects a website manifest that omits a media file still required by the offline worker', async () => {
  const { root, info, media } = await fixture(); await writeFile(join(root, 'build-info.json'), json({ ...info, files: info.files.filter(row => row.path !== media) }));
  await assert.rejects(inspectLocalSite(root), { code: 'INVALID_OFFLINE_MANIFEST', path: 'sw.js' });
});
test('rejects a directory junction instead of copying a linked source', async () => {
  const { root } = await fixture(), external = await mkdtemp(prefix); owned.push(external);
  await rename(join(root, 'media'), join(external, 'media')); await symlink(join(external, 'media'), join(root, 'media'), 'junction');
  await assert.rejects(inspectLocalSite(root), { code: 'UNSAFE_PATH' });
});
test('normalizes directory/index addresses and rejects credentials, tokens, remote HTTP and non-directory artifacts', () => {
  assert.equal(deploymentBaseUrl('https://example.invalid/story/index.html').href, 'https://example.invalid/story/'); assert.equal(deploymentBaseUrl('http://127.0.0.1:4178/game').pathname, '/game/');
  for (const url of ['not a url', 'http://example.invalid/game', 'https://u:p@example.invalid/', 'https://example.invalid/?token=x', 'https://example.invalid/#key', 'https://example.invalid/a.zip', 'https://example.invalid/game.html', 'file:///C:/game/']) assert.throws(() => deploymentBaseUrl(url), { code: 'INVALID_URL' });
});
test('performs read-only exact checks against the requested directory only', async () => {
  const { root, files } = await fixture(), site = await server(files), report = await inspectDeployedSite(root, site.url);
  assert.equal(report.mode, 'remote'); assert.equal(report.loopback, true); assert.equal(report.checkedFiles, Object.keys(files).length); assert.deepEqual(site.hits.sort(), Object.keys(files).sort()); assert.ok(site.methods.every(method => method === 'GET')); assert.deepEqual(report.warnings, []);
});
test('identifies missing, stale, changed manifest, wrong MIME and SPA fallback responses', async () => {
  const { root, files, media } = await fixture();
  for (const [options, expected] of [[{ override: { 'player.js': Buffer.from('wrong version') } }, { code: 'REMOTE_MISMATCH', path: 'player.js' }], [{ mime: { 'player.js': 'text/html' } }, { code: 'MIME_ERROR', path: 'player.js' }], [{ override: { 'build-info.json': json({ outdated: true }) } }, { code: 'REMOTE_MISMATCH', path: 'build-info.json' }], [{ override: { [media]: Buffer.from('<html>fallback</html>') }, mime: { [media]: 'text/html' } }, { code: 'REMOTE_MISMATCH', path: media }]]) { const site = await server(files, options); await assert.rejects(inspectDeployedSite(root, site.url), expected); }
  const missing = { ...files }; delete missing[media]; const site = await server(missing); await assert.rejects(inspectDeployedSite(root, site.url), { code: 'HTTP_ERROR', path: media });
});
test('does not follow redirects and bounds a stalled response, keeping version headers advisory', async () => {
  const { root, files } = await fixture();
  const redirected = await server(files, { redirect: 'build-info.json' }); await assert.rejects(inspectDeployedSite(root, redirected.url), { code: 'REDIRECT' }); assert.deepEqual(redirected.hits, ['build-info.json']);
  const stalled = await server(files, { hang: 'build-info.json' }); await assert.rejects(inspectDeployedSite(root, stalled.url, { timeoutMs: 30 }), { code: 'NETWORK_ERROR' });
  const cached = await server(files, { cacheControl: 'public, max-age=31536000' }); const report = await inspectDeployedSite(root, cached.url); assert.equal(report.warnings.length, 1); assert.equal(report.fileIntegrityPassed, true);
});
test('the shipped helper executes offline using only Node built-ins and returns a machine-readable report', async () => {
  const { root } = await fixture(); await writeFile(join(root, 'deployment-check.mjs'), await readFile(new URL('../apps/editor/src/export-deployment-check.mjs', import.meta.url)));
  const child = spawn(process.execPath, [join(root, 'deployment-check.mjs'), '--json'], { windowsHide: true }); children.push(child); let output = '', errors = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { errors += bytes; });
  const [code] = await once(child, 'exit'); assert.equal(code, 0, errors); const report = JSON.parse(output); assert.equal(report.fileIntegrityPassed, true); assert.equal(report.info, undefined);
});
test('rejects empty target and ambiguous command flags instead of silently reporting a local success', async () => {
  const { root } = await fixture(); await writeFile(join(root, 'deployment-check.mjs'), await readFile(new URL('../apps/editor/src/export-deployment-check.mjs', import.meta.url)));
  for (const args of [['--url='], ['--prepare', '--url=https://example.invalid/'], ['--interactive', '--json'], ['--unknown']]) {
    const child = spawn(process.execPath, [join(root, 'deployment-check.mjs'), ...args], { windowsHide: true }); children.push(child); let output = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.resume();
    const [code] = await once(child, 'exit'); assert.equal(code, 1); assert.equal(output, '');
  }
});
