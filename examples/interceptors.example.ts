/**
 * Interceptors mutate config before fetch, or the response after parse.
 *
 * Request stack: last-registered runs first.
 * Response stack: first-registered runs first.
 *
 * Use interceptors to change headers/body/status handling.
 * Use `hooks()` (see plugins.example.ts) for side-effect logging only.
 */

import { createClient } from "@hamdymohamedak/openfetch";
import type { OpenFetchConfig, OpenFetchResponse } from "@hamdymohamedak/openfetch";

export function createAuthedClient(getToken: () => string | Promise<string>) {
  const api = createClient({
    baseURL: "https://api.example.com",
    unwrapResponse: true,
  });

  api.interceptors.request.use(async (config: OpenFetchConfig) => {
    const token = await getToken();
    return {
      ...config,
      headers: {
        ...(config.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    };
  });

  api.interceptors.response.use((response: OpenFetchResponse) => {
    // Example: expose a request id from the origin without changing `data`.
    const requestId = response.headers["x-request-id"];
    if (requestId) {
      response.headers["x-request-id"] = requestId;
    }
    return response;
  });

  return api;
}

/**
 * `eject(id)` removes one interceptor; `clear()` removes the whole stack.
 */
export function temporaryRequestHeader() {
  const api = createClient({ baseURL: "https://api.example.com" });

  const id = api.interceptors.request.use((config) => ({
    ...config,
    headers: { ...(config.headers ?? {}), "X-Debug": "1" },
  }));

  return {
    api,
    removeDebugHeader() {
      api.interceptors.request.eject(id);
    },
  };
}
