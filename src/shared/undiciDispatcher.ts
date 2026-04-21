import { OpenFetchError } from "../domain/error.js";
import type { OpenFetchConfig } from "../domain/types.js";

let cachedAllowH2Agent: unknown;

/**
 * Resolves Undici `fetch` `dispatcher` from {@link OpenFetchConfig.dispatcher} or {@link OpenFetchConfig.allowH2}.
 * When neither applies, returns `undefined` without importing `undici`.
 */
export async function resolveFetchDispatcher(
  config: OpenFetchConfig
): Promise<unknown | undefined> {
  if (config.dispatcher != null) {
    return config.dispatcher;
  }
  if (config.allowH2 !== true) {
    return undefined;
  }
  if (cachedAllowH2Agent !== undefined) {
    return cachedAllowH2Agent;
  }
  let undici: typeof import("undici");
  try {
    undici = await import("undici");
  } catch {
    throw new OpenFetchError(
      "OpenFetch: `allowH2: true` requires the `undici` package (dynamic import failed). Install: npm i undici",
      { config, code: "ERR_UNDICI_REQUIRED" }
    );
  }
  cachedAllowH2Agent = new undici.Agent({ allowH2: true });
  return cachedAllowH2Agent;
}
