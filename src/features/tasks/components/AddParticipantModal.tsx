// ============================================================================
// ADD PARTICIPANT MODAL COMPONENT
// File: src/features/tasks/components/AddParticipantModal.tsx
// Huy Anh ERP System
// ============================================================================

import React, { useState, useMemo } from 'react';
import { X, Search, UserPlus } from 'lucide-react';
import { AssignmentRoleBadge, getAllRoles, type AssignmentRole } from './AssignmentRoleBadge';

// ============================================================================
// TYPES
// ============================================================================

export interface Employee {
  id: string;
  full_name: string;
  email?: string;
  avatar_url?: string;
  position?: { name: string };
  department?: { name: string };
}

export interface AddParticipantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (employeeId: string, role: AssignmentRole) => Promise<void>;
  employees: Employee[];
  existingParticipantIds: string[];
  isLoading?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const AddParticipantModal: React.FC<AddParticipantModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  employees,
  existingParticipantIds,
  isLoading = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedRole, setSelectedRole] = useState<AssignmentRole>('assignee');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter available employees (not already participants)
  const availableEmployees = useMemo(() => {
    return employees.filter(emp => !existingParticipantIds.includes(emp.id));
  }, [employees, existingParticipantIds]);

  // Filter by search term
  const filteredEmployees = useMemo(() => {
    if (!searchTerm.trim()) return availableEmployees;
    const term = searchTerm.toLowerCase();
    return availableEmployees.filter(emp =>
      emp.full_name.toLowerCase().includes(term) ||
      emp.email?.toLowerCase().includes(term) ||
      emp.position?.name.toLowerCase().includes(term) ||
      emp.department?.name.toLowerCase().includes(term)
    );
  }, [availableEmployees, searchTerm]);

  // Roles
  const roles = getAllRoles();

  // Handle submit
  const handleSubmit = async () => {
    if (!selectedEmployee) return;

    setIsSubmitting(true);
    try {
      await onAdd(selectedEmployee.id, selectedRole);
      // Reset form
      setSelectedEmployee(null);
      setSelectedRole('assignee');
      setSearchTerm('');
      onClose();
    } catch (error) {
      console.error('Failed to add participant:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset on close
  const handleClose = () => {
    setSelectedEmployee(null);
    setSelectedRole('assignee');
    setSearchTerm('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50" onClick={handleClose} />

        {/* Modal */}
        <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <UserPlus size={20} />
              Thêm người tham gia
            </h3>
            <button
              onClick={handleClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm kiếm nhân viên..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Employee List */}
            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
              {isLoading ? (
                <div className="p-4 text-center text-gray-500">
                  Đang tải...
                </div>
              ) : filteredEmployees.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  {searchTerm ? 'Không tìm thấy nhân viên' : 'Không có nhân viên khả dụng'}
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {filteredEmployees.map((emp) => (
                    <li
                      key={emp.id}
                      onClick={() => setSelectedEmployee(emp)}
                      className={`
                        p-3 cursor-pointer transition-colors
                        ${selectedEmployee?.id === emp.id
                          ? 'bg-blue-50 border-l-4 border-blue-500'
                          : 'hover:bg-gray-50'
                        }
                      `}
                    >
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium">
                          {emp.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {emp.full_name}
                          </p>
                          <p className="text-sm text-gray-500 truncate">
                            {emp.position?.name || emp.email}
                            {emp.department && ` • ${emp.department.name}`}
                          </p>
                        </div>
                        {/* Selected indicator */}
                        {selectedEmployee?.id === emp.id && (
                          <span className="text-blue-600">✓</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Role Selection */}
            {selectedEmployee && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Vai trò
                </label>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <button
                      key={role.value}
                      onClick={() => setSelectedRole(role.value)}
                      className={`
                        px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                        ${selectedRole === role.value
                          ? 'ring-2 ring-offset-1 ring-blue-500'
                          : ''
                        }
                      `}
                    >
                      <AssignmentRoleBadge role={role.value} size="md" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Selected Summary */}
            {selectedEmployee && (
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">
                  Thêm <strong>{selectedEmployee.full_name}</strong> với vai trò{' '}
                  <AssignmentRoleBadge role={selectedRole} size="sm" />
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t">
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Hủy
            </button>
            <button
              onClick={handleSubmit}
              disabled={!selectedEmployee || isSubmitting}
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Đang thêm...' : 'Thêm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddParticipantModal;