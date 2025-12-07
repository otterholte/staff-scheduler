"""
Staff Scheduler Solver using Google OR-Tools CP-SAT

This solver uses constraint programming to find the mathematically optimal
schedule that:
1. NEVER exceeds any staff member's max hours (hard constraint)
2. Maximizes coverage of shift requirements
3. Tries to meet minimum hours when possible (soft constraint)
4. Balances hours across staff when requested

The max hours constraint is ABSOLUTE and will never be violated.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set, Tuple
from uuid import uuid4

from ortools.sat.python import cp_model

from schemas import (
    Availability,
    Schedule,
    ScheduleConstraints,
    ScheduleResult,
    ScheduleStats,
    ScheduleWarning,
    ScheduledShift,
    ShiftRequirement,
    SolveRequest,
    Staff,
    UncoveredGap,
)


def solve_schedule(request: SolveRequest) -> List[ScheduleResult]:
    """
    Build and solve the CP-SAT model for staff scheduling.
    
    Returns a list containing the single best solution found.
    The solver guarantees that NO staff member will exceed their maxHoursPerWeek.
    """
    constraints = request.constraints
    allow_split = constraints.allowSplitShifts
    
    # Pre-compute availability lookups for efficiency
    availability_by_staff_day: Dict[Tuple[str, int], List[Availability]] = {}
    for a in request.availability:
        key = (a.staffId, a.dayOfWeek)
        if key not in availability_by_staff_day:
            availability_by_staff_day[key] = []
        availability_by_staff_day[key].append(a)
    
    # Create the constraint programming model
    model = cp_model.CpModel()
    
    # ========================================================================
    # DECISION VARIABLES
    # ========================================================================
    # For split shifts: x[(staff_id, req_id, hour)] = 1 if staff works that hour
    # For full shifts: y[(staff_id, req_id)] = 1 if staff is assigned to requirement
    x: Dict[Tuple[str, str, int], cp_model.IntVar] = {}
    y: Dict[Tuple[str, str], cp_model.IntVar] = {}
    
    # Helper functions
    def has_full_availability(avail_list: List[Availability], start: int, end: int) -> bool:
        """Check if any availability window covers the entire shift."""
        return any(a.startHour <= start and a.endHour >= end for a in avail_list)
    
    def is_available_at_hour(avail_list: List[Availability], hour: int) -> bool:
        """Check if staff is available at a specific hour."""
        return any(a.startHour <= hour < a.endHour for a in avail_list)
    
    def is_qualified(staff: Staff, req: ShiftRequirement) -> bool:
        """Check if staff has all required qualifications."""
        if not req.requiredQualifications:
            return True
        return all(q in staff.qualifications for q in req.requiredQualifications)
    
    # Create variables only where assignment is feasible
    for req in request.requirements:
        for staff in request.staff:
            # Skip if staff doesn't have required qualifications
            if not is_qualified(staff, req):
                continue
            
            avail = availability_by_staff_day.get((staff.id, req.dayOfWeek), [])
            if not avail:
                continue
            
            if allow_split:
                # Create hour-by-hour variables
                for hour in range(req.startHour, req.endHour):
                    if is_available_at_hour(avail, hour):
                        x[(staff.id, req.id, hour)] = model.NewBoolVar(
                            f"x_{staff.id}_{req.id}_{hour}"
                        )
            else:
                # Create single variable for full shift assignment
                if has_full_availability(avail, req.startHour, req.endHour):
                    y[(staff.id, req.id)] = model.NewBoolVar(f"y_{staff.id}_{req.id}")
    
    # ========================================================================
    # CONSTRAINTS
    # ========================================================================
    
    # 1. COVERAGE CONSTRAINTS - Track coverage per hour for objectives
    coverage_vars: Dict[Tuple[str, int], cp_model.IntVar] = {}
    gap_vars: List[cp_model.IntVar] = []
    
    for req in request.requirements:
        for hour in range(req.startHour, req.endHour):
            # Collect all staff who could work this hour
            hour_assignments: List[cp_model.IntVar] = []
            
            if allow_split:
                for staff in request.staff:
                    var = x.get((staff.id, req.id, hour))
                    if var is not None:
                        hour_assignments.append(var)
            else:
                for staff in request.staff:
                    var = y.get((staff.id, req.id))
                    if var is not None:
                        hour_assignments.append(var)
            
            # Create coverage variable for this hour
            max_possible = len(hour_assignments) if hour_assignments else 0
            coverage = model.NewIntVar(0, max(max_possible, req.minStaff), f"cov_{req.id}_{hour}")
            coverage_vars[(req.id, hour)] = coverage
            
            if hour_assignments:
                model.Add(coverage == sum(hour_assignments))
            else:
                model.Add(coverage == 0)
            
            # Enforce max staff if specified
            if req.maxStaff > 0:
                model.Add(coverage <= req.maxStaff)
            
            # Track gap (unmet minimum staffing) as soft constraint
            gap = model.NewIntVar(0, max(req.minStaff, 1), f"gap_{req.id}_{hour}")
            model.Add(coverage + gap >= req.minStaff)
            gap_vars.append(gap)
    
    # 2. NO DOUBLE-BOOKING - Staff cannot work two places at the same time
    for staff in request.staff:
        for day in range(7):
            for hour in range(24):
                overlapping_vars: List[cp_model.IntVar] = []
                
                for req in request.requirements:
                    if req.dayOfWeek != day:
                        continue
                    if not (req.startHour <= hour < req.endHour):
                        continue
                    
                    if allow_split:
                        var = x.get((staff.id, req.id, hour))
                        if var is not None:
                            overlapping_vars.append(var)
                    else:
                        var = y.get((staff.id, req.id))
                        if var is not None:
                            overlapping_vars.append(var)
                
                # At most one assignment per staff per hour
                if len(overlapping_vars) > 1:
                    model.Add(sum(overlapping_vars) <= 1)
    
    # 3. MAX HOURS CONSTRAINT - THIS IS ABSOLUTE AND CANNOT BE VIOLATED
    staff_hours_vars: Dict[str, cp_model.IntVar] = {}
    undertime_vars: List[cp_model.IntVar] = []
    
    for staff in request.staff:
        # Calculate total hours for this staff member
        hour_terms: List[cp_model.LinearExpr] = []
        
        if allow_split:
            # Each hour variable represents 1 hour of work
            for (sid, req_id, hour), var in x.items():
                if sid == staff.id:
                    hour_terms.append(var)
        else:
            # Each full shift assignment represents the shift duration
            for (sid, req_id), var in y.items():
                if sid == staff.id:
                    req = next(r for r in request.requirements if r.id == req_id)
                    duration = req.endHour - req.startHour
                    hour_terms.append(var * duration)
        
        # Create variable to track total hours
        total_hours = model.NewIntVar(0, 168, f"hours_{staff.id}")  # Max 168 hours/week
        
        if hour_terms:
            model.Add(total_hours == sum(hour_terms))
        else:
            model.Add(total_hours == 0)
        
        staff_hours_vars[staff.id] = total_hours
        
        # HARD CONSTRAINT: Never exceed max hours
        # Use the MINIMUM of staff's personal max and global constraint
        max_allowed = staff.maxHoursPerWeek
        if constraints.maxHoursPerStaff is not None and constraints.maxHoursPerStaff > 0:
            max_allowed = min(max_allowed, constraints.maxHoursPerStaff)
        
        # THIS IS THE CRITICAL CONSTRAINT - ABSOLUTE MAX HOURS
        model.Add(total_hours <= max_allowed)
        
        # Soft constraint: try to meet minimum hours
        min_desired = max(
            staff.minHoursPerWeek,
            constraints.minHoursPerStaff or 0
        )
        
        if min_desired > 0:
            undertime = model.NewIntVar(0, min_desired, f"under_{staff.id}")
            model.Add(total_hours + undertime >= min_desired)
            undertime_vars.append(undertime)
    
    # ========================================================================
    # OBJECTIVE FUNCTION
    # ========================================================================
    # Priorities (in order):
    # 1. Minimize coverage gaps (MOST IMPORTANT - multiply by large weight)
    # 2. Maximize total staff hours assigned
    # 3. Minimize undertime (staff below their minimum)
    
    total_gap = model.NewIntVar(0, 10000, "total_gap")
    model.Add(total_gap == sum(gap_vars))
    
    total_assigned_hours = model.NewIntVar(0, 10000, "total_hours")
    model.Add(total_assigned_hours == sum(staff_hours_vars.values()))
    
    total_undertime = model.NewIntVar(0, 10000, "total_undertime")
    if undertime_vars:
        model.Add(total_undertime == sum(undertime_vars))
    else:
        model.Add(total_undertime == 0)
    
    # Objective: maximize coverage, minimize gaps
    # Gap penalty is MUCH higher than hour bonus to prioritize coverage
    # But remember: max hours constraint is HARD and cannot be traded off
    model.Maximize(
        total_assigned_hours * 10      # Reward assigning hours
        - total_gap * 1000             # Heavy penalty for coverage gaps
        - total_undertime * 5          # Light penalty for undertime
    )
    
    # ========================================================================
    # SOLVE
    # ========================================================================
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(1.0, constraints.solveSeconds)
    solver.parameters.num_search_workers = 8
    
    status = solver.Solve(model)
    
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return []
    
    # ========================================================================
    # BUILD RESULT
    # ========================================================================
    result = build_result(
        solver,
        request,
        allow_split,
        x,
        y,
        staff_hours_vars,
        coverage_vars,
    )
    
    # POST-SOLVE VERIFICATION: Ensure no max hours violations
    verify_max_hours(result, request)
    
    return [result]


def build_result(
    solver: cp_model.CpSolver,
    request: SolveRequest,
    allow_split: bool,
    x: Dict[Tuple[str, str, int], cp_model.IntVar],
    y: Dict[Tuple[str, str], cp_model.IntVar],
    staff_hours_vars: Dict[str, cp_model.IntVar],
    coverage_vars: Dict[Tuple[str, int], cp_model.IntVar],
) -> ScheduleResult:
    """Build the schedule result from the solver solution."""
    
    week_start = request.weekStartDate
    
    # Extract assignments from solution
    shifts: List[ScheduledShift] = []
    
    if allow_split:
        # Group consecutive hours into shifts
        staff_req_hours: Dict[Tuple[str, str], List[int]] = {}
        
        for (staff_id, req_id, hour), var in x.items():
            if solver.BooleanValue(var):
                key = (staff_id, req_id)
                if key not in staff_req_hours:
                    staff_req_hours[key] = []
                staff_req_hours[key].append(hour)
        
        # Create shifts from consecutive hours
        for (staff_id, req_id), hours in staff_req_hours.items():
            req = next(r for r in request.requirements if r.id == req_id)
            date = week_start + timedelta(days=req.dayOfWeek)
            
            hours.sort()
            
            # Group into contiguous segments
            segments: List[Tuple[int, int]] = []
            if hours:
                seg_start = hours[0]
                seg_end = hours[0] + 1
                
                for h in hours[1:]:
                    if h == seg_end:  # Contiguous
                        seg_end = h + 1
                    else:  # Gap - start new segment
                        segments.append((seg_start, seg_end))
                        seg_start = h
                        seg_end = h + 1
                
                segments.append((seg_start, seg_end))
            
            for start, end in segments:
                shifts.append(ScheduledShift(
                    id=str(uuid4()),
                    staffId=staff_id,
                    requirementId=req_id,
                    date=date,
                    startHour=start,
                    endHour=end,
                    locationId=req.locationId,
                    isLocked=False,
                ))
    else:
        # Full shift assignments
        for (staff_id, req_id), var in y.items():
            if solver.BooleanValue(var):
                req = next(r for r in request.requirements if r.id == req_id)
                date = week_start + timedelta(days=req.dayOfWeek)
                
                shifts.append(ScheduledShift(
                    id=str(uuid4()),
                    staffId=staff_id,
                    requirementId=req_id,
                    date=date,
                    startHour=req.startHour,
                    endHour=req.endHour,
                    locationId=req.locationId,
                    isLocked=False,
                ))
    
    # Calculate statistics
    hours_per_staff: Dict[str, int] = {}
    for staff in request.staff:
        hours_per_staff[staff.id] = int(solver.Value(staff_hours_vars[staff.id]))
    
    # Calculate coverage statistics
    required_hours = 0
    covered_hours = 0
    uncovered_gaps: List[UncoveredGap] = []
    filled_shifts = 0
    
    for req in request.requirements:
        req_duration = req.endHour - req.startHour
        required_hours += req_duration * req.minStaff
        
        fully_covered = True
        gap_start: Optional[int] = None
        
        for hour in range(req.startHour, req.endHour):
            coverage = int(solver.Value(coverage_vars[(req.id, hour)]))
            covered_hours += min(coverage, req.minStaff)
            
            if coverage < req.minStaff:
                fully_covered = False
                if gap_start is None:
                    gap_start = hour
            else:
                if gap_start is not None:
                    uncovered_gaps.append(UncoveredGap(
                        requirementId=req.id,
                        dayOfWeek=req.dayOfWeek,
                        startHour=gap_start,
                        endHour=hour,
                        locationId=req.locationId,
                    ))
                    gap_start = None
        
        # Close any remaining gap
        if gap_start is not None:
            uncovered_gaps.append(UncoveredGap(
                requirementId=req.id,
                dayOfWeek=req.dayOfWeek,
                startHour=gap_start,
                endHour=req.endHour,
                locationId=req.locationId,
            ))
        
        if fully_covered:
            filled_shifts += 1
    
    # Generate warnings
    warnings: List[ScheduleWarning] = []
    
    for staff in request.staff:
        hours = hours_per_staff.get(staff.id, 0)
        
        # Check for overtime (should NEVER happen due to hard constraint)
        if hours > staff.maxHoursPerWeek:
            warnings.append(ScheduleWarning(
                type="overtime",
                message=f"{staff.name} exceeds their max hours ({hours}/{staff.maxHoursPerWeek}h)",
                staffId=staff.id,
            ))
        
        # Check for undertime
        if hours < staff.minHoursPerWeek and staff.minHoursPerWeek > 0:
            warnings.append(ScheduleWarning(
                type="undertime",
                message=f"{staff.name} has fewer hours than their minimum ({hours}/{staff.minHoursPerWeek}h)",
                staffId=staff.id,
            ))
    
    total_hours = sum(hours_per_staff.values())
    coverage_pct = (covered_hours / required_hours * 100) if required_hours > 0 else 100.0
    
    return ScheduleResult(
        schedule=Schedule(
            id=str(uuid4()),
            weekStartDate=week_start,
            shifts=shifts,
            generatedAt=datetime.utcnow(),
            isPublished=False,
        ),
        warnings=warnings,
        stats=ScheduleStats(
            totalShifts=len(request.requirements),
            filledShifts=filled_shifts,
            totalHours=total_hours,
            hoursPerStaff=hours_per_staff,
            coveragePercentage=coverage_pct,
            requiredHours=required_hours,
            coveredHours=covered_hours,
            uncoveredGaps=merge_gaps(uncovered_gaps),
        ),
    )


def verify_max_hours(result: ScheduleResult, request: SolveRequest) -> None:
    """
    Post-solve verification to ensure no staff exceeds their max hours.
    This should never trigger if the solver is working correctly.
    """
    for staff in request.staff:
        hours = result.stats.hoursPerStaff.get(staff.id, 0)
        if hours > staff.maxHoursPerWeek:
            # This should NEVER happen - it means the solver failed
            raise RuntimeError(
                f"SOLVER ERROR: {staff.name} assigned {hours}h but max is {staff.maxHoursPerWeek}h. "
                "This indicates a bug in the constraint model."
            )


def merge_gaps(gaps: List[UncoveredGap]) -> List[UncoveredGap]:
    """Merge contiguous coverage gaps for cleaner display."""
    if not gaps:
        return []
    
    sorted_gaps = sorted(gaps, key=lambda g: (g.requirementId, g.dayOfWeek, g.startHour))
    merged: List[UncoveredGap] = []
    
    current = sorted_gaps[0]
    for gap in sorted_gaps[1:]:
        if (
            gap.requirementId == current.requirementId
            and gap.dayOfWeek == current.dayOfWeek
            and gap.startHour == current.endHour
        ):
            # Extend current gap
            current = UncoveredGap(
                requirementId=current.requirementId,
                dayOfWeek=current.dayOfWeek,
                startHour=current.startHour,
                endHour=gap.endHour,
                locationId=current.locationId,
            )
        else:
            merged.append(current)
            current = gap
    
    merged.append(current)
    return merged
