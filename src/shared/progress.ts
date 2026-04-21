import type { OpenFetchProgressEvent } from "../domain/types.js";

export function parsePositiveContentLength(
  headerValue: string | null
): number | null {
  if (headerValue == null || headerValue === "") return null;
  const n = Number.parseInt(headerValue, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function progressFromCounts(
  transferredBytes: number,
  totalBytes: number | null
): OpenFetchProgressEvent {
  let percent: number | null = null;
  if (totalBytes != null) {
    if (totalBytes <= 0) {
      percent = transferredBytes <= 0 ? 100 : null;
    } else {
      percent = Math.min(100, (transferredBytes / totalBytes) * 100);
    }
  }
  return { transferredBytes, totalBytes, percent };
}

const UPLOAD_CHUNK = 64 * 1024;

function countingReadableStreamFromSource(
  source: ReadableStream<Uint8Array>,
  totalBytes: number | null,
  onProgress: (e: OpenFetchProgressEvent) => void
): ReadableStream<Uint8Array> {
  let transferred = 0;
  const reader = source.getReader();
  return new ReadableStream<Uint8Array>({
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

function countingReadableStreamFromUint8Array(
  data: Uint8Array,
  onProgress: (e: OpenFetchProgressEvent) => void
): ReadableStream<Uint8Array> {
  const totalBytes = data.byteLength;
  let offset = 0;
  return new ReadableStream<Uint8Array>({
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
export function wrapBodyForUploadProgress(
  body: BodyInit,
  onUploadProgress: (e: OpenFetchProgressEvent) => void
): BodyInit {
  if (typeof body === "string") {
    const bytes = new TextEncoder().encode(body);
    return countingReadableStreamFromUint8Array(bytes, onUploadProgress);
  }
  if (body instanceof URLSearchParams) {
    const bytes = new TextEncoder().encode(body.toString());
    return countingReadableStreamFromUint8Array(bytes, onUploadProgress);
  }
  if (body instanceof Blob) {
    return countingReadableStreamFromSource(
      body.stream(),
      typeof body.size === "number" ? body.size : null,
      onUploadProgress
    );
  }
  if (body instanceof ArrayBuffer) {
    return countingReadableStreamFromUint8Array(
      new Uint8Array(body),
      onUploadProgress
    );
  }
  if (ArrayBuffer.isView(body)) {
    const v = body as ArrayBufferView;
    return countingReadableStreamFromUint8Array(
      new Uint8Array(v.buffer, v.byteOffset, v.byteLength),
      onUploadProgress
    );
  }
  if (body instanceof ReadableStream) {
    return countingReadableStreamFromSource(
      body as ReadableStream<Uint8Array>,
      null,
      onUploadProgress
    );
  }
  return body;
}

export function wrapReadableStreamWithDownloadProgress(
  body: ReadableStream<Uint8Array>,
  totalBytes: number | null,
  onDownloadProgress: (e: OpenFetchProgressEvent) => void
): ReadableStream<Uint8Array> {
  return countingReadableStreamFromSource(
    body,
    totalBytes,
    onDownloadProgress
  );
}
