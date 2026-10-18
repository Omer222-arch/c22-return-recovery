import { useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, ChevronDown, ChevronUp, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { apiRequest, formatINR } from "../api/client";

type AdvisorRequest = {
  lot: Record<string, unknown>;
  assumptions?: Record<string, unknown>;
  confidence_override?: number | null;
  price_multiplier?: number;
};
type AdvisorResult = {
  provider: string;
  recommendation: string;
  summary: string;
  reasons: string[];
  tradeoffs: string[];
  risks: string[];
  missing_information: string[];
  disclaimer: string;
  calculation: {
    recommended_route?: string | null;
    results?: Array<{
      route: string;
      eligible: boolean;
      reason?: string;
      expected_net_recovery?: number | null;
      scenario_low?: number | null;
      scenario_high?: number | null;
    }>;
  };
};

export default function RecoveryAdvisor({ request, title = "AI Recovery Advisor" }: { request: AdvisorRequest | null; title?: string }) {
  const [result, setResult] = useState<AdvisorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDetails, setShowDetails] = useState(true);

  async function generate() {
    if (!request) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<AdvisorResult>("/api/ai/recovery-advice", {
        method: "POST",
        body: JSON.stringify(request),
      });
      setResult(data);
      setShowDetails(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate advice. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="recovery-advisor" aria-labelledby="recovery-advisor-title">
      <div className="recovery-advisor-head">
        <span className="recovery-advisor-icon"><BrainCircuit size={20} /></span>
        <div className="recovery-advisor-title-wrap">
          <span className="recovery-advisor-eyebrow"><Sparkles size={12} /> AI-ASSISTED DECISION SUPPORT</span>
          <h2 id="recovery-advisor-title">{title}</h2>
          <p>Plain-language guidance grounded in ReCoverIQ’s deterministic recovery engine.</p>
        </div>
        <span className="recovery-advisor-pill">Human review</span>
      </div>

      {!result && !error && <div className="recovery-advisor-intro">
        <div><strong>Understand the trade-offs, not just the numbers.</strong><p>Generate an explanation of route suitability, risks, and missing information using the current lot and scenario assumptions.</p></div>
        <button className="recovery-advisor-button" type="button" onClick={generate} disabled={!request || loading}>
          {loading ? <><LoaderCircle className="advisor-spin" size={16} /> Analysing scenario…</> : <><Sparkles size={16} /> Generate advice</>}
        </button>
      </div>}

      {loading && <div className="recovery-advisor-loading" role="status">Reviewing engine results and scenario constraints…</div>}
      {error && <div className="recovery-advisor-error" role="alert"><AlertTriangle size={17} /><div><strong>Advice isn’t available right now</strong><p>{error}</p><button type="button" onClick={generate}>Try again</button></div></div>}

      {result && <div className="recovery-advisor-result">
        <div className="recovery-advisor-recommendation"><span><CheckCircle2 size={16} /> ENGINE-ALIGNED GUIDANCE</span><strong>{result.recommendation}</strong><p>{result.summary}</p></div>
        <div className="recovery-advisor-number-grid">
          {(result.calculation.results ?? []).map((route) => <div className={`recovery-advisor-number ${!route.eligible ? "is-blocked" : ""}`} key={route.route}>
            <span>{route.route}{!route.eligible ? " · restricted" : ""}</span>
            <strong>{route.expected_net_recovery == null ? "Unknown" : formatINR(route.expected_net_recovery)}</strong>
            <small>{route.eligible ? (route.scenario_low != null && route.scenario_high != null ? `${formatINR(route.scenario_low)} – ${formatINR(route.scenario_high)}` : "Scenario range unavailable") : (route.reason || "Not eligible")}</small>
          </div>)}
        </div>
        <button className="recovery-advisor-details-toggle" type="button" onClick={() => setShowDetails(v => !v)}>{showDetails ? "Hide explanation" : "Show explanation"}{showDetails ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
        {showDetails && <div className="recovery-advisor-lists">
          <AdvisorList title="Why this route" items={result.reasons} />
          <AdvisorList title="Trade-offs to consider" items={result.tradeoffs} />
          {!!result.risks.length && <AdvisorList title="Risks to review" items={result.risks} />}
          {!!result.missing_information.length && <AdvisorList title="Information to confirm" items={result.missing_information} />}
        </div>}
        <div className="recovery-advisor-footer"><span>{result.disclaimer}</span><button type="button" onClick={generate} disabled={loading}><RefreshCw size={13} /> Regenerate</button></div>
      </div>}
      <div className="recovery-advisor-footnote">AI explains the calculated output; it does not change financial figures, eligibility rules, or final allocation decisions.</div>
    </section>
  );
}

function AdvisorList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return <div className="recovery-advisor-list"><h3>{title}</h3><ul>{items.map((item, i) => <li key={`${title}-${i}`}>{item}</li>)}</ul></div>;
}
