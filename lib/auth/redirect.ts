export function safeAuthDestination(value: string | null | undefined, fallback = "/") {
  return value?.startsWith("/") && !value.startsWith("//") && !/[\\\u0000-\u001f]/.test(value)
    ? value
    : fallback;
}
