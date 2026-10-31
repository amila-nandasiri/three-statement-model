import { Check, X } from "lucide-react";
import { Fragment, useState } from "react";
import { currencyCode, thousands } from "../lib/format";
import { DRIVER_INFO, DRIVER_KEYS, SCENARIO_LABEL, SCENARIO_NOTE, useModel, type DriverKey, type Drivers, type Settings, type YearResult } from "../lib/model";

type Row =
  | { kind: "section"; label: string }
  | { kind: "spacer" }
  | { kind: "value"; label: string; get: (y: YearResult) => number | null; style?: "total" | "sub" | "pct" | "x" | "check"; flag?: (y: YearResult) => boolean };

const pct = (n: number | null) => (n === null ? "–" : `${(n * 100).toFixed(1)}%`);
const times = (n: number | null) => (n === null ? "n/a" : `${n.toFixed(2)}x`);

const INCOME: Row[] = [
  { kind: "value", label: "Revenue", get: (y) => y.revenue, style: "total" },
  { kind: "value", label: "Direct costs", get: (y) => -y.directCosts, style: "sub" },
  { kind: "value", label: "Gross profit", get: (y) => y.grossProfit, style: "total" },
  { kind: "value", label: "Overheads", get: (y) => -y.overheads, style: "sub" },
  { kind: "value", label: "EBITDA", get: (y) => y.ebitda, style: "total" },
  { kind: "value", label: "Depreciation: PP&E", get: (y) => -y.depreciationPpe, style: "sub" },
  { kind: "value", label: "Depreciation: right-of-use assets", get: (y) => -y.depreciationRou, style: "sub" },
  { kind: "value", label: "EBIT", get: (y) => y.ebit, style: "total" },
  { kind: "value", label: "Interest: term loan", get: (y) => -y.interestTermLoan, style: "sub" },
  { kind: "value", label: "Interest: revolver", get: (y) => -y.interestRevolver, style: "sub" },
  { kind: "value", label: "Interest: lease liabilities", get: (y) => -y.interestLeases, style: "sub" },
  { kind: "value", label: "Profit before tax", get: (y) => y.pbt, style: "total" },
  { kind: "value", label: "Tax", get: (y) => -y.tax, style: "sub" },
  { kind: "value", label: "Net income", get: (y) => y.netIncome, style: "total" }
];

const BALANCE: Row[] = [
  { kind: "section", label: "Assets" },
  { kind: "value", label: "Property, plant and equipment", get: (y) => y.ppe, style: "sub" },
  { kind: "value", label: "Right-of-use assets", get: (y) => y.rightOfUse, style: "sub" },
  { kind: "value", label: "Inventory", get: (y) => y.inventory, style: "sub" },
  { kind: "value", label: "Trade receivables", get: (y) => y.receivables, style: "sub" },
  { kind: "value", label: "Cash", get: (y) => y.cash, style: "sub" },
  { kind: "value", label: "Total assets", get: (y) => y.totalAssets, style: "total" },
  { kind: "section", label: "Liabilities" },
  { kind: "value", label: "Trade payables", get: (y) => y.payables, style: "sub" },
  { kind: "value", label: "Revolving credit facility", get: (y) => y.revolver, style: "sub" },
  { kind: "value", label: "Term loan", get: (y) => y.termLoan, style: "sub" },
  { kind: "value", label: "Lease liabilities", get: (y) => y.leaseLiabilities, style: "sub" },
  { kind: "value", label: "Total liabilities", get: (y) => y.payables + y.revolver + y.termLoan + y.leaseLiabilities, style: "total" },
  { kind: "section", label: "Equity" },
  { kind: "value", label: "Share capital", get: (y) => y.shareCapital, style: "sub" },
  { kind: "value", label: "Retained earnings", get: (y) => y.retainedEarnings, style: "sub" },
  { kind: "value", label: "Total equity", get: (y) => y.shareCapital + y.retainedEarnings, style: "total" },
  { kind: "value", label: "Total liabilities and equity", get: (y) => y.totalLiabilitiesEquity, style: "total" },
  { kind: "spacer" },
  { kind: "value", label: "Balance check", get: (y) => y.balanceCheck, style: "check" }
];

