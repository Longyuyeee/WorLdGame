import { useState } from "react";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { loadProject, migrateS0Project, type S0Project } from "@world-studio/project-domain";
import branching from "../../../fixtures/projects/branching/project.s0.json";
import { AtlasExportSettings } from "./AtlasExportSettings";
import { setAtlasExportGroups } from "./atlas-export";
afterEach(cleanup);
const source = () => loadProject(migrateS0Project(branching as S0Project).files);
describe("Atlas export author controls", () => {
  it("lists published groups and preserves explicit selection across refresh", async () => {
    function Harness() { const [project, setProject] = useState(source()); return <AtlasExportSettings project={project} onChange={setProject} disabled={false} reader={reader} />; }
    const reader = { loadLifecycle: async () => ({ roots: [{ rootId: "build:dicing:group1" }, { rootId: "other" }] }) };
    render(<Harness />);
    const checkbox = await screen.findByRole("checkbox", { name: "Atlas 兼容导出组：group1" });
    fireEvent.click(checkbox); expect(checkbox).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "刷新已发布 Atlas 组" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Atlas 兼容导出组：group1" })).toBeChecked());
  });
  it("shows missing migrated selections and permits opting out", async () => {
    let latest = setAtlasExportGroups(source(), ["missing"]);
    render(<AtlasExportSettings project={latest} onChange={p => { latest = p; }} disabled={false} reader={null} />);
    expect(screen.getByText(/本机派生缺失/)).toBeVisible(); fireEvent.click(screen.getByRole("checkbox", { name: "Atlas 兼容导出组：missing" }));
    expect(latest.manifest.preservedFields?.atlasExportGroups).toEqual([]);
  });
  it("blocks changes and refresh while building or editing unpublished drafts", () => {
    render(<AtlasExportSettings project={setAtlasExportGroups(source(), ["group1"])} onChange={() => { throw Error("must remain disabled"); }} disabled reader={null} />);
    screen.getAllByRole("checkbox").forEach(checkbox => expect(checkbox).toBeDisabled()); expect(screen.getByRole("button")).toBeDisabled();
  });
});
