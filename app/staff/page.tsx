'use client';

import React, { useState } from 'react';
import { useStore } from '@/lib/store';
import { Navigation } from '@/components/Navigation';
import { StaffCard } from '@/components/StaffCard';
import { StaffForm } from '@/components/StaffForm';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import type { Staff } from '@/lib/types';

export default function StaffPage() {
  const { staff, qualifications, addStaff, updateStaff, removeStaff } = useStore();
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [deletingStaff, setDeletingStaff] = useState<Staff | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredStaff = staff.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddStaff = (data: Omit<Staff, 'id' | 'createdAt' | 'color'>) => {
    addStaff(data);
    setIsAddModalOpen(false);
  };

  const handleUpdateStaff = (data: Omit<Staff, 'id' | 'createdAt' | 'color'>) => {
    if (editingStaff) {
      updateStaff(editingStaff.id, data);
      setEditingStaff(null);
    }
  };

  const handleDeleteStaff = () => {
    if (deletingStaff) {
      removeStaff(deletingStaff.id);
      setDeletingStaff(null);
    }
  };

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <Navigation />

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Staff</h1>
            <p className="text-white/60 mt-1">
              {staff.length} team member{staff.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button
            onClick={() => setIsAddModalOpen(true)}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            }
          >
            Add Staff
          </Button>
        </div>

        {/* Search */}
        {staff.length > 3 && (
          <div className="mb-6">
            <Input
              placeholder="Search staff..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              }
            />
          </div>
        )}

        {/* Staff List */}
        {staff.length === 0 ? (
          <EmptyState
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            }
            title="No staff members yet"
            description="Add your first team member to start building schedules"
            action={{
              label: 'Add Staff',
              onClick: () => setIsAddModalOpen(true),
            }}
          />
        ) : filteredStaff.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-white/60">No staff matching &quot;{searchQuery}&quot;</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredStaff.map((s, index) => (
              <div
                key={s.id}
                className="animate-slide-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <StaffCard
                  staff={s}
                  qualifications={qualifications}
                  onEdit={() => setEditingStaff(s)}
                  onDelete={() => setDeletingStaff(s)}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add Staff Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Staff Member"
        description="Add a new team member to your schedule"
        size="lg"
      >
        <StaffForm
          qualifications={qualifications}
          onSubmit={handleAddStaff}
          onCancel={() => setIsAddModalOpen(false)}
        />
      </Modal>

      {/* Edit Staff Modal */}
      <Modal
        isOpen={!!editingStaff}
        onClose={() => setEditingStaff(null)}
        title="Edit Staff Member"
        size="lg"
      >
        {editingStaff && (
          <StaffForm
            staff={editingStaff}
            qualifications={qualifications}
            onSubmit={handleUpdateStaff}
            onCancel={() => setEditingStaff(null)}
          />
        )}
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deletingStaff}
        onClose={() => setDeletingStaff(null)}
        onConfirm={handleDeleteStaff}
        title="Delete Staff Member"
        message={`Are you sure you want to remove ${deletingStaff?.name}? This will also remove their availability and any scheduled shifts.`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}

