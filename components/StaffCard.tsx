'use client';

import React from 'react';
import type { Staff, Qualification } from '@/lib/types';
import { Avatar } from './ui/Avatar';
import { Badge, BadgeGroup } from './ui/Badge';
import { Card } from './ui/Card';

interface StaffCardProps {
  staff: Staff;
  qualifications: Qualification[];
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  compact?: boolean;
}

export function StaffCard({
  staff,
  qualifications,
  onClick,
  onEdit,
  onDelete,
  compact = false,
}: StaffCardProps) {
  const staffQuals = qualifications.filter((q) =>
    staff.qualifications.includes(q.id)
  );

  if (compact) {
    return (
      <div
        onClick={onClick}
        className={`
          flex items-center gap-3 p-3 rounded-xl
          bg-white/5 hover:bg-white/10
          border border-white/10 hover:border-white/20
          transition-all duration-200
          ${onClick ? 'cursor-pointer' : ''}
        `}
      >
        <Avatar name={staff.name} color={staff.color} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-white truncate">{staff.name}</p>
          {staffQuals.length > 0 && (
            <p className="text-xs text-white/50 truncate">
              {staffQuals.map((q) => q.name).join(', ')}
            </p>
          )}
        </div>
        <span
          className="text-xs px-2 py-1 rounded-full"
          style={{ backgroundColor: `${staff.color}20`, color: staff.color }}
        >
          {staff.employmentType === 'full-time' ? 'FT' : 'PT'}
        </span>
      </div>
    );
  }

  return (
    <Card hover className="group">
      <div className="flex items-start gap-4">
        <Avatar name={staff.name} color={staff.color} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-white text-lg">{staff.name}</h3>
              {staff.email && (
                <p className="text-sm text-white/50">{staff.email}</p>
              )}
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onEdit && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <svg
                    className="w-4 h-4 text-white/60"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="p-2 rounded-lg hover:bg-red-500/20 transition-colors"
                >
                  <svg
                    className="w-4 h-4 text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Badge
              color={staff.employmentType === 'full-time' ? '#10b981' : '#f59e0b'}
              variant="subtle"
              size="sm"
            >
              {staff.employmentType === 'full-time' ? 'Full-time' : 'Part-time'}
            </Badge>
            <Badge color="#6366f1" variant="subtle" size="sm">
              {staff.maxHoursPerWeek}h max/week
            </Badge>
          </div>

          {staffQuals.length > 0 && (
            <BadgeGroup className="mt-3">
              {staffQuals.map((qual) => (
                <Badge key={qual.id} color={qual.color} variant="subtle" size="sm">
                  {qual.name}
                </Badge>
              ))}
            </BadgeGroup>
          )}
        </div>
      </div>
    </Card>
  );
}

