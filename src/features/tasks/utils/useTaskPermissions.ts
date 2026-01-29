// ============================================================================
// USE TASK PERMISSIONS HOOK
// File: src/features/tasks/utils/useTaskPermissions.ts
// Huy Anh ERP System
// ============================================================================

import { useCallback, useMemo, useState, useEffect } from 'react';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  getTaskPermissions,
  getPermissionGroup,
  isExecutive,
  isManagerLevel,
  isEmployeeLevel,
  canUserApproveTask,
  canAssignToEmployee,
  type TaskForPermission,
  type TaskPermissions,
  type PermissionGroup,
  type UserRole,
} from './taskPermissions';

// ============================================================================
// TYPES
// ============================================================================

export interface UseTaskPermissionsReturn {
  isLoading: boolean;
  userLevel: number;
  userDepartmentId: string;
  userEmployeeId: string;
  userGroup: PermissionGroup;
  userRole: UserRole;
  isAdmin: boolean;
  isExecutive: boolean;
  isManager: boolean;
  isEmployee: boolean;
  getPermissions: (task: TaskForPermission) => TaskPermissions;
  getPermissionsForList: (tasks: TaskForPermission[]) => Map<string, TaskPermissions>;
  canApprove: (assignerLevel: number | null, taskDepartmentId: string | null) => { canApprove: boolean; reason?: string };
  canAssignTo: (targetDepartmentId: string | null) => { canAssign: boolean; reason?: string };
}

// ============================================================================
// HOOK
// ============================================================================

export function useTaskPermissions(): UseTaskPermissionsReturn {
  const { user } = useAuthStore();
  const [positionLevel, setPositionLevel] = useState<number>(6); // Default = Employee
  const [isLoading, setIsLoading] = useState(true);

  // Fetch position level từ database
  useEffect(() => {
    async function fetchPositionLevel() {
      console.log('🔐 [useTaskPermissions] Fetching position level for user:', user?.employee_id);
      
      if (!user?.position_id) {
        console.log('🔐 [useTaskPermissions] No position_id, defaulting to level 6 (Employee)');
        setPositionLevel(6);
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('positions')
          .select('level, name')
          .eq('id', user.position_id)
          .maybeSingle();

        if (error) {
          console.error('❌ [useTaskPermissions] Error fetching position:', error);
          setPositionLevel(6);
        } else if (data) {
          console.log('✅ [useTaskPermissions] Position found:', data);
          setPositionLevel(data.level || 6);
        } else {
          console.log('⚠️ [useTaskPermissions] No position data, defaulting to level 6');
          setPositionLevel(6);
        }
      } catch (err) {
        console.error('❌ [useTaskPermissions] Exception:', err);
        setPositionLevel(6);
      } finally {
        setIsLoading(false);
      }
    }

    fetchPositionLevel();
  }, [user?.position_id, user?.employee_id]);

  // User context
  const userLevel = positionLevel;
  const userDepartmentId = user?.department_id || '';
  const userEmployeeId = user?.employee_id || '';
  const userRole: UserRole = (user?.role as UserRole) || 'employee';
  const isAdmin = user?.role === 'admin';

  // Permission group
  const userGroup = useMemo(() => getPermissionGroup(userLevel), [userLevel]);
  const userIsExecutive = useMemo(() => isExecutive(userLevel), [userLevel]);
  const userIsManager = useMemo(() => isManagerLevel(userLevel), [userLevel]);
  const userIsEmployee = useMemo(() => isEmployeeLevel(userLevel), [userLevel]);

  // Log khi permission context thay đổi
  useEffect(() => {
    if (!isLoading) {
      console.log('🔐 [useTaskPermissions] Permission context ready:', {
        employeeId: userEmployeeId,
        departmentId: userDepartmentId,
        positionLevel: userLevel,
        group: userGroup,
        role: userRole,
        isAdmin,
        isExecutive: userIsExecutive,
        isManager: userIsManager,
        isEmployee: userIsEmployee,
      });
    }
  }, [isLoading, userEmployeeId, userDepartmentId, userLevel, userGroup, userRole, isAdmin, userIsExecutive, userIsManager, userIsEmployee]);

  // ========== PERMISSION CHECK FUNCTIONS ==========

  const getPermissions = useCallback(
    (task: TaskForPermission): TaskPermissions => {
      return getTaskPermissions(
        task,
        userEmployeeId,
        userRole,
        userDepartmentId,
        userLevel
      );
    },
    [userEmployeeId, userRole, userDepartmentId, userLevel]
  );

  const getPermissionsForList = useCallback(
    (tasks: TaskForPermission[]): Map<string, TaskPermissions> => {
      const results = new Map<string, TaskPermissions>();
      for (const task of tasks) {
        results.set(task.id, getPermissions(task));
      }
      return results;
    },
    [getPermissions]
  );

  const canApprove = useCallback(
    (assignerLevel: number | null, taskDepartmentId: string | null) => {
      return canUserApproveTask(
        userLevel,
        userDepartmentId,
        assignerLevel,
        taskDepartmentId,
        isAdmin
      );
    },
    [userLevel, userDepartmentId, isAdmin]
  );

  const canAssignTo = useCallback(
    (targetDepartmentId: string | null) => {
      return canAssignToEmployee(
        userLevel,
        userDepartmentId,
        targetDepartmentId,
        isAdmin
      );
    },
    [userLevel, userDepartmentId, isAdmin]
  );

  return {
    isLoading,
    userLevel,
    userDepartmentId,
    userEmployeeId,
    userGroup,
    userRole,
    isAdmin,
    isExecutive: userIsExecutive,
    isManager: userIsManager,
    isEmployee: userIsEmployee,
    getPermissions,
    getPermissionsForList,
    canApprove,
    canAssignTo,
  };
}

export default useTaskPermissions;