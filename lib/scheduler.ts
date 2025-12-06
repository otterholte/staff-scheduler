// Core Scheduling Algorithm
// Uses constraint satisfaction with greedy assignment and balancing
// Generates multiple candidates and selects top options by coverage

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
  // Optional ordering strategy to explore different assignment spaces
  priorityOrdering?: RequirementOrdering;
}

type RequirementOrdering =
  | 'chronological'
  | 'longest-first'
  | 'min-staff-first'
  | 'scarcity-first'
  | 'random';

interface StaffScore {
  staffId: string;
  score: number;
  currentHours: number;
  isQualified: boolean;
  isAvailable: boolean;
  prefersSlot: boolean;
  overlapHours: number; // Hours of overlap with the shift
}

export function generateSchedule(input: ScheduleInput): ScheduleResult {
  const {
    staff,
    availability,
    requirements,
    weekStartDate,
    constraints,
    priorityOrdering = 'chronological',
  } = input;

  const shifts: ScheduledShift[] = [];
  const warnings: ScheduleWarning[] = [];
  const hoursPerStaff: Record<string, number> = {};
  const assignedWindows: Record<string, AssignedWindow[]> = {};

  // Initialize hours tracking
  staff.forEach((s) => {
    hoursPerStaff[s.id] = 0;
    assignedWindows[s.id] = [];
  });

  // ============================================================
  // NEW SCARCITY-BASED ALGORITHM
  // ============================================================
  
  // PHASE 1: Analyze scarcity - which hours have the fewest available staff?
  const scarcityMap = analyzeScarcity(requirements, staff, availability, constraints);
  
  // PHASE 2: Sort requirements by scarcity (hardest to fill first)
  const sortedByScarcity = [...requirements].sort((a, b) => {
    const aScarcity = scarcityMap.get(a.id) || 0;
    const bScarcity = scarcityMap.get(b.id) || 0;
    // Lower scarcity = fewer available staff = should be filled first
    if (aScarcity !== bScarcity) return aScarcity - bScarcity;
    // Tie-breaker: longer shifts first
    return (b.endHour - b.startHour) - (a.endHour - a.startHour);
  });
  
  // Add some randomization based on priorityOrdering to create variants
  const sortedRequirements = priorityOrdering === 'random' 
    ? shuffleArray(sortedByScarcity)
    : sortedByScarcity;

  // PHASE 3: Assign staff to requirements, prioritizing those with MOST overall availability
  // (Save specialized/limited availability staff for the scarce slots)
  for (const requirement of sortedRequirements) {
    const shiftDuration = requirement.endHour - requirement.startHour;
    const shiftDate = getDateForDayOfWeek(weekStartDate, requirement.dayOfWeek);

    // Get staff who CAN work this shift
    const eligibleStaff = getEligibleStaffStrict(
      staff,
      availability,
      requirement,
      hoursPerStaff,
      constraints,
      assignedWindows
    );

    // Score staff: prefer those with MORE total weekly availability
    // (so limited-availability staff are saved for scarce slots)
    const scoredStaff = scoreStaffByAvailability(
      eligibleStaff,
      availability,
      requirement,
      hoursPerStaff,
      constraints
    );

    // Assign staff up to minStaff (we need at least this many)
    let assignedCount = 0;
    for (const scored of scoredStaff) {
      if (assignedCount >= requirement.minStaff) break;

      const staffMember = staff.find((s) => s.id === scored.staffId);
      if (!staffMember) continue;

      // Calculate actual hours this person would work
      const actualHours = scored.overlapHours;

      // HARD STOP: Never exceed max hours
      if (hoursPerStaff[scored.staffId] + actualHours > staffMember.maxHoursPerWeek) {
        continue;
      }

      // Create the shift
      const shift: ScheduledShift = {
        id: uuidv4(),
        staffId: scored.staffId,
        requirementId: requirement.id,
        date: shiftDate,
        startHour: requirement.startHour,
        endHour: requirement.endHour,
        locationId: requirement.locationId,
        isLocked: false,
      };

      shifts.push(shift);
      hoursPerStaff[scored.staffId] += actualHours;
      assignedWindows[scored.staffId].push({
        dayOfWeek: requirement.dayOfWeek,
        startHour: scored.windowStart,
        endHour: scored.windowEnd,
      });
      assignedCount++;
    }

    if (assignedCount < requirement.minStaff) {
      warnings.push({
        type: 'unfilled',
        message: `Could not fill minimum staffing (${assignedCount}/${requirement.minStaff})`,
        requirementId: requirement.id,
      });
    }
  }

  // PHASE 4: Swap optimization - try to move staff from over-covered to under-covered
  swapToFillGaps(
    shifts,
    staff,
    availability,
    requirements,
    hoursPerStaff,
    assignedWindows,
    constraints,
    weekStartDate
  );

  // PHASE 5: Final attempt - assign anyone with remaining capacity to remaining gaps
  fillRemainingGaps(
    shifts,
    staff,
    availability,
    requirements,
    hoursPerStaff,
    assignedWindows,
    constraints,
    weekStartDate
  );

  // Check for undertime warnings
  staff.forEach((s) => {
    if (hoursPerStaff[s.id] < s.minHoursPerWeek && s.minHoursPerWeek > 0) {
      warnings.push({
        type: 'undertime',
        message: `${s.name} has fewer hours than their minimum (${hoursPerStaff[s.id]}/${s.minHoursPerWeek}h)`,
        staffId: s.id,
      });
    }
  });

  // Calculate TRUE hour-based coverage stats
  let totalRequiredHours = 0;
  let totalCoveredHours = 0;
  const uncoveredGaps: UncoveredGap[] = [];
  let shiftsFullyCovered = 0;

  for (const requirement of sortedRequirements) {
    const reqDuration = requirement.endHour - requirement.startHour;
    const reqHoursNeeded = reqDuration * requirement.minStaff;
    totalRequiredHours += reqHoursNeeded;

    // Get all shifts for this requirement
    const shiftsForReq = shifts.filter((s) => s.requirementId === requirement.id);

    // Track coverage for each hour
    const hourCoverage: Record<number, number> = {};
    for (let h = requirement.startHour; h < requirement.endHour; h++) {
      hourCoverage[h] = 0;
    }

    // Count coverage per hour
    shiftsForReq.forEach((shift) => {
      const staffAvailability = availability.filter((a) => a.staffId === shift.staffId);
      let actualStart = requirement.startHour;
      let actualEnd = requirement.endHour;

      if (constraints.allowSplitShifts) {
        const overlapHours = calculateOverlapHours(
          staffAvailability,
          requirement.dayOfWeek,
          requirement.startHour,
          requirement.endHour
        );
        // Find the actual overlap range
        let bestOverlap = { start: requirement.startHour, end: requirement.endHour };
        let maxOverlap = 0;
        for (const a of staffAvailability) {
          if (a.dayOfWeek !== requirement.dayOfWeek) continue;
          const overlapStart = Math.max(a.startHour, requirement.startHour);
          const overlapEnd = Math.min(a.endHour, requirement.endHour);
          const overlap = Math.max(0, overlapEnd - overlapStart);
          if (overlap > maxOverlap) {
            maxOverlap = overlap;
            bestOverlap = { start: overlapStart, end: overlapEnd };
          }
        }
        if (maxOverlap > 0) {
          actualStart = bestOverlap.start;
          actualEnd = bestOverlap.end;
        }
      }

      for (let h = actualStart; h < actualEnd; h++) {
        if (h >= requirement.startHour && h < requirement.endHour) {
          hourCoverage[h] = (hourCoverage[h] || 0) + 1;
        }
      }
    });

    // Calculate covered staff-hours and find gaps
    let reqCoveredHours = 0;
    let isFullyCovered = true;
    let gapStart: number | null = null;

    for (let h = requirement.startHour; h < requirement.endHour; h++) {
      const coverage = hourCoverage[h] || 0;
      reqCoveredHours += Math.min(coverage, requirement.minStaff);

      if (coverage < requirement.minStaff) {
        isFullyCovered = false;
        if (gapStart === null) {
          gapStart = h;
        }
      } else {
        if (gapStart !== null) {
          uncoveredGaps.push({
            requirementId: requirement.id,
            dayOfWeek: requirement.dayOfWeek,
            startHour: gapStart,
            endHour: h,
            locationId: requirement.locationId,
          });
          gapStart = null;
        }
      }
    }

    if (gapStart !== null) {
      uncoveredGaps.push({
        requirementId: requirement.id,
        dayOfWeek: requirement.dayOfWeek,
        startHour: gapStart,
        endHour: requirement.endHour,
        locationId: requirement.locationId,
      });
    }

    totalCoveredHours += reqCoveredHours;
    if (isFullyCovered) {
      shiftsFullyCovered++;
    }
  }

  const totalShifts = requirements.length;
  const filledShifts = shiftsFullyCovered;
  const totalHours = Object.values(hoursPerStaff).reduce((sum, h) => sum + h, 0);
  const coveragePercentage = totalRequiredHours > 0
    ? (totalCoveredHours / totalRequiredHours) * 100
    : 100;

  const stats: ScheduleStats = {
    totalShifts,
    filledShifts,
    totalHours,
    hoursPerStaff,
    coveragePercentage,
    requiredHours: totalRequiredHours,
    coveredHours: totalCoveredHours,
    uncoveredGaps,
  };

  const schedule: Schedule = {
    id: uuidv4(),
    weekStartDate,
    shifts,
    generatedAt: new Date(),
    isPublished: false,
  };

  return { schedule, warnings, stats };
}

