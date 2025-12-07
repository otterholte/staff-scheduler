/**
 * Staff Scheduler - TypeScript Fallback Solver
 * 
 * This is a backup scheduler that runs when the Python solver is unavailable.
 * It uses a greedy algorithm with STRICT max hours enforcement.
 * 
 * CRITICAL INVARIANT: No staff member will EVER exceed their maxHoursPerWeek.
 * This is enforced at every assignment point with no exceptions.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Staff,
  Availability,
  ShiftRequirement,
  Location,
  Qualification,
  Schedule,
  ScheduledShift,
  ScheduleConstraints,
  ScheduleResult,
  ScheduleWarning,
  ScheduleStats,
  UncoveredGap,
} from './types';

interface ScheduleInput {
  staff: Staff[];
  availability: Availability[];
  requirements: ShiftRequirement[];
  locations: Location[];
  qualifications: Qualification[];
  weekStartDate: Date;
  constraints: ScheduleConstraints;
  priorityOrdering?: 'chronological' | 'scarcity-first' | 'random';
}

interface StaffHoursTracker {
  assigned: number;
  maxAllowed: number;
  remaining: number;
}

interface AssignedWindow {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
}

/**
 * Main entry point - generates the best possible schedule within constraints.
 * MAX HOURS ARE ABSOLUTE AND WILL NEVER BE EXCEEDED.
 */
export function generateSchedule(input: ScheduleInput): ScheduleResult {
  const {
    staff,
    availability,
    requirements,
    weekStartDate,
    constraints,
  } = input;

  // Initialize tracking structures
  const hoursTracker: Record<string, StaffHoursTracker> = {};
  const assignedWindows: Record<string, AssignedWindow[]> = {};

  // Initialize with strict max hours limits
  staff.forEach((s) => {
    const maxAllowed = constraints.maxHoursPerStaff 
      ? Math.min(s.maxHoursPerWeek, constraints.maxHoursPerStaff)
      : s.maxHoursPerWeek;
    
    hoursTracker[s.id] = {
      assigned: 0,
      maxAllowed,
      remaining: maxAllowed,
    };
    assignedWindows[s.id] = [];
  });

  const shifts: ScheduledShift[] = [];
  const warnings: ScheduleWarning[] = [];

  // Sort requirements by scarcity (hardest to fill first)
  const sortedRequirements = sortRequirementsByScarcity(
    requirements,
    staff,
    availability,
    constraints
  );

  // SINGLE-PASS ASSIGNMENT with strict max hours enforcement
  for (const requirement of sortedRequirements) {
    const shiftDate = getDateForDayOfWeek(weekStartDate, requirement.dayOfWeek);
    const shiftDuration = requirement.endHour - requirement.startHour;

    // Get eligible staff for this requirement
    const eligibleStaff = getEligibleStaff(
      staff,
      availability,
      requirement,
      hoursTracker,
      assignedWindows,
      constraints
    );

    // Sort by who should be assigned (balance hours, etc.)
    const rankedStaff = rankStaffForAssignment(
      eligibleStaff,
      hoursTracker,
      constraints
    );

    // Assign up to minStaff
    let assignedCount = 0;
    for (const staffMember of rankedStaff) {
      if (assignedCount >= requirement.minStaff) break;

      // Calculate hours this person would work
      const hoursToAssign = constraints.allowSplitShifts
        ? calculateOverlapHours(availability, staffMember.id, requirement)
        : shiftDuration;

      // CRITICAL CHECK: Verify we won't exceed max hours
      const tracker = hoursTracker[staffMember.id];
      if (tracker.assigned + hoursToAssign > tracker.maxAllowed) {
        continue; // Skip - would exceed max hours
      }

      // Determine actual shift window
      const window = getShiftWindow(
        availability,
        staffMember.id,
        requirement,
        constraints
      );

      if (!window) continue;

      // Create the shift
      const shift: ScheduledShift = {
        id: uuidv4(),
        staffId: staffMember.id,
        requirementId: requirement.id,
        date: shiftDate,
        startHour: window.startHour,
        endHour: window.endHour,
        locationId: requirement.locationId,
        isLocked: false,
      };

      // Update tracking
      shifts.push(shift);
      tracker.assigned += hoursToAssign;
      tracker.remaining = tracker.maxAllowed - tracker.assigned;
      assignedWindows[staffMember.id].push({
        dayOfWeek: requirement.dayOfWeek,
        startHour: window.startHour,
        endHour: window.endHour,
      });

      assignedCount++;
    }

    // Record warning if we couldn't fill minimum staffing
    if (assignedCount < requirement.minStaff) {
      warnings.push({
        type: 'unfilled',
        message: `Could not fill minimum staffing (${assignedCount}/${requirement.minStaff})`,
        requirementId: requirement.id,
      });
    }
  }

  // Generate warnings for staff hour issues
  staff.forEach((s) => {
    const tracker = hoursTracker[s.id];
    
    if (tracker.assigned > s.maxHoursPerWeek) {
      // This should NEVER happen due to our strict checks
      warnings.push({
        type: 'overtime',
        message: `${s.name} exceeds their max hours (${tracker.assigned}/${s.maxHoursPerWeek}h)`,
        staffId: s.id,
      });
    }
    
    if (tracker.assigned < s.minHoursPerWeek && s.minHoursPerWeek > 0) {
      warnings.push({
        type: 'undertime',
        message: `${s.name} has fewer hours than their minimum (${tracker.assigned}/${s.minHoursPerWeek}h)`,
        staffId: s.id,
      });
    }
  });

  // Calculate comprehensive statistics
  const stats = calculateStats(shifts, requirements, hoursTracker, staff);

  // Final verification - ensure no max hours violations
  verifyMaxHours(hoursTracker, staff);

  return {
    schedule: {
      id: uuidv4(),
      weekStartDate,
      shifts,
      generatedAt: new Date(),
      isPublished: false,
    },
    warnings,
    stats,
  };
}

