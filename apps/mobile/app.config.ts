import type { ConfigContext, ExpoConfig } from "expo/config";

const appConfig = ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? "Salonny",
  slug: config.slug ?? "salonny",
  experiments: {
    ...config.experiments,
    // Only the hosted browser preview lives below /mobile. Native store builds
    // and the ordinary localhost preview retain their existing root routes.
    ...(process.env.SALONNY_HOSTED_MOBILE_PREVIEW === "1" ? { baseUrl: "/mobile" } : {}),
  },
});

export default appConfig;
