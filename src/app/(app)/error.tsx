"use client";

import { RouteError } from "@/components/shared/RouteError";

// Any error in a screen inside the signed-in app. Lives beside (app)/layout.tsx, so the sidebar and
// top bar stay on screen and the person can navigate away instead of staring at a blank page.
export default function AppError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError {...props} />;
}
