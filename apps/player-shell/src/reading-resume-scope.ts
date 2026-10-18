import type { PlayerCoreState } from '@world-studio/player-core';
import type { ReadingResumeContext } from './reading-resume-store';

type Runtime = PlayerCoreState['runtimeState'];
interface Owner { readonly paragraph: string; readonly context: ReadingResumeContext; readonly runtime: Runtime }
const sameFamily = (a: ReadingResumeContext, b: ReadingResumeContext) => a.projectId === b.projectId && a.buildId === b.buildId && a.locale === b.locale && a.textHash === b.textHash;
/** Formal Meta merges share every non-Meta field. Do not serialize long state,
 * infer narrative equivalence from prose, or alias unrelated same-line loads. */
export function sameReadingRuntimeExceptMeta(a: Runtime, b: Runtime): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const keys = Object.keys(a) as (keyof NonNullable<Runtime>)[];
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && (key === 'metaProgress' || a[key] === b[key]));
}
/** Bounded optional presentation aliases, never accepted story/save authority. */
export class ReadingResumeScope {
  private serial = 0;
  private owner: (Owner & { id: number; aliases: readonly ReadingResumeContext[] }) | null = null;
  get id() { return this.owner?.id ?? null; }
  clear() { this.owner = null; }
  private matches(owner: Owner) {
    const previous = this.owner;
    return previous !== null && previous.paragraph === owner.paragraph && sameFamily(previous.context, owner.context) && sameReadingRuntimeExceptMeta(previous.runtime, owner.runtime);
  }
  track(owner: Owner, validatedSavedHash?: string): number {
    const continued = validatedSavedHash === undefined && this.matches(owner), previous = this.owner;
    let aliases = continued ? [...previous!.aliases] : validatedSavedHash === undefined ? [] : [{ ...owner.context, runtimeStateHash: validatedSavedHash }];
    if (!aliases.some(item => item.runtimeStateHash === owner.context.runtimeStateHash)) aliases.push(owner.context);
    // Keep the original (or explicitly validated) source and the seven newest.
    if (aliases.length > 8) aliases = [aliases[0]!, ...aliases.slice(-7)];
    const id = continued ? previous!.id : ++this.serial;
    this.owner = { ...owner, id, aliases }; return id;
  }
  sources(owner: Owner): readonly ReadingResumeContext[] {
    const aliases = this.matches(owner) ? this.owner!.aliases : [];
    return [owner.context, ...aliases.filter(item => item.runtimeStateHash !== owner.context.runtimeStateHash)].slice(0, 8);
  }
}