const CASHFLOW: Row[] = [
  { kind: "value", label: "Net income", get: (y) => y.cf?.netIncome ?? null, style: "sub" },
  { kind: "value", label: "Depreciation", get: (y) => y.cf?.depreciation ?? null, style: "sub" },
  { kind: "value", label: "(Increase) / decrease in receivables", get: (y) => y.cf?.changeReceivables ?? null, style: "sub" },
  { kind: "value", label: "(Increase) / decrease in inventory", get: (y) => y.cf?.changeInventory ?? null, style: "sub" },
  { kind: "value", label: "Increase / (decrease) in payables", get: (y) => y.cf?.changePayables ?? null, style: "sub" },
  { kind: "value", label: "Cash from operating activities", get: (y) => y.cf?.cfo ?? null, style: "total" },
  { kind: "value", label: "Capital expenditure", get: (y) => y.cf?.capex ?? null, style: "sub" },
  { kind: "value", label: "Cash from investing activities", get: (y) => y.cf?.cfi ?? null, style: "total" },
  { kind: "value", label: "Term loan repaid", get: (y) => y.cf?.termLoan ?? null, style: "sub" },
  { kind: "value", label: "Revolver drawn / (repaid)", get: (y) => y.cf?.revolver ?? null, style: "sub" },
  { kind: "value", label: "Lease principal paid", get: (y) => y.cf?.leasePrincipal ?? null, style: "sub" },
  { kind: "value", label: "Dividends paid", get: (y) => y.cf?.dividends ?? null, style: "sub" },
  { kind: "value", label: "Cash from financing activities", get: (y) => y.cf?.cff ?? null, style: "total" },
  { kind: "value", label: "Net change in cash", get: (y) => y.cf?.netChange ?? null, style: "total" },
  { kind: "value", label: "Opening cash", get: (y) => y.cf?.openingCash ?? null, style: "sub" },
  { kind: "value", label: "Closing cash", get: (y) => y.cf?.closingCash ?? null, style: "total" }
];

