
import type { Lot } from "../data/starterData";

export interface ValidationIssue {
  row: number;
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  lots: Lot[];
}

const requiredFields: (keyof Lot)[] = [
  "lot_id",
  "units",
  "inspection",
  "refurbishment_inr",
  "handling_inr",
  "resale_price_inr",
  "scrap_recovery_inr",
];

const allowedInspections = [
  "approved",
  "pending",
  "rejected",
];

export function validateLots(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const validLots: Lot[] = [];

  if (!Array.isArray(input)) {
    return {
      valid: false,
      issues: [
        {
          row: 0,
          field: "records.lots",
          message: "Expected an array of lot records.",
          severity: "error",
        },
      ],
      lots: [],
    };
  }

  if (input.length === 0) {
    issues.push({
      row: 0,
      field: "records.lots",
      message: "The dataset contains no lot records.",
      severity: "error",
    });
  }

  const seenIds = new Set<string>();

  input.forEach((item: unknown, index: number) => {
    const row = index + 1;

    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item)
    ) {
      issues.push({
        row,
        field: "record",
        message: "Each row must be a JSON object.",
        severity: "error",
      });
      return;
    }

    const record = item as Record<string, unknown>;
    let rowHasError = false;

    for (const field of requiredFields) {
      if (!(field in record)) {
        issues.push({
          row,
          field,
          message: `Missing required field: ${field}.`,
          severity: "error",
        });
        rowHasError = true;
      }
    }

    if (
      typeof record.lot_id !== "string" ||
      record.lot_id.trim() === ""
    ) {
      issues.push({
        row,
        field: "lot_id",
        message: "Lot ID must be a non-empty string.",
        severity: "error",
      });
      rowHasError = true;
    } else {
      const id = record.lot_id.trim();

      if (seenIds.has(id)) {
        issues.push({
          row,
          field: "lot_id",
          message: `Duplicate lot ID: ${id}.`,
          severity: "error",
        });
        rowHasError = true;
      }

      seenIds.add(id);
    }

    if (
      typeof record.units !== "number" ||
      !Number.isFinite(record.units) ||
      !Number.isInteger(record.units) ||
      record.units <= 0
    ) {
      issues.push({
        row,
        field: "units",
        message: "Units must be a positive whole number; null is unknown, not zero.",
        severity: "error",
      });
      rowHasError = true;
    }

    if (
      typeof record.inspection !== "string" ||
      !allowedInspections.includes(record.inspection)
    ) {
      issues.push({
        row,
        field: "inspection",
        message: "Inspection must be approved, pending, or rejected.",
        severity: "error",
      });
      rowHasError = true;
    }

    const numericFields = [
      "refurbishment_inr",
      "handling_inr",
      "resale_price_inr",
      "scrap_recovery_inr",
    ] as const;

    for (const field of numericFields) {
      const value = record[field];

      // Preserve unknown values; never silently turn null into zero.
      if (value === null) {
        issues.push({
          row,
          field,
          message: "Value is unknown (null); provide a known value before calculating recovery.",
          severity: "warning",
        });
        continue;
      }

      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0
      ) {
        issues.push({
          row,
          field,
          message: "Value must be a non-negative number or null.",
          severity: "error",
        });
        rowHasError = true;
      }
    }

    if (!rowHasError) {
      validLots.push(record as unknown as Lot);
    }
  });

  const hasErrors = issues.some(
    (issue) => issue.severity === "error",
  );

  return {
    valid: !hasErrors && validLots.length === input.length,
    issues,
    lots: validLots,
  };
}
