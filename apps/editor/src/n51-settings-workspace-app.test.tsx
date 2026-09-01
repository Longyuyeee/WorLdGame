import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { createProjectTemplate, type CanonicalProject } from "@world-studio/project-domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => vi.unstubAllGlobals());

describe("N51-E4 settings workspace App integration", () => {
  it("keeps the contextual 16:9 preview and saves the exact canonical settings project", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    const canonical = createProjectTemplate("N51 settings App", "018f08d8-71a1-7bc2-a627-2f4a843ee223");
    const onCanonicalProjectChange = vi.fn<(project: CanonicalProject) => void>();
    const onCanonicalProjectSave = vi.fn(async (_project: CanonicalProject) => undefined);
    const view = render(<App
      initialProject={canonical}
      autosaveDebounceMs={60_000}
      onCanonicalProjectChange={onCanonicalProjectChange}
      onCanonicalProjectSave={onCanonicalProjectSave}
    />);

    await waitFor(() => expect(screen.getByRole("button", { name: "保存到本机" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "项目设置" }));
    expect(screen.getByRole("heading", { name: "项目设置" })).toBeVisible();
    expect(screen.getByTestId("workspace-shell")).toHaveAttribute("data-settings-open", "true");
    expect(view.container.querySelector("[data-preview-profile]")).toHaveAttribute("data-preview-profile", "landscape-16-9");

    fireEvent.click(screen.getByRole("radio", { name: "Web" }));
    fireEvent.change(screen.getByRole("combobox", { name: "设置分区" }), { target: { value: "audio" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "主音量" }), { target: { value: "0.4" } });
    fireEvent.click(screen.getByRole("button", { name: "应用修改 · 1" }));
    await waitFor(() => expect(onCanonicalProjectChange).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "保存工程" }));
    await waitFor(() => expect(onCanonicalProjectSave).toHaveBeenCalledTimes(1));
    expect(onCanonicalProjectSave.mock.calls[0]?.[0].settings.platforms.web.audio?.master).toBe(0.4);
    expect(onCanonicalProjectSave.mock.calls[0]?.[0].manifest.projectId).toBe(canonical.manifest.projectId);
  });
});
