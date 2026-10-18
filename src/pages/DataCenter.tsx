
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Database,
  FileJson,
  FileSpreadsheet,
  FileUp,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
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
import Card from "../components/Card";
import Chip from "../components/Chip";
import Button from "../components/Button";
import { apiRequest } from "../api/client";

type Inspection = {
  status?: string;
  result?: string;
  outcome?: string;
  [key: string]: unknown;
};

type LotRecord = {
  id?: string | number;
  lot_id?: string | number;
  lotId?: string | number;
  name?: string;
  lot_name?: string;
  product?: string;
  product_name?: string;
  productName?: string;
  category?: string;
  type?: string;
  units?: number;
  quantity?: number;
  unit_count?: number;
  total_units?: number;
  inspected?: number;
  inspected_units?: number;
  passed?: number;
  failed?: number;
  rejected?: number;
  pending?: number;
  inspection_status?: string;
  status?: string;
  value?: number;
  unit_value?: number;
  unit_cost?: number;
  cost_per_unit?: number;
  revenue?: number;
  recovery_value?: number;
  salvage_value?: number;
  inspections?: Inspection[];
  [key: string]: unknown;
};

type ImportMetadata = {
  dataset_id?: string;
  filename: string;
  imported_at: string;
  record_count: number;
  version: number;
};

type Analysis = {
  totalLots: number;
  totalUnits: number;
  inspectedUnits: number;
  passedUnits: number;
  failedUnits: number;
  pendingUnits: number;
  passRate: number;
  totalValue: number | null;
  recoveryValue: number | null;
  statusData: { name: string; value: number }[];
  categoryData: { name: string; value: number }[];
  financialData: { name: string; value: number }[];
};

const COLORS = {
  primary: "#4f46e5",
  blue: "#3b82f6",
  teal: "#0d9488",
  amber: "#d97706",
  red: "#dc2626",
  purple: "#8b5cf6",
  sky: "#0284c7",
};

const CHART_COLORS = [
  COLORS.primary,
  COLORS.teal,
  COLORS.amber,
  COLORS.purple,
  COLORS.sky,
  COLORS.blue,
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,₹\s]/g, ""));
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }

  return 0;
}

function firstNumber(
  record: Record<string, unknown>,
  keys: string[],
): number {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") {
      return asNumber(record[key]);
    }
  }
  return 0;
}

function knownNumber(
  record: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(/[$,₹\s]/g, ""));
      if (Number.isFinite(parsed)) return Math.max(0, parsed);
    }
  }
  return null;
}

function firstString(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }

  return undefined;
}

function findRecords(value: unknown, depth = 0): LotRecord[] | null {
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    return value.every(isObject) ? (value as LotRecord[]) : null;
  }

  if (!isObject(value) || depth > 5) return null;

  for (const key of ["lots", "records", "data", "payload", "result", "items"]) {
    if (value[key] !== undefined) {
      const result = findRecords(value[key], depth + 1);
      if (result !== null) return result;
    }
  }

  return null;
}


function parseCsv(text: string): LotRecord[] {
  // RFC-4180-style parser: supports quoted commas, escaped quotes, and newlines.
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.length === 0) {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field.trim());
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  if (rows.length < 2) {
    throw new Error("The CSV must include a header row and at least one data row.");
  }

  const headers = rows[0].map((header) => header.trim().replace(/^\\uFEFF/, "").toLowerCase());
  if (headers.some((header) => !header)) {
    throw new Error("The CSV contains an empty column name.");
  }

  const normalizedHeaders = headers.map((header) => header.toLowerCase());
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new Error("The CSV contains duplicate column names.");
  }

  const numericColumns = new Set([
    "units", "quantity", "unit_count", "total_units", "inspected",
    "inspected_units", "passed", "failed", "rejected", "pending",
    "refurbishment_inr", "handling_inr", "resale_price_inr",
    "scrap_recovery_inr", "total_value_inr", "inventory_value_inr",
    "unit_value_inr", "unit_price_inr", "total_recovery_inr",
    "recovery_value_inr", "value", "unit_value", "unit_cost",
    "cost_per_unit", "revenue", "recovery_value", "salvage_value",
    "inspection_confidence",
  ]);
  const booleanColumns = new Set(["safety_hold", "safetyhold"]);

  return rows.slice(1).map((cells, rowIndex) => {
    if (cells.length > headers.length) {
      throw new Error(`CSV row ${rowIndex + 2} has more values than the header.`);
    }

    const record: Record<string, unknown> = {};
    headers.forEach((header, columnIndex) => {
      const raw = (cells[columnIndex] ?? "").trim();
      if (!raw) {
        record[header] = null;
      } else if (numericColumns.has(header.toLowerCase())) {
        const cleaned = raw.replace(/[₹$,\s]/g, "");
        const parsed = Number(cleaned);
        if (!Number.isFinite(parsed)) {
          throw new Error(`CSV row ${rowIndex + 2}: "${header}" must be a number.`);
        }
        record[header] = parsed;
      } else if (booleanColumns.has(header.toLowerCase())) {
        const normalized = raw.toLowerCase();
        if (["true", "yes", "1"].includes(normalized)) record[header] = true;
        else if (["false", "no", "0"].includes(normalized)) record[header] = false;
        else throw new Error(`CSV row ${rowIndex + 2}: "${header}" must be true/false, yes/no, or 1/0.`);
      } else {
        record[header] = raw;
      }
    });
    return record as LotRecord;
  });
}

