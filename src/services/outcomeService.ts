
import type { Outcome, Proposal } from "../types";

const API_BASE_URL = "http://127.0.0.1:8000/api";

type ServiceResult = {
  success: boolean;
  message: string;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "An unexpected API error occurred.";
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = `API request failed (${response.status}).`;

    try {
      const body = await response.json();
      message = body.detail ?? message;
    } catch {
      // Use the default error message if the response isn't JSON.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function loadOutcomes(): Promise<Outcome[]> {
  return apiRequest<Outcome[]>("/outcomes");
}

export async function saveOutcome(
  input: Omit<Outcome, "outcome_id" | "recorded_at"> & {
    outcome_id?: string;
  }
): Promise<ServiceResult & { outcome?: Outcome }> {
  if (!input.lot_id.trim() || !input.proposal_id.trim()) {
    return {
      success: false,
      message: "A lot ID and proposal ID are required.",
    };
  }

  if (
    input.actual_recovery_inr !== null &&
    (!Number.isFinite(input.actual_recovery_inr) ||
      input.actual_recovery_inr < 0)
  ) {
    return {
      success: false,
      message: "Actual recovery must be non-negative or unknown.",
    };
  }

  try {
    const outcome = await apiRequest<Outcome>("/outcomes", {
      method: "POST",
      body: JSON.stringify({
        proposal_id: input.proposal_id,
        lot_id: input.lot_id,
        actual_recovery_inr: input.actual_recovery_inr,
        notes: input.notes ?? null,
      }),
    });

    return {
      success: true,
      message: "Outcome saved to the backend successfully.",
      outcome,
    };
  } catch (error) {
    return {
      success: false,
      message: getErrorMessage(error),
    };
  }
}

export async function deleteOutcome(
  outcomeId: string
): Promise<ServiceResult> {
  try {
    await apiRequest<unknown>(
      `/outcomes/${encodeURIComponent(outcomeId)}`,
      { method: "DELETE" }
    );

    return {
      success: true,
      message: "Outcome deleted successfully.",
    };
  } catch (error) {
    return {
      success: false,
      message: getErrorMessage(error),
    };
  }
}

export function calculateVariance(
  proposal: Proposal,
  outcome: Outcome
): number | null {
  const expected = proposal.expected_recovery_inr;
  const actual = outcome.actual_recovery_inr;

  if (expected === null || actual === null) {
    return null;
  }

  return actual - expected;
}
