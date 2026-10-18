import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Full-suite Windows runs perform real SHA-256/media work in parallel. Keep
// async UI assertions strict but give those browser-like tasks a stable budget.
configure({ asyncUtilTimeout: 5_000 });

// jsdom has no modal top layer. Browser checks cover focus, Escape and backdrop behavior.
if (typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
}

if (typeof HTMLCanvasElement !== "undefined") {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => null
  });
}

afterEach(() => {
  cleanup();
});
