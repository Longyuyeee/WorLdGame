import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';

/** Test a real same-origin replacement; keep the old quick slot for rollback. */
export async function checkWebReleaseUpdate(browser, root, output) {
  const previous = unzipSync(await readFile(path.join(root, 'evidence/web-player-settings/before-rain-stops-web.zip')));
  const current = unzipSync(await readFile(path.join(output, 'before-rain-stops-web.zip')));
  let files = previous;
  const server = createServer((request, response) => {
    const key = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/gal\//, '') || 'index.html';
    const bytes = files[key]; response.writeHead(bytes ? 200 : 404, { 'Content-Type': key.endsWith('.js') ? 'text/javascript' : key.endsWith('.css') ? 'text/css' : key.endsWith('.html') ? 'text/html' : 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(bytes ?? 'Missing');
  }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const context = await browser.newContext({ viewport: { width: 1280, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  const url = `http://127.0.0.1:${server.address().port}/gal/`;
  try {
    await page.goto(url); await page.getByRole('button', { name: /^开始故事/ }).click();
    await page.waitForFunction(() => document.querySelector('main')?.dataset.stageImagesPending === 'false');
    await page.getByRole('button', { name: '快速保存', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'saved');
    const oldHash = await page.locator('main').getAttribute('data-runtime-state-hash');
    files = current; await page.reload(); const newHash = await page.locator('main').getAttribute('data-runtime-state-hash');
    await page.getByRole('button', { name: '快速读取', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'error');
    assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), newHash);
    assert.ok((await page.locator('main').textContent()).includes('存档损坏或与当前构建不兼容'));
    await page.screenshot({ path: path.join(output, 'old-save-update-message.png') });
    files = previous; await page.reload(); await page.getByRole('button', { name: '快速读取', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('main')?.dataset.saveOperation === 'loaded');
    assert.equal(await page.locator('main').getAttribute('data-runtime-state-hash'), oldHash);
    assert.deepEqual(errors, []);
    const result = { passed: true, from: '1.5.0', to: '1.5.1', oldSaveAccepted: false, rejectedWithoutChangingNewGame: true, originalBuildLoadsOriginalSave: true, sameOrigin: true, offlineUpdateTested: false, errors };
    await writeFile(path.join(output, 'update-checks.json'), JSON.stringify(result, null, 2)); return result;
  } catch (error) { await page.screenshot({ path: path.join(output, 'update-failure.png') }).catch(() => {}); throw error; }
  finally { await context.close(); server.close(); }
}
