'use client';

import React from 'react';
import type { ScheduleStats, ScheduleWarning, Staff } from '@/lib/types';
import { Card } from './ui/Card';
import { Avatar } from './ui/Avatar';

interface ScheduleStatsDisplayProps {
  stats: ScheduleStats;
  warnings: ScheduleWarning[];
  staff: Staff[];
}

export function ScheduleStatsDisplay({
  stats,
  warnings,
  staff,
}: ScheduleStatsDisplayProps) {
  // Sort staff by hours
  const staffByHours = [...staff]
    .filter((s) => stats.hoursPerStaff[s.id] !== undefined)
    .sort((a, b) => (stats.hoursPerStaff[b.id] || 0) - (stats.hoursPerStaff[a.id] || 0));

  const avgHours = staff.length > 0 
    ? stats.totalHours / staff.length 
    : 0;

  return (
    <Card padding="md">
      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-6">
        {/* Coverage Stats - Horizontal row */}
        <div className="flex flex-wrap gap-3">
          <StatCard
            label="Coverage"
            value={`${Math.round(stats.coveragePercentage)}%`}
            subtext={stats.requiredHours ? `${stats.coveredHours}/${stats.requiredHours}h` : undefined}
            color={stats.coveragePercentage >= 100 ? 'emerald' : stats.coveragePercentage >= 80 ? 'amber' : 'red'}
          />
          <StatCard
            label="Shifts Covered"
            value={`${stats.filledShifts}/${stats.totalShifts}`}
            subtext="fully staffed"
            color={stats.filledShifts >= stats.totalShifts ? 'emerald' : stats.filledShifts > 0 ? 'amber' : 'red'}
          />
          <StatCard
            label="Staff Hours"
            value={`${stats.totalHours}h`}
            subtext="scheduled"
            color="blue"
          />
          <StatCard
            label="Avg Hours/Staff"
            value={`${avgHours.toFixed(1)}h`}
            color="purple"
          />
        </div>

        {/* Hours Distribution - Horizontal */}
        <div className="flex-1">
          <h3 className="text-xs font-medium text-white/40 mb-2">Hours Distribution</h3>
          <div className="flex flex-wrap gap-3">
            {staffByHours.map((s) => {
              const hours = stats.hoursPerStaff[s.id] || 0;
              const percentage = avgHours > 0 ? (hours / (avgHours * 2)) * 100 : 0;
              const isOverAvg = hours > avgHours * 1.2;
              const isUnderAvg = hours < avgHours * 0.8;

              return (
                <div key={s.id} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                  <Avatar name={s.name} color={s.color} size="sm" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white truncate">{s.name}</span>
                      <span className={`text-xs font-medium ${
                        isOverAvg ? 'text-amber-400' : isUnderAvg ? 'text-blue-400' : 'text-white/60'
                      }`}>
                        {hours}h
                      </span>
                    </div>
                    <div className="h-1 w-20 rounded-full bg-white/10 mt-1">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isOverAvg ? 'bg-amber-500' : isUnderAvg ? 'bg-blue-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, percentage)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className={`rounded-lg px-3 py-2 border ${
            warnings.some(w => w.type === 'overtime') 
              ? 'bg-red-500/10 border-red-500/20' 
              : 'bg-amber-500/10 border-amber-500/20'
          }`}>
            <h3 className={`text-xs font-medium mb-1 flex items-center gap-1 ${
              warnings.some(w => w.type === 'overtime') ? 'text-red-400' : 'text-amber-400'
            }`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {warnings.length} Warning{warnings.length !== 1 ? 's' : ''}
            </h3>
            <ul className="space-y-0.5">
              {warnings.slice(0, 3).map((warning, index) => (
                <li key={index} className={`text-xs truncate ${
                  warning.type === 'overtime' ? 'text-red-400 font-medium' : 'text-white/60'
                }`}>
                  {warning.message}
                </li>
              ))}
              {warnings.length > 3 && (
                <li className="text-xs text-white/40">
                  +{warnings.length - 3} more
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  subtext?: string;
  color: 'emerald' | 'amber' | 'red' | 'blue' | 'purple';
}

function StatCard({ label, value, subtext, color }: StatCardProps) {
  const colors = {
    emerald: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-400',
    amber: 'from-amber-500/20 to-amber-500/5 border-amber-500/30 text-amber-400',
    red: 'from-red-500/20 to-red-500/5 border-red-500/30 text-red-400',
    blue: 'from-blue-500/20 to-blue-500/5 border-blue-500/30 text-blue-400',
    purple: 'from-purple-500/20 to-purple-500/5 border-purple-500/30 text-purple-400',
  };

  return (
    <div className={`p-4 rounded-xl bg-gradient-to-br ${colors[color]} border`}>
      <div className="text-xs text-white/50 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colors[color].split(' ').pop()}`}>
        {value}
      </div>
      {subtext && (
        <div className="text-[10px] text-white/40 mt-0.5">{subtext}</div>
      )}
    </div>
  );
}

