
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  Calculator,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Info,
  Package,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import Chip from "../components/Chip";
import Button from "../components/Button";
import { formatINR } from "../api/client";

const STORAGE_KEY = "recoveriq-workbench-scenario";

const DEFAULTS = {
  quantity: 10,
  resale: 100,
  refurbish: 20,
  handling: 5,
  success: 100,
  safetyConfirmed: false,
};

type Scenario = typeof DEFAULTS;

type Route = {
  name: string;
  gross: number;
  costs: number;
  net: number;
  low: number;
  high: number;
  note: string;
  description: string;
  eligible: boolean;
};

function loadScenario(): Scenario {
  if (typeof window === "undefined") return DEFAULTS;

  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULTS;

    const parsed: Partial<Scenario> = JSON.parse(saved);

    const boundedNumber = (
      value: unknown,
      fallback: number,
      min: number,
      max: number
    ) => {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value)
      ) {
        return fallback;
      }

      return Math.min(max, Math.max(min, value));
    };

    return {
      quantity: boundedNumber(parsed.quantity, 10, 1, 100000),
      resale: boundedNumber(parsed.resale, 100, 0, 100000000),
      refurbish: boundedNumber(parsed.refurbish, 20, 0, 100000000),
      handling: boundedNumber(parsed.handling, 5, 0, 100000000),
      success: boundedNumber(parsed.success, 100, 0, 100),
      safetyConfirmed:
        typeof parsed.safetyConfirmed === "boolean"
          ? parsed.safetyConfirmed
          : false,
    };
  } catch {
    return DEFAULTS;
  }
}

