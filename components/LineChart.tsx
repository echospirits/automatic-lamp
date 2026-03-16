type Point = { label:string; ourValue:number; compValue:number; };
export default function LineChart({ title, points, ourLabel = "Our Retail", compLabel = "Competitor" }: { title:string; points:Point[]; ourLabel?:string; compLabel?:string; }) {
  const width = 760, height = 260, pad = 36;
  const maxValue = Math.max(1, ...points.flatMap((p) => [p.ourValue, p.compValue]));
  const innerWidth = width - pad * 2, innerHeight = height - pad * 2;
  const x = (index: number) => points.length <= 1 ? pad : pad + (index * innerWidth) / (points.length - 1);
  const y = (value: number) => pad + innerHeight - (value / maxValue) * innerHeight;
  const buildPath = (values: number[]) => values.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`).join(" ");
  return <div className="chart-wrap"><div style={{fontWeight:600,marginBottom:10}}>{title}</div>{points.length === 0 ? <div className="small">No history yet.</div> : <><svg viewBox={`0 0 ${width} ${height}`} style={{width:"100%",height:"auto"}}>{[0,0.25,0.5,0.75,1].map((tick) => { const value = Math.round(maxValue * tick); const yy = y(value); return <g key={tick}><line x1={pad} x2={width-pad} y1={yy} y2={yy} stroke="#e2e8f0" /><text x={4} y={yy+4} fontSize="11" fill="#64748b">{value}</text></g>; })}<path d={buildPath(points.map((p) => p.ourValue))} fill="none" stroke="#1d4ed8" strokeWidth="3" /><path d={buildPath(points.map((p) => p.compValue))} fill="none" stroke="#059669" strokeWidth="3" />{points.map((p, i) => <g key={p.label}><circle cx={x(i)} cy={y(p.ourValue)} r="4" fill="#1d4ed8" /><circle cx={x(i)} cy={y(p.compValue)} r="4" fill="#059669" /><text x={x(i)} y={height-8} textAnchor="middle" fontSize="11" fill="#64748b">{p.label}</text></g>)}</svg><div className="legend"><span className="our">{ourLabel}</span><span className="comp">{compLabel}</span></div></>}</div>;
}
