# Web and native-browser preview sharing

The existing Next.js Vercel project serves the website at `/` and a separately
exported Expo/React Native browser preview at `/mobile`. This is not a WebView
replacement for the native app and does not publish an App Store / Play build.

## Build

`vercel.json` runs `pnpm mobile:export:hosted && pnpm build`. Expo exports into
the ignored generated directory `public/mobile`; the ordinary local preview
at `apps/mobile/dist` and port 8082 is unchanged. The exporter refuses to replace
an existing non-generated output directory. Do not store source files there.

Only this export enables `experiments.baseUrl=/mobile` and
`EXPO_PUBLIC_API_SAME_ORIGIN=1`. Hosted browser requests use the current origin's
`/api` endpoints, including public auth configuration and the rate-limited auth
gateway. Installed native builds still require their configured API URL. No
service-role, Redis, deployment bypass secret, or share code belongs in a bundle
or source control.

Explicit screen rewrites serve Expo's matching HTML documents, including dynamic
business, booking and management templates. Unknown JavaScript/CSS URLs are not
rewritten to homepage HTML. `/mobile` is marked `noindex, nofollow`.

## Sharing

Use the current `codex/dynamic-preview` branch deployment's Share dialog and
select **Anyone with the link**. Share the exact copied URL, including its query
string. The mobile link uses the same domain/query with `/mobile` as its path.
The plain protected domain without its share query may still require Vercel
sign-in. Vercel's Hobby plan allows only one shareable link; replacing it revokes
the old share link. Never turn off protection for the whole project just to share
these two previews. Never publish the outdated production deployment by mistake.

The share link only grants access through Vercel's deployment gate. Salonny login,
business membership, API permissions and database RLS still apply. The shared
preview uses the real backend: submitted registrations and appointments are real.
No test account, appointment, SMS or payment is created by the publishing checks.

## Verification

- `pnpm exec vitest run tests/hosted-mobile-preview.test.ts tests/mobile-preview-routing.test.ts tests/auth-sdk-gateway.test.ts`
- `pnpm typecheck` and `pnpm mobile:typecheck`
- `pnpm mobile:export:hosted`
- `pnpm exec playwright test --config playwright.hosted-mobile.config.ts`
- `pnpm lint`, `pnpm test:security`, `pnpm build`
- After Vercel is Ready, open both exact shared URLs in a clean session; check
  mobile assets, API configuration, deep-route reloads and anonymous API denial.
- Revoke access from the Share dialog using **Only people with access** when the
  friend-testing window ends. Do not commit share URLs containing access codes.
