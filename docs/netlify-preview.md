# Netlify web and native-browser preview

This deployment keeps the existing Next.js API/backend and Supabase database.
The website is served at `/`; the exported native browser preview is served at
`/mobile`. It is not a static-only GitHub Pages export and it does not publish
App Store or Play Store packages.

## Build

Import `Materlayt1/salonny`, select `codex/dynamic-preview`, and deploy the root
Next.js project. `netlify.toml` builds the hosted native preview before Next.js,
publishes `.next`, and selects Node 24/pnpm 11.25.0. Netlify installs its current
Next.js adapter automatically; do not pin a legacy adapter or add an SPA
catch-all rewrite.

Next.js rewrites to `public` files are not supported by Netlify's adapter.
The explicit CDN rules cover only exported native screen paths. API routes and
missing `_expo` JavaScript/CSS requests are not redirected to HTML. Native HTML
has `noindex, nofollow` and `nosniff` headers.

## Environment and security

Set these in the **new Salonny project's environment settings**, with both
Builds and Functions scopes where applicable, never in Git or `netlify.toml`:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`: existing
  public project configuration, not service-role credentials.
- `NEXT_PUBLIC_APP_URL`: this project's actual HTTPS `netlify.app` URL.
- `HOSTING_PLATFORM=netlify`: required in Functions scope so rate limiting
  uses Netlify's edge-set `x-nf-client-connection-ip`. Foreign-provider headers
  and rotating user agents must not let visitors choose their identity.
- `SUPABASE_SERVICE_ROLE_KEY`: existing server-only key, only if explicitly
  approved for transfer to Netlify. Never prefix it with `NEXT_PUBLIC_`.
- One complete, writable Redis REST pair: `UPSTASH_REDIS_REST_URL/TOKEN` **or**
  `KV_REST_API_URL/TOKEN`. Never use the read-only token or mix the two families.
- `RATE_LIMIT_NAMESPACE=salonny-netlify-preview` to isolate preview buckets.

Do not copy database URLs, payment, SMS, WhatsApp or unrelated project secrets.
Do not disable fail-closed rate limiting, TLS checks, API auth or database RLS
to make a broken deployment appear functional. Do not create test registrations
or appointments against the real backend. Existing pending/uncommitted database
policy work must not be silently included in this deployment.

Publish the new project's main URL with Public visitor access. This only removes
the hosting-provider gate; Salonny login and owner/manager/employee permissions
remain. Do not change access for other Netlify projects. No paid plan changes.

Password-reset/confirmation emails additionally require this exact project's
callback URL in Supabase's allowed redirect configuration. Do not authorize all
`*.netlify.app` domains. A new hosting origin does not share existing login or
location permission cookies with Vercel.

## Acceptance

- `pnpm exec vitest run tests/netlify-deployment.test.ts tests/api-security.test.ts tests/hosted-mobile-preview.test.ts tests/auth-sdk-gateway.test.ts`
- Root/mobile typecheck, lint, native hosted export and production build.
- Cookie-free HTTPS checks: homepage, new photo, `/mobile`, `/mobile/auth`,
  native business and management deep links, public API configuration.
- Native entry bundle is JavaScript, not HTML; missing native modules are 404.
- Anonymous protected API calls return JSON 401, foreign-origin writes 403.
- Invalid login uses the real auth gateway and does not fail due to missing
  Redis (do not invent or submit user credentials).
- Inspect the deployed website/native preview and leave both links open.

References: [Next.js on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/),
[function environment scopes](https://docs.netlify.com/build/functions/environment-variables/),
[Netlify client-IP header](https://answers.netlify.com/t/upcoming-change-stripping-exposed-netlify-headers-from-function-and-proxy-requests/52665).
