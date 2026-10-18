import { build } from './player-fixture-build.mjs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const baselineCommit = 'f52bb773615402ef37e37c92295979defd55d106';
export async function runPlayerCatalog(initialClient, root, temporary, restart) {
  let client = initialClient;
  async function bundle(entry, name, baseline = false) {
    const path = join(root, 'apps/player-shell/src/player-save-store.ts').replaceAll('\\', '/');
    let loaded = false;
    const output = await build({ configFile: false, logLevel: 'error', define: { 'process.env.NODE_ENV': JSON.stringify('production') }, plugins: [{ name: 'catalog-baseline', enforce: 'pre', load(id) {
      if (baseline && id.replaceAll('\\', '/') === path) { loaded = true; return execFileSync('git', ['show', `${baselineCommit}:apps/player-shell/src/player-save-store.ts`], { cwd: root, encoding: 'utf8' }); }
      return null;
    } }], build: { write: false, minify: true, lib: { entry: join(root, entry), name, formats: ['iife'] } } });
    assert.equal(loaded, baseline);
    const code = (Array.isArray(output) ? output[0] : output).output.find(item => item.type === 'chunk').code;
    return { code, sha256: createHash('sha256').update(code).digest('hex') };
  }
  const before = await bundle('tools/player-catalog-browser.ts', 'OldCatalog', true), after = await bundle('tools/player-catalog-browser.ts', 'NewCatalog');
  const ui = await bundle('tools/player-catalog-ui.ts', 'CatalogUI');
  const path = join(temporary, 'catalog.html');
  await writeFile(path, '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="player-root"></div>');
  const url = pathToFileURL(path).href;
  async function navigate() {
    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await client.send('Page.navigate', { url }); await client.wait("document.querySelector('#player-root')");
  }
  await navigate();
  await client.evaluate(before.code); await client.evaluate(after.code);
  const fixture = await client.evaluate('globalThis.catalogTask=NewCatalog.populate()');
  assert.equal(fixture.slots, 18); assert.equal(fixture.history, 480);
  await client.evaluate('globalThis.decoderBase=DecompressionStream;globalThis.decodes=0;globalThis.DecompressionStream=class extends decoderBase{constructor(...args){super(...args);decodes++;}}');
  const samples = [];
  async function measure(name) { return client.evaluate(`globalThis.catalogTask=(async()=>{decodes=0;const result=await ${name}.sample();return {...result,decodes};})()`); }
  for (let i = 0; i < 6; i++) {
    const pair = i % 2 ? [await measure('NewCatalog'), await measure('OldCatalog')].reverse() : [await measure('OldCatalog'), await measure('NewCatalog')];
    assert.deepEqual(pair[0].headers, pair[1].headers); assert.equal(pair[0].decodes, 36); assert.equal(pair[1].decodes, 0);
    assert.ok(pair[0].retainedPayloadCharacters > 0); assert.equal(pair[1].retainedPayloadCharacters, 0);
    if (i > 0) samples.push({ before: { ...pair[0], headers: undefined }, after: { ...pair[1], headers: undefined } });
  }
  await client.evaluate('globalThis.DecompressionStream=decoderBase');
  async function beginStory() {
    await client.button('开始故事');
    await client.wait("document.querySelector('main').dataset.playerStatus==='presenting'||[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='确认开始新故事')");
    if (await client.evaluate("document.querySelector('main').dataset.playerStatus!=='presenting'")) await client.button('确认开始新故事');
    await client.wait("document.querySelector('main').dataset.playerStatus==='presenting'");
  }
  await client.evaluate(ui.code); await client.evaluate('globalThis.catalogUI=CatalogUI.start()');
  await beginStory(); await client.button('存读档');
  const load = async index => {
    await client.wait(`[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='读取')[${index}]?.disabled===false`);
    await client.evaluate(`[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='读取')[${index}].click()`);
  };
  await load(0); await client.wait("document.querySelector('main').dataset.saveOperation==='loaded'");
  const stateHash = await client.evaluate("document.querySelector('main').dataset.runtimeStateHash"); assert.equal(stateHash, fixture.stateHash);
  await client.evaluate('globalThis.catalogTask=CatalogUI.corrupt()'); await client.button('存读档'); await load(0);
  await client.wait("document.querySelector('main').dataset.saveOperation==='error'");
  assert.equal(await client.evaluate("document.querySelector('main').dataset.runtimeStateHash"), stateHash);
  const counts = await client.evaluate('catalogUI.counts()'); assert.ok(counts.reads > 0 && counts.lists > 0);
  await writeFile(join(root, 'evidence/authoring/player-catalog-390.png'), Buffer.from((await client.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  const errors = [...client.errors]; await client.evaluate('catalogUI.close()');
  const replacement = await restart(); client = replacement.client; assert.equal(replacement.previousProcessExited, true);
  await navigate(); await client.evaluate(ui.code); await client.evaluate('globalThis.catalogUI=CatalogUI.start()');
  await beginStory(); await client.button('存读档'); await load(1);
  await client.wait("document.querySelector('main').dataset.saveOperation==='loaded'");
  assert.equal(await client.evaluate("document.querySelector('main').dataset.runtimeStateHash"), fixture.stateHash);
  assert.equal(Number(await client.evaluate("document.querySelector('main').dataset.historyLength")), 480);
  errors.push(...client.errors); assert.deepEqual(errors, []); await client.evaluate('catalogUI.close()');
  const result = { schemaVersion: 1, baselineCommit, fixture, bundles: { before: before.sha256, after: after.sha256, ui: ui.sha256 }, samples,
    headersEqual: true, corruptPayloadRejectedWithoutStateChange: true, coldProcessLoad: true, fullHistory: 480, counts, exceptions: errors,
    limits: '18 real IndexedDB packed saves, 480 history each; one warmup and five alternating samples. Metadata browsing is not payload validation. Natural GC, no device/memory/frame-budget acceptance. CLI DOM clicks exercise actual buttons; not physical touch. Current UI only; fixed baseline compares storage adapter list and previews.' };
  await writeFile(join(root, 'evidence/authoring/player-catalog.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}
