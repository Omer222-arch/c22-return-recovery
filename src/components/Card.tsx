import type { ReactNode } from "react";
type Props = { children: ReactNode; className?: string; title?: string; action?: ReactNode };
export default function Card({ children, className = "", title, action }: Props) {
  return <section className={`panel ${className}`}>
    {(title || action) && <div className="panel-heading">{title && <h2>{title}</h2>}{action}</div>}
    {children}
  </section>;
}