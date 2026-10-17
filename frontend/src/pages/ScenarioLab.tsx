import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { AlertTriangle, Ban, CheckCircle2, Info, RotateCcw } from "lucide-react";

/* ==========================================================================
   Scenario Lab (M1). Every figure shown here comes from POST /api/evaluate.
   No recovery maths lives in this file: it formats and lays out what the engine returns.

   INTEGRATION SEAMS (the only places that touch M2/M3 work):
   - `api` below calls fetch directly. When M3's src/api/client.ts exposes typed
     evaluate/lots functions, replace the two functions with those calls.
   - GET /api/lots is M2's endpoint and its response shape is not yet in docs/CONTRACTS.md.
     `fetchLots` accepts either `Lot[]` or `{ lots: Lot[] }`. Confirm with M2.
   - Local <Tag>, <Panel> and <Notice> stand in for M3's Chip/Card/EmptyState. Swap when available.
   ========================================================================== */

// ---- Contract types (docs/CONTRACTS.md) -----------------------------------
type RouteName = "resale" | "refurbish" | "scrap";

interface Lot {
  lot_id: string;
  quantity: number;
  category: string;
  condition: string;
  safety_hold: boolean;
  inspection_confidence: number | null;
}

interface RouteResult {
  route: RouteName;
  eligible: boolean;
  reason: string;
  gross_recovery: number | null;
  processing_cost: number | null;
  handling_cost: number | null;
  expected_net_recovery: number | null;
  scenario_low: number | null;
  scenario_high: number | null;
}

interface EvaluateResponse {
  lot_id: string | null;
  lot_problems: string[];
  results: RouteResult[];
  recommended_route: RouteName | null;
  incremental_value_vs_next_best: number | null;
  break_even_refurbish_vs_scrap_unit_price: number | null;
  label: string;
}

interface ApiProblem {
  message: string;
  hint?: string;
  ref?: string | null;
}

// ---- API seam -------------------------------------------------------------
async function readProblem(res: Response): Promise<ApiProblem> {
  try {
    const body = await res.json();
    if (body?.error?.message) return body.error as ApiProblem;
    if (Array.isArray(body?.detail)) {
      return { message: "The request was not accepted.", hint: "Check the lot values and try again." };
    }
  } catch {
    /* fall through */
  }
  return { message: `The server answered with status ${res.status}.`, hint: "Try again in a moment." };
}

const api = {
  async lots(signal: AbortSignal): Promise<Lot[]> {
    const res = await fetch("/api/lots", { signal });
    if (!res.ok) throw await readProblem(res);
    const body = await res.json();
    const list = Array.isArray(body) ? body : body?.lots;
    if (!Array.isArray(list)) {
      throw { message: "The lots response had an unexpected shape.", hint: "Confirm the GET /api/lots contract with M2." } as ApiProblem;
    }
    return list as Lot[];
  },
  async evaluate(
    lot: Lot,
    confidenceOverride: number | null,
    priceMultiplier: number,
    signal: AbortSignal,
  ): Promise<EvaluateResponse> {
    const res = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lot,
        confidence_override: confidenceOverride,
        price_multiplier: priceMultiplier,
      }),
      signal,
    });
    if (!res.ok) throw await readProblem(res);
    return (await res.json()) as EvaluateResponse;
  },
};

// ---- Formatting only ------------------------------------------------------
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const money = (v: number | null | undefined) => (v === null || v === undefined ? "Unknown" : inr.format(v));
const pct = (v: number | null) => (v === null ? "Unknown" : `${Math.round(v * 100)}%`);
const routeLabel = (r: string) => r.charAt(0).toUpperCase() + r.slice(1);
const asProblem = (e: unknown): ApiProblem =>
  e && typeof e === "object" && "message" in e
    ? (e as ApiProblem)
    : { message: "The server could not be reached.", hint: "Check that the API is running, then retry." };

// ---- Small presentational pieces -----------------------------------------
function Tag({ kind }: { kind: "Fact" | "Assumption" | "Scenario" }) {
  const tone =
    kind === "Scenario"
      ? "bg-[#5B6CF2]/10 text-[#3F4FD6]"
      : kind === "Assumption"
        ? "bg-[#F4B94B]/20 text-[#8A5A00]"
        : "bg-[#E4E7F7] text-[#1E2140]";
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 ${tone}`}>
      {kind}
    </span>
  );
}

function Panel({ children, className = "", label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section
      aria-label={label}
      className={`rounded-2xl border border-[#E4E7F7] bg-white shadow-[0_1px_2px_rgba(30,33,64,0.04)] ${className}`}
    >
      {children}
    </section>
  );
}