function getDateForDayOfWeek(weekStart: Date, dayOfWeek: number): Date {
  const date = new Date(weekStart);
  date.setDate(date.getDate() + dayOfWeek);
  return date;
}

// ============================================================
// SCARCITY-BASED SCHEDULING HELPERS
// ============================================================

// Analyze how scarce each requirement is (fewer available staff = more scarce)
function analyzeScarcity(
  requirements: ShiftRequirement[],
  staff: Staff[],
  availability: Availability[],
  constraints: ScheduleConstraints
): Map<string, number> {
  const scarcityMap = new Map<string, number>();
  
  for (const req of requirements) {
    let availableCount = 0;
    
    for (const s of staff) {
      // Check qualifications
      if (req.requiredQualifications.length > 0) {
        const hasQuals = req.requiredQualifications.every((qId) =>
          s.qualifications.includes(qId)
        );
        if (!hasQuals) continue;
      }
      
      // Check availability
      const staffAvail = availability.filter((a) => a.staffId === s.id);
      const overlapHours = calculateOverlapHours(
        staffAvail,
        req.dayOfWeek,
        req.startHour,
        req.endHour
      );
      
      const minOverlap = constraints.allowSplitShifts 
        ? (constraints.minOverlapHours || 2)
        : (req.endHour - req.startHour);
      
      if (overlapHours >= minOverlap) {
        availableCount++;
      }
    }
    
    scarcityMap.set(req.id, availableCount);
  }
  
  return scarcityMap;
}

// Get eligible staff with STRICT max hours checking
function getEligibleStaffStrict(
  staff: Staff[],
  availability: Availability[],
  requirement: ShiftRequirement,
  hoursPerStaff: Record<string, number>,
  constraints: ScheduleConstraints,
  assignedWindows: Record<string, AssignedWindow[]>
): Staff[] {
  return staff.filter((s) => {
    // Check qualifications
    if (requirement.requiredQualifications.length > 0) {
      const hasQuals = requirement.requiredQualifications.every((qId) =>
        s.qualifications.includes(qId)
      );
      if (!hasQuals) return false;
    }

    // Check availability and calculate overlap
    const staffAvail = availability.filter((a) => a.staffId === s.id);
    const overlapHours = calculateOverlapHours(
      staffAvail,
      requirement.dayOfWeek,
      requirement.startHour,
      requirement.endHour
    );
    
    const shiftDuration = requirement.endHour - requirement.startHour;
    const minOverlap = constraints.allowSplitShifts 
      ? Math.min(constraints.minOverlapHours || 2, shiftDuration)
      : shiftDuration;
    
    if (overlapHours < minOverlap) return false;

    // Check for time conflicts
    const hasConflict = hasAssignmentConflict(
      assignedWindows,
      s.id,
      requirement.dayOfWeek,
      requirement.startHour,
      requirement.endHour
    );
    if (hasConflict) return false;

    // STRICT: Check if assigning would exceed max hours
    const currentHours = hoursPerStaff[s.id] || 0;
    const hoursToAdd = constraints.allowSplitShifts ? overlapHours : shiftDuration;
    
    if (currentHours + hoursToAdd > s.maxHoursPerWeek) {
      return false;
    }

    return true;
  });
}

interface StaffAvailabilityScore {
  staffId: string;
  totalWeeklyAvailability: number;
  overlapHours: number;
  windowStart: number;
  windowEnd: number;
  remainingCapacity: number;
}

// Score staff by their TOTAL weekly availability (more availability = higher score)
// This helps save limited-availability staff for the hardest-to-fill slots
function scoreStaffByAvailability(
  eligibleStaff: Staff[],
  availability: Availability[],
  requirement: ShiftRequirement,
  hoursPerStaff: Record<string, number>,
  constraints: ScheduleConstraints
): StaffAvailabilityScore[] {
  return eligibleStaff
    .map((s) => {
      // Calculate total weekly availability
      const staffAvail = availability.filter((a) => a.staffId === s.id);
      let totalWeeklyAvailability = 0;
      
      for (const a of staffAvail) {
        totalWeeklyAvailability += (a.endHour - a.startHour);
      }
      
      // Calculate overlap with THIS specific requirement
      const overlapHours = calculateOverlapHours(
        staffAvail,
        requirement.dayOfWeek,
        requirement.startHour,
        requirement.endHour
      );
      
      // Find the actual window
      let windowStart = requirement.startHour;
      let windowEnd = requirement.endHour;
      
      if (constraints.allowSplitShifts) {
        let maxOverlap = 0;
        for (const a of staffAvail) {
          if (a.dayOfWeek !== requirement.dayOfWeek) continue;
          const overlapStart = Math.max(a.startHour, requirement.startHour);
          const overlapEnd = Math.min(a.endHour, requirement.endHour);
          const overlap = Math.max(0, overlapEnd - overlapStart);
          if (overlap > maxOverlap) {
            maxOverlap = overlap;
            windowStart = overlapStart;
            windowEnd = overlapEnd;
          }
        }
      }
      
      const currentHours = hoursPerStaff[s.id] || 0;
      const remainingCapacity = s.maxHoursPerWeek - currentHours;
      
      return {
        staffId: s.id,
        totalWeeklyAvailability,
        overlapHours: constraints.allowSplitShifts ? overlapHours : (requirement.endHour - requirement.startHour),
        windowStart,
        windowEnd,
        remainingCapacity,
      };
    })
    // Sort by: remaining capacity first (who can work more), then total availability
    .sort((a, b) => {
      // Prefer staff with more remaining capacity
      if (b.remainingCapacity !== a.remainingCapacity) {
        return b.remainingCapacity - a.remainingCapacity;
      }
      // Then prefer staff with more overall availability (save scarce staff for later)
      return b.totalWeeklyAvailability - a.totalWeeklyAvailability;
    });
}

