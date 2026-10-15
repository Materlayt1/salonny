type ApiOriginOptions = {
  hostedWeb: boolean;
  browserOrigin?: string;
  configuredUrl?: string;
  development: boolean;
  developmentUrl: string;
};

export function resolveApiOrigin(options: ApiOriginOptions): string {
  // Explicit opt-in prevents an installed native build from silently using a
  // browser/local API. The export-time render has no window and makes no calls.
  if (options.hostedWeb) return options.browserOrigin ?? "";
  return (options.configuredUrl ?? (options.development ? options.developmentUrl : "")).replace(/\/+$/, "");
}
