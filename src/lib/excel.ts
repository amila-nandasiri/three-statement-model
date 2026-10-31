// Excel: read uploaded workbooks, and write the template and the live-formula model.

import readXlsxFile from "read-excel-file/browser";
import writeXlsxFile, { type Cell, type SheetData } from "write-excel-file/browser";
import { downloadText, parseCsv, toCsv } from "./csv";
import { TEMPLATES, type UploadedFile } from "./importer";
import { runModel, SCENARIO_LABEL, SCENARIOS, type Model } from "./model";
import { buildModelSheet } from "./workbook";

const isoDate = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

/** Each sheet with data becomes one "file" */
export async function readWorkbook(file: File): Promise<UploadedFile[]> {
  const sheets = await readXlsxFile(file);
  return sheets
    .filter((s) => !/^(instructions|read ?me|notes?)$/i.test(s.sheet.trim()) && s.data.length > 1)
    .map((s) => ({ name: `${file.name} · ${s.sheet}`, text: toCsv(s.data.map((row) => row.map((v) => (v instanceof Date ? isoDate(v) : v === null ? "" : String(v))))) }));
}

const header = (v: string): Cell => ({ value: v, fontWeight: "bold", backgroundColor: "#F4F4F5", borderStyle: "thin", borderColor: "#D4D4D8" });
const BLUE = "#1F4FB4";

function gridSheet(csv: string, numberFrom: number, blueNumbers: boolean): SheetData {
  const [head, ...rows] = parseCsv(csv);
  return [
    head.map(header),
    ...rows.map((r) => r.map((v, i): Cell => (i >= numberFrom && v !== "" && !isNaN(Number(v)) ? { value: Number(v), type: Number, format: Math.abs(Number(v)) >= 1000 ? "#,##0" : "0.0", ...(blueNumbers ? { textColor: BLUE } : {}) } : v)))
  ];
}

const INSTRUCTIONS = [
  ["Three-statement model: input template"],
  [""],
  ["1. History: your actual income statement and closing balance sheet, one column per year (FY2024, FY2025 …). The last year is the starting point for the forecast. Enter all amounts as positive numbers."],
  ["   The balance sheet must balance: assets = liabilities + equity. Two or more years also give a historical cash flow."],
  ["2. Drivers: one column per forecast year (as many years as you like). Percentages as numbers (7.5 = 7.5%)."],
  ["3. Settings: minimum cash, revolver limit, average lease life and the two covenants."],
  ["4. Save and upload this workbook on the model with 'Use your data'. The example values are the full sample to overwrite."],
  [""],
  ["Line items in History"],
  ["Income statement", "revenue, direct_costs, overheads, depreciation_ppe, depreciation_rou, interest_term_loan, interest_revolver, interest_leases, tax"],
  ["Balance sheet", "ppe, right_of_use_assets, inventory, receivables, cash, payables, revolver, term_loan, lease_liabilities, share_capital, retained_earnings"],
  [""],
  ["Your data stays on your computer: the model calculates everything in your browser."]
];

export async function downloadTemplateWorkbook() {
  await writeXlsxFile([
    { sheet: "Instructions", data: INSTRUCTIONS.map((r, i) => r.map((v): Cell => (i === 0 || i === 8 ? { value: v, fontWeight: "bold" } : v))), columns: [{ width: 22 }, { width: 120 }] },
    { sheet: "History", data: gridSheet(TEMPLATES.history, 1, false), columns: [{ width: 28 }, { width: 16 }, { width: 16 }, { width: 16 }], stickyRowsCount: 1 },
    { sheet: "Drivers", data: gridSheet(TEMPLATES.drivers, 1, true), columns: [{ width: 28 }, ...Array.from({ length: 5 }, () => ({ width: 12 })), { width: 70 }], stickyRowsCount: 1 },
    { sheet: "Settings", data: gridSheet(TEMPLATES.settings, 1, true), columns: [{ width: 26 }, { width: 40 }, { width: 80 }] }
  ]).toFile("three-statement-model-template.xlsx");
}

