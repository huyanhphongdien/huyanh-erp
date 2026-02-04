// ============================================
// src/services/purchaseAccessService.ts
// Module Quản lý đơn hàng - Access Control Service
// Huy Anh ERP System
// ============================================

import { supabase } from '../lib/supabase';

// ============================================
// TYPES
// ============================================

export interface PurchasePermissions {
  has_access: boolean;
  access_type: 'executive' | 'accounting' | 'granted' | 'none';
  access_id?: string;
  granted_by?: string;
  can_view: boolean;
  can_create_order: boolean;
  can_edit_order: boolean;
  can_delete_order: boolean;
  can_approve_order: boolean;
  can_add_invoice: boolean;
  can_add_payment: boolean;
  can_manage_suppliers: boolean;
  can_manage_materials: boolean;
  can_view_reports: boolean;
  can_export_data: boolean;
  can_view_all_orders: boolean;
  can_grant_access: boolean;
  max_order_amount?: number | null;
  valid_from?: string;
  valid_until?: string;
}

export interface PurchaseAccess {
  id: string;
  employee_id: string;
  granted_by: string;
  can_view: boolean;
  can_create_order: boolean;
  can_edit_order: boolean;
  can_delete_order: boolean;
  can_approve_order: boolean;
  can_add_invoice: boolean;
  can_add_payment: boolean;
  can_manage_suppliers: boolean;
  can_manage_materials: boolean;
  can_view_reports: boolean;
  can_export_data: boolean;
  can_view_all_orders: boolean;
  max_order_amount?: number;
  reason?: string;
  valid_from: string;
  valid_until?: string;
  status: 'active' | 'suspended' | 'revoked';
  created_at: string;
  updated_at: string;
  revoked_at?: string;
  revoked_by?: string;
  revoke_reason?: string;
}

export interface PurchaseAccessListItem extends PurchaseAccess {
  employee_code: string;
  employee_name: string;
  department_name: string;
  position_name: string;
  granted_by_name: string;
  is_valid: boolean;
  access_type: string;
}

export interface AllAccessItem {
  access_id?: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  department_name: string;
  position_name: string;
  access_type: 'executive' | 'accounting' | 'granted';
  can_view: boolean;
  can_create_order: boolean;
  can_edit_order: boolean;
  can_delete_order: boolean;
  can_approve_order: boolean;
  can_add_invoice: boolean;
  can_add_payment: boolean;
  can_manage_suppliers: boolean;
  can_manage_materials: boolean;
  can_view_reports: boolean;
  can_export_data: boolean;
  can_view_all_orders: boolean;
  can_grant_access: boolean;
  max_order_amount?: number;
  is_valid: boolean;
}

export interface GrantAccessInput {
  employee_id: string;
  permissions: Partial<{
    can_view: boolean;
    can_create_order: boolean;
    can_edit_order: boolean;
    can_delete_order: boolean;
    can_approve_order: boolean;
    can_add_invoice: boolean;
    can_add_payment: boolean;
    can_manage_suppliers: boolean;
    can_manage_materials: boolean;
    can_view_reports: boolean;
    can_export_data: boolean;
    can_view_all_orders: boolean;
    max_order_amount: number | null;
  }>;
  reason?: string;
  valid_until?: string;
}

export interface PurchaseAccessLog {
  id: string;
  access_id?: string;
  employee_id: string;
  action: 'granted' | 'updated' | 'suspended' | 'revoked' | 'restored';
  performed_by: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  reason?: string;
  created_at: string;
}

// Default permissions presets
export const DEFAULT_PERMISSIONS = {
  can_view: true,
  can_create_order: false,
  can_edit_order: false,
  can_delete_order: false,
  can_approve_order: false,
  can_add_invoice: false,
  can_add_payment: false,
  can_manage_suppliers: false,
  can_manage_materials: false,
  can_view_reports: false,
  can_export_data: false,
  can_view_all_orders: false,
  max_order_amount: null
};

