import { useState } from "react";
import type { WebPlayerSkin } from "@world-studio/project-domain";
import type { PlayerMediaAssetSourceV1 } from "./player-presentation-adapter";
export function PlayerDialogueIdentity({ speakerId, name, skin, media }: { speakerId: string; name: string; skin: WebPlayerSkin | undefined; media: readonly PlayerMediaAssetSourceV1[] }) {
  const [failedUrl, setFailedUrl] = useState("");
  const template = skin?.template;
  if (!template) return <strong className="player-dialogue__speaker">{name}</strong>;
  const binding = template.portrait.enabled ? template.portrait.bindings.find(row => row.characterId === speakerId) : undefined;
  const image = binding ? media.find(row => row.assetId === binding.assetId && ["image/png", "image/jpeg", "image/webp"].includes(row.mimeType)) : undefined;
  return <span className="player-dialogue__identity" data-name-mode={template.name.mode} data-name-align={template.name.align} data-portrait-side={template.portrait.side} data-name-frame={template.name.mode === "badge" && !!template.name.backgroundAssetId && template.frames.name.enabled}>
    {binding && <span className="player-dialogue__portrait" data-portrait-character={speakerId} data-portrait-image={!!image && failedUrl !== image.url} aria-hidden="true"><span>{Array.from(name)[0] ?? "?"}</span>{image && failedUrl !== image.url && <img src={image.url} alt="" style={{ objectFit: template.portrait.fit }} onError={() => setFailedUrl(image.url)} />}</span>}
    <strong className="player-dialogue__speaker">{name}</strong>
  </span>;
}
