import type {
  Availability,
  Location,
  Qualification,
  ScheduleConstraints,
  ScheduleResult,
  ShiftRequirement,
  Staff,
} from './types';

interface SolverConstraints extends ScheduleConstraints {
  solveSeconds?: number;
  solutionPoolSize?: number;
}

interface SolverRequest {
  staff: Staff[];
  availability: Availability[];
  requirements: ShiftRequirement[];
  locations: Location[];
  qualifications: Qualification[];
  weekStartDate: Date;
  constraints: SolverConstraints;
}

interface SolverResponse {
  solutions: ScheduleResult[];
  bestIndex: number;
}

function normalizeScheduleResult(result: ScheduleResult): ScheduleResult {
  return {
    ...result,
    schedule: {
      ...result.schedule,
      weekStartDate: new Date(result.schedule.weekStartDate),
      generatedAt: new Date(result.schedule.generatedAt),
      shifts: result.schedule.shifts.map((s) => ({
        ...s,
        date: new Date(s.date),
      })),
    },
    stats: result.stats || {
      totalShifts: 0,
      filledShifts: 0,
      totalHours: 0,
      hoursPerStaff: {},
      coveragePercentage: 0,
      requiredHours: 0,
      coveredHours: 0,
      uncoveredGaps: [],
    },
  };
}

export async function generateWithSolverService(
  payload: SolverRequest
): Promise<ScheduleResult[] | null> {
  const baseUrl = process.env.NEXT_PUBLIC_SOLVER_URL;
  if (!baseUrl) {
    console.log('NEXT_PUBLIC_SOLVER_URL not set, skipping Python solver');
    return null;
  }

  const url = `${baseUrl.replace(/\/$/, '')}/solve`;
  
  // Prepare the request body
  const body = JSON.stringify({
    staff: payload.staff.map(s => ({
      ...s,
      createdAt: undefined, // Remove Date fields that don't serialize well
    })),
    availability: payload.availability,
    requirements: payload.requirements,
    locations: payload.locations,
    qualifications: payload.qualifications,
    weekStartDate: payload.weekStartDate.toISOString(),
    constraints: {
      minHoursPerStaff: payload.constraints.minHoursPerStaff,
      maxHoursPerStaff: payload.constraints.maxHoursPerStaff,
      balanceHours: payload.constraints.balanceHours ?? true,
      respectPreferences: payload.constraints.respectPreferences ?? true,
      lockedShiftIds: payload.constraints.lockedShiftIds || [],
      allowSplitShifts: payload.constraints.allowSplitShifts ?? false,
      minOverlapHours: payload.constraints.minOverlapHours ?? 2,
      solveSeconds: payload.constraints.solveSeconds ?? 10,
      solutionPoolSize: payload.constraints.solutionPoolSize ?? 3,
    },
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Solver service error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as SolverResponse;
    
    if (!data.solutions || data.solutions.length === 0) {
      console.warn('Solver returned no solutions');
      return null;
    }

    return data.solutions.map(normalizeScheduleResult);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.warn('Solver request timed out');
      } else {
        console.warn('Solver service error:', error.message);
      }
    }
    throw error;
  }
}
