'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type {
  Staff,
  Availability,
  BlockedTime,
  Location,
  Qualification,
  ShiftRequirement,
  Schedule,
  ScheduledShift,
  SchedulerSettings,
} from './types';
import { STAFF_COLORS } from './types';

interface StoreState {
  // Data
  staff: Staff[];
  availability: Availability[];
  blockedTimes: BlockedTime[];
  locations: Location[];
  qualifications: Qualification[];
  requirements: ShiftRequirement[];
  schedules: Schedule[];
  currentSchedule: Schedule | null;

  // Schedule variants (top 3 options sorted by coverage)
  scheduleVariants: Schedule[];
  currentVariantIndex: number;

  // Settings
  schedulerSettings: SchedulerSettings;

  // UI State
  selectedStaffId: string | null;
  selectedWeekStart: Date;
  isGenerating: boolean;

  // Settings Actions
  updateSchedulerSettings: (settings: Partial<SchedulerSettings>) => void;

  // Staff Actions
  addStaff: (staff: Omit<Staff, 'id' | 'createdAt' | 'color'>) => Staff;
  updateStaff: (id: string, updates: Partial<Staff>) => void;
  removeStaff: (id: string) => void;

  // Availability Actions
  setAvailability: (staffId: string, availability: Omit<Availability, 'id' | 'staffId'>[]) => void;
  addBlockedTime: (blockedTime: Omit<BlockedTime, 'id'>) => void;
  removeBlockedTime: (id: string) => void;

  // Location Actions
  addLocation: (name: string) => Location;
  updateLocation: (id: string, updates: Partial<Location>) => void;
  removeLocation: (id: string) => void;

  // Qualification Actions
  addQualification: (name: string) => Qualification;
  updateQualification: (id: string, updates: Partial<Qualification>) => void;
  removeQualification: (id: string) => void;

  // Requirement Actions
  addRequirement: (requirement: Omit<ShiftRequirement, 'id'>) => ShiftRequirement;
  updateRequirement: (id: string, updates: Partial<ShiftRequirement>) => void;
  removeRequirement: (id: string) => void;

  // Schedule Actions
  setCurrentSchedule: (schedule: Schedule | null) => void;
  setScheduleVariants: (variants: Schedule[], initialIndex?: number) => void;
  cycleToNextVariant: () => number; // Returns new index
  updateShift: (shiftId: string, updates: Partial<ScheduledShift>) => void;
  lockShift: (shiftId: string, locked: boolean) => void;

  // UI Actions
  setSelectedStaff: (id: string | null) => void;
  setSelectedWeek: (date: Date) => void;
  setIsGenerating: (generating: boolean) => void;

  // Utilities
  getStaffById: (id: string) => Staff | undefined;
  getAvailabilityForStaff: (staffId: string) => Availability[];
  getRequirementsForDay: (dayOfWeek: number) => ShiftRequirement[];
}

const LOCATION_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#06b6d4'];
const QUAL_COLORS = ['#f97316', '#f43f5e', '#14b8a6', '#84cc16', '#6366f1', '#a855f7'];