export const downloadTemplateCsvs = () => {
  downloadText("history-template.csv", TEMPLATES.history);
  setTimeout(() => downloadText("drivers-template.csv", TEMPLATES.drivers), 300);
  setTimeout(() => downloadText("settings-template.csv", TEMPLATES.settings), 600);
};

/** The live-formula model for the selected scenario, plus a values-only scenario comparison */
export async function downloadModelWorkbook(m: Model) {
  const sheet = buildModelSheet(m.inputs, m.scenario, m.years);
  const last = (k: (typeof SCENARIOS)[number]) => m.all[k][m.all[k].length - 1];
  const num = (v: number | null, f = "#,##0;(#,##0);-"): Cell => (v === null ? "n/a" : { value: v, type: Number, format: f });
  const comparison: SheetData = [
    [{ value: "Scenario comparison (values)", fontWeight: "bold", fontSize: 13 }],
    [`Final forecast year: ${last("base").label}. The Model sheet holds the live formulas for the ${SCENARIO_LABEL[m.scenario].toLowerCase()}.`],
    [],
    [header("Measure"), ...SCENARIOS.map((k) => header(SCENARIO_LABEL[k]))],
    ["Revenue", ...SCENARIOS.map((k) => num(last(k).revenue))],
    ["EBITDA", ...SCENARIOS.map((k) => num(last(k).ebitda))],
    ["EBITDA margin", ...SCENARIOS.map((k) => num(last(k).ratios.ebitdaMargin, "0.0%"))],
    ["Net income", ...SCENARIOS.map((k) => num(last(k).netIncome))],
    ["Cash", ...SCENARIOS.map((k) => num(last(k).cash))],
    ["Net debt incl. leases", ...SCENARIOS.map((k) => num(last(k).ratios.netDebt))],
    ["Peak revolver drawn", ...SCENARIOS.map((k) => num(Math.max(...m.all[k].filter((y) => !y.actual).map((y) => y.revolver))))],
    ["Peak net debt / EBITDA", ...SCENARIOS.map((k) => num(Math.max(...m.all[k].filter((y) => !y.actual).map((y) => y.ratios.netDebtToEbitda ?? 0)), "0.00\"x\""))],
    ["Years below minimum cash", ...SCENARIOS.map((k) => m.all[k].filter((y) => !y.actual && y.cash < m.inputs.settings.minimumCash - 0.5).map((y) => y.label).join(", ") || "None")]
  ];
  await writeXlsxFile([
    { sheet: "Model", data: sheet.data, columns: sheet.columns, stickyColumnsCount: 1 },
    { sheet: "Scenarios", data: comparison, columns: [{ width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }] }
  ]).toFile(`three-statement-model-${m.scenario}.xlsx`);
}

/** Values of the three statements for the selected scenario as CSV */
export function downloadStatementsCsv(m: Model) {
  const years = runModel(m.inputs, m.scenario);
  const line = (label: string, f: (y: (typeof years)[number]) => number | null | undefined) => [label, ...years.map((y) => { const v = f(y); return v === null || v === undefined ? "" : v.toFixed(2); })];
  const rows = [
    ["Line", ...years.map((y) => `${y.label}${y.actual ? " A" : " F"}`)],
    line("Revenue", (y) => y.revenue),
    line("EBITDA", (y) => y.ebitda),
    line("Net income", (y) => y.netIncome),
    line("Total assets", (y) => y.totalAssets),
    line("Cash", (y) => y.cash),
    line("Revolver", (y) => y.revolver),
    line("Term loan", (y) => y.termLoan),
    line("Lease liabilities", (y) => y.leaseLiabilities),
    line("Total equity", (y) => y.shareCapital + y.retainedEarnings),
    line("Cash from operations", (y) => y.cf?.cfo),
    line("Free cash flow", (y) => y.ratios.freeCashFlow),
    line("Net debt / EBITDA", (y) => y.ratios.netDebtToEbitda),
    line("Balance check", (y) => y.balanceCheck)
  ];
  downloadText(`three-statement-model-${m.scenario}.csv`, toCsv(rows));
}
