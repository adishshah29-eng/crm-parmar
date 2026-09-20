"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadImportErrors } from "@/components/import/error-report";

export function ErrorReportButton({ importId, filename, count }: { importId: string; filename: string; count: number }) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const err = await downloadImportErrors(importId, filename);
          setFailed(!!err);
          if (err) toast.error(err);
        })
      }
    >
      {pending ? "Preparing…" : failed ? "Try again" : `Error report (${count})`}
    </Button>
  );
}
