/**
 * Errors: typed guards, safe serialization, abort vs HTTP vs timeout.
 *
 * `toShape()` / `toJSON()` omit `config.auth` and, by default, response
 * `data` / `headers`. Pass the include flags only in trusted diagnostics.
 */

import {
  createClient,
  isHTTPError,
  isOpenFetchError,
  isTimeoutError,
  OpenFetchError,
  timeout,
} from "@hamdymohamedak/openfetch";

export function createStrictClient() {
  return createClient({
    baseURL: "https://api.example.com",
    timeout: 8_000,
  }).use(timeout(8_000));
}

export async function loadUser(id: string) {
  const api = createStrictClient();

  try {
    return await api.get(`/v1/users/${id}`);
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new Error("Upstream timed out", { cause: err });
    }
    if (isHTTPError(err)) {
      throw new Error(`HTTP ${err.response?.status}`, { cause: err });
    }
    if (isOpenFetchError(err) && err.code === "ERR_CANCELED") {
      throw new Error("Request aborted", { cause: err });
    }
    throw err;
  }
}

/** Safe-ish log payload (secrets in query strings are redacted by default). */
export function logOpenFetchError(err: unknown) {
  if (!(err instanceof OpenFetchError)) {
    console.error(err);
    return;
  }
  console.error(err.toShape());
}

export async function withAbort(url: string, ms = 3_000) {
  const api = createClient();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await api.get(url, { signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}
