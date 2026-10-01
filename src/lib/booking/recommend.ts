/**
 * Smart Resource Recommendation.
 *
 * The rulebook's example table shows Lab A (capacity 30, not available, 95%
 * unsuitable), Lab B (capacity 20, available) and Lab C (capacity 40,
 * available) scored against a 2-4 PM request. This module produces that ranking.
 *
 * Every input is passed in — no database access, no clock reads — so the scorer
 * can be reasoned about and unit-tested in isolation.
 */

import type { LabCandidate } from "./availability";

/** Weights sum to 100 so `matchPercent` reads as a true percentage. */
const WEIGHTS = {
  capacityFit: 30,
  facilities: 25,
  availability: 20,
  department: 15,
  utilisation: 10,
} as const;

export type RecommendationInput = {
  lab: LabCandidate;
  /** Facilities the requester asked for. */
  requiredFacilities: string[];
  expectedAttendees: number;
  /** Department of the person requesting, if known. */
  userDepartmentId: string | null;
  /** Nothing else occupies the requested window. */
  isFree: boolean;
  /**
   * How heavily this lab is booked over the comparison period, 0..1.
   * Higher means busier.
   */
  utilisation: number;
};

export type Recommendation = {
  lab: LabCandidate;
  /** 0..100. */
  matchPercent: number;
  isFree: boolean;
  /** Human-readable justifications, highest-contributing first. */
  reasons: string[];
  /** Set when the lab cannot host the request at all. */
  disqualifyingReason?: string;
};

export function scoreLab(input: RecommendationInput): Recommendation {
  const { lab, requiredFacilities, expectedAttendees, userDepartmentId, isFree, utilisation } = input;
  const reasons: string[] = [];

  // A lab too small is not a candidate, whatever else it scores.
  if (lab.capacity < expectedAttendees) {
    return {
      lab,
      matchPercent: 0,
      isFree,
      reasons: [],
      disqualifyingReason: `Seats ${lab.capacity}, which is fewer than the ${expectedAttendees} attendees.`,
    };
  }

  // Capacity fit — an exact fit scores full marks; every unused seat costs a
  // point, so a 40-seat room for 5 people loses most of this component.
  const unusedSeats = lab.capacity - expectedAttendees;
  const capacityScore = Math.max(0, WEIGHTS.capacityFit - unusedSeats);
  if (unusedSeats <= 5) reasons.push("Capacity closely matches your group size");

  // Facilities — straight proportion of what was asked for.
  const matched = requiredFacilities.filter((facility) =>
    lab.facilities.some((present) => present.toLowerCase() === facility.toLowerCase()),
  );
  const facilityRatio = requiredFacilities.length === 0 ? 1 : matched.length / requiredFacilities.length;
  const facilityScore = facilityRatio * WEIGHTS.facilities;
  if (requiredFacilities.length > 0) {
    if (facilityRatio === 1) reasons.push("Has every facility you asked for");
    else if (matched.length > 0) reasons.push(`Has ${matched.length} of ${requiredFacilities.length} requested facilities`);
    else reasons.push("None of the requested facilities are available");
  }

  const availabilityScore = isFree ? WEIGHTS.availability : 0;
  if (isFree) reasons.push("Free for the whole slot");

  const departmentScore = userDepartmentId && lab.departmentId === userDepartmentId ? WEIGHTS.department : 0;
  if (departmentScore > 0) reasons.push("Belongs to your department");

  // Prefer the quieter room. Underused resources are exactly what the rulebook
  // wants surfaced, and a lightly booked lab is less likely to be disrupted.
  const clampedUtilisation = Math.min(Math.max(utilisation, 0), 1);
  const utilisationScore = (1 - clampedUtilisation) * WEIGHTS.utilisation;
  if (clampedUtilisation < 0.35) reasons.push("Lightly booked, so less likely to be disrupted");

  const matchPercent = Math.round(
    capacityScore + facilityScore + availabilityScore + departmentScore + utilisationScore,
  );

  return { lab, matchPercent, isFree, reasons };
}

/**
 * Score and rank a set of labs, best first.
 *
 * Labs that are too small are dropped rather than ranked at zero, since a
 * suggestion the requester cannot physically use is noise.
 */
export function recommendLabs(inputs: readonly RecommendationInput[]): Recommendation[] {
  return inputs
    .map(scoreLab)
    .filter((recommendation) => recommendation.disqualifyingReason === undefined)
    .sort((a, b) => {
      // A free lab always beats an occupied one, however well it scores.
      if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
      return b.matchPercent - a.matchPercent;
    });
}

export type EquipmentSuggestion = {
  equipmentId: string;
  name: string;
  availableQuantity: number;
  totalQuantity: number;
};

/**
 * Split a request that exceeds stock, as the rulebook requires:
 * "The system should either reject the request or suggest 7 units are
 * currently available."
 */
export function suggestQuantity(
  requested: number,
  available: number,
): { feasible: boolean; suggestedQuantity: number; message: string } {
  if (available >= requested) {
    return {
      feasible: true,
      suggestedQuantity: requested,
      message: `${requested} of ${available} available units reserved.`,
    };
  }

  if (available <= 0) {
    return {
      feasible: false,
      suggestedQuantity: 0,
      message: "None of this item is available for that window.",
    };
  }

  return {
    feasible: false,
    suggestedQuantity: available,
    message: `${available} units are currently available. You requested ${requested}.`,
  };
}