function validateDataset(records: LotRecord[]): string | null {
  if (!records.length) return "The selected dataset contains no records.";

  if (records.some((record) => !isObject(record) || !Object.keys(record).length)) {
    return "Some records are invalid. Please check the JSON file.";
  }

  return null;
}

function getStatus(record: LotRecord): string {
  const raw = firstString(record, [
    "inspection_status",
    "inspectionStatus",
    "inspection",
    "status",
    "result",
    "outcome",
  ]);

  if (raw) {
    const status = raw.toLowerCase();

    if (
      status.includes("fail") ||
      status.includes("reject") ||
      status.includes("defect")
    ) return "Failed";

    if (
      status.includes("pass") ||
      status.includes("approved") ||
      status.includes("complete") ||
      status.includes("good")
    ) return "Passed";

    if (
      status.includes("pending") ||
      status.includes("waiting") ||
      status.includes("progress")
    ) return "Pending";
  }

  const inspections = Array.isArray(record.inspections)
    ? record.inspections
    : [];

  const statuses = inspections
    .filter(isObject)
    .map((item) =>
      String(item.status ?? item.result ?? item.outcome ?? "").toLowerCase(),
    )
    .filter(Boolean);

  if (
    statuses.some(
      (status) =>
        status.includes("fail") ||
        status.includes("reject") ||
        status.includes("defect"),
    )
  ) return "Failed";

  if (
    statuses.length > 0 &&
    statuses.every(
      (status) =>
        status.includes("pass") ||
        status.includes("approved") ||
        status.includes("complete"),
    )
  ) return "Passed";

  return "Pending";
}

function getCategory(record: LotRecord): string {
  return (
    firstString(record, [
      "category",
      "type",
      "product",
      "product_name",
      "productName",
    ]) ?? "Uncategorized"
  );
}

function getUnits(record: LotRecord): number {
  const value = firstNumber(record, [
    "units",
    "quantity",
    "unit_count",
    "total_units",
    "totalUnits",
  ]);

  const hasUnits = [
    "units",
    "quantity",
    "unit_count",
    "total_units",
    "totalUnits",
  ].some((key) => record[key] !== undefined && record[key] !== null);

  return hasUnits ? value : 1;
}

