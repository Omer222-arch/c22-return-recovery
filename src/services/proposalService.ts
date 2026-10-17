
import type { Proposal, ProposalStatus } from "../types";

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
      // Keep the default message if the response isn't JSON.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function loadProposals(): Promise<Proposal[]> {
  return apiRequest<Proposal[]>("/proposals");
}

export async function saveProposal(
  input: Omit<Proposal, "proposal_id" | "created_at" | "updated_at"> & {
    proposal_id?: string;
  }
): Promise<ServiceResult & { proposal?: Proposal }> {
  try {
    if (!input.lot_id.trim()) {
      return { success: false, message: "A lot ID is required." };
    }

    if (!["refurbish", "resale", "scrap"].includes(input.proposed_route)) {
      return { success: false, message: "Invalid proposal route." };
    }

    let proposal: Proposal;

    if (input.proposal_id) {
      // The backend currently supports status updates, not editing
      // every proposal field. Avoid pretending a full edit was saved.
      const existing = (await loadProposals()).find(
        (item) => item.proposal_id === input.proposal_id
      );

      if (!existing) {
        return { success: false, message: "Proposal not found." };
      }

      return {
        success: false,
        message:
          "Editing an existing proposal is not supported by the API yet. Create a new proposal or update its status.",
      };
    }

    proposal = await apiRequest<Proposal>("/proposals", {
      method: "POST",
      body: JSON.stringify({
        lot_id: input.lot_id.trim(),
        proposed_route: input.proposed_route,
        status: input.status,
        expected_recovery_inr: input.expected_recovery_inr,
        notes: input.notes ?? null,
      }),
    });

    return {
      success: true,
      message: "Proposal saved to the backend successfully.",
      proposal,
    };
  } catch (error) {
    return { success: false, message: getErrorMessage(error) };
  }
}

export async function updateProposalStatus(
  proposalId: string,
  status: ProposalStatus
): Promise<ServiceResult> {
  const allowedStatuses: ProposalStatus[] = [
    "draft",
    "pending_review",
    "approved",
    "rejected",
  ];

  if (!allowedStatuses.includes(status)) {
    return { success: false, message: "Invalid proposal status." };
  }

  try {
    await apiRequest<Proposal>(
      `/proposals/${encodeURIComponent(proposalId)}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }
    );

    return {
      success: true,
      message: "Proposal status updated successfully.",
    };
  } catch (error) {
    return { success: false, message: getErrorMessage(error) };
  }
}

export async function deleteProposal(
  proposalId: string
): Promise<ServiceResult> {
  try {
    await apiRequest<{ deleted: boolean }>(
      `/proposals/${encodeURIComponent(proposalId)}`,
      { method: "DELETE" }
    );

    return {
      success: true,
      message: "Proposal deleted successfully.",
    };
  } catch (error) {
    return { success: false, message: getErrorMessage(error) };
  }
}
