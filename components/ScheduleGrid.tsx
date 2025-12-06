'use client';

import React, { useMemo, useState } from 'react';
import type { Schedule, ScheduledShift, Staff, Location, ShiftRequirement, Availability, SchedulerSettings, UncoveredGap } from '@/lib/types';
import { DAYS_SHORT, formatHour } from '@/lib/types';
import { Avatar } from './ui/Avatar';

type ViewMode = 'compact' | 'overlapping';

interface ScheduleGridProps {
  schedule: Schedule | null;
  staff: Staff[];
  locations: Location[];
  requirements: ShiftRequirement[];
  weekStartDate: Date;
  availability?: Availability[];
  schedulerSettings?: SchedulerSettings;
  uncoveredGaps?: UncoveredGap[];
  onShiftClick?: (shift: ScheduledShift) => void;
  onToggleLock?: (shiftId: string) => void;
}

// Time range to display (can be adjusted)
const START_HOUR = 6;
const END_HOUR = 22;
const HOUR_HEIGHT = 48; // pixels per hour

export function ScheduleGrid({
  schedule,
  staff,
  locations,
  requirements,
  weekStartDate,
  availability = [],
  schedulerSettings,
  uncoveredGaps = [],
  onShiftClick,
  onToggleLock,
}: ScheduleGridProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('compact');
  
  const hours = useMemo(() => 
    Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i),
    []
  );

  // Format date for header
  const formatDateHeader = (dayIndex: number) => {
    const date = new Date(weekStartDate);
    date.setDate(date.getDate() + dayIndex);
    return date.getDate();
  };

  // Check if date is today
  const isToday = (dayIndex: number) => {
    const date = new Date(weekStartDate);
    date.setDate(date.getDate() + dayIndex);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // Get month name for the week
  const getMonthName = () => {
    const date = new Date(weekStartDate);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  const getStaffMember = (staffId: string) => staff.find((s) => s.id === staffId);
  const getLocation = (locationId: string) => locations.find((l) => l.id === locationId);

  // Calculate actual hours worked for a shift (for split shifts)
  const getActualHours = (shift: ScheduledShift, requirement: ShiftRequirement): { startHour: number; endHour: number } => {
    if (!schedulerSettings?.allowSplitShifts) {
      return { startHour: requirement.startHour, endHour: requirement.endHour };
    }

    const staffAvailability = availability.filter((a) => a.staffId === shift.staffId);
    const dayOfWeek = new Date(shift.date).getDay();
    
    // Find the best overlap
    let bestOverlap: { start: number; end: number } | null = null;
    let maxOverlap = 0;
    
    for (const a of staffAvailability) {
      if (a.dayOfWeek !== dayOfWeek) continue;
      
      const overlapStart = Math.max(a.startHour, requirement.startHour);
      const overlapEnd = Math.min(a.endHour, requirement.endHour);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestOverlap = { start: overlapStart, end: overlapEnd };
      }
    }
    
    // If we found a good overlap, use it; otherwise use the requirement hours
    if (bestOverlap && maxOverlap > 0) {
      return { startHour: bestOverlap.start, endHour: bestOverlap.end };
    }
    
    return { startHour: requirement.startHour, endHour: requirement.endHour };
  };

  // Get shifts for a specific requirement
  const getShiftsForRequirement = (requirementId: string) => {
    if (!schedule) return [];
    return schedule.shifts.filter((shift) => shift.requirementId === requirementId);
  };

  // Get requirements for a specific day
  const getRequirementsForDay = (dayIndex: number) => {
    return requirements.filter((r) => r.dayOfWeek === dayIndex);
  };

  // Get uncovered gaps for a specific day
  const getGapsForDay = (dayIndex: number) => {
    return uncoveredGaps.filter((g) => g.dayOfWeek === dayIndex);
  };

  // Calculate position and height for a shift block
  const getBlockStyle = (startHour: number, endHour: number) => {
    const top = (Math.max(startHour, START_HOUR) - START_HOUR) * HOUR_HEIGHT;
    const height = (Math.min(endHour, END_HOUR) - Math.max(startHour, START_HOUR)) * HOUR_HEIGHT;
    return { top, height: Math.max(height, HOUR_HEIGHT / 2) };
  };

  // Current time indicator
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const showCurrentTime = currentHour >= START_HOUR && currentHour < END_HOUR;
  const currentTimeTop = (currentHour - START_HOUR) * HOUR_HEIGHT;

  if (requirements.length === 0) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <p className="text-white/60">
          No shift requirements defined yet.
          <br />
          <span className="text-sm">Go to Requirements to add shifts.</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Week Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">{getMonthName()}</h2>
        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
          <button
            onClick={() => setViewMode('compact')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${
              viewMode === 'compact'
                ? 'bg-white/10 text-white'
                : 'text-white/60 hover:text-white/80'
            }`}
            title="Show all staff within shift blocks"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            Shifts
          </button>
          <button
            onClick={() => setViewMode('overlapping')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${
              viewMode === 'overlapping'
                ? 'bg-white/10 text-white'
                : 'text-white/60 hover:text-white/80'
            }`}
            title="Show individual staff blocks (like calendar events)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            People
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="min-w-[800px]">
          {/* Day Headers */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] gap-1 mb-1 sticky top-0 z-10 pb-2">
            <div /> {/* Empty corner for time labels */}
            {DAYS_SHORT.map((day, index) => (
              <div
                key={day}
                className={`
                  text-center p-2 rounded-xl transition-all
                  ${isToday(index) 
                    ? 'bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30' 
                    : 'bg-white/5'
                  }
                `}
              >
                <div className={`text-xs ${isToday(index) ? 'text-blue-400' : 'text-white/50'}`}>
                  {day}
                </div>
                <div className={`text-lg font-semibold ${isToday(index) ? 'text-white' : 'text-white/80'}`}>
                  {formatDateHeader(index)}
                </div>
              </div>
            ))}
          </div>

          {/* Time Grid */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] gap-1">
            {/* Hour Labels */}
            <div className="relative">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="text-right pr-2 text-xs text-white/40"
                  style={{ height: HOUR_HEIGHT }}
                >
                  {formatHour(hour)}
                </div>
              ))}
            </div>

            {/* Day Columns */}
            {DAYS_SHORT.map((_, dayIndex) => {
              const dayRequirements = getRequirementsForDay(dayIndex);
              const dayGaps = getGapsForDay(dayIndex);
              
              return (
                <div
                  key={dayIndex}
                  className="relative bg-white/[0.02] rounded-xl border border-white/5"
                  style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT }}
                >
                  {/* Hour Grid Lines */}
                  {hours.map((hour, i) => (
                    <div
                      key={hour}
                      className="absolute w-full border-t border-white/5"
                      style={{ top: i * HOUR_HEIGHT }}
                    />
                  ))}

                  {/* Half-hour Grid Lines */}
                  {hours.map((hour, i) => (
                    <div
                      key={`half-${hour}`}
                      className="absolute w-full border-t border-white/[0.02]"
                      style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                    />
                  ))}

                  {/* Current Time Indicator */}
                  {showCurrentTime && isToday(dayIndex) && (
                    <div
                      className="absolute left-0 right-0 z-20 pointer-events-none"
                      style={{ top: currentTimeTop }}
                    >
                      <div className="flex items-center">
                        <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                        <div className="flex-1 h-0.5 bg-red-500" />
                      </div>
                    </div>
                  )}

                  {/* Uncovered Gap Indicators */}
                  {dayGaps.map((gap, gapIndex) => {
                    const { top, height } = getBlockStyle(gap.startHour, gap.endHour);
                    const location = getLocation(gap.locationId);
                    const requirement = requirements.find((r) => r.id === gap.requirementId);
                    
                    // Calculate horizontal position based on requirement overlap
                    const overlappingReqs = dayRequirements.filter(
                      (r) => r.startHour < (requirement?.endHour || gap.endHour) && 
                             r.endHour > (requirement?.startHour || gap.startHour)
                    );
                    const reqIndex = overlappingReqs.findIndex((r) => r.id === gap.requirementId);
                    const totalOverlapping = overlappingReqs.length;
                    
                    const width = totalOverlapping > 1 ? `${100 / totalOverlapping - 2}%` : 'calc(100% - 8px)';
                    const left = totalOverlapping > 1 ? `${(reqIndex * 100) / totalOverlapping + 1}%` : '4px';

                    return (
                      <div
                        key={`gap-${gap.requirementId}-${gapIndex}`}
                        className="absolute rounded-lg overflow-hidden border-2 border-dashed border-red-500/60 bg-red-500/10 pointer-events-none z-5"
                        style={{
                          top: top + 2,
                          height: height - 4,
                          left,
                          width,
                        }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-b from-red-500/20 to-red-500/5" />
                        <div className="relative p-1.5">
                          <div className="flex items-center gap-1 text-red-400">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span className="text-[9px] font-semibold uppercase tracking-wide">Needs Coverage</span>
                          </div>
                          <div className="text-[9px] text-red-300/80 mt-0.5">
                            {formatHour(gap.startHour)} - {formatHour(gap.endHour)}
                          </div>
                          {location && (
                            <div
                              className="text-[8px] mt-0.5 truncate"
                              style={{ color: location.color }}
                            >
                              {location.name}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Shift Blocks */}
                  {viewMode === 'compact' ? (
                    // Compact view: show all staff in one block per requirement
                    dayRequirements.map((req, reqIndex) => {
                      const shifts = getShiftsForRequirement(req.id);
                      const location = getLocation(req.locationId);
                      const { top, height } = getBlockStyle(req.startHour, req.endHour);
                      const isFilled = shifts.length >= req.minStaff;
                      
                      // Offset for multiple requirements at same time
                      const overlappingReqs = dayRequirements.filter(
                        (r, i) => i < reqIndex && 
                        ((r.startHour < req.endHour && r.endHour > req.startHour))
                      );
                      const offsetIndex = overlappingReqs.length;
                      const totalOverlapping = dayRequirements.filter(
                        (r) => r.startHour < req.endHour && r.endHour > req.startHour
                      ).length;
                      
                      const width = totalOverlapping > 1 ? `${100 / totalOverlapping - 2}%` : 'calc(100% - 8px)';
                      const left = totalOverlapping > 1 ? `${(offsetIndex * 100) / totalOverlapping + 1}%` : '4px';

                      return (
                        <div
                          key={req.id}
                          className={`
                            absolute rounded-lg p-1.5 overflow-hidden
                            border-l-4 transition-all duration-200
                            hover:z-10 hover:shadow-lg cursor-pointer
                            ${isFilled
                              ? 'bg-white/10 hover:bg-white/15'
                              : 'bg-red-500/20 hover:bg-red-500/30'
                            }
                          `}
                          style={{
                            top: top + 2,
                            height: height - 4,
                            left,
                            width,
                            borderLeftColor: location?.color || '#6366f1',
                          }}
                        >
                          {/* Location Label */}
                          <div
                            className="text-[10px] font-semibold truncate"
                            style={{ color: location?.color || '#6366f1' }}
                          >
                            {location?.name || 'Unknown'}
                          </div>
                          
                          {/* Time */}
                          <div className="text-[9px] text-white/50">
                            {formatHour(req.startHour)} - {formatHour(req.endHour)}
                          </div>

                          {/* Staff Avatars */}
                          {shifts.length > 0 ? (
                            <div className="mt-1 space-y-0.5">
                              {shifts.slice(0, Math.floor((height - 40) / 24)).map((shift) => {
                                const staffMember = getStaffMember(shift.staffId);
                                if (!staffMember) return null;

                                const actualHours = getActualHours(shift, req);
                                const isSplitShift = actualHours.startHour !== req.startHour || actualHours.endHour !== req.endHour;

                                return (
                                  <div
                                    key={shift.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onShiftClick?.(shift);
                                    }}
                                    className="flex items-center gap-1 group"
                                  >
                                    <Avatar
                                      name={staffMember.name}
                                      color={staffMember.color}
                                      size="sm"
                                      className="w-5 h-5 text-[8px]"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <span className="text-[10px] text-white truncate block">
                                        {staffMember.name.split(' ')[0]}
                                      </span>
                                      {isSplitShift && (
                                        <span className="text-[8px] text-white/60 block">
                                          {formatHour(actualHours.startHour)} - {formatHour(actualHours.endHour)}
                                        </span>
                                      )}
                                    </div>
                                    {shift.isLocked && (
                                      <svg className="w-2.5 h-2.5 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                      </svg>
                                    )}
                                  </div>
                                );
                              })}
                              {shifts.length > Math.floor((height - 40) / 24) && (
                                <div className="text-[9px] text-white/40">
                                  +{shifts.length - Math.floor((height - 40) / 24)} more
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-[9px] text-white/40 mt-1">
                              {req.minStaff} needed
                            </div>
                          )}

                          {/* Coverage indicator */}
                          <div className="absolute bottom-1 left-1.5 right-1.5">
                            <div className="flex items-center gap-1">
                              <div className="flex-1 h-1 rounded-full bg-white/10">
                                <div
                                  className={`h-full rounded-full ${
                                    isFilled ? 'bg-emerald-500' : shifts.length > 0 ? 'bg-amber-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${Math.min(100, (shifts.length / req.minStaff) * 100)}%` }}
                                />
                              </div>
                              <span className="text-[8px] text-white/40">{shifts.length}/{req.minStaff}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    // Overlapping view: show each person's shift as a separate block with cascading overlap
                    dayRequirements.map((req) => {
                      const shifts = getShiftsForRequirement(req.id);
                      const location = getLocation(req.locationId);

                      // Calculate positions using cascading/stacking approach
                      // Each overlapping shift gets offset slightly, but maintains readable width
                      const shiftPositions: Array<{ 
                        shift: ScheduledShift; 
                        actualHours: { startHour: number; endHour: number }; 
                        stackIndex: number;
                        maxStack: number;
                      }> = [];
                      
                      // Group shifts by their time overlap
                      shifts.forEach((shift, idx) => {
                        const actualHours = getActualHours(shift, req);
                        
                        // Count how many preceding shifts overlap with this one
                        let stackIndex = 0;
                        for (let i = 0; i < idx; i++) {
                          const prevHours = getActualHours(shifts[i], req);
                          const overlaps = (
                            actualHours.startHour < prevHours.endHour &&
                            actualHours.endHour > prevHours.startHour
                          );
                          if (overlaps) stackIndex++;
                        }
                        
                        shiftPositions.push({ shift, actualHours, stackIndex, maxStack: shifts.length });
                      });

                      // Calculate max stack depth for any time slot
                      const maxStackDepth = Math.max(...shiftPositions.map(p => p.stackIndex + 1), 1);
                      
                      // Offset per stack level (in pixels) - cascading effect
                      const stackOffset = Math.min(24, Math.floor(80 / maxStackDepth));

                      return (
                        <React.Fragment key={req.id}>
                          {shiftPositions.map(({ shift, actualHours, stackIndex }) => {
                            const staffMember = getStaffMember(shift.staffId);
                            if (!staffMember) return null;

                            const { top, height } = getBlockStyle(actualHours.startHour, actualHours.endHour);
                            
                            // Cascading layout: each shift takes most of the width, offset by stack position
                            const leftOffset = 4 + (stackIndex * stackOffset);
                            const rightMargin = 4 + ((maxStackDepth - stackIndex - 1) * 2);

                            return (
                              <div
                                key={shift.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onShiftClick?.(shift);
                                }}
                                className="absolute rounded-lg p-2 overflow-hidden border-l-4 transition-all duration-200 cursor-pointer bg-slate-800/95 hover:bg-slate-700/95 shadow-lg hover:shadow-xl"
                                style={{
                                  top: top + 2,
                                  height: Math.max(height - 4, HOUR_HEIGHT / 2),
                                  left: leftOffset,
                                  right: rightMargin,
                                  zIndex: stackIndex + 1,
                                  borderLeftColor: staffMember.color || location?.color || '#6366f1',
                                }}
                              >
                                {/* Staff Avatar and Name - more prominent */}
                                <div className="flex items-center gap-2">
                                  <Avatar
                                    name={staffMember.name}
                                    color={staffMember.color}
                                    size="sm"
                                    className="w-6 h-6 text-[10px] shrink-0"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium text-white truncate">
                                      {staffMember.name}
                                    </div>
                                    <div className="text-[10px] text-white/70">
                                      {formatHour(actualHours.startHour)} - {formatHour(actualHours.endHour)}
                                    </div>
                                  </div>
                                  {shift.isLocked && (
                                    <svg className="w-3 h-3 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                </div>
                                
                                {/* Location label */}
                                <div
                                  className="text-[10px] mt-1 truncate"
                                  style={{ color: location?.color || '#6366f1' }}
                                >
                                  {location?.name || 'Unknown'}
                                </div>
                              </div>
                            );
                          })}
                          {shifts.length === 0 && (
                            <div
                              className="absolute rounded-lg p-1.5 border-l-4 border-red-500/50 bg-red-500/10"
                              style={{
                                ...getBlockStyle(req.startHour, req.endHour),
                                top: getBlockStyle(req.startHour, req.endHour).top + 2,
                                height: getBlockStyle(req.startHour, req.endHour).height - 4,
                                left: '4px',
                                right: '4px',
                              }}
                            >
                              <div className="text-[9px] text-white/60">
                                {req.minStaff} needed
                              </div>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
