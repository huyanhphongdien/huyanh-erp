// ============================================
// src/services/supplierService.ts
// Module Quản lý đơn hàng - Supplier Service
// Huy Anh ERP System
// ============================================
// FIX: Loại bỏ created_by khi insert để tránh lỗi foreign key constraint
// created_by phải là employee_id, không phải auth user_id
// ============================================

import { supabase } from '../lib/supabase';
import { businessPartnerService } from './businessPartnerService';
import { normalizeHac13 } from '../lib/hac13';

// ============================================
// TYPES
// ============================================

export interface Supplier {
  id: string;
  code: string;
  name: string;
  short_name?: string;
  supplier_type: 'company' | 'individual';
  supplier_group: 'primary' | 'secondary' | 'service';
  tax_code?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  province?: string;
  district?: string;
  ward?: string;
  bank_name?: string;
  bank_account?: string;
  bank_branch?: string;
  bank_holder?: string;
  payment_terms: number;
  credit_limit: number;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  contact_position?: string;
  notes?: string;
  total_orders: number;
  total_order_value: number;
  total_paid: number;
  total_debt: number;
  last_order_date?: string;
  rating: number;
  status: 'active' | 'inactive' | 'blocked';
  created_by?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface SupplierContact {
  id: string;
  supplier_id: string;
  name: string;
  position?: string;
  department?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  contact_type: 'general' | 'sales' | 'accounting' | 'technical' | 'management';
  is_primary: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface SupplierQuotation {
  id: string;
  supplier_id: string;
  quotation_number?: string;
  quotation_date: string;
  valid_until?: string;
  title?: string;
  description?: string;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  file_type?: string;
  total_amount?: number;
  currency: string;
  status: 'active' | 'expired' | 'superseded' | 'cancelled';
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// Form data types
export interface SupplierFormData {
  code?: string;  // Optional - auto generate
  name: string;
  short_name?: string;
  supplier_type?: 'company' | 'individual';
  supplier_group?: 'primary' | 'secondary' | 'service';
  tax_code?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  province?: string;
  district?: string;
  ward?: string;
  bank_name?: string;
  bank_account?: string;
  bank_branch?: string;
  bank_holder?: string;
  payment_terms?: number;
  credit_limit?: number;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  contact_position?: string;
  notes?: string;
  status?: 'active' | 'inactive' | 'blocked';
}

export interface SupplierContactFormData {
  supplier_id: string;
  name: string;
  position?: string;
  department?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  contact_type?: 'general' | 'sales' | 'accounting' | 'technical' | 'management';
  is_primary?: boolean;
  notes?: string;
}

export interface SupplierQuotationFormData {
  supplier_id: string;
  quotation_number?: string;
  quotation_date?: string;
  valid_until?: string;
  title?: string;
  description?: string;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  file_type?: string;
  total_amount?: number;
  currency?: string;
  status?: 'active' | 'expired' | 'superseded' | 'cancelled';
  notes?: string;
}

// Pagination & Filter params
export interface SupplierFilterParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  supplier_type?: string;
  supplier_group?: string;
  province?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// View types (từ v_suppliers_list)
export interface SupplierListItem extends Supplier {
  active_quotations_count?: number;
  contacts_count?: number;
}


// ============================================
// HELPER: Get employee_id from auth user
// ============================================

async function getCurrentEmployeeId(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Lấy employee_id từ bảng employees dựa trên user_id
    const { data: employee, error } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (error || !employee) return null;
    return employee.id;
  } catch {
    return null;
  }
}

/**
 * Trích role_data jsonb cho role SUPPLIER_GENERAL từ SupplierFormData.
 * Các field "general" (name, tax_code, address, bank_*) đã đẩy vào BP master —
 * role_data chỉ chứa attribute riêng của vai trò.
 */
function supplierRoleData(supplier: SupplierFormData): Record<string, unknown> {
  return {
    supplier_type: supplier.supplier_type,
    supplier_group: supplier.supplier_group,
    payment_terms_days: supplier.payment_terms,
    credit_limit_vnd: supplier.credit_limit,
    contact_name: supplier.contact_name,
    contact_phone: supplier.contact_phone,
    contact_email: supplier.contact_email,
    contact_position: supplier.contact_position,
    province_text: supplier.province,
  };
}


// ============================================
// SUPPLIER SERVICE
// ============================================

export const supplierService = {
  // ==========================================
  // SUPPLIERS - CRUD
  // ==========================================

  /**
   * Lấy danh sách NCC có phân trang và filter
   */
  async getAll(params: SupplierFilterParams = {}): Promise<PaginatedResponse<SupplierListItem>> {
    const page = params.page || 1;
    const pageSize = params.pageSize || 10;
    const { search, status, supplier_type, supplier_group, province, sortBy, sortOrder } = params;
    
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Sử dụng view v_suppliers_list để có thêm thông tin
    let query = supabase
      .from('v_suppliers_list')
      .select('*', { count: 'exact' });

    // Filter theo status
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    // Filter theo loại NCC
    if (supplier_type && supplier_type !== 'all') {
      query = query.eq('supplier_type', supplier_type);
    }

    // Filter theo nhóm NCC
    if (supplier_group && supplier_group !== 'all') {
      query = query.eq('supplier_group', supplier_group);
    }

    // Filter theo tỉnh/thành phố
    if (province && province !== 'all') {
      query = query.eq('province', province);
    }

    // Tìm kiếm theo tên, mã (code = hac13_code đã sync), MST.
    // Cho phép paste HAC-13 dạng "8999-1-0001234-6".
    if (search) {
      const normalized = normalizeHac13(search);
      const candidate = /^\d{13}$/.test(normalized) ? normalized : search;
      query = query.or(`name.ilike.%${candidate}%,code.ilike.%${candidate}%,short_name.ilike.%${candidate}%,tax_code.ilike.%${candidate}%`);
    }

    // Sắp xếp
    const orderColumn = sortBy || 'created_at';
    const ascending = sortOrder === 'asc';
    query = query.order(orderColumn, { ascending });

    // Phân trang
    const { data, error, count } = await query.range(from, to);

    if (error) throw error;

    return {
      data: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    };
  },

  /**
   * Lấy tất cả NCC active (cho dropdown)
   */
  async getAllActive(): Promise<Supplier[]> {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('name');

    if (error) throw error;
    return data || [];
  },

  /**
   * Lấy NCC theo ID
   */
  async getById(id: string): Promise<Supplier | null> {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }
    return data;
  },

  /**
   * Lấy NCC theo code
   */
  async getByCode(code: string): Promise<Supplier | null> {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('code', code)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  },

  /**
   * Tạo NCC mới.
   *
   * Flow HAC-13 v10 (Phase 3+):
   *   1) Tạo Business Partner master (qua BP service) với role SUPPLIER_GENERAL.
   *      Nếu MST trùng BP đã tồn tại → BP service trả về BP cũ + attach role.
   *   2) Insert suppliers với bp_id; trigger DB tự sync code = bp.hac13_code.
   *
   * FIX: Lấy employee_id thay vì user_id cho created_by.
   */
  async create(supplier: SupplierFormData): Promise<Supplier> {
    const employeeId = await getCurrentEmployeeId();

    // Bước 1: nếu MST đã có BP → attach role; nếu chưa → tạo BP mới.
    let bpId: string;
    if (supplier.tax_code) {
      const existingBp = await businessPartnerService.findByTaxCode(supplier.tax_code);
      if (existingBp) {
        bpId = existingBp.id;
        // Attach role SUPPLIER_GENERAL nếu chưa có (lỗi UNIQUE nếu đã có — bắt lỗi)
        await businessPartnerService
          .addRole(bpId, 'SUPPLIER_GENERAL', supplierRoleData(supplier), true)
          .catch((e: Error) => {
            if (!/duplicate|unique/i.test(e.message)) throw e;
          });
      } else {
        const bp = await businessPartnerService.create({
          legal_name: supplier.name,
          short_name: supplier.short_name,
          country_iso: 'VN',
          tax_code: supplier.tax_code,
          address_line: supplier.address,
          phone: supplier.phone,
          email: supplier.email,
          roles: [
            { role_type: 'SUPPLIER_GENERAL', is_primary: true, role_data: supplierRoleData(supplier) },
          ],
        });
        bpId = bp.id;
      }
    } else {
      const bp = await businessPartnerService.create({
        legal_name: supplier.name,
        short_name: supplier.short_name,
        country_iso: 'VN',
        address_line: supplier.address,
        phone: supplier.phone,
        email: supplier.email,
        roles: [
          { role_type: 'SUPPLIER_GENERAL', is_primary: true, role_data: supplierRoleData(supplier) },
        ],
      });
      bpId = bp.id;
    }

    // Bước 2: insert suppliers row với bp_id; trigger fill code.
    const insertData: Record<string, unknown> = {
      ...supplier,
      bp_id: bpId,
    };
    if (employeeId) insertData.created_by = employeeId;

    const { data, error } = await supabase
      .from('suppliers')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Create supplier error:', error);
      throw error;
    }
    return data;
  },

