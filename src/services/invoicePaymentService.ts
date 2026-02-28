// ============================================================================
// INVOICE PAYMENT SERVICE
// File: src/services/invoicePaymentService.ts
// Huy Anh ERP System - Phase P5: Payments & Debt Tracking
// ============================================================================

import { supabase } from '../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  payment_code?: string;                    // ← FIX: Thêm field từ DB
  payment_date: string;
  amount: number;
  payment_method: 'cash' | 'bank_transfer';
  reference_number?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;             // ← FIX: Thêm field từ DB
  document_url?: string | null;             // ← FIX: Thêm field từ DB
  document_urls?: string[] | null;          // ← FIX: Thêm field từ DB
  notes?: string | null;
  is_deleted?: boolean;                     // ← FIX: Thêm field từ DB
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  created_by_name?: string;
  created_by_code?: string;
}

export interface PaymentWithDetails extends InvoicePayment {
  // Invoice info
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  invoice_total_amount?: number;
  invoice_paid_amount?: number;
  invoice_remaining_amount?: number;
  invoice_payment_status?: string;
  // Supplier info
  supplier_id?: string;
  supplier_code?: string;
  supplier_name?: string;
  // Order info
  order_id?: string;
  order_code?: string;
  order_title?: string;
}

export interface CreatePaymentInput {
  invoice_id: string;
  payment_date: string;
  amount: number;
  payment_method: 'cash' | 'bank_transfer';
  reference_number?: string;
  bank_name?: string;
  bank_account?: string;
  notes?: string;
  created_by?: string;
}

export interface UpdatePaymentInput {
  payment_date?: string;
  amount?: number;
  payment_method?: 'cash' | 'bank_transfer';
  reference_number?: string;
  bank_name?: string;
  bank_account?: string;
  notes?: string;
}

export interface SupplierDebtSummary {
  supplier_id: string;
  supplier_code: string;
  supplier_name: string;
  supplier_phone?: string;
  payment_terms?: number;
  total_invoices: number;
  unpaid_invoices: number;
  partial_invoices: number;
  paid_invoices: number;
  total_invoice_amount: number;
  total_paid_amount: number;
  total_remaining_amount: number;
  overdue_invoices: number;
  overdue_amount: number;
  due_soon_invoices: number;
  due_soon_amount: number;
}

export interface OverdueInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: string;
  days_overdue: number;
  supplier_id: string;
  supplier_code: string;
  supplier_name: string;
  supplier_phone?: string;
  order_id?: string;
  order_code?: string;
  order_title?: string;
}

export interface PaymentStats {
  total_payments: number;
  total_amount: number;
  cash_amount: number;
  bank_transfer_amount: number;
  avg_payment: number;
  total_debt: number;
  total_overdue: number;
  overdue_count: number;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  search?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Tiền mặt', icon: '💵' },
  { value: 'bank_transfer', label: 'Chuyển khoản', icon: '🏦' },
] as const;

