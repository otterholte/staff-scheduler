'use client';

import React, { useState, useRef } from 'react';
import { useStore } from '@/lib/store';
import { Navigation } from '@/components/Navigation';
import { AvailabilityGrid } from '@/components/AvailabilityGrid';
import { StaffCard } from '@/components/StaffCard';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { parseICalFile, eventsToBlockedTimes } from '@/lib/ical-parser';
import type { Availability } from '@/lib/types';

export default function AvailabilityPage() {
  const { staff, qualifications, availability, setAvailability, addBlockedTime } = useStore();
  
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(
    staff.length > 0 ? staff[0].id : null
  );
  const [showImportModal, setShowImportModal] = useState(false);
  const [importResult, setImportResult] = useState<{ count: number; staffName: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedStaff = staff.find((s) => s.id === selectedStaffId);
  const staffAvailability = availability.filter((a) => a.staffId === selectedStaffId);

  const handleAvailabilityChange = (newAvailability: Omit<Availability, 'id' | 'staffId'>[]) => {
    if (selectedStaffId) {
      setAvailability(selectedStaffId, newAvailability);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedStaffId || !selectedStaff) return;

    try {
      const content = await file.text();
      const events = parseICalFile(content);
      const blockedTimes = eventsToBlockedTimes(events);

      // Add blocked times to store
      blockedTimes.forEach((blocked) => {
        addBlockedTime({
          staffId: selectedStaffId,
          date: blocked.date,
          startHour: blocked.startHour,
          endHour: blocked.endHour,
          reason: blocked.reason,
        });
      });

      setImportResult({ count: blockedTimes.length, staffName: selectedStaff.name });
      setShowImportModal(true);
    } catch (error) {
      console.error('Failed to parse iCal file:', error);
      alert('Failed to parse calendar file. Please make sure it\'s a valid .ics file.');
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getTotalHours = () => {
    return staffAvailability.reduce((total, a) => total + (a.endHour - a.startHour), 0);
  };

  if (staff.length === 0) {
    return (
      <div className="min-h-screen pb-24 md:pb-8">
        <Navigation />
        <main className="max-w-4xl mx-auto px-4 py-6">
          <EmptyState
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            title="No staff members yet"
            description="Add staff members first before setting their availability"
            action={{
              label: 'Go to Staff',
              onClick: () => window.location.href = '/staff',
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <Navigation />

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-white">Availability</h1>
          <p className="text-white/60 mt-1">
            Set when each team member can work
          </p>
        </div>

        <div className="grid md:grid-cols-[280px_1fr] gap-6">
          {/* Staff List Sidebar */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-white/60 mb-3">Select Staff</h2>
            {staff.map((s) => {
              const isSelected = s.id === selectedStaffId;
              const staffHours = availability
                .filter((a) => a.staffId === s.id)
                .reduce((total, a) => total + (a.endHour - a.startHour), 0);

              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedStaffId(s.id)}
                  className={`
                    p-3 rounded-xl cursor-pointer transition-all duration-200
                    border
                    ${isSelected
                      ? 'bg-white/10 border-white/20 shadow-lg'
                      : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'
                    }
                  `}
                >
                  <StaffCard
                    staff={s}
                    qualifications={qualifications}
                    compact
                  />
                  <div className="mt-2 text-xs text-white/40">
                    {staffHours > 0 ? `${staffHours} hrs/week available` : 'No availability set'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Availability Editor */}
          <Card padding="lg">
            {selectedStaff ? (
              <>
                <CardHeader
                  action={
                    <div className="flex gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".ics,.ical"
                        onChange={handleImportFile}
                        className="hidden"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        icon={
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                        }
                      >
                        Import iCal
                      </Button>
                    </div>
                  }
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
                      style={{ backgroundColor: selectedStaff.color }}
                    >
                      {selectedStaff.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <CardTitle>{selectedStaff.name}</CardTitle>
                      <p className="text-sm text-white/60">
                        {getTotalHours()} hours/week available
                      </p>
                    </div>
                  </div>
                </CardHeader>

                <AvailabilityGrid
                  availability={staffAvailability}
                  onChange={handleAvailabilityChange}
                />
              </>
            ) : (
              <div className="text-center py-12 text-white/60">
                Select a staff member to edit their availability
              </div>
            )}
          </Card>
        </div>
      </main>

      {/* Import Success Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setImportResult(null);
        }}
        title="Calendar Imported"
        size="sm"
      >
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          {importResult && (
            <p className="text-white/80">
              Imported <span className="font-semibold text-white">{importResult.count}</span> blocked time
              {importResult.count !== 1 ? 's' : ''} for {importResult.staffName}
            </p>
          )}
          <Button
            className="mt-6"
            onClick={() => {
              setShowImportModal(false);
              setImportResult(null);
            }}
          >
            Done
          </Button>
        </div>
      </Modal>
    </div>
  );
}

