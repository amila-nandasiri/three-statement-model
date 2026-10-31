// Integrated three-statement model: income statement, balance sheet and cash flow,
// linked year by year from the last actual balance sheet and a set of drivers.
//
// No circular references: interest is charged on opening balances, so the revolver
// draw in a year doesn't feed back into that year's interest. The revolver then draws
// (or repays) to keep closing cash at the minimum.

import { createContext, useContext } from "react";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type Settings = {
  company: string;
  currency: string;
  minimumCash: number;
  revolverLimit: number;
  leaseLifeYears: number;
  maxNetDebtToEbitda: number;
  minInterestCover: number;
};

export const PNL_KEYS = ["revenue", "directCosts", "overheads", "depreciationPpe", "depreciationRou", "interestTermLoan", "interestRevolver", "interestLeases", "tax"] as const;
export const BS_KEYS = ["ppe", "rightOfUse", "inventory", "receivables", "cash", "payables", "revolver", "termLoan", "leaseLiabilities", "shareCapital", "retainedEarnings"] as const;
export type PnlKey = (typeof PNL_KEYS)[number];
export type BsKey = (typeof BS_KEYS)[number];

export type HistoricalYear = { label: string } & Record<PnlKey | BsKey, number>;

export const DRIVER_KEYS = [
  "revenueGrowthPct",
  "directCostsPct",
  "overheadsPct",
  "capexPct",
  "ppeDepreciationPct",
  "newLeases",
  "receivableDays",
  "inventoryDays",
  "payableDays",
  "termLoanRepayment",
  "termLoanRatePct",
  "revolverRatePct",
  "leaseRatePct",
  "taxRatePct",
  "dividendPayoutPct"
] as const;
export type DriverKey = (typeof DRIVER_KEYS)[number];
export type Drivers = { years: string[] } & Record<DriverKey, number[]>;

export const DRIVER_INFO: Record<DriverKey, { label: string; unit: "%" | "days" | "amount"; group: string }> = {
  revenueGrowthPct: { label: "Revenue growth", unit: "%", group: "Income statement" },
  directCostsPct: { label: "Direct costs, % of revenue", unit: "%", group: "Income statement" },
  overheadsPct: { label: "Overheads, % of revenue", unit: "%", group: "Income statement" },
  taxRatePct: { label: "Tax rate", unit: "%", group: "Income statement" },
  capexPct: { label: "Capex, % of revenue", unit: "%", group: "Assets" },
  ppeDepreciationPct: { label: "PP&E depreciation, % of opening", unit: "%", group: "Assets" },
  newLeases: { label: "New leases (right-of-use additions)", unit: "amount", group: "Assets" },
  receivableDays: { label: "Receivable days", unit: "days", group: "Working capital" },
  inventoryDays: { label: "Inventory days", unit: "days", group: "Working capital" },
  payableDays: { label: "Payable days", unit: "days", group: "Working capital" },
  termLoanRepayment: { label: "Term loan repayment", unit: "amount", group: "Financing" },
  termLoanRatePct: { label: "Term loan interest rate", unit: "%", group: "Financing" },
  revolverRatePct: { label: "Revolver interest rate", unit: "%", group: "Financing" },
  leaseRatePct: { label: "Lease interest rate", unit: "%", group: "Financing" },
  dividendPayoutPct: { label: "Dividend payout, % of net income", unit: "%", group: "Financing" }
};

export type Inputs = { source: "sample" | "upload"; settings: Settings; history: HistoricalYear[]; drivers: Drivers };

// ---------------------------------------------------------------------------
// Scenarios: adjustments on top of the base drivers
// ---------------------------------------------------------------------------

export type ScenarioKey = "base" | "upside" | "downside";
export const SCENARIOS: ScenarioKey[] = ["downside", "base", "upside"];
export const SCENARIO_LABEL: Record<ScenarioKey, string> = { base: "Base case", upside: "Upside", downside: "Downside" };
export const SCENARIO_NOTE: Record<ScenarioKey, string> = {
  base: "The drivers as entered",
  upside: "Growth +3 pts a year, direct costs −1 pt, receivable days −5",
  downside: "Growth −8 pts a year, direct costs +3 pts, overheads +1 pt, receivable days +15"
};

