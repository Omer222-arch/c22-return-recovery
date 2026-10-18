import { useSearchParams } from "react-router-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FormEvent, ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Info,
  RotateCcw,
  Sparkles,
  BookOpen,
  Scale,
  Layers,
  Target,
  Sliders,
  type LucideIcon,
} from "lucide-react";

/* ==========================================================================
   Scenario Lab (M1 page, polished by M3).

   Every figure shown here comes from POST /api/evaluate. No recovery maths
   lives in this file: it formats and lays out what the engine returns.

   State model:
   - URL query params (?lot=&price=&conf=) are the SOURCE OF TRUTH.
   - sessionStorage is a fallback so in-app navigation to Overview and back
     does NOT lose the selected lot / sliders.
   - Nothing is sent to the backend; a URL/session is a bookmark, not a
     proposal. Overview is untouched and still reads only GET /api/lots.

   INTEGRATION SEAMS (only places that touch M2/M3 work):
   - `api` below uses fetch directly. When M3's src/api/client.ts exposes
     typed evaluate/lots functions, replace the two functions with those calls.
   - GET /api/lots is M2's endpoint. `fetchLots` accepts either `Lot[]` or
     `{ lots: Lot[] }`. Confirm the final shape with M2 and lock it.
   - Local <Tag>, <Panel>, <Notice> stand in for M3's Chip/Card/EmptyState.
     Swap when M3's design-system components are ready.
   ========================================================================== */

/* ---------------- Contract types (docs/CONTRACTS.md) -------------------- */
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

/* ---------------- API seam ---------------------------------------------- */
async function readProblem(res: Response): Promise<ApiProblem> {
  try {
    const body = await res.json();
    if (body?.error?.message) return body.error as ApiProblem;
    if (Array.isArray(body?.detail)) {
      return {
        message: "The request was not accepted.",
        hint: "Check the lot values and try again.",
      };
    }
  } catch {
    /* fall through */
  }
  return {
    message: `The server answered with status ${res.status}.`,
    hint: "Try again in a moment.",
  };
}

