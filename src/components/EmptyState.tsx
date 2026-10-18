import { Inbox } from "lucide-react";
type Props = { title: string; description: string };
export default function EmptyState({ title, description }: Props) {
  return <div className="empty-state"><span className="empty-icon"><Inbox size={22} /></span><strong>{title}</strong><p>{description}</p></div>;
}