import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { CanonicalProject } from '@world-studio/project-domain';
import { createPlayerCore, createPlayerCoreSnapshotV1, dispatchPlayerCoreIntentV1, loadPlayerCoreSessionSaveV1, mergePlayerCoreMetaProgressV1, playerCoreMetaProgressV1 } from '@world-studio/player-core';

it('explains the exact #406 rain hash transition solely by the other window reading one more paragraph', () => {
  const html = readFileSync('evidence/web-manual-save-safety/before-rain-stops.html', 'utf8'), marker = '<script id="world-project" type="application/json">', start = html.indexOf(marker); expect(start).toBeGreaterThan(0);
  const project = (JSON.parse(html.slice(start + marker.length, html.indexOf('</script>', start + marker.length))) as { project: CanonicalProject }).project;
  const file = readFileSync('evidence/web-backup-continuation/final-work/original-1.11.0.worldsave', 'utf8'), backup = JSON.parse(file), slot = backup.payload.slot;
  const loaded = loadPlayerCoreSessionSaveV1(createPlayerCore(project), slot.serializedSessionSave); expect(loaded.ok).toBe(true); if (!loaded.ok) throw Error('Real backup rejected');
  const first = loaded.state, before = createPlayerCoreSnapshotV1(first); expect(before.runtimeStateHash).toBe('92734b15d85213f16dff5be1b0d4d3b76b4346e94133891f5168b790534a78d8');
  const next = dispatchPlayerCoreIntentV1(first, project, { kind: 'primary' }); expect(createPlayerCoreSnapshotV1(next).runtimeStateHash).toBe('c04d22711f179366e27943f8f4a0619af369c7416adeec2a0e30b059f06274c3');
  const merged = mergePlayerCoreMetaProgressV1(first, playerCoreMetaProgressV1(next)!); expect(createPlayerCoreSnapshotV1(merged).runtimeStateHash).toBe('ae1db2ee1b60050eef3dd18dc56c357a1c0a3e1d611a2df8339026df699d5373');
  const { metaProgress: oldProgress, ...oldRuntime } = first.runtimeState!, { metaProgress: newProgress, ...newRuntime } = merged.runtimeState!;
  expect(newRuntime).toEqual(oldRuntime); expect(newProgress.readTextIds.length).toBe(oldProgress.readTextIds.length + 1); expect(merged.currentEvent).toBe(first.currentEvent); expect(merged.hostState).toBe(first.hostState); expect(merged.historySession!.cursor).toBe(first.historySession!.cursor); expect(merged.historySession!.entries.length).toBe(first.historySession!.entries.length);
  expect(readFileSync('evidence/web-backup-continuation/final-work/original-1.11.0.worldsave', 'utf8')).toBe(file);
});
