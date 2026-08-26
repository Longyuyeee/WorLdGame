import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";

afterEach(() => {
  globalThis.history.replaceState({}, "", "/");
});

describe("N43-E4 input equivalence and cross-view sync", () => {
  it("commits a keyboard text batch and projects the same stable statement inside the audit budget", async () => {
    globalThis.history.replaceState({}, "", "/?syncAudit=1");
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: /^选择对白：/ })[0]!);
    const editor = screen.getByLabelText("对白内容");
    const text = "N43 E4 同步审计文本";

    fireEvent.change(editor, { target: { value: text } });
    fireEvent.keyDown(editor, { key: "s", code: "KeyS", ctrlKey: true });

    const shell = screen.getByTestId("workspace-shell");
    await waitFor(() => expect(shell).toHaveAttribute("data-sync-audit-result", "pass"));
    expect(shell).toHaveAttribute("data-sync-audit-action", "patch-dialogue");
    expect(Number(shell.getAttribute("data-sync-audit-duration"))).toBeLessThanOrEqual(500);
    expect(Number(shell.getAttribute("data-sync-audit-projected-revision"))).toBeGreaterThan(Number(shell.getAttribute("data-sync-audit-source-revision")));

    fireEvent.click(screen.getByRole("tab", { name: "Script" }));
    expect((screen.getByLabelText("权威脚本编辑器") as HTMLTextAreaElement).value).toContain(text);
    expect(screen.getByTestId("preview-step")).toHaveTextContent(text);
  });

  it("exposes the same route nudge through declared keyboard and touch controls", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Flow" }));
    const node = screen.getByRole("button", { name: "路线场景：风中的天台 · scn_rooftop" });
    fireEvent.click(node);
    expect(node).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown");

    fireEvent.keyDown(node, { key: "ArrowRight", altKey: true });
    expect(node.style.getPropertyValue("--route-x")).toBe("672px");
    fireEvent.click(screen.getByRole("button", { name: "节点左移 24" }));
    expect(node.style.getPropertyValue("--route-x")).toBe("648px");
  });
});
