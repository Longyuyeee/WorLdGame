import { useEffect, useMemo, useState } from "react";
import type { CanonicalProject, WebPlayerSkin } from "@world-studio/project-domain";
import { resolvePlayerTypographyV1, type PlayerTypographyProfileV1 } from "./player-typography";
import type { PlayerMediaAssetSourceV1 } from "./player-presentation-adapter";

type FontStatus = "system" | "loading" | "ready" | "fallback";
export function usePlayerSkinFonts(body: PlayerTypographyProfileV1, project: CanonicalProject, sources: readonly PlayerMediaAssetSourceV1[], skin: WebPlayerSkin | undefined) {
  const title = skin?.fonts.title ?? "inherit", name = skin?.fonts.name ?? "inherit", ui = skin?.fonts.ui ?? "inherit";
  const profiles = useMemo(() => ({ body, ...Object.fromEntries(Object.entries({ title, name, ui }).map(([role, selection]) => [role, selection === "inherit" ? body : resolvePlayerTypographyV1(body.locale, project.assets.assets, sources, selection)])) }) as Record<"body" | "title" | "name" | "ui", PlayerTypographyProfileV1>, [body, project.assets.assets, sources, title, name, ui]);
  const [loaded, setLoaded] = useState<Record<string, FontStatus>>({});
  useEffect(() => {
    let active = true;
    const faces: FontFace[] = [], fontSet = globalThis.document?.fonts;
    const fonts = [...new Map(Object.values(profiles).flatMap(profile => profile.projectFont ? [[profile.projectFont.runtimeFamily, profile.projectFont] as const] : [])).values()];
    setLoaded(Object.fromEntries(fonts.map(font => [font.runtimeFamily, "loading"])));
    for (const font of fonts) {
      const update = (status: FontStatus) => { if (active) setLoaded(current => ({ ...current, [font.runtimeFamily]: status })); };
      if (!globalThis.FontFace || !fontSet) { update("fallback"); continue; }
      try {
        const face = new FontFace(font.runtimeFamily, `url(${JSON.stringify(font.url)})`);
        void face.load().then(ready => { if (!active) return; faces.push(ready); fontSet.add(ready); update("ready"); }).catch(() => update("fallback"));
      } catch { update("fallback"); }
    }
    return () => { active = false; for (const face of faces) fontSet?.delete(face); };
  }, [profiles]);
  const status = (profile: PlayerTypographyProfileV1): FontStatus => profile.projectFont ? loaded[profile.projectFont.runtimeFamily] ?? "loading" : "system";
  const families = Object.fromEntries(Object.entries(profiles).map(([role, profile]) => [role, profile.projectFont && status(profile) === "ready" ? `"${profile.projectFont.runtimeFamily}", ${profile.fallbackStack}` : profile.fallbackStack])) as Record<keyof typeof profiles, string>;
  const captureFonts = useMemo(() => [...new Map(Object.values(profiles).flatMap(profile => profile.projectFont && loaded[profile.projectFont.runtimeFamily] === "ready" ? [[profile.projectFont.runtimeFamily, profile.projectFont] as const] : [])).values()], [profiles, loaded]);
  return { families, captureFonts, bodyStatus: status(body), failedRoles: Object.entries(profiles).filter(([, profile]) => status(profile) === "fallback").map(([role]) => role) };
}
