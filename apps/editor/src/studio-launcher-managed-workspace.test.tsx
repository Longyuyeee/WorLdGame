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
    const quickRoute = await screen.findByRole("button", { name: "快速查看 E8b Managed Story Route" });
    fireEvent.click(quickRoute);

    expect(await screen.findByRole("region", { name: "Route 快速概览" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "E8b Managed Story · Route" })).toBeVisible();
    expect(screen.getByText(/仅载入工程结构和当前布局窗口/)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(/其中 layout 1；未执行 full read/);
    expect(screen.getByRole("button", { name: "下一窗口" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "加载完整工程" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "E8b Managed Story" })).toBeVisible());
    expect(screen.getAllByText("浏览器事务工作区/E8b Managed Story")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "进入编辑器" })).toBeEnabled();
  });
});
