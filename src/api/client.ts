
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ??
  "https://recoveriq-backend-bxp7.onrender.com"
).replace(/\/$/, "");

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(
      "Could not connect to the API. Showing demo data where available.",
      0
    );
  }

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new ApiError(
      message || `API request failed (${response.status})`,
      response.status
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type HealthResponse = {
  success?: boolean;
  status?: string;
  message?: string;
};

export type Lot = {
  id?: string;
  lot_id?: string;
  name?: string;
  product_name?: string;
  quantity?: number;
  status?: string;
};

export type RouteName = "resale" | "refurbish" | "scrap";

export type RouteResult = {
  route: RouteName;
  eligible: boolean;
  reason?: string | null;
  gross_recovery: number | null;
  processing_cost: number | null;
  handling_cost: number | null;
  expected_net_recovery: number | null;
  scenario_low: number | null;
  scenario_high: number | null;
};

export type EvaluateResponse = {
  lot_id: string | null;
  lot_problems: string[];
  results: RouteResult[];
  recommended_route: RouteName | null;
  incremental_value_vs_next_best: number | null;
  break_even_refurbish_vs_scrap_unit_price: number | null;
  label: string;
};

export type RecoveryAdvice = {
  recommendation: string;
  rationale: string;
  trade_offs: string[];
  risks: string[];
  missing_information: string[];
};

export const api = {
  health: () => apiRequest<HealthResponse>("/api/health"),

  lots: (signal?: AbortSignal) =>
    apiRequest<Lot[]>("/api/lots", { signal }),

  evaluate: (payload: unknown, signal?: AbortSignal) =>
    apiRequest<EvaluateResponse>("/api/evaluate", {
      method: "POST",
      body: JSON.stringify(payload),
      signal,
    }),

  recoveryAdvice: (payload: {
    lot: Record<string, unknown>;
    scenarios: RouteResult[];
    context?: string;
  }) =>
    apiRequest<RecoveryAdvice>("/api/ai/recovery-advice", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  proposals: () => apiRequest<unknown[]>("/api/proposals"),

  outcomes: () => apiRequest<unknown[]>("/api/outcomes"),
};

export function formatINR(
  value: number | null | undefined
): string {
  if (value == null || !Number.isFinite(value)) return "Unknown";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}
