import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { searchRouteTargets } from "./route-repair";
import { RouteTargetPicker } from "./RouteTargetPicker";

it("searches all 10k targets with bounded pages, stable IDs, and safe offsets", () => {
  const scenes = Array.from({ length: 10_000 }, (_, index) => ({ id: `scene_${index}`, title: index > 9997 ? "同名结局" : `Scene ${index}` }));
  expect(searchRouteTargets(scenes, "").targets).toHaveLength(24);
  expect(searchRouteTargets(scenes, "同名结局").targets.map((scene) => scene.id)).toEqual(["scene_9998", "scene_9999"]);
  expect(searchRouteTargets(scenes, " SCENE_9999 ").targets[0]?.id).toBe("scene_9999");
  expect(searchRouteTargets(scenes, "不存在", 200)).toMatchObject({ targets: [], total: 0, start: 0 });
  expect(searchRouteTargets(scenes, "", -10).start).toBe(0);
  expect(searchRouteTargets(scenes, "", Number.NaN).start).toBe(0);
  expect(searchRouteTargets(scenes, "", 999999).targets.at(-1)?.id).toBe("scene_9999");
});

it("keeps search separate from the actual target and exposes pagination and self-loop warning", () => {
  const select = vi.fn();
  const scenes = Array.from({ length: 50 }, (_, index) => ({ id: `scene_${index}`, title: `场景 ${index}` }));
  render(<RouteTargetPicker scenes={scenes} currentTargetId="missing" targetId="scene_0" sourceSceneId="scene_0" disabled={false} onSelect={select} />);
  expect(screen.getAllByRole("button", { name: /^选择目标场景/ })).toHaveLength(24);
  expect(screen.getByText(/目标是当前场景/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "下一页目标" }));
  fireEvent.click(screen.getByRole("button", { name: "选择目标场景：场景 47 · scene_47" }));
  expect(select).toHaveBeenCalledWith("scene_47");
  select.mockClear();
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索路线目标" }), { target: { value: "不存在" } });
  expect(screen.getByText(/没有匹配场景/)).toBeVisible();
  expect(select).not.toHaveBeenCalled();
});
