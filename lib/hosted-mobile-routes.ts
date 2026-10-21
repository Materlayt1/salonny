// Only screen URLs are rewritten. Missing JavaScript/CSS must stay 404 instead
// of returning an HTML document (which causes strict module MIME failures).
const screens = [
  "auth", "discover", "favorites", "appointments", "profile", "booking-action",
  "notifications", "profile-edit", "business-setup",
];

export const hostedMobileRewrites = [
  { source: "/mobile", destination: "/mobile/index.html" },
  { source: "/mobile/manage", destination: "/mobile/manage/index.html" },
  ...screens.map((screen) => ({ source: `/mobile/${screen}`, destination: `/mobile/${screen}.html` })),
  ...[
    ["business", "slug"], ["booking", "slug"], ["appointment", "id"], ["manage", "section"],
  ].map(([screen, param]) => ({
    source: `/mobile/${screen}/:value([^/.]+)`,
    destination: `/mobile/${screen}/%5B${param}%5D.html`,
  })),
];
