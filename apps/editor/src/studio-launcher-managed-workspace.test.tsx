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
    fireEvent.click(screen.getByRole("button", { name: "编辑场景 Start" }));
    const lazyEditor = await screen.findByLabelText("单场景权威脚本编辑器") as HTMLTextAreaElement;
    expect(lazyEditor.value).toContain('end "Ending"');
    expect(screen.getByText(/全局编辑索引：.*revision 已对齐/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Sequence 视图" }));
    fireEvent.click(screen.getByRole("button", { name: /选择结局：Ending/ }));
    fireEvent.change(screen.getByLabelText("局部 Sequence 结局名称"), { target: { value: "Closed loop ending" } });
    fireEvent.click(screen.getByRole("button", { name: "应用 Sequence 内容" }));
    fireEvent.click(screen.getByRole("button", { name: "Script 视图" }));
    expect((screen.getByLabelText("单场景权威脚本编辑器") as HTMLTextAreaElement).value).toContain('end "Closed loop ending"');
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect((screen.getByLabelText("单场景权威脚本编辑器") as HTMLTextAreaElement).value).toContain('end "Ending"');
    fireEvent.click(screen.getByRole("button", { name: "重做" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "保存当前场景" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "保存当前场景" }));
    expect(await screen.findByText(/单场景已原子保存；Route 派生视图已失效/)).toBeVisible();
    expect(screen.getByRole("button", { name: "编辑场景 Start" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "加载完整工程" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "E8b Managed Story" })).toBeVisible());
    expect(screen.getAllByText("浏览器事务工作区/E8b Managed Story")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "进入编辑器" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "进入编辑器" }));
    fireEvent.click(screen.getByRole("button", { name: "进入内容编辑器" }));
    fireEvent.click(await screen.findByRole("tab", { name: "Script" }));
    expect((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value).toContain("Closed loop ending");
  });
});
