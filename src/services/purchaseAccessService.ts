// ============================================================================
// PURCHASE ACCESS SERVICE
// File: src/services/purchaseAccessService.ts
// Huy Anh ERP System - Phase 6: Access Control
// ============================================================================
// Service quản lý phân quyền truy cập module Mua hàng
// - Executive (level ≤ 5): Luôn có quyền, không cần grant
// - Nhân viên khác: Cần được cấp quyền qua bảng purchase_access
// - access_level: 'full' (CRUD) hoặc 'view_only' (chỉ xem)
// ============================================================================

import { supabase } from '../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

export type AccessLevel = 'full' | 'view_only';

export interface PurchaseAccess {
  id: string;
  employee_id: string;
  access_level: AccessLevel;
  granted_by: string | null;
  granted_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  employee?: {
    id: string;
    code: string;
    full_name: string;
    position_name?: string;
    department_name?: string;
    position_level?: number;
    avatar_url?: string;
  } | null;
  granter?: {
    id: string;
    full_name: string;
  } | null;
  revoker?: {
    id: string;
    full_name: string;
  } | null;
}

export interface AccessCheckResult {
  hasAccess: boolean;
  accessLevel: AccessLevel | null;
  isExecutive: boolean;
  reason?: string;
}

export interface AccessStats {
  total_granted: number;
  active_full: number;
  active_view_only: number;
  revoked_count: number;
  executive_count: number;
}

export interface GrantAccessInput {
  employee_id: string;
  access_level: AccessLevel;
  notes?: string;
  granted_by?: string;
}

export interface EmployeeForGrant {
  id: string;
  code: string;
  full_name: string;
  position_name: string | null;
  department_name: string | null;
  position_level: number | null;
  avatar_url: string | null;
  already_has_access: boolean;
  current_access_level: AccessLevel | null;
}

// ============================================================================
// SERVICE
// ============================================================================

