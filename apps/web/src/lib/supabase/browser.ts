import { createBrowserClient } from "@supabase/ssr";

// [Source: architecture/frontend-architecture.md#Frontend Services Layer]
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
