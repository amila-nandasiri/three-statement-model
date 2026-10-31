// Reads model inputs: settings (key/value), history (line items by year) and drivers
// (drivers by forecast year). The sample data uses exactly the upload format.

import driversCsv from "../../data/drivers.csv?raw";
import historyCsv from "../../data/history.csv?raw";
import settingsCsv from "../../data/settings.csv?raw";
import { parseCsv } from "./csv";
import { BS_KEYS, DRIVER_KEYS, PNL_KEYS, type BsKey, type DriverKey, type Drivers, type HistoricalYear, type Inputs, type PnlKey, type Settings } from "./model";

export type UploadedFile = { name: string; text: string };
export type FileKind = "settings" | "history" | "drivers" | "unknown";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function parseNumber(raw: string | undefined): number | null {
  let v = (raw ?? "").trim();
  if (!v || v === "-") return null;
  let negative = false;
  if (/^\(.*\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1);
  }
  v = v.replace(/[^0-9.\-]/g, "");
  if (!v || v === "-" || v === ".") return null;
  const n = Number(v);
  return Number.isFinite(n) ? (negative ? -Math.abs(n) : n) : null;
}

const HISTORY_ALIASES: Record<PnlKey | BsKey, string[]> = {
  revenue: ["revenue", "sales", "turnover", "totalrevenue"],
  directCosts: ["directcosts", "costofsales", "cogs", "costofrevenue"],
  overheads: ["overheads", "operatingexpenses", "opex", "sga", "adminexpenses"],
  depreciationPpe: ["depreciationppe", "depreciation", "depreciationofppe"],
  depreciationRou: ["depreciationrou", "depreciationofrightofuseassets", "roudepreciation"],
  interestTermLoan: ["interesttermloan", "interestondebt", "interestexpense", "financecosts"],
  interestRevolver: ["interestrevolver", "interestonrevolver", "overdraftinterest"],
  interestLeases: ["interestleases", "leaseinterest", "interestonleaseliabilities"],
  tax: ["tax", "incometax", "taxexpense"],
  ppe: ["ppe", "propertyplantandequipment", "fixedassets"],
  rightOfUse: ["rightofuseassets", "rightofuse", "rou", "rouassets"],
  inventory: ["inventory", "inventories", "stock", "spares"],
  receivables: ["receivables", "tradereceivables", "accountsreceivable", "debtors"],
  cash: ["cash", "cashandcashequivalents", "cashandbank"],
  payables: ["payables", "tradepayables", "accountspayable", "creditors"],
  revolver: ["revolver", "revolvingcreditfacility", "rcf", "overdraft"],
  termLoan: ["termloan", "borrowings", "loans", "longtermdebt", "debt"],
  leaseLiabilities: ["leaseliabilities", "leaseliability", "leases"],
  shareCapital: ["sharecapital", "statedcapital", "capital"],
  retainedEarnings: ["retainedearnings", "reserves", "accumulatedprofits"]
};

const SETTING_ALIASES: Record<keyof Settings, string[]> = {
  company: ["company", "companyname", "name"],
  currency: ["currency"],
  minimumCash: ["minimumcash", "mincash"],
  revolverLimit: ["revolverlimit", "rcflimit", "facilitylimit"],
  leaseLifeYears: ["leaselifeyears", "leaselife"],
  maxNetDebtToEbitda: ["maxnetdebttoebitda", "leveragecovenant", "maxleverage"],
  minInterestCover: ["mininterestcover", "interestcovercovenant", "mininterestcoverage"]
};

const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const driverKeyOf = (raw: string) => DRIVER_KEYS.find((k) => norm(k) === norm(toCamel(raw.trim())) || norm(k) === norm(raw));
const yearColumns = (headers: string[]) => headers.map((h, i) => ({ h: h.trim(), i })).filter((x) => x.i > 0 && /^(fy)?\s*\d{4}[a-z]?$/i.test(x.h));

export function detectKind(text: string): FileKind {
  const [headers = []] = parseCsv(text);
  const first = norm(headers[0] ?? "");
  if (first === "setting" || first === "key") return "settings";
  if (first === "driver" || first === "assumption") return "drivers";
  if (first === "lineitem" || first === "item" || first === "account") return "history";
  // Fall back to the row labels
  const labels = parseCsv(text).slice(1).map((r) => norm(r[0] ?? ""));
  if (labels.some((l) => DRIVER_KEYS.some((k) => norm(k) === l))) return "drivers";
  if (labels.some((l) => Object.values(HISTORY_ALIASES).some((a) => a.includes(l)))) return "history";
  return "unknown";
}

