/** Selection guidance only: never converts a player artifact into author source. */
export const PROJECT_IMPORT_GUIDANCE = {
  WEB_GAME_ARCHIVE: {
    title: '这是网页游戏包，不是可编辑工程',
    steps: ['网页目录 ZIP、网站上传 ZIP 和 game 文件夹用于试玩或发布，不能恢复可编辑工程与原素材。', '请从原电脑的项目菜单导出“工程 ZIP”，或选择之前保留的完整“制作交付包”。只有游戏文件时，需要向作者取得源工程。'],
  },
  GAME_HTML: {
    title: '这是网页文件，不是工程 ZIP',
    steps: ['单文件 HTML 用于打开游戏，不包含可恢复的完整作者工程。这里不会打开或执行所选网页。', '继续制作请选“工程 ZIP”或完整“制作交付包”；不要把 HTML 改名为 ZIP。'],
  },
  PLAYER_SAVE: {
    title: '这是玩家进度备份，不是创作工程',
    steps: ['请打开同一作品，在游戏的“存读档”→“备份”中选择 .worldsave 文件，核对进度后导入并读取。', '玩家进度不能恢复剧情工程或原素材；继续制作需要工程 ZIP 或完整制作交付包。'],
  },
  REVIEW_FILE: {
    title: '这是校订或试玩记录，不是创作工程',
    steps: ['先导入对应作品的工程 ZIP 或完整制作交付包，再在编辑器“检查”页导入对应的校订记录或试玩进度。', '单独的记录文件不包含剧情和原素材；只有记录时，请从原电脑补导出工程。'],
  },
  WRAPPED_PROJECT: {
    title: '工程入口被额外包在了文件夹内',
    steps: ['当前 ZIP 的根目录没有工程入口；内部发现了另一层工程或制作交付入口。为避免误选，不会自动拆层导入。', '请优先选择编辑器原样导出的 ZIP，不要解压后再套文件夹压缩。也可在解压目录中找到原 source/project.zip，单独选择它。'],
  },
  INCOMPLETE_DELIVERY: {
    title: '这不是完整的制作交付包',
    steps: ['所选 ZIP 中有 source/project.zip，但缺少根目录 delivery.json，无法核对整份交付内容。', '请重新选择完整制作交付 ZIP。若只需恢复工程，可解压并单独选择 source/project.zip；它仍需通过完整校验，不会自动恢复外层校订或试玩记录。'],
  },
} as const;

export type ProjectImportGuidanceCode = keyof typeof PROJECT_IMPORT_GUIDANCE;
export function isProjectImportGuidanceCode(code: unknown): code is ProjectImportGuidanceCode {
  return typeof code === 'string' && Object.hasOwn(PROJECT_IMPORT_GUIDANCE, code);
}
export class ProjectImportSelectionError extends Error {
  constructor(readonly code: ProjectImportGuidanceCode) {
    const guidance = PROJECT_IMPORT_GUIDANCE[code];
    super(`${guidance.title}。${guidance.steps.join(' ')}`);
    this.name = 'ProjectImportSelectionError';
  }
}

/** Bounded header hints for our text exports, not schema or authenticity checks. */
export function checkProjectImportText(bytes: Uint8Array): void {
  const header = new TextDecoder().decode(bytes.subarray(0, 4096)).trimStart();
  if (/^(?:<!doctype\s+html\b|<html\b)/iu.test(header)) throw new ProjectImportSelectionError('GAME_HTML');
  // Our exporters put the envelope before the potentially very large payload.
  // Anchor to root metadata so player text mentioning these names is not a hint.
  const envelope = /^\{\s*"schemaVersion"\s*:\s*1\s*,\s*"(format|kind)"\s*:\s*"([^"]+)"/u.exec(header);
  if (envelope?.[1] === 'format' && envelope[2] === 'world.player-save-backup') throw new ProjectImportSelectionError('PLAYER_SAVE');
  if (envelope?.[1] === 'kind' && ['world-playtest-notes', 'world-playtest-progress'].includes(envelope[2]!)) throw new ProjectImportSelectionError('REVIEW_FILE');
}

/** Call only after bounded ZIP path, size and CRC checks, before any writes. */
export function checkProjectImportEntries(files: Readonly<Record<string, Uint8Array>>): void {
  // An authoritative root must follow its original validation path even if bad.
  if (Object.hasOwn(files, 'world.project.json') || Object.hasOwn(files, 'delivery.json')) return;
  if (Object.hasOwn(files, 'source/project.zip')) throw new ProjectImportSelectionError('INCOMPLETE_DELIVERY');
  const paths = Object.keys(files);
  if (paths.some(path => path.endsWith('/world.project.json') || path.endsWith('/delivery.json'))) throw new ProjectImportSelectionError('WRAPPED_PROJECT');
  if (paths.some(path => path === 'index.html' || path.endsWith('/index.html'))) throw new ProjectImportSelectionError('WEB_GAME_ARCHIVE');
}
