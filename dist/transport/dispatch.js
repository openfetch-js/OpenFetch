import { OpenFetchError } from "../domain/error.js";
import { SchemaValidationError } from "../domain/schemaValidationError.js";
import { validateJsonWithStandardSchema } from "../domain/validateJsonSchema.js";
import { assertSafeHttpUrl } from "../shared/assertSafeHttpUrl.js";
import { buildURL } from "../shared/buildURL.js";
import { encodeBasicAuth } from "../shared/basicAuth.js";
import { clearOpenFetchDebugAttempt, emitOpenFetchDebug, getOpenFetchDebugAttempt, headersForDebugLog, monotonicNowMs, redactUrlForDebug, } from "../shared/openFetchDebug.js";
import { mergeAbortSignals } from "../shared/mergeAbortSignals.js";
import { headersToRecord } from "../shared/responseHeaders.js";
const defaultValidateStatus = (status) => status >= 200 && status < 300;
function resolveValidateStatus(config) {
    if (config.validateStatus) {
        return config.validateStatus;
    }
    const th = config.throwHttpErrors;
    if (th === false) {
        return () => true;
    }
    if (typeof th === "function") {
        return (status) => !th(status);
    }
    return defaultValidateStatus;
}
/** Suggested `Accept` when `responseType` is set and caller did not provide `accept`. */
function applySuggestedAccept(config, headers) {
    if (headers["accept"])
        return;
    const rt = config.responseType;
    if (!rt)
        return;
    if (rt === "json") {
        headers["accept"] = "application/json";
    }
    else if (rt === "text") {
        headers["accept"] = "text/plain,*/*;q=0.01";
    }
    else if (rt === "arraybuffer" || rt === "blob" || rt === "stream") {
        headers["accept"] = "*/*";
    }
}
function normalizeHeaders(h) {
    const out = {};
    for (const [k, v] of Object.entries(h)) {
        out[k.toLowerCase()] = v;
    }
    return out;
}
async function parseBody(res, responseType) {
    if (responseType === "arraybuffer")
        return res.arrayBuffer();
    if (responseType === "blob")
        return res.blob();
    if (responseType === "text")
        return res.text();
    if (responseType === "stream")
        return res.body;
    if (responseType === "json") {
        const t = await res.text();
        if (!t.trim())
            return null;
        try {
            return JSON.parse(t);
        }
        catch {
            return t;
        }
    }
    const ct = res.headers.get("content-type");
    const asJson = ct?.includes("application/json") ?? false;
    if (asJson) {
        const t = await res.text();
        if (!t.trim())
            return null;
        try {
            return JSON.parse(t);
        }
        catch {
            return t;
        }
    }
    return res.text();
}
export async function dispatch(config) {
    const urlString = buildURL(config.url, config);
    if (config.assertSafeUrl === true) {
        assertSafeHttpUrl(urlString);
    }
    let headers = normalizeHeaders({ ...(config.headers ?? {}) });
    applySuggestedAccept(config, headers);
    if (config.auth) {
        const token = encodeBasicAuth(config.auth.username, config.auth.password);
        headers["authorization"] = `Basic ${token}`;
    }
    let data = config.data !== undefined ? config.data : config.body;
    for (const t of config.transformRequest ?? []) {
        data = await t(data, headers);
        headers = normalizeHeaders(headers);
    }
    let body = data;
    if (body !== undefined &&
        body !== null &&
        typeof body === "object" &&
        !(body instanceof FormData) &&
        !(body instanceof URLSearchParams) &&
        !(body instanceof Blob) &&
        !(body instanceof ArrayBuffer) &&
        !ArrayBuffer.isView(body)) {
        if (!headers["content-type"]) {
            headers["content-type"] = "application/json";
        }
        body = JSON.stringify(body);
    }
    const credentials = config.withCredentials === true
        ? "include"
        : (config.credentials ?? undefined);
    const validateStatus = resolveValidateStatus(config);
    const controller = new AbortController();
    let timeoutId;
    let perAttemptTimedOut = false;
    if (config.timeout != null && config.timeout > 0) {
        timeoutId = setTimeout(() => {
            perAttemptTimedOut = true;
            controller.abort();
        }, config.timeout);
    }
    const signal = mergeAbortSignals(config.signal ?? undefined, controller);
    const attempt = getOpenFetchDebugAttempt(config);
    emitOpenFetchDebug(config, "fetch", {
        attempt,
        method: (config.method ?? "GET").toUpperCase(),
        url: redactUrlForDebug(urlString),
        headers: headersForDebugLog(headers),
    });
    try {
        const tFetch = monotonicNowMs();
        const res = await fetch(urlString, {
            method: (config.method ?? "GET").toUpperCase(),
            headers,
            body: body === undefined ? undefined : body,
            signal,
            cache: config.cache,
            credentials,
            integrity: config.integrity,
            keepalive: config.keepalive,
            mode: config.mode,
            redirect: config.redirect,
            referrer: config.referrer,
            referrerPolicy: config.referrerPolicy,
        });
        const fetchDurationMs = Math.round(monotonicNowMs() - tFetch);
        const contentLength = res.headers.get("content-length");
        emitOpenFetchDebug(config, "fetch_complete", {
            attempt,
            status: res.status,
            statusText: res.statusText,
            durationMs: fetchDurationMs,
            contentLength: contentLength ?? undefined,
        });
        const headerRecord = headersToRecord(res.headers);
        if (config.rawResponse === true) {
            const openResponse = {
                data: res,
                status: res.status,
                statusText: res.statusText,
                headers: headerRecord,
                config,
            };
            if (!validateStatus(res.status)) {
                throw new OpenFetchError(`Request failed with status ${res.status}`, {
                    config,
                    code: "ERR_BAD_RESPONSE",
                    response: openResponse,
                    request: { url: urlString },
                });
            }
            emitOpenFetchDebug(config, "parse", {
                attempt,
                skipped: true,
                reason: "rawResponse",
            });
            return openResponse;
        }
        let parsed;
        try {
            parsed = await parseBody(res, config.responseType);
            emitOpenFetchDebug(config, "parse", {
                attempt,
                ok: true,
                responseType: config.responseType ?? "auto",
            });
        }
        catch {
            emitOpenFetchDebug(config, "parse", {
                attempt,
                ok: false,
                responseType: config.responseType ?? "auto",
            });
            throw new OpenFetchError("Response could not be parsed", {
                config,
                code: "ERR_PARSE",
                request: { url: urlString },
            });
        }
        const openResponse = {
            data: parsed,
            status: res.status,
            statusText: res.statusText,
            headers: headerRecord,
            config,
        };
        if (!validateStatus(res.status)) {
            throw new OpenFetchError(`Request failed with status ${res.status}`, {
                config,
                code: "ERR_BAD_RESPONSE",
                response: openResponse,
                request: { url: urlString },
            });
        }
        let outData = openResponse.data;
        if (config.jsonSchema != null) {
            try {
                outData = await validateJsonWithStandardSchema(outData, config.jsonSchema);
                emitOpenFetchDebug(config, "schema", { attempt, ok: true });
            }
            catch (e) {
                if (e instanceof SchemaValidationError) {
                    emitOpenFetchDebug(config, "schema", {
                        attempt,
                        ok: false,
                        issueCount: e.issues.length,
                    });
                }
                throw e;
            }
        }
        for (const tr of config.transformResponse ?? []) {
            outData = await tr(outData);
        }
        return {
            ...openResponse,
            data: outData,
        };
    }
    catch (e) {
        if (e instanceof OpenFetchError)
            throw e;
        if (e instanceof SchemaValidationError)
            throw e;
        const aborted = signal.aborted ||
            (typeof DOMException !== "undefined" &&
                e instanceof DOMException &&
                e.name === "AbortError") ||
            (e instanceof Error && e.name === "AbortError");
        if (aborted) {
            if (config.signal?.aborted) {
                throw new OpenFetchError("Request aborted", {
                    config,
                    code: "ERR_CANCELED",
                    request: { url: urlString },
                });
            }
            if (perAttemptTimedOut) {
                throw new OpenFetchError("Request timed out", {
                    config,
                    code: "ERR_TIMEOUT",
                    request: { url: urlString },
                });
            }
            throw new OpenFetchError("Request aborted", {
                config,
                code: "ERR_CANCELED",
                request: { url: urlString },
            });
        }
        const msg = e instanceof Error ? e.message : String(e);
        throw new OpenFetchError(msg, {
            config,
            code: "ERR_NETWORK",
            request: { url: urlString },
        });
    }
    finally {
        clearOpenFetchDebugAttempt(config);
        // Clear per-attempt timer so it cannot fire after completion (avoids dangling timers / leaks).
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }
    }
}
