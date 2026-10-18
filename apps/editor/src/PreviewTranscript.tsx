import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';

/** Author-only readable copy. The Player owns the final game's dialogue layout. */
export function PreviewTranscript({ sceneId, statementId, template, highContrast, reduceMotion, style, children }: {
  sceneId: string; statementId: string; template: string; highContrast: boolean; reduceMotion: boolean;
  style: CSSProperties; children: ReactNode;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = scroll.current;
    if (node) node.scrollTop = template === 'nvl' ? node.scrollHeight : 0;
  }, [sceneId, statementId, template]);
  return <section className="preview-transcript" aria-label="作者校订正文" data-high-contrast={highContrast} data-reduce-motion={reduceMotion} style={style}>
    <div ref={scroll} className="stage-content" tabIndex={0} role="region" aria-label="可滚动的试玩正文" data-testid="preview-step" data-scene-id={sceneId} data-statement-id={statementId}>{children}</div>
    <small>作者校订视图：舞台与正文分开显示，不改变成品游戏排版。</small>
  </section>;
}
