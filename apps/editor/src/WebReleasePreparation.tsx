import { useMemo, useState } from 'react';
import { WEB_ASSET_SOURCE_STATUS, type CanonicalProject, type WebAssetSourceStatus } from '@world-studio/project-domain';
import { createWebReleasePreparation, formatWebReleasePreparation } from './web-release-preparation';
import { SOURCE_REVIEW_ACTIONS, type WebSourceReviewTarget } from './web-asset-source-workflow';
import { type WebReleaseReviewInput } from './web-release-review';
import './styles/web-asset-sources.css';

export function WebReleasePreparation({ project, disabled, onOpen, review, onReview, onPlaytest }: { project: CanonicalProject; disabled: boolean; onOpen: (target?: WebSourceReviewTarget) => void; review?: WebReleaseReviewInput; onReview?: (() => void) | undefined; onPlaytest?: (() => void) | undefined }) {
  const report = useMemo(() => createWebReleasePreparation(project, review), [project, review?.notes, review?.completions, review?.notesError, review?.progressError]), [error, setError] = useState('');
  const notes = report.review.notes, playtest = report.review.playtest;
  return <section className="web-release-preparation" aria-label="许可与上线准备">
    <h3>许可与上线准备</h3><p>{report.ledgerError ? '来源台账格式有误，请修复。' : `${report.totalAssets} 项素材 · ${report.documentedAssets} 项已记录依据并匹配署名 · ${report.pendingAssets} 项仍待处理`}</p>
    <p>游戏可以继续导出用于本地验证；生成成功不代表素材已获授权或公网已验收。来源依据、联系人等内部信息不会进入玩家游戏。</p>
    <section className="web-release-review-summary" aria-label="文字演出与路线准备">
      <h4>先核对作品，再准备上线</h4>
      <p>{notes.availability === 'not-included' ? '本次未提供校订记录，不能判断是否还有待办。' : notes.availability === 'incomplete' ? `校订记录不完整 · 当前可用 ${notes.total} 条，不能判断全部待办。` : !notes.total ? '没有校订记录，不代表人工审稿通过。' : `校订 ${notes.total} 条 · ${notes.pending} 条待跟进（待修改 ${notes.states.open} · 待复核 ${notes.states.fixed} · 内容已变 ${notes.states.recheck}）`}</p>
      <p>{playtest.availability === 'not-included' ? '本次未提供试玩进度。' : playtest.availability === 'incomplete' ? '试玩记录不完整，不能判断全部到达情况。' : playtest.inventory === 'unavailable' ? '暂无可列出的结局，请先完成故事检查。' : `当前稿从开头到达 ${playtest.reached} / ${playtest.totalEndings} 个结局 · 旧稿 ${playtest.olderRecords} 条不计入`}</p>
      {(notes.error || playtest.error) && <p role="alert">记录不完整，以下只汇总当前可用记录。{notes.error} {playtest.error}</p>}
      {notes.missingLocations > 0 && <p>{notes.missingLocations} 条记录的原位置已删除，仍需在检查页核对。</p>}
      <div>{onReview && <button type="button" disabled={disabled} onClick={onReview}>处理文字与演出</button>}{onPlaytest && <button type="button" disabled={disabled} onClick={onPlaytest}>从头检查未完成路线</button>}</div>
      <small>清单按当前场景顺序列出问题、当前内容和未完成结局，含剧透。到达不代表自然阅读或听感通过；换机请保留制作交付包及所需原始记录。</small>
    </section>
    <div><button type="button" disabled={disabled} onClick={() => onOpen()}>核对素材来源</button><button type="button" disabled={disabled} onClick={() => {
      let href: string | undefined;
      try { href = URL.createObjectURL(new Blob([formatWebReleasePreparation(project, review)], { type: 'text/plain;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = href; anchor.download = `${report.publication.name.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '-')}-发布准备.txt`; anchor.click(); setError(''); }
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
