export function playerSaveLabel(id: string): string {
  const match = /^(manual|auto|quick|checkpoint)-(\d+)$/.exec(id);
  if (!match) return '所选存档';
  if (match[1] === 'quick') return '快速存档';
  return `${({ manual: '手动存档', auto: '自动存档', checkpoint: '剧情检查点' } as Record<string, string>)[match[1]!]} ${match[2]}`;
}
