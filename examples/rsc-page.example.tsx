/**
 * React Server Component example (Next.js App Router style).
 * Copy into `app/page.tsx` (or rename accordingly). No "use client".
 *
 * openFetch stays RSC-safe: no `window`, `document`, or `localStorage`.
 * `unwrapResponse: true` returns parsed JSON for the component tree.
 *
 * Install: npm install @hamdymohamedak/openfetch
 */

import openFetch from "@hamdymohamedak/openfetch";

export default async function Page() {
  const res = await openFetch.get("https://httpbin.org/json", {
    unwrapResponse: true,
    timeout: 10_000,
  });

  return <pre>{JSON.stringify(res, null, 2)}</pre>;
}
