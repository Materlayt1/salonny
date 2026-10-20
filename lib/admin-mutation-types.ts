export type AdminMutationKind = "business" | "user" | "review" | "category";
export type AdminMutationState = { ok: boolean; message: string };
export type AdminField = { name: string; label: string; value: string | boolean; type?: "text" | "number" | "checkbox"; options?: Array<[string, string]>; required?: boolean; maxLength?: number; min?: number; max?: number; pattern?: string };
