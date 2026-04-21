export function parsePositiveContentLength(headerValue) {
    if (headerValue == null || headerValue === "")
        return null;
    const n = Number.parseInt(headerValue, 10);
    if (!Number.isFinite(n) || n < 0)
        return null;
    return n;
}
export function progressFromCounts(transferredBytes, totalBytes) {
    let percent = null;
    if (totalBytes != null) {
        if (totalBytes <= 0) {
            percent = transferredBytes <= 0 ? 100 : null;
        }
        else {
            percent = Math.min(100, (transferredBytes / totalBytes) * 100);
        }
    }
    return { transferredBytes, totalBytes, percent };
}
const UPLOAD_CHUNK = 64 * 1024;
function countingReadableStreamFromSource(source, totalBytes, onProgress) {
    let transferred = 0;
    const reader = source.getReader();
    return new ReadableStream({
        async pull(controller) {
            const { done, value } = await reader.read();
            if (done) {
                onProgress(progressFromCounts(transferred, totalBytes));
                controller.close();
                return;
            }
            transferred += value.byteLength;
            onProgress(progressFromCounts(transferred, totalBytes));
            controller.enqueue(value);
        },
        cancel(reason) {
            return reader.cancel(reason);
        },
    });
}
function countingReadableStreamFromUint8Array(data, onProgress) {
    const totalBytes = data.byteLength;
    let offset = 0;
    return new ReadableStream({
        start() {
            onProgress(progressFromCounts(0, totalBytes));
        },
        pull(controller) {
            if (offset >= totalBytes) {
                controller.close();
                return;
            }
            const end = Math.min(offset + UPLOAD_CHUNK, totalBytes);
            controller.enqueue(data.subarray(offset, end));
            offset = end;
            onProgress(progressFromCounts(offset, totalBytes));
        },
    });
}
/**
 * Wraps a request body so `onUploadProgress` fires as bytes are read by `fetch`.
 * Unsupported shapes (`FormData`, etc.) are returned unchanged — no progress events.
 */
export function wrapBodyForUploadProgress(body, onUploadProgress) {
    if (typeof body === "string") {
        const bytes = new TextEncoder().encode(body);
        return countingReadableStreamFromUint8Array(bytes, onUploadProgress);
    }
    if (body instanceof URLSearchParams) {
        const bytes = new TextEncoder().encode(body.toString());
        return countingReadableStreamFromUint8Array(bytes, onUploadProgress);
    }
    if (body instanceof Blob) {
        return countingReadableStreamFromSource(body.stream(), typeof body.size === "number" ? body.size : null, onUploadProgress);
    }
    if (body instanceof ArrayBuffer) {
        return countingReadableStreamFromUint8Array(new Uint8Array(body), onUploadProgress);
    }
    if (ArrayBuffer.isView(body)) {
        const v = body;
        return countingReadableStreamFromUint8Array(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), onUploadProgress);
    }
    if (body instanceof ReadableStream) {
        return countingReadableStreamFromSource(body, null, onUploadProgress);
    }
    return body;
}
export function wrapReadableStreamWithDownloadProgress(body, totalBytes, onDownloadProgress) {
    return countingReadableStreamFromSource(body, totalBytes, onDownloadProgress);
}