export function scenarioDrivers(d: Drivers, s: ScenarioKey): Drivers {
  if (s === "base") return d;
  const add = (xs: number[], n: number) => xs.map((x) => x + n);
  return s === "upside"
    ? { ...d, revenueGrowthPct: add(d.revenueGrowthPct, 3), directCostsPct: add(d.directCostsPct, -1), receivableDays: add(d.receivableDays, -5) }
    : {
        ...d,
        revenueGrowthPct: add(d.revenueGrowthPct, -8),
        directCostsPct: add(d.directCostsPct, 3),
        overheadsPct: add(d.overheadsPct, 1),
        receivableDays: add(d.receivableDays, 15)
      };
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

export type YearResult = { label: string; actual: boolean } & Record<PnlKey | BsKey, number> & {
    grossProfit: number;
    ebitda: number;
    ebit: number;
    interest: number;
    pbt: number;
    netIncome: number;
    // cash flow (null for the first historical year: needs an opening balance sheet)
    cf: null | {
      netIncome: number;
      depreciation: number;
      changeReceivables: number;
      changeInventory: number;
      changePayables: number;
      cfo: number;
      capex: number;
      cfi: number;
      termLoan: number;
      revolver: number;
      leasePrincipal: number;
      dividends: number;
      cff: number;
      netChange: number;
      openingCash: number;
      closingCash: number;
    };
    newLeases: number;
    totalAssets: number;
    totalLiabilitiesEquity: number;
    balanceCheck: number;
    ratios: {
      revenueGrowth: number | null;
      ebitdaMargin: number;
      netMargin: number;
      roe: number | null;
      netDebt: number;
      netDebtToEbitda: number | null;
      interestCover: number | null;
      freeCashFlow: number | null;
      receivableDays: number;
      leverageBreach: boolean;
      coverBreach: boolean;
    };
  };

const sum = (...xs: number[]) => xs.reduce((a, b) => a + b, 0);

function complete(y: Omit<YearResult, "grossProfit" | "ebitda" | "ebit" | "interest" | "pbt" | "netIncome" | "totalAssets" | "totalLiabilitiesEquity" | "balanceCheck" | "ratios">, prev: YearResult | null, s: Settings): YearResult {
  const grossProfit = y.revenue - y.directCosts;
  const ebitda = grossProfit - y.overheads;
  const ebit = ebitda - y.depreciationPpe - y.depreciationRou;
  const interest = y.interestTermLoan + y.interestRevolver + y.interestLeases;
  const pbt = ebit - interest;
  const netIncome = pbt - y.tax;
  const totalAssets = sum(y.ppe, y.rightOfUse, y.inventory, y.receivables, y.cash);
  const totalLiabilitiesEquity = sum(y.payables, y.revolver, y.termLoan, y.leaseLiabilities, y.shareCapital, y.retainedEarnings);
  const netDebt = y.termLoan + y.revolver + y.leaseLiabilities - y.cash;
  const equity = y.shareCapital + y.retainedEarnings;
  const prevEquity = prev ? prev.shareCapital + prev.retainedEarnings : null;
  const netDebtToEbitda = ebitda > 0 ? netDebt / ebitda : null;
  const interestCover = interest > 0 ? ebitda / interest : null;
  return {
    ...y,
    grossProfit,
    ebitda,
    ebit,
    interest,
    pbt,
    netIncome,
    totalAssets,
    totalLiabilitiesEquity,
    balanceCheck: totalAssets - totalLiabilitiesEquity,
    ratios: {
      revenueGrowth: prev && prev.revenue ? y.revenue / prev.revenue - 1 : null,
      ebitdaMargin: y.revenue ? ebitda / y.revenue : 0,
      netMargin: y.revenue ? netIncome / y.revenue : 0,
      roe: prevEquity !== null && prevEquity + equity > 0 ? netIncome / ((prevEquity + equity) / 2) : null,
      netDebt,
      netDebtToEbitda,
      interestCover,
      freeCashFlow: y.cf ? y.cf.cfo + y.cf.capex + y.cf.leasePrincipal : null,
      receivableDays: y.revenue ? (y.receivables / y.revenue) * 365 : 0,
      leverageBreach: netDebtToEbitda === null ? ebitda <= 0 && netDebt > 0 : netDebtToEbitda > s.maxNetDebtToEbitda,
      coverBreach: interestCover !== null && interestCover < s.minInterestCover
    }
  };
}

/** Cash flow for a historical year, derived from two balance sheets and the income statement */
function derivedCashFlow(h: HistoricalYear, p: HistoricalYear): NonNullable<YearResult["cf"]> {
  const ni = h.revenue - h.directCosts - h.overheads - h.depreciationPpe - h.depreciationRou - h.interestTermLoan - h.interestRevolver - h.interestLeases - h.tax;
  const dep = h.depreciationPpe + h.depreciationRou;
  const changeReceivables = -(h.receivables - p.receivables);
  const changeInventory = -(h.inventory - p.inventory);
  const changePayables = h.payables - p.payables;
  const cfo = ni + dep + changeReceivables + changeInventory + changePayables;
  const capex = -(h.ppe - p.ppe + h.depreciationPpe);
  const newLeases = h.rightOfUse - p.rightOfUse + h.depreciationRou;
  const leasePrincipal = -(p.leaseLiabilities + newLeases - h.leaseLiabilities);
  const termLoan = h.termLoan - p.termLoan;
  const revolver = h.revolver - p.revolver;
  const dividends = -(p.retainedEarnings + ni - h.retainedEarnings);
  const cff = termLoan + revolver + leasePrincipal + dividends + (h.shareCapital - p.shareCapital);
  return {
    netIncome: ni,
    depreciation: dep,
    changeReceivables,
    changeInventory,
    changePayables,
    cfo,
    capex,
    cfi: capex,
    termLoan,
    revolver,
    leasePrincipal,
    dividends,
    cff,
    netChange: cfo + capex + cff,
    openingCash: p.cash,
    closingCash: h.cash
  };
}

export function runModel(inputs: Inputs, scenario: ScenarioKey): YearResult[] {
  const s = inputs.settings;
  const d = scenarioDrivers(inputs.drivers, scenario);
  const out: YearResult[] = [];

  inputs.history.forEach((h, i) => {
    const p = i > 0 ? inputs.history[i - 1] : null;
    const { label, ...vals } = h;
    const newLeases = p ? h.rightOfUse - p.rightOfUse + h.depreciationRou : 0;
    out.push(complete({ label, actual: true, ...vals, cf: p ? derivedCashFlow(h, p) : null, newLeases }, out[i - 1] ?? null, s));
  });

  d.years.forEach((label, t) => {
    const p = out[out.length - 1];
    const g = (k: DriverKey) => d[k][t] ?? 0;
    const pct = (k: DriverKey) => g(k) / 100;

    const revenue = p.revenue * (1 + pct("revenueGrowthPct"));
    const directCosts = revenue * pct("directCostsPct");
    const overheads = revenue * pct("overheadsPct");
    const capex = revenue * pct("capexPct");
    const depreciationPpe = p.ppe * pct("ppeDepreciationPct");
    const ppe = p.ppe + capex - depreciationPpe;

    // Leases (simplified IFRS 16): additions mid-year, straight-line over the average remaining life
    const newLeases = g("newLeases");
    const depreciationRou = (p.rightOfUse + newLeases / 2) / s.leaseLifeYears;
    const rightOfUse = p.rightOfUse + newLeases - depreciationRou;
    const interestLeases = p.leaseLiabilities * pct("leaseRatePct");
    const leasePrincipal = Math.min(p.leaseLiabilities + newLeases, (p.leaseLiabilities + newLeases / 2) / s.leaseLifeYears);
    const leaseLiabilities = p.leaseLiabilities + newLeases - leasePrincipal;

    const termRepay = Math.min(p.termLoan, g("termLoanRepayment"));
    const termLoan = p.termLoan - termRepay;
    const interestTermLoan = p.termLoan * pct("termLoanRatePct");
    const interestRevolver = p.revolver * pct("revolverRatePct");

    const pbt = revenue - directCosts - overheads - depreciationPpe - depreciationRou - interestTermLoan - interestRevolver - interestLeases;
    const tax = Math.max(0, pbt * pct("taxRatePct"));
    const netIncome = pbt - tax;

    const receivables = (revenue * g("receivableDays")) / 365;
    const inventory = (directCosts * g("inventoryDays")) / 365;
    const payables = (directCosts * g("payableDays")) / 365;
    const dividends = Math.max(0, netIncome * pct("dividendPayoutPct"));

    const changeReceivables = -(receivables - p.receivables);
    const changeInventory = -(inventory - p.inventory);
    const changePayables = payables - p.payables;
    const cfo = netIncome + depreciationPpe + depreciationRou + changeReceivables + changeInventory + changePayables;
    const cashBeforeRevolver = p.cash + cfo - capex - termRepay - leasePrincipal - dividends;

    // Revolver: draw to reach minimum cash (up to the limit), repay from any surplus
    let revolverMove = 0;
    if (cashBeforeRevolver < s.minimumCash) revolverMove = Math.min(s.minimumCash - cashBeforeRevolver, Math.max(0, s.revolverLimit - p.revolver));
    else if (p.revolver > 0) revolverMove = -Math.min(p.revolver, cashBeforeRevolver - s.minimumCash);
    const revolver = p.revolver + revolverMove;
    const cash = cashBeforeRevolver + revolverMove;
    const cff = -termRepay + revolverMove - leasePrincipal - dividends;

    out.push(
      complete(
        {
          label,
          actual: false,
          revenue,
          directCosts,
          overheads,
          depreciationPpe,
          depreciationRou,
          interestTermLoan,
          interestRevolver,
          interestLeases,
          tax,
          ppe,
          rightOfUse,
          inventory,
          receivables,
          cash,
          payables,
          revolver,
          termLoan,
          leaseLiabilities,
          shareCapital: p.shareCapital,
          retainedEarnings: p.retainedEarnings + netIncome - dividends,
          newLeases,
          cf: {
            netIncome,
            depreciation: depreciationPpe + depreciationRou,
            changeReceivables,
            changeInventory,
            changePayables,
            cfo,
            capex: -capex,
            cfi: -capex,
            termLoan: -termRepay,
            revolver: revolverMove,
            leasePrincipal: -leasePrincipal,
            dividends: -dividends,
            cff,
            netChange: cfo - capex + cff,
            openingCash: p.cash,
            closingCash: cash
          }
        },
        p,
        s
      )
    );
  });
  return out;
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

export type Model = { inputs: Inputs; scenario: ScenarioKey; years: YearResult[]; all: Record<ScenarioKey, YearResult[]> };

export const ModelContext = createContext<Model | null>(null);

export function useModel(): Model {
  const m = useContext(ModelContext);
  if (!m) throw new Error("useModel must be used inside ModelContext");
  return m;
}
