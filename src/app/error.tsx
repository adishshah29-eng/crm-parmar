"use client";

import { RouteError } from "@/components/shared/RouteError";

// Errors outside the signed-in app (login, password reset, the auth callback).
export default function RootError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="grid min-h-svh place-items-center p-4">
      <RouteError {...props} homeHref="/login" />
    </main>
  );
}
