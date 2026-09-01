import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { resolveGalSettings } from "@world-studio/gal-settings";
import { createProject, createProjectTemplate, markProjectDirty, openProject, saveLifecycleProject, type CanonicalProject, type ProjectLifecycleSession } from "@world-studio/project-domain";
import { describe, expect, it, vi } from "vitest";
import { IndexedDbProjectWorkspace } from "./indexeddb-project-workspace";
import { SettingsWorkspace } from "./SettingsWorkspace";

function projectWithSources(): CanonicalProject {
  const project = createProjectTemplate("Settings UI", "018f08d8-71a1-7bc2-a627-2f4a843ee220");
  return {
    ...project,
    settings: {
      ...project.settings,
      project: { audio: { master: 0.7 } },
      platforms: {
        ...project.settings.platforms,
        web: { audio: { master: 0.45 } }
      }
    }
  };
}

function renderSettings(project: CanonicalProject = createProjectTemplate("Settings UI", "018f08d8-71a1-7bc2-a627-2f4a843ee221")) {
  const onProjectChange = vi.fn();
  const onSave = vi.fn();
  const onClose = vi.fn();
  const view = render(<SettingsWorkspace project={project} saveStatus="dirty" saveDetail="等待写入工程目录" onProjectChange={onProjectChange} onSave={onSave} onClose={onClose} />);
  return { ...view, onProjectChange, onSave, onClose };
}