function RatiosTable({ years, settings }: { years: YearResult[]; settings: Settings }) {
  const rows: [string, (y: YearResult) => React.ReactNode, ((y: YearResult) => boolean)?][] = [
    ["Revenue growth", (y) => pct(y.ratios.revenueGrowth)],
    ["EBITDA margin", (y) => pct(y.ratios.ebitdaMargin)],
    ["Net margin", (y) => pct(y.ratios.netMargin)],
    ["Return on equity", (y) => pct(y.ratios.roe)],
    ["Receivable days", (y) => y.ratios.receivableDays.toFixed(0)],
    ["Free cash flow (after leases)", (y) => (y.ratios.freeCashFlow === null ? "–" : thousands(y.ratios.freeCashFlow))],
    ["Net debt incl. leases", (y) => thousands(y.ratios.netDebt)],
    [`Net debt / EBITDA (max ${settings.maxNetDebtToEbitda}x)`, (y) => times(y.ratios.netDebtToEbitda), (y) => y.ratios.leverageBreach],
    [`Interest cover (min ${settings.minInterestCover}x)`, (y) => times(y.ratios.interestCover), (y) => y.ratios.coverBreach],
    [`Cash below minimum (${thousands(settings.minimumCash)})`, (y) => (y.actual || y.cash >= settings.minimumCash - 0.5 ? "–" : thousands(y.cash - settings.minimumCash)), (y) => !y.actual && y.cash < settings.minimumCash - 0.5]
  ];
  return (
    <tbody>
      {rows.map(([label, f, flag]) => (
        <tr key={label} className="border-b border-zinc-100 text-zinc-700">
          <td className="sticky left-0 bg-white px-5 md:px-6 py-2">{label}</td>
          {years.map((y) => (
            <td key={y.label} className={`px-3 py-2 text-right tabular-nums ${y.actual ? "bg-zinc-50/70" : ""} ${flag?.(y) ? "text-red-700 bg-red-50 font-semibold" : ""}`}>
              {f(y)}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

const TABS = ["Income statement", "Balance sheet", "Cash flow", "Ratios"] as const;

export function Statements() {
  const { years, scenario, inputs } = useModel();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Income statement");
  const rows = tab === "Income statement" ? INCOME : tab === "Balance sheet" ? BALANCE : CASHFLOW;
  const allBalance = years.every((y) => Math.abs(y.balanceCheck) < 0.5);

  return (
    <section className="bg-white border border-zinc-200 rounded-2xl min-w-0">
      <div className="p-5 md:p-6 pb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold text-zinc-900">Financial statements: {SCENARIO_LABEL[scenario].toLowerCase()}</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            {currencyCode()} thousands. Shaded columns are actuals.{" "}
            {allBalance ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                <Check className="w-3.5 h-3.5" /> Balance sheet balances every year
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                <X className="w-3.5 h-3.5" /> Balance sheet out of balance: check the history
              </span>
            )}
          </p>
        </div>
        <div className="inline-flex flex-wrap bg-zinc-100 p-1 rounded-lg text-sm print:hidden" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md ${tab === t ? "bg-white shadow-sm text-zinc-900 font-medium" : "text-zinc-600"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-y border-zinc-200 text-xs text-zinc-500">
              <th className="sticky left-0 bg-zinc-50 text-left font-medium px-5 md:px-6 py-2 min-w-64">{inputs.settings.currency} '000</th>
              {years.map((y) => (
                <th key={y.label} className={`px-3 py-2 text-right font-medium ${y.actual ? "bg-zinc-100" : "bg-zinc-50"}`}>
                  <span className="block text-zinc-900">{y.label}</span>
                  {y.actual ? "Actual" : "Forecast"}
                </th>
              ))}
            </tr>
          </thead>
          {tab === "Ratios" ? (
            <RatiosTable years={years} settings={inputs.settings} />
          ) : (
            <tbody>
              {rows.map((r, i) => {
                if (r.kind === "spacer") return <tr key={i} className="h-3" />;
                if (r.kind === "section")
                  return (
                    <tr key={i}>
                      <td colSpan={years.length + 1} className="sticky left-0 bg-white px-5 md:px-6 pt-3 pb-1 text-xs font-medium uppercase tracking-wider text-zinc-400">
                        {r.label}
                      </td>
                    </tr>
                  );
                const total = r.style === "total";
                return (
                  <tr key={i} className={`${total ? "border-t border-zinc-200 font-semibold text-zinc-900" : "text-zinc-700"} hover:bg-zinc-50`}>
                    <td className={`sticky left-0 bg-white px-5 md:px-6 py-1.5 ${r.style === "sub" ? "pl-8 md:pl-9" : ""}`}>{r.label}</td>
                    {years.map((y) => {
                      const v = r.get(y);
                      if (r.style === "check")
                        return (
                          <td key={y.label} className={`px-3 py-1.5 text-right ${y.actual ? "bg-zinc-50/70" : ""}`}>
                            {Math.abs(v ?? 0) < 0.5 ? <Check className="w-4 h-4 inline text-emerald-600" aria-label="balances" /> : <span className="text-red-700 font-semibold">{thousands(v ?? 0)}</span>}
                          </td>
                        );
                      return (
                        <td key={y.label} className={`px-3 py-1.5 text-right tabular-nums ${y.actual ? "bg-zinc-50/70" : ""}`}>
                          {v === null ? <span className="text-zinc-300">·</span> : thousands(v)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
      </div>
      {tab === "Cash flow" && <p className="text-xs text-zinc-500 px-5 md:px-6 py-3">Historical cash flows are derived from the balance sheets. The first year needs a prior balance sheet, so it is blank.</p>}
      <p className="text-xs text-zinc-500 px-5 md:px-6 pb-4">{SCENARIO_NOTE[scenario]}.</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Assumptions editor
// ---------------------------------------------------------------------------

const SETTING_FIELDS: { key: keyof Settings; label: string; step: number }[] = [
  { key: "minimumCash", label: "Minimum cash", step: 100000 },
  { key: "revolverLimit", label: "Revolver limit", step: 500000 },
  { key: "leaseLifeYears", label: "Average lease life (years)", step: 1 },
  { key: "maxNetDebtToEbitda", label: "Covenant: max net debt / EBITDA", step: 0.25 },
  { key: "minInterestCover", label: "Covenant: min interest cover", step: 0.5 }
];

export function AssumptionsEditor({ drivers, settings, onDrivers, onSettings, onReset, changed }: { drivers: Drivers; settings: Settings; onDrivers: (d: Drivers) => void; onSettings: (s: Settings) => void; onReset: () => void; changed: boolean }) {
  const groups = [...new Set(DRIVER_KEYS.map((k) => DRIVER_INFO[k].group))];
  const cell = "w-24 bg-transparent text-right tabular-nums text-[#1F4FB4] font-medium px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-300 hover:bg-blue-50";
  return (
    <section className="bg-white border border-zinc-200 rounded-2xl min-w-0">
      <div className="p-5 md:p-6 pb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold text-zinc-900">Assumptions (base case)</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Inputs are in <span className="text-[#1F4FB4] font-medium">blue</span>, as in a financial model. Edit any of them and all three statements recalculate. The upside and downside adjust these.
          </p>
        </div>
        {changed && (
          <button onClick={onReset} className="text-sm text-zinc-600 hover:text-zinc-900 underline underline-offset-2 print:hidden">
            Reset to sample assumptions
          </button>
        )}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 px-5 md:px-6 pb-5">
        {SETTING_FIELDS.map((f) => (
          <label key={f.key} className="text-xs text-zinc-500">
            {f.label}
            <input
              type="number"
              step={f.step}
              value={settings[f.key] as number}
              onChange={(e) => onSettings({ ...settings, [f.key]: Number(e.target.value) })}
              className="mt-1 w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm text-[#1F4FB4] font-medium tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </label>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-y border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
              <th className="sticky left-0 bg-zinc-50 text-left font-medium px-5 md:px-6 py-2">Driver</th>
              {drivers.years.map((y) => (
                <th key={y} className="px-3 py-2 text-right font-medium text-zinc-900">{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g}>
                <tr>
                  <td colSpan={drivers.years.length + 1} className="sticky left-0 bg-white px-5 md:px-6 pt-3 pb-1 text-xs font-medium uppercase tracking-wider text-zinc-400">{g}</td>
                </tr>
                {DRIVER_KEYS.filter((k) => DRIVER_INFO[k].group === g).map((k: DriverKey) => (
                  <tr key={k} className="hover:bg-zinc-50">
                    <td className="sticky left-0 bg-white px-5 md:px-6 py-1 pl-8 md:pl-9 text-zinc-700">
                      {DRIVER_INFO[k].label} <span className="text-zinc-400 text-xs">{DRIVER_INFO[k].unit === "amount" ? currencyCode() : DRIVER_INFO[k].unit}</span>
                    </td>
                    {drivers.years.map((y, t) => (
                      <td key={y} className="px-2 py-0.5 text-right">
                        <input
                          type="number"
                          step={DRIVER_INFO[k].unit === "amount" ? 100000 : 0.5}
                          value={drivers[k][t]}
                          onChange={(e) => {
                            const next = [...drivers[k]];
                            next[t] = e.target.value === "" ? 0 : Number(e.target.value);
                            onDrivers({ ...drivers, [k]: next });
                          }}
                          className={cell}
                          aria-label={`${DRIVER_INFO[k].label}, ${y}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="h-4" />
    </section>
  );
}
