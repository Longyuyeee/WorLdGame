import { describe, expect, it } from "vitest";
import { loadProject, migrateS0Project, saveProject, verifyWebSaveCompatibility, readWebSaveCompatibility, withoutWebSaveCompatibility, webSaveCompatibilityFingerprint, type CanonicalProject, type S0Project } from "@world-studio/project-domain";
import { compileProject } from "@world-studio/project-compiler";
import { canonicalRuntimeStringify } from "@world-studio/runtime";
import source from "../../../fixtures/projects/branching/project.s0.json";
import { createPlayerCore, startPlayerCore, advancePlayerCore, selectPlayerCoreChoice, backPlayerCore, forwardPlayerCore, createPlayerCoreSessionSaveV1, loadPlayerCoreSessionSaveV1 } from "./player-core";

function project(version: string): CanonicalProject {
  const base = loadProject(migrateS0Project(source as S0Project).files);
  return { ...base, manifest: { ...base.manifest, preservedFields: { ...base.manifest.preservedFields,
    webPublication: { schemaVersion: 1, name: base.manifest.title, version, iconAssetId: "" } } } };
}

describe("verified Web save updates", () => {
  it('reconstructs all 32 exact prior build identities and strictly loads their complete saves', () => {
    const versions = Array.from({ length: 32 }, (_, index) => `1.0.${index}`), current = project('1.1.0');
    const target = createPlayerCore({ ...current, manifest: { ...current.manifest, preservedFields: { ...current.manifest.preservedFields,
      webSaveCompatibility: { schemaVersion: 1, fingerprint: webSaveCompatibilityFingerprint(current), versions }
    } } });
    expect(target.compatibleSaveBuildIds).toHaveLength(32);
    for (const [index, version] of versions.entries()) {
      const previous = project(version), old = startPlayerCore(createPlayerCore(previous), previous), saved = createPlayerCoreSessionSaveV1(old);
      expect(target.compatibleSaveBuildIds[index]).toBe(old.artifacts!.manifest.buildId);
      expect(saved.ok).toBe(true);
      if (saved.ok) {
        const loaded = loadPlayerCoreSessionSaveV1(target, saved.serialized);
        expect(loaded.ok).toBe(true);
        if (loaded.ok) expect(createPlayerCoreSessionSaveV1(loaded.state)).toEqual(saved);
      }
    }
  });
  it("persists a version-only receipt, keeps build identity unchanged and inherits validated older versions", () => {
    const previous = project("1.0.0"), current = project("1.0.1");
    const verified = loadProject(saveProject(verifyWebSaveCompatibility(current, previous)));
    expect(readWebSaveCompatibility(verified)).toEqual({ status: "verified", versions: ["1.0.0"] });
    const before = compileProject(current, "release"), after = compileProject(verified, "release");
    expect(before.ok && after.ok && before.artifacts.manifest).toEqual(after.ok && after.artifacts.manifest);
    expect(readWebSaveCompatibility(verifyWebSaveCompatibility(project("1.0.2"), verified))).toEqual({ status: "verified", versions: ["1.0.0", "1.0.1"] });
    expect(withoutWebSaveCompatibility(verified)).toEqual(current);
  });

  it("rejects another work and invalidates receipts on every preserved source change", () => {
    const current = verifyWebSaveCompatibility(project("1.0.1"), project("1.0.0"));
    expect(() => verifyWebSaveCompatibility(current, { ...project("1.0.0"), manifest: { ...current.manifest, projectId: "other" } })).toThrow("同一个作品");
    const variants: CanonicalProject[] = [
      { ...current, scripts: { ...current.scripts, branch_start: { ...current.scripts.branch_start!, preservedFields: { changed: true } } } },
      { ...current, assets: { ...current.assets, preservedFields: { changed: true } } },
      { ...current, settings: { ...current.settings, project: { ...current.settings.project, history: { allowForwardAfterBack: false } } } },
      { ...current, ui: { ...current.ui, preservedFields: { changed: true } } },
      { ...current, localization: { ...current.localization, preservedFields: { changed: true } } },
      { ...current, variables: { ...current.variables, preservedFields: { changed: true } } },
      { ...current, manifest: { ...current.manifest, preservedFields: { ...current.manifest.preservedFields,
        webPublication: { schemaVersion: 1, name: "Changed", version: "1.0.1", iconAssetId: "" } } } }
    ];
    for (const changed of variants) {
      expect(readWebSaveCompatibility(changed).status).toBe("stale");
      expect(() => verifyWebSaveCompatibility(changed, project("1.0.0"))).toThrow("内容有变化");
      expect(createPlayerCore(changed).compatibleSaveBuildIds).toEqual([]);
    }
    const malformed = { ...current, manifest: { ...current.manifest, preservedFields: { ...current.manifest.preservedFields,
      webSaveCompatibility: { schemaVersion: 1, fingerprint: "bad", versions: ["1.0.0"] } } } };
    expect(readWebSaveCompatibility(malformed).status).toBe("invalid");
  });

  it("strictly restores a prior complete history, preserves bytes and continues saving with the original identity", () => {
    const previous = project("1.0.0");
    let oldState = startPlayerCore(createPlayerCore(previous), previous);
    oldState = selectPlayerCoreChoice(oldState, "branch_left_option");
    oldState = selectPlayerCoreChoice(backPlayerCore(oldState), "branch_right_option");
    expect(oldState.historySession!.archives.length).toBeGreaterThan(0);
    const created = createPlayerCoreSessionSaveV1(oldState); expect(created.ok).toBe(true); if (!created.ok) return;
    const current = verifyWebSaveCompatibility(project("1.0.1"), previous), target = createPlayerCore(current);
    expect(loadPlayerCoreSessionSaveV1(createPlayerCore(project("1.0.1")), created.serialized).ok).toBe(false);
    const loaded = loadPlayerCoreSessionSaveV1(target, created.serialized); expect(loaded.ok).toBe(true); if (!loaded.ok) return;
    expect(loaded.compatibility).toBe("verified-previous");
    expect(loaded.state.historySession).toEqual(oldState.historySession);
    expect(loaded.savedBuildId).toBe(oldState.runtimeState!.buildId);
    expect(createPlayerCoreSessionSaveV1(loaded.state)).toEqual(created);
    expect(forwardPlayerCore(backPlayerCore(loaded.state)).runtimeState).toEqual(loaded.state.runtimeState);
    let next = loaded.state;
    if (next.status === "waiting-choice") next = selectPlayerCoreChoice(next, next.runtimeState!.pendingChoice!.options[0]!.optionId);
    else next = advancePlayerCore(next);
    const savedAgain = createPlayerCoreSessionSaveV1(next); expect(savedAgain.ok).toBe(true); if (!savedAgain.ok) return;
    expect(loadPlayerCoreSessionSaveV1(createPlayerCore(current), savedAgain.serialized).ok).toBe(true);
    expect(loadPlayerCoreSessionSaveV1(createPlayerCore(previous), savedAgain.serialized).ok).toBe(true);
    const corrupt = JSON.parse(created.serialized) as { historyHash: string }; corrupt.historyHash = "0".repeat(64);
    // Noncanonical bytes and payload tampering remain rejected after compatibility resolution.
    expect(loadPlayerCoreSessionSaveV1(target, canonicalRuntimeStringify(corrupt))).toMatchObject({ ok: false, diagnostics: [{ code: "RUNTIME_SAVE_HASH_MISMATCH" }] });
    expect(target.runtimeState).toBeNull();
  });

  it("keeps a receipt valid when formal export replaces the internal title with the publication name", () => {
    const previous = project("1.0.0"), current = project("1.0.1");
    const rename = (value: CanonicalProject): CanonicalProject => ({ ...value, manifest: { ...value.manifest, preservedFields: {
      ...value.manifest.preservedFields, webPublication: { ...(value.manifest.preservedFields!.webPublication as object), name: "Published Game" } } } });
    const verified = verifyWebSaveCompatibility(rename(current), rename(previous));
    const exported = { ...verified, manifest: { ...verified.manifest, title: "Published Game" } };
    const oldExported = { ...rename(previous), manifest: { ...rename(previous).manifest, title: "Published Game" } };
    expect(readWebSaveCompatibility(exported).status).toBe("verified");
    const old = startPlayerCore(createPlayerCore(oldExported), oldExported), save = createPlayerCoreSessionSaveV1(old);
    expect(save.ok).toBe(true); if (save.ok) expect(loadPlayerCoreSessionSaveV1(createPlayerCore(exported), save.serialized).ok).toBe(true);
  });
});
