import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
type Props = { label: string; value: string; detail: ReactNode; icon: LucideIcon; tone?: "blue" | "green" | "amber" | "slate" };
export default function StatCard({ label, value, detail, icon: Icon, tone = "blue" }: Props) {
  return <article className="stat-card">
    <div className="stat-top"><span>{label}</span><span className={`stat-icon stat-${tone}`}><Icon size={19} /></span></div>
    <div className="stat-value">{value}</div><div className="stat-detail">{detail}</div>
  </article>;
}