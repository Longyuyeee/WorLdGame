/** Includes queueing, fallback preparation, Canvas decode and emergency IMG load.
 * Browser timer throttling may defer delivery; this is not a hard real-time limit. */
export const IMAGE_LOAD_TIMEOUT_MS = 15_000;
