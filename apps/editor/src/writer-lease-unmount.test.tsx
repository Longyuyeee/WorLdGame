import { render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { IndexedDbProjectFileStore } from "./indexeddb-project-store";

afterEach(() => vi.unstubAllGlobals());

describe("writer lease component lifecycle", () => {
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
});
