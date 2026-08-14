import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { IndexedDbProjectFileStore } from "./indexeddb-project-store";

function stores(now: () => number) {
  const indexedDb = new IDBFactory();
  return {
    first: new IndexedDbProjectFileStore(indexedDb, "lease_test", { now }),
    second: new IndexedDbProjectFileStore(indexedDb, "lease_test", { now })
  };
}

describe("IndexedDbProjectFileStore writer lease", () => {
  it("grants exactly one concurrent owner and fences every mutation", async () => {
    let now = 1_000;
    const { first, second } = stores(() => now);
    const [left, right] = await Promise.all([
      first.acquire("owner_left", now, 100),
      second.acquire("owner_right", now, 100)
    ]);
    const acquired = [left, right].filter((item) => item.status === "acquired");
    const held = [left, right].filter((item) => item.status === "held");
    expect(acquired).toHaveLength(1);
    expect(held).toHaveLength(1);

    const winnerStore = left.status === "acquired" ? first : second;
    const loserStore = left.status === "acquired" ? second : first;
    const winnerLease = left.status === "acquired" ? left.lease : right.status === "acquired" ? right.lease : undefined;
    expect(winnerLease).toBeDefined();
    winnerStore.activateWriterLease(winnerLease ?? null);
    await expect(winnerStore.write("project.json", "winner")).resolves.toBeUndefined();
    await expect(loserStore.write("project.json", "loser")).rejects.toMatchObject({
      code: "LEASE_REQUIRED"
    });
    await expect(winnerStore.read("project.json")).resolves.toBe("winner");
  });

  it("renews without changing the token and rejects takeover before expiry", async () => {
    let now = 2_000;
    const { first, second } = stores(() => now);
    const acquired = await first.acquire("owner_first", now, 100);
    expect(acquired.status).toBe("acquired");
    if (acquired.status !== "acquired") return;
    first.activateWriterLease(acquired.lease);

    now = 2_050;
    const renewed = await first.renew(acquired.lease, now, 100);
    expect(renewed).toMatchObject({
      status: "renewed",
      lease: { fencingToken: acquired.lease.fencingToken, expiresAtMs: 2_150 }
    });
    await expect(second.acquire("owner_second", 2_149, 100)).resolves.toEqual({
      status: "held",
      holderExpiresAtMs: 2_150
    });
  });

  it("increments the fence on expiry and permanently rejects the stale owner", async () => {
    let now = 3_000;
    const { first, second } = stores(() => now);
    const firstResult = await first.acquire("owner_first", now, 100);
    expect(firstResult.status).toBe("acquired");
    if (firstResult.status !== "acquired") return;
    first.activateWriterLease(firstResult.lease);
    await first.write("project.json", "first");

    now = 3_101;
    const secondResult = await second.acquire("owner_second", now, 100);
    expect(secondResult.status).toBe("acquired");
    if (secondResult.status !== "acquired") return;
    expect(secondResult.lease.fencingToken).toBe(firstResult.lease.fencingToken + 1);
    second.activateWriterLease(secondResult.lease);
    await second.write("project.json", "second");
    await expect(first.write("project.json", "stale")).rejects.toMatchObject({ code: "LEASE_LOST" });
    await expect(first.renew(firstResult.lease, now, 100)).resolves.toEqual({ status: "lost" });
    await expect(first.release(firstResult.lease)).resolves.toBe(false);
    await expect(second.read("project.json")).resolves.toBe("second");
  });

  it("retains monotonic fencing tokens across clean release and reacquire", async () => {
    let now = 4_000;
    const { first, second } = stores(() => now);
    const firstResult = await first.acquire("owner_first", now, 100);
    expect(firstResult.status).toBe("acquired");
    if (firstResult.status !== "acquired") return;
    expect(await first.release(firstResult.lease)).toBe(true);

    now = 4_010;
    const secondResult = await second.acquire("owner_second", now, 100);
    expect(secondResult.status).toBe("acquired");
    if (secondResult.status !== "acquired") return;
    expect(secondResult.lease.fencingToken).toBe(firstResult.lease.fencingToken + 1);
  });

  it("does not let a stale same-owner cleanup release a newer lease generation", async () => {
    const { first, second } = stores(() => 5_000);
    const initial = await first.acquire("owner_remount", 5_000, 100);
    expect(initial.status).toBe("acquired");
    if (initial.status !== "acquired") return;

    const remounted = await second.acquire("owner_remount", 5_000, 100);
    expect(remounted.status).toBe("acquired");
    if (remounted.status !== "acquired") return;
    expect(remounted.lease.expiresAtMs).toBe(initial.lease.expiresAtMs + 1);
    await expect(first.release(initial.lease)).resolves.toBe(false);
    await expect(first.acquire("owner_competing", 5_000, 100)).resolves.toEqual({
      status: "held",
      holderExpiresAtMs: remounted.lease.expiresAtMs
    });
    await expect(second.release(remounted.lease)).resolves.toBe(true);
  });

  it("rejects invalid or overflowing lease clocks before opening a transaction", async () => {
    const { first } = stores(() => 0);
    await expect(first.acquire("owner_first", Number.MAX_SAFE_INTEGER, 1)).rejects.toMatchObject({
      code: "IO_FAILURE"
    });
    await expect(first.acquire("owner_first", -1, 100)).rejects.toMatchObject({
      code: "IO_FAILURE"
    });
  });
});