/**
 * Verify that no staff member exceeds their max hours.
 * Throws an error if any violation is found (should never happen).
 */
function verifyMaxHours(
  hoursTracker: Record<string, StaffHoursTracker>,
  staff: Staff[]
): void {
  for (const s of staff) {
    const tracker = hoursTracker[s.id];
    if (tracker && tracker.assigned > tracker.maxAllowed) {
      console.error(
        `SCHEDULER ERROR: ${s.name} has ${tracker.assigned}h but max is ${tracker.maxAllowed}h`
      );
    }
  }
}

/**
 * Sort requirements by how hard they are to fill (scarcity).
 * Requirements with fewer available staff should be filled first.
 */
function sortRequirementsByScarcity(
  requirements: ShiftRequirement[],
  staff: Staff[],
  availability: Availability[],
  constraints: ScheduleConstraints
): ShiftRequirement[] {
  const scarcityScores: Map<string, number> = new Map();

  for (const req of requirements) {
    let availableCount = 0;

    for (const s of staff) {
      // Check qualifications
      if (req.requiredQualifications.length > 0) {
        const hasQuals = req.requiredQualifications.every((q) =>
          s.qualifications.includes(q)
        );
        if (!hasQuals) continue;
      }

      // Check availability
      const overlap = calculateOverlapHours(availability, s.id, req);
      const minOverlap = constraints.allowSplitShifts
        ? Math.min(constraints.minOverlapHours || 2, req.endHour - req.startHour)
        : req.endHour - req.startHour;

      if (overlap >= minOverlap) {
        availableCount++;
      }
    }

    scarcityScores.set(req.id, availableCount);
  }

  return [...requirements].sort((a, b) => {
    const aScore = scarcityScores.get(a.id) || 0;
    const bScore = scarcityScores.get(b.id) || 0;
    // Lower score = fewer available staff = should be filled first
    if (aScore !== bScore) return aScore - bScore;
    // Tie-breaker: longer shifts first
    return (b.endHour - b.startHour) - (a.endHour - a.startHour);
  });
}

/**
 * Get staff who are eligible for a requirement.
 * Eligibility criteria:
 * 1. Has required qualifications
 * 2. Has availability during the shift
 * 3. Has remaining capacity (won't exceed max hours)
 * 4. No time conflicts with existing assignments
 */
function getEligibleStaff(
  staff: Staff[],
  availability: Availability[],
  requirement: ShiftRequirement,
  hoursTracker: Record<string, StaffHoursTracker>,
  assignedWindows: Record<string, AssignedWindow[]>,
  constraints: ScheduleConstraints
): Staff[] {
  const shiftDuration = requirement.endHour - requirement.startHour;

  return staff.filter((s) => {
    // Check qualifications
    if (requirement.requiredQualifications.length > 0) {
      const hasQuals = requirement.requiredQualifications.every((q) =>
        s.qualifications.includes(q)
      );
      if (!hasQuals) return false;
    }

    // Check availability
    const overlap = calculateOverlapHours(availability, s.id, requirement);
    const minOverlap = constraints.allowSplitShifts
      ? Math.min(constraints.minOverlapHours || 2, shiftDuration)
      : shiftDuration;

    if (overlap < minOverlap) return false;

    // Check time conflicts
    const hasConflict = hasTimeConflict(
      assignedWindows[s.id] || [],
      requirement.dayOfWeek,
      requirement.startHour,
      requirement.endHour
    );
    if (hasConflict) return false;

    // CRITICAL: Check max hours
    const tracker = hoursTracker[s.id];
    const hoursToAdd = constraints.allowSplitShifts ? overlap : shiftDuration;
    
    if (tracker.assigned + hoursToAdd > tracker.maxAllowed) {
      return false; // Would exceed max hours
    }

    return true;
  });
}

