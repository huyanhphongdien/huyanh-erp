// ============================================================================
// GRANT ACCESS MODAL
// File: src/features/purchasing/pages/components/access/GrantAccessModal.tsx
// Huy Anh ERP System - Phase 6: Access Control
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Search,
  ShieldCheck,
  ShieldPlus,
  User,
  Building2,
  Briefcase,
  Loader2,
  Check,
  Eye,
  Edit3,
  AlertTriangle,
} from 'lucide-react';
import { purchaseAccessService } from '../../../../../services/purchaseAccessService';
import type {
  AccessLevel,
  EmployeeForGrant,
} from '../../../../../services/purchaseAccessService';

// ============================================================================
// TYPES
// ============================================================================

interface GrantAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  grantedBy?: string; // employee_id of granter
}

// ============================================================================
// COMPONENT
// ============================================================================

const GrantAccessModal: React.FC<GrantAccessModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  grantedBy,
}) => {
  // State
  const [employees, setEmployees] = useState<EmployeeForGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeForGrant | null>(null);
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('full');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ========================================================================
  // FETCH EMPLOYEES
  // ========================================================================

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const data = await purchaseAccessService.getEmployeesForGrant(search || undefined);
      setEmployees(data);
    } catch (err: any) {
      console.error('Error fetching employees:', err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (isOpen) {
      fetchEmployees();
    }
  }, [isOpen, fetchEmployees]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setSelectedEmployee(null);
      setAccessLevel('full');
      setNotes('');
      setSearch('');
      setError(null);
    }
  }, [isOpen]);

  // ========================================================================
  // HANDLERS
  // ========================================================================

  const handleGrant = async () => {
    if (!selectedEmployee) return;

    try {
      setSaving(true);
      setError(null);

      await purchaseAccessService.grantAccess({
        employee_id: selectedEmployee.id,
        access_level: accessLevel,
        notes: notes || undefined,
        granted_by: grantedBy,
      });

      onSuccess();
    } catch (err: any) {
      console.error('Error granting access:', err);
      setError(err.message || 'Không thể cấp quyền');
    } finally {
      setSaving(false);
    }
  };

  // ========================================================================
  // RENDER
  // ========================================================================

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <ShieldPlus className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Cấp quyền truy cập</h2>
              <p className="text-xs text-gray-500">Module Quản lý Đơn hàng</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Step 1: Chọn nhân viên */}
          {!selectedEmployee ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Chọn nhân viên cần cấp quyền
              </label>

              {/* Search */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo tên, mã nhân viên..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              {/* Employee list */}
              <div className="border border-gray-200 rounded-xl max-h-[340px] overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
                    <span className="text-gray-500 text-sm">Đang tải...</span>
                  </div>
                ) : employees.length === 0 ? (
                  <div className="text-center py-10">
                    <User className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">Không tìm thấy nhân viên</p>
                    <p className="text-gray-400 text-xs mt-1">
                      Lưu ý: Cấp quản lý (Phó phòng trở lên) đã có quyền tự động
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {employees.map(emp => (
                      <button
                        key={emp.id}
                        onClick={() => {
                          setSelectedEmployee(emp);
                          if (emp.current_access_level) {
                            setAccessLevel(emp.current_access_level);
                          }
                        }}
                        className="w-full flex items-center gap-3 p-3 hover:bg-blue-50 transition-colors text-left"
                      >
                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-sm font-bold text-gray-600">
                          {emp.full_name?.charAt(0) || '?'}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 text-sm truncate">
                              {emp.full_name}
                            </span>
                            <span className="text-xs text-gray-400 font-mono">{emp.code}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                            {emp.position_name && (
                              <span className="flex items-center gap-1">
                                <Briefcase className="w-3 h-3" />
                                {emp.position_name}
                              </span>
                            )}
                            {emp.department_name && (
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {emp.department_name}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Badge nếu đã có quyền */}
                        {emp.already_has_access && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                            emp.current_access_level === 'full'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {emp.current_access_level === 'full' ? 'Toàn quyền' : 'Chỉ xem'}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Step 2: Cấu hình quyền */
            <div className="space-y-5">
              {/* Selected employee */}
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center text-sm font-bold text-blue-700">
                  {selectedEmployee.full_name?.charAt(0) || '?'}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 text-sm">{selectedEmployee.full_name}</p>
                  <p className="text-xs text-gray-500">
                    {selectedEmployee.code} · {selectedEmployee.position_name || ''} · {selectedEmployee.department_name || ''}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedEmployee(null)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Đổi
                </button>
              </div>

              {selectedEmployee.already_has_access && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>
                    Nhân viên này đã có quyền <strong>{selectedEmployee.current_access_level === 'full' ? 'Toàn quyền' : 'Chỉ xem'}</strong>. 
                    Lưu sẽ cập nhật quyền mới.
                  </span>
                </div>
              )}

              {/* Access level */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Mức quyền truy cập
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Full access */}
                  <button
                    onClick={() => setAccessLevel('full')}
                    className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                      accessLevel === 'full'
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {accessLevel === 'full' && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                    <Edit3 className={`w-5 h-5 mb-2 ${accessLevel === 'full' ? 'text-green-600' : 'text-gray-400'}`} />
                    <p className="font-semibold text-sm text-gray-900">Toàn quyền</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Xem, tạo, sửa, xóa đơn hàng, vật tư, NCC, thanh toán
                    </p>
                  </button>

                  {/* View only */}
                  <button
                    onClick={() => setAccessLevel('view_only')}
                    className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                      accessLevel === 'view_only'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {accessLevel === 'view_only' && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                    <Eye className={`w-5 h-5 mb-2 ${accessLevel === 'view_only' ? 'text-blue-600' : 'text-gray-400'}`} />
                    <p className="font-semibold text-sm text-gray-900">Chỉ xem</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Chỉ xem danh sách đơn hàng, vật tư, NCC. Không tạo/sửa/xóa
                    </p>
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Ghi chú <span className="text-gray-400 font-normal">(tùy chọn)</span>
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="VD: Phòng mua hàng, hỗ trợ kiểm kê..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {selectedEmployee && (
          <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              disabled={saving}
            >
              Hủy
            </button>
            <button
              onClick={handleGrant}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              {selectedEmployee.already_has_access ? 'Cập nhật quyền' : 'Cấp quyền'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GrantAccessModal;