// Swap staff from over-covered shifts to fill gaps
function swapToFillGaps(
  shifts: ScheduledShift[],
  staff: Staff[],
  availability: Availability[],
  requirements: ShiftRequirement[],
  hoursPerStaff: Record<string, number>,
  assignedWindows: Record<string, AssignedWindow[]>,
  constraints: ScheduleConstraints,
  weekStartDate: Date
): void {
  // Find requirements with gaps
  const requirementsWithGaps: ShiftRequirement[] = [];
  const requirementsOverCovered: ShiftRequirement[] = [];
  
  for (const req of requirements) {
    const shiftsForReq = shifts.filter((s) => s.requirementId === req.id);
    const coverageCount = shiftsForReq.length;
    
    if (coverageCount < req.minStaff) {
      requirementsWithGaps.push(req);
    } else if (coverageCount > req.minStaff) {
      requirementsOverCovered.push(req);
    }
  }
  
  // Try to move staff from over-covered to under-covered
  for (const gapReq of requirementsWithGaps) {
    const gapShifts = shifts.filter((s) => s.requirementId === gapReq.id);
    const needed = gapReq.minStaff - gapShifts.length;
    
    if (needed <= 0) continue;
    
    for (const overReq of requirementsOverCovered) {
      const overShifts = shifts.filter((s) => s.requirementId === overReq.id && !s.isLocked);
      const excess = overShifts.length - overReq.minStaff;
      
      if (excess <= 0) continue;
      
      // Try to move someone from overReq to gapReq
      for (const shift of overShifts) {
        const staffMember = staff.find((s) => s.id === shift.staffId);
        if (!staffMember) continue;
        
        // Check if this person can work the gap requirement
        // Check qualifications
        if (gapReq.requiredQualifications.length > 0) {
          const hasQuals = gapReq.requiredQualifications.every((qId) =>
            staffMember.qualifications.includes(qId)
          );
          if (!hasQuals) continue;
        }
        
        // Check availability for gap requirement
        const staffAvail = availability.filter((a) => a.staffId === staffMember.id);
        const gapOverlap = calculateOverlapHours(
          staffAvail,
          gapReq.dayOfWeek,
          gapReq.startHour,
          gapReq.endHour
        );
        
        const gapDuration = gapReq.endHour - gapReq.startHour;
        const minOverlap = constraints.allowSplitShifts 
          ? Math.min(constraints.minOverlapHours || 2, gapDuration)
          : gapDuration;
        
        if (gapOverlap < minOverlap) continue;
        
        // Check for time conflicts (excluding current shift)
        const otherWindows = (assignedWindows[staffMember.id] || []).filter(
          (w) => w.dayOfWeek !== overReq.dayOfWeek
        );
        const hasConflict = otherWindows.some(
          (w) => w.dayOfWeek === gapReq.dayOfWeek &&
            gapReq.startHour < w.endHour &&
            gapReq.endHour > w.startHour
        );
        if (hasConflict) continue;
        
        // Check max hours after swap
        const overlapWithOver = calculateOverlapHours(
          staffAvail,
          overReq.dayOfWeek,
          overReq.startHour,
          overReq.endHour
        );
        const hoursAfterSwap = (hoursPerStaff[staffMember.id] || 0) - overlapWithOver + gapOverlap;
        
        if (hoursAfterSwap > staffMember.maxHoursPerWeek) continue;
        
        // Already assigned to gap requirement?
        if (shifts.some((s) => s.requirementId === gapReq.id && s.staffId === staffMember.id)) {
          continue;
        }
        
        // Do the swap!
        // Remove from over-covered
        const shiftIndex = shifts.indexOf(shift);
        if (shiftIndex >= 0) {
          shifts.splice(shiftIndex, 1);
          hoursPerStaff[staffMember.id] -= overlapWithOver;
          
          // Update assigned windows
          assignedWindows[staffMember.id] = (assignedWindows[staffMember.id] || []).filter(
            (w) => w.dayOfWeek !== overReq.dayOfWeek
          );
        }
        
        // Add to gap requirement
        const newShift: ScheduledShift = {
          id: uuidv4(),
          staffId: staffMember.id,
          requirementId: gapReq.id,
          date: getDateForDayOfWeek(weekStartDate, gapReq.dayOfWeek),
          startHour: gapReq.startHour,
          endHour: gapReq.endHour,
          locationId: gapReq.locationId,
          isLocked: false,
        };
        
        shifts.push(newShift);
        hoursPerStaff[staffMember.id] += gapOverlap;
        
        // Add new window
        let windowStart = gapReq.startHour;
        let windowEnd = gapReq.endHour;
        if (constraints.allowSplitShifts) {
          for (const a of staffAvail) {
            if (a.dayOfWeek === gapReq.dayOfWeek) {
              windowStart = Math.max(a.startHour, gapReq.startHour);
              windowEnd = Math.min(a.endHour, gapReq.endHour);
              break;
            }
          }
        }
        assignedWindows[staffMember.id] = assignedWindows[staffMember.id] || [];
        assignedWindows[staffMember.id].push({
          dayOfWeek: gapReq.dayOfWeek,
          startHour: windowStart,
          endHour: windowEnd,
        });
        
        break; // Move to next gap requirement
      }
    }
  }
}

// Final pass: fill HOUR-BY-HOUR gaps with whoever has capacity
// This is critical when staff have partial availability - we need multiple people
// to cover different portions of a shift
function fillRemainingGaps(
  shifts: ScheduledShift[],
  staff: Staff[],
  availability: Availability[],
  requirements: ShiftRequirement[],
  hoursPerStaff: Record<string, number>,
  assignedWindows: Record<string, AssignedWindow[]>,
  constraints: ScheduleConstraints,
  weekStartDate: Date
): void {
  // Keep iterating until no more progress can be made
  let madeProgress = true;
  let iterations = 0;
  const maxIterations = 20; // Safety limit
  
  while (madeProgress && iterations < maxIterations) {
    madeProgress = false;
    iterations++;
    
    for (const req of requirements) {
      // Calculate current hour-by-hour coverage
      const shiftsForReq = shifts.filter((s) => s.requirementId === req.id);
      const hourCoverage: Record<number, number> = {};
      
      for (let h = req.startHour; h < req.endHour; h++) {
        hourCoverage[h] = 0;
      }
      
      // Count coverage per hour
      for (const shift of shiftsForReq) {
        const staffAvail = availability.filter((a) => a.staffId === shift.staffId);
        let actualStart = req.startHour;
        let actualEnd = req.endHour;
        
        if (constraints.allowSplitShifts) {
          let maxOverlap = 0;
          for (const a of staffAvail) {
            if (a.dayOfWeek !== req.dayOfWeek) continue;
            const overlapStart = Math.max(a.startHour, req.startHour);
            const overlapEnd = Math.min(a.endHour, req.endHour);
            const overlap = overlapEnd - overlapStart;
            if (overlap > maxOverlap) {
              maxOverlap = overlap;
              actualStart = overlapStart;
              actualEnd = overlapEnd;
            }
          }
        }
        
        for (let h = actualStart; h < actualEnd; h++) {
          if (h >= req.startHour && h < req.endHour) {
            hourCoverage[h]++;
          }
        }
      }
      
      // Find hours that need more coverage
      const gapHours: number[] = [];
      for (let h = req.startHour; h < req.endHour; h++) {
        if (hourCoverage[h] < req.minStaff) {
          gapHours.push(h);
        }
      }
      
      if (gapHours.length === 0) continue;
      
      // Find the contiguous gap ranges
      const gaps: { start: number; end: number }[] = [];
      let gapStart = gapHours[0];
      let gapEnd = gapHours[0] + 1;
      
      for (let i = 1; i < gapHours.length; i++) {
        if (gapHours[i] === gapEnd) {
          gapEnd++;
        } else {
          gaps.push({ start: gapStart, end: gapEnd });
          gapStart = gapHours[i];
          gapEnd = gapHours[i] + 1;
        }
      }
      gaps.push({ start: gapStart, end: gapEnd });
      
      // For each gap, find staff who can cover it
      for (const gap of gaps) {
        // Find staff not already assigned to this requirement
        // who have availability during the gap
        const assignedStaffIds = shiftsForReq.map((s) => s.staffId);
        
        const eligibleForGap = staff.filter((s) => {
          // Already assigned to this requirement?
          if (assignedStaffIds.includes(s.id)) return false;
          
          // Check qualifications
          if (req.requiredQualifications.length > 0) {
            const hasQuals = req.requiredQualifications.every((qId) =>
              s.qualifications.includes(qId)
            );
            if (!hasQuals) return false;
          }
          
          // Check availability during gap hours
          const staffAvail = availability.filter((a) => a.staffId === s.id);
          const gapOverlap = calculateOverlapHours(
            staffAvail,
            req.dayOfWeek,
            gap.start,
            gap.end
          );
          
          if (gapOverlap < 1) return false; // Need at least 1 hour overlap with gap
          
          // Check for time conflicts
          const hasConflict = (assignedWindows[s.id] || []).some(
            (w) => w.dayOfWeek === req.dayOfWeek &&
              gap.start < w.endHour &&
              gap.end > w.startHour
          );
          if (hasConflict) return false;
          
          // Check max hours - use FULL requirement overlap
          const fullOverlap = calculateOverlapHours(
            staffAvail,
            req.dayOfWeek,
            req.startHour,
            req.endHour
          );
          
          const currentHours = hoursPerStaff[s.id] || 0;
          if (currentHours + fullOverlap > s.maxHoursPerWeek) return false;
          
          return true;
        });
        
        // Sort by who can cover the most of the gap AND has capacity
        eligibleForGap.sort((a, b) => {
          const aAvail = availability.filter((av) => av.staffId === a.id);
          const bAvail = availability.filter((av) => av.staffId === b.id);
          
          const aGapOverlap = calculateOverlapHours(aAvail, req.dayOfWeek, gap.start, gap.end);
          const bGapOverlap = calculateOverlapHours(bAvail, req.dayOfWeek, gap.start, gap.end);
          
          if (bGapOverlap !== aGapOverlap) return bGapOverlap - aGapOverlap;
          
          const aRemaining = a.maxHoursPerWeek - (hoursPerStaff[a.id] || 0);
          const bRemaining = b.maxHoursPerWeek - (hoursPerStaff[b.id] || 0);
          return bRemaining - aRemaining;
        });
        
        // Assign the best candidate
        for (const s of eligibleForGap) {
          const staffAvail = availability.filter((a) => a.staffId === s.id);
          const fullOverlap = calculateOverlapHours(
            staffAvail,
            req.dayOfWeek,
            req.startHour,
            req.endHour
          );
          
          // Final max hours check
          if ((hoursPerStaff[s.id] || 0) + fullOverlap > s.maxHoursPerWeek) continue;
          
          // Create the shift
          const shift: ScheduledShift = {
            id: uuidv4(),
            staffId: s.id,
            requirementId: req.id,
            date: getDateForDayOfWeek(weekStartDate, req.dayOfWeek),
            startHour: req.startHour,
            endHour: req.endHour,
            locationId: req.locationId,
            isLocked: false,
          };
          
          shifts.push(shift);
          hoursPerStaff[s.id] = (hoursPerStaff[s.id] || 0) + fullOverlap;
          
          // Add window
          let windowStart = req.startHour;
          let windowEnd = req.endHour;
          if (constraints.allowSplitShifts) {
            for (const a of staffAvail) {
              if (a.dayOfWeek === req.dayOfWeek) {
                windowStart = Math.max(a.startHour, req.startHour);
                windowEnd = Math.min(a.endHour, req.endHour);
                break;
              }
            }
          }
          assignedWindows[s.id] = assignedWindows[s.id] || [];
          assignedWindows[s.id].push({
            dayOfWeek: req.dayOfWeek,
            startHour: windowStart,
            endHour: windowEnd,
          });
          
          madeProgress = true;
          break; // Move to next gap
        }
      }
    }
  }
}

