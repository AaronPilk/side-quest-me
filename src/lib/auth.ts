import { createClient } from "@supabase/supabase-js";
import { isNativeApp } from "./runtime";
export const DEMO = import.meta.env.VITE_DEMO_MODE === true;
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase =
  !DEMO && url && key && !url.includes("YOUR_PROJECT")
    ? createClient(url, key, {
        auth: {
          flowType: "pkce",
          // Native callbacks arrive through Capacitor, not the WebView URL.
          detectSessionInUrl: !isNativeApp(),
          // A failed resend must not erase the verifier for an earlier email.
          // Native callbacks pass this flow ID back to exchangeCodeForSession.
          experimental: { appendPkceFlowIdToRedirects: isNativeApp() },
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;
export async function accessToken() {
  return (await supabase?.auth.getSession())?.data.session?.access_token;
}
