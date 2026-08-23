import { IDBFactory } from "fake-indexeddb";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioLauncher } from "./studio-launcher";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("E8b Studio Launcher managed workspace", () => {
  it("creates an atomic managed project and reopens the same commit from Recent", async () => {
    const indexedDb = new IDBFactory();
    const recentStorage = new Map<string, string>();
    let serial = 0;
    vi.stubGlobal("indexedDB", indexedDb);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => recentStorage.get(key) ?? null,
      setItem: (key: string, value: string) => { recentStorage.set(key, value); },
      clear: () => recentStorage.clear()
    });
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => `018f08d8-71a1-7bc2-a627-${String(++serial).padStart(12, "0")}`) });
    const first = render(<StudioLauncher />);

    fireEvent.change(screen.getByLabelText("项目名称"), { target: { value: "E8b Managed Story" } });
    fireEvent.click(screen.getByRole("button", { name: "新建工程" }));

    expect(await screen.findByRole("heading", { name: "E8b Managed Story" })).toBeVisible();
    expect(screen.getAllByText("浏览器事务工作区/受管工程")).toHaveLength(2);
    expect(screen.getByText("可编辑")).toBeVisible();
    first.unmount();

    render(<StudioLauncher />);
    const recent = await screen.findByRole("button", { name: /E8b Managed Story/ });
    fireEvent.click(recent);

    await waitFor(() => expect(screen.getByRole("heading", { name: "E8b Managed Story" })).toBeVisible());
    expect(screen.getAllByText("浏览器事务工作区/E8b Managed Story")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "进入编辑器" })).toBeEnabled();
  });
});
