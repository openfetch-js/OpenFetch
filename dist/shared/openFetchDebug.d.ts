import type { OpenFetchConfig } from "../domain/types.js";
/** @internal Retry layer tags the active attempt for dispatch-level verbose logs. */
export declare const kOpenFetchDebugAttempt: unique symbol;
export type OpenFetchDebugRunLevel = "basic" | "verbose";
export declare function resolveOpenFetchDebugLevel(debug: OpenFetchConfig["debug"]): false | OpenFetchDebugRunLevel;
export declare function getOpenFetchDebugAttempt(cfg: OpenFetchConfig): number;
export declare function setOpenFetchDebugAttempt(cfg: OpenFetchConfig, attempt: number): void;
export declare function clearOpenFetchDebugAttempt(cfg: OpenFetchConfig): void;
export declare function redactUrlForDebug(url: string): string;
export declare function headersForDebugLog(headers: Record<string, string>): Record<string, string> | undefined;
export declare function simplifyStack(stack: string | undefined): string | undefined;
export declare function monotonicNowMs(): number;
export declare function classifyRetryReason(err: unknown): string;
export declare function emitOpenFetchDebug(config: OpenFetchConfig, stage: string, meta?: Record<string, unknown>): void;
export declare function safeMergedConfigMeta(cfg: OpenFetchConfig): Record<string, unknown>;
//# sourceMappingURL=openFetchDebug.d.ts.map