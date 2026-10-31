import { AlertTriangle, ArrowLeft, Check, ChevronDown, Download, FileSpreadsheet, Github, Printer, RotateCcw, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GrowthChart, LeverageChart, LiquidityChart } from "./components/Charts";
import { AssumptionsEditor, Statements } from "./components/Statements";
import { UploadPanel } from "./components/UploadPanel";
import { SCENARIO_COLOR } from "./lib/colors";
import { downloadModelWorkbook, downloadStatementsCsv } from "./lib/excel";
import { moneyShort, setCurrency } from "./lib/format";
import { sampleInputs } from "./lib/importer";
import { ModelContext, runModel, SCENARIO_LABEL, SCENARIO_NOTE, SCENARIOS, type Inputs, type Model, type ScenarioKey } from "./lib/model";

const REPO = "https://github.com/amila-nandasiri/three-statement-model";
const SITE = "https://dewapriya.com";
const OFFLINE_FILE = "three-statement-model.html";
const isOffline = typeof location !== "undefined" && location.protocol === "file:";

function Kpi({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "good" | "bad" }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-4 md:p-5 break-inside-avoid">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className={`text-2xl md:text-3xl font-semibold tracking-tight mt-1 tabular-nums ${tone === "bad" ? "text-red-700" : tone === "good" ? "text-emerald-700" : "text-zinc-900"}`}>{value}</p>
      <p className="text-xs text-zinc-500 mt-2">{note}</p>
    </div>
  );
}