function calculateAnalysis(lots: LotRecord[]): Analysis {
  let totalUnits = 0;
  let inspectedUnits = 0;
  let passedUnits = 0;
  let failedUnits = 0;
  let pendingUnits = 0;
  let totalValue = 0;
  let hasTotalValue = false;
  let recoveryValue = 0;
  let hasRecoveryValue = false;

  const statusCounts: Record<string, number> = {
    Passed: 0,
    Failed: 0,
    Pending: 0,
  };

  const categoryCounts: Record<string, number> = {};

  for (const lot of lots) {
    const units = getUnits(lot);
    const status = getStatus(lot);
    const category = getCategory(lot);

    totalUnits += units;
    categoryCounts[category] = (categoryCounts[category] ?? 0) + units;
    statusCounts[status] = (statusCounts[status] ?? 0) + units;

    if (status === "Passed") {
      passedUnits += units;
      inspectedUnits += units;
    } else if (status === "Failed") {
      failedUnits += units;
      inspectedUnits += units;
    } else {
      pendingUnits += units;
    }

    const explicitTotal = knownNumber(lot, [
      "total_value_inr", "inventory_value_inr", "total_value", "totalValue", "inventory_value",
    ]);
    const unitValue = knownNumber(lot, [
      "unit_value_inr", "unit_value", "unit_price_inr", "unit_cost", "cost_per_unit", "resale_price_inr", "value",
    ]);

    if (explicitTotal !== null) {
      totalValue += explicitTotal;
      hasTotalValue = true;
    } else if (unitValue !== null) {
      totalValue += unitValue * units;
      hasTotalValue = true;
    }

    const lotRecoveryValue = knownNumber(lot, [
      "recovery_value_inr", "recovery_value", "recoveryValue", "salvage_value", "salvageValue",
    ]);
    if (lotRecoveryValue !== null) {
      recoveryValue += lotRecoveryValue;
      hasRecoveryValue = true;
    }
  }

  return {
    totalLots: lots.length,
    totalUnits,
    inspectedUnits,
    passedUnits,
    failedUnits,
    pendingUnits,
    passRate: inspectedUnits ? (passedUnits / inspectedUnits) * 100 : 0,
    totalValue: hasTotalValue ? totalValue : null,
    recoveryValue: hasRecoveryValue ? recoveryValue : null,
    statusData: [
      { name: "Passed", value: statusCounts.Passed },
      { name: "Failed", value: statusCounts.Failed },
      { name: "Pending", value: statusCounts.Pending },
    ],
    categoryData: Object.entries(categoryCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6),
    financialData: [
      ...(hasTotalValue ? [{ name: "Inventory value", value: totalValue }] : []),
      ...(hasRecoveryValue ? [{ name: "Recovery value", value: recoveryValue }] : []),
    ],
  };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Something went wrong. Please try again.";
}

