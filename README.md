# Three-Statement Financial Model

An integrated three-statement model: income statement, balance sheet and cash flow, linked year by year from two years of actuals into a five-year forecast. It is driver-based, with base, upside and downside scenarios, an automatic revolving credit facility, IFRS 16 leases and covenant tests. The balance sheet balances in every year, and the model proves it.

**Live demo:** https://dewapriya.com/projects/three-statement/

> The sample is **fictional**: a Maldives seaplane operator, the same company as my [AR dashboard](https://github.com/amila-nandasiri/ar-collections-dashboard), [cash flow forecast](https://github.com/amila-nandasiri/cash-flow-forecast) and [IFRS 16 calculator](https://github.com/amila-nandasiri/ifrs16-lease-calculator). FY2026 revenue of $77M matches my management pack budget, and the opening lease balances match the IFRS 16 calculator.

## The story in the sample

A fleet-renewal aircraft purchase in FY2027 (capex at 14% of revenue) tests liquidity:

| | Base | Upside | Downside |
|---|---|---|---|
| Revenue FY2030 | $94.5M | $108.7M | $63.8M |
| EBITDA margin FY2030 | 24.0% | 25.0% | 20.0% |
| Peak revolver drawn | $2.4M (FY2027) | $1.2M | $6.0M, fully drawn |
| Peak net debt / EBITDA | 1.06x | 0.90x | 1.79x |
| Cash below the $2M minimum | Never | Never | FY2027, short by $0.24M |

In the downside, the revolver is fully drawn and the company still has a funding gap in FY2027. The model flags it and suggests the options: a larger facility, deferring capex, or cutting the dividend.

## How it works

- **Drivers:**
  - revenue growth, plus direct costs, overheads and capex as a % of revenue
  - PP&E depreciation rate and new leases
  - receivable, inventory and payable days
  - term loan repayment and interest rates, tax rate and dividend payout
- **Links:**
  - Net income flows to retained earnings and the cash flow.
  - Working capital comes from the days drivers, and capex and depreciation roll PP&E forward.
  - The cash flow's closing cash *is* the balance sheet's cash, and check rows prove both identities every year.
- **No circular references:** interest is charged on opening balances. The revolver then draws to keep cash at the minimum (up to its limit) and repays from any surplus.
- **Leases (simplified IFRS 16):** right-of-use depreciation and lease principal run over the average remaining lease life, with new leases added mid-year. Lease interest sits in finance costs, and lease principal in financing cash flows.
- **Ratios and covenants:**
  - growth, margins, ROE, receivable days and free cash flow after leases
  - net debt (including leases) to EBITDA, and interest cover, against covenant limits

## The Excel export is a working model

**Download → Excel model** produces a spreadsheet with live formulas, not a static report:

- Inputs are in **blue** and calculations in black, following modelling convention.
- History is entered as values, and every forecast cell is a formula (about 300 in all).
- Balance and cash checks are built in.
- A Scenarios sheet compares base, upside and downside.

I verified it by recalculating the exported workbook in LibreOffice and comparing every line with the app. They match exactly, in all three scenarios.

## Use your own figures

**Use your data** takes the Excel template, or three CSV files:

- **History:** income statement and closing balance sheet lines, one column per year (FY2024, FY2025 …)
- **Drivers:** one row per driver, one column per forecast year (any number of years)
- **Settings:** minimum cash, revolver limit, lease life and covenants

Files are read and calculated entirely in the browser. Nothing is uploaded or stored.

## Tech

- **App:** React, TypeScript, Recharts and Tailwind CSS, built with Vite
- **Model engine:** [`src/lib/model.ts`](src/lib/model.ts)
- **Excel formula builder:** [`src/lib/workbook.ts`](src/lib/workbook.ts)
- **Sample data:** [`data/`](data), in the same format as the upload template
- **Offline version:** `npm run build` also produces `dist/three-statement-model.html`, a single self-contained file

```bash
npm install
npm run dev     # http://localhost:5173
npm run build
```

---

Built by [Amila Dewapriya](https://dewapriya.com), CMA: finance professional building with data and code.
