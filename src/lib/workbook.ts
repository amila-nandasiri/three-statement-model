// Builds the model as an Excel sheet with live formulas: inputs in blue, calculations in
// black, history as values. Changing any blue cell in Excel re-flows all three statements.
// Pure functions only, so the same builder runs in the browser and in tests.

import type { Cell, SheetData } from "write-excel-file/browser";
import { DRIVER_INFO, DRIVER_KEYS, SCENARIO_LABEL, scenarioDrivers, type DriverKey, type Inputs, type ScenarioKey, type YearResult } from "./model";

const BLUE = "#1F4FB4";
const FMT = "#,##0;(#,##0);-";

type RowSpec = {
  key?: string;
  label: string;
  style?: "section" | "total" | "check" | "input" | "pct" | "x" | "muted";
  hist?: (y: YearResult, i: number) => number | string | null; // value in historical columns
  fc?: (f: F) => string; // formula in forecast columns
};

/** Helpers for writing formulas: c("revenue") is this year's cell, p("revenue") last year's, s("minimumCash") a setting */
type F = { c: (k: string) => string; p: (k: string) => string; s: (k: string) => string };

const colLetter = (i: number) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

const SETTINGS_ROWS: [keyof Inputs["settings"], string][] = [
  ["minimumCash", "Minimum cash"],
  ["revolverLimit", "Revolver limit"],
  ["leaseLifeYears", "Average lease life (years)"],
  ["maxNetDebtToEbitda", "Covenant: max net debt / EBITDA (x)"],
  ["minInterestCover", "Covenant: min interest cover (x)"]
];

