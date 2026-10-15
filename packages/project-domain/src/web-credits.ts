import type { CanonicalProject } from './types';

export interface WebCreditEntry { readonly role: string; readonly name: string; readonly url: string; }
export interface WebCredits { readonly schemaVersion: 1; readonly studio: string; readonly website: string; readonly copyright: string; readonly entries: readonly WebCreditEntry[]; readonly acknowledgements: string; }
export const DEFAULT_WEB_CREDITS: WebCredits = { schemaVersion: 1, studio: '', website: '', copyright: '', entries: [], acknowledgements: '' };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function text(value: unknown, limit: number, label: string): string {
  if (typeof value !== 'string' || value.length > limit) throw Error(`${label}最多 ${limit} 个字符。`);
  return value.trim();
}
export function webCreditUrl(value: unknown): string {
  const raw = text(value, 2048, '链接');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password || /[\s\u0000-\u001f\u007f]/u.test(raw)) throw Error();
    return url.href;
  } catch { throw Error('链接请填写完整的 https:// 或 http:// 网址，或留空。'); }
}
export function parseWebCredits(value: unknown): WebCredits {
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.entries) || value.entries.length > 80) throw Error('制作名单格式无效，最多添加 80 条署名。');
  return { schemaVersion: 1, studio: text(value.studio, 120, '制作团队'), website: webCreditUrl(value.website), copyright: text(value.copyright, 500, '版权说明'), acknowledgements: text(value.acknowledgements, 12000, '素材与特别鸣谢'),
    entries: value.entries.map(entry => {
      if (!object(entry)) throw Error('署名条目格式无效。');
      const role = text(entry.role, 80, '职责'), name = text(entry.name, 200, '署名');
      if (!role || !name) throw Error('每条署名都需要填写职责和姓名／名称，空行请移除。');
      return { role, name, url: webCreditUrl(entry.url) };
    }) };
}
export function readWebCredits(project: CanonicalProject): WebCredits {
  const value = project.manifest.preservedFields?.webCredits;
  return value === undefined ? DEFAULT_WEB_CREDITS : parseWebCredits(value);
}
export const hasWebCredits = (value: WebCredits) => !!(value.studio || value.website || value.copyright || value.entries.length || value.acknowledgements);
export function applyWebCredits(project: CanonicalProject, value: WebCredits): CanonicalProject {
  const credits = parseWebCredits(value);
  return { ...project, manifest: { ...project.manifest, preservedFields: { ...project.manifest.preservedFields,
    webCredits: { ...credits, entries: credits.entries.map(entry => ({ ...entry })) } } } };
}
export function formatWebCredits(value: WebCredits, title: string): string {
  return [`${title} · 制作名单`, value.studio, value.website, value.copyright,
    value.entries.length ? `制作人员\n${value.entries.map(entry => `${entry.role}：${entry.name}${entry.url ? `\n${entry.url}` : ''}`).join('\n\n')}` : '',
    value.acknowledgements ? `素材与特别鸣谢\n${value.acknowledgements}` : ''].filter(Boolean).join('\n\n') + '\n';
}
