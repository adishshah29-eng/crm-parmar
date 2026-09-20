import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/shared/SignOutButton";
import { mustResetPassword } from "@/lib/auth-flags";
import { createServerClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./set-password-form";

export const metadata = { title: "Choose a password · Parmar CRM" };

// Reached three ways: from the email reset link, when a super admin has required a change, and
// voluntarily via "Change password". proxy.ts keeps signed-out visitors away from it.
export default async function SetPasswordPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const forced = mustResetPassword(user);

  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
          <p className="text-sm text-muted-foreground">
            {forced ? "You need to choose a new password before you can continue." : `Signed in as ${user.email}.`}
          </p>
        </div>
        <SetPasswordForm />
        <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
          {!forced && (
            <Link href="/" className="underline-offset-2 hover:underline">
              Cancel
            </Link>
          )}
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
