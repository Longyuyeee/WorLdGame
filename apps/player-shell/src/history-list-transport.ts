import { MAX_META_PROGRESS_IDS_PER_DOMAIN, MAX_RUNTIME_HISTORY_ENTRIES, type RuntimeHistoryCheckpointV1, type RuntimeHistorySessionV1, type RuntimeStateV1 } from '@world-studio/runtime';

const maximumExpandedCells = 8_000_000;
export const plainHistoryTransport = Symbol('plain history transport');
const domains = ['readTextIds', 'unlockedGalleryAssetIds', 'reachedEndingIds'] as const;
type Domain = typeof domains[number];
type ListDelta = readonly [prefix: number, suffix: number, inserted: readonly string[]];
type PackedCheckpoint = Omit<RuntimeHistoryCheckpointV1, 'state'> & {
  readonly state: Omit<RuntimeStateV1, 'metaProgress'> & { readonly metaProgress: Omit<RuntimeStateV1['metaProgress'], Domain> };
  readonly lists: readonly ListDelta[];
};
type PackedHistory = Omit<RuntimeHistorySessionV1, 'checkpoints'> & { readonly checkpoints: readonly number[] };

function delta(previous: readonly string[], current: readonly string[]): ListDelta {
  let prefix = 0, suffix = 0;
  while (prefix < previous.length && prefix < current.length && previous[prefix] === current[prefix]) prefix++;
  while (suffix < previous.length - prefix && suffix < current.length - prefix && previous[previous.length - suffix - 1] === current[current.length - suffix - 1]) suffix++;
  return [prefix, suffix, current.slice(prefix, current.length - suffix)];
}

/** Every call owns a complete table, never a prior packet or validation result. */
export function createHistoryListEncoder() {
  const checkpoints: PackedCheckpoint[] = [], indices = new Map<RuntimeHistoryCheckpointV1, number>();
  let expandedCells = 0;
  let previous: readonly (readonly string[])[] = [[], [], []];
  const packHistory = (history: RuntimeHistorySessionV1): PackedHistory => ({ ...history, checkpoints: history.checkpoints.map(checkpoint => {
    const existing = indices.get(checkpoint); if (existing !== undefined) return existing;
    // Separate candidate histories may contain equal but non-shared objects.
    // Keep such valid inputs plain if their combined table exceeds decoding's
    // budget, rather than generate an envelope the receiver would reject.
    if (checkpoints.length >= MAX_RUNTIME_HISTORY_ENTRIES + 1) throw plainHistoryTransport;
    const progress = checkpoint.state.metaProgress, lists = domains.map(key => progress[key]);
    expandedCells += lists.reduce((count, list) => count + list.length, 0);
    if (expandedCells > maximumExpandedCells) throw plainHistoryTransport;
    const { readTextIds: _read, unlockedGalleryAssetIds: _gallery, reachedEndingIds: _endings, ...identity } = progress;
    const index = checkpoints.length; indices.set(checkpoint, index);
    checkpoints.push({ ...checkpoint, state: { ...checkpoint.state, metaProgress: identity }, lists: lists.map((list, i) => delta(previous[i]!, list)) });
    previous = lists; return index;
  }) });
  const packRuntime = (runtime: RuntimeStateV1 | null, history: RuntimeHistorySessionV1): RuntimeStateV1 | number | null => {
    const current = history.checkpoints[history.cursor];
    return current?.state === runtime ? indices.get(current)! : runtime;
  };
  return { checkpoints, packHistory, packRuntime };
}

export function historyTransportRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function requireHistoryTransport(value: unknown): asserts value { if (!value) throw Error('Invalid history transport'); }
function integer(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }

/** Shape/budget checks only; public Core entries still validate expanded
 * histories and hashes independently on every operation. */
export function createHistoryListDecoder(packed: unknown) {
  const require: typeof requireHistoryTransport = requireHistoryTransport, record = historyTransportRecord;
  require(Array.isArray(packed) && packed.length > 0 && packed.length <= MAX_RUNTIME_HISTORY_ENTRIES + 1);
  let previous: readonly (readonly string[])[] = [[], [], []];
  let expandedCells = 0;
  const table = Array.from(packed, (item: unknown): RuntimeHistoryCheckpointV1 => {
    require(record(item) && record(item.state) && record(item.state.metaProgress) && Array.isArray(item.lists) && item.lists.length === domains.length);
    const state = item.state, progress = state.metaProgress as Record<string, unknown>;
    require(Object.keys(item).length === 4 && ['checkpointId', 'stateHash', 'state', 'lists'].every(key => Object.hasOwn(item, key)) && domains.every(key => !Object.hasOwn(progress, key)));
    const lists = Array.from(item.lists, (run: unknown, domain: number): readonly string[] => {
      require(Array.isArray(run) && run.length === 3 && integer(run[0]) && integer(run[1]) && Array.isArray(run[2]));
      const [prefix, suffix, inserted] = run as [number, number, unknown[]], before = previous[domain]!;
      require(prefix + suffix <= before.length && prefix + suffix + inserted.length <= MAX_META_PROGRESS_IDS_PER_DOMAIN);
      expandedCells += prefix + suffix + inserted.length;
      require(expandedCells <= maximumExpandedCells);
      for (let i = 0; i < inserted.length; i++) require(typeof inserted[i] === 'string');
      if (prefix === before.length && suffix === 0 && inserted.length === 0) return before;
      const result = new Array<string>(prefix + inserted.length + suffix);
      for (let i = 0; i < prefix; i++) result[i] = before[i]!;
      for (let i = 0; i < inserted.length; i++) result[prefix + i] = inserted[i] as string;
      for (let i = 0; i < suffix; i++) result[prefix + inserted.length + i] = before[before.length - suffix + i]!;
      return result;
    });
    previous = lists;
    const { lists: _runs, ...checkpoint } = item;
    return { ...checkpoint, state: { ...state, metaProgress: { ...progress, readTextIds: lists[0], unlockedGalleryAssetIds: lists[1], reachedEndingIds: lists[2] } } } as RuntimeHistoryCheckpointV1;
  });
  const unpackHistory = (input: unknown): RuntimeHistorySessionV1 => {
    require(record(input) && Array.isArray(input.checkpoints) && input.checkpoints.length > 0 && input.checkpoints.length <= MAX_RUNTIME_HISTORY_ENTRIES + 1);
    return { ...input, checkpoints: Array.from(input.checkpoints, (index: unknown) => { require(integer(index) && index < table.length); return table[index]!; }) } as unknown as RuntimeHistorySessionV1;
  };
  const unpackRuntime = (runtime: unknown): RuntimeStateV1 | null => {
    if (typeof runtime === 'number') { require(integer(runtime) && runtime < table.length); return table[runtime]!.state; }
    return runtime as RuntimeStateV1 | null;
  };
  return { unpackHistory, unpackRuntime };
}
