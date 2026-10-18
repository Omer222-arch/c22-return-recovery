import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Warehouse,
} from "lucide-react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Card from "../components/Card";
import Chip from "../components/Chip";
import Button from "../components/Button";
import { api, formatINR } from "../api/client";

const STORAGE_KEY = "recoveriq-workbench-scenario";

type Scenario = {
  quantity: number;
  resale: number;
  refurbish: number;
  handling: number;
  success: number;
  safetyConfirmed: boolean;
};

const DEFAULT_SCENARIO: Scenario = {
  quantity: 10,
  resale: 100,
  refurbish: 20,
  handling: 5,
  success: 100,
  safetyConfirmed: false,
};

// Load the most recently saved Workbench scenario.
function readWorkbenchScenario(): Scenario {
  const defaults = DEFAULT_SCENARIO;

  if (typeof window === "undefined") {
    return defaults;
  }

  try {
    const saved = window.sessionStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return defaults;
    }

    const value = JSON.parse(saved) as Partial<Scenario>;

    const validNumber = (
      candidate: unknown,
      fallback: number,
      min: number,
      max: number
    ) => {
      if (
        typeof candidate !== "number" ||
        !Number.isFinite(candidate)
      ) {
        return fallback;
      }

      return Math.min(max, Math.max(min, candidate));
    };

    return {
      quantity: validNumber(value.quantity, 10, 1, 100000),
      resale: validNumber(value.resale, 100, 0, 100000000),
      refurbish: validNumber(value.refurbish, 20, 0, 100000000),
      handling: validNumber(value.handling, 5, 0, 100000000),
      success: validNumber(value.success, 100, 0, 100),
      safetyConfirmed:
        typeof value.safetyConfirmed === "boolean"
          ? value.safetyConfirmed
          : false,
    };
  } catch {
    return defaults;
  }
}

// Historical values below are synthetic teaching examples.
// They are not actual realized warehouse recovery.
const trendData = [
  { month: "May", recovery: 42000, target: 39000 },
  { month: "Jun", recovery: 51000, target: 44000 },
  { month: "Jul", recovery: 47000, target: 46000 },
  { month: "Aug", recovery: 64000, target: 51000 },
  { month: "Sep", recovery: 59000, target: 55000 },
  { month: "Oct", recovery: 76000, target: 61000 },
];

const activities = [
  {
    title: "Lot RTN-024 evaluated",
    detail: "Small home appliances · 42 units",
    time: "12 min ago",
    tone: "success" as const,
    icon: PackageCheck,
    label: "Completed",
  },
  {
    title: "Proposal PR-018 awaits review",
    detail: "Refurbishment route · safety review required",
    time: "46 min ago",
    tone: "warning" as const,
    icon: ClipboardCheck,
    label: "Review",
  },
  {
    title: "Return batch imported",
    detail: "Warehouse North · 18 lots",
    time: "2 hours ago",
    tone: "blue" as const,
    icon: Boxes,
    label: "Imported",
  },
  {
    title: "Pilot outcome recorded",
    detail: "Electronics accessories · completed",
    time: "Yesterday",
    tone: "neutral" as const,
    icon: CheckCircle2,
    label: "Recorded",
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.075 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" as const },
  },
};

const tooltipStyle = {
  border: "1px solid #e4e9ee",
  borderRadius: 12,
  boxShadow: "0 10px 30px rgba(24, 54, 83, 0.10)",
  fontSize: 12,
};

