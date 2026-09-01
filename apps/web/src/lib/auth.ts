import { createClient } from "@/lib/supabase/server";

// [Source: architecture/backend-architecture.md#Service Architecture — Server Action Template]
export async function getCurrentAccount(): Promise<{ id: string; email: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) return null;

  return { id: user.id, email: user.email };
}
