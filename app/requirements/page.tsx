'use client';

import React, { useState } from 'react';
import { useStore } from '@/lib/store';
import { Navigation } from '@/components/Navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Input, Select } from '@/components/ui/Input';
import { Badge, BadgeGroup } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs, TabList, Tab, TabPanel } from '@/components/ui/Tabs';
import { DAYS_OF_WEEK, DAYS_SHORT, formatHourRange, HOURS } from '@/lib/types';
import type { Location, Qualification, ShiftRequirement } from '@/lib/types';

// Day selection presets
const DAY_PRESETS = [
  { label: 'Mon-Fri', days: [1, 2, 3, 4, 5] },
  { label: 'Sat-Sun', days: [0, 6] },
  { label: 'Every Day', days: [0, 1, 2, 3, 4, 5, 6] },
];

export default function RequirementsPage() {
  const {
    locations,
    qualifications,
    requirements,
    addLocation,
    updateLocation,
    removeLocation,
    addQualification,
    updateQualification,
    removeQualification,
    addRequirement,
    updateRequirement,
    removeRequirement,
  } = useStore();

  // Location state
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [locationName, setLocationName] = useState('');
  const [deletingLocation, setDeletingLocation] = useState<Location | null>(null);

  // Qualification state
  const [showQualModal, setShowQualModal] = useState(false);
  const [editingQual, setEditingQual] = useState<Qualification | null>(null);
  const [qualName, setQualName] = useState('');
  const [deletingQual, setDeletingQual] = useState<Qualification | null>(null);

  // Shift requirement state
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftRequirement | null>(null);
  const [deletingShift, setDeletingShift] = useState<ShiftRequirement | null>(null);

  // Shift form state - now with multi-day support
  const [shiftLocation, setShiftLocation] = useState('');
  const [selectedDays, setSelectedDays] = useState<number[]>([1]); // Monday by default
  const [shiftStart, setShiftStart] = useState(9);
  const [shiftEnd, setShiftEnd] = useState(17);
  const [shiftMinStaff, setShiftMinStaff] = useState(1);
  const [shiftMaxStaff, setShiftMaxStaff] = useState(3);
  const [shiftQuals, setShiftQuals] = useState<string[]>([]);

  // Location handlers
  const handleSaveLocation = () => {
    if (!locationName.trim()) return;
    if (editingLocation) {
      updateLocation(editingLocation.id, { name: locationName.trim() });
    } else {
      addLocation(locationName.trim());
    }
    setShowLocationModal(false);
    setLocationName('');
    setEditingLocation(null);
  };

  const openEditLocation = (loc: Location) => {
    setEditingLocation(loc);
    setLocationName(loc.name);
    setShowLocationModal(true);
  };

  // Qualification handlers
  const handleSaveQual = () => {
    if (!qualName.trim()) return;
    if (editingQual) {
      updateQualification(editingQual.id, { name: qualName.trim() });
    } else {
      addQualification(qualName.trim());
    }
    setShowQualModal(false);
    setQualName('');
    setEditingQual(null);
  };

  const openEditQual = (qual: Qualification) => {
    setEditingQual(qual);
    setQualName(qual.name);
    setShowQualModal(true);
  };

  // Shift requirement handlers
  const resetShiftForm = () => {
    setShiftLocation(locations[0]?.id || '');
    setSelectedDays([1]);
    setShiftStart(9);
    setShiftEnd(17);
    setShiftMinStaff(1);
    setShiftMaxStaff(3);
    setShiftQuals([]);
  };

  const openAddShift = () => {
    resetShiftForm();
    setEditingShift(null);
    setShowShiftModal(true);
  };

  const openEditShift = (shift: ShiftRequirement) => {
    setEditingShift(shift);
    setShiftLocation(shift.locationId);
    setSelectedDays([shift.dayOfWeek]);
    setShiftStart(shift.startHour);
    setShiftEnd(shift.endHour);
    setShiftMinStaff(shift.minStaff);
    setShiftMaxStaff(shift.maxStaff);
    setShiftQuals(shift.requiredQualifications);
    setShowShiftModal(true);
  };

  const handleSaveShift = () => {
    if (!shiftLocation || selectedDays.length === 0) return;

    const shiftData = {
      locationId: shiftLocation,
      startHour: shiftStart,
      endHour: shiftEnd,
      minStaff: shiftMinStaff,
      maxStaff: shiftMaxStaff,
      requiredQualifications: shiftQuals,
    };

    if (editingShift) {
      // When editing, only update the single shift
      updateRequirement(editingShift.id, { ...shiftData, dayOfWeek: selectedDays[0] });
    } else {
      // When adding, create a shift for each selected day
      selectedDays.forEach((day) => {
        addRequirement({ ...shiftData, dayOfWeek: day });
      });
    }

    setShowShiftModal(false);
    setEditingShift(null);
  };

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const applyDayPreset = (days: number[]) => {
    setSelectedDays(days);
  };

  const toggleShiftQual = (qualId: string) => {
    setShiftQuals((prev) =>
      prev.includes(qualId)
        ? prev.filter((id) => id !== qualId)
        : [...prev, qualId]
    );
  };

  const getLocationName = (id: string) => locations.find((l) => l.id === id)?.name || 'Unknown';
  const getLocationColor = (id: string) => locations.find((l) => l.id === id)?.color || '#6366f1';

  // Group requirements by day
  const requirementsByDay = DAYS_OF_WEEK.map((day, index) => ({
    day,
    dayIndex: index,
    requirements: requirements.filter((r) => r.dayOfWeek === index),
  }));

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <Navigation />

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-white">Requirements</h1>
          <p className="text-white/60 mt-1">
            Define locations, qualifications, and shift coverage needs
          </p>
        </div>

        <Tabs defaultTab="shifts">
          <TabList className="mb-6">
            <Tab value="shifts">Shift Requirements</Tab>
            <Tab value="locations">Locations</Tab>
            <Tab value="qualifications">Qualifications</Tab>
          </TabList>

          {/* Shifts Tab */}
          <TabPanel value="shifts">
            <div className="flex justify-between items-center mb-6">
              <p className="text-white/60">{requirements.length} shift requirements</p>
              <Button
                onClick={openAddShift}
                disabled={locations.length === 0}
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                }
              >
                Add Shifts
              </Button>
            </div>

            {locations.length === 0 ? (
              <EmptyState
                icon={
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                }
                title="Add locations first"
                description="Create at least one location before adding shift requirements"
                action={{
                  label: 'Go to Locations',
                  onClick: () => {},
                }}
              />
            ) : requirements.length === 0 ? (
              <EmptyState
                icon={
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                }
                title="No shift requirements yet"
                description="Define when and where you need staff coverage"
                action={{
                  label: 'Add First Shift',
                  onClick: openAddShift,
                }}
              />
            ) : (
              <div className="space-y-6">
                {requirementsByDay.filter((d) => d.requirements.length > 0).map(({ day, requirements: dayReqs }) => (
                  <div key={day}>
                    <h3 className="text-sm font-medium text-white/60 mb-3">{day}</h3>
                    <div className="grid gap-3">
                      {dayReqs.map((req) => (
                        <Card key={req.id} hover className="group">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-3 h-12 rounded-full"
                                style={{ backgroundColor: getLocationColor(req.locationId) }}
                              />
                              <div>
                                <div className="font-medium text-white">
                                  {getLocationName(req.locationId)}
                                </div>
                                <div className="text-sm text-white/60">
                                  {formatHourRange(req.startHour, req.endHour)}
                                </div>
                                <div className="text-xs text-white/40 mt-1">
                                  {req.minStaff === req.maxStaff
                                    ? `${req.minStaff} staff`
                                    : `${req.minStaff}-${req.maxStaff} staff`}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-start gap-4">
                              {req.requiredQualifications.length > 0 && (
                                <BadgeGroup>
                                  {req.requiredQualifications.map((qualId) => {
                                    const qual = qualifications.find((q) => q.id === qualId);
                                    return qual ? (
                                      <Badge key={qualId} color={qual.color} size="sm">
                                        {qual.name}
                                      </Badge>
                                    ) : null;
                                  })}
                                </BadgeGroup>
                              )}

                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => openEditShift(req)}
                                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                                >
                                  <svg className="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => setDeletingShift(req)}
                                  className="p-2 rounded-lg hover:bg-red-500/20 transition-colors"
                                >
                                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabPanel>

          {/* Locations Tab */}
          <TabPanel value="locations">
            <div className="flex justify-between items-center mb-6">
              <p className="text-white/60">{locations.length} locations</p>
              <Button
                onClick={() => {
                  setEditingLocation(null);
                  setLocationName('');
                  setShowLocationModal(true);
                }}
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                }
              >
                Add Location
              </Button>
            </div>

            {locations.length === 0 ? (
              <EmptyState
                icon={
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                }
                title="No locations yet"
                description="Add locations like departments, stores, or work areas"
                action={{
                  label: 'Add Location',
                  onClick: () => setShowLocationModal(true),
                }}
              />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {locations.map((loc) => (
                  <Card key={loc.id} hover className="group">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: loc.color }}
                      />
                      <span className="font-medium text-white flex-1">{loc.name}</span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditLocation(loc)}
                          className="p-1.5 rounded hover:bg-white/10 transition-colors"
                        >
                          <svg className="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeletingLocation(loc)}
                          className="p-1.5 rounded hover:bg-red-500/20 transition-colors"
                        >
                          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabPanel>

          {/* Qualifications Tab */}
          <TabPanel value="qualifications">
            <div className="flex justify-between items-center mb-6">
              <p className="text-white/60">{qualifications.length} qualifications</p>
              <Button
                onClick={() => {
                  setEditingQual(null);
                  setQualName('');
                  setShowQualModal(true);
                }}
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                }
              >
                Add Qualification
              </Button>
            </div>

            {qualifications.length === 0 ? (
              <EmptyState
                icon={
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                }
                title="No qualifications yet"
                description="Add skills or certifications like Tech, Beauty, Cash Register"
                action={{
                  label: 'Add Qualification',
                  onClick: () => setShowQualModal(true),
                }}
              />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {qualifications.map((qual) => (
                  <Card key={qual.id} hover className="group">
                    <div className="flex items-center gap-3">
                      <Badge color={qual.color}>{qual.name}</Badge>
                      <div className="flex-1" />
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditQual(qual)}
                          className="p-1.5 rounded hover:bg-white/10 transition-colors"
                        >
                          <svg className="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeletingQual(qual)}
                          className="p-1.5 rounded hover:bg-red-500/20 transition-colors"
                        >
                          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabPanel>
        </Tabs>
      </main>

      {/* Location Modal */}
      <Modal
        isOpen={showLocationModal}
        onClose={() => {
          setShowLocationModal(false);
          setEditingLocation(null);
          setLocationName('');
        }}
        title={editingLocation ? 'Edit Location' : 'Add Location'}
        size="sm"
      >
        <form onSubmit={(e) => { e.preventDefault(); handleSaveLocation(); }}>
          <Input
            label="Location Name"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            placeholder="e.g., Tech Department, Store Front"
            autoFocus
          />
          <div className="flex gap-3 mt-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowLocationModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              {editingLocation ? 'Update' : 'Add'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Qualification Modal */}
      <Modal
        isOpen={showQualModal}
        onClose={() => {
          setShowQualModal(false);
          setEditingQual(null);
          setQualName('');
        }}
        title={editingQual ? 'Edit Qualification' : 'Add Qualification'}
        size="sm"
      >
        <form onSubmit={(e) => { e.preventDefault(); handleSaveQual(); }}>
          <Input
            label="Qualification Name"
            value={qualName}
            onChange={(e) => setQualName(e.target.value)}
            placeholder="e.g., Tech, Beauty, Cash Register"
            autoFocus
          />
          <div className="flex gap-3 mt-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowQualModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              {editingQual ? 'Update' : 'Add'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Shift Modal - Updated with multi-day selection */}
      <Modal
        isOpen={showShiftModal}
        onClose={() => {
          setShowShiftModal(false);
          setEditingShift(null);
        }}
        title={editingShift ? 'Edit Shift Requirement' : 'Add Shift Requirements'}
        description={editingShift ? undefined : 'Create shifts for multiple days at once'}
        size="lg"
      >
        <form onSubmit={(e) => { e.preventDefault(); handleSaveShift(); }} className="space-y-5">
          <Select
            label="Location"
            value={shiftLocation}
            onChange={(e) => setShiftLocation(e.target.value)}
            options={locations.map((l) => ({ value: l.id, label: l.name }))}
          />

          {/* Day Selection */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-3">
              {editingShift ? 'Day' : 'Days'}
            </label>
            
            {/* Quick Presets - only show when adding new */}
            {!editingShift && (
              <div className="flex flex-wrap gap-2 mb-3">
                {DAY_PRESETS.map((preset) => {
                  const isActive = preset.days.every(d => selectedDays.includes(d)) && 
                                   selectedDays.length === preset.days.length;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyDayPreset(preset.days)}
                      className={`
                        px-3 py-1.5 rounded-lg text-xs font-medium
                        transition-all duration-200
                        ${isActive
                          ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                          : 'bg-white/10 text-white/70 hover:bg-white/20'
                        }
                      `}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            )}
            
            {/* Day Buttons */}
            <div className="grid grid-cols-7 gap-2">
              {DAYS_SHORT.map((day, index) => {
                const isSelected = selectedDays.includes(index);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => editingShift ? setSelectedDays([index]) : toggleDay(index)}
                    className={`
                      p-3 rounded-xl text-sm font-medium
                      transition-all duration-200 border
                      ${isSelected
                        ? 'bg-gradient-to-br from-blue-500/30 to-purple-500/30 border-blue-500/50 text-white'
                        : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80'
                      }
                    `}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            {selectedDays.length === 0 && (
              <p className="text-xs text-red-400 mt-2">Select at least one day</p>
            )}
            {!editingShift && selectedDays.length > 1 && (
              <p className="text-xs text-white/50 mt-2">
                This will create {selectedDays.length} shift requirements (one for each day)
              </p>
            )}
          </div>

          {/* Time Selection */}
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Start Time"
              value={shiftStart.toString()}
              onChange={(e) => setShiftStart(Number(e.target.value))}
              options={HOURS.filter((h) => h < 24).map((h) => ({
                value: h.toString(),
                label: `${h === 0 ? '12' : h > 12 ? h - 12 : h}:00 ${h < 12 ? 'AM' : 'PM'}`,
              }))}
            />
            <Select
              label="End Time"
              value={shiftEnd.toString()}
              onChange={(e) => setShiftEnd(Number(e.target.value))}
              options={HOURS.filter((h) => h > shiftStart).map((h) => ({
                value: h.toString(),
                label: `${h === 0 ? '12' : h > 12 ? h - 12 : h}:00 ${h < 12 ? 'AM' : 'PM'}`,
              }))}
            />
          </div>

          {/* Staff Count */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Min Staff"
              type="number"
              min={1}
              max={shiftMaxStaff}
              value={shiftMinStaff}
              onChange={(e) => setShiftMinStaff(Number(e.target.value))}
            />
            <Input
              label="Max Staff"
              type="number"
              min={shiftMinStaff}
              max={50}
              value={shiftMaxStaff}
              onChange={(e) => setShiftMaxStaff(Number(e.target.value))}
            />
          </div>

          {/* Qualifications */}
          {qualifications.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Required Qualifications (optional)
              </label>
              <div className="flex flex-wrap gap-2">
                {qualifications.map((qual) => {
                  const isSelected = shiftQuals.includes(qual.id);
                  return (
                    <button
                      key={qual.id}
                      type="button"
                      onClick={() => toggleShiftQual(qual.id)}
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
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowShiftModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="flex-1"
              disabled={selectedDays.length === 0}
            >
              {editingShift ? 'Update Shift' : `Add ${selectedDays.length > 1 ? selectedDays.length + ' Shifts' : 'Shift'}`}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmations */}
      <ConfirmModal
        isOpen={!!deletingLocation}
        onClose={() => setDeletingLocation(null)}
        onConfirm={() => {
          if (deletingLocation) removeLocation(deletingLocation.id);
          setDeletingLocation(null);
        }}
        title="Delete Location"
        message={`Are you sure you want to delete "${deletingLocation?.name}"? This will also remove all shift requirements for this location.`}
        confirmText="Delete"
        variant="danger"
      />

      <ConfirmModal
        isOpen={!!deletingQual}
        onClose={() => setDeletingQual(null)}
        onConfirm={() => {
          if (deletingQual) removeQualification(deletingQual.id);
          setDeletingQual(null);
        }}
        title="Delete Qualification"
        message={`Are you sure you want to delete "${deletingQual?.name}"? This will remove it from all staff and shift requirements.`}
        confirmText="Delete"
        variant="danger"
      />

      <ConfirmModal
        isOpen={!!deletingShift}
        onClose={() => setDeletingShift(null)}
        onConfirm={() => {
          if (deletingShift) removeRequirement(deletingShift.id);
          setDeletingShift(null);
        }}
        title="Delete Shift Requirement"
        message="Are you sure you want to delete this shift requirement?"
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
