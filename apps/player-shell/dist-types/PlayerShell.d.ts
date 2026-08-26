import type { CanonicalProject } from "@world-studio/project-domain";
import "./player-shell.css";
export interface PlayerShellProps {
    readonly project: CanonicalProject;
}
export declare function PlayerShell({ project }: PlayerShellProps): import("react").JSX.Element;
