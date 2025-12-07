import unittest
from datetime import datetime

from solver import solve_schedule
from schemas import (
    Availability,
    Location,
    Qualification,
    ScheduleConstraints,
    ShiftRequirement,
    SolveRequest,
    Staff,
)


class SplitShiftMaxHoursTest(unittest.TestCase):
    def test_split_shifts_respect_max_hours_and_segments(self):
        """
        When split shifts are allowed, assignments should not exceed max hours
        and the emitted shifts should reflect only the hours actually worked.
        """
        staff_member = Staff(
            id="s1",
            name="Alexis",
            color="#000",
            qualifications=[],
            maxHoursPerWeek=5,
            minHoursPerWeek=0,
            employmentType="full-time",
        )

        # Two four-hour requirements on the same day.
        req_morning = ShiftRequirement(
            id="req1",
            locationId="loc1",
            dayOfWeek=0,
            startHour=8,
            endHour=12,
            requiredQualifications=[],
            minStaff=1,
            maxStaff=1,
        )
        req_afternoon = ShiftRequirement(
            id="req2",
            locationId="loc1",
            dayOfWeek=0,
            startHour=12,
            endHour=16,
            requiredQualifications=[],
            minStaff=1,
            maxStaff=1,
        )

        # Availability only covers 2 hours of each requirement (total 4h).
        availability = [
            Availability(id="a1", staffId="s1", dayOfWeek=0, startHour=8, endHour=10),
            Availability(id="a2", staffId="s1", dayOfWeek=0, startHour=14, endHour=16),
        ]

        request = SolveRequest(
            staff=[staff_member],
            availability=availability,
            requirements=[req_morning, req_afternoon],
            locations=[Location(id="loc1", name="Main", color="#111")],
            qualifications=[Qualification(id="q1", name="Gen", color="#222")],
            weekStartDate=datetime.utcnow(),
            constraints=ScheduleConstraints(
                allowSplitShifts=True,
                minOverlapHours=1,
                balanceHours=True,
                respectPreferences=True,
                lockedShiftIds=[],
                solveSeconds=2.0,
            ),
        )

        results = solve_schedule(request)
        self.assertTrue(results, "Solver should return at least one solution")
        result = results[0]

        overtime_warnings = [w for w in result.warnings if w.type == "overtime"]
        self.assertFalse(overtime_warnings, f"Unexpected overtime warnings: {overtime_warnings}")

        total_shift_hours = sum(s.endHour - s.startHour for s in result.schedule.shifts)
        self.assertEqual(total_shift_hours, 4, f"Expected 4h assigned, got {total_shift_hours}h")

        staff_hours = result.stats.hoursPerStaff.get("s1", 0)
        self.assertLessEqual(
            staff_hours,
            staff_member.maxHoursPerWeek,
            f"Assigned {staff_hours}h which exceeds max {staff_member.maxHoursPerWeek}h",
        )


if __name__ == "__main__":
    unittest.main()

