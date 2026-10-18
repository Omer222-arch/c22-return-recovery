import { CheckCircle2, X } from "lucide-react";
type Props = { message: string; onClose: () => void };
export default function Toast({ message, onClose }: Props) {
  return <div className="toast" role="status"><CheckCircle2 size={18} /><span>{message}</span><button onClick={onClose} aria-label="Dismiss notification"><X size={16} /></button></div>;
}