const api = {
  async lots(signal: AbortSignal): Promise<Lot[]> {
    const res = await fetch("/api/lots", { signal });
    if (!res.ok) throw await readProblem(res);
    const body = await res.json();
    const list = Array.isArray(body) ? body : body?.lots;
    if (!Array.isArray(list)) {
      throw {
        message: "The lots response had an unexpected shape.",
        hint: "Confirm the GET /api/lots contract with M2.",
      } as ApiProblem;
    }
    // M2 persists business/data fields (units, inspection, costs); the engine UI
    // consumes a normalized scenario shape. Keep both contracts at this seam.
    return (list as Array<Record<string, unknown>>).map((raw) => ({
      lot_id: String(raw.lot_id ?? raw.id ?? ""),
      quantity: Number(raw.quantity ?? raw.units ?? 0),
      category: String(raw.category ?? "general"),
      condition: String(raw.condition ?? (raw.inspection === "approved" ? "good" : raw.inspection === "rejected" ? "damaged" : "unknown")),
      safety_hold: Boolean(raw.safety_hold ?? raw.inspection === "rejected"),
      inspection_confidence: typeof raw.inspection_confidence === "number" ? raw.inspection_confidence : raw.inspection === "approved" ? 1 : raw.inspection === "rejected" ? 0 : null,
    })) as Lot[];
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

/* ---------------- Formatting only --------------------------------------- */
const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const money = (v: number | null | undefined) =>
  v === null || v === undefined ? "Unknown" : inr.format(v);
const pct = (v: number | null) =>
  v === null ? "Unknown" : `${Math.round(v * 100)}%`;
const routeLabel = (r: string) => r.charAt(0).toUpperCase() + r.slice(1);
const asProblem = (e: unknown): ApiProblem =>
  e && typeof e === "object" && "message" in e
    ? (e as ApiProblem)
    : {
        message: "The server could not be reached.",
        hint: "Check that the API is running, then retry.",
      };

/** Read + clamp a numeric query param. Out-of-range or non-numeric → fallback. */
function readNumber(
  raw: string | null,
  min: number,
  max: number,
  fallback: number,
): number {
  if (raw === null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

const SESSION_KEY = "scenarioLab";

interface SavedScenario {
  lot: string | null;
  price: number | null;
  conf: number | null;
}

/* ---------------- Small presentational pieces --------------------------- */
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315D7C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F5F7F9]";

function Tag({ kind }: { kind: "Fact" | "Assumption" | "Scenario" }) {
  const tone =
    kind === "Scenario"
      ? "bg-[#315D7C]/10 text-[#244C6B]"
      : kind === "Assumption"
        ? "bg-[#F4B94B]/20 text-[#8A5A00]"
        : "bg-[#E3E9EE] text-[#20374C]";
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 ${tone}`}
    >
      {kind}
    </span>
  );
}

function Panel({
  children,
  className = "",
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className={`rounded-2xl border border-[#E3E9EE] bg-white shadow-[0_1px_2px_rgba(30,33,64,0.04)] ${className}`}
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
  const border =
    tone === "danger"
      ? "border-[#EF6B7B]/50"
      : tone === "warning"
        ? "border-[#F4B94B]/60"
        : "border-[#E3E9EE]";
  const Icon = tone === "info" ? Info : AlertTriangle;
  const iconTone =
    tone === "danger"
      ? "text-[#C8384B]"
      : tone === "warning"
        ? "text-[#A56A00]"
        : "text-[#315D7C]";
  return (
    <div
      role={role}
      className={`flex items-start gap-3 rounded-xl border bg-white p-4 ${border}`}
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${iconTone}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-[#20374C]">{title}</p>
        {children && <div className="mt-0.5 text-[#778494]">{children}</div>}
      </div>
      {action}
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "positive" | "warning" | "danger";
}) {
  const toneClass =
    tone === "positive"
      ? "text-[#14805F]"
      : tone === "warning"
        ? "text-[#A56A00]"
        : tone === "danger"
          ? "text-[#C8384B]"
          : "text-[#20374C]";
  return (
    <div className="rounded-xl border border-[#E3E9EE] bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[#778494]">
        {label}
      </p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-[#778494]">{hint}</p>}
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#315D7C]/10 text-[#315D7C]">
        <Icon className="h-4 w-4" aria-hidden={true} />
      </span>
      <div>
        <h2 className="text-sm font-semibold text-[#20374C]">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-[#778494]">{hint}</p>}
      </div>
    </div>
  );
}

/* ---------------- Shared input bits ------------------------------------- */
const inputClass = (invalid?: boolean) =>
  `mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-[#20374C] transition-colors duration-150 motion-reduce:transition-none ${
    invalid ? "border-[#EF6B7B]" : "border-[#E3E9EE] hover:border-[#C8D3DC]"
  } ${focusRing}`;

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-[#20374C]">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-xs text-[#C8384B]">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-[#778494]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function PresetPills({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  options: { value: number; label: string }[];
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label={label}
    >
      {options.map((o) => {
        const active = Math.abs(o.value - value) < 1e-9;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none ${
              active
                ? "border-[#315D7C] bg-[#315D7C] text-white"
                : "border-[#E3E9EE] bg-white text-[#20374C] hover:border-[#C8D3DC] hover:bg-[#F5F7F9]"
            } disabled:opacity-50 ${focusRing}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Manual lot entry -------------------------------------- */
const CATEGORY_OPTIONS = [
  "Electronics",
  "Apparel",
  "Home & Kitchen",
  "Footwear",
  "Toys",
  "Beauty",
  "Sports",
  "Other",
];
const CONDITION_OPTIONS = [
  "new",
  "like_new",
  "good",
  "fair",
  "damaged",
  "unknown",
];

interface Draft {
  lot_id: string;
  quantity: string;
  category: string;
  condition: string;
  safety_hold: boolean;
  confidence: string;
}
const emptyDraft: Draft = {
  lot_id: "",
  quantity: "",
  category: "",
  condition: "",
  safety_hold: false,
  confidence: "",
};

function ManualLotForm({ onUse }: { onUse: (lot: Lot) => void }) {
  const [d, setD] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!d.lot_id.trim()) next.lot_id = "Enter a lot ID.";
    const qty = Number(d.quantity);
    if (!d.quantity.trim() || !Number.isInteger(qty) || qty <= 0)
      next.quantity = "Use a positive whole number of units.";
    if (!d.category.trim()) next.category = "Pick a category.";
    if (!d.condition.trim()) next.condition = "Pick a condition.";
    let conf: number | null = null;
    if (d.confidence.trim() !== "") {
      const c = Number(d.confidence);
      if (!Number.isFinite(c) || c < 0 || c > 100)
        next.confidence =
          "Use 0 to 100, or leave blank if inspection is incomplete.";
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

  const invalid = (k: keyof Draft) => Boolean(errors[k]);

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field id="lab-lot_id" label="Lot ID" error={errors.lot_id}>
        <input
          id="lab-lot_id"
          value={d.lot_id}
          onChange={(e) => setD({ ...d, lot_id: e.target.value })}
          aria-invalid={invalid("lot_id") || undefined}
          aria-describedby={errors.lot_id ? "lab-lot_id-err" : undefined}
          className={inputClass(invalid("lot_id"))}
          placeholder="e.g. LOT-1042"
        />
      </Field>

      <Field
        id="lab-quantity"
        label="Quantity (units)"
        hint="Whole units in the lot."
        error={errors.quantity}
      >
        <input
          id="lab-quantity"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={d.quantity}
          onChange={(e) => setD({ ...d, quantity: e.target.value })}
          aria-invalid={invalid("quantity") || undefined}
          aria-describedby={
            errors.quantity ? "lab-quantity-err" : "lab-quantity-hint"
          }
          className={inputClass(invalid("quantity"))}
          placeholder="10"
        />
      </Field>

      <Field
        id="lab-category"
        label="Category"
        hint="Free text with suggestions from the teaching defaults."
        error={errors.category}
      >
        <input
          id="lab-category"
          list="lab-category-options"
          value={d.category}
          onChange={(e) => setD({ ...d, category: e.target.value })}
          aria-invalid={invalid("category") || undefined}
          aria-describedby={
            errors.category ? "lab-category-err" : "lab-category-hint"
          }
          className={inputClass(invalid("category"))}
          placeholder="Electronics"
        />
        <datalist id="lab-category-options">
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>

      <Field
        id="lab-condition"
        label="Condition"
        hint="Use “unknown” when the lot was not inspected."
        error={errors.condition}
      >
        <input
          id="lab-condition"
          list="lab-condition-options"
          value={d.condition}
          onChange={(e) => setD({ ...d, condition: e.target.value })}
          aria-invalid={invalid("condition") || undefined}
          aria-describedby={
            errors.condition ? "lab-condition-err" : "lab-condition-hint"
          }
          className={inputClass(invalid("condition"))}
          placeholder="good"
        />
        <datalist id="lab-condition-options">
          {CONDITION_OPTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>

      <Field
        id="lab-confidence"
        label="Inspection confidence (%)"
        hint="Leave blank if inspection is incomplete."
        error={errors.confidence}
      >
        <div className="relative">
          <input
            id="lab-confidence"
            type="number"
            min={0}
            max={100}
            step={1}
            inputMode="decimal"
            value={d.confidence}
            onChange={(e) => setD({ ...d, confidence: e.target.value })}
            aria-invalid={invalid("confidence") || undefined}
            aria-describedby={
              errors.confidence ? "lab-confidence-err" : "lab-confidence-hint"
            }
            className={`${inputClass(invalid("confidence"))} pr-8`}
            placeholder="e.g. 80"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#778494]"
          >
            %
          </span>
        </div>
      </Field>

      <label className="flex items-center gap-2 self-end pb-2 text-sm text-[#20374C]">
        <input
          type="checkbox"
          checked={d.safety_hold}
          onChange={(e) => setD({ ...d, safety_hold: e.target.checked })}
          className={`h-4 w-4 rounded border-[#C8D3DC] accent-[#315D7C] ${focusRing}`}
        />
        Safety hold on this lot
      </label>

      <div className="sm:col-span-2">
        <button
          type="submit"
          className={`inline-flex items-center gap-2 rounded-lg bg-[#315D7C] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-[#244C6B] hover:shadow-md active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${focusRing}`}
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Use this lot in the lab
        </button>
      </div>
    </form>
  );
}

/* ---------------- Confidence slider (lab) ------------------------------- */
function ConfidenceControl({
  lotConfidence,
  value,
  disabled,
  onChange,
}: {
  lotConfidence: number | null;
  value: number | null;
  disabled: boolean;
  onChange: (pct: number | null) => void;
}) {
  const unknown = lotConfidence === null;
  const untouched = value === null;
  const shown =
    value ?? (unknown ? 50 : Math.round((lotConfidence as number) * 100));
  const readout = untouched && unknown ? "Not recorded" : `${shown}%`;
  const valueText =
    untouched && unknown
      ? "Not recorded. Move the slider to try a what-if value."
      : `${shown} percent`;

  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between">
        <label htmlFor="lab-conf" className="text-sm font-medium">
          Inspection confidence
        </label>
        <span className="text-sm tabular-nums" data-testid="confidence-readout">
          {readout}{" "}
          {!untouched && (
            <span className="text-xs text-[#315D7C]">
              {unknown ? "what-if" : "adjusted"}
            </span>
          )}
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
        className={`mt-2 w-full accent-[#315D7C] ${
          untouched && unknown ? "opacity-50" : ""
        } ${focusRing}`}
      />
      <PresetPills
        label="Confidence presets"
        value={shown}
        disabled={disabled}
        onChange={(v) => onChange(v)}
        options={[
          { value: 60, label: "Conservative · 60%" },
          { value: 80, label: "Balanced · 80%" },
          { value: 100, label: "Complete · 100%" },
        ]}
      />
      <p id="lab-conf-help" className="mt-2 text-xs text-[#778494]">
        {unknown
          ? "Inspection is incomplete for this lot, so resale and refurbish stay blocked. Moving the slider is a what-if, not an inspection result."
          : "Treated by the engine as a simple haircut on expected value, not a calibrated probability."}
      </p>
    </div>
  );
}

/* ---------------- Price slider ----------------------------------------- */
function PriceControl({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between">
        <label htmlFor="lab-price" className="text-sm font-medium">
          Resale price multiplier
        </label>
        <span className="text-sm tabular-nums">
          {value.toFixed(2)}×{" "}
          {value !== 1 && (
            <span className="text-xs text-[#315D7C]">adjusted</span>
          )}
        </span>
      </div>
      <input
        id="lab-price"
        type="range"
        min={0.5}
        max={1.5}
        step={0.05}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={`${value.toFixed(2)} times the assumed price`}
        aria-describedby="lab-price-help"
        className={`mt-2 w-full accent-[#315D7C] ${focusRing}`}
      />
      <PresetPills
        label="Price presets"
        value={value}
        disabled={disabled}
        onChange={onChange}
        options={[
          { value: 0.9, label: "−10%" },
          { value: 1.0, label: "Base" },
          { value: 1.1, label: "+10%" },
        ]}
      />
      <p id="lab-price-help" className="mt-2 text-xs text-[#778494]">
        1.00× is the assumed price. Scenario only; it does not predict real
        prices.
      </p>
    </div>
  );
}

/* ---------------- Route card ------------------------------------------- */
function RouteCard({
  r,
  recommended,
  maxAbsNet,
}: {
  r: RouteResult;
  recommended: boolean;
  maxAbsNet: number;
}) {
  const name = routeLabel(r.route);
  const rows: [string, number | null, string][] = [
    ["Gross recovery", r.gross_recovery, ""],
    ["Processing cost", r.processing_cost, "minus"],
    ["Handling cost", r.handling_cost, "minus"],
  ];
  const net = r.expected_net_recovery;
  const netPositive = (net ?? 0) > 0;
  const ratio =
    r.eligible && net !== null
      ? Math.min(1, Math.abs(net) / (maxAbsNet || 1))
      : 0;

  return (
    <article
      aria-label={`${name} route`}
      className={`flex flex-col rounded-2xl border bg-white p-5 transition-shadow duration-150 motion-reduce:transition-none ${
        recommended
          ? "border-[#315D7C] shadow-[0_0_0_1px_#315D7C]"
          : "border-[#E3E9EE]"
      } ${r.eligible ? "" : "bg-[#FBFBFE]"}`}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-[#20374C]">{name}</h3>
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
        <p className="mt-1 inline-flex w-fit items-center rounded-md bg-[#315D7C] px-2 py-0.5 text-[11px] font-medium text-white">
          Recommended
        </p>
      )}
      <p className="mt-2 text-sm text-[#778494]">{r.reason}</p>

      {r.eligible ? (
        <>
          <dl className="mt-4 space-y-2 text-sm">
            {rows.map(([label, value, sign]) => (
              <div key={label} className="flex items-baseline justify-between">
                <dt className="text-[#778494]">
                  {sign ? <span aria-hidden="true">− </span> : null}
                  {label}
                </dt>
                <dd className="tabular-nums text-[#20374C]">{money(value)}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between border-t border-[#E3E9EE] pt-2">
              <dt className="flex items-center gap-1.5 font-medium text-[#20374C]">
                Expected net <Tag kind="Scenario" />
              </dt>
              <dd
                className={`text-lg font-semibold tabular-nums ${
                  netPositive ? "text-[#20374C]" : "text-[#C8384B]"
                }`}
              >
                {money(net)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between text-xs text-[#778494]">
              <dt>Low to High</dt>
              <dd className="tabular-nums">
                {money(r.scenario_low)} to {money(r.scenario_high)}
              </dd>
            </div>
          </dl>

          <div
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#E3E9EE]"
            aria-hidden="true"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${
                netPositive ? "bg-[#315D7C]" : "bg-[#EF6B7B]"
              }`}
              style={{ width: `${Math.round(ratio * 100)}%` }}
            />
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-[#778494]">
          No figures are shown for a blocked route.
        </p>
      )}
    </article>
  );
}

/* ---------------- Comparison table ------------------------------------- */
function ComparisonTable({ results }: { results: RouteResult[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">
          Route-by-route comparison of gross, costs, expected net and scenario
          range
        </caption>
        <thead>
          <tr className="border-b border-[#E3E9EE] text-left text-xs uppercase tracking-wide text-[#778494]">
            <th scope="col" className="py-2 pr-3 font-medium">
              Route
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Status
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Gross
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Processing
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Handling
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Net (base)
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Low – High
            </th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr
              key={r.route}
              className="border-b border-[#E3E9EE]/70 last:border-0"
            >
              <td className="py-2.5 pr-3 font-medium text-[#20374C]">
                {routeLabel(r.route)}
              </td>
              <td className="py-2.5 pr-3">
                {r.eligible ? (
                  <span className="text-[#14805F]">Permitted</span>
                ) : (
                  <span className="text-[#C8384B]">Blocked</span>
                )}
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-[#20374C]">
                {money(r.gross_recovery)}
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-[#20374C]">
                {money(r.processing_cost)}
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-[#20374C]">
                {money(r.handling_cost)}
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums font-semibold text-[#20374C]">
                {money(r.expected_net_recovery)}
              </td>
              <td className="py-2.5 text-right tabular-nums text-[#778494]">
                {r.eligible
                  ? `${money(r.scenario_low)} – ${money(r.scenario_high)}`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Range chart ------------------------------------------ */
function RangeChart({ results }: { results: RouteResult[] }) {
  const rows = results.filter(
    (r) =>
      r.eligible &&
      r.scenario_low !== null &&
      r.scenario_high !== null &&
      r.expected_net_recovery !== null,
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
        ? `${routeLabel(r.route)} ${money(r.scenario_low)} to ${money(
            r.scenario_high,
          )}, base ${money(r.expected_net_recovery)}`
        : `${routeLabel(r.route)} blocked`,
    )
    .join(". ");

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Scenario range of net recovery. ${summary}`}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={x(t)}
              x2={x(t)}
              y1={top}
              y2={H - 26}
              stroke="#E3E9EE"
              strokeWidth="1"
            />
            <text
              x={x(t)}
              y={H - 8}
              textAnchor="middle"
              fontSize="11"
              fill="#778494"
            >
              {money(Math.round(t))}
            </text>
          </g>
        ))}
        {lo < 0 && (
          <line
            x1={x(0)}
            x2={x(0)}
            y1={top}
            y2={H - 26}
            stroke="#778494"
            strokeWidth="1"
          />
        )}
        {results.map((r, i) => {
          const cy = top + i * rowH + rowH / 2;
          const blocked = !(
            r.eligible &&
            r.scenario_low !== null &&
            r.scenario_high !== null &&
            r.expected_net_recovery !== null
          );
          return (
            <g key={r.route}>
              <text
                x={0}
                y={cy + 4}
                fontSize="13"
                fontWeight="500"
                fill="#20374C"
              >
                {routeLabel(r.route)}
              </text>
              {blocked ? (
                <text x={left} y={cy + 4} fontSize="12" fill="#778494">
                  Blocked, no estimate
                </text>
              ) : (
                <>
                  <line
                    x1={x(r.scenario_low as number)}
                    x2={x(r.scenario_high as number)}
                    y1={cy}
                    y2={cy}
                    stroke="#315D7C"
                    strokeOpacity="0.35"
                    strokeWidth="10"
                    strokeLinecap="round"
                  />
                  <circle
                    cx={x(r.expected_net_recovery as number)}
                    cy={cy}
                    r="5.5"
                    fill="#315D7C"
                    stroke="#fff"
                    strokeWidth="2"
                  />
                </>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#778494]">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-5 rounded-full bg-[#315D7C]/35"
            aria-hidden="true"
          />
          Low to High
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full bg-[#315D7C]"
            aria-hidden="true"
          />
          Base
        </span>
        <span>Net recovery in INR. Scenario estimates, not guarantees.</span>
      </figcaption>
    </figure>
  );
}

/* ---------------- Education section ----------------------------------- */
/* ---------------- Education section (compact) ------------------------- */
function EducationSection() {
  const formulas: { label: string; formula: string }[] = [
    {
      label: "Gross recovery",
      formula: "units × price × confidence  (refurbish also × repair success)",
    },
    {
      label: "Expected net recovery",
      formula: "gross − processing − handling",
    },
    {
      label: "Scenario low / high",
      formula: "price ∓10%, confidence ∓0.15 (clipped to [0, 1])",
    },
    {
      label: "Break-even: refurbish vs scrap (per unit)",
      formula: "(scrap price + refurb cost + handling) ÷ (success × confidence)",
    },
  ];

  return (
    <section
      aria-labelledby="about-scenario-lab"
      className="mt-10 rounded-2xl border border-[#E3E9EE] bg-white p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#315D7C]/10 text-[#315D7C]">
          <BookOpen className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2
            id="about-scenario-lab"
            className="text-sm font-semibold text-[#20374C]"
          >
            About the Scenario Lab
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-[#778494]">
            A what-if view of the recovery engine: change confidence or price
            and see how each permitted route&rsquo;s expected net moves. Every
            figure is a <Tag kind="Scenario" />, never a guarantee — reference
            case: resale <strong className="text-[#20374C]">₹950</strong>,
            refurbish <strong className="text-[#20374C]">₹750</strong>, scrap{" "}
            <strong className="text-[#20374C]">₹100</strong> for 10 units at
            ₹100 / ₹20 / ₹5 with 100% success and 100% confidence.
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-[#E3E9EE]">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-[#E3E9EE] bg-[#F5F7F9] text-left text-xs uppercase tracking-wide text-[#778494]">
              <th scope="col" className="px-3 py-2 font-medium">
                Quantity
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Formula
              </th>
            </tr>
          </thead>
          <tbody>
            {formulas.map((f, i) => (
              <tr
                key={f.label}
                className={i % 2 === 0 ? "bg-white" : "bg-[#FBFBFE]"}
              >
                <td className="px-3 py-2 font-medium text-[#20374C]">
                  {f.label}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-[#244C6B]">
                  {f.formula}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-[#778494]">
        Synthetic teaching data. Inspection confidence is a simplifying haircut,
        not a calibrated probability — see docs/ENGINE.md.
      </p>
    </section>
  );
}

/* ---------------- Page ------------------------------------------------- */
type LotsState =
  | { status: "loading" }
  | { status: "ready"; lots: Lot[] }
  | { status: "error"; problem: ApiProblem };

type EvalState =
  | { status: "idle" }
  | { status: "loading"; previous?: EvaluateResponse }
  | { status: "ready"; data: EvaluateResponse }
  | { status: "error"; problem: ApiProblem };

export default function ScenarioLab() {
  const reduceMotion = useReducedMotion();

  /* -- Local (non-URL) state -------------------------------------------- */
  const [lotsState, setLotsState] = useState<LotsState>({ status: "loading" });
  const [manual, setManual] = useState<Lot | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [evalState, setEvalState] = useState<EvalState>({ status: "idle" });
  const [reloadKey, setReloadKey] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const lastData = useRef<EvaluateResponse | undefined>(undefined);

  /* -- URL as the source of truth for the scenario state ---------------- */
  const [searchParams, setSearchParams] = useSearchParams();

  const urlLotId = searchParams.get("lot") ?? "";
  // A manual lot cannot be re-derived from the URL, so we keep it in local
  // state and treat it as "__manual__" whenever it exists.
  const selectedId = manual ? "__manual__" : urlLotId;

  const priceMult = useMemo(
    () => readNumber(searchParams.get("price"), 0.5, 1.5, 1),
    [searchParams],
  );

  const confidencePct = useMemo<number | null>(() => {
    const raw = searchParams.get("conf");
    if (raw === null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  }, [searchParams]);

  /** Write several query params at once, never spamming browser history. */
  const updateParams = useCallback(
    (patch: Record<string, string | number | null>) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === "") p.delete(k);
            else p.set(k, String(v));
          }
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  /* -- sessionStorage fallback: survive in-app navigation --------------- */
  const restoredRef = useRef(false);

  useLayoutEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    // If the URL already carries state (hard load, bookmark, back button),
    // leave it alone — URL wins.
    const hasUrlState =
      searchParams.has("lot") ||
      searchParams.has("price") ||
      searchParams.has("conf");
    if (hasUrlState) return;

    // Otherwise, try to hydrate from the last scenario in this tab.
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as SavedScenario;
      if (
        saved &&
        (saved.lot !== null ||
          saved.price !== null ||
          saved.conf !== null)
      ) {
        updateParams({
          lot: saved.lot ?? null,
          price: saved.price ?? null,
          conf: saved.conf ?? null,
        });
      }
    } catch {
      /* malformed data → ignore, start clean */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only on purpose

  // Persist the current scenario on every URL change.
  const skipFirstSaveRef = useRef(true);
  useEffect(() => {
    const hasUrlState =
      searchParams.has("lot") ||
      searchParams.has("price") ||
      searchParams.has("conf");

    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false;
      // On the very first pass, don't overwrite an existing session with
      // an empty URL. Otherwise a fresh navigation from the sidebar would
      // wipe the saved scenario before the restore effect could hydrate it.
      if (!hasUrlState) return;
    }

    try {
      const snapshot: SavedScenario = {
        lot: searchParams.get("lot"),
        price: searchParams.has("price")
          ? Number(searchParams.get("price"))
          : null,
        conf: searchParams.has("conf")
          ? Number(searchParams.get("conf"))
          : null,
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
    } catch {
      /* quota / privacy mode → ignore */
    }
  }, [searchParams]);

  /* -- Page title ------------------------------------------------------- */
  useEffect(() => {
    document.title = "Scenario Lab · ReCoverIQ";
  }, []);

  /* -- Load lots -------------------------------------------------------- */
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

  /* -- Resolve the selected lot ---------------------------------------- */
  const lot: Lot | null = useMemo(() => {
    if (selectedId === "__manual__") return manual;
    if (lotsState.status === "ready")
      return lotsState.lots.find((l) => l.lot_id === selectedId) ?? null;
    return null;
  }, [selectedId, manual, lotsState]);

  /**
   * A URL points at a lot ID that isn't in the loaded data.
   * Show a friendly notice instead of the generic empty state.
   */
  const lotNotFound =
    lotsState.status === "ready" &&
    urlLotId !== "" &&
    !manual &&
    !lotsState.lots.some((l) => l.lot_id === urlLotId);

  /* -- Evaluate the lot whenever it or a control changes --------------- */
  useEffect(() => {
    if (!lot) {
      setEvalState({ status: "idle" });
      return;
    }
    const ctl = new AbortController();
    const timer = window.setTimeout(() => {
      setEvalState({ status: "loading", previous: lastData.current });
      api
        .evaluate(
          lot,
          confidencePct === null ? null : confidencePct / 100,
          priceMult,
          ctl.signal,
        )
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

  /* -- Actions ---------------------------------------------------------- */
  const chooseLot = useCallback(
    (id: string) => {
      if (id !== "__manual__") setManual(null);
      updateParams({
        lot: id === "__manual__" ? null : id,
        conf: null,
        price: null,
      });
      lastData.current = undefined;
    },
    [updateParams],
  );

  /* -- Derived view state ---------------------------------------------- */
  const data =
    evalState.status === "ready"
      ? evalState.data
      : evalState.status === "loading"
        ? evalState.previous
        : undefined;
  const refreshing = evalState.status === "loading";
  const lotConfidence = lot?.inspection_confidence ?? null;
  const adjusted = confidencePct !== null || priceMult !== 1;
  const best = data?.results.find((r) => r.route === data.recommended_route);

  const maxAbsNet = useMemo(() => {
    if (!data) return 1;
    const nets = data.results
      .filter((r) => r.eligible && r.expected_net_recovery !== null)
      .map((r) => Math.abs(r.expected_net_recovery as number));
    return Math.max(1, ...nets);
  }, [data]);

  /* -- Motion variants -------------------------------------------------- */
  const fadeRise = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 10 },
    show: { opacity: 1, y: 0 },
  };
  const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: reduceMotion ? 0 : 0.05 } },
  };

  return (
    <div className="min-h-full bg-[#F5F7F9] px-4 py-6 text-[#20374C] sm:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <motion.header
          initial="hidden"
          animate="show"
          variants={fadeRise}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex flex-wrap items-end justify-between gap-3"
        >
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Scenario Lab
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-[#778494]">
              A what-if view of the recovery engine: adjust inspection
              confidence or resale price and see how each route&rsquo;s
              expected net recovery moves. Every figure is recomputed by POST
              /api/evaluate.
            </p>
          </div>
          <span className="rounded-full border border-[#E3E9EE] bg-white px-3 py-1 text-xs font-medium text-[#778494]">
            Synthetic teaching data
          </span>
        </motion.header>

        {/* KPI overview strip */}
        {lot && data && (
          <motion.div
            initial="hidden"
            animate="show"
            variants={stagger}
            className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <motion.div variants={fadeRise}>
              <StatTile
                label="Best permitted route"
                value={best ? routeLabel(best.route) : "No route permitted"}
                hint={best ? "Cannot be a blocked route" : "See reasons below"}
                tone={best ? "positive" : "danger"}
              />
            </motion.div>
            <motion.div variants={fadeRise}>
              <StatTile
                label="Expected net (base)"
                value={
                  best && best.expected_net_recovery !== null
                    ? money(best.expected_net_recovery)
                    : "—"
                }
                hint="Scenario, not guaranteed"
                tone={
                  best && (best.expected_net_recovery ?? 0) < 0
                    ? "danger"
                    : "neutral"
                }
              />
            </motion.div>
            <motion.div variants={fadeRise}>
              <StatTile
                label="Scenario range"
                value={
                  best &&
                  best.scenario_low !== null &&
                  best.scenario_high !== null
                    ? `${money(best.scenario_low)} – ${money(
                        best.scenario_high,
                      )}`
                    : "—"
                }
                hint="Low to high"
              />
            </motion.div>
            <motion.div variants={fadeRise}>
              <StatTile
                label="Incremental vs next-best"
                value={
                  data.incremental_value_vs_next_best !== null
                    ? money(data.incremental_value_vs_next_best)
                    : "Only permitted route"
                }
                hint="At current settings"
              />
            </motion.div>
          </motion.div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* Left: lot + controls */}
          <div className="space-y-6">
            <Panel className="p-5" label="Lot selection">
              <SectionHeading
                icon={Sparkles}
                title="Lot"
                hint="Pick a synthetic lot or type one in."
              />

              {lotsState.status === "loading" && (
                <div
                  role="status"
                  aria-live="polite"
                  className="mt-3 space-y-2"
                >
                  <div className="h-9 animate-pulse rounded-lg bg-[#E3E9EE] motion-reduce:animate-none" />
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
                        className={`rounded-md px-2 py-1 text-xs font-medium text-[#315D7C] hover:bg-[#315D7C]/10 ${focusRing}`}
                      >
                        Retry
                      </button>
                    }
                  >
                    {lotsState.problem.message} {lotsState.problem.hint}
                  </Notice>
                </div>
              )}

              {lotNotFound && (
                <div className="mt-3">
                  <Notice
                    tone="warning"
                    title={`Lot "${urlLotId}" is not in the loaded data`}
                    action={
                      <button
                        type="button"
                        onClick={() => updateParams({ lot: null })}
                        className={`rounded-md px-2 py-1 text-xs font-medium text-[#315D7C] hover:bg-[#315D7C]/10 ${focusRing}`}
                      >
                        Clear
                      </button>
                    }
                  >
                    Pick a lot from the list below, or import one in Data
                    Center.
                  </Notice>
                </div>
              )}

              {lotsState.status === "ready" && lotsState.lots.length === 0 && (
                <p className="mt-3 text-sm text-[#778494]">
                  No lots are loaded yet. Import a file in Data Center, or enter
                  one below.
                </p>
              )}

              {lotsState.status === "ready" && lotsState.lots.length > 0 && (
                <div className="mt-3">
                  <label
                    htmlFor="lab-lot"
                    className="block text-xs font-medium"
                  >
                    Select a lot
                  </label>
                  <select
                    id="lab-lot"
                    value={selectedId === "__manual__" ? "" : selectedId}
                    onChange={(e) => chooseLot(e.target.value)}
                    className={`mt-1 w-full rounded-lg border border-[#E3E9EE] bg-white px-3 py-2 text-sm hover:border-[#C8D3DC] ${focusRing}`}
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
                    <dt className="text-xs text-[#778494]">Category</dt>
                    <dd>{lot.category}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#778494]">Quantity</dt>
                    <dd className="tabular-nums">{lot.quantity} units</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#778494]">Condition</dt>
                    <dd>{lot.condition}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#778494]">
                      Inspection confidence
                    </dt>
                    <dd className="tabular-nums">
                      {pct(lot.inspection_confidence)}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-[#778494]">Safety hold</dt>
                    <dd
                      className={
                        lot.safety_hold ? "font-medium text-[#C8384B]" : ""
                      }
                    >
                      {lot.safety_hold
                        ? "Yes. Resale and refurbish are blocked."
                        : "No"}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <Tag kind="Fact" />{" "}
                    <span className="text-xs text-[#778494]">
                      Synthetic lot attributes
                    </span>
                  </div>
                </dl>
              )}

              {manual && selectedId === "__manual__" && (
                <p className="mt-2 text-xs text-[#778494]">
                  Manual lots are not saved in the URL. Refresh will clear them.
                </p>
              )}

              <div className="mt-4 border-t border-[#E3E9EE] pt-3">
                <button
                  type="button"
                  aria-expanded={showManual}
                  aria-controls="lab-manual"
                  onClick={() => setShowManual((s) => !s)}
                  className={`rounded-md text-sm font-medium text-[#315D7C] hover:underline ${focusRing}`}
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
                <SectionHeading
                  icon={Sliders}
                  title="Scenario controls"
                  hint="Try a what-if. Nothing is saved."
                />
                {adjusted && (
                  <button
                    type="button"
                    onClick={() => updateParams({ conf: null, price: null })}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#315D7C] hover:bg-[#315D7C]/10 ${focusRing}`}
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" /> Reset
                  </button>
                )}
              </div>

              <ConfidenceControl
                lotConfidence={lotConfidence}
                value={confidencePct}
                disabled={!lot}
                onChange={(value) => updateParams({ conf: value })}
              />

              <PriceControl
                value={priceMult}
                disabled={!lot}
                onChange={(value) => updateParams({ price: value })}
              />
            </Panel>
          </div>

          {/* Right: results */}
          <div
            className="min-w-0 space-y-6"
            aria-live="polite"
            aria-busy={refreshing}
          >
            {!lot && !lotNotFound && (
              <Panel className="p-8 text-center">
                <h2 className="text-base font-semibold">
                  Pick a lot to begin
                </h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-[#778494]">
                  Select a lot, or enter one manually. The comparison appears
                  here and updates as you move the controls.
                </p>
              </Panel>
            )}

            {!lot && lotNotFound && (
              <Panel className="p-8 text-center">
                <h2 className="text-base font-semibold">Lot not found</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-[#778494]">
                  The lot ID in the URL isn&rsquo;t in the loaded data. Pick a
                  lot from the list on the left, or clear the URL.
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
                    className={`rounded-md px-2 py-1 text-xs font-medium text-[#315D7C] hover:bg-[#315D7C]/10 ${focusRing}`}
                  >
                    Retry
                  </button>
                }
              >
                {evalState.problem.message} {evalState.problem.hint}
                {evalState.problem.ref
                  ? ` Reference: ${evalState.problem.ref}.`
                  : ""}
              </Notice>
            )}

            {lot && !data && evalState.status !== "error" && (
              <div role="status" className="grid gap-4 md:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-56 animate-pulse rounded-2xl bg-[#E3E9EE]/70 motion-reduce:animate-none"
                  />
                ))}
                <span className="sr-only">Evaluating routes</span>
              </div>
            )}

            {lot && data && (
              <motion.div
                key={data.lot_id ?? "manual"}
                initial="hidden"
                animate="show"
                variants={stagger}
                className={`space-y-6 transition-opacity duration-150 motion-reduce:transition-none ${
                  refreshing ? "opacity-60" : ""
                }`}
              >
                {data.lot_problems.length > 0 && (
                  <Notice
                    tone="danger"
                    title="This lot has data problems, so no route can be used"
                  >
                    {data.lot_problems.join(" ")}
                  </Notice>
                )}

                {/* Recommendation banner */}
                <motion.div variants={fadeRise}>
                  <Panel className="p-5 sm:p-6" label="Recommendation">
                    {best && best.expected_net_recovery !== null ? (
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-xs font-medium uppercase tracking-wide text-[#778494]">
                            Best permitted route
                          </p>
                          <h2 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-semibold">
                            <Sparkles
                              className="h-5 w-5 text-[#315D7C]"
                              aria-hidden="true"
                            />
                            {routeLabel(best.route)}
                            <span className="font-normal text-[#778494]">
                              · expected net {money(best.expected_net_recovery)}
                            </span>
                          </h2>
                          <p className="mt-2 max-w-xl text-sm text-[#778494]">
                            {data.incremental_value_vs_next_best !== null
                              ? `${money(
                                  data.incremental_value_vs_next_best,
                                )} more than the next-best permitted route, at the current settings.`
                              : "It is the only permitted route for this lot."}{" "}
                            Blocked routes are never recommended, whatever their
                            apparent profit.
                          </p>
                          {best.expected_net_recovery < 0 && (
                            <p className="mt-2 text-sm font-medium text-[#8A5A00]">
                              Every permitted route loses money here: handling
                              and processing exceed recovery.
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Tag kind="Scenario" />
                          <span className="text-xs text-[#778494]">
                            Not guaranteed
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h2 className="text-xl font-semibold">
                          No permitted route
                        </h2>
                        <p className="mt-1 max-w-xl text-sm text-[#778494]">
                          Every route is blocked for this lot. The reasons are
                          listed below; resolve them (for example finish the
                          inspection or clear the hold) before choosing a route.
                        </p>
                      </div>
                    )}
                  </Panel>
                </motion.div>

                {/* Route comparison cards */}
                <motion.div
                  variants={stagger}
                  className="grid gap-4 md:grid-cols-3"
                >
                  {data.results.map((r) => (
                    <motion.div key={r.route} variants={fadeRise}>
                      <RouteCard
                        r={r}
                        recommended={r.route === data.recommended_route}
                        maxAbsNet={maxAbsNet}
                      />
                    </motion.div>
                  ))}
                </motion.div>

                {/* Comparison table */}
                <motion.div variants={fadeRise}>
                  <Panel className="p-5 sm:p-6" label="Comparison table">
                    <div className="flex items-center justify-between gap-2">
                      <SectionHeading
                        icon={Layers}
                        title="Route-by-route comparison"
                        hint="All figures straight from the engine, one row per route."
                      />
                      <Tag kind="Scenario" />
                    </div>
                    <div className="mt-3">
                      <ComparisonTable results={data.results} />
                    </div>
                  </Panel>
                </motion.div>

                {/* Range chart */}
                <motion.div variants={fadeRise}>
                  <Panel className="p-5 sm:p-6" label="Scenario range">
                    <div className="flex items-center justify-between gap-2">
                      <SectionHeading
                        icon={Target}
                        title="Low, base and high net recovery"
                        hint="Price ±10%, confidence ∓0.15, clipped to [0,1]."
                      />
                      <Tag kind="Scenario" />
                    </div>
                    <div className="mt-4">
                      {data.results.some((r) => r.eligible) ? (
                        <RangeChart results={data.results} />
                      ) : (
                        <p className="text-sm text-[#778494]">
                          There is no range to show because no route is
                          permitted.
                        </p>
                      )}
                    </div>
                  </Panel>
                </motion.div>

                {data.break_even_refurbish_vs_scrap_unit_price === null &&
                  lotConfidence === null &&
                  confidencePct === null && (
                    <Notice
                      tone="info"
                      title="Break-even needs an inspection confidence"
                    >
                      Complete the inspection, or move the confidence slider to
                      a what-if value, to see where refurbish overtakes scrap.
                    </Notice>
                  )}

                {data.break_even_refurbish_vs_scrap_unit_price !== null && (
                  <motion.div variants={fadeRise}>
                    <Panel className="p-5 sm:p-6" label="Break-even">
                      <div className="flex items-center justify-between gap-2">
                        <SectionHeading
                          icon={Scale}
                          title="Refurbish versus scrap break-even"
                          hint="The resale price at which refurbish equals scrap, per unit."
                        />
                        <Tag kind="Scenario" />
                      </div>
                      <p className="mt-3 text-2xl font-semibold tabular-nums text-[#20374C]">
                        {money(
                          data.break_even_refurbish_vs_scrap_unit_price,
                        )}
                        <span className="ml-1 text-sm font-normal text-[#778494]">
                          per unit
                        </span>
                      </p>
                      <p className="mt-1 max-w-xl text-sm text-[#778494]">
                        Refurbishing beats scrapping only if a refurbished unit
                        sells for more than this, at the confidence now
                        selected. It is the price after refurbishment, so the
                        resale multiplier does not move it. Whether refurbish is
                        permitted is shown separately above.
                      </p>
                    </Panel>
                  </motion.div>
                )}
              </motion.div>
            )}
          </div>
        </div>

        {/* Educational footer */}
        <EducationSection />
      </div>
    </div>
  );
}