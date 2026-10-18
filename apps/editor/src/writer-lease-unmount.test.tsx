import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { IndexedDbProjectFileStore } from "./indexeddb-project-store";
import { StrictMode } from "react";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("writer lease component lifecycle", () => {
  it("records the actually acquired owner after StrictMode repeats initialization", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    const acquired = vi.spyOn(IndexedDbProjectFileStore.prototype, "acquire");
    const view = render(<StrictMode><App /></StrictMode>); await screen.findByRole("button", { name: "保存到本机" });
    const owner = acquired.mock.calls.at(-1)![0];
    expect(sessionStorage.getItem("world-studio.writer-owner.v1")).toBe(owner);
    view.unmount(); expect(JSON.parse(sessionStorage.getItem("world-studio.writer-owner-handoff.v1")!).ownerId).toBe(owner);
  });
  it("keeps the acquired owner in sessionStorage through ordinary renders and reload handoff", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    const acquired = vi.spyOn(IndexedDbProjectFileStore.prototype, "acquire");
    const view = render(<App />); await screen.findByRole("button", { name: "保存到本机" });
    const owner = acquired.mock.calls[0]![0];
    expect(sessionStorage.getItem("world-studio.writer-owner.v1")).toBe(owner);
    fireEvent.click(within(screen.getByRole("navigation", { name: "主要功能" })).getByRole("button", { name: "检查" }));
    expect(sessionStorage.getItem("world-studio.writer-owner.v1")).toBe(owner);
    view.unmount(); expect(JSON.parse(sessionStorage.getItem("world-studio.writer-owner-handoff.v1")!).ownerId).toBe(owner);
    acquired.mockRestore();
  });
  it("releases the active lease when the content editor unmounts", async () => {
    const indexedDb = new IDBFactory();
    vi.stubGlobal("indexedDB", indexedDb);
    const view = render(<App />);
    await screen.findByRole("button", { name: "保存到本机" });

    view.unmount();
    const contender = new IndexedDbProjectFileStore(indexedDb, "prj_twilight_broadcast");
    await waitFor(async () => {
      await expect(contender.acquire("writer_after_unmount", Date.now(), 60_000))
        .resolves.toMatchObject({ status: "acquired" });
    });
  });

  it("automatically retries after a stale writer lease expires", async () => {
    const indexedDb = new IDBFactory();
    vi.stubGlobal("indexedDB", indexedDb);
    const staleWriter = new IndexedDbProjectFileStore(indexedDb, "prj_twilight_broadcast");
    await expect(staleWriter.acquire("writer_stale_window", Date.now(), 100))
      .resolves.toMatchObject({ status: "acquired" });

    render(<App />);
    expect(await screen.findByRole("heading", { name: "此项目已在另一个窗口编辑" }))
      .toBeVisible();
    expect(screen.getByText(/届时将自动重试/)).toBeVisible();
    expect(await screen.findByRole("button", { name: "保存到本机" }, { timeout: 2_000 }))
      .toBeEnabled();
  });
});
