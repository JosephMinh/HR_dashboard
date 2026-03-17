/**
 * Deterministic UUID v5 ID generation for WFP data import.
 *
 * Uses name-based SHA-1 hashing so that re-running the import produces
 * identical IDs. The identity input is always importKey (sheet:row),
 * NOT tempJobId, because tempJobId has known collisions (e.g. 5273
 * appears twice in "Beyond 2026", 5354 spans both sheets).
 */

import { v5 as uuidv5 } from "uuid";

/**
 * Project-specific UUID v5 namespace. Generated once and hardcoded
 * so that all imports across all environments produce the same IDs.
 */
export const WFP_NAMESPACE = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

/** Generate a deterministic Job ID from its importKey. */
export function wfpJobId(importKey: string): string {
  return uuidv5(`job:${importKey}`, WFP_NAMESPACE);
}

/** Generate a deterministic Candidate ID from the parent job's importKey. */
export function wfpCandidateId(jobImportKey: string): string {
  return uuidv5(`candidate:${jobImportKey}`, WFP_NAMESPACE);
}

/** Generate a deterministic Application ID from the parent job's importKey. */
export function wfpApplicationId(jobImportKey: string): string {
  return uuidv5(`application:${jobImportKey}`, WFP_NAMESPACE);
}

/** Generate a deterministic HeadcountProjection ID from its importKey. */
export function wfpProjectionId(projectionImportKey: string): string {
  return uuidv5(`projection:${projectionImportKey}`, WFP_NAMESPACE);
}

/** Generate a deterministic Tradeoff ID from its importKey. */
export function wfpTradeoffId(tradeoffImportKey: string): string {
  return uuidv5(`tradeoff:${tradeoffImportKey}`, WFP_NAMESPACE);
}
