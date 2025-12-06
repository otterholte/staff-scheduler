'use client';

import React, { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { generateSchedule, regenerateSchedule, generateScheduleVariants } from '@/lib/scheduler';
import { Navigation } from '@/components/Navigation';
import { ScheduleGrid } from '@/components/ScheduleGrid';
import { ScheduleStatsDisplay } from '@/components/ScheduleStats';
import { GenerateButton } from '@/components/GenerateButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ScheduleWarning, ScheduleStats, ScheduleConstraints, UncoveredGap } from '@/lib/types';

export default function Dashboard() {
  const {
    staff,
    availability,
    requirements,
    locations,
    qualifications,
    currentSchedule,
    selectedWeekStart,
    isGenerating,
    schedulerSettings,
    scheduleVariants,
    currentVariantIndex,
    setCurrentSchedule,
    setScheduleVariants,
    cycleToNextVariant,
    setIsGenerating,
    setSelectedWeek,
    lockShift,
    updateSchedulerSettings,
  } = useStore();

  const [scheduleStats, setScheduleStats] = useState<ScheduleStats | null>(null);
  const [scheduleWarnings, setScheduleWarnings] = useState<ScheduleWarning[]>([]);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [minHours, setMinHours] = useState(0);
  const [maxHours, setMaxHours] = useState(40);
  const [balanceHours, setBalanceHours] = useState(true);

  // Helper function to get actual hours a staff member works for a requirement
  const getActualShiftHours = (
    staffId: string,
    requirement: { startHour: number; endHour: number; dayOfWeek: number }
  ): { startHour: number; endHour: number } => {
    if (!schedulerSettings.allowSplitShifts) {
      return { startHour: requirement.startHour, endHour: requirement.endHour };
    }

    const staffAvailability = availability.filter((a) => a.staffId === staffId);
    let bestOverlap: { start: number; end: number } | null = null;
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

    if (bestOverlap && maxOverlap > 0) {
      return { startHour: bestOverlap.start, endHour: bestOverlap.end };
    }
    return { startHour: requirement.startHour, endHour: requirement.endHour };
  };

  // Recalculate stats when schedule changes
  useEffect(() => {
    if (currentSchedule) {
      // Recalculate stats from the current schedule
      const hoursPerStaff: Record<string, number> = {};
      const warnings: ScheduleWarning[] = [];

      // Calculate hours per staff
      currentSchedule.shifts.forEach((shift) => {
        const requirement = requirements.find((r) => r.id === shift.requirementId);
        if (!requirement) return;

        const actualHours = getActualShiftHours(shift.staffId, requirement);
        const duration = actualHours.endHour - actualHours.startHour;
        hoursPerStaff[shift.staffId] = (hoursPerStaff[shift.staffId] || 0) + duration;
      });

      // Check for warnings
      staff.forEach((s) => {
        const hours = hoursPerStaff[s.id] || 0;
        if (hours < s.minHoursPerWeek && s.minHoursPerWeek > 0) {
          warnings.push({
            type: 'undertime',
            message: `${s.name} has fewer hours than their minimum (${hours}/${s.minHoursPerWeek}h)`,
            staffId: s.id,
          });
        }
        if (hours > s.maxHoursPerWeek) {
          warnings.push({
            type: 'overtime',
            message: `${s.name} exceeds their max hours (${hours}/${s.maxHoursPerWeek}h)`,
            staffId: s.id,
          });
        }
      });

      // Calculate TRUE hour-based coverage
      // For each requirement, we need minStaff people covering each hour
      // Track which hours are covered and find gaps
      let totalRequiredHours = 0; // Total staff-hours needed
      let totalCoveredHours = 0; // Actual staff-hours covered
      const uncoveredGaps: UncoveredGap[] = [];
      let shiftsFullyCovered = 0;

      requirements.forEach((req) => {
        const reqDuration = req.endHour - req.startHour;
        const reqHoursNeeded = reqDuration * req.minStaff; // Total staff-hours needed for this requirement
        totalRequiredHours += reqHoursNeeded;

        // Get all shifts for this requirement
        const shiftsForReq = currentSchedule.shifts.filter((s) => s.requirementId === req.id);

        // Track coverage for each hour in the requirement
        // Each hour needs minStaff people
        const hourCoverage: Record<number, number> = {}; // hour -> count of staff covering
        for (let h = req.startHour; h < req.endHour; h++) {
          hourCoverage[h] = 0;
        }

        // Count coverage per hour
        shiftsForReq.forEach((shift) => {
          const actualHours = getActualShiftHours(shift.staffId, req);
          for (let h = actualHours.startHour; h < actualHours.endHour; h++) {
            if (h >= req.startHour && h < req.endHour) {
              hourCoverage[h] = (hourCoverage[h] || 0) + 1;
            }
          }
        });

        // Calculate covered staff-hours (capped at minStaff per hour, don't double-count)
        let reqCoveredHours = 0;
        let isFullyCovered = true;
        let gapStart: number | null = null;

        for (let h = req.startHour; h < req.endHour; h++) {
          const coverage = hourCoverage[h] || 0;
          // Each hour contributes up to minStaff covered staff-hours
          reqCoveredHours += Math.min(coverage, req.minStaff);

          // Track gaps (hours where we don't have enough staff)
          if (coverage < req.minStaff) {
            isFullyCovered = false;
            if (gapStart === null) {
              gapStart = h;
            }
          } else {
            // Close any open gap
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

        // Close any gap at the end
        if (gapStart !== null) {
          uncoveredGaps.push({
            requirementId: req.id,
            dayOfWeek: req.dayOfWeek,
            startHour: gapStart,
            endHour: req.endHour,
            locationId: req.locationId,
          });
        }

        totalCoveredHours += reqCoveredHours;
        if (isFullyCovered) {
          shiftsFullyCovered++;
        }
      });

      const totalShifts = requirements.length; // Number of requirements
      const filledShifts = shiftsFullyCovered; // Requirements that are fully covered
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

      setScheduleStats(stats);
      setScheduleWarnings(warnings);
    } else {
      setScheduleStats(null);
      setScheduleWarnings([]);
    }
  }, [currentSchedule, staff, requirements, availability, schedulerSettings.allowSplitShifts]);

  // Week navigation
  const goToPreviousWeek = () => {
    const newDate = new Date(selectedWeekStart);
    newDate.setDate(newDate.getDate() - 7);
    setSelectedWeek(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(selectedWeekStart);
    newDate.setDate(newDate.getDate() + 7);
    setSelectedWeek(newDate);
  };

  const goToCurrentWeek = () => {
    setSelectedWeek(new Date());
  };

  // Generate schedule - creates multiple variants and picks the best one
  const handleGenerate = async () => {
    if (staff.length === 0 || requirements.length === 0) return;

    setIsGenerating(true);
    await new Promise((r) => setTimeout(r, 300)); // Brief visual feedback

    try {
      const { variants } = generateScheduleVariants({
        staff,
        availability,
        requirements,
        locations,
        qualifications,
        weekStartDate: selectedWeekStart,
        constraints: {
          balanceHours: schedulerSettings.balanceHoursByDefault,
          respectPreferences: true,
          lockedShiftIds: [],
          allowSplitShifts: schedulerSettings.allowSplitShifts,
          minOverlapHours: schedulerSettings.minOverlapHours,
        },
      }, 100, 3); // Generate 100 candidates, keep top 3

      if (variants.length > 0) {
        // Store all variants and select the best one (index 0)
        setScheduleVariants(variants.map(v => v.schedule), 0);
        setScheduleStats(variants[0].stats);
        setScheduleWarnings(variants[0].warnings);
      }
    } catch (error) {
      console.error('Failed to generate schedule:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Cycle through schedule variants (top 3 options)
  const handleCycleVariant = () => {
    if (scheduleVariants.length <= 1) return;
    
    const newIndex = cycleToNextVariant();
    // Recalculate stats will happen via useEffect when currentSchedule changes
  };

  // Regenerate with constraints - generates new variants with the specified constraints
  const handleRegenerate = async () => {
    if (!currentSchedule) return;

    setShowRegenerateModal(false);
    setIsGenerating(true);
    await new Promise((r) => setTimeout(r, 300));

    try {
      const lockedShiftIds = currentSchedule.shifts
        .filter((s) => s.isLocked)
        .map((s) => s.id);

      // Generate new variants with updated constraints
      const { variants } = generateScheduleVariants({
        staff,
        availability,
        requirements,
        locations,
        qualifications,
        weekStartDate: selectedWeekStart,
        constraints: {
          balanceHours,
          respectPreferences: true,
          lockedShiftIds,
          minHoursPerStaff: minHours,
          maxHoursPerStaff: maxHours,
          allowSplitShifts: schedulerSettings.allowSplitShifts,
          minOverlapHours: schedulerSettings.minOverlapHours,
        },
      }, 100, 3);

      if (variants.length > 0) {
        setScheduleVariants(variants.map(v => v.schedule), 0);
        setScheduleStats(variants[0].stats);
        setScheduleWarnings(variants[0].warnings);
      }
    } catch (error) {
      console.error('Failed to regenerate schedule:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Toggle shift lock
  const handleToggleLock = (shiftId: string) => {
    lockShift(shiftId, !currentSchedule?.shifts.find((s) => s.id === shiftId)?.isLocked);
  };

  // Format week range
  const formatWeekRange = () => {
    const start = new Date(selectedWeekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    return `${startStr} - ${endStr}`;
  };

  const canGenerate = staff.length > 0 && requirements.length > 0;
  const hasAvailability = availability.length > 0;

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Schedule</h1>
            <p className="text-white/60 mt-1">
              {staff.length} staff • {requirements.length} shifts/week
            </p>
          </div>

          {/* Week Navigation */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={goToPreviousWeek}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
            <button
              onClick={goToCurrentWeek}
              className="px-4 py-2 text-sm font-medium text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
            >
              {formatWeekRange()}
            </button>
            <Button variant="ghost" size="sm" onClick={goToNextWeek}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Button>
          </div>
        </div>

        {/* Empty States */}
        {staff.length === 0 ? (
          <EmptyState
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            }
            title="Add your team first"
            description="Start by adding staff members to build your schedule"
            action={{
              label: 'Add Staff',
              onClick: () => (window.location.href = '/staff'),
            }}
          />
        ) : requirements.length === 0 ? (
          <EmptyState
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
            title="Define your shift requirements"
            description="Add shifts and coverage needs to generate a schedule"
            action={{
              label: 'Add Requirements',
              onClick: () => (window.location.href = '/requirements'),
            }}
          />
        ) : !hasAvailability ? (
          <Card padding="lg" className="mb-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-white mb-1">Set Staff Availability</h3>
                <p className="text-sm text-white/60 mb-3">
                  No availability has been set. The scheduler needs to know when staff can work to generate optimal schedules.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => (window.location.href = '/availability')}
                >
                  Set Availability
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        {/* Generate Button - The Magic Button! */}
        {canGenerate && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <div className="flex items-center gap-2">
              <Button
                size="lg"
                onClick={handleGenerate}
                isLoading={isGenerating}
                className="w-full sm:w-auto text-lg px-8 py-4 shadow-glow"
                icon={
                  !isGenerating && (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  )
                }
              >
                {isGenerating ? 'Generating...' : currentSchedule ? 'Regenerate All' : 'Generate Schedule'}
              </Button>

              {/* Cycle through variants button */}
              {currentSchedule && scheduleVariants.length > 1 && (
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={handleCycleVariant}
                  className="relative"
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  }
                >
                  Option {currentVariantIndex + 1}/{scheduleVariants.length}
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              {currentSchedule && (
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => setShowRegenerateModal(true)}
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                  }
                >
                  Constraints
                </Button>
              )}
              <Button
                variant="ghost"
                size="lg"
                onClick={() => setShowSettingsModal(true)}
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                }
              >
                Settings
              </Button>
            </div>
          </div>
        )}

        {/* Schedule Grid & Stats */}
        {currentSchedule ? (
          <div className="space-y-6">
            <Card padding="lg">
              <ScheduleGrid
                schedule={currentSchedule}
                staff={staff}
                locations={locations}
                requirements={requirements}
                weekStartDate={selectedWeekStart}
                availability={availability}
                schedulerSettings={schedulerSettings}
                uncoveredGaps={scheduleStats?.uncoveredGaps || []}
                onToggleLock={handleToggleLock}
              />
            </Card>

            {scheduleStats && (
                <ScheduleStatsDisplay
                  stats={scheduleStats}
                  warnings={scheduleWarnings}
                  staff={staff}
                />
            )}
          </div>
        ) : canGenerate ? (
          <Card padding="lg">
            <ScheduleGrid
              schedule={null}
              staff={staff}
              locations={locations}
              requirements={requirements}
              weekStartDate={selectedWeekStart}
              availability={availability}
              schedulerSettings={schedulerSettings}
            />
            <div className="text-center py-8">
              <p className="text-white/40">
                Click &quot;Generate Schedule&quot; to auto-fill shifts
              </p>
            </div>
          </Card>
        ) : null}
      </main>

      {/* Regenerate Modal */}
      <Modal
        isOpen={showRegenerateModal}
        onClose={() => setShowRegenerateModal(false)}
        title="Adjust Constraints"
        description="Fine-tune the schedule generation"
        size="md"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Min Hours/Person"
              type="number"
              min={0}
              max={maxHours}
              value={minHours}
              onChange={(e) => setMinHours(Number(e.target.value))}
            />
            <Input
              label="Max Hours/Person"
              type="number"
              min={minHours}
              max={168}
              value={maxHours}
              onChange={(e) => setMaxHours(Number(e.target.value))}
            />
          </div>

          <Toggle
            checked={balanceHours}
            onChange={setBalanceHours}
            label="Balance Hours"
            description="Try to give everyone similar hours"
          />

          <div className="bg-white/5 rounded-xl p-4">
            <h4 className="text-sm font-medium text-white mb-2">Locked Shifts</h4>
            <p className="text-sm text-white/60">
              {currentSchedule?.shifts.filter((s) => s.isLocked).length || 0} shifts are locked and won&apos;t change.
              Click the lock icon on any shift to lock/unlock it.
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              variant="ghost"
              onClick={() => setShowRegenerateModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button onClick={handleRegenerate} className="flex-1">
              Regenerate
            </Button>
          </div>
        </div>
      </Modal>

      {/* Settings Modal */}
      <Modal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        title="Scheduler Settings"
        description="Configure how schedules are generated"
        size="md"
      >
        <div className="space-y-6">
          <Toggle
            checked={schedulerSettings.allowSplitShifts}
            onChange={(checked) => updateSchedulerSettings({ allowSplitShifts: checked })}
            label="Allow Split Shifts"
            description="Staff can be assigned to shifts even if they don't have full availability for the entire duration"
          />

          {schedulerSettings.allowSplitShifts && (
            <div className="ml-6 pl-4 border-l-2 border-white/10">
              <Input
                label="Minimum Overlap Hours"
                type="number"
                min={1}
                max={12}
                value={schedulerSettings.minOverlapHours}
                onChange={(e) => updateSchedulerSettings({ minOverlapHours: Number(e.target.value) })}
              />
              <p className="text-xs text-white/50 mt-1">
                Staff must be available for at least this many hours of the shift
              </p>
            </div>
          )}

          <Toggle
            checked={schedulerSettings.balanceHoursByDefault}
            onChange={(checked) => updateSchedulerSettings({ balanceHoursByDefault: checked })}
            label="Balance Hours by Default"
            description="Automatically distribute hours evenly across all staff"
          />

          <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl p-4 border border-blue-500/20">
            <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              How Split Shifts Work
            </h4>
            <p className="text-sm text-white/60">
              When enabled, staff with partial availability can still be assigned to shifts. 
              For example, if a shift is 9 AM - 5 PM and someone is only available 9 AM - 2 PM, 
              they can still be assigned if they meet the minimum overlap requirement.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={() => setShowSettingsModal(false)}
              className="flex-1"
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

