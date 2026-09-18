import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://wjmlgoblrfrdeqgxseny.supabase.co";
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabasePublishableKey) {
  console.warn("VITE_SUPABASE_PUBLISHABLE_KEY is missing. Add it to Vercel Environment Variables.");
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey || "");