export default function Overview() {
  const [apiStatus, setApiStatus] = useState<
    "checking" | "connected" | "demo"
  >("checking");

  const [lastChecked, setLastChecked] = useState("Checking service…");
  const [refreshing, setRefreshing] = useState(false);
  const [scenario, setScenario] = useState<Scenario>(
    readWorkbenchScenario
  );

  const reduceMotion = useReducedMotion();

  async function checkHealth() {
    setRefreshing(true);

    try {
      const result = await api.health();

      if (result.status === "online" || result.success === true) {
        setApiStatus("connected");
        setLastChecked("Health check successful");
      } else {
        setApiStatus("demo");
        setLastChecked("API responded, but is not confirmed healthy");
      }
    } catch {
      setApiStatus("demo");
      setLastChecked("Backend unavailable · showing sample dashboard");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void checkHealth();
  }, []);

  // Refresh the scenario when returning from the Workbench.
  useEffect(() => {
    const refreshScenario = () => {
      setScenario(readWorkbenchScenario());
    };

    refreshScenario();

    window.addEventListener(
      "recoveriq-scenario-updated",
      refreshScenario
    );

    window.addEventListener("focus", refreshScenario);
    window.addEventListener("pageshow", refreshScenario);

    return () => {
      window.removeEventListener(
        "recoveriq-scenario-updated",
        refreshScenario
      );

      window.removeEventListener("focus", refreshScenario);
      window.removeEventListener("pageshow", refreshScenario);
    };
  }, []);

  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  // Illustrative calculations use the same inputs as the Workbench.
  // The backend engine remains the authoritative source for real
  // eligibility and recovery decisions.
  const resaleNet =
    scenario.quantity * (scenario.resale - scenario.handling);

  const refurbishNet =
    scenario.quantity *
    (
      (scenario.resale * scenario.success) / 100 -
      scenario.refurbish -
      scenario.handling
    );

  const scrapNet = scenario.quantity * 10;

  const routeValues = [
    {
      name: "Resale",
      net: resaleNet,
      color: "#315D7C",
      eligible: true,
    },
    {
      name: "Refurbish",
      net: refurbishNet,
      color: "#5D947D",
      eligible: scenario.safetyConfirmed,
    },
    {
      name: "Scrap",
      net: scrapNet,
      color: "#D5A35B",
      eligible: true,
    },
  ];

  // Exclude routes that are blocked or have non-positive illustrative value.
  const permittedRoutes = routeValues.filter(
    (route) => route.eligible && route.net > 0
  );

  const estimatedRecovery = Math.max(
    0,
    ...permittedRoutes.map((route) => route.net)
  );

  const routeTotal = permittedRoutes.reduce(
    (total, route) => total + route.net,
    0
  );

  const scenarioRouteData = routeValues.map((route) => ({
    name: route.name,
    color: route.color,
    eligible: route.eligible,
    net: route.net,
    value:
      route.eligible && route.net > 0 && routeTotal > 0
        ? (route.net / routeTotal) * 100
        : 0,
  }));

  const MotionDiv = motion.div;
  const initial = reduceMotion ? false : "hidden";
  const animate = "visible";

  return (
    <div className="page-stack overview-page">
      <PageHeader
        eyebrow="RECOVERY INTELLIGENCE · OVERVIEW"
        title="Recovery overview"
        description="Understand your returns, compare recovery opportunities, and identify decisions that need attention."
        actions={
          <Button
            variant="secondary"
            onClick={() => void checkHealth()}
            loading={refreshing}
          >
            <RefreshCw size={16} />
            Refresh status
          </Button>
        }
      />

      <MotionDiv
        className="overview-welcome"
        initial={initial}
        animate={animate}
        variants={itemVariants}
      >
        <div className="overview-welcome-content">
          <div className="overview-eyebrow">
            <Sparkles size={15} />
            YOUR RECOVERY WORKSPACE
          </div>

          <h2>Make every return count.</h2>

          <p>
            Review lot condition, understand route eligibility, and compare
            expected recovery before committing to a decision.
          </p>

          <div className="overview-welcome-actions">
            <Link to="/workbench" className="button button-primary">
              Open recovery workbench <ArrowRight size={16} />
            </Link>

            <Link to="/scenario-lab" className="overview-text-link">
              Explore scenarios <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>

        <div className="overview-welcome-art" aria-hidden="true">
          <div className="overview-art-orbit orbit-one" />
          <div className="overview-art-orbit orbit-two" />

          <div className="overview-art-core">
            <Warehouse size={38} strokeWidth={1.4} />
          </div>

          <div className="overview-art-node node-one">
            <TrendingUp size={17} />
          </div>

          <div className="overview-art-node node-two">
            <ShieldCheck size={17} />
          </div>

          <div className="overview-art-node node-three">
            <PackageCheck size={17} />
          </div>
        </div>
      </MotionDiv>

      <div className="overview-meta-row">
        <div className="overview-date">
          <Clock3 size={15} />
          <span>{today}</span>
        </div>

        <div
          className={`overview-api-status ${
            apiStatus === "connected" ? "is-connected" : ""
          }`}
        >
          <span
            className={`status-dot ${
              apiStatus === "connected"
                ? "online"
                : apiStatus === "demo"
                  ? "offline"
                  : ""
            }`}
          />

          <span>
            {apiStatus === "connected"
              ? "Backend connected"
              : apiStatus === "demo"
                ? "Demonstration mode"
                : "Checking backend"}
          </span>

          <span className="overview-status-detail">{lastChecked}</span>
        </div>
      </div>

      <div className="overview-demo-banner">
        <Activity size={17} />

        <div>
          <strong>
            {apiStatus === "connected"
              ? "Connection verified"
              : "Synthetic teaching data"}
          </strong>

          <span>
            The route mix and recovery estimate use your saved Workbench
            scenario. Historical trends, activity and other sample metrics
            remain illustrative and are not real warehouse performance.
          </span>
        </div>
      </div>

      <MotionDiv
        className="stats-grid overview-stats-grid"
        initial={initial}
        animate={animate}
        variants={containerVariants}
      >
        <MotionDiv
          variants={itemVariants}
          whileHover={reduceMotion ? undefined : { y: -3 }}
        >
          <StatCard
            label="Lots under review"
            value="128"
            detail="Illustrative sample"
            icon={Boxes}
            tone="blue"
          />
        </MotionDiv>

        <MotionDiv
          variants={itemVariants}
          whileHover={reduceMotion ? undefined : { y: -3 }}
        >
          <StatCard
            label="Estimated net recovery"
            value={formatINR(estimatedRecovery)}
            detail={
              <>
                <ArrowUpRight size={14} />
                Current Workbench scenario
              </>
            }
            icon={CircleDollarSign}
            tone="green"
          />
        </MotionDiv>

        <MotionDiv
          variants={itemVariants}
          whileHover={reduceMotion ? undefined : { y: -3 }}
        >
          <StatCard
            label="Pending decisions"
            value="17"
            detail="Sample review queue"
            icon={ClipboardCheck}
            tone="amber"
          />
        </MotionDiv>

        <MotionDiv
          variants={itemVariants}
          whileHover={reduceMotion ? undefined : { y: -3 }}
        >
          <StatCard
            label="Eligible for recovery"
            value="86.7%"
            detail="Illustrative sample"
            icon={ShieldCheck}
            tone="slate"
          />
        </MotionDiv>
      </MotionDiv>

      <div className="overview-section-heading">
        <div>
          <span className="overview-section-kicker">PERFORMANCE</span>
          <h2>Recovery at a glance</h2>
          <p>
            View the illustrative historical trend and compare the estimated
            value of each route in your current Workbench scenario.
          </p>
        </div>

        <Chip tone="neutral">Scenario analysis</Chip>
      </div>

      <div className="overview-grid overview-analytics-grid">
        <MotionDiv
          initial={initial}
          animate={animate}
          variants={itemVariants}
        >
          <Card
            className="chart-panel overview-chart-card"
            title="Illustrative recovery trend"
            action={<Chip tone="blue">6-month sample</Chip>}
          >
            <div className="chart-summary">
              <div>
                <span className="muted-label">Sample recovery total</span>
                <strong>₹3.59L</strong>
                <span className="overview-chart-subtitle">
                  Example trend · May–October
                </span>
              </div>

              <div className="chart-legend">
                <span>
                  <i className="legend-dot recovery" />
                  Recovery
                </span>

                <span>
                  <i className="legend-dot target" />
                  Target
                </span>
              </div>
            </div>

            <div className="chart-wrap overview-area-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={trendData}
                  margin={{ top: 12, right: 8, left: -16, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="overviewRecoveryFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#315d7c"
                        stopOpacity={0.23}
                      />

                      <stop
                        offset="95%"
                        stopColor="#315d7c"
                        stopOpacity={0.01}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid stroke="#e9edf1" vertical={false} />

                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#778494", fontSize: 12 }}
                    dy={8}
                  />

                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#778494", fontSize: 11 }}
                    tickFormatter={(value: number) => `₹${value / 1000}k`}
                  />

                  <Tooltip
                    formatter={(value) => formatINR(Number(value))}
                    contentStyle={tooltipStyle}
                  />

                  <Area
                    type="monotone"
                    dataKey="target"
                    name="Target"
                    stroke="#b7c2cc"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    fill="transparent"
                    isAnimationActive={!reduceMotion}
                    animationDuration={850}
                  />

                  <Area
                    type="monotone"
                    dataKey="recovery"
                    name="Recovery"
                    stroke="#315d7c"
                    strokeWidth={2.5}
                    fill="url(#overviewRecoveryFill)"
                    activeDot={{ r: 5, strokeWidth: 0 }}
                    isAnimationActive={!reduceMotion}
                    animationDuration={1000}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-footnote">
              <TrendingUp size={15} />
              <span>
                Fixed teaching example. Workbench changes do not change
                historical data.
              </span>
            </div>
          </Card>
        </MotionDiv>

        <MotionDiv
          initial={initial}
          animate={animate}
          variants={itemVariants}
        >
          <Card
            title="Recovery route mix"
            action={
              <Link className="text-action" to="/workbench">
                Compare routes <ArrowRight size={14} />
              </Link>
            }
          >
            <div className="overview-donut-wrap">
              <ResponsiveContainer width="100%" height={215}>
                <PieChart>
                  <Pie
                    data={scenarioRouteData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={88}
                    paddingAngle={4}
                    stroke="none"
                    isAnimationActive={!reduceMotion}
                    animationDuration={900}
                  >
                    {scenarioRouteData.map((route) => (
                      <Cell
                        key={route.name}
                        fill={route.color}
                        opacity={route.eligible && route.value > 0 ? 1 : 0.2}
                      />
                    ))}
                  </Pie>

                  <Tooltip
                    formatter={(value) => [
                      `${Number(value).toFixed(1)}%`,
                      "Share of positive eligible route value",
                    ]}
                    contentStyle={tooltipStyle}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="overview-donut-center">
                <strong>{scenario.quantity}</strong>
                <span>Units in scenario</span>
              </div>
            </div>

            <div className="overview-route-legend">
              {scenarioRouteData.map((route) => (
                <div
                  className="overview-route-legend-row"
                  key={route.name}
                >
                  <span className="overview-route-name">
                    <i
                      style={{
                        background: route.color,
                        opacity: route.eligible ? 1 : 0.35,
                      }}
                    />

                    {route.name}
                  </span>

                  <div className="overview-route-legend-track">
                    <span
                      style={{
                        width: `${route.value}%`,
                        background: route.color,
                        opacity: route.eligible ? 1 : 0.35,
                        transition: reduceMotion
                          ? "none"
                          : "width 350ms ease",
                      }}
                    />
                  </div>

                  <strong>
                    {route.eligible
                      ? `${route.value.toFixed(1)}%`
                      : "Blocked"}
                  </strong>
                </div>
              ))}
            </div>

            <div className="route-note">
              <ShieldCheck size={16} />

              <span>
                {scenario.safetyConfirmed
                  ? "Refurbishment safety confirmation is enabled in the saved scenario."
                  : "Refurbishment is excluded from this estimate until safety is confirmed."}
              </span>
            </div>

            <div className="chart-footnote">
              <Activity size={15} />

              <span>
                Illustrative route comparison, not an engine allocation
                decision. Backend eligibility and capacity rules take
                precedence.
              </span>
            </div>
          </Card>
        </MotionDiv>
      </div>

      <div className="overview-section-heading overview-activity-heading">
        <div>
          <span className="overview-section-kicker">WORKFLOW</span>
          <h2>What needs attention</h2>
          <p>
            Example activity showing how review tasks can appear in the
            workspace.
          </p>
        </div>

        <Link className="text-action" to="/proposals">
          Open proposal review <ArrowRight size={14} />
        </Link>
      </div>

      <Card
        title="Recent activity"
        action={<Chip tone="neutral">Sample records</Chip>}
      >
        <div className="activity-list overview-activity-list">
          {activities.map((item, index) => {
            const Icon = item.icon;

            return (
              <MotionDiv
                className="activity-item"
                key={item.title}
                initial={initial}
                animate={animate}
                variants={itemVariants}
                transition={{ delay: index * 0.04 }}
              >
                <span className={`activity-icon activity-${item.tone}`}>
                  <Icon size={17} />
                </span>

                <div className="activity-copy">
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>

                <time>{item.time}</time>

                <Chip tone={item.tone}>{item.label}</Chip>
              </MotionDiv>
            );
          })}
        </div>
      </Card>

      <div className="overview-quick-actions">
        <div className="overview-section-heading">
          <div>
            <span className="overview-section-kicker">QUICK ACTIONS</span>
            <h2>Move work forward</h2>
          </div>
        </div>

        <div className="overview-action-grid">
          <Link to="/workbench" className="overview-action-card">
            <span className="overview-action-icon action-blue">
              <CircleDollarSign size={21} />
            </span>

            <span className="overview-action-copy">
              <strong>Evaluate a lot</strong>
              <small>
                Compare recovery routes and scenario ranges.
              </small>
            </span>

            <ArrowRight size={17} className="overview-action-arrow" />
          </Link>

          <Link to="/scenario-lab" className="overview-action-card">
            <span className="overview-action-icon action-green">
              <Activity size={21} />
            </span>

            <span className="overview-action-copy">
              <strong>Explore scenarios</strong>
              <small>
                Understand changes in price and confidence.
              </small>
            </span>

            <ArrowRight size={17} className="overview-action-arrow" />
          </Link>

          <Link to="/proposals" className="overview-action-card">
            <span className="overview-action-icon action-amber">
              <ClipboardCheck size={21} />
            </span>

            <span className="overview-action-copy">
              <strong>Review proposals</strong>
              <small>
                Inspect saved decisions and review status.
              </small>
            </span>

            <ArrowRight size={17} className="overview-action-arrow" />
          </Link>
        </div>
      </div>

      <div className="bottom-callout overview-risk-callout">
        <div className="callout-icon">
          <TriangleAlert size={21} />
        </div>

        <div>
          <strong>Risk-aware recovery starts with eligibility.</strong>

          <p>
            A high estimated recovery does not override safety holds,
            unsupported routes, or capacity restrictions.
          </p>
        </div>

        <Link to="/workbench" className="button button-primary">
          Evaluate a lot <ArrowRight size={16} />
        </Link>
      </div>

      <p className="overview-footer-note">
        ReCoverIQ · Decision support, not an automatic decision. Historical
        figures and activity are synthetic teaching examples. The current
        Workbench estimate is illustrative and must not be treated as a
        guaranteed recovery outcome.
      </p>
    </div>
  );
}
