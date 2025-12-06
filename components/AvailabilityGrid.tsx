'use client';

import React, { useState, useCallback } from 'react';
import type { Availability } from '@/lib/types';
import { DAYS_SHORT, formatHour } from '@/lib/types';

// Simplified availability slot for internal use
type AvailabilitySlot = {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
};

interface AvailabilityGridProps {
  availability: Availability[];
  onChange: (availability: AvailabilitySlot[]) => void;
  startHour?: number;
  endHour?: number;
  readOnly?: boolean;
}

export function AvailabilityGrid({
  availability,
  onChange,
  startHour = 6,
  endHour = 22,
  readOnly = false,
}: AvailabilityGridProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'add' | 'remove'>('add');
  const [dragStart, setDragStart] = useState<{ day: number; hour: number } | null>(null);

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  const isAvailable = useCallback(
    (day: number, hour: number) => {
      return availability.some(
        (a) => a.dayOfWeek === day && hour >= a.startHour && hour < a.endHour
      );
    },
    [availability]
  );

  const handleMouseDown = (day: number, hour: number) => {
    if (readOnly) return;
    const available = isAvailable(day, hour);
    setDragMode(available ? 'remove' : 'add');
    setDragStart({ day, hour });
    setIsDragging(true);
    toggleHour(day, hour, !available);
  };

  const handleMouseEnter = (day: number, hour: number) => {
    if (!isDragging || readOnly) return;
    const shouldBeAvailable = dragMode === 'add';
    toggleHour(day, hour, shouldBeAvailable);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  const toggleHour = (day: number, hour: number, shouldBeAvailable: boolean) => {
    const currentlyAvailable = isAvailable(day, hour);
    if (currentlyAvailable === shouldBeAvailable) return;

    let newAvailability: AvailabilitySlot[] = availability.map(a => ({
      dayOfWeek: a.dayOfWeek,
      startHour: a.startHour,
      endHour: a.endHour,
    }));

    if (shouldBeAvailable) {
      // Try to extend existing block or create new one
      const existingBlock = newAvailability.find(
        (a) => a.dayOfWeek === day && (a.endHour === hour || a.startHour === hour + 1)
      );

      if (existingBlock) {
        if (existingBlock.endHour === hour) {
          existingBlock.endHour = hour + 1;
        } else {
          existingBlock.startHour = hour;
        }
      } else {
        newAvailability.push({
          dayOfWeek: day,
          startHour: hour,
          endHour: hour + 1,
        });
      }

      // Merge adjacent blocks
      newAvailability = mergeBlocks(newAvailability, day);
    } else {
      // Split or shrink existing block
      const blockIndex = newAvailability.findIndex(
        (a) => a.dayOfWeek === day && hour >= a.startHour && hour < a.endHour
      );

      if (blockIndex >= 0) {
        const block = newAvailability[blockIndex];
        newAvailability.splice(blockIndex, 1);

        if (hour === block.startHour) {
          // Remove from start
          if (block.endHour > hour + 1) {
            newAvailability.push({
              dayOfWeek: day,
              startHour: hour + 1,
              endHour: block.endHour,
            });
          }
        } else if (hour === block.endHour - 1) {
          // Remove from end
          if (block.startHour < hour) {
            newAvailability.push({
              dayOfWeek: day,
              startHour: block.startHour,
              endHour: hour,
            });
          }
        } else {
          // Split in middle
          newAvailability.push({
            dayOfWeek: day,
            startHour: block.startHour,
            endHour: hour,
          });
          newAvailability.push({
            dayOfWeek: day,
            startHour: hour + 1,
            endHour: block.endHour,
          });
        }
      }
    }

    onChange(newAvailability.map(({ dayOfWeek, startHour, endHour }) => ({
      dayOfWeek,
      startHour,
      endHour,
    })));
  };

  const mergeBlocks = (blocks: AvailabilitySlot[], day: number): AvailabilitySlot[] => {
    const dayBlocks = blocks.filter((b) => b.dayOfWeek === day).sort((a, b) => a.startHour - b.startHour);
    const otherBlocks = blocks.filter((b) => b.dayOfWeek !== day);

    const merged: AvailabilitySlot[] = [];
    for (const block of dayBlocks) {
      const last = merged[merged.length - 1];
      if (last && last.endHour >= block.startHour) {
        last.endHour = Math.max(last.endHour, block.endHour);
      } else {
        merged.push({ ...block });
      }
    }

    return [...otherBlocks, ...merged];
  };

  const applyTemplate = (template: 'all' | 'weekdays' | 'weekends' | 'clear') => {
    if (readOnly) return;

    const newAvailability: AvailabilitySlot[] = [];

    if (template === 'clear') {
      onChange([]);
      return;
    }

    const days = template === 'weekdays'
      ? [1, 2, 3, 4, 5]
      : template === 'weekends'
      ? [0, 6]
      : [0, 1, 2, 3, 4, 5, 6];

    for (const day of days) {
      newAvailability.push({
        dayOfWeek: day,
        startHour: 9,
        endHour: 17,
      });
    }

    onChange(newAvailability);
  };

  return (
    <div
      className="select-none"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Quick Templates */}
      {!readOnly && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => applyTemplate('all')}
            className="px-3 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
          >
            Mon-Sun 9-5
          </button>
          <button
            onClick={() => applyTemplate('weekdays')}
            className="px-3 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
          >
            Weekdays 9-5
          </button>
          <button
            onClick={() => applyTemplate('weekends')}
            className="px-3 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
          >
            Weekends 9-5
          </button>
          <button
            onClick={() => applyTemplate('clear')}
            className="px-3 py-1.5 text-xs rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Header */}
          <div className="flex">
            <div className="w-14 shrink-0" />
            {DAYS_SHORT.map((day, i) => (
              <div
                key={day}
                className="flex-1 min-w-[40px] text-center text-xs font-medium text-white/60 py-2"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Hours */}
          {hours.map((hour) => (
            <div key={hour} className="flex">
              <div className="w-14 shrink-0 text-xs text-white/40 py-1 pr-2 text-right">
                {formatHour(hour)}
              </div>
              {DAYS_SHORT.map((_, day) => {
                const available = isAvailable(day, hour);
                return (
                  <div
                    key={day}
                    className={`
                      flex-1 min-w-[40px] h-6 border border-white/5
                      transition-colors duration-75
                      ${readOnly ? '' : 'cursor-pointer'}
                      ${available
                        ? 'bg-emerald-500/40 hover:bg-emerald-500/50'
                        : 'bg-white/5 hover:bg-white/10'
                      }
                    `}
                    onMouseDown={() => handleMouseDown(day, hour)}
                    onMouseEnter={() => handleMouseEnter(day, hour)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs text-white/60">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-emerald-500/40" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-white/5" />
          <span>Unavailable</span>
        </div>
        {!readOnly && (
          <span className="text-white/40">Click and drag to select</span>
        )}
      </div>
    </div>
  );
}

