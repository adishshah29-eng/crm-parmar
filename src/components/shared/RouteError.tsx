"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/states";

/**
 * What every error boundary shows. Next hides the real message of a server error in production and
 * gives a `digest` instead; it is logged so a report ("it broke at 11:42, reference 1234") can be
 * matched to the server log. Never show error.message: it can carry table and column names.
 */
export function RouteError({
  error,
  retry,
  homeHref = "/",
}: {
  error: Error & { digest?: string };
  retry: () => void;
  homeHref?: string;
}) {
  useEffect(() => {
    console.error("[route error]", error.digest ?? "no-digest", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-10">
      <ErrorState
        message="This page could not be loaded. Nothing you entered has been lost that was already saved. Try again, or go back to your home screen."
        action={
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button onClick={() => retry()}>Try again</Button>
            <Link href={homeHref} className={buttonVariants({ variant: "outline" })}>
              Go to home
            </Link>
          </div>
        }
      />
      {error.digest && <p className="mt-3 text-center text-xs text-muted-foreground">Reference: {error.digest}</p>}
    </div>
  );
}
