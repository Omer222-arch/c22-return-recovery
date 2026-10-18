import type { ReactNode } from "react";
type Props = { text: string; children: ReactNode };
export default function Tooltip({ text, children }: Props) {
  return <span className="tooltip-wrap" tabIndex={0} aria-label={text}>{children}<span role="tooltip" className="tooltip-content">{text}</span></span>;
}