import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Full-suite Windows runs perform real SHA-256/media work in parallel. Keep
// async UI assertions strict but give those browser-like tasks a stable budget.
configure({ asyncUtilTimeout: 5_000 });

if (typeof HTMLCanvasElement !== "undefined") {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => null
  });
}

afterEach(() => {
  cleanup();
});