export type ImportResult = { ok: true; inputs: Inputs; notes: string[] } | { ok: false; errors: string[] };

export function importInputs(files: UploadedFile[]): ImportResult {
  const errors: string[] = [];
  const notes: string[] = [];
  const of = (k: FileKind) => files.filter((f) => detectKind(f.text) === k);
  if (of("history").length !== 1) errors.push("Upload one History sheet: line items by year, ending with your last actual year.");
  if (of("drivers").length !== 1) errors.push("Upload one Drivers sheet: one row per driver, one column per forecast year.");
  if (errors.length) return { ok: false, errors };

  // Settings
  const settings: Settings = { company: "Your company", currency: "USD", minimumCash: 0, revolverLimit: 0, leaseLifeYears: 5, maxNetDebtToEbitda: 3, minInterestCover: 4 };
  const sFile = of("settings")[0];
  if (sFile) {
    for (const [k = "", v = ""] of parseCsv(sFile.text).slice(1)) {
      const key = (Object.keys(SETTING_ALIASES) as (keyof Settings)[]).find((f) => SETTING_ALIASES[f].includes(norm(k)));
      if (!key) continue;
      if (key === "company" || key === "currency") settings[key] = v.trim() || settings[key];
      else settings[key] = parseNumber(v) ?? settings[key];
    }
  } else notes.push("No Settings sheet, so default settings are used (no revolver, 5-year lease life). Upload one to set these.");

  // History
  const [hHead, ...hRows] = parseCsv(of("history")[0].text);
  const hYears = yearColumns(hHead);
  if (!hYears.length) return { ok: false, errors: ["The History sheet needs year columns, such as FY2024 and FY2025."] };
  const history: HistoricalYear[] = hYears.map(({ h }) => ({ label: h.toUpperCase().startsWith("FY") ? h.toUpperCase() : `FY${h}` }) as HistoricalYear);
  const missing = new Set<string>([...PNL_KEYS, ...BS_KEYS]);
  for (const r of hRows) {
    const key = (Object.keys(HISTORY_ALIASES) as (PnlKey | BsKey)[]).find((k) => HISTORY_ALIASES[k].includes(norm(r[0] ?? "")));
    if (!key) continue;
    missing.delete(key);
    hYears.forEach(({ i }, y) => ((history[y] as Record<string, number>)[key] = Math.abs(parseNumber(r[i]) ?? 0)));
  }
  for (const k of missing) for (const h of history) (h as Record<string, number>)[k] = 0;
  if (missing.has("revenue") || missing.has("cash")) return { ok: false, errors: ["The History sheet needs at least revenue and cash rows."] };
  if (missing.size) notes.push(`History lines not found, treated as zero: ${[...missing].join(", ")}.`);
  for (const h of history) {
    const diff = h.ppe + h.rightOfUse + h.inventory + h.receivables + h.cash - (h.payables + h.revolver + h.termLoan + h.leaseLiabilities + h.shareCapital + h.retainedEarnings);
    if (Math.abs(diff) > 1) notes.push(`${h.label} balance sheet is out by ${Math.round(diff).toLocaleString()}. The forecast keeps that difference, so check your history.`);
  }

  // Drivers
  const [dHead, ...dRows] = parseCsv(of("drivers")[0].text);
  const dYears = yearColumns(dHead);
  if (!dYears.length) return { ok: false, errors: ["The Drivers sheet needs forecast year columns, such as FY2026 to FY2030."] };
  const drivers = { years: dYears.map(({ h }) => (h.toUpperCase().startsWith("FY") ? h.toUpperCase() : `FY${h}`)) } as Drivers;
  const dMissing = new Set<DriverKey>(DRIVER_KEYS);
  for (const r of dRows) {
    const key = driverKeyOf(r[0] ?? "");
    if (!key) continue;
    dMissing.delete(key);
    drivers[key] = dYears.map(({ i }) => parseNumber(r[i]) ?? 0);
  }
  for (const k of dMissing) drivers[k] = dYears.map(() => 0);
  if (dMissing.size) notes.push(`Drivers not found, set to zero: ${[...dMissing].join(", ")}.`);

  notes.unshift(`${history.length} historical year(s) and ${drivers.years.length} forecast years read.`);
  return { ok: true, notes, inputs: { source: "upload", settings, history, drivers } };
}

export function sampleInputs(): Inputs {
  const r = importInputs([
    { name: "settings.csv", text: settingsCsv },
    { name: "history.csv", text: historyCsv },
    { name: "drivers.csv", text: driversCsv }
  ]);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return { ...r.inputs, source: "sample" };
}

export const TEMPLATES = { settings: settingsCsv, history: historyCsv, drivers: driversCsv };
