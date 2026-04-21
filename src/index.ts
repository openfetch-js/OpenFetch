import { createClient, create } from "./runtime/client.js";

const openFetch = createClient();

export default openFetch;

export { createClient, create };

export { createFluentClient } from "./sugar/fluent.js";
export type { FluentOpenFetchClient, RequestChain } from "./sugar/fluent.js";

export {
  retry,
  timeout,
  hooks,
  debug,
  strictFetch,
} from "./plugins/index.js";
export type {
  RetryPluginOptions,
  HooksPluginOptions,
  DebugPluginOptions,
  DebugLogPayload,
  DebugPhase,
} from "./plugins/index.js";

export {
  OpenFetchError,
  isOpenFetchError,
  isHTTPError,
  isTimeoutError,
} from "./domain/error.js";
export type {
  OpenFetchErrorShape,
  OpenFetchErrorToShapeOptions,
} from "./domain/error.js";
export { InterceptorManager } from "./domain/interceptors.js";
export {
  createRetryMiddleware,
} from "./runtime/retry.js";
export {
  MemoryCacheStore,
  appendCacheKeyVaryHeaders,
  createCacheMiddleware,
  type CacheMiddlewareOptions,
  type MemoryCacheEntry,
  type MemoryCacheStoreOptions,
} from "./runtime/cache.js";

export { assertSafeHttpUrl } from "./shared/assertSafeHttpUrl.js";
export {
  generateIdempotencyKey,
  hasIdempotencyKeyHeader,
  ensureIdempotencyKeyHeader,
} from "./shared/idempotencyKey.js";
export {
  maskHeaderValues,
  type MaskHeaderStrategy,
  type MaskHeaderOptions,
} from "./shared/maskHeaders.js";
export {
  redactSensitiveUrlQuery,
  DEFAULT_SENSITIVE_QUERY_PARAM_NAMES,
  type RedactUrlQueryOptions,
} from "./shared/redactUrlQuery.js";
export { cloneResponse } from "./shared/cloneResponse.js";

export {
  SchemaValidationError,
  isSchemaValidationError,
} from "./domain/schemaValidationError.js";
export {
  OpenFetchForceRetry,
  isOpenFetchForceRetry,
} from "./domain/forceRetry.js";
export type {
  StandardSchemaV1,
  StandardSchemaV1InferOutput,
  StandardSchemaV1Issue,
  StandardSchemaV1Options,
  StandardSchemaV1Result,
  StandardSchemaV1SuccessResult,
  StandardSchemaV1FailureResult,
  StandardSchemaV1Types,
} from "./domain/standardSchema.js";

export type {
  Middleware,
  NextFn,
  OpenFetchClient,
  OpenFetchConfig,
  OpenFetchContext,
  OpenFetchDebugEvent,
  OpenFetchInterceptors,
  OpenFetchMemoryCacheRequestOptions,
  OpenFetchProgressEvent,
  OpenFetchResponse,
  OpenFetchRetryOptions,
  RequestConfig,
  TransformRequest,
  TransformResponse,
} from "./types/index.js";
