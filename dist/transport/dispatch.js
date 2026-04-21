import { OpenFetchError } from "../domain/error.js";
import { SchemaValidationError } from "../domain/schemaValidationError.js";
import { validateJsonWithStandardSchema } from "../domain/validateJsonSchema.js";
import { assertSafeHttpUrl } from "../shared/assertSafeHttpUrl.js";
import { buildURL } from "../shared/buildURL.js";
import { encodeBasicAuth } from "../shared/basicAuth.js";
import { clearOpenFetchDebugAttempt, emitOpenFetchDebug, getOpenFetchDebugAttempt, headersForDebugLog, monotonicNowMs, redactUrlForDebug, } from "../shared/openFetchDebug.js";
import { mergeAbortSignals } from "../shared/mergeAbortSignals.js";
import { parsePositiveContentLength, progressFromCounts, wrapBodyForUploadProgress, wrapReadableStreamWithDownloadProgress, } from "../shared/progress.js";
import { headersToRecord } from "../shared/responseHeaders.js";
import { resolveFetchDispatcher } from "../shared/undiciDispatcher.js";
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
function concatUint8Arrays(chunks) {
    let len = 0;
    for (const c of chunks)
        len += c.byteLength;
    const out = new Uint8Array(len);
    let o = 0;
    for (const c of chunks) {
        out.set(c, o);
        o += c.byteLength;
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
async function parseBodyWithDownloadProgress(res, responseType, totalBytes, onDownloadProgress) {
    if (responseType === "stream") {
        if (!res.body) {
            onDownloadProgress(progressFromCounts(0, totalBytes));
            return res.body;
        }
        onDownloadProgress(progressFromCounts(0, totalBytes));
        return wrapReadableStreamWithDownloadProgress(res.body, totalBytes, onDownloadProgress);
    }
    onDownloadProgress(progressFromCounts(0, totalBytes));
    if (!res.body) {
        return parseBody(res, responseType);
    }
    const reader = res.body.getReader();
    const chunks = [];
    let transferred = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        transferred += value.byteLength;
        chunks.push(value);
        onDownloadProgress(progressFromCounts(transferred, totalBytes));
    }
    const bytes = concatUint8Arrays(chunks);
    if (responseType === "arraybuffer") {
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    if (responseType === "blob") {
        const buf = bytes.buffer;
        return new Blob([
            buf.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        ]);
    }
    if (responseType === "text")
        return new TextDecoder().decode(bytes);
    if (responseType === "json") {
        const t = new TextDecoder().decode(bytes);
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
        const t = new TextDecoder().decode(bytes);
        if (!t.trim())
            return null;
        try {
            return JSON.parse(t);
        }
        catch {
            return t;
        }
    }
    return new TextDecoder().decode(bytes);
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
    if (body !== undefined &&
        body !== null &&
        config.onUploadProgress != null) {
        body = wrapBodyForUploadProgress(body, config.onUploadProgress);
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
        const dispatcher = await resolveFetchDispatcher(config);
        const tFetch = monotonicNowMs();
        const fetchInit = {
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
        };
        if (body !== undefined &&
            body !== null &&
            typeof ReadableStream !== "undefined" &&
            body instanceof ReadableStream) {
            // Node (Undici) requires `duplex` when `body` is a stream (e.g. upload progress wrapping).
            fetchInit.duplex = "half";
        }
        if (dispatcher != null) {
            fetchInit.dispatcher = dispatcher;
        }
        const res = await fetch(urlString, fetchInit);
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
        const downloadTotalBytes = parsePositiveContentLength(res.headers.get("content-length"));
        if (config.rawResponse === true) {
            let responseForClient = res;
            if (config.onDownloadProgress != null) {
                if (res.body) {
                    config.onDownloadProgress(progressFromCounts(0, downloadTotalBytes));
                    responseForClient = new Response(wrapReadableStreamWithDownloadProgress(res.body, downloadTotalBytes, config.onDownloadProgress), {
                        status: res.status,
                        statusText: res.statusText,
                        headers: res.headers,
                    });
                }
                else {
                    config.onDownloadProgress(progressFromCounts(0, downloadTotalBytes));
                }
            }
            const openResponse = {
                data: responseForClient,
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
            parsed =
                config.onDownloadProgress != null
                    ? await parseBodyWithDownloadProgress(res, config.responseType, downloadTotalBytes, config.onDownloadProgress)
                    : await parseBody(res, config.responseType);
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