export const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string; bgColor: string }> = {
  unpaid: { label: 'Chưa thanh toán', color: 'text-red-700', bgColor: 'bg-red-100' },
  partial: { label: 'Thanh toán một phần', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  paid: { label: 'Đã thanh toán', color: 'text-green-700', bgColor: 'bg-green-100' },
};

// ============================================================================
// SERVICE
// ============================================================================

export const invoicePaymentService = {
  // ==========================================================================
  // PAYMENT CRUD
  // ==========================================================================

  /**
   * Lấy danh sách thanh toán của một hóa đơn
   */
  async getByInvoiceId(invoiceId: string): Promise<InvoicePayment[]> {
    console.log('📋 [paymentService] getByInvoiceId:', invoiceId);

    const { data, error } = await supabase
      .from('invoice_payments')
      .select(`
        *,
        creator:created_by(id, code, full_name)
      `)
      .eq('invoice_id', invoiceId)
      .order('payment_date', { ascending: false });

    if (error) {
      console.error('❌ [paymentService] getByInvoiceId error:', error);
      throw error;
    }

    // Map creator info
    const result = (data || []).map((item: any) => {
      const creator = Array.isArray(item.creator) ? item.creator[0] : item.creator;
      return {
        ...item,
        created_by_name: creator?.full_name || '',
        created_by_code: creator?.code || '',
        creator: undefined,
      };
    });

    console.log('✅ [paymentService] Found', result.length, 'payments');
    return result;
  },

  /**
   * Lấy chi tiết một thanh toán
   */
  async getById(id: string): Promise<InvoicePayment | null> {
    const { data, error } = await supabase
      .from('invoice_payments')
      .select(`
        *,
        creator:created_by(id, code, full_name)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('❌ [paymentService] getById error:', error);
      throw error;
    }

    if (!data) return null;

    const creator = Array.isArray(data.creator) ? data.creator[0] : (data as any).creator;
    return {
      ...data,
      created_by_name: creator?.full_name || '',
      created_by_code: creator?.code || '',
      creator: undefined,
    } as InvoicePayment;
  },

  /**
   * Tạo thanh toán mới
   */
  async create(input: CreatePaymentInput): Promise<InvoicePayment> {
    console.log('➕ [paymentService] create:', input);

    const { data, error } = await supabase
      .from('invoice_payments')
      .insert({
        invoice_id: input.invoice_id,
        payment_date: input.payment_date,
        amount: input.amount,
        payment_method: input.payment_method,
        reference_number: input.reference_number || null,
        bank_name: input.bank_name || null,
        bank_account: input.bank_account || null,
        notes: input.notes || null,
        created_by: input.created_by || null,
      })
      .select()
      .single();

    if (error) {
      console.error('❌ [paymentService] create error:', error);
      // Parse custom error from trigger
      if (error.message?.includes('vượt quá số tiền còn lại')) {
        throw new Error('Số tiền thanh toán vượt quá số tiền còn lại của hóa đơn');
      }
      throw error;
    }

    console.log('✅ [paymentService] Created payment:', data.id);
    return data;
  },

  /**
   * Cập nhật thanh toán
   */
  async update(id: string, input: UpdatePaymentInput): Promise<InvoicePayment> {
    console.log('✏️ [paymentService] update:', id, input);

    const { data, error } = await supabase
      .from('invoice_payments')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ [paymentService] update error:', error);
      if (error.message?.includes('vượt quá số tiền còn lại')) {
        throw new Error('Số tiền thanh toán vượt quá số tiền còn lại của hóa đơn');
      }
      throw error;
    }

    console.log('✅ [paymentService] Updated payment:', id);
    return data;
  },

  /**
   * Xóa thanh toán
   */
  async delete(id: string): Promise<void> {
    console.log('🗑️ [paymentService] delete:', id);

    const { error } = await supabase
      .from('invoice_payments')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('❌ [paymentService] delete error:', error);
      throw error;
    }

    console.log('✅ [paymentService] Deleted payment:', id);
  },

  // ==========================================================================
  // PAYMENT LIST (với pagination & filters)
  // ==========================================================================

  /**
   * Lấy danh sách tất cả thanh toán (pagination + filter)
   */
  async getAll(params: PaginationParams & {
    supplier_id?: string;
    payment_method?: string;
    from_date?: string;
    to_date?: string;
  }): Promise<PaginatedResponse<PaymentWithDetails>> {
    const { page, pageSize, search, supplier_id, payment_method, from_date, to_date } = params;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    console.log('📋 [paymentService] getAll:', params);

    let query = supabase
      .from('invoice_payments')
      .select(`
        *,
        creator:created_by(id, code, full_name),
        invoice:invoice_id(
          id,
          invoice_number,
          invoice_date,
          due_date,
          total_amount,
          paid_amount,
          remaining_amount,
          payment_status,
          supplier_id,
          order_id,
          supplier:supplier_id(id, code, name),
          order:order_id(id, order_code, project_name)
        )
      `, { count: 'exact' });

    // Filters
    if (payment_method && payment_method !== 'all') {
      query = query.eq('payment_method', payment_method);
    }

    if (from_date) {
      query = query.gte('payment_date', from_date);
    }

    if (to_date) {
      query = query.lte('payment_date', to_date);
    }

    if (search) {
      query = query.or(`reference_number.ilike.%${search}%,notes.ilike.%${search}%`);
    }

    const { data, error, count } = await query
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('❌ [paymentService] getAll error:', error);
      throw error;
    }

    // Map and filter by supplier_id if needed
    let results = (data || []).map((item: any) => {
      const creator = Array.isArray(item.creator) ? item.creator[0] : item.creator;
      const invoice = Array.isArray(item.invoice) ? item.invoice[0] : item.invoice;
      const supplier = invoice?.supplier 
        ? (Array.isArray(invoice.supplier) ? invoice.supplier[0] : invoice.supplier)
        : null;
      const order = invoice?.order
        ? (Array.isArray(invoice.order) ? invoice.order[0] : invoice.order)
        : null;

      return {
        ...item,
        created_by_name: creator?.full_name || '',
        created_by_code: creator?.code || '',
        invoice_number: invoice?.invoice_number || '',
        invoice_date: invoice?.invoice_date || '',
        due_date: invoice?.due_date || '',
        invoice_total_amount: invoice?.total_amount || 0,
        invoice_paid_amount: invoice?.paid_amount || 0,
        invoice_remaining_amount: invoice?.remaining_amount || 0,
        invoice_payment_status: invoice?.payment_status || 'unpaid',
        supplier_id: supplier?.id || invoice?.supplier_id || '',
        supplier_code: supplier?.code || '',
        supplier_name: supplier?.name || '',
        order_id: order?.id || invoice?.order_id || '',
        order_code: order?.order_code || '',
        order_title: order?.project_name || '',
        creator: undefined,
        invoice: undefined,
      } as PaymentWithDetails;
    });

    // Filter by supplier_id (post-query filter)
    if (supplier_id) {
      results = results.filter(r => r.supplier_id === supplier_id);
    }

    console.log('✅ [paymentService] Found', results.length, 'payments');

    return {
      data: results,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    };
  },

  // ==========================================================================
  // DEBT TRACKING
  // ==========================================================================

  /**
   * Lấy tổng hợp công nợ theo NCC (từ view)
   */
  async getDebtSummary(): Promise<SupplierDebtSummary[]> {
    console.log('📊 [paymentService] getDebtSummary');

    const { data, error } = await supabase
      .from('v_supplier_debt_summary')
      .select('*')
      .order('total_remaining_amount', { ascending: false });

    if (error) {
      console.error('❌ [paymentService] getDebtSummary error:', error);
      // Fallback: Query trực tiếp nếu view chưa tạo
      return this.getDebtSummaryFallback();
    }

    console.log('✅ [paymentService] Debt summary:', data?.length, 'suppliers');
    return (data || []) as SupplierDebtSummary[];
  },

  /**
   * Fallback: Tính debt summary khi view chưa tồn tại
   */
  async getDebtSummaryFallback(): Promise<SupplierDebtSummary[]> {
    console.log('🔄 [paymentService] getDebtSummaryFallback');

    // Lấy suppliers có hóa đơn
    const { data: suppliers, error: sError } = await supabase
      .from('suppliers')
      .select('id, code, name, phone, payment_terms')
      .eq('status', 'active');

    if (sError) throw sError;
    if (!suppliers?.length) return [];

    const results: SupplierDebtSummary[] = [];

    for (const supplier of suppliers) {
      const { data: invoices, error: iError } = await supabase
        .from('supplier_invoices')
        .select('id, total_amount, paid_amount, remaining_amount, payment_status, due_date, status')
        .eq('supplier_id', supplier.id)
        .neq('status', 'cancelled');

      if (iError) continue;
      if (!invoices?.length) continue;

      const today = new Date().toISOString().split('T')[0];
      const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const summary: SupplierDebtSummary = {
        supplier_id: supplier.id,
        supplier_code: supplier.code,
        supplier_name: supplier.name,
        supplier_phone: supplier.phone,
        payment_terms: supplier.payment_terms,
        total_invoices: invoices.length,
        unpaid_invoices: invoices.filter(i => i.payment_status === 'unpaid').length,
        partial_invoices: invoices.filter(i => i.payment_status === 'partial').length,
        paid_invoices: invoices.filter(i => i.payment_status === 'paid').length,
        total_invoice_amount: invoices.reduce((sum, i) => sum + (i.total_amount || 0), 0),
        total_paid_amount: invoices.reduce((sum, i) => sum + (i.paid_amount || 0), 0),
        total_remaining_amount: invoices.reduce((sum, i) => sum + (i.remaining_amount || 0), 0),
        overdue_invoices: invoices.filter(i => i.due_date && i.due_date < today && i.payment_status !== 'paid').length,
        overdue_amount: invoices
          .filter(i => i.due_date && i.due_date < today && i.payment_status !== 'paid')
          .reduce((sum, i) => sum + (i.remaining_amount || 0), 0),
        due_soon_invoices: invoices.filter(i => i.due_date && i.due_date >= today && i.due_date <= sevenDaysLater && i.payment_status !== 'paid').length,
        due_soon_amount: invoices
          .filter(i => i.due_date && i.due_date >= today && i.due_date <= sevenDaysLater && i.payment_status !== 'paid')
          .reduce((sum, i) => sum + (i.remaining_amount || 0), 0),
      };

      // Chỉ thêm NCC có công nợ hoặc có hóa đơn
      if (summary.total_invoices > 0) {
        results.push(summary);
      }
    }

    // Sort by remaining amount desc
    results.sort((a, b) => b.total_remaining_amount - a.total_remaining_amount);

    return results;
  },

  /**
   * Lấy công nợ chi tiết của 1 NCC
   */
  async getSupplierDebt(supplierId: string): Promise<{
    summary: SupplierDebtSummary | null;
    invoices: any[];
    payments: PaymentWithDetails[];
  }> {
    console.log('📊 [paymentService] getSupplierDebt:', supplierId);

    // 1. Lấy supplier info
    const { data: supplier, error: sError } = await supabase
      .from('suppliers')
      .select('id, code, name, phone, payment_terms, total_debt')
      .eq('id', supplierId)
      .single();

    if (sError) throw sError;

    // 2. Lấy hóa đơn của NCC
    const { data: invoices, error: iError } = await supabase
      .from('supplier_invoices')
      .select(`
        *,
        order:order_id(id, order_code, project_name)
      `)
      .eq('supplier_id', supplierId)
      .neq('status', 'cancelled')
      .order('invoice_date', { ascending: false });

    if (iError) throw iError;

    // 3. Lấy payments cho NCC (thông qua invoice)
    const invoiceIds = (invoices || []).map(i => i.id);
    let payments: PaymentWithDetails[] = [];

    if (invoiceIds.length > 0) {
      const { data: paymentData, error: pError } = await supabase
        .from('invoice_payments')
        .select(`
          *,
          creator:created_by(id, code, full_name),
          invoice:invoice_id(id, invoice_number, supplier_id)
        `)
        .in('invoice_id', invoiceIds)
        .order('payment_date', { ascending: false });

      if (!pError && paymentData) {
        payments = paymentData.map((item: any) => {
          const creator = Array.isArray(item.creator) ? item.creator[0] : item.creator;
          const invoice = Array.isArray(item.invoice) ? item.invoice[0] : item.invoice;
          return {
            ...item,
            created_by_name: creator?.full_name || '',
            invoice_number: invoice?.invoice_number || '',
            supplier_id: supplierId,
            supplier_code: supplier?.code || '',
            supplier_name: supplier?.name || '',
            creator: undefined,
            invoice: undefined,
          };
        });
      }
    }

    // 4. Tạo summary
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const invList = invoices || [];

    const summary: SupplierDebtSummary = {
      supplier_id: supplier.id,
      supplier_code: supplier.code,
      supplier_name: supplier.name,
      supplier_phone: supplier.phone,
      payment_terms: supplier.payment_terms,
      total_invoices: invList.length,
      unpaid_invoices: invList.filter((i: any) => i.payment_status === 'unpaid').length,
      partial_invoices: invList.filter((i: any) => i.payment_status === 'partial').length,
      paid_invoices: invList.filter((i: any) => i.payment_status === 'paid').length,
      total_invoice_amount: invList.reduce((sum: number, i: any) => sum + (i.total_amount || 0), 0),
      total_paid_amount: invList.reduce((sum: number, i: any) => sum + (i.paid_amount || 0), 0),
      total_remaining_amount: invList.reduce((sum: number, i: any) => sum + (i.remaining_amount || 0), 0),
      overdue_invoices: invList.filter((i: any) => i.due_date && i.due_date < today && i.payment_status !== 'paid').length,
      overdue_amount: invList
        .filter((i: any) => i.due_date && i.due_date < today && i.payment_status !== 'paid')
        .reduce((sum: number, i: any) => sum + (i.remaining_amount || 0), 0),
      due_soon_invoices: invList.filter((i: any) => i.due_date && i.due_date >= today && i.due_date <= sevenDaysLater && i.payment_status !== 'paid').length,
      due_soon_amount: invList
        .filter((i: any) => i.due_date && i.due_date >= today && i.due_date <= sevenDaysLater && i.payment_status !== 'paid')
        .reduce((sum: number, i: any) => sum + (i.remaining_amount || 0), 0),
    };

    // Map invoices with order info
    const mappedInvoices = invList.map((inv: any) => {
      const order = Array.isArray(inv.order) ? inv.order[0] : inv.order;
      return {
        ...inv,
        order_code: order?.order_code || '',
        order_title: order?.project_name || '',
        order: undefined,
      };
    });

    return { summary, invoices: mappedInvoices, payments };
  },

  /**
   * Lấy danh sách hóa đơn quá hạn
   */
  async getOverdueInvoices(): Promise<OverdueInvoice[]> {
    console.log('⚠️ [paymentService] getOverdueInvoices');

    const { data, error } = await supabase
      .from('v_overdue_invoices')
      .select('*')
      .order('days_overdue', { ascending: false });

    if (error) {
      console.error('❌ [paymentService] getOverdueInvoices error:', error);
      // Fallback
      return this.getOverdueInvoicesFallback();
    }

    console.log('✅ [paymentService] Found', data?.length, 'overdue invoices');
    return (data || []) as OverdueInvoice[];
  },

  /**
   * Fallback: Lấy hóa đơn quá hạn khi view chưa tồn tại
   */
  async getOverdueInvoicesFallback(): Promise<OverdueInvoice[]> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('supplier_invoices')
      .select(`
        *,
        supplier:supplier_id(id, code, name, phone),
        order:order_id(id, order_code, project_name)
      `)
      .lt('due_date', today)
      .neq('payment_status', 'paid')
      .neq('status', 'cancelled')
      .order('due_date', { ascending: true });

    if (error) throw error;

    return (data || []).map((inv: any) => {
      const supplier = Array.isArray(inv.supplier) ? inv.supplier[0] : inv.supplier;
      const order = Array.isArray(inv.order) ? inv.order[0] : inv.order;
      const dueDate = new Date(inv.due_date);
      const todayDate = new Date(today);
      const daysOverdue = Math.floor((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      return {
        id: inv.id,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        due_date: inv.due_date,
        total_amount: inv.total_amount || 0,
        paid_amount: inv.paid_amount || 0,
        remaining_amount: inv.remaining_amount || 0,
        payment_status: inv.payment_status || 'unpaid',
        days_overdue: daysOverdue,
        supplier_id: supplier?.id || '',
        supplier_code: supplier?.code || '',
        supplier_name: supplier?.name || '',
        supplier_phone: supplier?.phone || '',
        order_id: order?.id || '',
        order_code: order?.order_code || '',
        order_title: order?.project_name || '',
      };
    });
  },

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Lấy thống kê thanh toán tổng quan
   */
  async getPaymentStats(fromDate?: string, toDate?: string): Promise<PaymentStats> {
    console.log('📊 [paymentService] getPaymentStats:', fromDate, toDate);

    try {
      const { data, error } = await supabase.rpc('fn_payment_stats', {
        p_from_date: fromDate || null,
        p_to_date: toDate || null,
      });

      if (error) throw error;

      if (data && data.length > 0) {
        return data[0] as PaymentStats;
      }
    } catch (err) {
      console.warn('⚠️ [paymentService] fn_payment_stats failed, using fallback:', err);
    }

    // Fallback: Tính thủ công
    return this.getPaymentStatsFallback(fromDate, toDate);
  },

  /**
   * Fallback: Tính thống kê khi function chưa tạo
   */
  async getPaymentStatsFallback(fromDate?: string, toDate?: string): Promise<PaymentStats> {
    let query = supabase.from('invoice_payments').select('amount, payment_method');

    if (fromDate) query = query.gte('payment_date', fromDate);
    if (toDate) query = query.lte('payment_date', toDate);

    const { data: payments } = await query;

    // Tính tổng công nợ
    const { data: debtData } = await supabase
      .from('supplier_invoices')
      .select('remaining_amount, due_date, payment_status')
      .neq('status', 'cancelled')
      .neq('payment_status', 'paid');

    const today = new Date().toISOString().split('T')[0];
    const overdueList = (debtData || []).filter(d => d.due_date && d.due_date < today);

    const paymentList = payments || [];
    const totalAmount = paymentList.reduce((sum, p) => sum + (p.amount || 0), 0);

    return {
      total_payments: paymentList.length,
      total_amount: totalAmount,
      cash_amount: paymentList.filter(p => p.payment_method === 'cash').reduce((sum, p) => sum + (p.amount || 0), 0),
      bank_transfer_amount: paymentList.filter(p => p.payment_method === 'bank_transfer').reduce((sum, p) => sum + (p.amount || 0), 0),
      avg_payment: paymentList.length > 0 ? totalAmount / paymentList.length : 0,
      total_debt: (debtData || []).reduce((sum, d) => sum + (d.remaining_amount || 0), 0),
      total_overdue: overdueList.reduce((sum, d) => sum + (d.remaining_amount || 0), 0),
      overdue_count: overdueList.length,
    };
  },

  /**
   * Lấy lịch sử thanh toán theo tháng (cho biểu đồ)
   */
  async getPaymentTrend(months: number = 6): Promise<{ month: string; amount: number; count: number }[]> {
    console.log('📈 [paymentService] getPaymentTrend:', months);

    const results: { month: string; amount: number; count: number }[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // Last day

      const { data, error } = await supabase
        .from('invoice_payments')
        .select('amount')
        .gte('payment_date', startDate)
        .lte('payment_date', endDate);

      if (error) continue;

      const payments = data || [];
      results.push({
        month: `T${month}/${year}`,
        amount: payments.reduce((sum, p) => sum + (p.amount || 0), 0),
        count: payments.length,
      });
    }

    return results;
  },

  // ==========================================================================
  // UTILITY
  // ==========================================================================

  /**
   * Lấy thông tin hóa đơn + số tiền còn lại (dùng cho PaymentForm)
   */
  async getInvoiceForPayment(invoiceId: string): Promise<{
    id: string;
    invoice_number: string;
    total_amount: number;
    paid_amount: number;
    remaining_amount: number;
    payment_status: string;
    supplier_name: string;
    supplier_code: string;
    due_date?: string;
  } | null> {
    const { data, error } = await supabase
      .from('supplier_invoices')
      .select(`
        id, invoice_number, total_amount, paid_amount, remaining_amount, payment_status, due_date,
        supplier:supplier_id(code, name)
      `)
      .eq('id', invoiceId)
      .single();

    if (error) {
      console.error('❌ [paymentService] getInvoiceForPayment error:', error);
      return null;
    }

    const supplier = Array.isArray((data as any).supplier) ? (data as any).supplier[0] : (data as any).supplier;

    return {
      id: data.id,
      invoice_number: data.invoice_number,
      total_amount: data.total_amount || 0,
      paid_amount: data.paid_amount || 0,
      remaining_amount: data.remaining_amount || 0,
      payment_status: data.payment_status || 'unpaid',
      due_date: data.due_date,
      supplier_name: supplier?.name || '',
      supplier_code: supplier?.code || '',
    };
  },

  /**
   * Format số tiền VND
   */
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(amount);
  },

  /**
   * Format ngày tháng
   */
  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  },
};

export default invoicePaymentService;