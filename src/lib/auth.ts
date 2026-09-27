import { createClient } from "@supabase/supabase-js";
export const DEMO = import.meta.env.VITE_DEMO_MODE === true;
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase =
  !DEMO && url && key && !url.includes("YOUR_PROJECT")
    ? createClient(url, key, {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;
export async function accessToken() {
  return (await supabase?.auth.getSession())?.data.session?.access_token;
}
