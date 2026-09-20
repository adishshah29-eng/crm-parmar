import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth-flags";

/**
 * The link in the password-reset email lands here (task A3.4). It exchanges the one-time token for
 * a session and sends the person to the set-password page.
 *
 * Only "recovery" links are accepted: this endpoint is not a general-purpose sign-in door.
 * Needs the Supabase "Reset password" email template to point at it; see brain/PASSWORD-RESET.md.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNext(searchParams.get("next"));

  if (tokenHash && type === "recovery") {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL("/login?error=reset_failed", origin));
}