function ReportMenu({ model }: { model: Model }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const item = "w-full flex items-start gap-3 text-left px-3 py-2.5 rounded-lg hover:bg-zinc-100";
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-2 text-sm border border-zinc-200 rounded-full px-4 py-2 text-zinc-700 hover:border-zinc-400 transition-colors bg-white">
        <Download className="w-4 h-4" /> Download <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-zinc-200 rounded-xl shadow-xl p-1.5 z-40 text-sm">
          <button className={item} onClick={pick(() => downloadModelWorkbook(model))}>
            <FileSpreadsheet className="w-4 h-4 mt-0.5 text-emerald-700" />
            <span>
              <span className="block font-medium text-zinc-900">Excel model with live formulas</span>
              <span className="text-xs text-zinc-500">{SCENARIO_LABEL[model.scenario]}: change any blue input in Excel and the statements recalculate</span>
            </span>
          </button>
          <button className={item} onClick={pick(() => window.print())}>
            <Printer className="w-4 h-4 mt-0.5 text-zinc-500" />
            <span>
              <span className="block font-medium text-zinc-900">PDF report</span>
              <span className="text-xs text-zinc-500">Print or "Save as PDF" this page</span>
            </span>
          </button>
          <div className="border-t border-zinc-100 my-1" />
          <button className={item} onClick={pick(() => downloadStatementsCsv(model))}>
            <Download className="w-4 h-4 mt-0.5 text-zinc-500" />
            <span className="font-medium text-zinc-900">Key lines (CSV)</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const sample = useMemo(() => sampleInputs(), []);
  const [inputs, setInputs] = useState<Inputs>(sample);
  const [uploaded, setUploaded] = useState<Inputs | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [scenario, setScenario] = useState<ScenarioKey>("base");
  const [showUpload, setShowUpload] = useState(false);

  const model: Model = useMemo(() => {
    setCurrency(inputs.settings.currency);
    const all = Object.fromEntries(SCENARIOS.map((k) => [k, runModel(inputs, k)])) as Model["all"];
    return { inputs, scenario, years: all[scenario], all };
  }, [inputs, scenario]);

  const { years } = model;
  const s = inputs.settings;
  const fc = years.filter((y) => !y.actual);
  const lastActual = years.filter((y) => y.actual).pop()!;
  const last = years[years.length - 1];
  const cagr = Math.pow(last.revenue / lastActual.revenue, 1 / Math.max(1, fc.length)) - 1;
  const peakRevolver = fc.reduce((m, y) => (y.revolver > m.revolver ? y : m), fc[0]);
  const peakLeverage = fc.reduce((m, y) => ((y.ratios.netDebtToEbitda ?? -Infinity) > (m.ratios.netDebtToEbitda ?? -Infinity) ? y : m), fc[0]);
  const cumFcf = fc.reduce((t, y) => t + (y.ratios.freeCashFlow ?? 0), 0);
  const shortfalls = fc.filter((y) => y.cash < s.minimumCash - 0.5);
  const breaches = fc.filter((y) => y.ratios.leverageBreach || y.ratios.coverBreach);
  const balanced = years.every((y) => Math.abs(y.balanceCheck) < 0.5);
  const isSample = inputs === sample || (inputs.source === "sample" && !uploaded);
  const baseInputs = uploaded ?? sample;
  const changed = inputs.drivers !== baseInputs.drivers || inputs.settings !== baseInputs.settings;

  return (
    <ModelContext.Provider value={model}>
      <div className="min-h-screen">
        <header className="border-b border-zinc-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-xs text-zinc-500">
                FP&amp;A · {s.company} · {years[0].label}–{last.label}
              </p>
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-zinc-900 mt-1">Three-Statement Financial Model</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <button onClick={() => setShowUpload(true)} className="inline-flex items-center gap-2 text-sm font-medium bg-emerald-700 text-white rounded-full px-4 py-2 hover:bg-emerald-800 transition-colors">
                <Upload className="w-4 h-4" /> Use your data
              </button>
              <ReportMenu model={model} />
              {!isOffline && (
                <>
                  <a href={REPO} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm border border-zinc-200 rounded-full px-4 py-2 text-zinc-700 hover:border-zinc-400 transition-colors" title="Source code">
                    <Github className="w-4 h-4" /> <span className="hidden sm:inline">Code</span>
                  </a>
                  <a href={SITE} className="inline-flex items-center gap-1.5 text-sm bg-zinc-900 text-white rounded-full px-4 py-2 hover:bg-zinc-700 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Portfolio
                  </a>
                </>
              )}
            </div>
          </div>
        </header>

        {uploaded ? (
          <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-900 text-sm print:hidden">
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-2.5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p>
                  Showing <strong className="font-medium">your company</strong>, calculated only in this browser. Nothing was uploaded.
                </p>
                {notes.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-emerald-800">Import notes ({notes.length})</summary>
                    <ul className="list-disc list-inside mt-1 space-y-0.5 text-emerald-900/90">
                      {notes.map((n) => <li key={n}>{n}</li>)}
                    </ul>
                  </details>
                )}
              </div>
              <button
                onClick={() => {
                  setInputs(sample);
                  setUploaded(null);
                  setNotes([]);
                }}
                className="inline-flex items-center gap-1.5 text-emerald-900 font-medium hover:underline"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Back to sample company
              </button>
            </div>
          </div>
        ) : (
          isSample && (
            <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm print:hidden">
              <p className="max-w-7xl mx-auto px-4 md:px-6 py-2.5">
                <strong className="font-medium">Fictional sample:</strong> a Maldives seaplane operator with two years of actuals and a five-year forecast, including a fleet-renewal aircraft
                purchase in FY2027. Edit the blue assumptions below, or{" "}
                <button onClick={() => setShowUpload(true)} className="underline underline-offset-2 font-medium hover:text-amber-950">
                  model your own company
                </button>
                .
              </p>
            </div>
          )
        )}

        <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex bg-zinc-100 p-1 rounded-xl print:hidden" role="tablist" aria-label="Scenario">
              {SCENARIOS.map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={scenario === k}
                  onClick={() => setScenario(k)}
                  className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg ${scenario === k ? "bg-white shadow-sm text-zinc-900 font-medium" : "text-zinc-600 hover:text-zinc-900"}`}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: SCENARIO_COLOR[k] }} />
                  {SCENARIO_LABEL[k]}
                </button>
              ))}
            </div>
            <p className="text-sm text-zinc-500">{SCENARIO_NOTE[scenario]}</p>
          </div>

          {(shortfalls.length > 0 || breaches.length > 0) && (
            <div className="flex gap-3 bg-red-50 border border-red-200 text-red-900 rounded-2xl px-5 py-4 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0 text-red-700" />
              <div>
                {shortfalls.length > 0 && (
                  <p>
                    <strong className="font-semibold">Funding gap:</strong> even with the revolver fully drawn, cash falls below the {moneyShort(s.minimumCash)} minimum in{" "}
                    {shortfalls.map((y) => `${y.label} (short by ${moneyShort(s.minimumCash - y.cash)})`).join(", ")}. Options: a larger facility, deferring capex, or cutting the dividend.
                  </p>
                )}
                {breaches.length > 0 && (
                  <p className="mt-1">
                    <strong className="font-semibold">Covenant breach</strong> in {breaches.map((y) => y.label).join(", ")}.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 print:grid-cols-6 gap-3 md:gap-4">
            <Kpi label={`Revenue, ${last.label}`} value={moneyShort(last.revenue)} note={`${(cagr * 100).toFixed(1)}% a year from ${lastActual.label}`} />
            <Kpi label={`EBITDA margin, ${last.label}`} value={`${(last.ratios.ebitdaMargin * 100).toFixed(1)}%`} note={`${(lastActual.ratios.ebitdaMargin * 100).toFixed(1)}% in ${lastActual.label}`} />
            <Kpi label="Free cash flow" value={moneyShort(cumFcf)} note={`Cumulative ${fc[0].label}–${last.label}, after leases`} tone={cumFcf < 0 ? "bad" : undefined} />
            <Kpi label="Peak revolver" value={moneyShort(peakRevolver.revolver)} note={peakRevolver.revolver > 0 ? `In ${peakRevolver.label}, of a ${moneyShort(s.revolverLimit)} limit` : "Not needed"} tone={peakRevolver.revolver >= s.revolverLimit - 0.5 ? "bad" : undefined} />
            <Kpi
              label="Peak net debt / EBITDA"
              value={peakLeverage.ratios.netDebtToEbitda === null ? "n/a" : `${peakLeverage.ratios.netDebtToEbitda.toFixed(2)}x`}
              note={`${peakLeverage.label} · covenant ${s.maxNetDebtToEbitda}x`}
              tone={breaches.length ? "bad" : "good"}
            />
            <Kpi label="Balance check" value={balanced ? "Balances" : "Out"} note={balanced ? "Assets = liabilities + equity in every year" : "Check the historical balance sheet"} tone={balanced ? "good" : "bad"} />
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <GrowthChart />
            <LiquidityChart />
            <LeverageChart />
          </div>

          <Statements />

          <div className="print:hidden">
            <AssumptionsEditor
              drivers={inputs.drivers}
              settings={inputs.settings}
              changed={changed}
              onDrivers={(d) => setInputs({ ...inputs, drivers: d })}
              onSettings={(st) => setInputs({ ...inputs, settings: st })}
              onReset={() => setInputs(baseInputs)}
            />
          </div>

          <section className="grid md:grid-cols-3 gap-6 text-sm text-zinc-600 pt-4 break-inside-avoid">
            <div>
              <h3 className="font-medium text-zinc-900 mb-1">How it links</h3>
              <p>
                Net income flows to retained earnings and the cash flow. Working capital comes from receivable, inventory and payable days. Capex and depreciation drive PP&amp;E. The
                cash flow's closing cash is the balance sheet's cash, and a check row proves it every year.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-zinc-900 mb-1">Debt and leases</h3>
              <p>
                Interest is charged on opening balances, which avoids circular references. The revolver draws to keep cash at the minimum and repays from any surplus. Leases follow
                a simplified IFRS 16: right-of-use depreciation and lease principal run over the average lease life, with new leases added mid-year.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-zinc-900 mb-1">Excel export</h3>
              <p>
                The download is a working model, not a static report. History is entered as values; every forecast cell is a formula from the blue inputs, with balance and cash
                checks built in. It has been verified to recalculate to the same figures as this page.
              </p>
            </div>
          </section>

          {!isOffline && (
            <section className="bg-white border border-zinc-200 rounded-2xl p-5 md:p-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
              <div>
                <h2 className="font-semibold text-zinc-900">Use it offline</h2>
                <p className="text-sm text-zinc-500 mt-0.5 max-w-2xl">
                  Download the whole model as a single HTML file. Open it in any browser, with or without internet, and load your own figures. Nothing is sent anywhere.
                </p>
              </div>
              <a href={OFFLINE_FILE} download className="inline-flex items-center gap-2 text-sm font-medium bg-zinc-900 text-white rounded-full px-5 py-2.5 hover:bg-zinc-700 transition-colors">
                <Download className="w-4 h-4" /> Download HTML file
              </a>
            </section>
          )}
        </main>

        <footer className="border-t border-zinc-200 mt-8">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 flex flex-wrap justify-between gap-2 text-xs text-zinc-500">
            <p>
              Built by <a href={SITE} className="text-zinc-900 hover:underline">Amila Dewapriya</a>, CMA{" "}
              {balanced && (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  · <Check className="w-3 h-3" /> balanced
                </span>
              )}
            </p>
            <p className="font-mono">React · TypeScript · Recharts</p>
          </div>
        </footer>
      </div>

      {showUpload && (
        <UploadPanel
          onClose={() => setShowUpload(false)}
          onLoad={(i, n) => {
            setInputs(i);
            setUploaded(i);
            setNotes(n);
            setShowUpload(false);
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </ModelContext.Provider>
  );
}