export default function DataCenter() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  const [lots, setLots] = useState<LotRecord[]>([]);
  const [importMetadata, setImportMetadata] =
    useState<ImportMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showRows, setShowRows] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 12;

  const totalPages = Math.max(1, Math.ceil(lots.length / rowsPerPage));
  const pageStart = (currentPage - 1) * rowsPerPage;
  const visibleLots = lots.slice(pageStart, pageStart + rowsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [lots]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const hasImportedDataset = importMetadata !== null && lots.length > 0;

  const analysis = useMemo(
    () => (hasImportedDataset ? calculateAnalysis(lots) : null),
    [hasImportedDataset, lots],
  );

  const loadDataset = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<{
        dataset: ImportMetadata | null;
        lots: LotRecord[];
        dataset_available: boolean;
      }>("/api/dataset");
      const records = Array.isArray(response.lots) ? response.lots : [];
      if (!response.dataset_available || !response.dataset || records.length === 0) {
        setLots([]);
        setImportMetadata(null);
      } else {
        setLots(records);
        setImportMetadata(response.dataset);
      }
    } catch (loadError) {
      setLots([]);
      setImportMetadata(null);
      setError(`Unable to load the saved dataset. ${getErrorMessage(loadError)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDataset();
  }, [loadDataset]);

  const handleImportClick = () => {
    setError(null);
    setSuccess(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const extension = file.name.toLowerCase().split(".").pop();
    if (extension !== "json" && extension !== "csv") {
      setError("Please select a .json or .csv file.");
      return;
    }

    setImporting(true);
    setError(null);
    setSuccess(null);

    try {
      let records: LotRecord[];

      if (extension === "csv") {
        records = parseCsv(await file.text());
      } else {
        let parsed: unknown;
        try {
          parsed = JSON.parse(await file.text());
        } catch {
          throw new Error("The selected file is not valid JSON.");
        }

        const jsonRecords = findRecords(parsed);
        if (jsonRecords === null) {
          throw new Error(
            'Unsupported JSON format. Use an array or an object containing "lots", "records", "data", or "items".',
          );
        }
        records = jsonRecords;
      }

      const validationError = validateDataset(records);
      if (validationError) throw new Error(validationError);

      if (hasImportedDataset) {
        const confirmed = window.confirm(
          "Importing this file will replace the active inventory dataset. Existing proposals and outcomes will remain saved. Continue?",
        );
        if (!confirmed) return;
      }

      const response = await apiRequest<{
        success: boolean;
        message?: string;
        dataset: ImportMetadata;
        lots: LotRecord[];
      }>("/api/lots/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, lots: records }),
      });

      if (!response.success || !Array.isArray(response.lots) || !response.dataset) {
        throw new Error("The server did not return the saved dataset and metadata.");
      }

      setLots(response.lots);
      setImportMetadata(response.dataset);
      setShowRows(false);
      setSuccess(`Imported ${formatNumber(response.lots.length)} records successfully (dataset v${response.dataset.version}).`);
    } catch (importError) {
      setError(getErrorMessage(importError));
    } finally {
      setImporting(false);
    }
  };

  const animationProps = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.3 },
      };

  return (
    <div className="dc-page">
      <style>{`
        .dc-page {
          --dc-text: #172033;
          --dc-muted: #64748b;
          --dc-border: #e2e8f0;
          --dc-surface: #ffffff;
          --dc-soft: #f8fafc;
          --dc-primary: #4f46e5;
          color: var(--dc-text);
          width: 100%;
          min-width: 0;
        }

        .dc-page * { box-sizing: border-box; }

        .dc-stack { display: grid; gap: 20px; }

        .dc-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .dc-actions {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .dc-message {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 13px 15px;
          border: 1px solid;
          border-radius: 12px;
          font-size: 13px;
          line-height: 1.6;
        }

        .dc-message-error {
          background: #fff1f2;
          color: #9f1239;
          border-color: #fecdd3;
        }

        .dc-message-success {
          background: #ecfdf5;
          color: #065f46;
          border-color: #a7f3d0;
        }

        .dc-dismiss {
          border: 0;
          background: transparent;
          color: inherit;
          cursor: pointer;
          padding: 2px;
        }

        .dc-empty {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          padding: clamp(30px, 5vw, 58px) 20px;
          text-align: center;
          box-shadow: 0 3px 12px rgba(15, 23, 42, .035);
        }

        .dc-upload-icon {
          width: 66px;
          height: 66px;
          display: grid;
          place-items: center;
          border-radius: 18px;
          margin: 0 auto 18px;
          background: #eef2ff;
          border: 1px solid #e0e7ff;
          color: #4f46e5;
        }

        .dc-empty h2 {
          margin: 0 0 10px;
          font-size: 22px;
          letter-spacing: -.025em;
          color: #172033;
        }

        .dc-empty p {
          color: #64748b;
          max-width: 530px;
          margin: 0 auto 22px;
          line-height: 1.75;
          font-size: 14px;
        }

        .dc-filetypes {
          display: flex;
          gap: 8px;
          justify-content: center;
          flex-wrap: wrap;
          margin-top: 18px;
        }

        .dc-filetype {
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #475569;
          border-radius: 8px;
          padding: 6px 10px;
          font-size: 11px;
        }

        .dc-meta {
          display: flex;
          gap: 9px;
          flex-wrap: wrap;
          align-items: center;
          color: #64748b;
          font-size: 12px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 12px 14px;
        }

        .dc-kpis {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .dc-kpi {
          padding: 18px;
          min-width: 0;
          border: 1px solid #e2e8f0;
          border-radius: 15px;
          background: #ffffff;
          box-shadow: 0 2px 8px rgba(15, 23, 42, .035);
          transition: border-color .2s, box-shadow .2s;
        }

        .dc-kpi:hover {
          border-color: #c7d2fe;
          box-shadow: 0 8px 22px rgba(79, 70, 229, .07);
        }

        .dc-kpi-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .dc-kpi-label {
          font-size: 12px;
          color: #64748b;
          font-weight: 600;
        }

        .dc-kpi-icon {
          width: 35px;
          height: 35px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          background: #eef2ff;
          color: #4f46e5;
        }

        .dc-kpi-value {
          margin-top: 15px;
          font-size: clamp(22px, 2.5vw, 29px);
          line-height: 1.2;
          font-weight: 750;
          letter-spacing: -.04em;
          color: #172033;
          overflow-wrap: anywhere;
        }

        .dc-kpi-sub {
          color: #64748b;
          font-size: 11px;
          margin-top: 7px;
          line-height: 1.5;
        }

        .dc-chart-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .dc-chart-card {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          background: #ffffff;
          padding: 20px;
          min-width: 0;
          box-shadow: 0 2px 8px rgba(15, 23, 42, .025);
        }

        .dc-chart-card h3 {
          margin: 0;
          font-size: 14px;
          font-weight: 700;
          color: #172033;
        }

        .dc-chart-card p {
          margin: 6px 0 0;
          color: #64748b;
          font-size: 12px;
          line-height: 1.6;
        }

        .dc-chart {
          height: 270px;
          margin-top: 18px;
        }

        .dc-chart-wide { grid-column: 1 / -1; }

        .dc-insight-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 18px;
        }

        .dc-insight {
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          border-radius: 13px;
          padding: 16px;
        }

        .dc-insight-label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .055em;
          color: #64748b;
        }

        .dc-insight-value {
          font-size: 22px;
          font-weight: 750;
          margin-top: 9px;
          color: #172033;
        }

        .dc-insight-copy {
          color: #64748b;
          font-size: 12px;
          line-height: 1.6;
          margin-top: 5px;
        }

        .dc-about {
          padding: 22px;
          border: 1px solid #e0e7ff;
          border-radius: 16px;
          background: #f8faff;
          box-shadow: 0 2px 8px rgba(15, 23, 42, .025);
        }

        .dc-about-title {
          display: flex;
          align-items: center;
          gap: 9px;
          font-weight: 750;
          font-size: 15px;
          color: #1e293b;
        }

        .dc-about-title-icon {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          background: #e0e7ff;
          color: #4338ca;
        }

        .dc-about p {
          margin: 12px 0 0;
          font-size: 13px;
          line-height: 1.8;
          color: #475569;
        }

        .dc-formula-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 17px;
        }

        .dc-formula {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 11px;
          padding: 14px;
        }

        .dc-formula strong {
          display: block;
          font-size: 12px;
          margin-bottom: 8px;
          color: #334155;
        }

        .dc-formula code {
          font-size: 11px;
          color: #4f46e5;
          white-space: normal;
          overflow-wrap: anywhere;
          line-height: 1.7;
        }

        .dc-table-wrap {
          overflow-x: auto;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          margin-top: 17px;
          background: #ffffff;
        }

        .dc-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

        .dc-table th, .dc-table td {
          text-align: left;
          padding: 13px 14px;
          border-bottom: 1px solid #e2e8f0;
          white-space: nowrap;
        }

        .dc-table th {
          background: #f8fafc;
          color: #475569;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .04em;
        }

        .dc-table td { color: #334155; }
        .dc-table tbody tr:hover { background: #f8faff; }
        .dc-table tr:last-child td { border-bottom: 0; }

        .dc-section-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }

        .dc-section-heading h2 {
          margin: 0;
          font-size: 17px;
          letter-spacing: -.02em;
          color: #172033;
        }

        .dc-section-heading p {
          margin: 5px 0 0;
          color: #64748b;
          font-size: 12px;
          line-height: 1.6;
        }

        .dc-plain-button {
          border: 1px solid #dbe3ef;
          background: #ffffff;
          color: #334155;
          padding: 9px 12px;
          border-radius: 9px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          transition: background .2s, border-color .2s, color .2s;
        }

        .dc-plain-button:hover {
          background: #eef2ff;
          border-color: #c7d2fe;
          color: #4338ca;
        }

        .dc-loading {
          display: flex;
          gap: 10px;
          align-items: center;
          padding: 22px;
          color: #64748b;
          font-size: 13px;
        }

        .dc-spin { animation: dc-spin 1s linear infinite; }

        .dc-page .recharts-cartesian-axis-tick-value {
          fill: #64748b;
        }

        .dc-page .recharts-legend-item-text {
          color: #475569 !important;
        }

        @keyframes dc-spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 1000px) {
          .dc-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .dc-insight-grid { grid-template-columns: 1fr; }
        }

        @media (max-width: 700px) {
          .dc-chart-grid { grid-template-columns: 1fr; }
          .dc-chart-wide { grid-column: auto; }
          .dc-formula-grid { grid-template-columns: 1fr; }
          .dc-chart { height: 245px; }
          .dc-chart-card, .dc-about { padding: 16px; }
        }

        @media (max-width: 430px) {
          .dc-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
          .dc-kpi { padding: 12px; }
          .dc-kpi-value { font-size: 21px; }
          .dc-topbar { align-items: flex-start; }
        }
      `}</style>

      <div className="dc-stack">
        <div className="dc-topbar">
          <PageHeader
            title="Data Center"
            description="Import, validate, and analyze your inventory dataset."
          />

          <div className="dc-actions">
            <Button
              variant="secondary"
              onClick={() => void loadDataset()}
              disabled={loading || importing}
            >
              <RefreshCw
                size={15}
                className={loading ? "dc-spin" : ""}
              />
              Refresh
            </Button>

            <Button
              onClick={handleImportClick}
              disabled={loading || importing}
            >
              {importing ? (
                <RefreshCw size={15} className="dc-spin" />
              ) : (
                <Upload size={15} />
              )}
              {importing ? "Importing..." : "Import CSV / JSON"}
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            hidden
            onChange={(event) => void handleFileChange(event)}
          />
        </div>

        {error && (
          <div className="dc-message dc-message-error" role="alert">
            <AlertCircle size={18} />
            <div style={{ flex: 1 }}>{error}</div>
            <button
              type="button"
              className="dc-dismiss"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {success && (
          <div className="dc-message dc-message-success" role="status">
            <CheckCircle2 size={18} />
            <div style={{ flex: 1 }}>{success}</div>
            <button
              type="button"
              className="dc-dismiss"
              onClick={() => setSuccess(null)}
              aria-label="Dismiss success message"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {loading ? (
          <Card>
            <div className="dc-loading">
              <RefreshCw size={17} className="dc-spin" />
              Checking for a previously imported dataset...
            </div>
          </Card>
        ) : !hasImportedDataset ? (
          <motion.section className="dc-empty" {...animationProps}>
            <div className="dc-upload-icon">
              <FileJson size={30} />
            </div>

            <h2>No dataset imported yet</h2>

            <p>
              Import a valid CSV or JSON dataset to generate your KPIs, charts,
              inspection metrics, and financial insights. No demo data or
              pre-generated analysis is displayed.
            </p>

            <Button onClick={handleImportClick} disabled={importing}>
              <FileUp size={16} />
              {importing ? "Importing..." : "Choose CSV or JSON dataset"}
            </Button>

            <div className="dc-filetypes">
              <span className="dc-filetype">JSON format</span>
              <span className="dc-filetype">Array of records</span>
              <span className="dc-filetype">lots / records / data wrapper</span>
            </div>
          </motion.section>
        ) : analysis ? (
          <>
            <motion.div className="dc-meta" {...animationProps}>
              <Chip tone="success">
                <ShieldCheck size={12} /> Dataset loaded
              </Chip>
              <span>
                {importMetadata.filename.toLowerCase().endsWith(".csv") ? (
                  <FileSpreadsheet size={13} style={{ display: "inline", verticalAlign: "middle" }} />
                ) : (
                  <FileJson size={13}
                  style={{ display: "inline", verticalAlign: "middle" }}
                  />
                )}{" "}
                {importMetadata.filename}
              </span>
              <span>·</span>
              <span>{formatNumber(importMetadata.record_count)} records</span>
              <span>·</span>
              <span>
                Imported {new Date(importMetadata.imported_at).toLocaleString()}
              </span>
              <span>·</span>
              <span>Version {importMetadata.version}</span>
            </motion.div>

            <div className="dc-kpis">
              {[
                {
                  label: "Total lots",
                  value: formatNumber(analysis.totalLots),
                  sub: "Records in imported dataset",
                  icon: <Database size={17} />,
                },
                {
                  label: "Total units",
                  value: formatNumber(analysis.totalUnits),
                  sub: "Units represented in the dataset",
                  icon: <BarChart3 size={17} />,
                },
                {
                  label: "Inspection pass rate",
                  value: `${analysis.passRate.toFixed(1)}%`,
                  sub: `${formatNumber(analysis.passedUnits)} passed units`,
                  icon: <CheckCircle2 size={17} />,
                },
                {
                  label: "Inventory value",
                  value: analysis.totalValue === null ? "Unknown" : formatCurrency(analysis.totalValue),
                  sub: analysis.recoveryValue === null
                    ? "Recovery value not provided"
                    : `${formatCurrency(analysis.recoveryValue)} recorded recovery`,
                  icon: <TrendingUp size={17} />,
                },
              ].map((kpi, index) => (
                <motion.div
                  key={kpi.label}
                  className="dc-kpi"
                  {...(reduceMotion
                    ? {}
                    : {
                        initial: { opacity: 0, y: 10 },
                        animate: { opacity: 1, y: 0 },
                        transition: { duration: 0.3, delay: index * 0.06 },
                        whileHover: { y: -3 },
                      })}
                >
                  <div className="dc-kpi-top">
                    <span className="dc-kpi-label">{kpi.label}</span>
                    <span className="dc-kpi-icon">{kpi.icon}</span>
                  </div>
                  <div className="dc-kpi-value">{kpi.value}</div>
                  <div className="dc-kpi-sub">{kpi.sub}</div>
                </motion.div>
              ))}
            </div>

            <section className="dc-chart-grid">
              <motion.div className="dc-chart-card" {...animationProps}>
                <h3>Inspection status</h3>
                <p>Unit counts calculated from imported records.</p>
                <div className="dc-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analysis.statusData}
                      margin={{ top: 10, right: 8, left: -15, bottom: 4 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#e2e8f0"
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#ffffff",
                          border: "1px solid #e2e8f0",
                          borderRadius: 10,
                          color: "#172033",
                          fontSize: 12,
                        }}
                        formatter={(value) => [
                          formatNumber(Number(value)),
                          "Units",
                        ]}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {analysis.statusData.map((item) => (
                          <Cell
                            key={item.name}
                            fill={
                              item.name === "Passed"
                                ? COLORS.teal
                                : item.name === "Failed"
                                  ? COLORS.red
                                  : COLORS.amber
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

              <motion.div className="dc-chart-card" {...animationProps}>
                <h3>Inventory category mix</h3>
                <p>Distribution of units by category or product type.</p>
                <div className="dc-chart">
                  {analysis.categoryData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analysis.categoryData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="48%"
                          innerRadius={58}
                          outerRadius={92}
                          paddingAngle={3}
                        >
                          {analysis.categoryData.map((item, index) => (
                            <Cell
                              key={item.name}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "#ffffff",
                            border: "1px solid #e2e8f0",
                            borderRadius: 10,
                            color: "#172033",
                            fontSize: 12,
                          }}
                          formatter={(value) => [
                            formatNumber(Number(value)),
                            "Units",
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="dc-loading">
                      No category information found in this dataset.
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    justifyContent: "center",
                  }}
                >
                  {analysis.categoryData.map((item, index) => (
                    <span
                      key={item.name}
                      style={{
                        fontSize: 11,
                        color: "#475569",
                        display: "inline-flex",
                        gap: 6,
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 99,
                          backgroundColor:
                            CHART_COLORS[index % CHART_COLORS.length],
                        }}
                      />
                      {item.name}
                    </span>
                  ))}
                </div>
              </motion.div>

              <motion.div
                className="dc-chart-card dc-chart-wide"
                {...animationProps}
              >
                <h3>Financial overview</h3>
                <p>
                  Financial totals use recognized values from the imported dataset.
                  Missing values remain unknown and are not treated as zero.
                </p>
                <div className="dc-chart">
                  {analysis.financialData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analysis.financialData}
                      layout="vertical"
                      margin={{ top: 10, right: 25, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                        stroke="#e2e8f0"
                      />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value) =>
                          new Intl.NumberFormat("en-IN", {
                            notation: "compact",
                            maximumFractionDigits: 1,
                          }).format(Number(value))
                        }
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={125}
                        tick={{ fontSize: 11, fill: "#475569" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#ffffff",
                          border: "1px solid #e2e8f0",
                          borderRadius: 10,
                          color: "#172033",
                          fontSize: 12,
                        }}
                        formatter={(value) => [
                          formatCurrency(Number(value)),
                          "Value",
                        ]}
                      />
                      <Bar
                        dataKey="value"
                        fill={COLORS.primary}
                        radius={[0, 6, 6, 0]}
                        barSize={28}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                  ) : (
                    <div className="dc-loading">
                      No recognized inventory or recovery value fields were provided.
                    </div>
                  )}
                </div>
              </motion.div>
            </section>

            <section className="dc-chart-card">
              <div className="dc-section-heading">
                <div>
                  <h2>Dataset insights</h2>
                  <p>
                    Summary metrics calculated from the currently imported
                    records.
                  </p>
                </div>
              </div>

              <div className="dc-insight-grid">
                <div className="dc-insight">
                  <div className="dc-insight-label">Inspection coverage</div>
                  <div className="dc-insight-value">
                    {analysis.totalUnits
                      ? `${(
                          (analysis.inspectedUnits / analysis.totalUnits) *
                          100
                        ).toFixed(1)}%`
                      : "0%"}
                  </div>
                  <div className="dc-insight-copy">
                    Share of units marked passed or failed.
                  </div>
                </div>

                <div className="dc-insight">
                  <div className="dc-insight-label">Failed units</div>
                  <div className="dc-insight-value">
                    {formatNumber(analysis.failedUnits)}
                  </div>
                  <div className="dc-insight-copy">
                    Units marked failed, rejected, or defective.
                  </div>
                </div>

                <div className="dc-insight">
                  <div className="dc-insight-label">Pending units</div>
                  <div className="dc-insight-value">
                    {formatNumber(analysis.pendingUnits)}
                  </div>
                  <div className="dc-insight-copy">
                    Units not recognized as passed or failed.
                  </div>
                </div>
              </div>
            </section>

            <section className="dc-about">
              <div className="dc-about-title">
                <span className="dc-about-title-icon">
                  <Database size={18} />
                </span>
                About Data Center analysis
              </div>

              <p>
                Data Center converts your imported CSV or JSON inventory into a
                consistent summary of lots, units, inspection outcomes, and
                available financial values. It does not use demo records.
                Importing another file replaces the previous saved dataset,
                and metrics are recalculated from the new records. Results
                depend on the field names and values present in your source
                file.
              </p>

              <div className="dc-formula-grid">
                <div className="dc-formula">
                  <strong>Inspection pass rate</strong>
                  <code>Passed units ÷ Inspected units × 100</code>
                </div>
                <div className="dc-formula">
                  <strong>Inspection coverage</strong>
                  <code>Inspected units ÷ Total units × 100</code>
                </div>
                <div className="dc-formula">
                  <strong>Inventory value</strong>
                  <code>Explicit total value, or unit value × units</code>
                </div>
              </div>
            </section>

            <section className="dc-chart-card">
              <div className="dc-section-heading">
                <div>
                  <h2>Imported records</h2>
                  <p>
                    Review the records used to generate the current analysis.
                  </p>
                </div>

                <button
                  className="dc-plain-button"
                  type="button"
                  onClick={() => setShowRows((current) => !current)}
                >
                  {showRows ? "Hide records" : "Review records"}
                </button>
              </div>

              {showRows && (
                <div className="dc-table-wrap">
                  <table className="dc-table">
                    <thead>
                      <tr>
                        <th>Record</th>
                        <th>Lot / product</th>
                        <th>Category</th>
                        <th>Units</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleLots.map((lot, visibleIndex) => {
                        const index = pageStart + visibleIndex;
                        const recordId =
                          firstString(lot, ["id", "lot_id", "lotId"]) ??
                          String(index + 1);
                        const name =
                          firstString(lot, [
                            "name",
                            "lot_name",
                            "product",
                            "product_name",
                            "productName",
                          ]) ?? "Unnamed record";

                        return (
                          <tr key={`${recordId}-${index}`}>
                            <td>{recordId}</td>
                            <td>{name}</td>
                            <td>{getCategory(lot)}</td>
                            <td>{formatNumber(getUnits(lot))}</td>
                            <td>{getStatus(lot)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {showRows && lots.length > 0 && (
                <div
                  className="dc-pagination"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 12,
                    marginTop: 16,
                  }}
                >
                  <span style={{ color: "#64748b", fontSize: 12 }}>
                    Showing {pageStart + 1}–{Math.min(pageStart + rowsPerPage, lots.length)} of {lots.length} records
                  </span>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      className="dc-plain-button"
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={currentPage === 1}
                      aria-label="Previous page"
                      style={{
                        opacity: currentPage === 1 ? 0.45 : 1,
                        cursor: currentPage === 1 ? "not-allowed" : "pointer",
                      }}
                    >
                      Previous
                    </button>

                    <span
                      aria-live="polite"
                      style={{
                        minWidth: 82,
                        textAlign: "center",
                        color: "#334155",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      Page {currentPage} of {totalPages}
                    </span>

                    <button
                      className="dc-plain-button"
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={currentPage === totalPages}
                      aria-label="Next page"
                      style={{
                        opacity: currentPage === totalPages ? 0.45 : 1,
                        cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
