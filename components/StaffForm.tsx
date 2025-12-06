'use client';

import React, { useState, useEffect } from 'react';
import type { Staff, Qualification } from '@/lib/types';
import { Button } from './ui/Button';
import { Input, Select } from './ui/Input';
import { Badge, BadgeGroup } from './ui/Badge';
import { Toggle } from './ui/Toggle';

interface StaffFormProps {
  staff?: Staff;
  qualifications: Qualification[];
  onSubmit: (data: Omit<Staff, 'id' | 'createdAt' | 'color'>) => void;
  onCancel: () => void;
}

export function StaffForm({
  staff,
  qualifications,
  onSubmit,
  onCancel,
}: StaffFormProps) {
  const [name, setName] = useState(staff?.name || '');
  const [email, setEmail] = useState(staff?.email || '');
  const [phone, setPhone] = useState(staff?.phone || '');
  const [employmentType, setEmploymentType] = useState<'full-time' | 'part-time'>(
    staff?.employmentType || 'full-time'
  );
  const [maxHours, setMaxHours] = useState(staff?.maxHoursPerWeek || 40);
  const [minHours, setMinHours] = useState(staff?.minHoursPerWeek || 0);
  const [selectedQuals, setSelectedQuals] = useState<string[]>(
    staff?.qualifications || []
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSubmit({
      name: name.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      employmentType,
      maxHoursPerWeek: maxHours,
      minHoursPerWeek: minHours,
      qualifications: selectedQuals,
    });
  };

  const toggleQualification = (qualId: string) => {
    setSelectedQuals((prev) =>
      prev.includes(qualId)
        ? prev.filter((id) => id !== qualId)
        : [...prev, qualId]
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Input
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Enter staff name"
        required
        autoFocus
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Email (optional)"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
        />
        <Input
          label="Phone (optional)"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 234 567 8900"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-white/80 mb-3">
          Employment Type
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setEmploymentType('full-time')}
            className={`
              flex-1 py-3 px-4 rounded-xl text-sm font-medium
              transition-all duration-200 border
              ${employmentType === 'full-time'
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
              }
            `}
          >
            Full-time
          </button>
          <button
            type="button"
            onClick={() => setEmploymentType('part-time')}
            className={`
              flex-1 py-3 px-4 rounded-xl text-sm font-medium
              transition-all duration-200 border
              ${employmentType === 'part-time'
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
              }
            `}
          >
            Part-time
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Min Hours/Week"
          type="number"
          min={0}
          max={maxHours}
          value={minHours}
          onChange={(e) => setMinHours(Number(e.target.value))}
        />
        <Input
          label="Max Hours/Week"
          type="number"
          min={minHours}
          max={168}
          value={maxHours}
          onChange={(e) => setMaxHours(Number(e.target.value))}
        />
      </div>

      {qualifications.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-white/80 mb-3">
            Qualifications
          </label>
          <div className="flex flex-wrap gap-2">
            {qualifications.map((qual) => {
              const isSelected = selectedQuals.includes(qual.id);
              return (
                <button
                  key={qual.id}
                  type="button"
                  onClick={() => toggleQualification(qual.id)}
                  className={`
                    px-3 py-1.5 rounded-full text-sm font-medium
                    transition-all duration-200 border
                    ${isSelected
                      ? 'border-transparent'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }
                  `}
                  style={
                    isSelected
                      ? { backgroundColor: `${qual.color}30`, color: qual.color, borderColor: qual.color }
                      : undefined
                  }
                >
                  {qual.name}
                </button>
              );
            })}
          </div>
          {qualifications.length === 0 && (
            <p className="text-sm text-white/40">
              No qualifications defined yet. Add them in Requirements.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <Button type="button" variant="ghost" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" className="flex-1">
          {staff ? 'Update' : 'Add'} Staff
        </Button>
      </div>
    </form>
  );
}

