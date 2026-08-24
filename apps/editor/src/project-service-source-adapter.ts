import type { JsonObject, ProjectCommand, ProjectServiceState } from "@world-studio/project-domain";
import { projectStoryScene, type ScriptSourceSession } from "@world-studio/story-language";

/** Converts the committed SourceSession projection into the same transactional command path used by every other view. */
export function commandsFromCommittedSource(
  state: ProjectServiceState,
  sceneId: string,
  sourceSession: ScriptSourceSession,
  commandPrefix: string
): readonly ProjectCommand[] {
  const projection = projectStoryScene(sourceSession.committedDocument);
  if (!projection.ok) throw new Error(`Committed source cannot enter Project Service: ${projection.diagnostics[0]?.code}`);
  const current = state.project.scripts[sceneId]?.statements;
  if (current === undefined) throw new Error(`Unknown canonical scene: ${sceneId}`);
  const target = projection.scene.statements.map((statement) => structuredClone(statement) as unknown as JsonObject);
  const targetIds = new Set(target.map((statement) => statement.id));
  const commands: ProjectCommand[] = [];
  let serial = 0;
  const base = () => ({ commandId: `${commandPrefix}_${String(serial++).padStart(3,"0")}`, expectedRevision: state.revision });
  for (const statement of current) if (typeof statement.id === "string" && !targetIds.has(statement.id)) commands.push({ ...base(), kind:"statement.delete", sceneId, statementId:statement.id });
  const currentIds = new Set(current.map((statement) => statement.id));
  target.forEach((statement, index) => {
    const statementId = statement.id;
    if (typeof statementId !== "string") throw new Error("Projected statement has no stable ID");
    if (!currentIds.has(statementId)) commands.push({ ...base(), kind:"statement.insert", sceneId, statement, index });
    else commands.push({ ...base(), kind:"statement.update", sceneId, statementId, patch:statement });
    commands.push({ ...base(), kind:"statement.move", sceneId, statementId, index });
  });
  return commands;
}
