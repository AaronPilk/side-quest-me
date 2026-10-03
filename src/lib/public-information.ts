/** Public support contact. Replace only with an owner-approved, monitored inbox. */
export const PUBLIC_SUPPORT_EMAIL = "";
export const POLICY_UPDATED = "October 3, 2026";

export const INFORMATION_LINKS = [
  { path: "/support", label: "Help & support" },
  { path: "/privacy", label: "Privacy policy" },
  { path: "/terms", label: "Terms of use" },
  { path: "/community-guidelines", label: "Community guidelines" },
] as const;

/** These pages stay readable without sign-in or completed account setup. */
export function isPublicInformationPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return INFORMATION_LINKS.some(({ path }) => path === normalized);
}
