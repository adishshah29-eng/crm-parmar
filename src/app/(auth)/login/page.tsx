import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Parmar CRM" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Parmar CRM</h1>
          <p className="text-sm text-muted-foreground">Sign in with your work email</p>
        </div>
        <LoginForm
          initialError={
            error === "deactivated"
              ? "Your account has been deactivated."
              : error === "reset_failed"
                ? "That reset link is invalid or has expired. Request a new one."
                : undefined
          }
        />
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/reset-password" className="underline-offset-2 hover:underline">
            Forgot your password?
          </Link>
        </p>
      </div>
    </main>
  );
}
