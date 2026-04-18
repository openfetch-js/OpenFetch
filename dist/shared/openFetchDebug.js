import { OpenFetchError } from "../domain/error.js";
import { OpenFetchForceRetry } from "../domain/forceRetry.js";
import { maskHeaderValues } from "./maskHeaders.js";
import { redactSensitiveUrlQuery } from "./redactUrlQuery.js";
/** @internal Retry layer tags the active attempt for dispatch-level verbose logs. */
export const kOpenFetchDebugAttempt = Symbol.for("openfetch.internal.debugAttempt");
const BASIC_STAGES = new Set(["request", "response", "error"]);
export function resolveOpenFetchDebugLevel(debug) {
    if (debug === true || debug === "verbose")
        return "verbose";
    if (debug === "basic")
        return "basic";
    return false;
}
export function getOpenFetchDebugAttempt(cfg) {
    const v = cfg[kOpenFetchDebugAttempt];
    return typeof v === "number" && v > 0 ? v : 1;
}
export function setOpenFetchDebugAttempt(cfg, attempt) {
    cfg[kOpenFetchDebugAttempt] = attempt;
}
export function clearOpenFetchDebugAttempt(cfg) {
    Reflect.deleteProperty(cfg, kOpenFetchDebugAttempt);
}
export function redactUrlForDebug(url) {
    return redactSensitiveUrlQuery(url, { enabled: true });
}
export function headersForDebugLog(headers) {
    const masked = maskHeaderValues(headers, undefined);
    return masked ?? undefined;
}
export function simplifyStack(stack) {
    if (stack == null || stack === "")
        return undefined;
    const lines = stack.split("\n").slice(0, 4);
    return lines.join("\n");
}
export function monotonicNowMs() {
    const perf = globalThis.performance;
    if (perf != null && typeof perf.now === "function") {
        return perf.now();
    }
    return Date.now();
}
export function classifyRetryReason(err) {
    if (err instanceof OpenFetchForceRetry)
        return "forceRetry";
    if (err instanceof OpenFetchError) {
        if (err.code === "ERR_TIMEOUT")
            return "timeout";
        if (err.code === "ERR_BAD_RESPONSE" && err.response != null) {
            return `http_${err.response.status}`;
        }
        if (err.code === "ERR_NETWORK")
            return "network";
        if (err.code === "ERR_PARSE")
            return "parse";
        if (err.code === "ERR_RETRY_TIMEOUT")
            return "retryBudget";
        if (err.code === "ERR_CANCELED")
            return "canceled";
    }
    return "unknown";
}
function defaultDebugLogger(log) {
    if (typeof console === "undefined" || typeof console.debug !== "function") {
        return;
    }
    const { stage, timestamp: _ts, ...rest } = log;
    const keys = Object.keys(rest);
    if (keys.length === 0) {
        console.debug(`[OpenFetch] ${stage}`);
    }
    else {
        console.debug(`[OpenFetch] ${stage}`, rest);
    }
}
export function emitOpenFetchDebug(config, stage, meta) {
    const level = resolveOpenFetchDebugLevel(config.debug);
    if (!level)
        return;
    if (level === "basic" && !BASIC_STAGES.has(stage))
        return;
    const event = {
        stage,
        timestamp: Date.now(),
        ...(meta ?? {}),
    };
    const sink = config.logger ?? defaultDebugLogger;
    try {
        sink(event);
    }
    catch {
        // Never let diagnostics break requests.
    }
}
export function safeMergedConfigMeta(cfg) {
    const url = cfg.url === undefined
        ? undefined
        : redactUrlForDebug(typeof cfg.url === "string" ? cfg.url : cfg.url instanceof URL ? cfg.url.href : String(cfg.url));
    return {
        method: (cfg.method ?? "GET").toUpperCase(),
        url,
        baseURL: cfg.baseURL,
        responseType: cfg.responseType,
        hasJsonSchema: cfg.jsonSchema != null,
        retryMaxAttempts: cfg.retry?.maxAttempts,
    };
}
