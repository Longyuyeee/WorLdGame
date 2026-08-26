import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { IndexedDbProjectFileStore } from "./indexeddb-project-store";

afterEach(() => vi.unstubAllGlobals());

describe("N43-E1b workspace context product loop", () => {
  it("switches mode, saves, closes, and reopens the same Selection/Inspector/Runtime stable-ID", async () => {
    const indexedDb = new IDBFactory();
    vi.stubGlobal("indexedDB", indexedDb);
    const first = render(<App autosaveDebounceMs={60_000} />);
    await screen.findByRole("button", { name: "保存到本机" });

    const projectSearch = screen.getByRole("searchbox", { name: "全局搜索" });
    fireEvent.change(projectSearch, { target: { value: "风中的天台" } });
    fireEvent.click(await screen.findByRole("option", { name: /打开场景 · 风中的天台/ }));
    fireEvent.click(screen.getByRole("button", { name: /选择对白：留言里提到的那颗星/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Director" }));

    const beforeSave = screen.getByTestId("workspace-shell");
    expect(beforeSave).toHaveAttribute("data-context-scene-id", "scn_rooftop");
    expect(beforeSave).toHaveAttribute("data-context-statement-id", "stmt_rooftop_001");
    expect(beforeSave).toHaveAttribute("data-inspector-object-id", "stmt_rooftop_001");
    expect(beforeSave).toHaveAttribute("data-runtime-statement-id", "stmt_rooftop_001");
    fireEvent.click(screen.getByRole("button", { name: "保存到本机" }));
    expect(await screen.findByRole("button", { name: "已保存 · s1" })).toBeVisible();
    first.unmount();

    const contender = new IndexedDbProjectFileStore(indexedDb, "prj_twilight_broadcast");
    await waitFor(async () => {
      const acquisition = await contender.acquire("n43_reopen_probe", Date.now(), 10_000);
      expect(acquisition.status).toBe("acquired");
      if (acquisition.status === "acquired") await contender.release(acquisition.lease);
    });

    render(<App autosaveDebounceMs={60_000} />);
    expect(await screen.findByRole("button", { name: "已恢复 · s1" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Director" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("heading", { name: "风中的天台" })).toBeVisible();
    expect(screen.getByRole("button", { name: /选择对白：留言里提到的那颗星/ })).toHaveClass("is-active");
    const reopened = screen.getByTestId("workspace-shell");
    expect(reopened).toHaveAttribute("data-editor-view", "sequence");
    expect(reopened).toHaveAttribute("data-context-restore-status", "restored");
    expect(reopened).toHaveAttribute("data-context-scene-id", "scn_rooftop");
    expect(reopened).toHaveAttribute("data-context-statement-id", "stmt_rooftop_001");
    expect(reopened).toHaveAttribute("data-inspector-object-id", "stmt_rooftop_001");
    expect(reopened).toHaveAttribute("data-runtime-scene-id", "scn_rooftop");
    expect(reopened).toHaveAttribute("data-runtime-statement-id", "stmt_rooftop_001");
    expect(screen.getByLabelText("统一工作上下文")).toHaveTextContent("stmt_rooftop_001");
  }, 30_000);
});
