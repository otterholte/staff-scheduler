'use client';

import React, { useState } from 'react';
import { useStore } from '@/lib/store';
import { generateScheduleVariants } from '@/lib/scheduler';
import { generateWithSolverService } from '@/lib/solverClient';
import { Button } from './ui/Button';

type SolverSource = 'python' | 'local' | null;

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
  const [solverUsed, setSolverUsed] = useState<SolverSource>(null);
  const [error, setError] = useState<string | null>(null);

  const canGenerate = staff.length > 0 && requirements.length > 0;

  const handleGenerate = async () => {
    if (!canGenerate || isGenerating) return;

    setIsGenerating(true);
    setShowSuccess(false);
    setError(null);
    setSolverUsed(null);

    try {
      const basePayload = {
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
          solveSeconds: 10,
          solutionPoolSize: 3,
        },
      };

      let variants = null;
      let usedPython = false;

      // Try Python solver first (optimal solution)
      try {
        variants = await generateWithSolverService(basePayload);
        if (variants && variants.length > 0) {
          usedPython = true;
          setSolverUsed('python');
        }
      } catch (pythonError) {
        console.warn('Python solver unavailable:', pythonError);
        // Will fall back to local solver
      }

      // Fall back to local TypeScript solver
      if (!variants || variants.length === 0) {
        console.log('Using local TypeScript scheduler');
        const local = generateScheduleVariants(basePayload, 30, 3);
        variants = local.variants;
        setSolverUsed('local');
      }

      if (variants && variants.length > 0) {
        // Verify no max hours violations before showing results
        const hasOvertime = variants.some(v => 
          v.warnings.some(w => w.type === 'overtime')
        );
        
        if (hasOvertime) {
          console.error('Schedule has overtime violations - this should not happen');
        }

        setScheduleVariants(variants.map((v) => v.schedule), 0);
        setCurrentSchedule(variants[0].schedule);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      } else {
        setError('Could not generate a valid schedule');
      }
    } catch (err) {
      console.error('Failed to generate schedule:', err);
      setError('Failed to generate schedule');
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

      {/* Solver indicator */}
      {solverUsed && !isGenerating && (
        <p className="text-xs text-white/50 mt-2 text-center">
          {solverUsed === 'python' ? (
            <span className="text-emerald-400">✓ Optimal solver</span>
          ) : (
            <span className="text-amber-400">⚡ Local solver</span>
          )}
        </p>
      )}

      {/* Error message */}
      {error && (
        <p className="text-xs text-red-400 mt-2 text-center">{error}</p>
      )}

      {!canGenerate && (
        <p className="text-xs text-white/40 mt-2 text-center">
          Add staff and requirements first
        </p>
      )}
    </div>
  );
}