export const FULL_PERMISSIONS = {
  can_view: true,
  can_create_order: true,
  can_edit_order: true,
  can_delete_order: true,
  can_approve_order: true,
  can_add_invoice: true,
  can_add_payment: true,
  can_manage_suppliers: true,
  can_manage_materials: true,
  can_view_reports: true,
  can_export_data: true,
  can_view_all_orders: true,
  max_order_amount: null
};

export const ORDER_CREATOR_PERMISSIONS = {
  can_view: true,
  can_create_order: true,
  can_edit_order: true,
  can_delete_order: false,
  can_approve_order: false,
  can_add_invoice: false,
  can_add_payment: false,
  can_manage_suppliers: false,
  can_manage_materials: false,
  can_view_reports: false,
  can_export_data: false,
  can_view_all_orders: false,
  max_order_amount: null
};


// ============================================
// PURCHASE ACCESS SERVICE
// ============================================

export const purchaseAccessService = {
  // ==========================================
  // KIỂM TRA QUYỀN
  // ==========================================

  /**
   * Lấy quyền của user hiện tại
   */
  async getMyPermissions(): Promise<PurchasePermissions> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return {
        has_access: false,
        access_type: 'none',
        can_view: false,
        can_create_order: false,
        can_edit_order: false,
        can_delete_order: false,
        can_approve_order: false,
        can_add_invoice: false,
        can_add_payment: false,
        can_manage_suppliers: false,
        can_manage_materials: false,
        can_view_reports: false,
        can_export_data: false,
        can_view_all_orders: false,
        can_grant_access: false
      };
    }

    // Lấy employee_id từ user
    const { data: employee } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!employee) {
      return {
        has_access: false,
        access_type: 'none',
        can_view: false,
        can_create_order: false,
        can_edit_order: false,
        can_delete_order: false,
        can_approve_order: false,
        can_add_invoice: false,
        can_add_payment: false,
        can_manage_suppliers: false,
        can_manage_materials: false,
        can_view_reports: false,
        can_export_data: false,
        can_view_all_orders: false,
        can_grant_access: false
      };
    }

    return this.getPermissions(employee.id);
  },

  /**
   * Lấy quyền của một nhân viên (gọi function database)
   */
  async getPermissions(employeeId: string): Promise<PurchasePermissions> {
    try {
      const { data, error } = await supabase
        .rpc('get_purchase_permissions', { emp_id: employeeId });

      // Nếu function chưa tồn tại, fallback
      if (error) {
        if (error.code === 'PGRST202' || error.message.includes('not find the function')) {
          console.warn('Function get_purchase_permissions not found, using fallback');
          return this.fallbackGetPermissions(employeeId);
        }
        throw error;
      }

      return data as PurchasePermissions;
    } catch (err) {
      console.error('getPermissions error:', err);
      return this.fallbackGetPermissions(employeeId);
    }
  },

  /**
   * Fallback get permissions khi function chưa được tạo
   */
  async fallbackGetPermissions(employeeId: string): Promise<PurchasePermissions> {
    const noAccess: PurchasePermissions = {
      has_access: false,
      access_type: 'none',
      can_view: false,
      can_create_order: false,
      can_edit_order: false,
      can_delete_order: false,
      can_approve_order: false,
      can_add_invoice: false,
      can_add_payment: false,
      can_manage_suppliers: false,
      can_manage_materials: false,
      can_view_reports: false,
      can_export_data: false,
      can_view_all_orders: false,
      can_grant_access: false
    };

    try {
      // Lấy thông tin employee với position level và department
      const { data: employee, error } = await supabase
        .from('employees')
        .select(`
          id,
          positions!inner(level),
          departments!inner(code)
        `)
        .eq('id', employeeId)
        .single();

      if (error || !employee) return noAccess;

      const positionLevel = (employee.positions as any)?.level || 99;
      const deptCode = (employee.departments as any)?.code || '';

      // BGĐ (Level 1-3) có full quyền
      if (positionLevel <= 3) {
        return {
          has_access: true,
          access_type: 'executive',
          can_view: true,
          can_create_order: true,
          can_edit_order: true,
          can_delete_order: true,
          can_approve_order: true,
          can_add_invoice: true,
          can_add_payment: true,
          can_manage_suppliers: true,
          can_manage_materials: true,
          can_view_reports: true,
          can_export_data: true,
          can_view_all_orders: true,
          can_grant_access: true
        };
      }

      // Kế toán có quyền xem + invoice + payment
      if (deptCode === 'HAP-KT') {
        return {
          has_access: true,
          access_type: 'accounting',
          can_view: true,
          can_create_order: false,
          can_edit_order: false,
          can_delete_order: false,
          can_approve_order: false,
          can_add_invoice: true,
          can_add_payment: true,
          can_manage_suppliers: false,
          can_manage_materials: false,
          can_view_reports: true,
          can_export_data: true,
          can_view_all_orders: true,
          can_grant_access: false
        };
      }

      // Check trong bảng purchase_access
      const { data: access } = await supabase
        .from('purchase_access')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('status', 'active')
        .maybeSingle();

      if (access) {
        return {
          has_access: true,
          access_type: 'granted',
          can_view: access.can_view || false,
          can_create_order: access.can_create_order || false,
          can_edit_order: access.can_edit_order || false,
          can_delete_order: access.can_delete_order || false,
          can_approve_order: access.can_approve_order || false,
          can_add_invoice: access.can_add_invoice || false,
          can_add_payment: access.can_add_payment || false,
          can_manage_suppliers: access.can_manage_suppliers || false,
          can_manage_materials: access.can_manage_materials || false,
          can_view_reports: access.can_view_reports || false,
          can_export_data: access.can_export_data || false,
          can_view_all_orders: access.can_view_all_orders || false,
          can_grant_access: false,
          max_order_amount: access.max_order_amount
        };
      }

      return noAccess;
    } catch (err) {
      console.error('fallbackGetPermissions error:', err);
      return noAccess;
    }
  },

  /**
   * Kiểm tra có quyền truy cập module không
   */
  async hasAccess(employeeId?: string): Promise<boolean> {
    try {
      if (!employeeId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;

        const { data: employee } = await supabase
          .from('employees')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (!employee) return false;
        employeeId = employee.id;
      }

      // Thử gọi RPC function
      const { data, error } = await supabase
        .rpc('has_purchase_access', { emp_id: employeeId });

      // Nếu function chưa tồn tại (404), fallback check trực tiếp
      if (error) {
        if (error.code === 'PGRST202' || error.message.includes('not find the function')) {
          console.warn('Function has_purchase_access not found, using fallback check');
          if (employeeId) {
            return this.fallbackHasAccess(employeeId);
          }
          return false;
        }
        throw error;
      }
      
      return data as boolean;
    } catch (err) {
      console.error('hasAccess error:', err);
      // Fallback nếu có lỗi khác
      if (employeeId) {
        return this.fallbackHasAccess(employeeId);
      }
      return false;
    }
  },

  /**
   * Fallback check quyền khi function chưa được tạo
   */
  async fallbackHasAccess(employeeId: string): Promise<boolean> {
    try {
      // Lấy thông tin employee với position level và department
      const { data: employee, error } = await supabase
        .from('employees')
        .select(`
          id,
          positions!inner(level),
          departments!inner(code)
        `)
        .eq('id', employeeId)
        .single();

      if (error || !employee) return false;

      const positionLevel = (employee.positions as any)?.level || 99;
      const deptCode = (employee.departments as any)?.code || '';

      // BGĐ (Level 1-3) luôn có quyền
      if (positionLevel <= 3) return true;

      // Kế toán luôn có quyền
      if (deptCode === 'HAP-KT') return true;

      // Check trong bảng purchase_access
      const { data: access } = await supabase
        .from('purchase_access')
        .select('id')
        .eq('employee_id', employeeId)
        .eq('status', 'active')
        .maybeSingle();

      return !!access;
    } catch (err) {
      console.error('fallbackHasAccess error:', err);
      return false;
    }
  },

  /**
   * Kiểm tra quyền cụ thể
   */
  async checkPermission(employeeId: string, permission: string): Promise<boolean> {
    try {
      const permissions = await this.getPermissions(employeeId);
      return permissions[permission as keyof PurchasePermissions] as boolean || false;
    } catch (err) {
      console.error('checkPermission error:', err);
      return false;
    }
  },

  /**
   * Kiểm tra có phải Ban Giám đốc không
   */
  async isExecutive(employeeId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .rpc('is_executive', { emp_id: employeeId });

      if (error) {
        // Fallback
        const { data: employee } = await supabase
          .from('employees')
          .select('positions!inner(level)')
          .eq('id', employeeId)
          .single();
        
        const level = (employee?.positions as any)?.level || 99;
        return level <= 3;
      }
      return data as boolean;
    } catch (err) {
      console.error('isExecutive error:', err);
      return false;
    }
  },

  /**
   * Kiểm tra có phải Phòng Kế toán không
   */
  async isAccounting(employeeId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .rpc('is_accounting', { emp_id: employeeId });

      if (error) {
        // Fallback
        const { data: employee } = await supabase
          .from('employees')
          .select('departments!inner(code)')
          .eq('id', employeeId)
          .single();
        
        const deptCode = (employee?.departments as any)?.code || '';
        return deptCode === 'HAP-KT';
      }
      return data as boolean;
    } catch (err) {
      console.error('isAccounting error:', err);
      return false;
    }
  },


  // ==========================================
  // QUẢN LÝ QUYỀN TRUY CẬP
  // ==========================================

  /**
   * Lấy danh sách tất cả người có quyền truy cập
   */
  async getAllAccess(): Promise<AllAccessItem[]> {
    const { data, error } = await supabase
      .from('v_all_purchase_access')
      .select('*')
      .order('access_type')
      .order('employee_name');

    if (error) throw error;
    return data || [];
  },

  /**
   * Lấy danh sách người được cấp quyền (không bao gồm BGĐ/KT tự động)
   */
  async getGrantedAccess(): Promise<PurchaseAccessListItem[]> {
    const { data, error } = await supabase
      .from('v_purchase_access_list')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Lấy chi tiết quyền của một nhân viên
   */
  async getAccessByEmployee(employeeId: string): Promise<PurchaseAccess | null> {
    const { data, error } = await supabase
      .from('purchase_access')
      .select('*')
      .eq('employee_id', employeeId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  },

  /**
   * Cấp quyền truy cập (chỉ BGĐ mới được gọi)
   */
  async grantAccess(input: GrantAccessInput): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Chưa đăng nhập');

    // Lấy employee_id của người cấp quyền
    const { data: grantedBy } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!grantedBy) throw new Error('Không tìm thấy thông tin nhân viên');

    // Gọi function database
    const { data, error } = await supabase
      .rpc('grant_purchase_access', {
        p_employee_id: input.employee_id,
        p_granted_by: grantedBy.id,
        p_permissions: input.permissions,
        p_reason: input.reason || null,
        p_valid_until: input.valid_until || null
      });

    if (error) throw error;
    return data as string;
  },

  /**
   * Cập nhật quyền
   */
  async updateAccess(
    accessId: string, 
    permissions: Partial<GrantAccessInput['permissions']>,
    reason?: string
  ): Promise<PurchaseAccess> {
    const { data, error } = await supabase
      .from('purchase_access')
      .update({
        ...permissions,
        reason
      })
      .eq('id', accessId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Thu hồi quyền
   */
  async revokeAccess(employeeId: string, reason?: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Chưa đăng nhập');

    const { data: revokedBy } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!revokedBy) throw new Error('Không tìm thấy thông tin nhân viên');

    const { data, error } = await supabase
      .rpc('revoke_purchase_access', {
        p_employee_id: employeeId,
        p_revoked_by: revokedBy.id,
        p_reason: reason || null
      });

    if (error) throw error;
    return data as boolean;
  },

  /**
   * Tạm ngưng quyền
   */
  async suspendAccess(accessId: string, reason?: string): Promise<PurchaseAccess> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Chưa đăng nhập');

    const { data: suspendedBy } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const { data, error } = await supabase
      .from('purchase_access')
      .update({
        status: 'suspended',
        revoked_by: suspendedBy?.id,
        revoke_reason: reason
      })
      .eq('id', accessId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Khôi phục quyền đã tạm ngưng
   */
  async restoreAccess(accessId: string): Promise<PurchaseAccess> {
    const { data, error } = await supabase
      .from('purchase_access')
      .update({
        status: 'active',
        revoked_by: null,
        revoke_reason: null,
        revoked_at: null
      })
      .eq('id', accessId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },


  // ==========================================
  // DANH SÁCH NHÂN VIÊN CÓ THỂ CẤP QUYỀN
  // ==========================================

  /**
   * Lấy danh sách nhân viên chưa có quyền truy cập
   * (để chọn khi cấp quyền mới)
   */
  async getEligibleEmployees(): Promise<{
    id: string;
    code: string;
    full_name: string;
    department_name: string;
    position_name: string;
  }[]> {
    // Lấy tất cả nhân viên active
    const { data: allEmployees, error: empError } = await supabase
      .from('employees')
      .select(`
        id,
        code,
        full_name,
        departments!inner(name),
        positions!inner(name, level)
      `)
      .eq('status', 'active');

    if (empError) throw empError;

    // Lấy danh sách đã có quyền
    const { data: accessList } = await supabase
      .from('v_all_purchase_access')
      .select('employee_id');

    const hasAccessIds = new Set(accessList?.map(a => a.employee_id) || []);

    // Filter ra những người chưa có quyền
    const eligible = (allEmployees || [])
      .filter(emp => !hasAccessIds.has(emp.id))
      .map(emp => ({
        id: emp.id,
        code: emp.code,
        full_name: emp.full_name,
        department_name: (emp.departments as any)?.name || '',
        position_name: (emp.positions as any)?.name || ''
      }));

    return eligible;
  },


  // ==========================================
  // LỊCH SỬ PHÂN QUYỀN
  // ==========================================

  /**
   * Lấy lịch sử phân quyền
   */
  async getAccessLogs(employeeId?: string): Promise<PurchaseAccessLog[]> {
    let query = supabase
      .from('purchase_access_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (employeeId) {
      query = query.eq('employee_id', employeeId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },


  // ==========================================
  // HELPERS
  // ==========================================

  /**
   * Kiểm tra hạn mức đơn hàng
   */
  canCreateOrderWithAmount(permissions: PurchasePermissions, amount: number): boolean {
    if (!permissions.can_create_order) return false;
    if (permissions.max_order_amount === null || permissions.max_order_amount === undefined) {
      return true; // Không giới hạn
    }
    return amount <= permissions.max_order_amount;
  },

  /**
   * Lấy label tiếng Việt cho permission
   */
  getPermissionLabel(key: string): string {
    const labels: Record<string, string> = {
      can_view: 'Xem module',
      can_create_order: 'Tạo đơn hàng',
      can_edit_order: 'Sửa đơn hàng',
      can_delete_order: 'Xóa đơn hàng',
      can_approve_order: 'Duyệt đơn hàng',
      can_add_invoice: 'Thêm hóa đơn',
      can_add_payment: 'Thêm thanh toán',
      can_manage_suppliers: 'Quản lý NCC',
      can_manage_materials: 'Quản lý vật tư',
      can_view_reports: 'Xem báo cáo',
      can_export_data: 'Xuất dữ liệu',
      can_view_all_orders: 'Xem tất cả đơn',
      can_grant_access: 'Cấp quyền',
      max_order_amount: 'Hạn mức đơn hàng'
    };
    
    return labels[key] || key;
  },

  /**
   * Lấy label cho access type
   */
  getAccessTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      executive: 'Ban Giám đốc',
      accounting: 'Phòng Kế toán',
      granted: 'Được cấp quyền',
      none: 'Không có quyền'
    };
    return labels[type] || type;
  },

  /**
   * Lấy màu badge cho access type
   */
  getAccessTypeBadgeColor(type: string): string {
    const colors: Record<string, string> = {
      executive: 'red',
      accounting: 'blue',
      granted: 'green',
      none: 'gray'
    };
    return colors[type] || 'gray';
  }
};


// ============================================
// EXPORT
// ============================================

export default purchaseAccessService;