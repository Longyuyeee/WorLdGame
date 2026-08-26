import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { advancePlayerCore, createPlayerCore, createPlayerCoreSnapshotV1, selectPlayerCoreChoice, startPlayerCore } from "@world-studio/player-core";
import "./player-shell.css";
function nextState(state, project) {
    if (state.status === "title")
        return startPlayerCore(state, project);
    if (state.status === "presenting")
        return advancePlayerCore(state);
    return state;
}
export function PlayerShell({ project }) {
    const [state, setState] = useState(() => createPlayerCore(project));
    const snapshot = useMemo(() => createPlayerCoreSnapshotV1(state), [state]);
    const content = snapshot.presentation;
    const speakerNames = useMemo(() => Object.fromEntries(project.characters.characters.flatMap((character) => {
        const id = typeof character.id === "string" ? character.id : undefined;
        const displayName = typeof character.displayName === "string" ? character.displayName : undefined;
        return id === undefined || displayName === undefined ? [] : [[id, displayName]];
    })), [project.characters.characters]);
    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.repeat || event.altKey || event.ctrlKey || event.metaKey)
                return;
            if ((event.key === "Enter" || event.key === " ") && (state.status === "title" || state.status === "presenting")) {
                event.preventDefault();
                setState((current) => nextState(current, project));
                return;
            }
            if (state.status === "waiting-choice" && /^[1-9]$/u.test(event.key) && content.kind === "choice") {
                const option = content.options[Number(event.key) - 1];
                if (option !== undefined)
                    setState((current) => selectPlayerCoreChoice(current, option.optionId));
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [content, project, state.status]);
    return (_jsxs("main", { className: "player-shell", "data-player-status": snapshot.status, "data-player-core": snapshot.playerCoreVersion, "data-compiler": snapshot.identities.compilerVersion, "data-runtime": snapshot.identities.runtimeVersion, "data-runtime-host": snapshot.identities.runtimeHostVersion, children: [_jsx("div", { className: "player-glow player-glow--violet" }), _jsx("div", { className: "player-glow player-glow--cyan" }), _jsxs("section", { className: "player-stage", "aria-label": `${snapshot.title} 游戏画面`, children: [_jsxs("header", { className: "player-brand", "aria-label": "\u64AD\u653E\u5668\u72B6\u6001", children: [_jsx("span", { className: "player-brand__mark", "aria-hidden": "true", children: "W" }), _jsx("span", { children: "WorLd Player" }), _jsx("span", { className: "player-brand__status", children: snapshot.status })] }), content.kind === "title" && (_jsxs("div", { className: "player-title-screen", children: [_jsx("p", { className: "player-eyebrow", children: "A WORLd STUDIO STORY" }), _jsx("h1", { children: snapshot.title }), _jsx("p", { children: "\u540C\u4E00\u4E2A\u6545\u4E8B\u6838\u5FC3\uFF0C\u9762\u5411\u6BCF\u4E00\u5757\u5C4F\u5E55\u3002" }), _jsxs("button", { className: "player-primary", type: "button", onClick: () => setState((current) => nextState(current, project)), children: ["\u5F00\u59CB\u6545\u4E8B", _jsx("span", { "aria-hidden": "true", children: "\u2192" })] }), _jsx("span", { className: "player-hint", children: "Enter / Space" })] })), (content.kind === "dialogue" || content.kind === "narration") && (_jsxs("button", { className: "player-dialogue", type: "button", onClick: () => setState((current) => nextState(current, project)), "aria-label": "\u7EE7\u7EED\u4E0B\u4E00\u53E5", children: [content.kind === "dialogue" && _jsx("strong", { children: speakerNames[content.speakerId] ?? content.speakerId }), _jsx("span", { "aria-live": "polite", children: content.text }), _jsx("i", { "aria-hidden": "true", children: "\u2304" })] })), content.kind === "choice" && (_jsxs("div", { className: "player-choice", role: "group", "aria-labelledby": "player-choice-prompt", children: [_jsx("p", { id: "player-choice-prompt", children: content.prompt }), content.options.map((option, index) => (_jsxs("button", { type: "button", onClick: () => setState((current) => selectPlayerCoreChoice(current, option.optionId)), children: [_jsx("span", { "aria-hidden": "true", children: index + 1 }), option.label] }, option.optionId)))] })), content.kind === "ending" && (_jsxs("div", { className: "player-ending", role: "status", children: [_jsx("span", { children: "ENDING" }), _jsx("h2", { children: content.name })] })), content.kind === "error" && (_jsxs("div", { className: "player-error", role: "alert", children: [_jsx("span", { children: "\u65E0\u6CD5\u5B89\u5168\u542F\u52A8" }), _jsx("h1", { children: snapshot.title }), _jsx("p", { children: content.diagnostics[0]?.message ?? "未知 Player Core 错误" }), _jsx("code", { children: content.diagnostics[0]?.code ?? "PLAYER_UNKNOWN_ERROR" })] })), (content.kind === "wait" || content.kind === "effect" || content.kind === "barrier") && (_jsx("div", { className: "player-boundary", role: "status", children: "\u6B63\u5728\u7B49\u5F85\u6B63\u5F0F Runtime Host\u2026" }))] })] }));
}
