from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Literal

from pydantic import BaseModel, Field


class Staff(BaseModel):
    id: str
    name: str
    color: str
    qualifications: List[str] = Field(default_factory=list)
    maxHoursPerWeek: int
    minHoursPerWeek: int = 0
    employmentType: Literal["full-time", "part-time"] = "full-time"
    email: Optional[str] = None
    phone: Optional[str] = None
    avatar: Optional[str] = None


class Availability(BaseModel):
    id: str
    staffId: str
    dayOfWeek: int  # 0-6
    startHour: int
    endHour: int
    isPreferred: bool | None = None


class Location(BaseModel):
    id: str
    name: str
    color: str


class Qualification(BaseModel):
    id: str
    name: str
    color: str


class ShiftRequirement(BaseModel):
    id: str
    locationId: str
    dayOfWeek: int
    startHour: int
    endHour: int
    requiredQualifications: List[str] = Field(default_factory=list)
    minStaff: int
    maxStaff: int


class ScheduleConstraints(BaseModel):
    minHoursPerStaff: Optional[int] = None
    maxHoursPerStaff: Optional[int] = None
    balanceHours: bool = True
    respectPreferences: bool = True
    lockedShiftIds: List[str] = Field(default_factory=list)
    allowSplitShifts: bool = False
    minOverlapHours: Optional[int] = 2
    solveSeconds: float = 10.0
    solutionPoolSize: int = 3


class ScheduledShift(BaseModel):
    id: str
    staffId: str
    requirementId: str
    date: datetime
    startHour: int
    endHour: int
    locationId: str
    isLocked: bool = False


class Schedule(BaseModel):
    id: str
    weekStartDate: datetime
    shifts: List[ScheduledShift]
    generatedAt: datetime
    isPublished: bool = False


class ScheduleWarning(BaseModel):
    type: Literal[
        "unfilled",
        "overtime",
        "undertime",
        "preference_ignored",
        "qualification_mismatch",
    ]
    message: str
    requirementId: Optional[str] = None
    staffId: Optional[str] = None


class UncoveredGap(BaseModel):
    requirementId: str
    dayOfWeek: int
    startHour: int
    endHour: int
    locationId: str


class ScheduleStats(BaseModel):
    totalShifts: int
    filledShifts: int
    totalHours: int
    hoursPerStaff: dict[str, int]
    coveragePercentage: float
    requiredHours: int
    coveredHours: int
    uncoveredGaps: List[UncoveredGap]


class ScheduleResult(BaseModel):
    schedule: Schedule
    warnings: List[ScheduleWarning]
    stats: ScheduleStats


class SolveRequest(BaseModel):
    staff: List[Staff]
    availability: List[Availability]
    requirements: List[ShiftRequirement]
    locations: List[Location]
    qualifications: List[Qualification]
    weekStartDate: datetime
    constraints: ScheduleConstraints


class SolveResponse(BaseModel):
    solutions: List[ScheduleResult]
    bestIndex: int

