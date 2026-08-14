import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createProjectTemplate, saveProject, type ProjectLifecycleSession, type ProjectReference } from "@world-studio/project-domain";
import { describe, expect, it, vi } from "vitest";
import { ProjectHome, type ProjectHomeActions } from "./project-home";

const reference: ProjectReference = { referenceId: "ref", hostKind: "web-opfs", displayLocation: "OPFS/My Story", permissionKey: "permission" };
const project = createProjectTemplate("My Story", "018f08d8-71a1-7bc2-a627-2f4a843ee130");
const session: ProjectLifecycleSession = { project, projectId: project.manifest.projectId, title: "My Story", schemaVersion: 1, reference, hostVersion: "1", baseHash: "hash", baseFiles: saveProject(project), dirty: false, recovery: "clean", access: "editable" };
const actions = (): ProjectHomeActions => ({ create: vi.fn(async () => session), openDirectory: vi.fn(async () => session), openRecent: vi.fn(async () => session), openExample: vi.fn(async () => session), importArchive: vi.fn(async () => session), exportArchive: vi.fn(async () => undefined) });

describe("Project Home", () => {
  it("exposes every lifecycle entry and project status before entering", async () => {
    const api = actions(); const enter = vi.fn();
    render(<ProjectHome recent={[{ reference, projectId: project.manifest.projectId, title: "Recent", lastOpenedAtMs: 1 }]} actions={api} onEnter={enter} />);
    expect(screen.getByRole("main", { name: "项目首页" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "打开示例工程" }));
    expect(await screen.findByRole("heading", { name: "My Story" })).toBeVisible();
    expect(screen.getAllByText("OPFS/My Story")).toHaveLength(2);
    expect(screen.getByText("已同步")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "导出 ZIP" }));
    await waitFor(() => expect(api.exportArchive).toHaveBeenCalledWith(session));
    fireEvent.click(screen.getByRole("button", { name: "进入编辑器" }));
    expect(enter).toHaveBeenCalledWith(session);
  });
  it("creates a named project instead of using a fixed sample ID", async () => {
    const api = actions();
    render(<ProjectHome recent={[]} actions={api} onEnter={() => undefined} />);
    fireEvent.change(screen.getByLabelText("项目名称"), { target: { value: "Original Project" } });
    fireEvent.click(screen.getByRole("button", { name: "新建工程" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith("Original Project"));
    expect(screen.getByText(/仅保存位置引用和权限键/)).toBeVisible();
  });
});
