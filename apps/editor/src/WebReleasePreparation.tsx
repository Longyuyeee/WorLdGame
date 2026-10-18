import { useState } from 'react';
import { WEB_ASSET_SOURCE_STATUS, type CanonicalProject, type WebAssetSourceStatus } from '@world-studio/project-domain';
import { createWebReleasePreparation, formatWebReleasePreparation } from './web-release-preparation';
import { SOURCE_REVIEW_ACTIONS, type WebSourceReviewTarget } from './web-asset-source-workflow';
import './styles/web-asset-sources.css';

export function WebReleasePreparation({ project, disabled, onOpen }: { project: CanonicalProject; disabled: boolean; onOpen: (target?: WebSourceReviewTarget) => void }) {
  const report = createWebReleasePreparation(project), [error, setError] = useState('');
  return <section className="web-release-preparation" aria-label="许可与上线准备">
    <h3>许可与上线准备</h3><p>{report.ledgerError ? '来源台账格式有误，请修复。' : `${report.totalAssets} 项素材 · ${report.documentedAssets} 项已记录依据并匹配署名 · ${report.pendingAssets} 项仍待处理`}</p>
    <p>游戏可以继续导出用于本地验证；生成成功不代表素材已获授权或公网已验收。来源依据、联系人等内部信息不会进入玩家游戏。</p>
    <div><button type="button" disabled={disabled} onClick={() => onOpen()}>核对素材来源</button><button type="button" disabled={disabled} onClick={() => {
      let href: string | undefined;
      try { href = URL.createObjectURL(new Blob([formatWebReleasePreparation(project)], { type: 'text/plain;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = href; anchor.download = `${report.publication.name.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '-')}-发布准备.txt`; anchor.click(); setError(''); }
      catch (reason) { setError(`清单下载失败，请重试：${String(reason)}`); }
      finally { if (href) { const revoke = href; setTimeout(() => URL.revokeObjectURL(revoke), 1000); } }
    }}>下载发布准备清单（内部）</button></div>
    {!report.ledgerError && <details className="web-source-review-queue"><summary>按问题处理素材（{report.pendingAssets} 项待处理）</summary><ul aria-label="素材准备事项">{(Object.keys(WEB_ASSET_SOURCE_STATUS) as WebAssetSourceStatus[]).map(status => {
      const assets = report.assets.filter(row => row.status === status);
      return <li key={status}><button type="button" disabled={disabled || assets.length === 0} onClick={() => onOpen({ status, assetId: assets[0]?.assetId })}>{WEB_ASSET_SOURCE_STATUS[status]} · {assets.length} 项</button><small>{SOURCE_REVIEW_ACTIONS[status]}</small></li>;
    })}</ul></details>}
    <details><summary>接下来如何部署和验收</summary><ol>{report.deploymentTasks.map(task => <li key={task}>{task}</li>)}</ol><small>当前没有实际部署地址/验收记录。清单不替你勾选完成。</small></details>
    {error && <p role="alert">{error}</p>}
  </section>;
}
