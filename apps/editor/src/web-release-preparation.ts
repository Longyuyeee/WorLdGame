import { inspectWebAssetSources, readWebAssetSources, semanticHash, withoutWebAuthoringMetadata, WEB_ASSET_SOURCE_STATUS, type CanonicalProject } from '@world-studio/project-domain';
import { readWebPublication } from './web-publication';

export const WEB_DEPLOYMENT_TASKS = [
  '由作品所有者确认作者/发行身份、展示资料和全部素材发行条件；来源台账只记录依据，不自动作法律或授权结论。',
  '需要公开的署名在制作名单中单独核对。内部来源路径、联系人和确认依据仅用于作者交接，不要上传源工程或 release/review 文件夹。',
  '选择网站上传 ZIP，可直接生成仅含公开文件的包，无需安装 Node.js；完整解压后只上传其中内容，含 build-info.json，最后更新 sw.js。不要上传制作交付包、source、release 或 review。原网页目录 ZIP 仍可用 check-deployment.cmd 生成纯网站目录，或只读核对实际 HTTPS 地址的公开字节/类型；该本地检查器需要 Node.js，不替代实际游玩。网站不要将缺失文件回退为 index.html，sw.js 建议 no-cache。',
  '在自己有权限的 HTTPS 实际地址核对标题、版本、所有媒体、完整路线和两结局、声音、保存刷新与显式读取；本机预览不是公网地址。',
  '使用实际手机检查竖屏/横屏、阅读菜单、系统键盘、锁屏/后台、声音恢复和低内存；桌面触控模拟不代替真机。',
  '在同一实际地址主动下载离线内容，等就绪后断网重开。更新前导出 .worldsave、复制本版浏览器内入口并核对上一版工程；实测新版等待／明确启用、旧版入口重开与两版分别读档。剧情变化必须拒绝旧档并保留可运行原版；本版入口依赖本浏览器缓存，换机／清理后不能代替完整原版游戏，新旧版共用槽位需先备份。',
] as const;

/** A private, current-source inventory. Not a permission certificate or a record of executed deployment tests. */
export function createWebReleasePreparation(project: CanonicalProject) {
  let assets: ReturnType<typeof inspectWebAssetSources> = [], ledgerError: string | null = null;
  try { assets = inspectWebAssetSources(project, readWebAssetSources(project)); } catch (error) { ledgerError = error instanceof Error ? error.message : String(error); }
  const publication = readWebPublication(project), publicProject = withoutWebAuthoringMetadata({ ...project, manifest: { ...project.manifest, title: publication.name } });
  return {
    schemaVersion: 1, kind: 'world-web-release-preparation', projectId: project.manifest.projectId, publication,
    sourceProjectDigest: semanticHash(project), gameProjectDigest: semanticHash(publicProject),
    scope: '作者内部准备清单；未执行源字节检查、授权核实或部署验收。只记录作者填写的依据。',
    totalAssets: project.assets.assets.length, documentedAssets: assets.filter(row => row.status === 'documented').length,
    pendingAssets: ledgerError ? project.assets.assets.length : assets.filter(row => row.status !== 'documented').length, ledgerError,
    assets: assets.map(row => ({ ...row, statusLabel: WEB_ASSET_SOURCE_STATUS[row.status] })),
    publicDeployment: 'not-verified', deploymentUrl: null, permissionReview: 'owner-review-required',
    deploymentTasks: WEB_DEPLOYMENT_TASKS,
  };
}
export function formatWebReleasePreparation(project: CanonicalProject): string {
  const report = createWebReleasePreparation(project);
  return `${report.publication.name} · ${report.publication.version} · 发布准备（作者内部）\n\n${report.scope}\n源工程摘要：${report.sourceProjectDigest}\n游戏工程摘要：${report.gameProjectDigest}\n\n素材总数 ${report.totalAssets}；已记录依据且署名匹配 ${report.documentedAssets}；仍待处理 ${report.ledgerError ? '台账格式有误，无法统计' : report.pendingAssets}。\n${report.ledgerError ?? ''}\n${report.assets.map(row => `${row.name} [${row.assetId}]\n${row.digest}\n${row.statusLabel}\n来源：${row.record?.source || '待填写'}\n确认依据：${row.record?.evidence || '待核实'}\n确认人/日期：${row.record?.reviewedBy || '未填写'} / ${row.record?.reviewedOn || '未填写'}\n公开署名：${row.record?.credit || '未记录要求，仍需所有者核对'}\n`).join('\n')}\n实际部署：未验收；未填写公网地址。\n\n接下来：\n${report.deploymentTasks.map((task, i) => `${i + 1}. ${task}`).join('\n')}\n`;
}
