import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: "primary" | "secondary" | "quiet"; loading?: boolean };
export default function Button({ children, variant = "primary", loading = false, disabled, ...props }: Props) {
  return <button className={`button button-${variant}`} disabled={disabled || loading} {...props}>
    {loading && <LoaderCircle size={16} className="spin" />}{children}
  </button>;
}