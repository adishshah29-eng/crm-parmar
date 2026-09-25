"use client";

import { useEffect } from "react";

// Last resort: the root layout itself failed. This replaces the whole document, so it carries its
// own <html>/<body> and inline styles (globals.css and Tailwind are not loaded here).
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[global error]", error.digest ?? "no-digest", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "grid",
          placeItems: "center",
          padding: 16,
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          background: "#f3f6fb",
          color: "#1a2233",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ margin: "0 0 16px", color: "#5b667a", lineHeight: 1.5 }}>
            The app could not start. Try again; if it keeps happening, tell Adish and give him the reference below.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ minHeight: 44, padding: "0 20px", borderRadius: 12, border: 0, background: "#3b82f6", color: "#fff", fontSize: 16, cursor: "pointer" }}
          >
            Try again
          </button>
          {error.digest && <p style={{ marginTop: 12, fontSize: 12, color: "#5b667a" }}>Reference: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