export const purchaseAccessService = {
  // ==========================================================================
  // CHECK ACCESS
  // ==========================================================================

  /**
   * Kiểm tra user hiện tại có quyền truy cập module Mua hàng không
   * Dùng trong Sidebar, PurchaseAccessGuard, và các component khác
   */
  async hasAccess(): Promise<boolean> {
    try {
      const result = await this.checkCurrentUserAccess();
      return result.hasAccess;
    } catch (err) {
      console.error('❌ [purchaseAccess] hasAccess error:', err);
      return false;
    }
  },

  /**
   * Kiểm tra chi tiết quyền của user hiện tại
   * ✅ FIX: Bỏ cột "role" (không tồn tại), fix FK syntax cho position/department
   */
  async checkCurrentUserAccess(): Promise<AccessCheckResult> {
    try {
      // 1. Lấy user hiện tại
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        return { hasAccess: false, accessLevel: null, isExecutive: false, reason: 'Chưa đăng nhập' };
      }

      // 2. Lấy employee info (SIMPLE query - không nested FK)
      const { data: employee, error: empError } = await supabase
        .from('employees')
        .select('id, position_id, department_id')
        .eq('user_id', authUser.id)
        .eq('status', 'active')
        .maybeSingle();

      if (empError || !employee) {
        return { hasAccess: false, accessLevel: null, isExecutive: false, reason: 'Không tìm thấy nhân viên' };
      }

      // 3. Lấy position level RIÊNG (tránh lỗi 406)
      let positionLevel: number | null = null;
      if (employee.position_id) {
        const { data: posData } = await supabase
          .from('positions')
          .select('level')
          .eq('id', employee.position_id)
          .maybeSingle();
        positionLevel = posData?.level ?? null;
      }

      // 4. Lấy department name RIÊNG (tránh lỗi 406)
      let deptName = '';
      if (employee.department_id) {
        const { data: deptData } = await supabase
          .from('departments')
          .select('name')
          .eq('id', employee.department_id)
          .maybeSingle();
        deptName = (deptData?.name || '').toLowerCase();
      }

      // 5. Check admin từ auth metadata (KHÔNG dùng employee.role)
      const userMetadata = authUser.user_metadata;
      if (userMetadata?.is_admin === true || userMetadata?.role === 'admin') {
        return { hasAccess: true, accessLevel: 'full', isExecutive: true };
      }

      // 6. Executive (level ≤ 5) → full access
      if (positionLevel && positionLevel <= 5) {
        return { hasAccess: true, accessLevel: 'full', isExecutive: true };
      }

      // 7. Phòng Kế toán → auto full access (không cần cấp thủ công)
      if (deptName.includes('kế toán') || deptName.includes('ke toan') || deptName.includes('tài chính') || deptName.includes('accounting') || deptName.includes('finance')) {
        return { hasAccess: true, accessLevel: 'full', isExecutive: false };
      }

      // 8. Kiểm tra bảng purchase_access (được BGĐ cấp thủ công)
      return this.checkEmployeeAccess(employee.id);
    } catch (err: any) {
      console.error('❌ [purchaseAccess] checkCurrentUserAccess error:', err);
      return { hasAccess: false, accessLevel: null, isExecutive: false, reason: err.message };
    }
  },

  /**
   * Kiểm tra quyền của 1 employee cụ thể
   */
  async checkEmployeeAccess(employeeId: string): Promise<AccessCheckResult> {
    try {
      // Thử dùng RPC function trước
      const { data: rpcResult, error: rpcError } = await supabase
        .rpc('fn_check_purchase_access', { p_employee_id: employeeId });

      if (!rpcError && rpcResult && rpcResult.length > 0) {
        const row = rpcResult[0];
        return {
          hasAccess: row.has_access || false,
          accessLevel: row.access_level || null,
          isExecutive: row.is_executive || false,
        };
      }

      // Fallback: query trực tiếp
      const { data: accessData } = await supabase
        .from('purchase_access')
        .select('access_level')
        .eq('employee_id', employeeId)
        .eq('is_active', true)
        .maybeSingle();

      if (accessData) {
        return {
          hasAccess: true,
          accessLevel: accessData.access_level as AccessLevel,
          isExecutive: false,
        };
      }

      return { hasAccess: false, accessLevel: null, isExecutive: false, reason: 'Chưa được cấp quyền' };
    } catch (err: any) {
      console.error('❌ [purchaseAccess] checkEmployeeAccess error:', err);
      return { hasAccess: false, accessLevel: null, isExecutive: false, reason: err.message };
    }
  },

  /**
   * Kiểm tra quyền cụ thể (dùng trong component)
   * 'full' → có thể tạo, sửa, xóa
   * 'view_only' → chỉ xem
   */
  async hasPermission(requiredLevel: AccessLevel = 'view_only'): Promise<boolean> {
    const result = await this.checkCurrentUserAccess();
    if (!result.hasAccess) return false;
    if (result.isExecutive) return true;
    if (requiredLevel === 'view_only') return true;
    return result.accessLevel === 'full';
  },

  // ==========================================================================
  // ACCESS LIST (cho AccessManagementPage)
  // ==========================================================================

  /**
   * Lấy danh sách tất cả access grants (active + revoked)
   * ✅ FIX: Dùng đúng FK syntax cho nested relations
   */
  async getAccessList(params?: {
    activeOnly?: boolean;
    search?: string;
  }): Promise<PurchaseAccess[]> {
    console.log('📋 [purchaseAccess] getAccessList:', params);

    let query = supabase
      .from('purchase_access')
      .select(`
        *,
        employee:employees!purchase_access_employee_id_fkey(
          id, code, full_name, avatar_url,
          position:positions!employees_position_id_fkey(name, level),
          department:departments!employees_department_id_fkey(name)
        ),
        granter:employees!purchase_access_granted_by_fkey(id, full_name),
        revoker:employees!purchase_access_revoked_by_fkey(id, full_name)
      `)
      .order('is_active', { ascending: false })
      .order('granted_at', { ascending: false });

    if (params?.activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ [purchaseAccess] getAccessList error:', error);
      throw error;
    }

    // Map relations
    const result = (data || []).map((item: any) => {
      const employee = Array.isArray(item.employee) ? item.employee[0] : item.employee;
      const granter = Array.isArray(item.granter) ? item.granter[0] : item.granter;
      const revoker = Array.isArray(item.revoker) ? item.revoker[0] : item.revoker;
      const position = employee?.position 
        ? (Array.isArray(employee.position) ? employee.position[0] : employee.position) 
        : null;
      const department = employee?.department 
        ? (Array.isArray(employee.department) ? employee.department[0] : employee.department) 
        : null;

      return {
        ...item,
        employee: employee ? {
          id: employee.id,
          code: employee.code,
          full_name: employee.full_name,
          avatar_url: employee.avatar_url,
          position_name: position?.name || null,
          department_name: department?.name || null,
          position_level: position?.level ?? null,
        } : null,
        granter: granter || null,
        revoker: revoker || null,
      };
    });

    // Filter by search (client-side)
    if (params?.search) {
      const s = params.search.toLowerCase();
      return result.filter((item: PurchaseAccess) => 
        item.employee?.full_name?.toLowerCase().includes(s) ||
        item.employee?.code?.toLowerCase().includes(s) ||
        item.employee?.department_name?.toLowerCase().includes(s)
      );
    }

    console.log('✅ [purchaseAccess] Found', result.length, 'access records');
    return result;
  },

  // ==========================================================================
  // GRANT / REVOKE
  // ==========================================================================

  /**
   * Cấp quyền truy cập module Mua hàng cho nhân viên
   */
  async grantAccess(input: GrantAccessInput): Promise<PurchaseAccess> {
    console.log('🔑 [purchaseAccess] grantAccess:', input);

    // Kiểm tra nhân viên đã có quyền chưa
    const existing = await this.checkEmployeeAccess(input.employee_id);
    if (existing.hasAccess && existing.isExecutive) {
      throw new Error('Nhân viên này là cấp quản lý, đã có quyền tự động');
    }

    const { data, error } = await supabase
      .from('purchase_access')
      .upsert({
        employee_id: input.employee_id,
        access_level: input.access_level,
        granted_by: input.granted_by || null,
        granted_at: new Date().toISOString(),
        is_active: true,
        revoked_at: null,
        revoked_by: null,
        notes: input.notes || null,
      }, {
        onConflict: 'employee_id',
      })
      .select()
      .single();

    if (error) {
      console.error('❌ [purchaseAccess] grantAccess error:', error);
      throw error;
    }

    console.log('✅ [purchaseAccess] Granted access to employee:', input.employee_id);
    return data;
  },

  /**
   * Thu hồi quyền truy cập
   */
  async revokeAccess(accessId: string, revokedBy?: string): Promise<void> {
    console.log('🔒 [purchaseAccess] revokeAccess:', accessId);

    const { error } = await supabase
      .from('purchase_access')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
        revoked_by: revokedBy || null,
      })
      .eq('id', accessId);

    if (error) {
      console.error('❌ [purchaseAccess] revokeAccess error:', error);
      throw error;
    }

    console.log('✅ [purchaseAccess] Revoked access:', accessId);
  },

  /**
   * Thay đổi access level (không cần revoke + grant lại)
   */
  async updateAccessLevel(accessId: string, newLevel: AccessLevel): Promise<void> {
    console.log('✏️ [purchaseAccess] updateAccessLevel:', accessId, '→', newLevel);

    const { error } = await supabase
      .from('purchase_access')
      .update({ access_level: newLevel })
      .eq('id', accessId)
      .eq('is_active', true);

    if (error) {
      console.error('❌ [purchaseAccess] updateAccessLevel error:', error);
      throw error;
    }

    console.log('✅ [purchaseAccess] Updated access level:', accessId);
  },

  // ==========================================================================
  // EMPLOYEE LIST (cho GrantAccessModal)
  // ==========================================================================

  /**
   * Lấy danh sách nhân viên có thể cấp quyền
   * (không bao gồm executive vì họ đã có quyền tự động)
   * ✅ FIX: Dùng đúng FK syntax cho position/department
   */
  async getEmployeesForGrant(search?: string): Promise<EmployeeForGrant[]> {
    console.log('👥 [purchaseAccess] getEmployeesForGrant:', search);

    // Lấy tất cả nhân viên active
    let query = supabase
      .from('employees')
      .select(`
        id, code, full_name, avatar_url,
        position:positions!employees_position_id_fkey(name, level),
        department:departments!employees_department_id_fkey(name)
      `)
      .eq('status', 'active')
      .order('full_name');

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,code.ilike.%${search}%`);
    }

    const { data: employees, error } = await query;
    if (error) throw error;

    // Lấy danh sách đã có access
    const { data: accessList } = await supabase
      .from('purchase_access')
      .select('employee_id, access_level')
      .eq('is_active', true);

    const accessMap = new Map(
      (accessList || []).map((a: any) => [a.employee_id, a.access_level as AccessLevel])
    );

    // Map kết quả — lọc bỏ executive (level ≤ 5) vì họ đã có quyền tự động
    return (employees || [])
      .map((emp: any) => {
        const position = Array.isArray(emp.position) ? emp.position[0] : emp.position;
        const department = Array.isArray(emp.department) ? emp.department[0] : emp.department;
        const level = position?.level ?? null;

        return {
          id: emp.id,
          code: emp.code,
          full_name: emp.full_name,
          avatar_url: emp.avatar_url,
          position_name: position?.name || null,
          department_name: department?.name || null,
          position_level: level,
          already_has_access: accessMap.has(emp.id),
          current_access_level: accessMap.get(emp.id) || null,
        };
      })
      .filter(emp => !emp.position_level || emp.position_level > 5);
  },

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Lấy thống kê access (cho AccessManagementPage header)
   * ✅ FIX: Tách query position riêng để tránh lỗi 406
   */
  async getStats(): Promise<AccessStats> {
    console.log('📊 [purchaseAccess] getStats');

    try {
      const { data, error } = await supabase.rpc('fn_purchase_access_stats');

      if (!error && data && data.length > 0) {
        return data[0] as AccessStats;
      }
    } catch (err) {
      console.warn('⚠️ [purchaseAccess] fn_purchase_access_stats failed:', err);
    }

    // Fallback
    const { data: activeAccess } = await supabase
      .from('purchase_access')
      .select('access_level, is_active');

    // Đếm executive: lấy employees + position_id, rồi query positions riêng
    const { data: allEmployees } = await supabase
      .from('employees')
      .select('id, position_id')
      .eq('status', 'active');

    // Batch lấy positions
    const positionIds = [...new Set((allEmployees || []).map(e => e.position_id).filter(Boolean))];
    let positionLevelMap = new Map<string, number>();

    if (positionIds.length > 0) {
      const { data: positions } = await supabase
        .from('positions')
        .select('id, level')
        .in('id', positionIds);

      (positions || []).forEach((p: any) => {
        positionLevelMap.set(p.id, p.level);
      });
    }

    const executiveCount = (allEmployees || []).filter(e => {
      if (!e.position_id) return false;
      const level = positionLevelMap.get(e.position_id);
      return level != null && level <= 5;
    }).length;

    const all = activeAccess || [];
    const active = all.filter((a: any) => a.is_active);

    return {
      total_granted: active.length,
      active_full: active.filter((a: any) => a.access_level === 'full').length,
      active_view_only: active.filter((a: any) => a.access_level === 'view_only').length,
      revoked_count: all.filter((a: any) => !a.is_active).length,
      executive_count: executiveCount || 0,
    };
  },
};

export default purchaseAccessService;