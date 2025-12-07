// Core data types for Staff Scheduler

export interface Staff {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  color: string;
  qualifications: string[];
  maxHoursPerWeek: number;
  minHoursPerWeek: number;
  employmentType: 'full-time' | 'part-time';
  avatar?: string;
  createdAt: Date;
}

export interface Availability {
  id: string;
  staffId: string;
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  startHour: number; // 0-23
  endHour: number; // 0-23
  isPreferred?: boolean; // Staff prefers this time
}

export interface BlockedTime {
  id: string;
  staffId: string;
  date: Date;
  startHour: number;
  endHour: number;
  reason?: string;
}

export interface Location {
  id: string;
  name: string;
  color: string;
}

export interface Qualification {
  id: string;
  name: string;
  color: string;
}

export interface ShiftRequirement {
  id: string;
  locationId: string;
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  requiredQualifications: string[]; // Qualification IDs
  minStaff: number;
  maxStaff: number;
}

export interface ScheduledShift {
  id: string;
  staffId: string;
  requirementId: string;
  date: Date;
  startHour: number;
  endHour: number;
  locationId: string;
  isLocked?: boolean; // Prevent auto-scheduler from changing
}

export interface Schedule {
  id: string;
  weekStartDate: Date;
  shifts: ScheduledShift[];
  generatedAt: Date;
  isPublished: boolean;
}

export interface ScheduleConstraints {
  minHoursPerStaff?: number;
  maxHoursPerStaff?: number;
  balanceHours: boolean; // Try to give everyone similar hours
  respectPreferences: boolean;
  lockedShiftIds: string[]; // Don't change these assignments
  allowSplitShifts: boolean; // Allow staff to be assigned even if they don't cover the full shift
  minOverlapHours?: number; // Minimum hours of overlap required for split shifts (default: 2)
  solveSeconds?: number; // Time limit for solver (default: 10)
  solutionPoolSize?: number; // Number of alternative solutions to generate
}

// Global scheduler settings
export interface SchedulerSettings {
  allowSplitShifts: boolean;
  minOverlapHours: number;
  balanceHoursByDefault: boolean;
}

export interface ScheduleResult {
  schedule: Schedule;
  warnings: ScheduleWarning[];
  stats: ScheduleStats;
}

export interface ScheduleWarning {
  type: 'unfilled' | 'overtime' | 'undertime' | 'preference_ignored' | 'qualification_mismatch';
  message: string;
  requirementId?: string;
  staffId?: string;
}

export interface ScheduleStats {
  totalShifts: number;
  filledShifts: number;
  totalHours: number;
  hoursPerStaff: Record<string, number>;
  coveragePercentage: number;
  // Hour-based coverage tracking
  requiredHours: number; // Total hours needed across all requirements
  coveredHours: number; // Actual unique hours covered (not double-counting overlaps)
  uncoveredGaps: UncoveredGap[]; // Gaps that still need coverage
}

export interface UncoveredGap {
  requirementId: string;
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  locationId: string;
}

// Helper types
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAYS_OF_WEEK = [
  'Sunday',
  'Monday', 
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

export function formatHourRange(start: number, end: number): string {
  return `${formatHour(start)} - ${formatHour(end)}`;
}

// Color palette for staff members
export const STAFF_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#10b981', // emerald
  '#f59e0b', // amber
  '#06b6d4', // cyan
  '#f97316', // orange
  '#f43f5e', // rose
  '#14b8a6', // teal
  '#84cc16', // lime
  '#6366f1', // indigo
  '#a855f7', // violet
  '#22c55e', // green
  '#eab308', // yellow
  '#ef4444', // red
  '#0ea5e9', // sky
];

export function getNextStaffColor(existingColors: string[]): string {
  const available = STAFF_COLORS.filter(c => !existingColors.includes(c));
  return available.length > 0 ? available[0] : STAFF_COLORS[Math.floor(Math.random() * STAFF_COLORS.length)];
}

