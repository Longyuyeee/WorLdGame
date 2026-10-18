import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { createProjectTemplate, type CanonicalProject } from "@world-studio/project-domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => vi.unstubAllGlobals());

describe("N51-E4 settings workspace App integration", () => {
  it("uses a separate appearance page and saves the exact canonical settings project", async () => {
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
    fireEvent.click(within(screen.getByRole("navigation", { name: "主要功能" })).getByRole("button", { name: "游戏外观" }));
    expect(screen.getByRole("heading", { name: "游戏外观与体验" })).toBeVisible();
    expect(screen.getByTestId("workspace-shell")).toHaveAttribute("data-settings-open", "true");
    expect(view.container.querySelector("[data-preview-profile]")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Web" }));
    fireEvent.change(screen.getByRole("combobox", { name: "设置分区" }), { target: { value: "audio" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "主音量" }), { target: { value: "0.4" } });
    expect(screen.getByRole("navigation", { name: "主要功能" })).toHaveTextContent("发布");
    expect(screen.getByRole("button", { name: "发布" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "应用修改 · 1" }));
    await waitFor(() => expect(onCanonicalProjectChange).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "保存工程" }));
    await waitFor(() => expect(onCanonicalProjectSave).toHaveBeenCalledTimes(1));
    expect(onCanonicalProjectSave.mock.calls[0]?.[0].settings.platforms.web.audio?.master).toBe(0.4);
    expect(onCanonicalProjectSave.mock.calls[0]?.[0].manifest.projectId).toBe(canonical.manifest.projectId);
  });
});
