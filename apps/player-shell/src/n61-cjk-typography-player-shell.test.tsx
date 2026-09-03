import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { loadProject, migrateS0Project, type CanonicalProject, type S0Project } from "@world-studio/project-domain";
import { PlayerShell } from "./PlayerShell";

function cjkTypographyProject(): CanonicalProject {
  const source = JSON.parse(readFileSync(join(process.cwd(), "fixtures/projects/cjk/project.s0.json"), "utf8")) as S0Project;
  const migrated = loadProject(migrateS0Project(source).files);
  const scene = migrated.scripts.cjk_start!;
  return {
    ...migrated,
    manifest: { ...migrated.manifest, projectId: "player_cjk_typography", defaultLocale: "ja" },
    assets: { ...migrated.assets, assets: [{ assetId: "font_ja_missing", kind: "font", displayName: "Project Japanese", mimeType: "font/woff2", fontFamily: "Project Japanese", locales: ["ja"] }] },
    scripts: { ...migrated.scripts, cjk_start: { ...scene, statements: [
      { id: "cjk_ruby", kind: "narration", textId: "cjk_ruby_text", text: "黄昏の｜放送室《ほうそうしつ》で、彼女は「まだ帰らない」と静かに言った。これはスマートフォンでも禁則を保って読むための長い文章です。" },
      { id: "cjk_end", kind: "end", endingName: "再会" }
    ] } }
  };
}

describe("N61-E4 CJK Player typography path", () => {
  it("renders authored Ruby semantically, applies strict locale typography, and explains a failed project-font fallback", async () => {
    const project = cjkTypographyProject();
    const { container } = render(<PlayerShell project={project} mediaAssets={[{
      assetId: "font_ja_missing",
      displayName: "Project Japanese",
      mimeType: "font/woff2",
      url: "https://invalid.example.test/project-japanese.woff2"
    }]} />);

    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));

    expect(screen.getByText("放送室").closest("ruby")).toHaveAttribute("lang", "ja");
    expect(screen.getByText("ほうそうしつ")).toHaveProperty("tagName", "RT");
    const text = container.querySelector(".player-dialogue__text");
    expect(text).toHaveAttribute("lang", "ja");
    expect(text).toHaveAttribute("data-cjk-line-break", "strict");
    const fontStatus = await screen.findByRole("status", { name: "字体状态" });
    expect(fontStatus).toHaveTextContent("Project Japanese 加载失败，已回退");
    expect(fontStatus.closest(".player-playback-controls")).toBeNull();
    expect(container.querySelector(".player-shell")).toHaveAttribute("data-player-font", "fallback");
  });
});