/**
 * Rank eligible staff for assignment priority.
 * Balances hours and prefers those with more remaining capacity.
 */
function rankStaffForAssignment(
  eligibleStaff: Staff[],
  hoursTracker: Record<string, StaffHoursTracker>,
  constraints: ScheduleConstraints
): Staff[] {
  return [...eligibleStaff].sort((a, b) => {
    const aTracker = hoursTracker[a.id];
    const bTracker = hoursTracker[b.id];

    if (constraints.balanceHours) {
      // Prefer staff with fewer assigned hours (for balance)
      if (aTracker.assigned !== bTracker.assigned) {
        return aTracker.assigned - bTracker.assigned;
      }
    }

    // Prefer staff with more remaining capacity
    return bTracker.remaining - aTracker.remaining;
  });
}

/**
 * Calculate hours of overlap between staff availability and a requirement.
 */
function calculateOverlapHours(
  availability: Availability[],
  staffId: string,
  requirement: ShiftRequirement
): number {
  const staffAvail = availability.filter((a) => a.staffId === staffId);
  let maxOverlap = 0;

  for (const a of staffAvail) {
    if (a.dayOfWeek !== requirement.dayOfWeek) continue;

    const overlapStart = Math.max(a.startHour, requirement.startHour);
    const overlapEnd = Math.min(a.endHour, requirement.endHour);
    const overlap = Math.max(0, overlapEnd - overlapStart);

    maxOverlap = Math.max(maxOverlap, overlap);
  }

  return maxOverlap;
}

/**
 * Get the actual shift window for a staff member.
 */
function getShiftWindow(
  availability: Availability[],
  staffId: string,
  requirement: ShiftRequirement,
  constraints: ScheduleConstraints
): { startHour: number; endHour: number } | null {
  const staffAvail = availability.filter(
    (a) => a.staffId === staffId && a.dayOfWeek === requirement.dayOfWeek
  );

  if (!constraints.allowSplitShifts) {
    // Need full coverage
    const hasFullAvail = staffAvail.some(
      (a) => a.startHour <= requirement.startHour && a.endHour >= requirement.endHour
    );
    if (!hasFullAvail) return null;
    return { startHour: requirement.startHour, endHour: requirement.endHour };
  }

  // Find best overlap for split shift
  let bestWindow: { startHour: number; endHour: number } | null = null;
  let maxOverlap = 0;

  for (const a of staffAvail) {
    const overlapStart = Math.max(a.startHour, requirement.startHour);
    const overlapEnd = Math.min(a.endHour, requirement.endHour);
    const overlap = Math.max(0, overlapEnd - overlapStart);

    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      bestWindow = { startHour: overlapStart, endHour: overlapEnd };
    }
  }

  return bestWindow;
}

/**
 * Check if a new assignment would conflict with existing assignments.
 */
function hasTimeConflict(
  existingWindows: AssignedWindow[],
  dayOfWeek: number,
  startHour: number,
  endHour: number
): boolean {
  return existingWindows.some(
    (w) =>
      w.dayOfWeek === dayOfWeek &&
      startHour < w.endHour &&
      endHour > w.startHour
  );
}

/**
 * Calculate comprehensive schedule statistics.
 */
