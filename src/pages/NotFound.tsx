import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
export default function NotFound() { return <div className="center-state"><div className="error-code">404</div><h1>Page not found</h1><p>The page may have moved or the link may be incorrect.</p><Link className="button button-primary" to="/"><ArrowLeft size={16} /> Back to overview</Link></div>; }