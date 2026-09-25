import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Page not found · Parmar CRM" };

// Any address that does not exist. "/" already sends each signed-in role to its own home and a
// signed-out visitor to /login, so one link serves everyone.
export default function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center p-4">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl bg-card p-8 text-center shadow-sm">
        <FileQuestion className="size-8 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-sm text-muted-foreground">That address does not exist, or it has moved. Check the link, or go back to your home screen.</p>
        <Link href="/" className={buttonVariants()}>
          Go to home
        </Link>
      </div>
    </main>
  );
}
