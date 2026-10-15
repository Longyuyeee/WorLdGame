import type { importStudioProjectArchive } from './web-delivery-bundle';

export type ProjectImportPhase = 'reading' | 'checking' | 'writing' | 'opening';
export interface ProjectArchiveImportOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (phase: ProjectImportPhase) => void;
}
export type ImportedStudioArchive = ReturnType<typeof importStudioProjectArchive>;
export const MAX_PROJECT_ARCHIVE_BYTES = 520 * 1024 * 1024;
