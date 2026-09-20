"use client";

import Papa from "papaparse";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { toast } from "sonner";
import { finishImport, importBatch, startImport } from "@/actions/import";
import { downloadImportErrors } from "@/components/import/error-report";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPhone } from "@/lib/format";
import { cleanPhone, guessMapping, parseReceivedAt, toImportRow } from "@/lib/import/parse";
import { loadMapping, saveMapping } from "@/lib/import/mapping-store";
import {
  IMPORT_BATCH_SIZE,
  IMPORT_FIELDS,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS,
  type ColumnMapping,
  type ImportField,
  type ImportSummary,
} from "@/lib/import/schemas";

export type SourceOption = { code: string; name: string; isLive: boolean };

const selectCls =
  "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const FIELD_LABEL: Record<ImportField, string> = {
  phone: "Phone number",
  name: "Name",
  email: "Email",
  project: "Project",
  receivedAt: "Received date",
  campaign: "Campaign",
};

type Stage = "choose" | "map" | "running" | "done";
type Csv = { filename: string; headers: string[]; rows: Record<string, string>[] };

/**
 * CSV import for admins (task A3.1): choose a file, map its columns, preview, import in batches,
 * then read the summary and download the error rows. The browser only reads and previews the file.
 * The server cleans every row again and the database applies the ingestion rules
 * (brain/05-lead-flow.md), so nothing done here can bypass them.
 */
