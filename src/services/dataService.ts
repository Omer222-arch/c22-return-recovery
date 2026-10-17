
import { starterLots } from "../data/starterData";
import type { Lot } from "../data/starterData";
import { validateLots } from "../utils/validation";

const STORAGE_KEY = "recoveriq.lots.v1";
const API_BASE_URL = "http://127.0.0.1:8000/api";

export interface DataLoadResult {
  lots: Lot[];
  source: "saved" | "starter";
  warning?: string;
}

export interface BackendValidationResult {
  valid: boolean;
  lots: Lot[];
  issues: {
    row: number;
    field: string;
    message: string;
    severity: "error" | "warning";
  }[];
}

type ServiceResult = {
  success: boolean;
  message: string;
};

function getStarterLots(): Lot[] {
  return structuredClone(starterLots);
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
      message =
        typeof body.detail === "string"
          ? body.detail
          : JSON.stringify(body.detail ?? body);
    } catch {
      // Keep the default error message.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

/**
 * Validate imported data using FastAPI.
 * Fall back to local validation if the API is unavailable.
 */
export async function validateLotsWithBackend(
  input: unknown
): Promise<BackendValidationResult> {
  try {
    return await apiRequest<BackendValidationResult>("/validate", {
      method: "POST",
      body: JSON.stringify(input),
    });
  } catch {
    const result = validateLots(input);

    return {
      valid: result.valid,
      lots: result.lots,
      issues: result.issues,
    };
  }
}

/**
 * Load saved lots from the backend.
 * Fall back to browser storage and starter data if unavailable.
 */
export async function loadLotsFromBackend(): Promise<DataLoadResult> {
  try {
    const lots = await apiRequest<Lot[]>("/lots");

    if (lots.length > 0) {
      return { lots, source: "saved" };
    }

    // Migrate a previously saved browser dataset if one exists.
    const browserData = loadLotsFromBrowser();

    if (browserData.source === "saved") {
      const result = await saveLotsToBackend(browserData.lots);

      if (result.success) {
        return { lots: browserData.lots, source: "saved" };
      }
    }

    // Seed backend storage with starter data on first use.
    const starter = getStarterLots();
    const saved = await saveLotsToBackend(starter);

    if (saved.success) {
      return { lots: starter, source: "starter" };
    }

    return {
      lots: starter,
      source: "starter",
      warning: saved.message,
    };
  } catch (error) {
    const fallback = loadLotsFromBrowser();

    return {
      ...fallback,
      warning:
        error instanceof Error
          ? `Backend unavailable. ${error.message}`
          : "Backend unavailable. Using local data.",
    };
  }
}

/**
 * Synchronous browser-storage loader retained for compatibility.
 */
export function loadLots(): DataLoadResult {
  return loadLotsFromBrowser();
}

function loadLotsFromBrowser(): DataLoadResult {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved === null) {
      return { lots: getStarterLots(), source: "starter" };
    }

    const parsed: unknown = JSON.parse(saved);
    const result = validateLots(parsed);

    if (result.valid) {
      return { lots: result.lots, source: "saved" };
    }

    return {
      lots: getStarterLots(),
      source: "starter",
      warning: "Saved data was invalid. Starter data was loaded instead.",
    };
  } catch {
    return {
      lots: getStarterLots(),
      source: "starter",
      warning: "Saved data could not be read. Starter data was loaded instead.",
    };
  }
}

/**
 * Save a complete validated dataset to backend storage.
 */
export async function saveLotsToBackend(
  input: unknown
): Promise<ServiceResult> {
  const validation = await validateLotsWithBackend(input);

  if (!validation.valid) {
    return {
      success: false,
      message: "Data was not saved because validation failed.",
    };
  }

  try {
    const lots = await apiRequest<Lot[]>("/lots", {
      method: "PUT",
      body: JSON.stringify({ lots: validation.lots }),
    });

    // Keep a browser copy as a fallback.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lots));
    } catch {
      // Backend save succeeded; browser backup is optional.
    }

    return {
      success: true,
      message: `Saved ${lots.length} validated lots to the backend.`,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Unable to save lots.",
    };
  }
}

/**
 * Legacy synchronous save retained for existing callers.
 */
export function saveLots(input: unknown): ServiceResult {
  const result = validateLots(input);

  if (!result.valid) {
    return {
      success: false,
      message: "Data was not saved because validation failed.",
    };
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result.lots));

    return {
      success: true,
      message: `Saved ${result.lots.length} validated lots in browser storage.`,
    };
  } catch {
    return {
      success: false,
      message: "Browser storage failed. The previous saved dataset was preserved.",
    };
  }
}

export async function resetLotsFromBackend(): Promise<
  ServiceResult & { lots: Lot[] }
> {
  const lots = getStarterLots();
  const result = await saveLotsToBackend(lots);

  return { ...result, lots };
}

/**
 * Legacy reset retained for existing callers.
 */
export function resetLots(): ServiceResult & { lots: Lot[] } {
  const lots = getStarterLots();
  const result = saveLots(lots);

  return { ...result, lots };
}

export function clearSavedLots(): void {
  localStorage.removeItem(STORAGE_KEY);
}
