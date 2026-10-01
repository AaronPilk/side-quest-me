import { z } from "zod";

// Product intent only. This is never proof of business approval or a server role.
export const accountTypeSchema = z.enum(["personal", "brand"]);
export type AccountType = z.infer<typeof accountTypeSchema>;

export function normalizeAccountType(
  value: unknown,
  brand?: { state?: string } | null,
): AccountType | null {
  const parsed = accountTypeSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  // An approved business is concrete legacy evidence; roles and pending requests
  // are not. An explicit personal selection above always takes precedence.
  return value == null && brand?.state === "approved" ? "brand" : null;
}

export function isBrandAccount(
  value?: {
    accountType?: unknown;
    brand?: { state?: string } | null;
  } | null,
): boolean {
  return normalizeAccountType(value?.accountType, value?.brand) === "brand";
}

/** Who may open the Business workspace. Explicit Brand always; an account with
 * no stated type that already holds a business record (any review state) keeps
 * access to its own application. Explicit Personal never. This is routing, not
 * approval: approved-only actions still check the business state server-side. */
export function hasBusinessWorkspace(
  value?: {
    accountType?: unknown;
    brand?: { state?: string } | null;
  } | null,
): boolean {
  const stated = accountTypeSchema.safeParse(value?.accountType);
  if (stated.success) return stated.data === "brand";
  return Boolean(value?.brand);
}
