import type { ReactNode } from "react";
type Props = { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "blue" };
export default function Chip({ children, tone = "neutral" }: Props) {
  return <span className={`chip chip-${tone}`}><span className="chip-dot" />{children}</span>;
}