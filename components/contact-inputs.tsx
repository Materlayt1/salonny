"use client";

import { useState, type InputHTMLAttributes } from "react";
import { personNameInput, phoneInput, postalCodeInput } from "@salonny/contracts/input-validation";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "defaultValue" | "type"> & { defaultValue?: string; kind: "phone" | "postal" | "name" };
export function ContactInput({ kind, defaultValue = "", ...props }: Props) {
  // Use a new form key after reset; sanitizing on paste also covers desktop keyboards.
  const [value, setValue] = useState(defaultValue);
  const sanitize = kind === "phone" ? phoneInput : kind === "postal" ? postalCodeInput : personNameInput;
  return <input {...props} type={kind === "phone" ? "tel" : "text"} inputMode={kind === "phone" ? "tel" : kind === "postal" ? "numeric" : "text"} maxLength={kind === "postal" ? 5 : kind === "phone" ? 24 : 120} pattern={kind === "postal" ? "[0-9]{5}" : undefined} title={kind === "postal" ? "5 haneli posta kodu" : undefined} value={value} onChange={(event) => setValue(sanitize(event.target.value))} />;
}