// Get the start of the current week (Sunday)
function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // Initial Data
      staff: [],
      availability: [],
      blockedTimes: [],
      locations: [],
      qualifications: [],
      requirements: [],
      schedules: [],
      currentSchedule: null,
      scheduleVariants: [],
      currentVariantIndex: 0,

      // Settings
      schedulerSettings: {
        allowSplitShifts: false,
        minOverlapHours: 2,
        balanceHoursByDefault: true,
      },

      // UI State
      selectedStaffId: null,
      selectedWeekStart: getWeekStart(),
      isGenerating: false,

      // Settings Actions
      updateSchedulerSettings: (settings) => {
        set((state) => ({
          schedulerSettings: { ...state.schedulerSettings, ...settings },
        }));
      },

      // Staff Actions
      addStaff: (staffData) => {
        const existingColors = get().staff.map(s => s.color);
        const availableColors = STAFF_COLORS.filter(c => !existingColors.includes(c));
        const color = availableColors.length > 0 
          ? availableColors[0] 
          : STAFF_COLORS[Math.floor(Math.random() * STAFF_COLORS.length)];

        const newStaff: Staff = {
          ...staffData,
          id: uuidv4(),
          color,
          createdAt: new Date(),
        };
        set((state) => ({ staff: [...state.staff, newStaff] }));
        return newStaff;
      },

      updateStaff: (id, updates) => {
        set((state) => ({
          staff: state.staff.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        }));
      },

      removeStaff: (id) => {
        set((state) => ({
          staff: state.staff.filter((s) => s.id !== id),
          availability: state.availability.filter((a) => a.staffId !== id),
          blockedTimes: state.blockedTimes.filter((b) => b.staffId !== id),
        }));
      },

      // Availability Actions
      setAvailability: (staffId, availabilityData) => {
        const newAvailability: Availability[] = availabilityData.map((a) => ({
          ...a,
          id: uuidv4(),
          staffId,
        }));
        set((state) => ({
          availability: [
            ...state.availability.filter((a) => a.staffId !== staffId),
            ...newAvailability,
          ],
        }));
      },

      addBlockedTime: (blockedTimeData) => {
        const newBlockedTime: BlockedTime = {
          ...blockedTimeData,
          id: uuidv4(),
        };
        set((state) => ({
          blockedTimes: [...state.blockedTimes, newBlockedTime],
        }));
      },

      removeBlockedTime: (id) => {
        set((state) => ({
          blockedTimes: state.blockedTimes.filter((b) => b.id !== id),
        }));
      },

      // Location Actions
      addLocation: (name) => {
        const existingColors = get().locations.map(l => l.color);
        const availableColors = LOCATION_COLORS.filter(c => !existingColors.includes(c));
        const color = availableColors.length > 0 ? availableColors[0] : LOCATION_COLORS[0];

        const newLocation: Location = {
          id: uuidv4(),
          name,
          color,
        };
        set((state) => ({ locations: [...state.locations, newLocation] }));
        return newLocation;
      },

      updateLocation: (id, updates) => {
        set((state) => ({
          locations: state.locations.map((l) => (l.id === id ? { ...l, ...updates } : l)),
        }));
      },

      removeLocation: (id) => {
        set((state) => ({
          locations: state.locations.filter((l) => l.id !== id),
          requirements: state.requirements.filter((r) => r.locationId !== id),
        }));
      },

      // Qualification Actions
      addQualification: (name) => {
        const existingColors = get().qualifications.map(q => q.color);
        const availableColors = QUAL_COLORS.filter(c => !existingColors.includes(c));
        const color = availableColors.length > 0 ? availableColors[0] : QUAL_COLORS[0];

        const newQualification: Qualification = {
          id: uuidv4(),
          name,
          color,
        };
        set((state) => ({ qualifications: [...state.qualifications, newQualification] }));
        return newQualification;
      },

      updateQualification: (id, updates) => {
        set((state) => ({
          qualifications: state.qualifications.map((q) => (q.id === id ? { ...q, ...updates } : q)),
        }));
      },

      removeQualification: (id) => {
        set((state) => ({
          qualifications: state.qualifications.filter((q) => q.id !== id),
          staff: state.staff.map((s) => ({
            ...s,
            qualifications: s.qualifications.filter((qId) => qId !== id),
          })),
          requirements: state.requirements.map((r) => ({
            ...r,
            requiredQualifications: r.requiredQualifications.filter((qId) => qId !== id),
          })),
        }));
      },

      // Requirement Actions
      addRequirement: (requirementData) => {
        const newRequirement: ShiftRequirement = {
          ...requirementData,
          id: uuidv4(),
        };
        set((state) => ({ requirements: [...state.requirements, newRequirement] }));
        return newRequirement;
      },

      updateRequirement: (id, updates) => {
        set((state) => ({
          requirements: state.requirements.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        }));
      },

      removeRequirement: (id) => {
        set((state) => ({
          requirements: state.requirements.filter((r) => r.id !== id),
        }));
      },

      // Schedule Actions
      setCurrentSchedule: (schedule) => {
        set({ currentSchedule: schedule });
        if (schedule) {
          set((state) => {
            const existingIndex = state.schedules.findIndex(
              (s) => s.weekStartDate.getTime() === schedule.weekStartDate.getTime()
            );
            if (existingIndex >= 0) {
              const newSchedules = [...state.schedules];
              newSchedules[existingIndex] = schedule;
              return { schedules: newSchedules };
            }
            return { schedules: [...state.schedules, schedule] };
          });
        }
      },

      setScheduleVariants: (variants, initialIndex = 0) => {
        set({ 
          scheduleVariants: variants, 
          currentVariantIndex: initialIndex,
          currentSchedule: variants[initialIndex] || null,
        });
      },

      cycleToNextVariant: () => {
        const state = get();
        if (state.scheduleVariants.length === 0) return 0;
        
        const nextIndex = (state.currentVariantIndex + 1) % state.scheduleVariants.length;
        set({ 
          currentVariantIndex: nextIndex,
          currentSchedule: state.scheduleVariants[nextIndex],
        });
        return nextIndex;
      },

      updateShift: (shiftId, updates) => {
        set((state) => {
          if (!state.currentSchedule) return state;
          return {
            currentSchedule: {
              ...state.currentSchedule,
              shifts: state.currentSchedule.shifts.map((s) =>
                s.id === shiftId ? { ...s, ...updates } : s
              ),
            },
          };
        });
      },

      lockShift: (shiftId, locked) => {
        get().updateShift(shiftId, { isLocked: locked });
      },

      // UI Actions
      setSelectedStaff: (id) => set({ selectedStaffId: id }),
      setSelectedWeek: (date) => set({ selectedWeekStart: getWeekStart(date) }),
      setIsGenerating: (generating) => set({ isGenerating: generating }),

      // Utilities
      getStaffById: (id) => get().staff.find((s) => s.id === id),
      getAvailabilityForStaff: (staffId) => get().availability.filter((a) => a.staffId === staffId),
      getRequirementsForDay: (dayOfWeek) => get().requirements.filter((r) => r.dayOfWeek === dayOfWeek),
    }),
    {
      name: 'staff-scheduler-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        staff: state.staff,
        availability: state.availability,
        blockedTimes: state.blockedTimes,
        locations: state.locations,
        qualifications: state.qualifications,
        requirements: state.requirements,
        schedulerSettings: state.schedulerSettings,
        schedules: state.schedules,
      }),
    }
  )
);

