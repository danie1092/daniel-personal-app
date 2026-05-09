"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function deleteProfileLineAction(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("user_profile").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/profile-log");
}