function Notice({
  tone,
  title,
  children,
  action,
  role,
}: {
  tone: "danger" | "warning" | "info";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  role?: "alert" | "status";
}) {
  const border = tone === "danger" ? "border-[#EF6B7B]/50" : tone === "warning" ? "border-[#F4B94B]/60" : "border-[#E4E7F7]";
  const Icon = tone === "info" ? Info : AlertTriangle;
  const iconTone = tone === "danger" ? "text-[#C8384B]" : tone === "warning" ? "text-[#A56A00]" : "text-[#5B6CF2]";
  return (
    <div role={role} className={`flex items-start gap-3 rounded-xl border bg-white p-4 ${border}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconTone}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-[#1E2140]">{title}</p>
        {children && <div className="mt-0.5 text-[#6B7194]">{children}</div>}
      </div>
      {action}
    </div>
  );
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B6CF2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F6F7FE]";

// ---- Manual lot entry (works even when GET /api/lots is unavailable) ------
interface Draft {
  lot_id: string;
  quantity: string;
  category: string;
  condition: string;
  safety_hold: boolean;
  confidence: string;
}
const emptyDraft: Draft = { lot_id: "", quantity: "", category: "", condition: "", safety_hold: false, confidence: "" };

function ManualLotForm({ onUse }: { onUse: (lot: Lot) => void }) {
  const [d, setD] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!d.lot_id.trim()) next.lot_id = "Enter a lot ID.";
    const qty = Number(d.quantity);
    if (!d.quantity.trim() || !Number.isInteger(qty) || qty <= 0) next.quantity = "Use a positive whole number of units.";
    if (!d.category.trim()) next.category = "Enter a category.";
    if (!d.condition.trim()) next.condition = "Enter a condition (use “unknown” if not inspected).";
    let conf: number | null = null;
    if (d.confidence.trim() !== "") {
      const c = Number(d.confidence);
      if (!Number.isFinite(c) || c < 0 || c > 100) next.confidence = "Use 0 to 100, or leave blank if inspection is incomplete.";
      else conf = c / 100;
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    onUse({
      lot_id: d.lot_id.trim(),
      quantity: qty,
      category: d.category.trim(),
      condition: d.condition.trim(),
      safety_hold: d.safety_hold,
      inspection_confidence: conf,
    });
  };

  const field = (id: keyof Draft, label: string, hint?: string, inputMode?: "numeric" | "decimal") => (
    <div>
      <label htmlFor={`lab-${id}`} className="block text-xs font-medium text-[#1E2140]">
        {label}
      </label>
      <input
        id={`lab-${id}`}
        value={d[id] as string}
        inputMode={inputMode}
        onChange={(e) => setD({ ...d, [id]: e.target.value })}
        aria-invalid={errors[id] ? true : undefined}
        aria-describedby={errors[id] ? `lab-${id}-err` : hint ? `lab-${id}-hint` : undefined}
        className={`mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-[#1E2140] transition-colors duration-150 motion-reduce:transition-none ${
          errors[id] ? "border-[#EF6B7B]" : "border-[#E4E7F7] hover:border-[#C9CEEB]"
        } ${focusRing}`}
      />
      {errors[id] ? (
        <p id={`lab-${id}-err`} className="mt-1 text-xs text-[#C8384B]">
          {errors[id]}
        </p>
      ) : hint ? (
        <p id={`lab-${id}-hint`} className="mt-1 text-xs text-[#6B7194]">
          {hint}
        </p>
      ) : null}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      {field("lot_id", "Lot ID")}
      {field("quantity", "Quantity (units)", undefined, "numeric")}
      {field("category", "Category")}
      {field("condition", "Condition", "For example good, fair, damaged, unknown.")}
      {field("confidence", "Inspection confidence (%)", "Leave blank if inspection is incomplete.", "decimal")}
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-[#1E2140]">
        <input
          type="checkbox"
          checked={d.safety_hold}
          onChange={(e) => setD({ ...d, safety_hold: e.target.checked })}
          className={`h-4 w-4 rounded border-[#C9CEEB] accent-[#5B6CF2] ${focusRing}`}
        />
        Safety hold on this lot
      </label>
      <div className="sm:col-span-2">
        <button
          type="submit"
          className={`rounded-lg bg-[#5B6CF2] px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#4A5BE0] motion-reduce:transition-none ${focusRing}`}
        >
          Evaluate this lot
        </button>
      </div>
    </form>
  );
}

// ---- Confidence slider: unknown confidence is shown as unknown, never as 100% ----
function ConfidenceControl({
  lotConfidence,
  value,
  disabled,
  onChange,
}: {
  lotConfidence: number | null;
  value: number | null; // percent the user chose, or null if untouched
  disabled: boolean;
  onChange: (pct: number) => void;
}) {
  const unknown = lotConfidence === null;
  const untouched = value === null;
  const shown = value ?? (unknown ? 50 : Math.round((lotConfidence as number) * 100));
  const readout = untouched && unknown ? "Not recorded" : `${shown}%`;
  const valueText = untouched && unknown ? "Not recorded. Move the slider to try a what-if value." : `${shown} percent`;
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between">
        <label htmlFor="lab-conf" className="text-sm font-medium">
          Inspection confidence
        </label>
        <span className="text-sm tabular-nums" data-testid="confidence-readout">
          {readout}{" "}
          {!untouched && <span className="text-xs text-[#5B6CF2]">{unknown ? "what-if" : "adjusted"}</span>}
        </span>
      </div>
      <input
        id="lab-conf"
        type="range"
        min={0}
        max={100}
        step={5}
        value={shown}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={valueText}
        aria-describedby="lab-conf-help"
        className={`mt-2 w-full accent-[#5B6CF2] ${untouched && unknown ? "opacity-50" : ""} ${focusRing}`}
      />
      <p id="lab-conf-help" className="mt-1 text-xs text-[#6B7194]">
        {unknown
          ? "Inspection is incomplete for this lot, so resale and refurbish stay blocked. Moving the slider is a what-if, not an inspection result."
          : "Treated by the engine as a simple haircut on expected value, not a calibrated probability."}
      </p>
    </div>
  );
}

// ---- Range chart: low / base / high on one shared axis --------------------
function RangeChart({ results }: { results: RouteResult[] }) {
  const rows = results.filter(
    (r) => r.eligible && r.scenario_low !== null && r.scenario_high !== null && r.expected_net_recovery !== null,
  );
  if (rows.length === 0) return null;

  const lows = rows.map((r) => r.scenario_low as number);
  const highs = rows.map((r) => r.scenario_high as number);
  const lo = Math.min(0, ...lows);
  const hi = Math.max(0, ...highs);
  const span = hi - lo || 1;
  const W = 640;
  const left = 96;
  const right = 24;
  const rowH = 44;
  const top = 12;
  const H = top + results.length * rowH + 30;
  const x = (v: number) => left + ((v - lo) / span) * (W - left - right);
  const ticks = [lo, lo + span / 3, lo + (2 * span) / 3, hi];

  const summary = results
    .map((r) =>
      r.eligible && r.scenario_low !== null
        ? `${routeLabel(r.route)} ${money(r.scenario_low)} to ${money(r.scenario_high)}, base ${money(r.expected_net_recovery)}`
        : `${routeLabel(r.route)} blocked`,
    )
    .join(". ");

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Scenario range of net recovery. ${summary}`}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={x(t)} x2={x(t)} y1={top} y2={H - 26} stroke="#E4E7F7" strokeWidth="1" />
            <text x={x(t)} y={H - 8} textAnchor="middle" fontSize="11" fill="#6B7194">
              {money(Math.round(t))}
            </text>
          </g>
        ))}
        {lo < 0 && <line x1={x(0)} x2={x(0)} y1={top} y2={H - 26} stroke="#6B7194" strokeWidth="1" />}
        {results.map((r, i) => {
          const cy = top + i * rowH + rowH / 2;
          const blocked = !(r.eligible && r.scenario_low !== null && r.scenario_high !== null && r.expected_net_recovery !== null);
          return (
            <g key={r.route}>
              <text x={0} y={cy + 4} fontSize="13" fontWeight="500" fill="#1E2140">
                {routeLabel(r.route)}
              </text>
              {blocked ? (
                <text x={left} y={cy + 4} fontSize="12" fill="#6B7194">
                  Blocked, no estimate
                </text>
              ) : (
                <>
                  <line
                    x1={x(r.scenario_low as number)}
                    x2={x(r.scenario_high as number)}
                    y1={cy}
                    y2={cy}
                    stroke="#5B6CF2"
                    strokeOpacity="0.35"
                    strokeWidth="10"
                    strokeLinecap="round"
                  />
                  <circle cx={x(r.expected_net_recovery as number)} cy={cy} r="5.5" fill="#5B6CF2" stroke="#fff" strokeWidth="2" />
                </>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6B7194]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 rounded-full bg-[#5B6CF2]/35" aria-hidden="true" /> Low to High
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#5B6CF2]" aria-hidden="true" /> Base
        </span>
        <span>Net recovery in INR. Scenario estimates, not guarantees.</span>
      </figcaption>
    </figure>
  );
}

// ---- One route's ledger ---------------------------------------------------
function RouteCard({ r, recommended }: { r: RouteResult; recommended: boolean }) {
  const name = routeLabel(r.route);
  const rows: [string, number | null, string][] = [
    ["Gross recovery", r.gross_recovery, ""],
    ["Processing cost", r.processing_cost, "minus"],
    ["Handling cost", r.handling_cost, "minus"],
  ];
  return (
    <article
      aria-label={`${name} route`}
      className={`flex flex-col rounded-2xl border bg-white p-5 transition-shadow duration-150 motion-reduce:transition-none ${
        recommended ? "border-[#5B6CF2] shadow-[0_0_0_1px_#5B6CF2]" : "border-[#E4E7F7]"
      } ${r.eligible ? "" : "bg-[#FBFBFE]"}`}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-[#1E2140]">{name}</h3>
        {r.eligible ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#14805F]">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Permitted
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#C8384B]">
            <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Blocked
          </span>
        )}
      </header>
      {recommended && (
        <p className="mt-1 inline-flex w-fit items-center rounded-md bg-[#5B6CF2] px-2 py-0.5 text-[11px] font-medium text-white">
          Recommended
        </p>
      )}
      <p className="mt-2 text-sm text-[#6B7194]">{r.reason}</p>

      {r.eligible ? (
        <dl className="mt-4 space-y-2 text-sm">
          {rows.map(([label, value, sign]) => (
            <div key={label} className="flex items-baseline justify-between">
              <dt className="text-[#6B7194]">
                {sign ? <span aria-hidden="true">− </span> : null}
                {label}
              </dt>
              <dd className="tabular-nums text-[#1E2140]">{money(value)}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between border-t border-[#E4E7F7] pt-2">
            <dt className="font-medium text-[#1E2140]">
              Expected net <Tag kind="Scenario" />
            </dt>
            <dd className="text-lg font-semibold tabular-nums text-[#1E2140]">{money(r.expected_net_recovery)}</dd>
          </div>
          <div className="flex items-baseline justify-between text-xs text-[#6B7194]">
            <dt>Low to High</dt>
            <dd className="tabular-nums">
              {money(r.scenario_low)} to {money(r.scenario_high)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 text-sm text-[#6B7194]">No figures are shown for a blocked route.</p>
      )}
    </article>
  );
}

// ---- Page -----------------------------------------------------------------
type LotsState = { status: "loading" } | { status: "ready"; lots: Lot[] } | { status: "error"; problem: ApiProblem };
type EvalState =
  | { status: "idle" }
  | { status: "loading"; previous?: EvaluateResponse }
  | { status: "ready"; data: EvaluateResponse }
  | { status: "error"; problem: ApiProblem };

export default function ScenarioLab() {
  const [lotsState, setLotsState] = useState<LotsState>({ status: "loading" });
  const [manual, setManual] = useState<Lot | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [confidencePct, setConfidencePct] = useState<number | null>(null); // null = use the lot's own value
  const [priceMult, setPriceMult] = useState(1);
  const [evalState, setEvalState] = useState<EvalState>({ status: "idle" });
  const [reloadKey, setReloadKey] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const lastData = useRef<EvaluateResponse | undefined>(undefined);

  useEffect(() => {
    document.title = "Scenario Lab · ReCoverIQ";
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    setLotsState({ status: "loading" });
    api
      .lots(ctl.signal)
      .then((lots) => setLotsState({ status: "ready", lots }))
      .catch((e) => {
        if (ctl.signal.aborted) return;
        setLotsState({ status: "error", problem: asProblem(e) });
      });
    return () => ctl.abort();
  }, [reloadKey]);

  const lot: Lot | null = useMemo(() => {
    if (selectedId === "__manual__") return manual;
    if (lotsState.status === "ready") return lotsState.lots.find((l) => l.lot_id === selectedId) ?? null;
    return null;
  }, [selectedId, manual, lotsState]);

  // Re-evaluate through the engine whenever the lot or a control changes (debounced for the sliders).
  useEffect(() => {
    if (!lot) {
      setEvalState({ status: "idle" });
      return;
    }
    const ctl = new AbortController();
    const timer = window.setTimeout(() => {
      setEvalState({ status: "loading", previous: lastData.current });
      api
        .evaluate(lot, confidencePct === null ? null : confidencePct / 100, priceMult, ctl.signal)
        .then((data) => {
          lastData.current = data;
          setEvalState({ status: "ready", data });
        })
        .catch((e) => {
          if (ctl.signal.aborted) return;
          setEvalState({ status: "error", problem: asProblem(e) });
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      ctl.abort();
    };
  }, [lot, confidencePct, priceMult, retryKey]);

  const chooseLot = useCallback((id: string) => {
    setSelectedId(id);
    setConfidencePct(null);
    setPriceMult(1);
    lastData.current = undefined;
  }, []);

  const data = evalState.status === "ready" ? evalState.data : evalState.status === "loading" ? evalState.previous : undefined;
  const refreshing = evalState.status === "loading";
  const lotConfidence = lot?.inspection_confidence ?? null;
  const adjusted = confidencePct !== null || priceMult !== 1;
  const best = data?.results.find((r) => r.route === data.recommended_route);

  return (
    <div className="min-h-full bg-[#F6F7FE] px-4 py-6 text-[#1E2140] sm:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Scenario Lab</h1>
            <p className="mt-1 max-w-2xl text-sm text-[#6B7194]">
              Change inspection confidence or resale price and see how each route&rsquo;s expected net recovery moves. Every
              figure is recalculated by the recovery engine.
            </p>
          </div>
          <span className="rounded-full border border-[#E4E7F7] bg-white px-3 py-1 text-xs font-medium text-[#6B7194]">
            Synthetic teaching data
          </span>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* Left: lot + controls */}
          <div className="space-y-6">
            <Panel className="p-5" label="Lot selection">
              <h2 className="text-sm font-semibold">Lot</h2>

              {lotsState.status === "loading" && (
                <div role="status" aria-live="polite" className="mt-3 space-y-2">
                  <div className="h-9 animate-pulse rounded-lg bg-[#E4E7F7] motion-reduce:animate-none" />
                  <span className="sr-only">Loading lots</span>
                </div>
              )}

              {lotsState.status === "error" && (
                <div className="mt-3">
                  <Notice
                    tone="warning"
                    title="The lot list is unavailable"
                    role="alert"
                    action={
                      <button
                        type="button"
                        onClick={() => setReloadKey((k) => k + 1)}
                        className={`rounded-md px-2 py-1 text-xs font-medium text-[#5B6CF2] hover:bg-[#5B6CF2]/10 ${focusRing}`}
                      >
                        Retry
                      </button>
                    }
                  >
                    {lotsState.problem.message} {lotsState.problem.hint}
                  </Notice>
                </div>
              )}

              {lotsState.status === "ready" && lotsState.lots.length === 0 && (
                <p className="mt-3 text-sm text-[#6B7194]">No lots are loaded yet. Import a file in Data Center, or enter one below.</p>
              )}

              {lotsState.status === "ready" && lotsState.lots.length > 0 && (
                <div className="mt-3">
                  <label htmlFor="lab-lot" className="block text-xs font-medium">
                    Select a lot
                  </label>
                  <select
                    id="lab-lot"
                    value={selectedId === "__manual__" ? "" : selectedId}
                    onChange={(e) => chooseLot(e.target.value)}
                    className={`mt-1 w-full rounded-lg border border-[#E4E7F7] bg-white px-3 py-2 text-sm hover:border-[#C9CEEB] ${focusRing}`}
                  >
                    <option value="" disabled>
                      Choose a lot…
                    </option>
                    {lotsState.lots.map((l) => (
                      <option key={l.lot_id} value={l.lot_id}>
                        {l.lot_id} · {l.category} · {l.quantity} units
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {lot && (
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-[#6B7194]">Category</dt>
                    <dd>{lot.category}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#6B7194]">Quantity</dt>
                    <dd className="tabular-nums">{lot.quantity} units</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#6B7194]">Condition</dt>
                    <dd>{lot.condition}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#6B7194]">Inspection confidence</dt>
                    <dd className="tabular-nums">{pct(lot.inspection_confidence)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-[#6B7194]">Safety hold</dt>
                    <dd className={lot.safety_hold ? "font-medium text-[#C8384B]" : ""}>
                      {lot.safety_hold ? "Yes. Resale and refurbish are blocked." : "No"}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <Tag kind="Fact" /> <span className="text-xs text-[#6B7194]">Synthetic lot attributes</span>
                  </div>
                </dl>
              )}

              <div className="mt-4 border-t border-[#E4E7F7] pt-3">
                <button
                  type="button"
                  aria-expanded={showManual}
                  aria-controls="lab-manual"
                  onClick={() => setShowManual((s) => !s)}
                  className={`rounded-md text-sm font-medium text-[#5B6CF2] hover:underline ${focusRing}`}
                >
                  {showManual ? "Hide manual entry" : "Enter a lot manually"}
                </button>
                {showManual && (
                  <div id="lab-manual" className="mt-3">
                    <ManualLotForm
                      onUse={(l) => {
                        setManual(l);
                        chooseLot("__manual__");
                      }}
                    />
                  </div>
                )}
              </div>
            </Panel>

            <Panel className="p-5" label="Scenario controls">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Scenario controls</h2>
                {adjusted && (
                  <button
                    type="button"
                    onClick={() => {
                      setConfidencePct(null);
                      setPriceMult(1);
                    }}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#5B6CF2] hover:bg-[#5B6CF2]/10 ${focusRing}`}
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" /> Reset
                  </button>
                )}
              </div>

              <ConfidenceControl
                lotConfidence={lotConfidence}
                value={confidencePct}
                disabled={!lot}
                onChange={setConfidencePct}
              />

              <div className="mt-5">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="lab-price" className="text-sm font-medium">
                    Resale price multiplier
                  </label>
                  <span className="text-sm tabular-nums">
                    {priceMult.toFixed(2)}×{" "}
                    {priceMult !== 1 && <span className="text-xs text-[#5B6CF2]">adjusted</span>}
                  </span>
                </div>
                <input
                  id="lab-price"
                  type="range"
                  min={0.5}
                  max={1.5}
                  step={0.05}
                  value={priceMult}
                  disabled={!lot}
                  onChange={(e) => setPriceMult(Number(e.target.value))}
                  aria-valuetext={`${priceMult.toFixed(2)} times the assumed price`}
                  aria-describedby="lab-price-help"
                  className={`mt-2 w-full accent-[#5B6CF2] ${focusRing}`}
                />
                <p id="lab-price-help" className="mt-1 text-xs text-[#6B7194]">
                  1.00× is the assumed price. Scenario only; it does not predict real prices.
                </p>
              </div>
            </Panel>
          </div>

          {/* Right: results */}
          <div className="min-w-0 space-y-6" aria-live="polite" aria-busy={refreshing}>
            {!lot && (
              <Panel className="p-8 text-center">
                <h2 className="text-base font-semibold">Pick a lot to begin</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-[#6B7194]">
                  Select a lot, or enter one manually. The comparison appears here and updates as you move the controls.
                </p>
              </Panel>
            )}

            {lot && evalState.status === "error" && (
              <Notice
                tone="danger"
                role="alert"
                title="This lot could not be evaluated"
                action={
                  <button
                    type="button"
                    onClick={() => setRetryKey((k) => k + 1)}
                    className={`rounded-md px-2 py-1 text-xs font-medium text-[#5B6CF2] hover:bg-[#5B6CF2]/10 ${focusRing}`}
                  >
                    Retry
                  </button>
                }
              >
                {evalState.problem.message} {evalState.problem.hint}
                {evalState.problem.ref ? ` Reference: ${evalState.problem.ref}.` : ""}
              </Notice>
            )}

            {lot && !data && evalState.status !== "error" && (
              <div role="status" className="grid gap-4 md:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-56 animate-pulse rounded-2xl bg-[#E4E7F7]/70 motion-reduce:animate-none" />
                ))}
                <span className="sr-only">Evaluating routes</span>
              </div>
            )}

            {lot && data && (
              <div className={`space-y-6 transition-opacity duration-150 motion-reduce:transition-none ${refreshing ? "opacity-60" : ""}`}>
                {data.lot_problems.length > 0 && (
                  <Notice tone="danger" title="This lot has data problems, so no route can be used">
                    {data.lot_problems.join(" ")}
                  </Notice>
                )}

                {/* Recommendation */}
                <Panel className="p-5 sm:p-6" label="Recommendation">
                  {best && best.expected_net_recovery !== null ? (
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-wide text-[#6B7194]">Best permitted route</p>
                        <h2 className="mt-1 text-xl font-semibold">
                          {routeLabel(best.route)}{" "}
                          <span className="font-normal text-[#6B7194]">
                            · expected net {money(best.expected_net_recovery)}
                          </span>
                        </h2>
                        <p className="mt-2 max-w-xl text-sm text-[#6B7194]">
                          {data.incremental_value_vs_next_best !== null
                            ? `${money(data.incremental_value_vs_next_best)} more than the next-best permitted route, at the current settings.`
                            : "It is the only permitted route for this lot."}{" "}
                          Blocked routes are never recommended, whatever their apparent profit.
                        </p>
                        {best.expected_net_recovery < 0 && (
                          <p className="mt-2 text-sm font-medium text-[#8A5A00]">
                            Every permitted route loses money here: handling and processing exceed recovery.
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Tag kind="Scenario" />
                        <span className="text-xs text-[#6B7194]">Not guaranteed</span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h2 className="text-xl font-semibold">No permitted route</h2>
                      <p className="mt-1 max-w-xl text-sm text-[#6B7194]">
                        Every route is blocked for this lot. The reasons are listed below; resolve them (for example finish the
                        inspection or clear the hold) before choosing a route.
                      </p>
                    </div>
                  )}
                </Panel>

                {/* Route comparison */}
                <div className="grid gap-4 md:grid-cols-3">
                  {data.results.map((r) => (
                    <RouteCard key={r.route} r={r} recommended={r.route === data.recommended_route} />
                  ))}
                </div>

                {/* Scenario range */}
                <Panel className="p-5 sm:p-6" label="Scenario range">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">Low, base and high net recovery</h2>
                    <Tag kind="Scenario" />
                  </div>
                  <p className="mt-1 text-xs text-[#6B7194]">
                    Low and high move price by −10% and +10% and confidence by −0.15 and +0.15, as defined in the engine.
                  </p>
                  <div className="mt-4">
                    {data.results.some((r) => r.eligible) ? (
                      <RangeChart results={data.results} />
                    ) : (
                      <p className="text-sm text-[#6B7194]">There is no range to show because no route is permitted.</p>
                    )}
                  </div>
                </Panel>

                {data.break_even_refurbish_vs_scrap_unit_price === null && lotConfidence === null && confidencePct === null && (
                  <Notice tone="info" title="Break-even needs an inspection confidence">
                    Complete the inspection, or move the confidence slider to a what-if value, to see where refurbish overtakes scrap.
                  </Notice>
                )}

                {/* Break-even (only when the API returns it) */}
                {data.break_even_refurbish_vs_scrap_unit_price !== null && (
                  <Panel className="p-5 sm:p-6" label="Break-even">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold">Refurbish versus scrap break-even</h2>
                      <Tag kind="Scenario" />
                    </div>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">
                      {money(data.break_even_refurbish_vs_scrap_unit_price)}
                      <span className="ml-1 text-sm font-normal text-[#6B7194]">per unit</span>
                    </p>
                    <p className="mt-1 max-w-xl text-sm text-[#6B7194]">
                      Refurbishing beats scrapping only if a refurbished unit sells for more than this, at the confidence now
                      selected. It is the price after refurbishment, so the resale multiplier does not move it. Whether refurbish
                      is permitted is shown separately above.
                    </p>
                  </Panel>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="mt-8 text-xs text-[#6B7194]">
          All lots, prices, rates and capacities are synthetic teaching data and assumptions. Nothing here is observed revenue,
          and these estimates are not guaranteed recovered amounts.
        </p>
      </div>
    </div>
  );
}
