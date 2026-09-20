import Link from "next/link";
import { ResetRequestForm } from "./reset-request-form";

export const metadata = { title: "Reset password · Parmar CRM" };

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
          <p className="text-sm text-muted-foreground">Enter your work email and we will send you a link.</p>
        </div>
        <ResetRequestForm />
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
