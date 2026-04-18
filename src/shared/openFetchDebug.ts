import { OpenFetchError } from "../domain/error.js";
import { OpenFetchForceRetry } from "../domain/forceRetry.js";
import type { OpenFetchConfig, OpenFetchDebugEvent } from "../domain/types.js";
import { maskHeaderValues } from "./maskHeaders.js";
import { redactSensitiveUrlQuery } from "./redactUrlQuery.js";

/** @internal Retry layer tags the active attempt for dispatch-level verbose logs. */
export const kOpenFetchDebugAttempt = Symbol.for("openfetch.internal.debugAttempt");

export type OpenFetchDebugRunLevel = "basic" | "verbose";

const BASIC_STAGES = new Set(["request", "response", "error"]);

export function resolveOpenFetchDebugLevel(
  debug: OpenFetchConfig["debug"]
): false | OpenFetchDebugRunLevel {
  if (debug === true || debug === "verbose") return "verbose";
  if (debug === "basic") return "basic";
  return false;
}

export function getOpenFetchDebugAttempt(cfg: OpenFetchConfig): number {
  const v = (cfg as unknown as { [k: symbol]: unknown })[kOpenFetchDebugAttempt];
  return typeof v === "number" && v > 0 ? v : 1;
}

export function setOpenFetchDebugAttempt(
  cfg: OpenFetchConfig,
  attempt: number
): void {
  (cfg as unknown as { [k: symbol]: number })[kOpenFetchDebugAttempt] = attempt;
}

export function clearOpenFetchDebugAttempt(cfg: OpenFetchConfig): void {
  Reflect.deleteProperty(cfg as object, kOpenFetchDebugAttempt);
}

export function redactUrlForDebug(url: string): string {
  return redactSensitiveUrlQuery(url, { enabled: true });
}

export function headersForDebugLog(
  headers: Record<string, string>
): Record<string, string> | undefined {
  const masked = maskHeaderValues(headers, undefined);
  return masked ?? undefined;
}

export function simplifyStack(stack: string | undefined): string | undefined {
  if (stack == null || stack === "") return undefined;
  const lines = stack.split("\n").slice(0, 4);
  return lines.join("\n");
}

export function monotonicNowMs(): number {
  const perf = globalThis.performance;
  if (perf != null && typeof perf.now === "function") {
    return perf.now();
  }
  return Date.now();
}

export function classifyRetryReason(err: unknown): string {
  if (err instanceof OpenFetchForceRetry) return "forceRetry";
  if (err instanceof OpenFetchError) {
    if (err.code === "ERR_TIMEOUT") return "timeout";
    if (err.code === "ERR_BAD_RESPONSE" && err.response != null) {
      return `http_${err.response.status}`;
    }
    if (err.code === "ERR_NETWORK") return "network";
    if (err.code === "ERR_PARSE") return "parse";
    if (err.code === "ERR_RETRY_TIMEOUT") return "retryBudget";
    if (err.code === "ERR_CANCELED") return "canceled";
  }
  return "unknown";
}

function defaultDebugLogger(log: OpenFetchDebugEvent): void {
  if (typeof console === "undefined" || typeof console.debug !== "function") {
    return;
  }
  const { stage, timestamp: _ts, ...rest } = log;
  const keys = Object.keys(rest);
  if (keys.length === 0) {
    console.debug(`[OpenFetch] ${stage}`);
  } else {
    console.debug(`[OpenFetch] ${stage}`, rest);
  }
}

export function emitOpenFetchDebug(
  config: OpenFetchConfig,
  stage: string,
  meta?: Record<string, unknown>
): void {
  const level = resolveOpenFetchDebugLevel(config.debug);
  if (!level) return;
  if (level === "basic" && !BASIC_STAGES.has(stage)) return;

  const event: OpenFetchDebugEvent = {
    stage,
    timestamp: Date.now(),
    ...(meta ?? {}),
  };

  const sink = config.logger ?? defaultDebugLogger;
  try {
    sink(event);
  } catch {
    // Never let diagnostics break requests.
  }
}

export function safeMergedConfigMeta(
  cfg: OpenFetchConfig
): Record<string, unknown> {
  const url =
    cfg.url === undefined
      ? undefined
      : redactUrlForDebug(
          typeof cfg.url === "string" ? cfg.url : cfg.url instanceof URL ? cfg.url.href : String(cfg.url)
        );
  return {
    method: (cfg.method ?? "GET").toUpperCase(),
    url,
    baseURL: cfg.baseURL,
    responseType: cfg.responseType,
    hasJsonSchema: cfg.jsonSchema != null,
    retryMaxAttempts: cfg.retry?.maxAttempts,
  };
}
