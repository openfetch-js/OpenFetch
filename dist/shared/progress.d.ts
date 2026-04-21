import type { OpenFetchProgressEvent } from "../domain/types.js";
export declare function parsePositiveContentLength(headerValue: string | null): number | null;
export declare function progressFromCounts(transferredBytes: number, totalBytes: number | null): OpenFetchProgressEvent;
/**
 * Wraps a request body so `onUploadProgress` fires as bytes are read by `fetch`.
 * Unsupported shapes (`FormData`, etc.) are returned unchanged — no progress events.
 */
export declare function wrapBodyForUploadProgress(body: BodyInit, onUploadProgress: (e: OpenFetchProgressEvent) => void): BodyInit;
export declare function wrapReadableStreamWithDownloadProgress(body: ReadableStream<Uint8Array>, totalBytes: number | null, onDownloadProgress: (e: OpenFetchProgressEvent) => void): ReadableStream<Uint8Array>;
//# sourceMappingURL=progress.d.ts.map