
export type InspectionStatus = "approved" | "pending" | "rejected";

export interface Lot {
  lot_id: string;
  units: number | null;
  inspection: InspectionStatus | string | null;
  refurbishment_inr: number | null;
  handling_inr: number | null;
  resale_price_inr: number | null;
  scrap_recovery_inr: number | null;
}

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

export type ProposalStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected";

export interface Proposal {
  proposal_id: string;
  lot_id: string;
  proposed_route: "refurbish" | "resale" | "scrap";
  status: ProposalStatus;
  expected_recovery_inr: number | null;
  created_at: string;
  updated_at: string;
  notes?: string;
}

export interface Outcome {
  outcome_id: string;
  proposal_id: string;
  lot_id: string;
  actual_recovery_inr: number | null;
  recorded_at: string;
  notes?: string;
}

export interface RecoveryVariance {
  proposal_id: string;
  lot_id: string;
  expected_recovery_inr: number | null;
  actual_recovery_inr: number | null;
  variance_inr: number | null;
}
