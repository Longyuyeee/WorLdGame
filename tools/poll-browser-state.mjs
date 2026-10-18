/** Await the evaluated value explicitly. In this installed browser runner an
 * async waitForFunction predicate can yield a false-valued handle immediately.
 */
export async function pollBrowserState(page, predicate, argument, { timeoutMs = 30000, intervalMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const result = await page.evaluate(predicate, argument);
    if (result) return result;
    if (Date.now() >= deadline) throw new Error(`Browser condition did not become true within ${timeoutMs} ms`);
    await new Promise(resolve => setTimeout(resolve, Math.min(intervalMs, Math.max(1, deadline - Date.now()))));
  }
}
