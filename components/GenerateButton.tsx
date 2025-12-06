'use client';

import React, { useState } from 'react';
import { useStore } from '@/lib/store';
import { generateScheduleVariants } from '@/lib/scheduler';
import { Button } from './ui/Button';

export function GenerateButton() {
  const {
    staff,
    availability,
    requirements,
    locations,
    qualifications,
    selectedWeekStart,
    isGenerating,
    setIsGenerating,
    schedulerSettings,
    setCurrentSchedule,
    setScheduleVariants,
  } = useStore();

  const [showSuccess, setShowSuccess] = useState(false);

  const canGenerate = staff.length > 0 && requirements.length > 0;

  const handleGenerate = async () => {
    if (!canGenerate || isGenerating) return;

    setIsGenerating(true);
    setShowSuccess(false);

    // Simulate a brief delay for visual feedback
    await new Promise((resolve) => setTimeout(resolve, 500));

    try {
      const { variants } = generateScheduleVariants(
        {
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
        },
        30,
        3
      );

      if (variants.length > 0) {
        setScheduleVariants(variants.map((v) => v.schedule), 0);
        setCurrentSchedule(variants[0].schedule);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      }
    } catch (error) {
      console.error('Failed to generate schedule:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="relative">
      <Button
        size="lg"
        onClick={handleGenerate}
        disabled={!canGenerate}
        isLoading={isGenerating}
        className={`
          relative overflow-hidden
          ${canGenerate && !isGenerating ? 'animate-pulse-soft' : ''}
        `}
        icon={
          !isGenerating && (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )
        }
      >
        {isGenerating ? 'Generating...' : 'Generate Schedule'}
      </Button>

      {/* Success indicator */}
      {showSuccess && (
        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center animate-scale-in">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}

      {!canGenerate && (
        <p className="text-xs text-white/40 mt-2 text-center">
          Add staff and requirements first
        </p>
      )}
    </div>
  );
}