export function buildModelSheet(inputs: Inputs, scenario: ScenarioKey, years: YearResult[]): { data: SheetData; columns: { width: number }[] } {
  const d = scenarioDrivers(inputs.drivers, scenario);
  const nHist = inputs.history.length;
  const hist = years.slice(0, nHist);

  const driverRows: RowSpec[] = DRIVER_KEYS.map((k: DriverKey) => ({
    key: k,
    label: `${DRIVER_INFO[k].label}${DRIVER_INFO[k].unit === "%" ? " (%)" : DRIVER_INFO[k].unit === "days" ? " (days)" : ""}`,
    style: "input"
  }));

  const sum = (f: F, keys: string[]) => keys.map((k) => f.c(k)).join("+");
  const h = (k: keyof YearResult) => (y: YearResult) => y[k] as number;
  const hcf = (k: string) => (y: YearResult) => (y.cf ? (y.cf as Record<string, number>)[k] : null);

  const rows: RowSpec[] = [
    { label: "ASSUMPTIONS (inputs in blue; forecast years only)", style: "section" },
    ...driverRows,
    { label: "" },
    { label: "INCOME STATEMENT", style: "section" },
    { key: "revenue", label: "Revenue", hist: h("revenue"), fc: (f) => `${f.p("revenue")}*(1+${f.c("revenueGrowthPct")}/100)` },
    { key: "directCosts", label: "Direct costs", hist: h("directCosts"), fc: (f) => `${f.c("revenue")}*${f.c("directCostsPct")}/100` },
    { key: "grossProfit", label: "Gross profit", style: "total", hist: h("grossProfit"), fc: (f) => `${f.c("revenue")}-${f.c("directCosts")}` },
    { key: "overheads", label: "Overheads", hist: h("overheads"), fc: (f) => `${f.c("revenue")}*${f.c("overheadsPct")}/100` },
    { key: "ebitda", label: "EBITDA", style: "total", hist: h("ebitda"), fc: (f) => `${f.c("grossProfit")}-${f.c("overheads")}` },
    { key: "depreciationPpe", label: "Depreciation: PP&E", hist: h("depreciationPpe"), fc: (f) => `${f.p("ppe")}*${f.c("ppeDepreciationPct")}/100` },
    { key: "depreciationRou", label: "Depreciation: right-of-use assets", hist: h("depreciationRou"), fc: (f) => `(${f.p("rightOfUse")}+${f.c("newLeases")}/2)/${f.s("leaseLifeYears")}` },
    { key: "ebit", label: "EBIT", style: "total", hist: h("ebit"), fc: (f) => `${f.c("ebitda")}-${f.c("depreciationPpe")}-${f.c("depreciationRou")}` },
    { key: "interestTermLoan", label: "Interest: term loan", hist: h("interestTermLoan"), fc: (f) => `${f.p("termLoan")}*${f.c("termLoanRatePct")}/100` },
    { key: "interestRevolver", label: "Interest: revolver", hist: h("interestRevolver"), fc: (f) => `${f.p("revolver")}*${f.c("revolverRatePct")}/100` },
    { key: "interestLeases", label: "Interest: lease liabilities", hist: h("interestLeases"), fc: (f) => `${f.p("leaseLiabilities")}*${f.c("leaseRatePct")}/100` },
    { key: "pbt", label: "Profit before tax", style: "total", hist: h("pbt"), fc: (f) => `${f.c("ebit")}-${f.c("interestTermLoan")}-${f.c("interestRevolver")}-${f.c("interestLeases")}` },
    { key: "tax", label: "Tax", hist: h("tax"), fc: (f) => `MAX(0,${f.c("pbt")}*${f.c("taxRatePct")}/100)` },
    { key: "netIncome", label: "Net income", style: "total", hist: h("netIncome"), fc: (f) => `${f.c("pbt")}-${f.c("tax")}` },
    { label: "" },
    { label: "BALANCE SHEET", style: "section" },
    { key: "ppe", label: "Property, plant and equipment", hist: h("ppe"), fc: (f) => `${f.p("ppe")}+${f.c("capex")}-${f.c("depreciationPpe")}` },
    { key: "rightOfUse", label: "Right-of-use assets", hist: h("rightOfUse"), fc: (f) => `${f.p("rightOfUse")}+${f.c("newLeases")}-${f.c("depreciationRou")}` },
    { key: "inventory", label: "Inventory", hist: h("inventory"), fc: (f) => `${f.c("directCosts")}*${f.c("inventoryDays")}/365` },
    { key: "receivables", label: "Trade receivables", hist: h("receivables"), fc: (f) => `${f.c("revenue")}*${f.c("receivableDays")}/365` },
    { key: "cash", label: "Cash", hist: h("cash"), fc: (f) => `${f.c("cashBeforeRevolver")}+${f.c("revolverMovement")}` },
    { key: "totalAssets", label: "Total assets", style: "total", hist: h("totalAssets"), fc: (f) => sum(f, ["ppe", "rightOfUse", "inventory", "receivables", "cash"]) },
    { key: "payables", label: "Trade payables", hist: h("payables"), fc: (f) => `${f.c("directCosts")}*${f.c("payableDays")}/365` },
    { key: "revolver", label: "Revolving credit facility", hist: h("revolver"), fc: (f) => `${f.p("revolver")}+${f.c("revolverMovement")}` },
    { key: "termLoan", label: "Term loan", hist: h("termLoan"), fc: (f) => `${f.p("termLoan")}-${f.c("termRepaid")}` },
    { key: "leaseLiabilities", label: "Lease liabilities", hist: h("leaseLiabilities"), fc: (f) => `${f.p("leaseLiabilities")}+${f.c("newLeases")}-${f.c("leasePrincipal")}` },
    { key: "totalLiabilities", label: "Total liabilities", style: "total", hist: (y) => y.payables + y.revolver + y.termLoan + y.leaseLiabilities, fc: (f) => sum(f, ["payables", "revolver", "termLoan", "leaseLiabilities"]) },
    { key: "shareCapital", label: "Share capital", hist: h("shareCapital"), fc: (f) => f.p("shareCapital") },
    { key: "retainedEarnings", label: "Retained earnings", hist: h("retainedEarnings"), fc: (f) => `${f.p("retainedEarnings")}+${f.c("netIncome")}-${f.c("dividends")}` },
    { key: "totalEquity", label: "Total equity", style: "total", hist: (y) => y.shareCapital + y.retainedEarnings, fc: (f) => sum(f, ["shareCapital", "retainedEarnings"]) },
    { key: "totalLE", label: "Total liabilities and equity", style: "total", hist: h("totalLiabilitiesEquity"), fc: (f) => sum(f, ["totalLiabilities", "totalEquity"]) },
    { key: "balanceCheck", label: "Balance check (assets − liabilities − equity)", style: "check", hist: h("balanceCheck"), fc: (f) => `ROUND(${f.c("totalAssets")}-${f.c("totalLE")},2)` },
    { label: "" },
    { label: "CASH FLOW STATEMENT", style: "section" },
    { key: "cfNetIncome", label: "Net income", hist: hcf("netIncome"), fc: (f) => f.c("netIncome") },
    { key: "cfDepreciation", label: "Depreciation", hist: hcf("depreciation"), fc: (f) => `${f.c("depreciationPpe")}+${f.c("depreciationRou")}` },
    { key: "cfReceivables", label: "(Increase) / decrease in receivables", hist: hcf("changeReceivables"), fc: (f) => `-(${f.c("receivables")}-${f.p("receivables")})` },
    { key: "cfInventory", label: "(Increase) / decrease in inventory", hist: hcf("changeInventory"), fc: (f) => `-(${f.c("inventory")}-${f.p("inventory")})` },
    { key: "cfPayables", label: "Increase / (decrease) in payables", hist: hcf("changePayables"), fc: (f) => `${f.c("payables")}-${f.p("payables")}` },
    { key: "cfo", label: "Cash from operating activities", style: "total", hist: hcf("cfo"), fc: (f) => sum(f, ["cfNetIncome", "cfDepreciation", "cfReceivables", "cfInventory", "cfPayables"]) },
    { key: "cfCapex", label: "Capital expenditure", hist: hcf("capex"), fc: (f) => `-${f.c("capex")}` },
    { key: "cfi", label: "Cash from investing activities", style: "total", hist: hcf("cfi"), fc: (f) => f.c("cfCapex") },
    { key: "cfTerm", label: "Term loan repaid", hist: hcf("termLoan"), fc: (f) => `-${f.c("termRepaid")}` },
    { key: "cfRevolver", label: "Revolver drawn / (repaid)", hist: hcf("revolver"), fc: (f) => f.c("revolverMovement") },
    { key: "cfLeases", label: "Lease principal paid", hist: hcf("leasePrincipal"), fc: (f) => `-${f.c("leasePrincipal")}` },
    { key: "cfDividends", label: "Dividends paid", hist: hcf("dividends"), fc: (f) => `-${f.c("dividends")}` },
    { key: "cff", label: "Cash from financing activities", style: "total", hist: hcf("cff"), fc: (f) => sum(f, ["cfTerm", "cfRevolver", "cfLeases", "cfDividends"]) },
    { key: "netChange", label: "Net change in cash", style: "total", hist: hcf("netChange"), fc: (f) => sum(f, ["cfo", "cfi", "cff"]) },
    { key: "openingCash", label: "Opening cash", hist: hcf("openingCash"), fc: (f) => f.p("cash") },
    { key: "closingCash", label: "Closing cash", style: "total", hist: hcf("closingCash"), fc: (f) => `${f.c("openingCash")}+${f.c("netChange")}` },
    { key: "cashCheck", label: "Cash check (cash flow − balance sheet)", style: "check", hist: (y) => (y.cf ? y.cf.closingCash - y.cash : null), fc: (f) => `ROUND(${f.c("closingCash")}-${f.c("cash")},2)` },
    { label: "" },
    { label: "SUPPORTING CALCULATIONS", style: "section" },
    { key: "capex", label: "Capex", style: "muted", fc: (f) => `${f.c("revenue")}*${f.c("capexPct")}/100` },
    { key: "termRepaid", label: "Term loan repaid", style: "muted", fc: (f) => `MIN(${f.p("termLoan")},${f.c("termLoanRepayment")})` },
    { key: "leasePrincipal", label: "Lease principal", style: "muted", fc: (f) => `MIN(${f.p("leaseLiabilities")}+${f.c("newLeases")},(${f.p("leaseLiabilities")}+${f.c("newLeases")}/2)/${f.s("leaseLifeYears")})` },
    { key: "dividends", label: "Dividends", style: "muted", fc: (f) => `MAX(0,${f.c("netIncome")}*${f.c("dividendPayoutPct")}/100)` },
    { key: "cashBeforeRevolver", label: "Cash before revolver", style: "muted", fc: (f) => `${f.p("cash")}+${f.c("cfo")}-${f.c("capex")}-${f.c("termRepaid")}-${f.c("leasePrincipal")}-${f.c("dividends")}` },
    {
      key: "revolverMovement",
      label: "Revolver drawn / (repaid)",
      style: "muted",
      fc: (f) =>
        `IF(${f.c("cashBeforeRevolver")}<${f.s("minimumCash")},MIN(${f.s("minimumCash")}-${f.c("cashBeforeRevolver")},MAX(0,${f.s("revolverLimit")}-${f.p("revolver")})),IF(${f.p("revolver")}>0,-MIN(${f.p("revolver")},${f.c("cashBeforeRevolver")}-${f.s("minimumCash")}),0))`
    },
    { label: "" },
    { label: "RATIOS AND COVENANTS", style: "section" },
    { key: "growth", label: "Revenue growth", style: "pct", hist: (y) => y.ratios.revenueGrowth, fc: (f) => `${f.c("revenue")}/${f.p("revenue")}-1` },
    { key: "ebitdaMargin", label: "EBITDA margin", style: "pct", hist: (y) => y.ratios.ebitdaMargin, fc: (f) => `${f.c("ebitda")}/${f.c("revenue")}` },
    { key: "netDebt", label: "Net debt (incl. leases)", hist: (y) => y.ratios.netDebt, fc: (f) => `${f.c("termLoan")}+${f.c("revolver")}+${f.c("leaseLiabilities")}-${f.c("cash")}` },
    { key: "leverage", label: "Net debt / EBITDA (x)", style: "x", hist: (y) => y.ratios.netDebtToEbitda, fc: (f) => `IF(${f.c("ebitda")}>0,${f.c("netDebt")}/${f.c("ebitda")},"n/a")` },
    { key: "cover", label: "Interest cover (x)", style: "x", hist: (y) => y.ratios.interestCover, fc: (f) => `IF(${f.c("interestTermLoan")}+${f.c("interestRevolver")}+${f.c("interestLeases")}>0,${f.c("ebitda")}/(${f.c("interestTermLoan")}+${f.c("interestRevolver")}+${f.c("interestLeases")}),"n/a")` },
    { key: "leverageTest", label: "Leverage covenant", fc: (f) => `IF(ISNUMBER(${f.c("leverage")}),IF(${f.c("leverage")}>${f.s("maxNetDebtToEbitda")},"BREACH","OK"),"n/a")` },
    { key: "coverTest", label: "Interest cover covenant", fc: (f) => `IF(ISNUMBER(${f.c("cover")}),IF(${f.c("cover")}<${f.s("minInterestCover")},"BREACH","OK"),"n/a")` },
    { key: "shortfall", label: "Cash below minimum", hist: () => null, fc: (f) => `MAX(0,${f.s("minimumCash")}-${f.c("cash")})` }
  ];

  // Layout: title rows, settings block, header, then the rows above
  const settingsStart = 5;
  const headerRow = settingsStart + SETTINGS_ROWS.length + 1; // settings, one blank row, then the header
  const firstRow = headerRow + 2;
  const rowOf = new Map<string, number>();
  rows.forEach((r, i) => r.key && rowOf.set(r.key, firstRow + i));
  const settingRow = new Map(SETTINGS_ROWS.map(([k], i) => [k as string, settingsStart + i]));
  const totalCols = 1 + years.length;

  const data: SheetData = [];
  const blank = (): Cell[] => Array.from({ length: totalCols }, () => null);
  const text = (v: string, extra: Partial<Exclude<Cell, null | string | number | boolean | Date>> = {}): Cell => ({ value: v, ...extra }) as Cell;

  data.push([text(`Three-statement model: ${inputs.settings.company}`, { fontWeight: "bold", fontSize: 14 })]);
  data.push([`${inputs.settings.currency} · ${SCENARIO_LABEL[scenario]} · blue cells are inputs; change them and the statements recalculate`]);
  data.push([]);
  data.push([text("SETTINGS", { fontWeight: "bold" })]);
  for (const [k, label] of SETTINGS_ROWS) {
    const v = inputs.settings[k] as number;
    data.push([label, { value: v, type: Number, textColor: BLUE, format: v >= 100 ? FMT : "0.0" }]);
  }
  data.push([]);
  const header = blank();
  header[0] = text(inputs.settings.currency, { fontWeight: "bold" });
  years.forEach((y, i) => (header[i + 1] = text(y.label, { fontWeight: "bold", align: "right" })));
  data.push(header);
  const sub = blank();
  years.forEach((y, i) => (sub[i + 1] = text(y.actual ? "Actual" : "Forecast", { align: "right", textColor: "#71717A" })));
  data.push(sub);

  rows.forEach((r) => {
    const line = blank();
    const bold = r.style === "total" || r.style === "section" || r.style === "check";
    line[0] = text(r.label, bold ? { fontWeight: "bold" } : r.style === "muted" ? { textColor: "#71717A" } : {});
    if (r.style === "section" || !r.key) {
      data.push(line);
      return;
    }
    const fmt = r.style === "pct" ? "0.0%" : r.style === "x" ? "0.00\"x\"" : r.style === "input" ? "#,##0.0;(#,##0.0)" : FMT;
    years.forEach((y, i) => {
      const col = i + 1;
      if (y.actual) {
        const v = r.hist ? r.hist(hist[i], i) : null;
        if (v !== null && v !== undefined) line[col] = typeof v === "number" ? { value: v, type: Number, format: fmt, ...(bold ? { fontWeight: "bold" } : {}) } : v;
        return;
      }
      if (r.style === "input") {
        const t = i - nHist;
        const v = d[r.key as DriverKey][t];
        line[col] = { value: v, type: Number, textColor: BLUE, format: DRIVER_INFO[r.key as DriverKey].unit === "amount" ? FMT : "0.0" };
        return;
      }
      if (!r.fc) return;
      const L = colLetter(col);
      const P = colLetter(col - 1);
      const ref = (k: string) => {
        const n = rowOf.get(k);
        if (!n) throw new Error(`Unknown row ${k}`);
        return n;
      };
      const f: F = { c: (k) => `${L}${ref(k)}`, p: (k) => `${P}${ref(k)}`, s: (k) => `$B$${settingRow.get(k)}` };
      line[col] = { value: r.fc(f) /* the file format stores formulas without a leading "=" */, type: "Formula", format: fmt, ...(bold ? { fontWeight: "bold" } : {}) } as Cell;
    });
    data.push(line);
  });

  return { data, columns: [{ width: 46 }, ...years.map(() => ({ width: 14 }))] };
}
