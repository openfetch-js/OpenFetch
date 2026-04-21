import type { OpenFetchConfig } from "../domain/types.js";
/**
 * Resolves Undici `fetch` `dispatcher` from {@link OpenFetchConfig.dispatcher} or {@link OpenFetchConfig.allowH2}.
 * When neither applies, returns `undefined` without importing `undici`.
 */
export declare function resolveFetchDispatcher(config: OpenFetchConfig): Promise<unknown | undefined>;
//# sourceMappingURL=undiciDispatcher.d.ts.map