// Calculate hours of overlap between availability and a shift
function calculateOverlapHours(
  availability: Availability[],
  dayOfWeek: number,
  shiftStart: number,
  shiftEnd: number
): number {
  let maxOverlap = 0;
  
  for (const a of availability) {
    if (a.dayOfWeek !== dayOfWeek) continue;
    
    // Calculate overlap
    const overlapStart = Math.max(a.startHour, shiftStart);
    const overlapEnd = Math.min(a.endHour, shiftEnd);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    
    maxOverlap = Math.max(maxOverlap, overlap);
  }
  
  return maxOverlap;
}

// Determine the actual window a staff member can cover for a requirement
function getShiftWindowForStaff(
  availability: Availability[],
  requirement: ShiftRequirement,
  staffId: string,
  constraints: ScheduleConstraints
): { startHour: number; endHour: number; overlapHours: number } | null {
  const staffAvailability = availability.filter((a) => a.staffId === staffId);
  const shiftDuration = requirement.endHour - requirement.startHour;

  if (constraints.allowSplitShifts) {
    const overlapHours = calculateOverlapHours(
      staffAvailability,
      requirement.dayOfWeek,
      requirement.startHour,
      requirement.endHour
    );
    const minOverlap = constraints.minOverlapHours || 2;
    if (overlapHours < Math.min(minOverlap, shiftDuration)) return null;

    let bestOverlap = { start: requirement.startHour, end: requirement.endHour };
    let maxOverlap = 0;
    for (const a of staffAvailability) {
      if (a.dayOfWeek !== requirement.dayOfWeek) continue;
      const overlapStart = Math.max(a.startHour, requirement.startHour);
      const overlapEnd = Math.min(a.endHour, requirement.endHour);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestOverlap = { start: overlapStart, end: overlapEnd };
      }
    }

    return {
      startHour: bestOverlap.start,
      endHour: bestOverlap.end,
      overlapHours: Math.max(overlapHours, maxOverlap),
    };
  }

  const isAvailable = isStaffAvailableFull(
    staffAvailability,
    requirement.dayOfWeek,
    requirement.startHour,
    requirement.endHour
  );
  if (!isAvailable) return null;

  return {
    startHour: requirement.startHour,
    endHour: requirement.endHour,
    overlapHours: shiftDuration,
  };
}

interface AssignedWindow {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
}

function hasAssignmentConflict(
  assignedWindows: Record<string, AssignedWindow[]>,
  staffId: string,
  dayOfWeek: number,
  startHour: number,
  endHour: number
): boolean {
  const windows = assignedWindows[staffId] || [];
  return windows.some(
    (w) =>
      w.dayOfWeek === dayOfWeek &&
      startHour < w.endHour &&
      endHour > w.startHour
  );
}

function orderRequirements(
  requirements: ShiftRequirement[],
  ordering: RequirementOrdering,
  staff: Staff[],
  availability: Availability[],
  constraints: ScheduleConstraints
): ShiftRequirement[] {
  const base = [...requirements];

  switch (ordering) {
    case 'longest-first':
      return base.sort((a, b) => {
        const lenDiff = (b.endHour - b.startHour) - (a.endHour - a.startHour);
        if (lenDiff !== 0) return lenDiff;
        return a.dayOfWeek - b.dayOfWeek || a.startHour - b.startHour;
      });
    case 'min-staff-first':
      return base.sort((a, b) => {
        const staffDiff = b.minStaff - a.minStaff;
        if (staffDiff !== 0) return staffDiff;
        return a.dayOfWeek - b.dayOfWeek || a.startHour - b.startHour;
      });
    case 'scarcity-first':
      return base.sort((a, b) => {
        const aEligible = estimateEligibleCount(a, staff, availability, constraints);
        const bEligible = estimateEligibleCount(b, staff, availability, constraints);
        if (aEligible !== bEligible) return aEligible - bEligible; // fewer options first
        return a.dayOfWeek - b.dayOfWeek || a.startHour - b.startHour;
      });
    case 'random':
      return shuffleArray(base);
    case 'chronological':
    default:
      return base.sort((a, b) => {
        if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
        return a.startHour - b.startHour;
      });
  }
}

