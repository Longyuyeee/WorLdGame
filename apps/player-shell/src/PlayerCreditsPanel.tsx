import type { RefObject } from 'react';
import type { WebCredits, WebPlayerSkin } from '@world-studio/project-domain';
import { playerScreenProps } from './player-screen-skin';
import './player-credits.css';

export function PlayerCreditsPanel({ credits, title, panel, close, skin }: { credits: WebCredits; title: string; panel: RefObject<HTMLDivElement | null>; close: () => void; skin?: WebPlayerSkin | undefined }) {
  return <div {...playerScreenProps(skin, 'credits')} ref={panel} className="player-preferences player-credits" role="dialog" aria-modal="true" aria-labelledby="player-credits-heading">
    <header><div><span className="player-credits__eyebrow">{title}</span><h2 id="player-credits-heading">制作名单与致谢</h2></div><button type="button" onClick={close}>返回游戏</button></header>
    {credits.studio && <h3 className="player-credits__studio">{credits.studio}</h3>}
    {credits.website && <a className="player-credits__website" href={credits.website} target="_blank" rel="noopener noreferrer">访问作品网站 ↗</a>}
    {credits.entries.length > 0 && <section aria-label="制作人员"><h3>制作人员</h3><dl>{credits.entries.map((entry, i) => <div key={i}><dt>{entry.role}</dt><dd>{entry.url ? <a href={entry.url} target="_blank" rel="noopener noreferrer">{entry.name}<span aria-hidden="true"> ↗</span></a> : entry.name}</dd></div>)}</dl></section>}
    {credits.acknowledgements && <section><h3>素材与特别鸣谢</h3><p className="player-credits__text">{credits.acknowledgements}</p></section>}
    {credits.copyright && <footer><p className="player-credits__text">{credits.copyright}</p></footer>}
  </div>;
}