export default function Workbench() {
  const [initialScenario] = useState<Scenario>(loadScenario);

  const [quantity, setQuantity] = useState(initialScenario.quantity);
  const [resale, setResale] = useState(initialScenario.resale);
  const [refurbish, setRefurbish] = useState(initialScenario.refurbish);
  const [handling, setHandling] = useState(initialScenario.handling);
  const [success, setSuccess] = useState(initialScenario.success);
  const [safetyConfirmed, setSafetyConfirmed] = useState(
    initialScenario.safetyConfirmed
  );
  const [evaluated, setEvaluated] = useState(false);

  const reduceMotion = useReducedMotion();

  // Persist inputs while navigating between pages in this browser tab.
  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          quantity,
          resale,
          refurbish,
          handling,
          success,
          safetyConfirmed,
        })
      );
    } catch {
      // The workbench remains usable if browser storage is unavailable.
    }
  }, [
    quantity,
    resale,
    refurbish,
    handling,
    success,
    safetyConfirmed,
  ]);

  const routes = useMemo<Route[]>(() => {
    const successRate = success / 100;

    const resaleGross = quantity * resale;
    const resaleCosts = quantity * handling;
    const resaleNet = resaleGross - resaleCosts;

    const refurbGross = quantity * resale * successRate;
    const refurbCosts = quantity * (refurbish + handling);
    const refurbNet = refurbGross - refurbCosts;

    // Placeholder only: replace with the approved backend scrap value.
    const scrapGross = quantity * 10;
    const scrapNet = scrapGross;

    return [
      {
        name: "Resale",
        gross: resaleGross,
        costs: resaleCosts,
        net: resaleNet,
        low: resaleNet * 0.9,
        high: resaleNet * 1.05,
        note: "Sell as-is after inspection",
        description: "Lower processing effort",
        eligible: true,
      },
      {
        name: "Refurbish",
        gross: refurbGross,
        costs: refurbCosts,
        net: refurbNet,
        low: refurbNet * 0.8,
        high: refurbNet * 1.1,
        note: "Repair and test before resale",
        description: "Requires safety and eligibility review",
        eligible: safetyConfirmed,
      },
      {
        name: "Scrap",
        gross: scrapGross,
        costs: 0,
        net: scrapNet,
        low: scrapNet * 0.9,
        high: scrapNet * 1.05,
        note: "Material recovery estimate",
        description: "Illustrative placeholder value",
        eligible: true,
      },
    ];
  }, [
    quantity,
    resale,
    refurbish,
    handling,
    success,
    safetyConfirmed,
  ]);

  const eligibleRoutes = routes.filter((route) => route.eligible);

  const best = eligibleRoutes.reduce<Route | null>(
    (current, route) =>
      !current || route.net > current.net ? route : current,
    null
  );

  // Use the largest positive net value as the reference for the bars.
  // Recomputed automatically whenever the route values change.
  const maxNet = Math.max(
    1,
    ...routes.map((route) => Math.max(0, route.net))
  );

  function reset() {
    setQuantity(DEFAULTS.quantity);
    setResale(DEFAULTS.resale);
    setRefurbish(DEFAULTS.refurbish);
    setHandling(DEFAULTS.handling);
    setSuccess(DEFAULTS.success);
    setSafetyConfirmed(DEFAULTS.safetyConfirmed);
    setEvaluated(false);
  }

  function handleEvaluate() {
    setEvaluated(true);
  }

  function updateNumber(
    value: string,
    setter: (value: number) => void,
    min: number,
    max: number
  ) {
    if (value.trim() === "") {
      setter(min);
      return;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed)) return;

    setter(Math.min(max, Math.max(min, parsed)));
    setEvaluated(false);
  }

  const pageVariants = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 8 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      className="page-stack workbench-page"
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      transition={{
        duration: reduceMotion ? 0 : 0.3,
        ease: "easeOut",
      }}
    >
      <PageHeader
        eyebrow="DECISION WORKSPACE"
        title="Recovery workbench"
        description="Compare recovery routes, review key assumptions, and understand the trade-offs before preparing a proposal."
        actions={
          <Button variant="secondary" onClick={reset}>
            <RotateCcw size={16} />
            Reset inputs
          </Button>
        }
      />

      <div className="wb-demo-banner">
        <div className="wb-banner-icon">
          <Info size={18} />
        </div>
        <div>
          <strong>Illustrative scenario · Not a final allocation</strong>
          <p>
            These values are calculated locally. They have not been verified
            by the recovery engine. Scrap value and scenario ranges are
            placeholders.
          </p>
        </div>
        <Chip tone="neutral">Demo data</Chip>
      </div>

      {/* Summary cards */}
      <section className="wb-summary-grid" aria-label="Scenario summary">
        <div className="wb-summary-card">
          <div className="wb-summary-top">
            <span>Lot quantity</span>
            <span className="wb-icon-box">
              <Package size={17} />
            </span>
          </div>
          <strong className="wb-summary-number">
            {quantity.toLocaleString("en-IN")}
            <small> units</small>
          </strong>
          <p>Items in this scenario</p>
        </div>

        <div className="wb-summary-card wb-summary-primary">
          <div className="wb-summary-top">
            <span>Highest eligible estimate</span>
            <span className="wb-icon-box">
              <TrendingUp size={17} />
            </span>
          </div>
          <strong className="wb-summary-number">
            {best ? formatINR(best.net) : "—"}
          </strong>
          <p>{best ? `${best.name} in this scenario` : "No eligible route"}</p>
        </div>

        <div className="wb-summary-card">
          <div className="wb-summary-top">
            <span>Eligible routes</span>
            <span className="wb-icon-box">
              <Activity size={17} />
            </span>
          </div>
          <strong className="wb-summary-number">
            {eligibleRoutes.length}
            <small> / {routes.length}</small>
          </strong>
          <p>Based on demo rules only</p>
        </div>

        <div className="wb-summary-card">
          <div className="wb-summary-top">
            <span>Safety review</span>
            <span className="wb-icon-box">
              {safetyConfirmed ? (
                <CheckCircle2 size={17} />
              ) : (
                <ShieldCheck size={17} />
              )}
            </span>
          </div>
          <strong className="wb-summary-status">
            {safetyConfirmed ? "Reviewed" : "Review required"}
          </strong>
          <p>
            {safetyConfirmed
              ? "Refurbishment can be compared"
              : "Refurbishment remains restricted"}
          </p>
        </div>
      </section>

      <div className="wb-main-grid">
        {/* Input panel */}
        <div>
          <Card title="Scenario assumptions" className="input-panel">
            <div className="wb-section-intro">
              <span className="wb-step-number">01</span>
              <div>
                <strong>Define the returned lot</strong>
                <p>Set the quantity and estimated resale value.</p>
              </div>
            </div>

            <div className="field-grid wb-field-grid">
              <label className="field">
                <span>Quantity (units)</span>
                <input
                  type="number"
                  min="1"
                  max="100000"
                  value={quantity}
                  onChange={(e) =>
                    updateNumber(e.target.value, setQuantity, 1, 100000)
                  }
                />
              </label>

              <label className="field">
                <span>Resale value / unit (₹)</span>
                <input
                  type="number"
                  min="0"
                  max="100000000"
                  value={resale}
                  onChange={(e) =>
                    updateNumber(
                      e.target.value,
                      setResale,
                      0,
                      100000000
                    )
                  }
                />
              </label>
            </div>

            <div className="wb-section-divider" />

            <div className="wb-section-intro">
              <span className="wb-step-number">02</span>
              <div>
                <strong>Estimate processing costs</strong>
                <p>Enter the expected cost per unit.</p>
              </div>
            </div>

            <div className="field-grid wb-field-grid">
              <label className="field">
                <span>Refurbishment / unit (₹)</span>
                <input
                  type="number"
                  min="0"
                  max="100000000"
                  value={refurbish}
                  onChange={(e) =>
                    updateNumber(
                      e.target.value,
                      setRefurbish,
                      0,
                      100000000
                    )
                  }
                />
              </label>

              <label className="field">
                <span>Handling / unit (₹)</span>
                <input
                  type="number"
                  min="0"
                  max="100000000"
                  value={handling}
                  onChange={(e) =>
                    updateNumber(
                      e.target.value,
                      setHandling,
                      0,
                      100000000
                    )
                  }
                />
              </label>
            </div>

            <div className="wb-inline-metric">
              <span>
                <Calculator size={15} />
                Combined cost assumptions
              </span>
              <strong>
                {formatINR(quantity * (refurbish + handling))}
              </strong>
              <small>
                Total refurbishment and handling costs across the lot
              </small>
            </div>

            <div className="wb-section-divider" />

            <div className="wb-section-intro">
              <span className="wb-step-number">03</span>
              <div>
                <strong>Refurbishment assumption</strong>
                <p>
                  Explore how the assumed success rate affects estimated
                  proceeds. This is not a model-generated probability.
                </p>
              </div>
            </div>

            <div className="wb-range-card">
              <div className="wb-range-heading">
                <span>Assumed success rate</span>
                <strong>{success}%</strong>
              </div>
              <input
                className="wb-range-input"
                type="range"
                min="0"
                max="100"
                step="5"
                value={success}
                aria-label="Assumed refurbishment success rate"
                onChange={(e) => {
                  setSuccess(Number(e.target.value));
                  setEvaluated(false);
                }}
              />
              <div className="range-labels">
                <small>0% · No successful units</small>
                <small>100% · All units successful</small>
              </div>
            </div>

            <label className="wb-safety-card">
              <input
                type="checkbox"
                checked={safetyConfirmed}
                onChange={(e) => {
                  setSafetyConfirmed(e.target.checked);
                  setEvaluated(false);
                }}
              />
              <span className="wb-safety-check-icon">
                {safetyConfirmed ? (
                  <CheckCircle2 size={19} />
                ) : (
                  <ShieldCheck size={19} />
                )}
              </span>
              <span className="wb-safety-copy">
                <strong>Safety and eligibility reviewed</strong>
                <small>
                  This demo checkbox does not replace backend safety
                  validation.
                </small>
              </span>
              <span className="wb-safety-state">
                {safetyConfirmed ? "Reviewed" : "Pending"}
              </span>
            </label>

            <div className="wb-form-actions">
              <Button onClick={handleEvaluate}>
                <Calculator size={16} />
                Evaluate scenario
              </Button>
              <span>
                <Info size={14} />
                Local illustrative calculation
              </span>
            </div>

            {evaluated && (
              <motion.div
                className="wb-evaluated-message"
                initial={{ opacity: 0, y: reduceMotion ? 0 : 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.2 }}
                role="status"
              >
                <CheckCircle2 size={16} />
                Scenario reviewed. Values reflect your current inputs.
              </motion.div>
            )}
          </Card>
        </div>

        {/* Route comparison */}
        <div className="wb-results-column">
          <Card
            title="Recovery route comparison"
            action={
              <Chip tone={evaluated ? "success" : "neutral"}>
                {evaluated ? "Scenario reviewed" : "Live preview"}
              </Chip>
            }
          >
            <div className="wb-results-heading">
              <p>
                Change your assumptions to see the estimates and comparison
                bars update immediately.
              </p>
              <div className="wb-chart-legend">
                <span />
                Relative net estimate
              </div>
            </div>

            <div className="route-results wb-route-results">
              {routes.map((route, index) => {
                const isBest = best?.name === route.name;

                // Always derive the bar from the latest route values.
                const barWidth =
                  route.net > 0
                    ? Math.min(100, (route.net / maxNet) * 100)
                    : 0;

                return (
                  <motion.div
                    className={`result-route wb-result-route ${
                      isBest ? "recommended" : ""
                    }`}
                    key={route.name}
                    initial={{
                      opacity: 0,
                      y: reduceMotion ? 0 : 8,
                    }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: reduceMotion ? 0 : 0.22,
                      delay: reduceMotion ? 0 : index * 0.04,
                    }}
                  >
                    <div className="result-route-top">
                      <div className="wb-route-title">
                        <span className="wb-route-index">
                          0{index + 1}
                        </span>
                        <div>
                          <strong>{route.name}</strong>
                          <p>{route.note}</p>
                        </div>
                      </div>

                      <Chip
                        tone={
                          !route.eligible
                            ? "warning"
                            : isBest
                              ? "success"
                              : "neutral"
                        }
                      >
                        {!route.eligible
                          ? "Review required"
                          : isBest
                            ? "Highest estimate"
                            : "Eligible in demo"}
                      </Chip>
                    </div>

                    <div className="wb-net-number">
                      <div>
                        <span>Estimated net recovery</span>
                        <strong>{formatINR(route.net)}</strong>
                      </div>
                      {isBest && (
                        <span className="wb-route-badge">
                          <ArrowUpRight size={15} />
                          Highest
                        </span>
                      )}
                    </div>

                    <div className="wb-value-track">
                      <motion.div
                        className={`wb-value-fill ${
                          isBest ? "wb-value-fill-best" : ""
                        }`}
                        initial={false}
                        animate={{ width: `${barWidth}%` }}
                        transition={{
                          duration: reduceMotion ? 0 : 0.3,
                          ease: "easeOut",
                        }}
                      />
                    </div>

                    <div className="result-breakdown wb-breakdown">
                      <span>
                        <small>Gross estimate</small>
                        <strong>{formatINR(route.gross)}</strong>
                      </span>
                      <span>
                        <small>Costs</small>
                        <strong>{formatINR(route.costs)}</strong>
                      </span>
                    </div>

                    <div className="scenario-range wb-scenario-range">
                      <span>Illustrative scenario range</span>
                      <strong>
                        {formatINR(Math.min(route.low, route.high))} –{" "}
                        {formatINR(Math.max(route.low, route.high))}
                      </strong>
                    </div>

                    <p className="wb-route-description">
                      {route.description}
                    </p>

                    {!route.eligible && (
                      <div className="route-warning">
                        <CircleAlert size={15} />
                        Safety review is pending. Do not treat this route as
                        approved for allocation.
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            <div className="best-route-note wb-decision-note">
              <ShieldCheck size={18} />
              <span>
                <strong>Human review remains essential.</strong>
                The highest estimate is not automatically the safest or
                operationally permitted route. This demo does not enforce
                backend policy or capacity limits.
              </span>
            </div>
          </Card>

          <Card title="Before you prepare a proposal">
            <div className="wb-checklist">
              <div>
                <span className="wb-checklist-icon">
                  <ClipboardCheck size={17} />
                </span>
                <span>
                  <strong>Confirm lot condition</strong>
                  <small>
                    Check inspection findings and product eligibility.
                  </small>
                </span>
              </div>
              <div>
                <span className="wb-checklist-icon">
                  <ShieldCheck size={17} />
                </span>
                <span>
                  <strong>Verify route restrictions</strong>
                  <small>
                    Confirm safety rules and capacity limits.
                  </small>
                </span>
              </div>
              <div>
                <span className="wb-checklist-icon">
                  <Sparkles size={17} />
                </span>
                <span>
                  <strong>Review uncertainty</strong>
                  <small>
                    Validate price, confidence, and scenario assumptions.
                  </small>
                </span>
              </div>
            </div>
            <p className="wb-checklist-footnote">
              These are guidance steps, not a saved compliance checklist.
            </p>
          </Card>
        </div>
      </div>

      <div className="page-footnote wb-footnote">
        <Info size={15} />
        <span>
          <strong>Calculation note:</strong> Resale and refurbishment use
          simplified local formulas. Scrap is a placeholder. Scenario ranges
          are illustrative percentages, not confidence intervals. Confirm
          eligibility and calculation rules against the approved backend
          engine contract before using figures in a proposal.
        </span>
      </div>
    </motion.div>
  );
}