export function ImportWizard({ sources, projects }: { sources: SourceOption[]; projects: { id: string; name: string }[] }) {
  const [stage, setStage] = useState<Stage>("choose");
  const [source, setSource] = useState("");
  const [campaign, setCampaign] = useState("");
  const [csv, setCsv] = useState<Csv>();
  const [mapping, setMapping] = useState<ColumnMapping>();
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<ImportSummary>();
  const [stoppedEarly, setStoppedEarly] = useState(false);
  const cancelRef = useRef(false);

  const sourceInfo = sources.find((s) => s.code === source);
  const knownProjects = useMemo(() => new Set(projects.map((p) => p.name.trim().toLowerCase())), [projects]);

  // ---- 1. choose
  const onFile = (file: File | undefined) => {
    setError(undefined);
    if (!file) return;
    if (!source) return setError("Pick the source first, so the right column mapping is remembered.");
    if (file.size > IMPORT_MAX_FILE_BYTES) return setError(`That file is over ${IMPORT_MAX_FILE_BYTES / 1024 / 1024} MB. Split it and import the parts.`);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const headers = (res.meta.fields ?? []).filter(Boolean);
        if (headers.length === 0 || res.data.length === 0) return setError("That file has no rows. Is it a CSV with a header row?");
        if (res.data.length > IMPORT_MAX_ROWS) return setError(`That file has ${res.data.length} rows. The limit is ${IMPORT_MAX_ROWS} per import; split it.`);
        setCsv({ filename: file.name, headers, rows: res.data });
        setMapping(loadMapping(source, headers) ?? guessMapping(headers));
        setStage("map");
      },
      error: () => setError("Could not read that file. Save it as CSV (UTF-8) and try again."),
    });
  };

  // ---- 2. check the mapping against the whole file (a courtesy: the server is the authority)
  const check = useMemo(() => {
    if (!csv || !mapping) return null;
    let badPhone = 0;
    let unknownProject = 0;
    let badDate = 0;
    for (const r of csv.rows) {
      const row = toImportRow(1, r, mapping);
      if (!cleanPhone(row.phone)) badPhone++;
      if (!row.project || !knownProjects.has(row.project.toLowerCase())) unknownProject++;
      if (row.receivedAt && !parseReceivedAt(row.receivedAt).ok) badDate++;
    }
    return { badPhone, unknownProject, badDate };
  }, [csv, mapping, knownProjects]);

  const mappingReady =
    !!mapping && !!mapping.columns.phone && (mapping.projectMode === "column" ? !!mapping.columns.project : !!mapping.fixedProject);

  const setColumn = (field: ImportField, header: string) =>
    setMapping((m) => (m ? { ...m, columns: { ...m.columns, [field]: header } } : m));

  // ---- 3. run
  const run = async () => {
    if (!csv || !mapping) return;
    setError(undefined);
    cancelRef.current = false;
    setStoppedEarly(false);
    setStage("running");
    setProgress({ done: 0, total: csv.rows.length });

    const started = await startImport({ filename: csv.filename, totalRows: csv.rows.length, sourceCode: source });
    if (!started.ok) {
      setError(started.error);
      return setStage("map");
    }
    saveMapping(source, mapping);

    let done = 0;
    for (let i = 0; i < csv.rows.length; i += IMPORT_BATCH_SIZE) {
      if (cancelRef.current) {
        setStoppedEarly(true);
        break;
      }
      const slice = csv.rows.slice(i, i + IMPORT_BATCH_SIZE);
      const res = await importBatch({
        importId: started.data.importId,
        sourceCode: source,
        campaign: campaign.trim() || undefined,
        // row numbers match the spreadsheet: the header is line 1, so the first data row is 2
        rows: slice.map((r, k) => toImportRow(i + k + 2, r, mapping)),
      });
      if (!res.ok) {
        setError(`${res.error} (stopped after ${done} of ${csv.rows.length} rows; it is safe to run the file again).`);
        break;
      }
      done += slice.length;
      setProgress({ done, total: csv.rows.length });
    }

    const final = await finishImport(started.data.importId);
    if (final.ok) setSummary(final.data);
    else setError(final.error);
    setStage("done");
  };

  const downloadErrors = async () => {
    if (!summary) return;
    const err = await downloadImportErrors(summary.importId, summary.filename);
    if (err) toast.error(err);
  };

  const reset = () => {
    setStage("choose");
    setCsv(undefined);
    setMapping(undefined);
    setSummary(undefined);
    setError(undefined);
    setStoppedEarly(false);
  };

  // ------------------------------------------------------------------ render
  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {stage === "choose" && (
        <section className="max-w-xl space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold">1. Choose the file</h2>
          <div className="space-y-1.5">
            <Label htmlFor="source">Where did these leads come from?</Label>
            <select id="source" className={selectCls} value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Choose…</option>
              {sources.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                  {s.isLive ? " (live)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaign">Campaign (optional)</Label>
            <Input id="campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="Used for every row unless the file has a campaign column" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="file">CSV file</Label>
            <Input id="file" type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
            <p className="text-xs text-muted-foreground">
              Up to {IMPORT_MAX_ROWS.toLocaleString()} rows and {IMPORT_MAX_FILE_BYTES / 1024 / 1024} MB, with a header row. Nothing is imported until you confirm.
            </p>
          </div>
        </section>
      )}

      {stage === "map" && csv && mapping && (
        <section className="space-y-4 rounded-lg border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">2. Match the columns</h2>
            <span className="text-sm text-muted-foreground">
              {csv.filename} · {csv.rows.length.toLocaleString()} rows · {sourceInfo?.name}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {IMPORT_FIELDS.filter((f) => f !== "project").map((field) => (
              <div key={field} className="space-y-1.5">
                <Label htmlFor={`map-${field}`}>
                  {FIELD_LABEL[field]}
                  {field === "phone" && <span className="text-destructive"> *</span>}
                </Label>
                <select id={`map-${field}`} className={selectCls} value={mapping.columns[field]} onChange={(e) => setColumn(field, e.target.value)}>
                  <option value="">— none —</option>
                  {csv.headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}

            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
              <Label>
                Project <span className="text-destructive">*</span>
              </Label>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="projectMode" checked={mapping.projectMode === "column"} onChange={() => setMapping({ ...mapping, projectMode: "column" })} />
                  Read it from a column
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="projectMode" checked={mapping.projectMode === "fixed"} onChange={() => setMapping({ ...mapping, projectMode: "fixed" })} />
                  Every row is for one project
                </label>
              </div>
              {mapping.projectMode === "column" ? (
                <select aria-label="Project column" className={`${selectCls} max-w-sm`} value={mapping.columns.project} onChange={(e) => setColumn("project", e.target.value)}>
                  <option value="">Choose the column…</option>
                  {csv.headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              ) : (
                <select aria-label="Project for every row" className={`${selectCls} max-w-sm`} value={mapping.fixedProject} onChange={(e) => setMapping({ ...mapping, fixedProject: e.target.value })}>
                  <option value="">Choose the project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              )}
              <p className="text-xs text-muted-foreground">A project that is not in the system is reported as an error. It is never created for you.</p>
            </div>
          </div>

          {sourceInfo?.isLive && (
            <Alert>
              <AlertDescription>
                <strong>{sourceInfo.name} is a live source.</strong> New leads are shared out to callers straight away (during working hours,
                10:30–19:30) and their 45-minute clock starts. Outside working hours they wait for 10:30. Duplicates never change an existing owner.
              </AlertDescription>
            </Alert>
          )}

          {check && (check.badPhone > 0 || check.unknownProject > 0 || check.badDate > 0) && (
            <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                Heads-up, based on this mapping:
                <ul className="list-disc pl-5">
                  {check.badPhone > 0 && <li>{check.badPhone} {check.badPhone === 1 ? "row has" : "rows have"} no valid phone number</li>}
                  {check.unknownProject > 0 && <li>{check.unknownProject} {check.unknownProject === 1 ? "row names" : "rows name"} a project that is not in the system</li>}
                  {check.badDate > 0 && <li>{check.badDate} {check.badDate === 1 ? "row has" : "rows have"} a date I cannot read</li>}
                </ul>
                Those rows will be skipped and listed in an error report you can download and fix. The rest import normally.
              </div>
            </div>
          )}

          <div className="overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {csv.rows.slice(0, 8).map((r, i) => {
                  const row = toImportRow(i + 2, r, mapping);
                  const phone = cleanPhone(row.phone);
                  const known = row.project && knownProjects.has(row.project.toLowerCase());
                  const date = row.receivedAt ? parseReceivedAt(row.receivedAt) : null;
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 2}</TableCell>
                      <TableCell className={phone ? "" : "text-destructive"}>{phone ? formatPhone(phone) : row.phone || "missing"}</TableCell>
                      <TableCell>{row.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className={known ? "" : "text-amber-800"}>{row.project || "missing"}{row.project && !known && " (not in the system)"}</TableCell>
                      <TableCell className={date && !date.ok ? "text-destructive" : ""}>{row.receivedAt ? (date?.ok ? "ok" : "not understood") : <span className="text-muted-foreground">now</span>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">First 8 rows. Your mapping is remembered for {sourceInfo?.name} in this browser.</p>

          <div className="flex flex-wrap gap-2">
            <Button disabled={!mappingReady} onClick={run}>
              <Upload /> Import {csv.rows.length.toLocaleString()} rows
            </Button>
            <Button variant="ghost" onClick={reset}>
              Choose a different file
            </Button>
          </div>
        </section>
      )}

      {stage === "running" && (
        <section className="max-w-xl space-y-3 rounded-lg border p-4" aria-live="polite">
          <h2 className="font-semibold">3. Importing…</h2>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress.done} aria-valuemin={0} aria-valuemax={progress.total}>
            <div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">
            {progress.done.toLocaleString()} of {progress.total.toLocaleString()} rows
          </p>
          <Button variant="outline" onClick={() => (cancelRef.current = true)}>
            Stop after this batch
          </Button>
          <p className="text-xs text-muted-foreground">Stopping keeps everything imported so far. Running the same file again later is safe: rows already in the system count as duplicates.</p>
        </section>
      )}

      {stage === "done" && (
        <section className="max-w-xl space-y-3 rounded-lg border p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="size-5 text-green-700" aria-hidden /> {stoppedEarly ? "Stopped early" : "Import finished"}
          </h2>
          {summary ? (
            <>
              <dl className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">New leads</dt>
                  <dd className="text-2xl font-semibold">{summary.inserted.toLocaleString()}</dd>
                </div>
                <div className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">Duplicates</dt>
                  <dd className="text-2xl font-semibold">{summary.duplicates.toLocaleString()}</dd>
                </div>
                <div className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">Errors</dt>
                  <dd className="text-2xl font-semibold">{summary.errors.toLocaleString()}</dd>
                </div>
              </dl>
              <p className="text-sm text-muted-foreground">
                Duplicates are the same buyer on the same project: the existing lead and its owner are untouched, and this arrival was added to its list of sources.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">The totals could not be loaded, but the import is recorded under Recent imports.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {summary && summary.errors > 0 && (
              <Button variant="outline" onClick={downloadErrors}>
                Download error report ({summary.errors})
              </Button>
            )}
            <Button onClick={reset}>Import another file</Button>
          </div>
        </section>
      )}
    </div>
  );
}
