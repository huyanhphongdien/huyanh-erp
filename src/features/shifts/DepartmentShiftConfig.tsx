// ============================================================
// DEPARTMENT SHIFT CONFIG - Cấu hình phòng ban ↔ ca
// File: src/features/shifts/DepartmentShiftConfig.tsx
// ============================================================

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shiftService, departmentService } from '../../services';
import { Save, Check, Loader2, Info, Building2 } from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface Shift {
  id: string;
  code: string;
  name: string;
  shift_category: string;
  start_time: string;
  end_time: string;
}

interface Department {
  id: string;
  code: string;
  name: string;
}

interface ConfigMap {
  [deptId: string]: {
    shifts: Set<string>;     // shift IDs enabled
    defaultShift: string;    // shift ID that is default
  };
}

// ============================================================
// CONSTANTS
// ============================================================

const CATEGORY_HEADER: Record<string, string> = {
  short: 'Ca ngắn',
  long: 'Ca dài',
  admin: 'HC',
};

const CATEGORY_COLORS: Record<string, string> = {
  short: 'bg-blue-50 text-blue-700',
  long: 'bg-purple-50 text-purple-700',
  admin: 'bg-green-50 text-green-700',
};

// ============================================================
// COMPONENT
// ============================================================

export function DepartmentShiftConfig() {
  const queryClient = useQueryClient();
  
  // State
  const [configMap, setConfigMap] = useState<ConfigMap>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [savingDept, setSavingDept] = useState<string | null>(null);
  const [successDept, setSuccessDept] = useState<string | null>(null);

  // Queries
  const { data: shiftsData, isLoading: loadingShifts } = useQuery({
    queryKey: ['shifts-all-active'],
    queryFn: () => shiftService.getAllActive(),
  });

  const { data: departments, isLoading: loadingDepts } = useQuery({
    queryKey: ['departments-all'],
    queryFn: () => departmentService.getAll({ page: 1, pageSize: 100 }),
  });

  const { data: existingConfigs, isLoading: loadingConfigs } = useQuery({
    queryKey: ['department-shift-configs'],
    queryFn: () => shiftService.getAllDepartmentConfigs(),
  });

  const shifts = shiftsData || [];
  const deptList = (departments?.data || []).filter(
    (d: Department) => d.code !== 'HAP-BGD'  // Bỏ Ban Giám đốc
  );

  // Build initial config map from existing data
  useEffect(() => {
    if (existingConfigs && deptList.length > 0) {
      const map: ConfigMap = {};
      
      deptList.forEach((dept: Department) => {
        map[dept.id] = { shifts: new Set(), defaultShift: '' };
      });

      existingConfigs.forEach((config: any) => {
        if (map[config.department_id]) {
          map[config.department_id].shifts.add(config.shift_id);
          if (config.is_default) {
            map[config.department_id].defaultShift = config.shift_id;
          }
        }
      });

      setConfigMap(map);
      setHasChanges(false);
    }
  }, [existingConfigs, deptList.length]);

  // Toggle shift for department
  const toggleShift = (deptId: string, shiftId: string) => {
    setConfigMap(prev => {
      const dept = prev[deptId] || { shifts: new Set(), defaultShift: '' };
      const newShifts = new Set(dept.shifts);
      
      if (newShifts.has(shiftId)) {
        newShifts.delete(shiftId);
        // Nếu xóa shift mặc định → clear default
        const newDefault = dept.defaultShift === shiftId ? '' : dept.defaultShift;
        return { 
          ...prev, 
          [deptId]: { shifts: newShifts, defaultShift: newDefault } 
        };
      } else {
        newShifts.add(shiftId);
        // Nếu chưa có default → set cái vừa thêm làm default
        const newDefault = dept.defaultShift || shiftId;
        return { 
          ...prev, 
          [deptId]: { shifts: newShifts, defaultShift: newDefault } 
        };
      }
    });
    setHasChanges(true);
  };

  // Set default shift for department
  const setDefaultShift = (deptId: string, shiftId: string) => {
    setConfigMap(prev => ({
      ...prev,
      [deptId]: {
        ...prev[deptId],
        defaultShift: shiftId,
      },
    }));
    setHasChanges(true);
  };

  // Toggle all shifts for a department
  const toggleAllForDept = (deptId: string) => {
    setConfigMap(prev => {
      const dept = prev[deptId] || { shifts: new Set(), defaultShift: '' };
      const allShiftIds = shifts.map(s => s.id);
      
      if (dept.shifts.size === allShiftIds.length) {
        // Deselect all
        return { ...prev, [deptId]: { shifts: new Set(), defaultShift: '' } };
      } else {
        // Select all
        return { 
          ...prev, 
          [deptId]: { 
            shifts: new Set(allShiftIds), 
            defaultShift: dept.defaultShift || allShiftIds[0] 
          } 
        };
      }
    });
    setHasChanges(true);
  };

  // Save one department
  const saveDepartment = async (deptId: string) => {
    try {
      setSavingDept(deptId);
      const config = configMap[deptId];
      
      const shiftConfigs = Array.from(config.shifts).map(shiftId => ({
        shift_id: shiftId,
        is_default: shiftId === config.defaultShift,
      }));

      await shiftService.updateDepartmentConfig(deptId, shiftConfigs);
      
      queryClient.invalidateQueries({ queryKey: ['department-shift-configs'] });
      setSuccessDept(deptId);
      setTimeout(() => setSuccessDept(null), 2000);
    } catch (error) {
      console.error('Save error:', error);
      alert('Lỗi lưu cấu hình');
    } finally {
      setSavingDept(null);
    }
  };

  // Save all
  const saveAll = async () => {
    for (const dept of deptList) {
      await saveDepartment(dept.id);
    }
    setHasChanges(false);
  };

  // Group shifts by category for headers
  const shiftsByCategory = {
    short: shifts.filter(s => s.shift_category === 'short'),
    long: shifts.filter(s => s.shift_category === 'long'),
    admin: shifts.filter(s => s.shift_category === 'admin'),
  };

  const isLoading = loadingShifts || loadingDepts || loadingConfigs;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-blue-600" />
        <span className="ml-2 text-gray-500">Đang tải cấu hình...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
        <Info size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-medium">Hướng dẫn:</p>
          <ul className="mt-1 space-y-0.5 text-blue-700">
            <li>☑️ Checkbox = phòng ban được phép sử dụng ca này</li>
            <li>⭐ Radio = ca mặc định khi phân ca nhanh</li>
            <li>Ban Giám đốc không hiển thị (không cần phân ca)</li>
          </ul>
        </div>
      </div>

      {/* Save All Button */}
      {hasChanges && (
        <div className="flex items-center justify-end">
          <button
            onClick={saveAll}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Save size={16} />
            Lưu tất cả thay đổi
          </button>
        </div>
      )}

      {/* Config Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {/* Category headers */}
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left bg-gray-50 font-semibold text-gray-700 sticky left-0 z-10 min-w-[180px]">
                  Phòng ban
                </th>
                {(['short', 'long', 'admin'] as const).map(cat => {
                  const catShifts = shiftsByCategory[cat];
                  if (catShifts.length === 0) return null;
                  return (
                    <th 
                      key={cat}
                      colSpan={catShifts.length} 
                      className={`px-2 py-2 text-center border-l border-gray-200 ${CATEGORY_COLORS[cat]}`}
                    >
                      {CATEGORY_HEADER[cat]}
                    </th>
                  );
                })}
                <th className="px-4 py-3 text-center bg-gray-50 border-l border-gray-200 min-w-[80px]">
                  Thao tác
                </th>
              </tr>

              {/* Shift name headers */}
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-2 text-left sticky left-0 z-10 bg-gray-50"></th>
                {shifts.map(shift => (
                  <th key={shift.id} className="px-2 py-2 text-center border-l border-gray-100 font-medium text-gray-600 whitespace-nowrap min-w-[80px]">
                    <div className="text-xs">{shift.name}</div>
                    <div className="text-[10px] text-gray-400 font-normal mt-0.5">
                      {shift.start_time?.substring(0, 5)}-{shift.end_time?.substring(0, 5)}
                    </div>
                  </th>
                ))}
                <th className="px-4 py-2 text-center bg-gray-50 border-l border-gray-200"></th>
              </tr>
            </thead>

            <tbody>
              {deptList.map((dept: Department) => {
                const deptConfig = configMap[dept.id] || { shifts: new Set(), defaultShift: '' };
                const allSelected = deptConfig.shifts.size === shifts.length;
                const isSaving = savingDept === dept.id;
                const isSuccess = successDept === dept.id;

                return (
                  <tr key={dept.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    {/* Department Name */}
                    <td className="px-4 py-3 sticky left-0 bg-white z-10">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <Building2 size={14} className="text-gray-500" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 text-sm">{dept.name}</div>
                          <div className="text-xs text-gray-400">{dept.code}</div>
                        </div>
                      </div>
                    </td>

                    {/* Shift Checkboxes + Default Radio */}
                    {shifts.map(shift => {
                      const isEnabled = deptConfig.shifts.has(shift.id);
                      const isDefault = deptConfig.defaultShift === shift.id;

                      return (
                        <td key={shift.id} className="px-2 py-3 text-center border-l border-gray-100">
                          <div className="flex flex-col items-center gap-1">
                            {/* Enable checkbox */}
                            <label className="cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={() => toggleShift(dept.id, shift.id)}
                                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                              />
                            </label>

                            {/* Default radio (only show if enabled) */}
                            {isEnabled && (
                              <label 
                                className="cursor-pointer flex items-center gap-0.5"
                                title="Ca mặc định"
                              >
                                <input
                                  type="radio"
                                  name={`default-${dept.id}`}
                                  checked={isDefault}
                                  onChange={() => setDefaultShift(dept.id, shift.id)}
                                  className="w-3 h-3 text-amber-500 border-gray-300 focus:ring-amber-500 cursor-pointer"
                                />
                                {isDefault && (
                                  <span className="text-[10px] text-amber-600">⭐</span>
                                )}
                              </label>
                            )}
                          </div>
                        </td>
                      );
                    })}

                    {/* Actions */}
                    <td className="px-3 py-3 text-center border-l border-gray-200">
                      <div className="flex items-center justify-center gap-1">
                        {/* Toggle all */}
                        <button
                          onClick={() => toggleAllForDept(dept.id)}
                          className={`px-2 py-1 text-xs rounded transition-colors ${
                            allSelected
                              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                          title={allSelected ? 'Bỏ tất cả' : 'Chọn tất cả'}
                        >
                          {allSelected ? '✓ Tất cả' : 'Tất cả'}
                        </button>

                        {/* Save button */}
                        <button
                          onClick={() => saveDepartment(dept.id)}
                          disabled={isSaving}
                          className={`p-1.5 rounded transition-colors ${
                            isSuccess
                              ? 'bg-green-100 text-green-600'
                              : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'
                          }`}
                          title="Lưu phòng ban này"
                        >
                          {isSaving ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : isSuccess ? (
                            <Check size={14} />
                          ) : (
                            <Save size={14} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {deptList.map((dept: Department) => {
          const config = configMap[dept.id];
          const count = config?.shifts?.size || 0;
          const defaultShift = shifts.find(s => s.id === config?.defaultShift);

          return (
            <div key={dept.id} className="px-4 py-3 bg-white rounded-lg border border-gray-200">
              <div className="text-sm font-medium text-gray-900 truncate">{dept.name}</div>
              <div className="flex items-center justify-between mt-1">
                <span className={`text-xs ${count > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                  {count > 0 ? `${count} ca` : 'Chưa cấu hình'}
                </span>
                {defaultShift && (
                  <span className="text-xs text-amber-600">⭐ {defaultShift.name}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DepartmentShiftConfig;