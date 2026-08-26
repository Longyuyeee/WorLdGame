import { fireEvent, render, screen } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { MOTION_PREFERENCE_STORAGE_KEY } from "./motion-preference";

afterEach(() => {
  vi.unstubAllGlobals();
});

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const entries = new Map(Object.entries(initial));
  return {
    get length() { return entries.size; },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => { entries.delete(key); },
    setItem: (key, value) => { entries.set(key, value); }
  };
}

function matchMedia(matches: boolean): MediaQueryList {
  return {
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true)
  };
}

describe("N43-E3 motion and state semantics", () => {
  it("switches all three explicit levels and keeps selected state readable without color", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("matchMedia", vi.fn(() => matchMedia(false)));
    render(<App autosaveDebounceMs={60_000} />);
    await screen.findByRole("button", { name: "保存到本机" });

    const shell = screen.getByTestId("workspace-shell");
    expect(shell).toHaveAttribute("data-motion-preference", "simplified");
    expect(shell).toHaveAttribute("data-motion-level", "simplified");
    expect(screen.getByRole("radio", { name: "简化动效" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("保留任务反馈，停止装饰循环")).toBeVisible();

    fireEvent.click(screen.getByRole("radio", { name: "完整动效" }));
    expect(shell).toHaveAttribute("data-motion-level", "full");
    expect(globalThis.localStorage.getItem(MOTION_PREFERENCE_STORAGE_KEY)).toBe("full");

    fireEvent.click(screen.getByRole("radio", { name: "静止动效" }));
    expect(shell).toHaveAttribute("data-motion-level", "reduced");
    expect(screen.getByRole("radio", { name: "静止动效" })).toHaveTextContent("✓");
    expect(screen.getByText("立即切换，避免位移与闪动")).toBeVisible();
  });

  it("lets system reduced motion override a stored full preference without erasing it", async () => {
    vi.stubGlobal("localStorage", memoryStorage({ [MOTION_PREFERENCE_STORAGE_KEY]: "full" }));
    vi.stubGlobal("indexedDB", new IDBFactory());
    vi.stubGlobal("matchMedia", vi.fn(() => matchMedia(true)));
    render(<App autosaveDebounceMs={60_000} />);
    await screen.findByRole("button", { name: "保存到本机" });

    const shell = screen.getByTestId("workspace-shell");
    expect(shell).toHaveAttribute("data-motion-preference", "full");
    expect(shell).toHaveAttribute("data-motion-level", "reduced");
    expect(shell).toHaveAttribute("data-system-reduced-motion", "true");
    expect(screen.getByText(/系统减少动效已启用/)).toBeVisible();
    expect(globalThis.localStorage.getItem(MOTION_PREFERENCE_STORAGE_KEY)).toBe("full");
  });
});