function estimateEligibleCount(
  requirement: ShiftRequirement,
  staff: Staff[],
  availability: Availability[],
  constraints: ScheduleConstraints
): number {
  return staff.filter((s) => {
    if (
      requirement.requiredQualifications.length > 0 &&
      !requirement.requiredQualifications.every((qId) => s.qualifications.includes(qId))
    ) {
      return false;
    }

    const window = getShiftWindowForStaff(availability, requirement, s.id, constraints);
    return Boolean(window);
  }).length;
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getEligibleStaff(
  staff: Staff[],
  availability: Availability[],
  requirement: ShiftRequirement,
  hoursPerStaff: Record<string, number>,
  constraints: ScheduleConstraints,
  assignedWindows: Record<string, AssignedWindow[]>
): Staff[] {
  const shiftDuration = requirement.endHour - requirement.startHour;
  const minOverlap = constraints.minOverlapHours || 2;

  return staff.filter((s) => {
    // Check if staff has required qualifications
    if (requirement.requiredQualifications.length > 0) {
      const hasAllQuals = requirement.requiredQualifications.every((qId) =>
        s.qualifications.includes(qId)
      );
      if (!hasAllQuals) return false;
    }

    // Check availability window and avoid double-booking
    const window = getShiftWindowForStaff(
      availability,
      requirement,
      s.id,
      constraints
    );
    if (!window) return false;

    if (
      hasAssignmentConflict(
        assignedWindows,
        s.id,
        requirement.dayOfWeek,
        window.startHour,
        window.endHour
      )
    ) {
      return false;
    }

    // Check max hours constraint - use INDIVIDUAL staff max hours
    const currentHours = hoursPerStaff[s.id] || 0;
    const hoursToAdd = constraints.allowSplitShifts
      ? window.overlapHours
      : shiftDuration;
    
    // Check individual staff's maxHoursPerWeek (this is the primary check)
    if (currentHours + hoursToAdd > s.maxHoursPerWeek) {
      return false;
    }
    
    // Also check global constraint if set
    if (constraints.maxHoursPerStaff && currentHours + hoursToAdd > constraints.maxHoursPerStaff) {
      return false;
    }

    return true;
  });
}

// Check if staff has availability that covers the entire shift
function isStaffAvailableFull(
  availability: Availability[],
  dayOfWeek: number,
  startHour: number,
  endHour: number
): boolean {
  return availability.some((a) => {
    return (
      a.dayOfWeek === dayOfWeek &&
      a.startHour <= startHour &&
      a.endHour >= endHour
    );
  });
}

function scoreStaffForShift(
  eligibleStaff: Staff[],
  requirement: ShiftRequirement,
  hoursPerStaff: Record<string, number>,
  allStaff: Staff[],
  availability: Availability[],
  constraints: ScheduleConstraints
): StaffScore[] {
  // Calculate average hours to help with balancing
  const totalHours = Object.values(hoursPerStaff).reduce((sum, h) => sum + h, 0);
  const avgHours = allStaff.length > 0 ? totalHours / allStaff.length : 0;
  const shiftDuration = requirement.endHour - requirement.startHour;

  return eligibleStaff
    .map((s) => {
      let score = 100;
      const currentHours = hoursPerStaff[s.id] || 0;
      
      // Calculate overlap hours for this staff
      const staffAvailability = availability.filter((a) => a.staffId === s.id);
      const overlapHours = calculateOverlapHours(
        staffAvailability,
        requirement.dayOfWeek,
        requirement.startHour,
        requirement.endHour
      );

      // Favor staff who can cover more of the shift
      if (constraints.allowSplitShifts) {
        const coverageRatio = overlapHours / shiftDuration;
        score += coverageRatio * 30; // Bonus for more coverage
      }

      // Heavily favor staff with fewer hours (for balancing)
      if (constraints.balanceHours) {
        const hoursDiff = currentHours - avgHours;
        score -= hoursDiff * 5; // Penalize staff with more hours
      }

      // Slightly favor staff who need more hours to meet minimum
      if (currentHours < s.minHoursPerWeek) {
        score += (s.minHoursPerWeek - currentHours) * 2;
      }

      // Slight random factor to prevent always picking the same person
      score += Math.random() * 10;

      return {
        staffId: s.id,
        score,
        currentHours,
        isQualified: true,
        isAvailable: true,
        prefersSlot: false,
        overlapHours,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function balanceHours(
  shifts: ScheduledShift[],
  staff: Staff[],
  hoursPerStaff: Record<string, number>,
  availability: Availability[],
  requirements: ShiftRequirement[],
  constraints: ScheduleConstraints
): void {
  // Simple balancing: try to swap shifts between over-worked and under-worked staff
  const avgHours = Object.values(hoursPerStaff).reduce((sum, h) => sum + h, 0) / staff.length;
  const threshold = avgHours * 0.2; // 20% deviation threshold

  // Find over-worked and under-worked staff
  const overWorked = staff.filter((s) => hoursPerStaff[s.id] > avgHours + threshold);
  const underWorked = staff.filter((s) => hoursPerStaff[s.id] < avgHours - threshold);

  // Try to swap shifts
  for (const over of overWorked) {
    for (const under of underWorked) {
      // Find shifts from over-worked staff that under-worked staff could take
      const overShifts = shifts.filter((shift) => shift.staffId === over.id && !shift.isLocked);

      for (const shift of overShifts) {
        const requirement = requirements.find((r) => r.id === shift.requirementId);
        if (!requirement) continue;

        // Check if under-worked staff is eligible
        const underAvailability = availability.filter((a) => a.staffId === under.id);
        
        let isAvailable: boolean;
        let overlapHours: number;
        
        if (constraints.allowSplitShifts) {
          overlapHours = calculateOverlapHours(
            underAvailability,
            requirement.dayOfWeek,
            requirement.startHour,
            requirement.endHour
          );
          const minOverlap = constraints.minOverlapHours || 2;
          isAvailable = overlapHours >= minOverlap;
        } else {
          isAvailable = isStaffAvailableFull(
            underAvailability,
            requirement.dayOfWeek,
            requirement.startHour,
            requirement.endHour
          );
          overlapHours = requirement.endHour - requirement.startHour;
        }

        const hasQualifications = requirement.requiredQualifications.every((qId) =>
          under.qualifications.includes(qId)
        );

        if (isAvailable && hasQualifications) {
          // Swap the shift
          const shiftDuration = shift.endHour - shift.startHour;
          const actualHours = constraints.allowSplitShifts ? overlapHours : shiftDuration;
          
          // Check if swap would exceed under-worked staff's max hours
          if (hoursPerStaff[under.id] + actualHours <= under.maxHoursPerWeek) {
            shift.staffId = under.id;
            hoursPerStaff[over.id] -= shiftDuration;
            hoursPerStaff[under.id] += actualHours;

            // Check if we've balanced enough
            if (hoursPerStaff[over.id] <= avgHours + threshold) {
              break;
            }
          }
        }
      }
    }
  }
}

// GAP-FILLING PASS: Find uncovered hours and assign staff with remaining capacity
function fillUncoveredGaps(
  shifts: ScheduledShift[],
  staff: Staff[],
  availability: Availability[],
  requirements: ShiftRequirement[],
  hoursPerStaff: Record<string, number>,
  assignedWindows: Record<string, AssignedWindow[]>,
  constraints: ScheduleConstraints,
  weekStartDate: Date,
  warnings: ScheduleWarning[]
): void {
  // For each requirement, check hour-by-hour coverage and find gaps
  for (const requirement of requirements) {
    // Calculate current hour-by-hour coverage for this requirement
    const shiftsForReq = shifts.filter((s) => s.requirementId === requirement.id);
    const hourCoverage: Record<number, string[]> = {}; // hour -> array of staffIds covering
    
    for (let h = requirement.startHour; h < requirement.endHour; h++) {
      hourCoverage[h] = [];
    }

    // Track which staff are covering which hours
    shiftsForReq.forEach((shift) => {
      const staffAvailability = availability.filter((a) => a.staffId === shift.staffId);
      let actualStart = requirement.startHour;
      let actualEnd = requirement.endHour;

      if (constraints.allowSplitShifts) {
        let bestOverlap = { start: requirement.startHour, end: requirement.endHour };
        let maxOverlap = 0;
        for (const a of staffAvailability) {
          if (a.dayOfWeek !== requirement.dayOfWeek) continue;
          const overlapStart = Math.max(a.startHour, requirement.startHour);
          const overlapEnd = Math.min(a.endHour, requirement.endHour);
          const overlap = Math.max(0, overlapEnd - overlapStart);
          if (overlap > maxOverlap) {
            maxOverlap = overlap;
            bestOverlap = { start: overlapStart, end: overlapEnd };
          }
        }
        if (maxOverlap > 0) {
          actualStart = bestOverlap.start;
          actualEnd = bestOverlap.end;
        }
      }

      for (let h = actualStart; h < actualEnd; h++) {
        if (h >= requirement.startHour && h < requirement.endHour) {
          hourCoverage[h].push(shift.staffId);
        }
      }
    });

    // Find gaps (hours with insufficient coverage)
    const gaps: { startHour: number; endHour: number; neededStaff: number }[] = [];
    let gapStart: number | null = null;
    let gapNeeded = 0;

    for (let h = requirement.startHour; h < requirement.endHour; h++) {
      const currentCoverage = hourCoverage[h].length;
      const needed = requirement.minStaff - currentCoverage;

      if (needed > 0) {
        if (gapStart === null) {
          gapStart = h;
          gapNeeded = needed;
        }
      } else {
        if (gapStart !== null) {
          gaps.push({ startHour: gapStart, endHour: h, neededStaff: gapNeeded });
          gapStart = null;
        }
      }
    }
    if (gapStart !== null) {
      gaps.push({ startHour: gapStart, endHour: requirement.endHour, neededStaff: gapNeeded });
    }

    // For each gap, find staff who can fill it
    for (const gap of gaps) {
      // Find staff with availability and remaining hours capacity
      const eligibleForGap = staff
        .filter((s) => {
          // Check qualifications
          if (requirement.requiredQualifications.length > 0) {
            const hasAllQuals = requirement.requiredQualifications.every((qId) =>
              s.qualifications.includes(qId)
            );
            if (!hasAllQuals) return false;
          }

          // Check if already assigned to this requirement
          const alreadyAssigned = shiftsForReq.some((shift) => shift.staffId === s.id);
          if (alreadyAssigned) return false;

          // Check availability for the gap hours
          const staffAvailability = availability.filter((a) => a.staffId === s.id);
          
          if (constraints.allowSplitShifts) {
            // Check if they have ANY overlap with the gap
            const overlapHours = calculateOverlapHours(
              staffAvailability,
              requirement.dayOfWeek,
              gap.startHour,
              gap.endHour
            );
            const minOverlap = Math.min(constraints.minOverlapHours || 2, gap.endHour - gap.startHour);
            if (overlapHours < minOverlap) return false;
          } else {
            // Need full coverage
            const isAvailable = isStaffAvailableFull(
              staffAvailability,
              requirement.dayOfWeek,
              gap.startHour,
              gap.endHour
            );
            if (!isAvailable) return false;
          }

          // Check for conflicts with existing assignments
          const hasConflict = hasAssignmentConflict(
            assignedWindows,
            s.id,
            requirement.dayOfWeek,
            gap.startHour,
            gap.endHour
          );
          if (hasConflict) return false;

          // Check remaining hours capacity
          const currentHours = hoursPerStaff[s.id] || 0;
          const remainingCapacity = s.maxHoursPerWeek - currentHours;
          
          // Need at least some hours available (even partial)
          if (remainingCapacity <= 0) return false;
          
          // CRITICAL: Check that the ACTUAL hours they would work for the FULL requirement
          // won't exceed their max (not just the gap hours)
          const staffAvail = availability.filter((a) => a.staffId === s.id);
          const fullRequirementOverlap = calculateOverlapHours(
            staffAvail,
            requirement.dayOfWeek,
            requirement.startHour,
            requirement.endHour
          );
          
          // If working the full requirement overlap would exceed max, skip this person
          if (currentHours + fullRequirementOverlap > s.maxHoursPerWeek) {
            return false;
          }

          return true;
        })
        .map((s) => {
          // Calculate how many hours they can actually cover for the FULL requirement
          const staffAvailability = availability.filter((a) => a.staffId === s.id);
          
          // Calculate overlap with the FULL requirement, not just the gap
          const fullOverlapHours = calculateOverlapHours(
            staffAvailability,
            requirement.dayOfWeek,
            requirement.startHour,
            requirement.endHour
          );
          
          const currentHours = hoursPerStaff[s.id] || 0;
          const remainingCapacity = s.maxHoursPerWeek - currentHours;
          const hoursCanAssign = Math.min(fullOverlapHours, remainingCapacity);
          
          return {
            staff: s,
            hoursCanAssign,
            remainingCapacity,
            currentHours,
          };
        })
        // Sort by: most hours they can cover, then by who has the most remaining capacity
        .sort((a, b) => {
          if (b.hoursCanAssign !== a.hoursCanAssign) {
            return b.hoursCanAssign - a.hoursCanAssign;
          }
          return b.remainingCapacity - a.remainingCapacity;
        });

      // Assign eligible staff to fill the gap
      for (const eligible of eligibleForGap) {
        if (eligible.hoursCanAssign <= 0) continue;

        const staffAvailability = availability.filter((a) => a.staffId === eligible.staff.id);
        
        // Find the actual window they can cover
        let actualStart = gap.startHour;
        let actualEnd = gap.endHour;
        
        if (constraints.allowSplitShifts) {
          let bestOverlap = { start: gap.startHour, end: gap.endHour };
          let maxOverlap = 0;
          for (const a of staffAvailability) {
            if (a.dayOfWeek !== requirement.dayOfWeek) continue;
            const overlapStart = Math.max(a.startHour, gap.startHour);
            const overlapEnd = Math.min(a.endHour, gap.endHour);
            const overlap = Math.max(0, overlapEnd - overlapStart);
            if (overlap > maxOverlap) {
              maxOverlap = overlap;
              bestOverlap = { start: overlapStart, end: overlapEnd };
            }
          }
          actualStart = bestOverlap.start;
          actualEnd = bestOverlap.end;
        }

        // Limit to their remaining capacity
        const hoursToAssign = Math.min(actualEnd - actualStart, eligible.remainingCapacity);
        if (hoursToAssign <= 0) continue;

        // Create the shift assignment
        const shiftDate = getDateForDayOfWeek(weekStartDate, requirement.dayOfWeek);
        const shift: ScheduledShift = {
          id: uuidv4(),
          staffId: eligible.staff.id,
          requirementId: requirement.id,
          date: shiftDate,
          startHour: requirement.startHour,
          endHour: requirement.endHour,
          locationId: requirement.locationId,
          isLocked: false,
        };

        shifts.push(shift);
        hoursPerStaff[eligible.staff.id] += hoursToAssign;
        assignedWindows[eligible.staff.id] = assignedWindows[eligible.staff.id] || [];
        assignedWindows[eligible.staff.id].push({
          dayOfWeek: requirement.dayOfWeek,
          startHour: actualStart,
          endHour: actualStart + hoursToAssign,
        });

        // Update hourCoverage to track we've filled some of the gap
        for (let h = actualStart; h < actualStart + hoursToAssign; h++) {
          if (hourCoverage[h]) {
            hourCoverage[h].push(eligible.staff.id);
          }
        }
      }
    }
  }
}

// OPTIMIZATION PASS: Move staff from over-covered shifts to fill remaining gaps
// This looks for staff who are working shifts that have MORE coverage than needed,
// and if they have availability during shifts that NEED coverage, moves them there
function optimizeCoverage(
  shifts: ScheduledShift[],
  staff: Staff[],
  availability: Availability[],
  requirements: ShiftRequirement[],
  hoursPerStaff: Record<string, number>,
  assignedWindows: Record<string, AssignedWindow[]>,
  constraints: ScheduleConstraints,
  weekStartDate: Date
): void {
  // Build a map of coverage per requirement per hour
  const coverageMap: Map<string, { hourCoverage: Record<number, string[]>; requirement: ShiftRequirement }> = new Map();
  
  for (const requirement of requirements) {
    const hourCoverage: Record<number, string[]> = {};
    for (let h = requirement.startHour; h < requirement.endHour; h++) {
      hourCoverage[h] = [];
    }
    
    const shiftsForReq = shifts.filter((s) => s.requirementId === requirement.id);
    shiftsForReq.forEach((shift) => {
      const staffAvailability = availability.filter((a) => a.staffId === shift.staffId);
      let actualStart = requirement.startHour;
      let actualEnd = requirement.endHour;

      if (constraints.allowSplitShifts) {
        let bestOverlap = { start: requirement.startHour, end: requirement.endHour };
        let maxOverlap = 0;
        for (const a of staffAvailability) {
          if (a.dayOfWeek !== requirement.dayOfWeek) continue;
          const overlapStart = Math.max(a.startHour, requirement.startHour);
          const overlapEnd = Math.min(a.endHour, requirement.endHour);
          const overlap = Math.max(0, overlapEnd - overlapStart);
          if (overlap > maxOverlap) {
            maxOverlap = overlap;
            bestOverlap = { start: overlapStart, end: overlapEnd };
          }
        }
        if (maxOverlap > 0) {
          actualStart = bestOverlap.start;
          actualEnd = bestOverlap.end;
        }
      }

      for (let h = actualStart; h < actualEnd; h++) {
        if (h >= requirement.startHour && h < requirement.endHour) {
          hourCoverage[h].push(shift.staffId);
        }
      }
    });
    
    coverageMap.set(requirement.id, { hourCoverage, requirement });
  }

  // Find requirements with gaps (under-covered hours)
  const gapsToFill: { requirement: ShiftRequirement; startHour: number; endHour: number }[] = [];
  
  coverageMap.forEach(({ hourCoverage, requirement }) => {
    let gapStart: number | null = null;
    
    for (let h = requirement.startHour; h < requirement.endHour; h++) {
      const coverage = hourCoverage[h]?.length || 0;
      if (coverage < requirement.minStaff) {
        if (gapStart === null) gapStart = h;
      } else {
        if (gapStart !== null) {
          gapsToFill.push({ requirement, startHour: gapStart, endHour: h });
          gapStart = null;
        }
      }
    }
    if (gapStart !== null) {
      gapsToFill.push({ requirement, startHour: gapStart, endHour: requirement.endHour });
    }
  });

  // If no gaps, nothing to optimize
  if (gapsToFill.length === 0) return;

  // Find requirements with over-coverage (more staff than needed)
  const overCoveredShifts: { 
    shift: ScheduledShift; 
    requirement: ShiftRequirement; 
    staffId: string;
    hoursWorked: number;
  }[] = [];
  
  coverageMap.forEach(({ hourCoverage, requirement }) => {
    const shiftsForReq = shifts.filter((s) => s.requirementId === requirement.id && !s.isLocked);
    
    // Check if this requirement has any hours with over-coverage
    let hasOverCoverage = false;
    for (let h = requirement.startHour; h < requirement.endHour; h++) {
      if ((hourCoverage[h]?.length || 0) > requirement.minStaff) {
        hasOverCoverage = true;
        break;
      }
    }
    
    if (hasOverCoverage) {
      // Add all non-locked shifts from this over-covered requirement
      for (const shift of shiftsForReq) {
        const staffAvailability = availability.filter((a) => a.staffId === shift.staffId);
        let hoursWorked = requirement.endHour - requirement.startHour;
        
        if (constraints.allowSplitShifts) {
          hoursWorked = calculateOverlapHours(
            staffAvailability,
            requirement.dayOfWeek,
            requirement.startHour,
            requirement.endHour
          );
        }
        
        overCoveredShifts.push({ shift, requirement, staffId: shift.staffId, hoursWorked });
      }
    }
  });

  // Try to move staff from over-covered shifts to fill gaps
  for (const gap of gapsToFill) {
    // Find staff from over-covered shifts who could fill this gap
    for (const overCovered of overCoveredShifts) {
      // Can't move to the same requirement
      if (overCovered.requirement.id === gap.requirement.id) continue;
      
      // Check if staff is already assigned to the gap requirement
      const alreadyAssigned = shifts.some(
        (s) => s.requirementId === gap.requirement.id && s.staffId === overCovered.staffId
      );
      if (alreadyAssigned) continue;
      
      // Check if staff has qualifications for the gap
      if (gap.requirement.requiredQualifications.length > 0) {
        const staffMember = staff.find((s) => s.id === overCovered.staffId);
        if (!staffMember) continue;
        const hasQuals = gap.requirement.requiredQualifications.every((qId) =>
          staffMember.qualifications.includes(qId)
        );
        if (!hasQuals) continue;
      }
      
      // Check if staff has availability during the gap
      const staffAvailability = availability.filter((a) => a.staffId === overCovered.staffId);
      let canCoverGap = false;
      let gapOverlapHours = 0;
      
      if (constraints.allowSplitShifts) {
        gapOverlapHours = calculateOverlapHours(
          staffAvailability,
          gap.requirement.dayOfWeek,
          gap.startHour,
          gap.endHour
        );
        const minOverlap = Math.min(constraints.minOverlapHours || 2, gap.endHour - gap.startHour);
        canCoverGap = gapOverlapHours >= minOverlap;
      } else {
        canCoverGap = isStaffAvailableFull(
          staffAvailability,
          gap.requirement.dayOfWeek,
          gap.startHour,
          gap.endHour
        );
        gapOverlapHours = gap.endHour - gap.startHour;
      }
      
      if (!canCoverGap) continue;
      
      // Calculate the FULL overlap with the gap requirement (not just the gap portion)
      const fullGapReqOverlap = calculateOverlapHours(
        staffAvailability,
        gap.requirement.dayOfWeek,
        gap.requirement.startHour,
        gap.requirement.endHour
      );
      
      // Check if moving this person would exceed their max hours
      // New hours = current - hours from removed shift + hours for new shift
      const staffMember = staff.find((s) => s.id === overCovered.staffId);
      if (!staffMember) continue;
      
      const projectedHours = (hoursPerStaff[overCovered.staffId] || 0) 
        - overCovered.hoursWorked 
        + fullGapReqOverlap;
      
      if (projectedHours > staffMember.maxHoursPerWeek) {
        continue; // Moving would exceed max hours, skip
      }
      
      // Check for time conflicts with other assignments (excluding the one we're removing)
      const otherWindows = (assignedWindows[overCovered.staffId] || []).filter((w) => {
        // Filter out the window from the shift we're removing
        return !(w.dayOfWeek === overCovered.requirement.dayOfWeek);
      });
      
      const hasConflict = otherWindows.some(
        (w) =>
          w.dayOfWeek === gap.requirement.dayOfWeek &&
          gap.startHour < w.endHour &&
          gap.endHour > w.startHour
      );
      if (hasConflict) continue;
      
      // We can move this person! Remove from over-covered, add to gap
      const shiftIndex = shifts.findIndex((s) => s.id === overCovered.shift.id);
      if (shiftIndex === -1) continue;
      
      // Remove the old shift
      shifts.splice(shiftIndex, 1);
      hoursPerStaff[overCovered.staffId] -= overCovered.hoursWorked;
      
      // Update assigned windows - remove old window
      if (assignedWindows[overCovered.staffId]) {
        assignedWindows[overCovered.staffId] = assignedWindows[overCovered.staffId].filter(
          (w) => w.dayOfWeek !== overCovered.requirement.dayOfWeek
        );
      }
      
      // Create new shift for the gap
      const shiftDate = getDateForDayOfWeek(weekStartDate, gap.requirement.dayOfWeek);
      const newShift: ScheduledShift = {
        id: uuidv4(),
        staffId: overCovered.staffId,
        requirementId: gap.requirement.id,
        date: shiftDate,
        startHour: gap.requirement.startHour,
        endHour: gap.requirement.endHour,
        locationId: gap.requirement.locationId,
        isLocked: false,
      };
      
      shifts.push(newShift);
      
      // Calculate actual hours for the new shift
      let actualGapHours = gap.requirement.endHour - gap.requirement.startHour;
      if (constraints.allowSplitShifts) {
        actualGapHours = calculateOverlapHours(
          staffAvailability,
          gap.requirement.dayOfWeek,
          gap.requirement.startHour,
          gap.requirement.endHour
        );
      }
      
      hoursPerStaff[overCovered.staffId] += actualGapHours;
      
      // Add new window
      assignedWindows[overCovered.staffId] = assignedWindows[overCovered.staffId] || [];
      
      let actualStart = gap.requirement.startHour;
      let actualEnd = gap.requirement.endHour;
      if (constraints.allowSplitShifts) {
        let bestOverlap = { start: gap.requirement.startHour, end: gap.requirement.endHour };
        let maxOverlap = 0;
        for (const a of staffAvailability) {
          if (a.dayOfWeek !== gap.requirement.dayOfWeek) continue;
          const overlapStart = Math.max(a.startHour, gap.requirement.startHour);
          const overlapEnd = Math.min(a.endHour, gap.requirement.endHour);
          const overlap = Math.max(0, overlapEnd - overlapStart);
          if (overlap > maxOverlap) {
            maxOverlap = overlap;
            bestOverlap = { start: overlapStart, end: overlapEnd };
          }
        }
        actualStart = bestOverlap.start;
        actualEnd = bestOverlap.end;
      }
      
      assignedWindows[overCovered.staffId].push({
        dayOfWeek: gap.requirement.dayOfWeek,
        startHour: actualStart,
        endHour: actualEnd,
      });
      
      // Update coverage map for both requirements
      const oldCoverage = coverageMap.get(overCovered.requirement.id);
      if (oldCoverage) {
        for (let h = overCovered.requirement.startHour; h < overCovered.requirement.endHour; h++) {
          const idx = oldCoverage.hourCoverage[h]?.indexOf(overCovered.staffId);
          if (idx !== undefined && idx >= 0) {
            oldCoverage.hourCoverage[h].splice(idx, 1);
          }
        }
      }
      
      const newCoverage = coverageMap.get(gap.requirement.id);
      if (newCoverage) {
        for (let h = actualStart; h < actualEnd; h++) {
          if (newCoverage.hourCoverage[h]) {
            newCoverage.hourCoverage[h].push(overCovered.staffId);
          }
        }
      }
      
      // Remove this shift from overCoveredShifts so we don't try to move it again
      const overIdx = overCoveredShifts.indexOf(overCovered);
      if (overIdx >= 0) {
        overCoveredShifts.splice(overIdx, 1);
      }
      
      // Break to try next gap (we filled this one)
      break;
    }
  }
}

// Regenerate schedule with specific constraints
export function regenerateSchedule(
  input: ScheduleInput,
  existingSchedule: Schedule,
  newConstraints: Partial<ScheduleConstraints>
): ScheduleResult {
  // Merge constraints
  const mergedConstraints: ScheduleConstraints = {
    ...input.constraints,
    ...newConstraints,
    lockedShiftIds: [
      ...(input.constraints.lockedShiftIds || []),
      ...(newConstraints.lockedShiftIds || []),
    ],
  };

  // Find locked shifts from existing schedule
  const lockedShifts = existingSchedule.shifts.filter(
    (s) => s.isLocked || mergedConstraints.lockedShiftIds.includes(s.id)
  );

  // Generate new schedule
  const result = generateSchedule({
    ...input,
    constraints: mergedConstraints,
  });

  // Preserve locked shifts
  for (const locked of lockedShifts) {
    // Remove any conflicting assignment
    const conflictIndex = result.schedule.shifts.findIndex(
      (s) => s.requirementId === locked.requirementId && s.staffId !== locked.staffId
    );
    if (conflictIndex >= 0) {
      result.schedule.shifts.splice(conflictIndex, 1);
    }

    // Add back the locked shift if not already present
    if (!result.schedule.shifts.some((s) => s.id === locked.id)) {
      result.schedule.shifts.push({ ...locked, isLocked: true });
    }
  }

  // Recalculate stats with proper hour-based coverage
  const hoursPerStaff: Record<string, number> = {};
  input.staff.forEach((s) => {
    hoursPerStaff[s.id] = 0;
  });

  let totalRequiredHours = 0;
  let totalCoveredHours = 0;
  const uncoveredGaps: UncoveredGap[] = [];
  let shiftsFullyCovered = 0;

  for (const requirement of input.requirements) {
    const reqDuration = requirement.endHour - requirement.startHour;
    const reqHoursNeeded = reqDuration * requirement.minStaff;
    totalRequiredHours += reqHoursNeeded;

    const shiftsForReq = result.schedule.shifts.filter((s) => s.requirementId === requirement.id);
    const hourCoverage: Record<number, number> = {};
    for (let h = requirement.startHour; h < requirement.endHour; h++) {
      hourCoverage[h] = 0;
    }

    shiftsForReq.forEach((shift) => {
      const staffAvailability = input.availability.filter((a) => a.staffId === shift.staffId);
      let actualStart = requirement.startHour;
      let actualEnd = requirement.endHour;

      if (mergedConstraints.allowSplitShifts) {
        let bestOverlap = { start: requirement.startHour, end: requirement.endHour };
        let maxOverlap = 0;
        for (const a of staffAvailability) {
          if (a.dayOfWeek !== requirement.dayOfWeek) continue;
          const overlapStart = Math.max(a.startHour, requirement.startHour);
          const overlapEnd = Math.min(a.endHour, requirement.endHour);
          const overlap = Math.max(0, overlapEnd - overlapStart);
          if (overlap > maxOverlap) {
            maxOverlap = overlap;
            bestOverlap = { start: overlapStart, end: overlapEnd };
          }
        }
        if (maxOverlap > 0) {
          actualStart = bestOverlap.start;
          actualEnd = bestOverlap.end;
        }
      }

      const actualHours = actualEnd - actualStart;
      hoursPerStaff[shift.staffId] = (hoursPerStaff[shift.staffId] || 0) + actualHours;

      for (let h = actualStart; h < actualEnd; h++) {
        if (h >= requirement.startHour && h < requirement.endHour) {
          hourCoverage[h] = (hourCoverage[h] || 0) + 1;
        }
      }
    });

    let reqCoveredHours = 0;
    let isFullyCovered = true;
    let gapStart: number | null = null;

    for (let h = requirement.startHour; h < requirement.endHour; h++) {
      const coverage = hourCoverage[h] || 0;
      reqCoveredHours += Math.min(coverage, requirement.minStaff);

      if (coverage < requirement.minStaff) {
        isFullyCovered = false;
        if (gapStart === null) {
          gapStart = h;
        }
      } else {
        if (gapStart !== null) {
          uncoveredGaps.push({
            requirementId: requirement.id,
            dayOfWeek: requirement.dayOfWeek,
            startHour: gapStart,
            endHour: h,
            locationId: requirement.locationId,
          });
          gapStart = null;
        }
      }
    }

    if (gapStart !== null) {
      uncoveredGaps.push({
        requirementId: requirement.id,
        dayOfWeek: requirement.dayOfWeek,
        startHour: gapStart,
        endHour: requirement.endHour,
        locationId: requirement.locationId,
      });
    }

    totalCoveredHours += reqCoveredHours;
    if (isFullyCovered) {
      shiftsFullyCovered++;
    }
  }

  result.stats.hoursPerStaff = hoursPerStaff;
  result.stats.totalHours = Object.values(hoursPerStaff).reduce((sum, h) => sum + h, 0);
  result.stats.totalShifts = input.requirements.length;
  result.stats.filledShifts = shiftsFullyCovered;
  result.stats.requiredHours = totalRequiredHours;
  result.stats.coveredHours = totalCoveredHours;
  result.stats.coveragePercentage = totalRequiredHours > 0
    ? (totalCoveredHours / totalRequiredHours) * 100
    : 100;
  result.stats.uncoveredGaps = uncoveredGaps;

  return result;
}

// Generate multiple schedule variants and return top options sorted by coverage
export interface ScheduleVariantResult {
  variants: ScheduleResult[];
  bestIndex: number;
}

export function generateScheduleVariants(
  input: ScheduleInput,
  numCandidates: number = 100, // Generate many more candidates to explore all possibilities
  numTopVariants: number = 3
): ScheduleVariantResult {
  const candidates: ScheduleResult[] = [];

  const strategies: RequirementOrdering[] = [
    'scarcity-first',
    'min-staff-first',
    'longest-first',
    'chronological',
    'random',
  ];

  // Run each strategy multiple times to explore variations
  const runsPerStrategy = Math.max(10, Math.floor(numCandidates / strategies.length));

  // Explore multiple strategies and seeds to cover more of the search space
  for (const strategy of strategies) {
    for (let i = 0; i < runsPerStrategy; i++) {
      candidates.push(
        generateSchedule({
          ...input,
          priorityOrdering: strategy,
        })
      );
    }
  }

  // Extra random runs to find edge case solutions
  while (candidates.length < numCandidates) {
    candidates.push(
      generateSchedule({
        ...input,
        priorityOrdering: 'random',
      })
    );
  }

  // Score and rank ALL candidates by comprehensive criteria
  // Primary: fewest uncovered hours
  // Secondary: best adherence to staff/shift stipulations
  const scoredCandidates = candidates.map((candidate, index) => ({
    candidate,
    score: scoreScheduleResult(candidate, input.staff),
    index,
  }));

  // Sort by score (highest = best)
  scoredCandidates.sort((a, b) => b.score - a.score);

  // Remove duplicates (schedules with identical coverage and staff assignments)
  const uniqueVariants: ScheduleResult[] = [];
  const seenSignatures = new Set<string>();

  for (const { candidate } of scoredCandidates) {
    // Create a signature based on staff assignments
    const signature = candidate.schedule.shifts
      .map(s => `${s.requirementId}:${s.staffId}`)
      .sort()
      .join('|');

    if (!seenSignatures.has(signature)) {
      seenSignatures.add(signature);
      uniqueVariants.push(candidate);

      if (uniqueVariants.length >= numTopVariants) break;
    }
  }

  // If we didn't get enough unique variants, add more from remaining candidates
  if (uniqueVariants.length < numTopVariants) {
    for (const { candidate } of scoredCandidates) {
      if (uniqueVariants.length >= numTopVariants) break;
      if (!uniqueVariants.includes(candidate)) {
        uniqueVariants.push(candidate);
      }
    }
  }

  return {
    variants: uniqueVariants,
    bestIndex: 0, // First one is always the best after sorting
  };
}

function scoreScheduleResult(result: ScheduleResult, staff?: Staff[]): number {
  // ============================================================
  // SCORING PRIORITIES (in order of importance):
  // 1. MOST IMPORTANT: Fewest uncovered hours (highest covered hours)
  // 2. Best adherence to shift requirements (min staffing met)
  // 3. Best adherence to staff stipulations (hours within min/max)
  // ============================================================
  
  const stats = result.stats;
  const warnings = result.warnings;
  
  // Calculate uncovered hours - THIS IS THE PRIMARY METRIC
  const requiredHours = stats.requiredHours || 0;
  const coveredHours = stats.coveredHours || 0;
  const uncoveredHours = Math.max(0, requiredHours - coveredHours);
  
  // PRIMARY SCORE: Covered hours (heavily weighted)
  // More covered hours = higher score
  // Use a large multiplier to make this the dominant factor
  const coverageScore = coveredHours * 1000;
  
  // PENALTY: Uncovered hours (massive penalty for gaps)
  // Each uncovered hour severely impacts the score
  const uncoveredPenalty = uncoveredHours * 5000;
  
  // SECONDARY: Coverage percentage bonus
  // Reward schedules that cover a higher percentage
  const coveragePercentageBonus = stats.coveragePercentage * 100;
  
  // SECONDARY: Filled shifts ratio bonus
  // Fully covered shifts are better than partial coverage
  const filledRatio = stats.filledShifts / Math.max(1, stats.totalShifts);
  const filledShiftsBonus = filledRatio * 500;
  
  // PENALTIES FOR STIPULATION VIOLATIONS
  let stipulationPenalty = 0;
  
  for (const warning of warnings) {
    switch (warning.type) {
      case 'unfilled':
        // Unfilled minimum staffing - very bad
        stipulationPenalty += 200;
        break;
      case 'overtime':
        // Staff exceeding max hours - bad for staff
        stipulationPenalty += 100;
        break;
      case 'undertime':
        // Staff below min hours - less severe but still not ideal
        stipulationPenalty += 50;
        break;
      case 'qualification_mismatch':
        // Wrong qualifications - should never happen but penalize heavily
        stipulationPenalty += 300;
        break;
      case 'preference_ignored':
        // Preferences ignored - minor penalty
        stipulationPenalty += 20;
        break;
      default:
        stipulationPenalty += 30;
    }
  }
  
  // BONUS: Check hours balance if staff data is available
  let balanceBonus = 0;
  if (staff && staff.length > 0) {
    const hoursPerStaff = stats.hoursPerStaff || {};
    let allWithinBounds = true;
    
    for (const s of staff) {
      const assignedHours = hoursPerStaff[s.id] || 0;
      
      // Check if hours are within staff's stipulated min/max
      if (assignedHours > s.maxHoursPerWeek) {
        allWithinBounds = false;
      }
      if (assignedHours < s.minHoursPerWeek && assignedHours > 0) {
        // Only penalize if they have SOME hours but below minimum
        allWithinBounds = false;
      }
    }
    
    if (allWithinBounds) {
      balanceBonus = 200; // Bonus for respecting all staff hour constraints
    }
  }
  
  // Calculate final score
  const finalScore = 
    coverageScore +
    coveragePercentageBonus +
    filledShiftsBonus +
    balanceBonus -
    uncoveredPenalty -
    stipulationPenalty;
  
  return finalScore;
}
