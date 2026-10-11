export function isAllowedMobileOrigin(origin: string) {
  const allowed = (process.env.MOBILE_ALLOWED_ORIGINS ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (process.env.NODE_ENV !== "production") {
    allowed.push("http://localhost:8081", "http://localhost:8082", "http://localhost:19006");
  }
  return allowed.includes(origin);
}
