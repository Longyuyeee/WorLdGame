import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectConflictPanel } from "./project-conflict-panel";

describe("ProjectConflictPanel", () => {
  it("shows incremental paths and explicit three-way resolution choices", () => {
    const keep = vi.fn(); const reload = vi.fn(); const cancel = vi.fn();
    render(<ProjectConflictPanel changedPaths={["scripts/scene.json", "world.project.json"]} onKeepLocal={keep} onReloadExternal={reload} onCancel={cancel} />);
    expect(screen.getByText("scripts/scene.json")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "保留本地版本" }));
    fireEvent.click(screen.getByRole("button", { name: "重新载入外部版本" }));
    fireEvent.click(screen.getByRole("button", { name: "暂不处理" }));
    expect(keep).toHaveBeenCalled(); expect(reload).toHaveBeenCalled(); expect(cancel).toHaveBeenCalled();
  });
});