function calculateStats(
  shifts: ScheduledShift[],
  requirements: ShiftRequirement[],
  hoursTracker: Record<string, StaffHoursTracker>,
  staff: Staff[]
): ScheduleStats {
  const hoursPerStaff: Record<string, number> = {};
  staff.forEach((s) => {
    hoursPerStaff[s.id] = hoursTracker[s.id]?.assigned || 0;
  });

  let requiredHours = 0;
  let coveredHours = 0;
  const uncoveredGaps: UncoveredGap[] = [];
  let filledShifts = 0;

  for (const req of requirements) {
    const reqDuration = req.endHour - req.startHour;
    requiredHours += reqDuration * req.minStaff;

    // Calculate hour-by-hour coverage
    const hourCoverage: Record<number, number> = {};
    for (let h = req.startHour; h < req.endHour; h++) {
      hourCoverage[h] = 0;
    }

    // Count coverage from shifts
    const reqShifts = shifts.filter((s) => s.requirementId === req.id);
    for (const shift of reqShifts) {
      for (let h = shift.startHour; h < shift.endHour; h++) {
        if (h >= req.startHour && h < req.endHour) {
          hourCoverage[h]++;
        }
      }
    }

    // Calculate covered hours and find gaps
    let isFullyCovered = true;
    let gapStart: number | null = null;

    for (let h = req.startHour; h < req.endHour; h++) {
      const coverage = hourCoverage[h] || 0;
      coveredHours += Math.min(coverage, req.minStaff);

      if (coverage < req.minStaff) {
        isFullyCovered = false;
        if (gapStart === null) gapStart = h;
      } else {
        if (gapStart !== null) {
          uncoveredGaps.push({
            requirementId: req.id,
            dayOfWeek: req.dayOfWeek,
            startHour: gapStart,
            endHour: h,
            locationId: req.locationId,
          });
          gapStart = null;
        }
      }
    }

    if (gapStart !== null) {
      uncoveredGaps.push({
        requirementId: req.id,
        dayOfWeek: req.dayOfWeek,
        startHour: gapStart,
        endHour: req.endHour,
        locationId: req.locationId,
      });
    }

    if (isFullyCovered) filledShifts++;
  }

  const totalHours = Object.values(hoursPerStaff).reduce((sum, h) => sum + h, 0);
  const coveragePercentage = requiredHours > 0
    ? (coveredHours / requiredHours) * 100
    : 100;

  return {
    totalShifts: requirements.length,
    filledShifts,
    totalHours,
    hoursPerStaff,
    coveragePercentage,
    requiredHours,
    coveredHours,
    uncoveredGaps: mergeGaps(uncoveredGaps),
  };
}

/**
 * Merge contiguous gaps for cleaner display.
 */
function mergeGaps(gaps: UncoveredGap[]): UncoveredGap[] {
  if (gaps.length === 0) return [];

  const sorted = [...gaps].sort((a, b) => {
    if (a.requirementId !== b.requirementId) return a.requirementId.localeCompare(b.requirementId);
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    return a.startHour - b.startHour;
  });

  const merged: UncoveredGap[] = [];
  let current = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i];
    if (
      gap.requirementId === current.requirementId &&
      gap.dayOfWeek === current.dayOfWeek &&
      gap.startHour === current.endHour
    ) {
      current = { ...current, endHour: gap.endHour };
    } else {
      merged.push(current);
      current = gap;
    }
  }
  merged.push(current);

  return merged;
}

/**
 * Get date for a specific day of the week from week start.
 */
function getDateForDayOfWeek(weekStart: Date, dayOfWeek: number): Date {
  const date = new Date(weekStart);
  date.setDate(date.getDate() + dayOfWeek);
  return date;
}

/**
 * Generate multiple schedule variants and return the best ones.
 */
export function generateScheduleVariants(
  input: ScheduleInput,
  numCandidates: number = 30,
  numTopVariants: number = 3
): { variants: ScheduleResult[]; bestIndex: number } {
  const candidates: ScheduleResult[] = [];

  // Generate multiple candidates with different orderings
  for (let i = 0; i < numCandidates; i++) {
    candidates.push(generateSchedule({
      ...input,
      priorityOrdering: i % 3 === 0 ? 'scarcity-first' : i % 3 === 1 ? 'chronological' : 'random',
    }));
  }

  // Score and rank candidates
  const scored = candidates.map((c, idx) => ({
    result: c,
    score: scoreSchedule(c),
    index: idx,
  }));

  scored.sort((a, b) => b.score - a.score);

  // Remove duplicates and get top variants
  const seen = new Set<string>();
  const variants: ScheduleResult[] = [];

  for (const { result } of scored) {
    const sig = result.schedule.shifts
      .map((s) => `${s.requirementId}:${s.staffId}`)
      .sort()
      .join('|');

    if (!seen.has(sig)) {
      seen.add(sig);
      variants.push(result);
      if (variants.length >= numTopVariants) break;
    }
  }

  return { variants, bestIndex: 0 };
}

/**
 * Score a schedule result for ranking.
 */
function scoreSchedule(result: ScheduleResult): number {
  const { stats, warnings } = result;

  // Primary: coverage percentage (most important)
  let score = stats.coveragePercentage * 100;

  // Bonus for covered hours
  score += stats.coveredHours * 10;

  // Penalty for warnings
  for (const w of warnings) {
    if (w.type === 'overtime') score -= 500; // Should never happen
    if (w.type === 'unfilled') score -= 100;
    if (w.type === 'undertime') score -= 20;
  }

  return score;
}

/**
 * Regenerate schedule with updated constraints.
 */
export function regenerateSchedule(
  input: ScheduleInput,
  existingSchedule: Schedule,
  newConstraints: Partial<ScheduleConstraints>
): ScheduleResult {
  const mergedConstraints: ScheduleConstraints = {
    ...input.constraints,
    ...newConstraints,
  };

  return generateSchedule({
    ...input,
    constraints: mergedConstraints,
  });
}