describe("N51-E4 Settings workspace", () => {
  it("provides Basic/Advanced search, sections, platform layers, and visible inheritance sources", () => {
    const { container } = renderSettings(projectWithSources());
    expect(container.querySelectorAll("[data-setting-path]")).toHaveLength(24);
    expect(within(container.querySelector('[data-setting-path="audio.master"]') as HTMLElement).getByText("项目值")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Advanced" }));
    expect(container.querySelectorAll("[data-setting-path]")).toHaveLength(37);
    fireEvent.change(screen.getByPlaceholderText("搜索名称、说明或路径…"), { target: { value: "音量" } });
    expect(container.querySelectorAll("[data-setting-path]")).toHaveLength(7);

    fireEvent.click(screen.getByRole("radio", { name: "Web" }));
    expect(within(container.querySelector('[data-setting-path="audio.master"]') as HTMLElement).getByText("Web 覆盖")).toBeInTheDocument();
    expect(container.querySelector(".settings-layer-summary")).toHaveTextContent("1 当前层覆盖 · 0 待应用");
  });

  it("commits Stage defaults through one real Project ChangeSet", () => {
    const { onProjectChange } = renderSettings();
    fireEvent.click(screen.getByRole("radio", { name: "Advanced" }));
    fireEvent.change(screen.getByRole("combobox", { name: "设置分区" }), { target: { value: "stage" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "默认舞台时长" }), { target: { value: "720" } });
    fireEvent.change(screen.getByRole("combobox", { name: "默认舞台缓动" }), { target: { value: "ease-out" } });
    fireEvent.click(screen.getByRole("button", { name: "应用修改 · 2" }));
    const committed = onProjectChange.mock.calls.at(-1)?.[0] as CanonicalProject;
    expect(resolveGalSettings(committed.settings, "web").values.stage).toEqual({ defaultDurationMilliseconds: 720, defaultEasing: "ease-out" });
    expect(screen.getByText(/ChangeSet r1/)).toBeInTheDocument();
  });

  it("commits the accessibility section through one real Project ChangeSet", () => {
    const { container, onProjectChange } = renderSettings();
    fireEvent.change(screen.getByRole("combobox", { name: "设置分区" }), { target: { value: "accessibility" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "高对比度" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "减少动效" }));
    fireEvent.click(screen.getByRole("button", { name: "应用修改 · 2" }));

    const committed = onProjectChange.mock.calls.at(-1)?.[0] as CanonicalProject;
    expect(resolveGalSettings(committed.settings, "web").values.accessibility).toMatchObject({
      highContrast: true,
      reduceMotion: true,
      reduceFlashing: false
    });
    expect(container.querySelectorAll('[data-setting-path^="accessibility."]')).toHaveLength(3);
    expect(screen.getByText(/ChangeSet r1/)).toBeInTheDocument();
  });

  it("commits Choice and UI policies through real section ChangeSets", () => {
    const { onProjectChange, rerender } = renderSettings();
    fireEvent.change(screen.getByRole("combobox", { name: "设置分区" }), { target: { value: "choice" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "显示选项序号" }));
    fireEvent.click(screen.getByRole("radio", { name: "Advanced" }));
    fireEvent.change(screen.getByRole("combobox", { name: "选项布局" }), { target: { value: "responsive-grid" } });
    fireEvent.click(screen.getByRole("button", { name: "应用修改 · 2" }));
    const choiceCommitted = onProjectChange.mock.calls.at(-1)?.[0] as CanonicalProject;
    expect(resolveGalSettings(choiceCommitted.settings, "web").values.choice).toEqual({ showOptionNumbers: false, layout: "responsive-grid" });

    rerender(<SettingsWorkspace project={choiceCommitted} saveStatus="dirty" onProjectChange={onProjectChange} onSave={() => undefined} onClose={() => undefined} />);
    fireEvent.change(screen.getByRole("combobox", { name: "设置分区" }), { target: { value: "ui" } });
    fireEvent.change(screen.getByRole("combobox", { name: "默认对话框模板" }), { target: { value: "bubble" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "显示输入提示" }));
    fireEvent.click(screen.getByRole("button", { name: "应用修改 · 2" }));
    const uiCommitted = onProjectChange.mock.calls.at(-1)?.[0] as CanonicalProject;
    expect(resolveGalSettings(uiCommitted.settings, "web").values.ui).toEqual({ defaultTextboxTemplate: "bubble", showInputHints: false });
    expect(screen.getByText(/ChangeSet r2/)).toBeInTheDocument();
  });

  it("commits linked Android display fields in one ChangeSet and supports exact undo/redo", () => {
    const { container, onProjectChange } = renderSettings();
    fireEvent.click(screen.getByRole("radio", { name: "Android" }));
    fireEvent.click(screen.getByRole("radio", { name: "Advanced" }));
    fireEvent.change(screen.getByRole("combobox", { name: "设置分区" }), { target: { value: "display" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "设计宽度" }), { target: { value: "1080" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "设计高度" }), { target: { value: "1920" } });
    fireEvent.change(screen.getByRole("combobox", { name: "屏幕方向" }), { target: { value: "portrait" } });
    expect(container.querySelectorAll(".settings-card.is-dirty")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "应用修改 · 3" }));
    const committed = onProjectChange.mock.calls.at(-1)?.[0] as CanonicalProject;
    expect(resolveGalSettings(committed.settings, "android").values.display).toMatchObject({ designWidth: 1080, designHeight: 1920, orientation: "portrait" });
    expect(screen.getByText(/ChangeSet r1/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    const undone = onProjectChange.mock.calls.at(-1)?.[0] as CanonicalProject;
    expect(resolveGalSettings(undone.settings, "android").values.display.orientation).toBe("landscape");
    fireEvent.click(screen.getByRole("button", { name: "重做" }));
    const redone = onProjectChange.mock.calls.at(-1)?.[0] as CanonicalProject;
    expect(resolveGalSettings(redone.settings, "android").values.display).toMatchObject({ designWidth: 1080, designHeight: 1920, orientation: "portrait" });
  });

  it("keeps an invalid linked-field draft visible and leaves the canonical project unchanged", () => {
    const { onProjectChange } = renderSettings();
    fireEvent.click(screen.getByRole("radio", { name: "Android" }));
    fireEvent.change(screen.getByRole("combobox", { name: "设置分区" }), { target: { value: "display" } });
    fireEvent.change(screen.getByRole("combobox", { name: "屏幕方向" }), { target: { value: "portrait" } });
    fireEvent.click(screen.getByRole("button", { name: "应用修改 · 1" }));

    expect(screen.getByRole("alert")).toHaveTextContent("INVALID_SETTINGS");
    expect(screen.getByRole("alert")).toHaveTextContent("settings.platforms.android.display");
    expect(screen.getByRole("combobox", { name: "屏幕方向" })).toHaveValue("portrait");
    expect(onProjectChange).not.toHaveBeenCalled();
  });

  it("resets the current layer atomically and exposes save/close feedback actions", () => {
    const { onProjectChange, onSave, onClose } = renderSettings(projectWithSources());
    fireEvent.click(screen.getByRole("button", { name: "恢复项目默认" }));
    const reset = onProjectChange.mock.calls.at(-1)?.[0] as CanonicalProject;
    expect(resolveGalSettings(reset.settings, "windows").values.audio.master).toBe(1);
    expect(screen.getByText(/项目层恢复默认已提交/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存工程" }));
    fireEvent.click(screen.getByRole("button", { name: "返回创作" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("persists a UI-authored platform ChangeSet through the managed workspace and reopens it exactly", async () => {
    const indexedDb = new IDBFactory();
    const workspace = new IndexedDbProjectWorkspace(indexedDb, "n51_e4_settings_ui", "N51 E4 Settings UI");
    const created = await createProject(workspace, "Settings UI persistence", "018f08d8-71a1-7bc2-a627-2f4a843ee222");
    let currentProject = created.project!;
    let savedSession: ProjectLifecycleSession | undefined;
    render(<SettingsWorkspace
      project={currentProject}
      saveStatus="dirty"
      onProjectChange={(project) => { currentProject = project; }}
      onSave={() => {
        void saveLifecycleProject(workspace, markProjectDirty(created, currentProject)).then((session) => { savedSession = session; });
      }}
      onClose={() => undefined}
    />);

    fireEvent.click(screen.getByRole("radio", { name: "Web" }));
    fireEvent.change(screen.getByRole("combobox", { name: "设置分区" }), { target: { value: "audio" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "主音量" }), { target: { value: "0.45" } });
    fireEvent.click(screen.getByRole("button", { name: "应用修改 · 1" }));
    fireEvent.click(screen.getByRole("button", { name: "保存工程" }));

    await waitFor(() => expect(savedSession?.dirty).toBe(false));
    const reopened = await openProject(workspace);
    expect(reopened.project?.settings.platforms.web.audio?.master).toBe(0.45);
    expect(resolveGalSettings(reopened.project!.settings, "web").sources["audio.master"]).toBe("web");
  });
});
