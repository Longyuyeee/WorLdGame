import { expect, it } from "vitest";
import { applyWebPlayerAppearance, createProjectTemplate, DEFAULT_WEB_PLAYER_APPEARANCE, defaultWebPlayerSkin, defaultWebPlayerScreens, isWebPlayerSkin, loadProject, readWebPlayerAppearance, saveProject } from "./index";

it("roundtrips per-page panels and ending text while preserving older skins and the story", () => {
  const project = createProjectTemplate("Pages", "018f08d8-71a1-7bc2-a627-2f4a843ee199"), skin = defaultWebPlayerSkin(), screens = defaultWebPlayerScreens();
  expect(isWebPlayerSkin(skin)).toBe(true);
  const customized = { ...skin, screens: { ...screens, saveColumns: 3 as const, panels: { ...screens.panels, save: { ...screens.panels.save, width: 1040, radius: 16 } }, ending: { ...screens.ending, returnLabel: "合上回信" } } };
  const restored = loadProject(saveProject(applyWebPlayerAppearance(project, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin: customized })));
  expect(readWebPlayerAppearance(restored)?.skin).toEqual(customized);
  expect(restored.scripts).toEqual(project.scripts);
  expect(readWebPlayerAppearance(applyWebPlayerAppearance(project, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin }))?.skin).not.toHaveProperty("screens");
});
it("rejects invalid page geometry, unknown styling, missing panels and unusable ending labels", () => {
  const skin = defaultWebPlayerSkin(), screens = defaultWebPlayerScreens();
  for (const invalid of [
    { ...screens, saveColumns: "3" }, { ...screens, saveColumns: 0 },
    { ...screens, panels: { ...screens.panels, save: { ...screens.panels.save, width: 4000 } } },
    { ...screens, panels: { ...screens.panels, save: { ...screens.panels.save, css: "display:none" } } },
    { ...screens, panels: { save: screens.panels.save } },
    { ...screens, ending: { ...screens.ending, returnLabel: " " } }
  ]) expect(isWebPlayerSkin({ ...skin, screens: invalid })).toBe(false);
});
