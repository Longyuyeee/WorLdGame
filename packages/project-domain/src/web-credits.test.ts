import { expect, it } from 'vitest';
import { createProjectTemplate, saveProject, loadProject, semanticHash } from './index';
import { DEFAULT_WEB_CREDITS, applyWebCredits, readWebCredits, parseWebCredits, webCreditUrl, hasWebCredits, formatWebCredits } from './web-credits';
const project = () => createProjectTemplate('署名测试', '018f08d8-71a1-7bc2-a627-2f4a843ee150');
it('keeps old projects empty and roundtrips ordered credits without changing story or unrelated metadata', () => {
  const source = project(), before = semanticHash(source);
  expect(hasWebCredits(readWebCredits(source))).toBe(false);
  const value = { ...DEFAULT_WEB_CREDITS, studio: ' 示例团队 ', entries: [{ role: '剧本', name: '小林', url: 'https://example.com/编剧' }, { role: '美术', name: '<作者>', url: '' }], acknowledgements: '背景：作者\n许可：说明', copyright: '© 示例团队' };
  const next = loadProject(saveProject(applyWebCredits(source, value))), credits = readWebCredits(next);
  expect(credits.studio).toBe('示例团队'); expect(credits.entries.map(entry => entry.name)).toEqual(['小林', '<作者>']); expect(credits.entries[0]!.url).toBe('https://example.com/%E7%BC%96%E5%89%A7');
  expect(next.scripts).toEqual(source.scripts); expect(semanticHash(source)).toBe(before);
  expect(formatWebCredits(credits, '署名测试')).toContain('美术：<作者>'); expect(hasWebCredits(readWebCredits(applyWebCredits(next, DEFAULT_WEB_CREDITS)))).toBe(false);
});
it('rejects unsafe URLs and incomplete or oversized imported data while accepting ordinary absolute web links', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,x', '//example.com', 'https://u:p@example.com', 'https://example.com/\nfoo']) expect(() => webCreditUrl(url)).toThrow('链接');
  expect(webCreditUrl('http://example.com')).toBe('http://example.com/');
  for (const value of [null, { ...DEFAULT_WEB_CREDITS, schemaVersion: 2 }, { ...DEFAULT_WEB_CREDITS, entries: Array(81).fill({ role: 'a', name: 'b', url: '' }) }, { ...DEFAULT_WEB_CREDITS, entries: [{ role: '剧本', name: ' ', url: '' }] }, { ...DEFAULT_WEB_CREDITS, acknowledgements: '长'.repeat(12001) }]) expect(() => parseWebCredits(value)).toThrow();
  const bad = { ...project(), manifest: { ...project().manifest, preservedFields: { webCredits: { schemaVersion: 2 } } } };
  expect(() => readWebCredits(bad)).toThrow();
});
