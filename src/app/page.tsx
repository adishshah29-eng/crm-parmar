import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/lib/auth";

// "/" sends each signed-in role to its own home. proxy.ts already handles signed-out users.
export default async function Root() {
  const user = await getCurrentUser();
  redirect(user ? homeFor(user.role) : "/login");
}
