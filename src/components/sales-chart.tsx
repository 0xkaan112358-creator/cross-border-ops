"use client";

import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceArea, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./ui/chart";

type Point = { date: string; actual: number | null; forecast: number | null; outOfStock: boolean };

const config = {
  actual: { label: "实际销量", color: "var(--chart-1)" },
  forecast: { label: "预测销量", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function SalesChart({ data }: { data: Point[] }) {
  const rows = data.map((d) => ({ ...d, label: d.date.slice(5).replace("-", "/") }));
  // Out-of-stock days usually sell 0, so their bars are invisible; shade each run of them instead.
  const stockoutRuns: { from: string; to: string }[] = [];
  rows.forEach((r, i) => {
    if (!r.outOfStock) return;
    if (i > 0 && rows[i - 1].outOfStock) stockoutRuns[stockoutRuns.length - 1].to = r.label;
    else stockoutRuns.push({ from: r.label, to: r.label });
  });
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <ComposedChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} width={36} fontSize={11} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as Point | undefined;
                return p ? `${p.date}${p.outOfStock ? "（断货）" : ""}` : "";
              }}
            />
          }
        />
        {stockoutRuns.map((run) => (
          <ReferenceArea key={run.from} x1={run.from} x2={run.to} fill="var(--chart-4)" fillOpacity={0.18} strokeOpacity={0} />
        ))}
        <Bar dataKey="actual" fill="var(--color-actual)" radius={[3, 3, 0, 0]}>
          {rows.map((r) => (
            <Cell key={r.date} fill={r.outOfStock ? "var(--chart-4)" : "var(--color-actual)"} />
          ))}
        </Bar>
        <Line dataKey="forecast" stroke="var(--color-forecast)" strokeWidth={2} dot={false} type="stepAfter" />
      </ComposedChart>
    </ChartContainer>
  );
}