  /**
   * Cập nhật NCC.
   *
   * Đồng thời sync các field "general" về business_partners master.
   */
  async update(id: string, supplier: Partial<SupplierFormData>): Promise<Supplier> {
    // Lấy bp_id để sync
    const { data: existing } = await supabase
      .from('suppliers')
      .select('bp_id')
      .eq('id', id)
      .maybeSingle();

    if (existing?.bp_id) {
      const bpPatch: Record<string, unknown> = {};
      if (supplier.name !== undefined) bpPatch.legal_name = supplier.name;
      if (supplier.short_name !== undefined) bpPatch.short_name = supplier.short_name || null;
      if (supplier.tax_code !== undefined) bpPatch.tax_code = supplier.tax_code || null;
      if (supplier.address !== undefined) bpPatch.address_line = supplier.address || null;
      if (supplier.district !== undefined) bpPatch.district = supplier.district || null;
      if (supplier.ward !== undefined) bpPatch.ward = supplier.ward || null;
      if (supplier.phone !== undefined) bpPatch.phone = supplier.phone || null;
      if (supplier.email !== undefined) bpPatch.email = supplier.email || null;
      if (supplier.website !== undefined) bpPatch.website = supplier.website || null;
      if (supplier.bank_name !== undefined) bpPatch.bank_name = supplier.bank_name || null;
      if (supplier.bank_account !== undefined) bpPatch.bank_account = supplier.bank_account || null;
      if (supplier.bank_holder !== undefined) bpPatch.bank_holder = supplier.bank_holder || null;
      if (supplier.bank_branch !== undefined) bpPatch.bank_branch = supplier.bank_branch || null;
      if (supplier.status) bpPatch.status = supplier.status;
      if (Object.keys(bpPatch).length > 0) {
        await businessPartnerService.update(existing.bp_id, bpPatch).catch((e: Error) => {
          console.error('[supplierService.update] BP sync failed:', e);
        });
      }
    }

    const { data, error } = await supabase
      .from('suppliers')
      .update(supplier)
      .eq('id', id)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Xóa mềm NCC
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('suppliers')
      .update({ 
        deleted_at: new Date().toISOString(),
        status: 'inactive'
      })
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Khôi phục NCC đã xóa
   */
  async restore(id: string): Promise<Supplier> {
    const { data, error } = await supabase
      .from('suppliers')
      .update({ 
        deleted_at: null,
        status: 'active'
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Kiểm tra mã NCC đã tồn tại
   */
  async checkCodeExists(code: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('suppliers')
      .select('id', { count: 'exact', head: true })
      .eq('code', code);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { count } = await query;
    return (count || 0) > 0;
  },

  /**
   * Kiểm tra MST đã tồn tại
   */
  async checkTaxCodeExists(taxCode: string, excludeId?: string): Promise<boolean> {
    if (!taxCode) return false;
    
    let query = supabase
      .from('suppliers')
      .select('id', { count: 'exact', head: true })
      .eq('tax_code', taxCode)
      .is('deleted_at', null);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { count } = await query;
    return (count || 0) > 0;
  },

  /**
   * Lấy danh sách tỉnh/thành (distinct)
   */
  async getProvinces(): Promise<string[]> {
    const { data, error } = await supabase
      .from('suppliers')
      .select('province')
      .not('province', 'is', null)
      .is('deleted_at', null);

    if (error) throw error;
    
    // Lấy unique values
    const provinces = [...new Set(data?.map(d => d.province).filter(Boolean))];
    return provinces.sort();
  },


  // ==========================================
  // SUPPLIER CONTACTS
  // ==========================================

  /**
   * Lấy danh sách liên hệ của NCC
   */
  async getContacts(supplierId: string): Promise<SupplierContact[]> {
    const { data, error } = await supabase
      .from('supplier_contacts')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('is_primary', { ascending: false })
      .order('name');

    if (error) throw error;
    return data || [];
  },

  /**
   * Lấy liên hệ theo ID
   */
  async getContactById(id: string): Promise<SupplierContact | null> {
    const { data, error } = await supabase
      .from('supplier_contacts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  },

  /**
   * Thêm liên hệ mới
   */
  async createContact(contact: SupplierContactFormData): Promise<SupplierContact> {
    const { data, error } = await supabase
      .from('supplier_contacts')
      .insert(contact)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Cập nhật liên hệ
   */
  async updateContact(id: string, contact: Partial<SupplierContactFormData>): Promise<SupplierContact> {
    const { data, error } = await supabase
      .from('supplier_contacts')
      .update(contact)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Xóa liên hệ
   */
  async deleteContact(id: string): Promise<void> {
    const { error } = await supabase
      .from('supplier_contacts')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Đặt làm liên hệ chính
   */
  async setPrimaryContact(supplierId: string, contactId: string): Promise<void> {
    const { error } = await supabase
      .from('supplier_contacts')
      .update({ is_primary: true })
      .eq('id', contactId)
      .eq('supplier_id', supplierId);

    if (error) throw error;
    // Trigger sẽ tự động bỏ primary của các contact khác
  },


  // ==========================================
  // SUPPLIER QUOTATIONS (BÁO GIÁ)
  // ==========================================

  /**
   * Lấy danh sách báo giá của NCC
   */
  async getQuotations(supplierId: string, status?: string): Promise<SupplierQuotation[]> {
    let query = supabase
      .from('supplier_quotations')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('quotation_date', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  /**
   * Lấy báo giá còn hiệu lực của NCC
   */
  async getActiveQuotations(supplierId: string): Promise<SupplierQuotation[]> {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('supplier_quotations')
      .select('*')
      .eq('supplier_id', supplierId)
      .eq('status', 'active')
      .or(`valid_until.is.null,valid_until.gte.${today}`)
      .order('quotation_date', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Lấy báo giá theo ID
   */
  async getQuotationById(id: string): Promise<SupplierQuotation | null> {
    const { data, error } = await supabase
      .from('supplier_quotations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  },

  /**
   * Thêm báo giá mới
   * FIX: Lấy employee_id thay vì user_id cho created_by
   */
  async createQuotation(quotation: SupplierQuotationFormData): Promise<SupplierQuotation> {
    const employeeId = await getCurrentEmployeeId();
    
    const insertData: Record<string, unknown> = {
      ...quotation
    };

    if (employeeId) {
      insertData.created_by = employeeId;
    }
    
    const { data, error } = await supabase
      .from('supplier_quotations')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Cập nhật báo giá
   */
  async updateQuotation(id: string, quotation: Partial<SupplierQuotationFormData>): Promise<SupplierQuotation> {
    const { data, error } = await supabase
      .from('supplier_quotations')
      .update(quotation)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Xóa báo giá
   */
  async deleteQuotation(id: string): Promise<void> {
    const { error } = await supabase
      .from('supplier_quotations')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Upload file báo giá
   */
  async uploadQuotationFile(
    supplierId: string, 
    file: File
  ): Promise<{ url: string; fileName: string; fileSize: number; fileType: string }> {
    // Tạo tên file unique
    const fileExt = file.name.split('.').pop();
    const fileName = `${supplierId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    
    // Upload lên Supabase Storage
    const { data, error } = await supabase.storage
      .from('supplier-quotations')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) throw error;

    // Lấy public URL
    const { data: { publicUrl } } = supabase.storage
      .from('supplier-quotations')
      .getPublicUrl(data.path);

    return {
      url: publicUrl,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    };
  },

  /**
   * Xóa file báo giá
   */
  async deleteQuotationFile(fileUrl: string): Promise<void> {
    // Extract path from URL
    const urlParts = fileUrl.split('/supplier-quotations/');
    if (urlParts.length < 2) return;
    
    const filePath = urlParts[1];
    
    const { error } = await supabase.storage
      .from('supplier-quotations')
      .remove([filePath]);

    if (error) throw error;
  },


  // ==========================================
  // STATISTICS & REPORTS
  // ==========================================

  /**
   * Lấy thống kê NCC
   */
  async getStatistics(): Promise<{
    total: number;
    active: number;
    inactive: number;
    blocked: number;
    byGroup: { group: string; count: number }[];
    byType: { type: string; count: number }[];
    totalDebt: number;
  }> {
    // Tổng số NCC theo status
    const { data: statusStats, error: statusError } = await supabase
      .from('suppliers')
      .select('status')
      .is('deleted_at', null);

    if (statusError) throw statusError;

    const total = statusStats?.length || 0;
    const active = statusStats?.filter(s => s.status === 'active').length || 0;
    const inactive = statusStats?.filter(s => s.status === 'inactive').length || 0;
    const blocked = statusStats?.filter(s => s.status === 'blocked').length || 0;

    // Theo nhóm
    const { data: groupData } = await supabase
      .from('suppliers')
      .select('supplier_group')
      .is('deleted_at', null);

    const byGroup = Object.entries(
      (groupData || []).reduce((acc, s) => {
        acc[s.supplier_group] = (acc[s.supplier_group] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ).map(([group, count]) => ({ group, count }));

    // Theo loại
    const { data: typeData } = await supabase
      .from('suppliers')
      .select('supplier_type')
      .is('deleted_at', null);

    const byType = Object.entries(
      (typeData || []).reduce((acc, s) => {
        acc[s.supplier_type] = (acc[s.supplier_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ).map(([type, count]) => ({ type, count }));

    // Tổng công nợ
    const { data: debtData } = await supabase
      .from('suppliers')
      .select('total_debt')
      .is('deleted_at', null);

    const totalDebt = (debtData || []).reduce((sum, s) => sum + (s.total_debt || 0), 0);

    return {
      total,
      active,
      inactive,
      blocked,
      byGroup,
      byType,
      totalDebt
    };
  },

  /**
   * Lấy top NCC theo đơn hàng
   */
  async getTopSuppliersByOrders(limit: number = 10): Promise<Supplier[]> {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .is('deleted_at', null)
      .eq('status', 'active')
      .order('total_orders', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  /**
   * Lấy NCC có công nợ
   */
  async getSuppliersWithDebt(): Promise<Supplier[]> {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .is('deleted_at', null)
      .gt('total_debt', 0)
      .order('total_debt', { ascending: false });

    if (error) throw error;
    return data || [];
  }
};


// ============================================
// EXPORT
// ============================================

export default supplierService;