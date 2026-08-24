import { sha256 } from "@world-studio/project-persistence";
import { validateStoryProject, type StoryProject, type StoryStatement } from "@world-studio/story-core";
import { parseTypedExpression, type ExpressionNode } from "@world-studio/story-language";

export interface PlayableWebArtifact {
  readonly filename: string;
  readonly html: string;
  readonly byteLength: number;
  readonly projectDigest: string;
}

interface CompiledStatement extends Omit<StoryStatement, "expression"> {
  readonly expression?: string;
  readonly expressionAst?: ExpressionNode;
}

export class PlayableWebBuildError extends Error {
  readonly diagnostics: readonly string[];

  constructor(diagnostics: readonly string[]) {
    super(`Playable Web build failed with ${diagnostics.length} diagnostic(s)`);
    this.name = "PlayableWebBuildError";
    this.diagnostics = diagnostics;
  }
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("&", "\\u0026").replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

function artifactFilename(title: string): string {
  const stem = title.normalize("NFKC").replace(/[^\p{Letter}\p{Number}_-]+/gu, "-").replace(/^-+|-+$/g, "");
  return `${stem || "world-story"}-playable.html`;
}

function compileStatement(statement: StoryStatement, diagnostics: string[]): CompiledStatement {
  if (statement.kind !== "set" && statement.kind !== "condition") return statement;
  const parsed = parseTypedExpression(statement.expression);
  const blocking = parsed.issues.filter((issue) => issue.code !== "UNKNOWN_VARIABLE");
  if (parsed.root === null || blocking.length > 0) {
    diagnostics.push(`${statement.id}: ${blocking[0]?.message ?? "表达式为空"}`);
    return statement;
  }
  if (statement.kind === "condition" && parsed.valueType !== "boolean" && parsed.valueType !== "unknown") {
    diagnostics.push(`${statement.id}: 条件表达式必须返回布尔值`);
  }
  return { ...statement, expressionAst: parsed.root };
}

function compileProject(project: StoryProject) {
  const diagnostics = validateStoryProject(project).map((item) => `${item.code}: ${item.message}`);
  let endingCount = 0;
  const scenes = project.scenes.map((scene) => {
    if (scene.statements.length === 0) diagnostics.push(`${scene.id}: 场景没有可执行语句`);
    const labels = new Set(scene.statements.filter((statement) => statement.kind === "label").map((statement) => statement.name));
    for (const statement of scene.statements) {
      if (statement.kind === "end") endingCount += 1;
      if (["jump", "call", "condition"].includes(statement.kind)) {
        const target = (statement as Extract<StoryStatement, { kind: "jump" | "call" | "condition" }>).targetLabel;
        if (!labels.has(target)) diagnostics.push(`${statement.id}: 目标标签不存在：${target}`);
      }
    }
    return { ...scene, statements: scene.statements.map((statement) => compileStatement(statement, diagnostics)) };
  });
  if (endingCount === 0) diagnostics.push("工程至少需要一个结局节点");
  if (diagnostics.length > 0) throw new PlayableWebBuildError(diagnostics);
  return { schemaVersion: 1, project: { ...project, scenes } } as const;
}

const playerScript = String.raw`
(() => {
  "use strict";
  const payload = JSON.parse(document.getElementById("world-project").textContent);
  const project = payload.project;
  const byId = (id) => project.scenes.find((scene) => scene.id === id);
  const character = (id) => project.characters.find((item) => item.id === id);
  const ui = {
    scene: document.getElementById("scene"), speaker: document.getElementById("speaker"),
    text: document.getElementById("text"), choices: document.getElementById("choices"),
    next: document.getElementById("next"), status: document.getElementById("status"), restart: document.getElementById("restart")
  };
  let state;
  const fresh = () => ({ sceneId: project.entrySceneId, index: 0, variables: {}, stack: [], steps: 0, ended: false });
  const fail = (message) => { ui.status.textContent = "运行中止：" + message; ui.status.dataset.state = "error"; ui.next.hidden = true; ui.choices.replaceChildren(); };
  const value = (node) => {
    if (node.kind === "literal") return node.value;
    if (node.kind === "identifier") { if (!(node.name in state.variables)) throw new Error("变量尚未赋值：" + node.name); return state.variables[node.name]; }
    if (node.kind === "unary") { const item = value(node.operand); return node.operator === "!" ? !item : -item; }
    const left = value(node.left);
    if (node.operator === "&&") return left && value(node.right);
    if (node.operator === "||") return left || value(node.right);
    const right = value(node.right);
    if (node.operator === "==") return left === right;
    if (node.operator === "!=") return left !== right;
    if (node.operator === "+") return left + right;
    if (node.operator === "-") return left - right;
    if (node.operator === "*") return left * right;
    if (node.operator === "/") { if (right === 0) throw new Error("除数不能为零"); return left / right; }
    if (node.operator === "<") return left < right;
    if (node.operator === "<=") return left <= right;
    if (node.operator === ">") return left > right;
    if (node.operator === ">=") return left >= right;
    throw new Error("不支持的表达式操作符：" + node.operator);
  };
  const labelIndex = (scene, name) => scene.statements.findIndex((item) => item.kind === "label" && item.name === name);
  const show = (statement, scene) => {
    ui.scene.textContent = scene.title;
    ui.choices.replaceChildren();
    ui.next.hidden = statement.kind === "choice" || statement.kind === "end";
    ui.speaker.textContent = "";
    if (statement.kind === "dialogue") { const actor = character(statement.speakerId); ui.speaker.textContent = actor ? actor.displayName : "未知角色"; ui.speaker.style.color = actor ? actor.color : "#a78bfa"; ui.text.textContent = statement.text; }
    else if (statement.kind === "narration") { ui.speaker.textContent = "旁白"; ui.text.textContent = statement.text; }
    else if (statement.kind === "direction") { ui.speaker.textContent = "演出"; ui.text.textContent = statement.summary; }
    else if (statement.kind === "wait") { ui.speaker.textContent = "等待"; ui.text.textContent = statement.duration + " ms"; }
    else if (statement.kind === "choice") { ui.speaker.textContent = statement.prompt; ui.text.textContent = ""; for (const option of statement.options) { const button = document.createElement("button"); button.textContent = option.label; button.dataset.optionId = option.id; button.onclick = () => { state.sceneId = option.targetSceneId; state.index = 0; settle(); }; ui.choices.append(button); } }
    else if (statement.kind === "end") { state.ended = true; ui.speaker.textContent = "ENDING"; ui.text.textContent = statement.endingName; ui.status.textContent = "流程完成：" + statement.endingName; ui.status.dataset.state = "ended"; ui.restart.hidden = false; }
    if (!state.ended && statement.kind !== "choice") { ui.status.textContent = "运行中 · " + scene.title; ui.status.dataset.state = "presenting"; }
    if (statement.kind === "choice") { ui.status.textContent = "请选择路线"; ui.status.dataset.state = "waiting-choice"; }
  };
  const settle = () => {
    try {
      while (state.steps <= 1000) {
        const scene = byId(state.sceneId); if (!scene) throw new Error("场景不存在：" + state.sceneId);
        const statement = scene.statements[state.index]; if (!statement) throw new Error("场景没有到达结局：" + scene.title);
        if (["dialogue", "narration", "direction", "wait", "choice", "end"].includes(statement.kind)) { show(statement, scene); return; }
        state.steps += 1;
        if (statement.kind === "label") { state.index += 1; continue; }
        if (statement.kind === "set") { state.variables[statement.variable] = value(statement.expressionAst); state.index += 1; continue; }
        if (statement.kind === "condition") { const result = value(statement.expressionAst); if (typeof result !== "boolean") throw new Error("条件表达式必须返回布尔值"); state.index = result ? labelIndex(scene, statement.targetLabel) : state.index + 1; continue; }
        if (statement.kind === "jump" || statement.kind === "call") { if (statement.kind === "call") state.stack.push({ sceneId: scene.id, index: state.index + 1 }); state.index = labelIndex(scene, statement.targetLabel); continue; }
        if (statement.kind === "return") { const point = state.stack.pop(); if (!point) throw new Error("return 没有对应的 call"); state.sceneId = point.sceneId; state.index = point.index; }
      }
      throw new Error("控制流超过 1000 步，可能存在无限循环");
    } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
  };
  const start = () => { state = fresh(); ui.restart.hidden = true; settle(); };
  ui.next.onclick = () => { if (!state.ended) { state.index += 1; settle(); } };
  ui.restart.onclick = start;
  document.title = project.title + " · WorLdGame";
  document.getElementById("title").textContent = project.title;
  start();
})();`;

export function buildPlayableWebArtifact(project: StoryProject): PlayableWebArtifact {
  const compiled = compileProject(project);
  const projectJson = safeJson(compiled);
  const projectDigest = sha256(projectJson);
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="world-project-sha256" content="${projectDigest}"><title>WorLdGame</title>
<style>:root{color-scheme:dark;font-family:Inter,"Microsoft YaHei",sans-serif;background:#090b16;color:#f7f7ff}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 20% 10%,#26245c 0,transparent 40%),linear-gradient(145deg,#090b16,#14172b)}main{width:min(92vw,960px);min-height:min(78vh,600px);padding:clamp(24px,5vw,64px);display:flex;flex-direction:column;border:1px solid #ffffff20;border-radius:24px;background:#101326e8;box-shadow:0 24px 80px #0008}.brand{margin:0;color:#8de7ff;font-size:12px;letter-spacing:.22em}.title{margin:8px 0 32px;font-size:clamp(24px,4vw,42px)}.stage{flex:1;display:flex;flex-direction:column;justify-content:flex-end;padding:clamp(24px,5vw,56px);border-radius:18px;background:linear-gradient(180deg,#575191,#bf7b8d 58%,#252b43 59%);box-shadow:inset 0 0 80px #0004}.scene{align-self:flex-start;padding:7px 12px;border-radius:999px;background:#080b18aa;font-size:13px}.dialogue{margin-top:auto;padding:22px;border:1px solid #ffffff24;border-radius:16px;background:#080b18dd}.speaker{display:block;margin-bottom:10px;font-weight:800}.text{min-height:1.5em;margin:0;font-size:clamp(18px,2.5vw,28px);line-height:1.55}.choices{display:grid;gap:10px;margin-top:18px}button{min-height:44px;padding:10px 18px;border:1px solid #8de7ff88;border-radius:12px;background:#1c2341;color:#fff;font:inherit;cursor:pointer}button:hover,button:focus-visible{background:#29335e;outline:2px solid #8de7ff}.controls{display:flex;align-items:center;gap:16px;margin-top:22px}.status{flex:1;color:#bac3e3}.status[data-state=ended]{color:#8dffb3}.status[data-state=error]{color:#ff9d9d}[hidden]{display:none!important}</style></head>
<body><main><p class="brand">WORLDGAME · OFFLINE PLAYABLE</p><h1 class="title" id="title"></h1><section class="stage" aria-label="游戏舞台"><span class="scene" id="scene"></span><div class="dialogue"><strong class="speaker" id="speaker"></strong><p class="text" id="text"></p><div class="choices" id="choices"></div></div></section><div class="controls"><span class="status" id="status" role="status"></span><button id="next" type="button">继续剧情</button><button id="restart" type="button" hidden>重新开始</button></div></main>
<script id="world-project" type="application/json">${projectJson}</script><script>${playerScript}</script></body></html>\n`;
  return { filename: artifactFilename(project.title), html, byteLength: new TextEncoder().encode(html).byteLength, projectDigest };
}

export function createPlayableWebDownload(project: StoryProject): PlayableWebArtifact & { readonly href: string; readonly dispose: () => void } {
  const artifact = buildPlayableWebArtifact(project);
  const href = URL.createObjectURL(new Blob([artifact.html], { type: "text/html;charset=utf-8" }));
  return { ...artifact, href, dispose: () => URL.revokeObjectURL(href) };
}
