import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const browser = await chromium.launch({ headless: true, executablePath: process.env.STUDIO_CHROME });
try {
  const page = await browser.newPage();
  const svg = await readFile(path.resolve('assets/rain-story/letter-icon.svg'), 'utf8');
  const png = await page.evaluate(async svg => { const picture = new Image(); picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; await picture.decode(); const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512; canvas.getContext('2d').drawImage(picture, 0, 0, 512, 512); return canvas.toDataURL('image/png').split(',')[1]; }, svg);
  await writeFile(path.resolve('assets/rain-story/letter-icon.png'), Buffer.from(png, 'base64'));
} finally { await browser.close(); }
