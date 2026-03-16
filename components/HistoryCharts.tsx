"use client";
import { BarChart, Bar, CartesianGrid, Legend, LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function HistoryCharts({ skuData, storeData }: {
  skuData: Array<{ month: string; Cuts: number; Fixes: number; Adds: number; Outperform: number }>;
  storeData: Array<{ month: string; Retail: number; Benchmark: number; Share: number }>;
}) {
  return (
    <div className="two-col">
      <div className="card">
        <h3>SKU History</h3>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={skuData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" /><YAxis /><Tooltip /><Legend />
              <Bar dataKey="Cuts" /><Bar dataKey="Fixes" /><Bar dataKey="Adds" /><Bar dataKey="Outperform" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card">
        <h3>Store History</h3>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <LineChart data={storeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" /><YAxis /><Tooltip /><Legend />
              <Line type="monotone" dataKey="Retail" stroke="#2563eb" strokeWidth={2} />
              <Line type="monotone" dataKey="Benchmark" stroke="#16a34a" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
