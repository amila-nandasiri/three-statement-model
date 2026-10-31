import { Download, FileSpreadsheet, FileText, Lock, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { downloadTemplateCsvs, downloadTemplateWorkbook, readWorkbook } from "../lib/excel";
import { detectKind, importInputs, type FileKind, type UploadedFile } from "../lib/importer";
import type { Inputs } from "../lib/model";

const KIND_LABEL: Record<FileKind, string> = { history: "History", drivers: "Drivers", settings: "Settings", unknown: "Not recognised" };

export function UploadPanel({ onClose, onLoad }: { onClose: () => void; onLoad: (i: Inputs, notes: string[]) => void }) {
  const [files, setFiles] = useState<(UploadedFile & { kind: FileKind })[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function add(list: FileList | null) {
    if (!list) return;
    const problems: string[] = [];
    const got: UploadedFile[] = [];
    for (const f of [...list]) {
      if (/\.xlsx$/i.test(f.name)) {
        try {
          got.push(...(await readWorkbook(f)));
        } catch {
          problems.push(`${f.name}: couldn't read this workbook. Try saving it again as .xlsx, or as CSV.`);
        }
      } else if (/\.xls$/i.test(f.name)) problems.push(`${f.name}: old .xls format isn't supported. Save it as .xlsx or CSV.`);
      else got.push({ name: f.name, text: await f.text() });
    }
    setErrors(problems);
    setFiles((prev) => [...prev.filter((p) => !got.some((g) => g.name === p.name)), ...got.map((g) => ({ ...g, kind: detectKind(g.text) }))]);
  }

  function run() {
    const r = importInputs(files.filter((f) => f.kind !== "unknown"));
    if (!r.ok) return setErrors(r.errors);
    onLoad(r.inputs, r.notes);
  }

  return (
    <div className="fixed inset-0 z-50 bg-zinc-900/40 backdrop-blur-sm flex items-start md:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-8" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <div className="flex items-start justify-between gap-4 p-6 pb-0">
          <div>
            <h2 id="upload-title" className="text-lg font-semibold text-zinc-900">Model your own company</h2>
            <p className="text-sm text-zinc-500 mt-1">Upload your historical statements and forecast drivers. The model builds all three statements from them.</p>
          </div>
          <button onClick={onClose} className="p-1.5 -m-1.5 text-zinc-400 hover:text-zinc-900" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <p className="flex gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
            <Lock className="w-4 h-4 mt-0.5 shrink-0" />
            Your files never leave your computer. Everything is calculated inside your browser, and nothing is uploaded or stored.
          </p>
          <div className="rounded-xl border border-zinc-200 p-4">
            <p className="text-sm font-medium text-zinc-900">Start from the template</p>
            <p className="text-sm text-zinc-500 mt-0.5">History, Drivers and Settings sheets, pre-filled with the sample to overwrite.</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={() => downloadTemplateWorkbook()} className="inline-flex items-center gap-1.5 text-sm font-medium bg-emerald-700 text-white rounded-full px-4 py-2 hover:bg-emerald-800">
                <FileSpreadsheet className="w-4 h-4" /> Excel template (.xlsx)
              </button>
              <button onClick={downloadTemplateCsvs} className="inline-flex items-center gap-1.5 text-sm border border-zinc-200 rounded-full px-3 py-2 text-zinc-700 hover:border-zinc-400">
                <Download className="w-3.5 h-3.5" /> CSV templates (3 files)
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              add(e.dataTransfer.files);
            }}
            className={`w-full border-2 border-dashed rounded-xl px-6 py-7 text-center transition-colors ${dragging ? "border-zinc-900 bg-zinc-50" : "border-zinc-300 hover:border-zinc-400"}`}
          >
            <Upload className="w-6 h-6 mx-auto text-zinc-400" />
            <p className="text-sm text-zinc-700 mt-2">
              <span className="font-medium text-zinc-900">Click to choose</span> or drag files here
            </p>
            <p className="text-xs text-zinc-500 mt-1">The Excel template, or History + Drivers (+ Settings) CSV files</p>
          </button>
          <input ref={fileInput} type="file" accept=".csv,.txt,.xlsx,.xls" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
          {files.length > 0 && (
            <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl">
              {files.map((f) => (
                <li key={f.name} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
                  <span className="flex-1 truncate text-zinc-900">{f.name}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${f.kind === "unknown" ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-700"}`}>{KIND_LABEL[f.kind]}</span>
                  <button onClick={() => setFiles(files.filter((x) => x.name !== f.name))} className="text-zinc-400 hover:text-zinc-900" aria-label={`Remove ${f.name}`}>
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {errors.length > 0 && (
            <ul className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3 space-y-1 list-disc list-inside">
              {errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-zinc-200 bg-zinc-50 rounded-b-2xl">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-full text-zinc-700 hover:bg-zinc-200/60">Cancel</button>
          <button
            onClick={run}
            disabled={!files.some((f) => f.kind === "history") || !files.some((f) => f.kind === "drivers")}
            className="text-sm font-medium px-5 py-2 rounded-full bg-zinc-900 text-white hover:bg-zinc-700 disabled:bg-zinc-300 disabled:cursor-not-allowed"
          >
            Build model
          </button>
        </div>
      </div>
    </div>
  );
}
