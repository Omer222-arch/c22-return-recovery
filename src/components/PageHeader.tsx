import type { ReactNode } from "react";
type Props = { eyebrow?: string; title: string; description: string; actions?: ReactNode };
export default function PageHeader({ eyebrow, title, description, actions }: Props) {
  return <div className="page-header"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-header-actions">{actions}</div>}</div>;
}