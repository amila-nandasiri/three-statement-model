import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, SCENARIO_COLOR } from "../lib/colors";
import { money, moneyShort } from "../lib/format";
import { SCENARIO_LABEL, SCENARIOS, useModel } from "../lib/model";

const axisProps = { stroke: C.axis, fontSize: 12, tickLine: false, axisLine: false } as const;

export function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-zinc-200 rounded-2xl p-5 md:p-6 min-w-0 break-inside-avoid">
      <h2 className="font-semibold text-zinc-900">{title}</h2>
      {subtitle && <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Label for the boundary between actual and forecast years */
function useForecastStart() {
  const { years } = useModel();
  return years.find((y) => !y.actual)?.label;
}

export function GrowthChart() {
  const { years, scenario } = useModel();
  const start = useForecastStart();
  const data = years.map((y) => ({ label: y.label, revenue: y.revenue, ebitda: y.ebitda, margin: y.ratios.ebitdaMargin }));
  return (
    <Card title="Revenue and EBITDA" subtitle={`${SCENARIO_LABEL[scenario]}. Labels show the EBITDA margin`}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 16, right: 8, left: 0 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={moneyShort} width={60} />
          <Tooltip formatter={(v: number) => money(v)} cursor={{ fill: "#f4f4f5" }} />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
          {start && <ReferenceLine x={start} stroke={C.reference} strokeDasharray="4 4" label={{ value: "Forecast →", position: "insideTopLeft", fontSize: 11, fill: C.axis }} />}
          <Bar dataKey="revenue" name="Revenue" fill={C.revenue} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="ebitda" name="EBITDA" fill={C.ebitda} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="margin" position="top" formatter={(v: number) => `${(v * 100).toFixed(0)}%`} fontSize={11} fill="#3f3f46" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function LiquidityChart() {
  const { years, scenario, inputs } = useModel();
  const data = years.map((y) => ({ label: y.label, cash: y.cash, revolver: y.revolver }));
  return (
    <Card title="Cash and revolver" subtitle={`${SCENARIO_LABEL[scenario]}. The revolver draws to protect minimum cash, up to its ${moneyShort(inputs.settings.revolverLimit)} limit`}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={moneyShort} width={60} />
          <Tooltip formatter={(v: number) => money(v)} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={inputs.settings.minimumCash} stroke={C.reference} strokeDasharray="5 4" label={{ value: "Minimum cash", position: "insideBottomRight", fontSize: 11, fill: C.axis }} />
          <ReferenceLine y={inputs.settings.revolverLimit} stroke={C.revolver} strokeOpacity={0.5} strokeDasharray="2 4" label={{ value: "Revolver limit", position: "insideTopRight", fontSize: 11, fill: C.axis }} />
          <Line dataKey="cash" name="Cash" stroke={C.cash} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          <Line dataKey="revolver" name="Revolver drawn" stroke={C.revolver} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function LeverageChart() {
  const { all, inputs, scenario } = useModel();
  const base = all.base;
  const data = base.map((y, i) => ({
    label: y.label,
    downside: all.downside[i].ratios.netDebtToEbitda,
    base: all.base[i].ratios.netDebtToEbitda,
    upside: all.upside[i].ratios.netDebtToEbitda
  }));
  const order = [...SCENARIOS.filter((k) => k !== scenario), scenario];
  // Whole-number axis from the lowest value (or 0) to above the covenant
  const values = data.flatMap((d) => [d.downside, d.base, d.upside]).filter((v): v is number => v !== null);
  const lo = Math.min(0, Math.floor(Math.min(...values)));
  const hi = Math.max(Math.ceil(Math.max(...values)), Math.ceil(inputs.settings.maxNetDebtToEbitda + 0.5));
  const ticks = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  return (
    <Card title="Leverage by scenario" subtitle={`Net debt (incl. leases) / EBITDA. The covenant maximum is ${inputs.settings.maxNetDebtToEbitda}x`}>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 mb-3">
        {SCENARIOS.map((k) => (
          <span key={k} className={`inline-flex items-center gap-1.5 ${k === scenario ? "font-medium text-zinc-900" : ""}`}>
            <span className="w-3 rounded" style={{ background: SCENARIO_COLOR[k], height: k === scenario ? 3 : 2 }} />
            {SCENARIO_LABEL[k]}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={236}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: -8 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={(v) => `${v}x`} domain={[lo, hi]} ticks={ticks} />
          <Tooltip formatter={(v: number) => (v === null ? "n/a" : `${v.toFixed(2)}x`)} />
          <ReferenceLine y={inputs.settings.maxNetDebtToEbitda} stroke={C.reference} strokeDasharray="5 4" label={{ value: "Covenant", position: "insideTopRight", fontSize: 11, fill: C.axis }} />
          <ReferenceLine y={0} stroke="#a1a1aa" />
          {order.map((k) => (
            <Line key={k} dataKey={k} name={SCENARIO_LABEL[k]} stroke={SCENARIO_COLOR[k]} strokeWidth={k === scenario ? 3 : 2} strokeOpacity={k === scenario ? 1 : 0.55} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
