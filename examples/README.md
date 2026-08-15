# Examples

Copy-paste samples for **@hamdymohamedak/openfetch**. These files are not part of `npm run build`.

Install first:

```bash
npm install @hamdymohamedak/openfetch
```

| Path | What it shows |
|------|----------------|
| [`quick-start.example.ts`](./quick-start.example.ts) | Default instance, `createClient()`, HTTP verbs, `baseURL`, `unwrapResponse` |
| [`interceptors.example.ts`](./interceptors.example.ts) | Request/response interceptors (auth headers, response shaping) |
| [`middleware.example.ts`](./middleware.example.ts) | Custom `use()` middleware wrapping the fetch adapter |
| [`plugins.example.ts`](./plugins.example.ts) | `retry`, `timeout`, `hooks`, `debug`, `strictFetch` (tree-shakeable plugins) |
| [`fluent.example.ts`](./fluent.example.ts) | `createFluentClient()`, terminals (`.json()`, `.raw()`, `.memo()`) |
| [`cache.example.ts`](./cache.example.ts) | In-memory cache with TTL and auth-safe keys |
| [`errors.example.ts`](./errors.example.ts) | `OpenFetchError`, `toShape()`, HTTP vs timeout type guards |
| [`rsc-page.example.tsx`](./rsc-page.example.tsx) | React Server Component (Next.js App Router style) |

Agent skill templates (Claude Code plugin layout) live in [`skills/`](../skills/README.md), not here.
