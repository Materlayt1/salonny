/** JSON from a permission row must never grant access through truthy strings. */
export function memberBoolean(value: unknown, fallback = false): boolean {
  return value === undefined ? fallback : value === true;
}

export function memberCustomerVisibility(value: unknown): "all" | "assigned" | "none" {
  if (value === undefined || value === null) return "assigned";
  return value === "all" || value === "assigned" ? value : "none";
}
