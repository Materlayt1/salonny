# Homepage photograph and location state

The desktop homepage now uses `public/images/salonny-hero-salon-v1.webp`
(1280 × 853, 96,386 bytes), replacing the enlarged logo and irregular mask with
a softly toned editorial photograph in an asymmetric, wavy organic mask. A pale
lavender silhouette sits behind it; the location card remains outside the mask
so its text, focus ring and actions cannot be clipped. The photograph keeps its
natural colours and full opacity: near-neutral saturation/contrast and a very
light lavender/warm multiply gradient provide a subtle editorial finish, without
brightness adjustments or a white haze. The effect is isolated to the photo;
the original asset and navigation logo remain unchanged.
The image is illustrative, not a photograph of a listed business.

Generated with the built-in imagegen tool, then resized and WebP-encoded for the
website. Original generated PNG is preserved in the local generated-images
library. No stock-photo network dependency is needed at runtime.

## Final generation prompt

Use case: photorealistic-natural. Asset type: a polished homepage hero photograph
for Salonny, a Turkish local-services booking platform. Primary request: replace
an oversized purple logo with a genuinely beautiful, warm editorial salon
lifestyle photo. Scene: an airy contemporary neighbourhood hair salon, pale
stone, warm ivory walls, subtle lavender upholstery and a small violet accent
that harmonizes with Salonny's #6C4BF4 identity, soft daylight through a tall
window, tasteful mirror and warm wood. Subjects: an adult female hairstylist
naturally arranging the dark shoulder-length hair of an adult female customer
seated comfortably; candid relaxed human connection, real skin and fabric
texture, credible hands, understated clothing. Framing: landscape 3:2
composition, medium-wide waist-up scene, stylist and customer primarily in upper
centre-right; leave lower-left calm and uncluttered because a small real HTML
location card will overlay that part of the image. Focus on people and service,
attractive high-end editorial photography but welcoming and real, not glossy
artificial skin. This is only the photo asset, not a screenshot or UI mockup.
No text, letters, watermarks, logos, giant icons, map pins, interface cards or
graphics. Opaque background.

## Location behaviour

- Web hero and discovery share a memory-only store. Already-granted browser
  permission can restore a fresh fix without prompting first-time visitors.
- Only a successful fix produces **Konumun hazır** and **Yakınımdakileri keşfet**.
  Permission alone is not treated as a successful location reading.
- Loading, timeout, denial and unavailable APIs have distinct actionable states.
  Revoked permission clears the fix; late callbacks cannot restore it.
- Coordinates are rounded to two decimal places and not saved to disk. Concurrent
  requests are deduplicated and fresh results are reused for five minutes.
- Native keeps its explicit in-app privacy confirmation. A single preference bit
  remembers that opt-in, never coordinates; restoration additionally requires
  existing OS permission. **Konumu kapat** removes the preference, so reloading
  does not turn it back on. No continuous or background watcher is installed.

## Regression checks

- `pnpm exec vitest run tests/browser-location.test.ts`
- `PLAYWRIGHT_BASE_URL=http://localhost:3001 pnpm exec playwright test e2e/home-hero-location.spec.ts`
- `pnpm mobile:export:hosted`
- `pnpm exec playwright test --config playwright.hosted-mobile.config.ts`
- Local native export: `pnpm mobile:export:preview`, then
  `MOBILE_STATIC_PREVIEW=1 pnpm mobile:test:e2e e2e-mobile/discovery.spec.ts`
- Root/mobile typechecks, lint and production build.

Verified locally on 2026-10-15: all 877 unit tests, the production build,
root/mobile typechecks and lint passed. Homepage E2E: 5 passed, 3 skipped
(the photograph is desktop-only). Hosted native preview: all 5 tests passed,
including location opt-in, reload restoration and explicit disable.

Browser references: [permission queries](https://developer.mozilla.org/en-US/docs/Web/API/Permissions/query),
[position success, errors and options](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition).
