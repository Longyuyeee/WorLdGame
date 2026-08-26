import { jsx as _jsx } from "react/jsx-runtime";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { loadProject, migrateS0Project } from "@world-studio/project-domain";
import { PlayerShell } from "./PlayerShell";
function branching() {
    const source = JSON.parse(readFileSync(join(process.cwd(), "fixtures/projects/branching/project.s0.json"), "utf8"));
    return loadProject(migrateS0Project(source).files);
}
describe("N50-E1 shared Player Shell", () => {
    it("exposes formal identities and supports pointer input from title through choice", () => {
        const { container } = render(_jsx(PlayerShell, { project: branching() }));
        const shell = container.querySelector("main");
        expect(shell).toHaveAttribute("data-player-core", "0.1.0");
        expect(shell).toHaveAttribute("data-compiler", "0.2.0");
        expect(shell).toHaveAttribute("data-runtime", "0.6.0");
        expect(shell).toHaveAttribute("data-runtime-host", "0.1.0");
        fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));
        expect(screen.getByRole("group", { name: "Choose a route" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Left/u }));
        expect(screen.getByText("Guide")).toBeInTheDocument();
        expect(screen.getByText("The quiet route.")).toBeInTheDocument();
    });
    it("provides keyboard-equivalent start, choice, and advance controls", () => {
        const { container } = render(_jsx(PlayerShell, { project: branching() }));
        fireEvent.keyDown(window, { key: "Enter" });
        expect(container.querySelector("main")).toHaveAttribute("data-player-status", "waiting-choice");
        fireEvent.keyDown(window, { key: "2" });
        expect(screen.getByText("The bright route.")).toBeInTheDocument();
        fireEvent.keyDown(window, { key: " " });
        expect(screen.getByRole("status")).toHaveTextContent("Right");
    });
});
