// ============================================================================
// SUPPLIER INVOICE SERVICE
// File: src/services/supplierInvoiceService.ts
// Huy Anh ERP System - Phase 4: Hóa đơn NCC
// ============================================================================
// Quản lý hóa đơn từ nhà cung cấp, liên kết với đơn hàng
// Upload ảnh hóa đơn gốc, tự động cập nhật trạng thái đơn hàng
// ============================================================================

import { supabase } from '../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

export interface SupplierInvoice {
  id: string;
  invoice_code: string;           // HD-HCM-2025-0001
  order_id: string;
  supplier_id: string;
  invoice_number: string | null;  // Số hóa đơn của NCC
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  image_url: string | null;
  image_urls: string[] | null;
  status: string;                 // pending, partial, paid, cancelled
  payment_status?: string;        // alias cho compatibility
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  order?: {
    id: string;
    code: string;
    order_date: string;
    status: string;
    project_name?: string;
  } | null;
  supplier?: {
    id: string;
    code: string;
    name: string;
    short_name?: string;
    phone?: string;
    email?: string;
    tax_code?: string;
    bank_account?: string;
    bank_name?: string;
  } | null;
  creator?: {
    id: string;
    full_name: string;
  } | null;
  items?: SupplierInvoiceItem[];
}

export interface SupplierInvoiceItem {
  id: string;
  invoice_id: string;
  order_item_id: string | null;
  material_code: string | null;
  material_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  amount: number;
  vat_amount: number;
  total_amount: number;
  notes: string | null;
  sort_order: number;
  created_at: string;
  // Relations
  order_item?: {
    id: string;
    quantity: number;
    unit_price: number;
    invoiced_quantity?: number;
  } | null;
}

export interface InvoiceFormData {
  order_id: string;
  supplier_id: string;
  invoice_number?: string;
  invoice_date: string;
  due_date?: string;
  notes?: string;
  created_by?: string;
  items: InvoiceItemFormData[];
}

export interface InvoiceItemFormData {
  order_item_id?: string;
  material_code?: string;
  material_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  notes?: string;
  sort_order?: number;
}

export interface InvoiceFilter {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  supplier_id?: string;
  order_id?: string;
  from_date?: string;
  to_date?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface InvoiceSummary {
  total_invoices: number;
  total_amount: number;
  total_paid: number;
  total_remaining: number;
  by_status: { status: string; count: number; amount: number }[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const INVOICE_STATUS = {
  PENDING: 'pending',
  PARTIAL: 'partial',
  PAID: 'paid',
  CANCELLED: 'cancelled',
} as const;

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ thanh toán',
  partial: 'Thanh toán một phần',
  paid: 'Đã thanh toán',
  cancelled: 'Đã hủy',
};

export const INVOICE_STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  partial: 'blue',
  paid: 'green',
  cancelled: 'red',
};

export const INVOICE_BUCKET_NAME = 'supplier-invoices';

export const INVOICE_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024,     // 10MB per file
  MAX_FILES_PER_INVOICE: 5,            // 5 files per invoice
  ALLOWED_TYPES: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Tính toán số tiền cho 1 item hóa đơn
 */
export function calculateInvoiceItemAmounts(
  quantity: number,
  unitPrice: number,
  vatRate: number = 10
): { amount: number; vatAmount: number; totalAmount: number } {
  const amount = Math.round(quantity * unitPrice);
  const vatAmount = Math.round(amount * vatRate / 100);
  const totalAmount = amount + vatAmount;
  return { amount, vatAmount, totalAmount };
}

/**
 * Tính tổng hóa đơn từ danh sách items
 */
export function calculateInvoiceTotals(items: InvoiceItemFormData[]): {
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
} {
  let subtotal = 0;
  let vatAmount = 0;

  for (const item of items) {
    const calc = calculateInvoiceItemAmounts(item.quantity, item.unit_price, item.vat_rate);
    subtotal += calc.amount;
    vatAmount += calc.vatAmount;
  }

  return {
    subtotal,
    vatAmount,
    totalAmount: subtotal + vatAmount,
  };
}

/**
 * Format số tiền VND
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ============================================================================
// SERVICE
// ============================================================================

export const supplierInvoiceService = {

  // ===================================================================
  // GENERATE INVOICE CODE
  // Format: HD-{YYYY}-{NNNN}
  // ===================================================================
  async generateInvoiceCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `HD-${year}-`;

    const { data, error } = await supabase
      .from('supplier_invoices')
      .select('invoice_code')
      .ilike('invoice_code', `${prefix}%`)
      .order('invoice_code', { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      const lastCode = data[0].invoice_code;
      const num = parseInt(lastCode.slice(-4)) + 1;
      return `${prefix}${num.toString().padStart(4, '0')}`;
    }

    return `${prefix}0001`;
  },

  // ===================================================================
  // GET ALL - Danh sách hóa đơn (phân trang + filter)
  // ===================================================================
  async getAll(params: InvoiceFilter): Promise<PaginatedResponse<SupplierInvoice>> {
    const { page, pageSize, search, status, supplier_id, order_id, from_date, to_date } = params;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('supplier_invoices')
      .select(`
        *,
        order:purchase_orders!supplier_invoices_order_id_fkey(
          id, code:order_code, order_date, status, project_name
        ),
        supplier:suppliers!supplier_invoices_supplier_id_fkey(
          id, code, name, short_name, phone, email, tax_code
        ),
        creator:employees!supplier_invoices_created_by_fkey(
          id, full_name
        )
      `, { count: 'exact' });

    // Filters
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (supplier_id) {
      query = query.eq('supplier_id', supplier_id);
    }

    if (order_id) {
      query = query.eq('order_id', order_id);
    }

    if (from_date) {
      query = query.gte('invoice_date', from_date);
    }

    if (to_date) {
      query = query.lte('invoice_date', to_date);
    }

    if (search) {
      query = query.or(
        `invoice_code.ilike.%${search}%,invoice_number.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    // Transform - handle array relations
    const invoices = (data || []).map((item: any) => ({
      ...item,
      order: Array.isArray(item.order) ? item.order[0] : item.order,
      supplier: Array.isArray(item.supplier) ? item.supplier[0] : item.supplier,
      creator: Array.isArray(item.creator) ? item.creator[0] : item.creator,
    }));

    return {
      data: invoices,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    };
  },

  // ===================================================================
  // GET BY ID - Chi tiết hóa đơn + items
  // ===================================================================
  async getById(id: string): Promise<SupplierInvoice | null> {
    // Lấy hóa đơn
    const { data: invoice, error: invoiceError } = await supabase
      .from('supplier_invoices')
      .select(`
        *,
        order:purchase_orders!supplier_invoices_order_id_fkey(
          id, code:order_code, order_date, status, project_name
        ),
        supplier:suppliers!supplier_invoices_supplier_id_fkey(
          id, code, name, short_name, phone, email, tax_code,
          bank_account, bank_name
        ),
        creator:employees!supplier_invoices_created_by_fkey(
          id, full_name
        )
      `)
      .eq('id', id)
      .single();

    if (invoiceError) throw invoiceError;
    if (!invoice) return null;

    // Lấy items
    const { data: items, error: itemsError } = await supabase
      .from('supplier_invoice_items')
      .select(`
        *,
        order_item:purchase_order_items!supplier_invoice_items_order_item_id_fkey(
          id, quantity, unit_price, invoiced_quantity
        )
      `)
      .eq('invoice_id', id)
      .order('sort_order', { ascending: true });

    if (itemsError) throw itemsError;

    return {
      ...invoice,
      order: Array.isArray(invoice.order) ? invoice.order[0] : invoice.order,
      supplier: Array.isArray(invoice.supplier) ? invoice.supplier[0] : invoice.supplier,
      creator: Array.isArray(invoice.creator) ? invoice.creator[0] : invoice.creator,
      items: (items || []).map((item: any) => ({
        ...item,
        order_item: Array.isArray(item.order_item) ? item.order_item[0] : item.order_item,
      })),
    };
  },

  // ===================================================================
  // GET BY ORDER ID - Lấy hóa đơn theo đơn hàng
  // ===================================================================
  async getByOrderId(orderId: string): Promise<SupplierInvoice[]> {
    const { data, error } = await supabase
      .from('supplier_invoices')
      .select(`
        *,
        supplier:suppliers!supplier_invoices_supplier_id_fkey(
          id, code, name, short_name
        ),
        creator:employees!supplier_invoices_created_by_fkey(
          id, full_name
        )
      `)
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((item: any) => ({
      ...item,
      supplier: Array.isArray(item.supplier) ? item.supplier[0] : item.supplier,
      creator: Array.isArray(item.creator) ? item.creator[0] : item.creator,
    }));
  },

  // ===================================================================
  // GET BY SUPPLIER ID - Lấy hóa đơn theo NCC
  // ===================================================================
  async getBySupplierId(supplierId: string): Promise<SupplierInvoice[]> {
    const { data, error } = await supabase
      .from('supplier_invoices')
      .select(`
        *,
        order:purchase_orders!supplier_invoices_order_id_fkey(
          id, code:order_code, order_date, status
        ),
        creator:employees!supplier_invoices_created_by_fkey(
          id, full_name
        )
      `)
      .eq('supplier_id', supplierId)
      .order('invoice_date', { ascending: false });

    if (error) throw error;

    return (data || []).map((item: any) => ({
      ...item,
      order: Array.isArray(item.order) ? item.order[0] : item.order,
      creator: Array.isArray(item.creator) ? item.creator[0] : item.creator,
    }));
  },

  // ===================================================================
  // GET ORDER ITEMS FOR INVOICE - Lấy items từ đơn hàng cho NCC cụ thể
  // Để user chọn item nào đã nhận hàng
  // ===================================================================
  async getOrderItemsForInvoice(orderId: string, supplierId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('purchase_order_items')
      .select(`
        id,
        material_id,
        material_code,
        material_name,
        unit,
        quantity,
        unit_price,
        vat_rate,
        amount,
        vat_amount,
        total_amount,
        invoiced_quantity,
        notes
      `)
      .eq('order_id', orderId)
      .eq('supplier_id', supplierId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    // Tính số lượng còn lại chưa nhập hóa đơn
    return (data || []).map((item: any) => ({
      ...item,
      remaining_quantity: (item.quantity || 0) - (item.invoiced_quantity || 0),
    }));
  },

  // ===================================================================
  // CREATE - Tạo hóa đơn mới
  // ===================================================================
  async create(formData: InvoiceFormData): Promise<SupplierInvoice> {
    // 1. Generate invoice code
    const invoiceCode = await this.generateInvoiceCode();

    // 2. Tính tổng
    const totals = calculateInvoiceTotals(formData.items);

    // 3. Insert hóa đơn
    const { data: invoice, error: invoiceError } = await supabase
      .from('supplier_invoices')
      .insert({
        invoice_code: invoiceCode,
        order_id: formData.order_id,
        supplier_id: formData.supplier_id,
        invoice_number: formData.invoice_number || null,
        invoice_date: formData.invoice_date,
        due_date: formData.due_date || null,
        subtotal: totals.subtotal,
        vat_amount: totals.vatAmount,
        total_amount: totals.totalAmount,
        paid_amount: 0,
        remaining_amount: totals.totalAmount,
        status: 'pending',
        notes: formData.notes || null,
        created_by: formData.created_by || null,
      })
      .select()
      .single();

    if (invoiceError) throw invoiceError;

    // 4. Insert items
    if (formData.items.length > 0) {
      const itemsToInsert = formData.items.map((item, index) => {
        const calc = calculateInvoiceItemAmounts(item.quantity, item.unit_price, item.vat_rate);
        return {
          invoice_id: invoice.id,
          order_item_id: item.order_item_id || null,
          material_code: item.material_code || null,
          material_name: item.material_name,
          unit: item.unit,
          quantity: item.quantity,
          unit_price: item.unit_price,
          vat_rate: item.vat_rate,
          amount: calc.amount,
          vat_amount: calc.vatAmount,
          total_amount: calc.totalAmount,
          notes: item.notes || null,
          sort_order: item.sort_order ?? index,
        };
      });

      const { error: itemsError } = await supabase
        .from('supplier_invoice_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;
    }

    // 5. Cập nhật invoiced_quantity trong purchase_order_items
    await this.updateOrderItemInvoicedQuantities(formData.items);

    // 6. Cập nhật trạng thái đơn hàng
    await this.updateOrderInvoiceStatus(formData.order_id);

    // 7. Ghi lịch sử
    await this.addOrderHistory(formData.order_id, 'invoice_added', formData.created_by || null, 
      `Thêm hóa đơn ${invoiceCode}`);

    // 8. Return full invoice
    return this.getById(invoice.id) as Promise<SupplierInvoice>;
  },

  // ===================================================================
  // UPDATE - Cập nhật hóa đơn (chỉ khi status = pending)
  // ===================================================================
  async update(id: string, formData: Partial<InvoiceFormData>): Promise<SupplierInvoice> {
    // Kiểm tra trạng thái
    const existing = await this.getById(id);
    if (!existing) throw new Error('Hóa đơn không tồn tại');
    if (existing.status !== 'pending') {
      throw new Error('Chỉ có thể sửa hóa đơn đang chờ thanh toán');
    }

    // Cập nhật thông tin hóa đơn
    const updateData: any = {};
    if (formData.invoice_number !== undefined) updateData.invoice_number = formData.invoice_number;
    if (formData.invoice_date) updateData.invoice_date = formData.invoice_date;
    if (formData.due_date !== undefined) updateData.due_date = formData.due_date;
    if (formData.notes !== undefined) updateData.notes = formData.notes;

    // Nếu có items mới, cập nhật tổng
    if (formData.items && formData.items.length > 0) {
      const totals = calculateInvoiceTotals(formData.items);
      updateData.subtotal = totals.subtotal;
      updateData.vat_amount = totals.vatAmount;
      updateData.total_amount = totals.totalAmount;
      updateData.remaining_amount = totals.totalAmount - (existing.paid_amount || 0);

      // Rollback invoiced_quantity cũ
      if (existing.items) {
        await this.rollbackOrderItemInvoicedQuantities(existing.items);
      }

      // Xóa items cũ
      const { error: deleteError } = await supabase
        .from('supplier_invoice_items')
        .delete()
        .eq('invoice_id', id);
      if (deleteError) throw deleteError;

      // Insert items mới
      const itemsToInsert = formData.items.map((item, index) => {
        const calc = calculateInvoiceItemAmounts(item.quantity, item.unit_price, item.vat_rate);
        return {
          invoice_id: id,
          order_item_id: item.order_item_id || null,
          material_code: item.material_code || null,
          material_name: item.material_name,
          unit: item.unit,
          quantity: item.quantity,
          unit_price: item.unit_price,
          vat_rate: item.vat_rate,
          amount: calc.amount,
          vat_amount: calc.vatAmount,
          total_amount: calc.totalAmount,
          notes: item.notes || null,
          sort_order: item.sort_order ?? index,
        };
      });

      const { error: insertError } = await supabase
        .from('supplier_invoice_items')
        .insert(itemsToInsert);
      if (insertError) throw insertError;

      // Cập nhật invoiced_quantity mới
      await this.updateOrderItemInvoicedQuantities(formData.items);
    }

    updateData.updated_at = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('supplier_invoices')
      .update(updateData)
      .eq('id', id);

    if (updateError) throw updateError;

    // Cập nhật trạng thái đơn hàng
    if (existing.order_id) {
      await this.updateOrderInvoiceStatus(existing.order_id);
    }

    return this.getById(id) as Promise<SupplierInvoice>;
  },

  // ===================================================================
  // DELETE - Xóa hóa đơn (chỉ khi status = pending, chưa thanh toán)
  // ===================================================================
  async delete(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) throw new Error('Hóa đơn không tồn tại');
    if (existing.status !== 'pending') {
      throw new Error('Chỉ có thể xóa hóa đơn đang chờ thanh toán');
    }
    if ((existing.paid_amount || 0) > 0) {
      throw new Error('Không thể xóa hóa đơn đã có thanh toán');
    }

    // Rollback invoiced_quantity
    if (existing.items) {
      await this.rollbackOrderItemInvoicedQuantities(existing.items);
    }

    // Xóa items trước (cascade)
    const { error: itemsError } = await supabase
      .from('supplier_invoice_items')
      .delete()
      .eq('invoice_id', id);
    if (itemsError) throw itemsError;

    // Xóa hóa đơn
    const { error: invoiceError } = await supabase
      .from('supplier_invoices')
      .delete()
      .eq('id', id);
    if (invoiceError) throw invoiceError;

    // Cập nhật trạng thái đơn hàng
    if (existing.order_id) {
      await this.updateOrderInvoiceStatus(existing.order_id);
      await this.addOrderHistory(existing.order_id, 'invoice_deleted', null,
        `Xóa hóa đơn ${existing.invoice_code}`);
    }
  },

  // ===================================================================
  // CANCEL - Hủy hóa đơn
  // ===================================================================
  async cancel(id: string, reason?: string, cancelledBy?: string): Promise<SupplierInvoice> {
    const existing = await this.getById(id);
    if (!existing) throw new Error('Hóa đơn không tồn tại');
    if (existing.status === 'cancelled') {
      throw new Error('Hóa đơn đã bị hủy');
    }
    if ((existing.paid_amount || 0) > 0) {
      throw new Error('Không thể hủy hóa đơn đã có thanh toán. Vui lòng hoàn tiền trước.');
    }

    // Rollback invoiced_quantity
    if (existing.items) {
      await this.rollbackOrderItemInvoicedQuantities(existing.items);
    }

    const { error } = await supabase
      .from('supplier_invoices')
      .update({
        status: 'cancelled',
        notes: reason ? `${existing.notes || ''}\n[Lý do hủy]: ${reason}`.trim() : existing.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;

    // Cập nhật trạng thái đơn hàng
    if (existing.order_id) {
      await this.updateOrderInvoiceStatus(existing.order_id);
      await this.addOrderHistory(existing.order_id, 'invoice_cancelled', cancelledBy || null,
        `Hủy hóa đơn ${existing.invoice_code}${reason ? ': ' + reason : ''}`);
    }

    return this.getById(id) as Promise<SupplierInvoice>;
  },

  // ===================================================================
  // UPLOAD INVOICE IMAGE
  // ===================================================================
  async uploadImage(invoiceId: string, file: File): Promise<string> {
    // Validate
    if (!INVOICE_CONFIG.ALLOWED_TYPES.includes(file.type)) {
      throw new Error(`Loại file không hỗ trợ. Chấp nhận: JPG, PNG, WebP, PDF`);
    }
    if (file.size > INVOICE_CONFIG.MAX_FILE_SIZE) {
      throw new Error(`File quá lớn. Tối đa ${formatFileSize(INVOICE_CONFIG.MAX_FILE_SIZE)}`);
    }

    // Check existing images
    const existing = await this.getById(invoiceId);
    if (!existing) throw new Error('Hóa đơn không tồn tại');

    const currentImages = existing.image_urls || [];
    if (currentImages.length >= INVOICE_CONFIG.MAX_FILES_PER_INVOICE) {
      throw new Error(`Đã đạt giới hạn ${INVOICE_CONFIG.MAX_FILES_PER_INVOICE} file/hóa đơn`);
    }

    // Upload to storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${invoiceId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(INVOICE_BUCKET_NAME)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw new Error('Lỗi upload file: ' + uploadError.message);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(INVOICE_BUCKET_NAME)
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    // Update database
    const updatedUrls = [...currentImages, publicUrl];
    const { error: updateError } = await supabase
      .from('supplier_invoices')
      .update({
        image_url: updatedUrls[0],  // First image as primary
        image_urls: updatedUrls,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoiceId);

    if (updateError) {
      // Rollback: remove uploaded file
      await supabase.storage.from(INVOICE_BUCKET_NAME).remove([fileName]);
      throw updateError;
    }

    return publicUrl;
  },

  // ===================================================================
  // DELETE INVOICE IMAGE
  // ===================================================================
  async deleteImage(invoiceId: string, imageUrl: string): Promise<void> {
    const existing = await this.getById(invoiceId);
    if (!existing) throw new Error('Hóa đơn không tồn tại');

    const currentImages = existing.image_urls || [];
    const updatedUrls = currentImages.filter(url => url !== imageUrl);

    const { error } = await supabase
      .from('supplier_invoices')
      .update({
        image_url: updatedUrls.length > 0 ? updatedUrls[0] : null,
        image_urls: updatedUrls.length > 0 ? updatedUrls : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoiceId);

    if (error) throw error;

    // Xóa file trong storage
    try {
      const filePath = imageUrl.split(`/${INVOICE_BUCKET_NAME}/`).pop();
      if (filePath) {
        await supabase.storage.from(INVOICE_BUCKET_NAME).remove([filePath]);
      }
    } catch (e) {
      console.warn('Không thể xóa file trong storage:', e);
    }
  },

  // ===================================================================
  // GET INVOICE SUMMARY - Thống kê
  // ===================================================================
  async getSummary(params?: {
    order_id?: string;
    supplier_id?: string;
    from_date?: string;
    to_date?: string;
  }): Promise<InvoiceSummary> {
    let query = supabase
      .from('supplier_invoices')
      .select('id, status, total_amount, paid_amount, remaining_amount');

    if (params?.order_id) query = query.eq('order_id', params.order_id);
    if (params?.supplier_id) query = query.eq('supplier_id', params.supplier_id);
    if (params?.from_date) query = query.gte('invoice_date', params.from_date);
    if (params?.to_date) query = query.lte('invoice_date', params.to_date);

    // Exclude cancelled
    query = query.neq('status', 'cancelled');

    const { data, error } = await query;
    if (error) throw error;

    const invoices = data || [];

    // Tổng hợp theo status
    const statusMap = new Map<string, { count: number; amount: number }>();
    let totalAmount = 0;
    let totalPaid = 0;
    let totalRemaining = 0;

    for (const inv of invoices) {
      totalAmount += inv.total_amount || 0;
      totalPaid += inv.paid_amount || 0;
      totalRemaining += inv.remaining_amount || 0;

      const statusEntry = statusMap.get(inv.status) || { count: 0, amount: 0 };
      statusEntry.count += 1;
      statusEntry.amount += inv.total_amount || 0;
      statusMap.set(inv.status, statusEntry);
    }

    return {
      total_invoices: invoices.length,
      total_amount: totalAmount,
      total_paid: totalPaid,
      total_remaining: totalRemaining,
      by_status: Array.from(statusMap.entries()).map(([status, data]) => ({
        status,
        count: data.count,
        amount: data.amount,
      })),
    };
  },

  // ===================================================================
  // GET SUPPLIERS IN ORDER - Lấy danh sách NCC trong đơn hàng
  // (để user chọn NCC khi tạo hóa đơn)
  // ===================================================================
  async getSuppliersInOrder(orderId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('purchase_order_items')
      .select(`
        supplier_id,
        supplier:suppliers!purchase_order_items_supplier_id_fkey(
          id, code, name, short_name
        )
      `)
      .eq('order_id', orderId);

    if (error) throw error;

    // Unique suppliers
    const supplierMap = new Map();
    for (const item of (data || [])) {
      const supplier = Array.isArray(item.supplier) ? item.supplier[0] : item.supplier;
      if (supplier && !supplierMap.has(supplier.id)) {
        supplierMap.set(supplier.id, supplier);
      }
    }

    return Array.from(supplierMap.values());
  },

  // ===================================================================
  // PRIVATE HELPERS
  // ===================================================================

  /**
   * Cập nhật invoiced_quantity trong purchase_order_items
   */
  async updateOrderItemInvoicedQuantities(items: InvoiceItemFormData[]): Promise<void> {
    for (const item of items) {
      if (item.order_item_id) {
        // Lấy tổng đã nhập hóa đơn cho item này
        const { data: existingItems, error } = await supabase
          .from('supplier_invoice_items')
          .select('quantity')
          .eq('order_item_id', item.order_item_id);

        if (!error && existingItems) {
          const totalInvoiced = existingItems.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0);
          
          await supabase
            .from('purchase_order_items')
            .update({ invoiced_quantity: totalInvoiced })
            .eq('id', item.order_item_id);
        }
      }
    }
  },

  /**
   * Rollback invoiced_quantity khi xóa/hủy hóa đơn
   */
  async rollbackOrderItemInvoicedQuantities(items: SupplierInvoiceItem[]): Promise<void> {
    for (const item of items) {
      if (item.order_item_id) {
        // Recalculate từ các hóa đơn còn active
        const { data: activeItems, error } = await supabase
          .from('supplier_invoice_items')
          .select(`
            quantity,
            invoice:supplier_invoices!supplier_invoice_items_invoice_id_fkey(status)
          `)
          .eq('order_item_id', item.order_item_id)
          .neq('invoice_id', item.invoice_id);

        if (!error && activeItems) {
          const totalInvoiced = activeItems
            .filter((i: any) => {
              const invoice = Array.isArray(i.invoice) ? i.invoice[0] : i.invoice;
              return invoice?.status !== 'cancelled';
            })
            .reduce((sum: number, i: any) => sum + (i.quantity || 0), 0);

          await supabase
            .from('purchase_order_items')
            .update({ invoiced_quantity: totalInvoiced })
            .eq('id', item.order_item_id);
        }
      }
    }
  },

  /**
   * Cập nhật trạng thái đơn hàng dựa trên hóa đơn
   * - Nếu có ít nhất 1 hóa đơn → partial (Đang giao)
   * - Nếu tất cả items đã nhập hóa đơn đủ số lượng → completed (Hoàn thành)
   */
  async updateOrderInvoiceStatus(orderId: string): Promise<void> {
    // Lấy thông tin đơn hàng
    const { data: order, error: orderError } = await supabase
      .from('purchase_orders')
      .select('id, status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) return;

    // Chỉ cập nhật nếu đơn hàng ở trạng thái confirmed hoặc partial
    if (!['confirmed', 'partial'].includes(order.status)) return;

    // Lấy tổng hóa đơn active
    const { data: invoices, error: invError } = await supabase
      .from('supplier_invoices')
      .select('id, status')
      .eq('order_id', orderId)
      .neq('status', 'cancelled');

    if (invError) return;

    const activeInvoices = invoices || [];

    if (activeInvoices.length === 0) {
      // Không có hóa đơn → giữ confirmed
      if (order.status === 'partial') {
        await supabase
          .from('purchase_orders')
          .update({ status: 'confirmed', updated_at: new Date().toISOString() })
          .eq('id', orderId);
      }
      return;
    }

    // Kiểm tra tất cả order items đã nhập đủ hóa đơn chưa
    const { data: orderItems, error: itemsError } = await supabase
      .from('purchase_order_items')
      .select('id, quantity, invoiced_quantity')
      .eq('order_id', orderId);

    if (itemsError) return;

    const allFullyInvoiced = (orderItems || []).every(
      (item: any) => (item.invoiced_quantity || 0) >= (item.quantity || 0)
    );

    const newStatus = allFullyInvoiced ? 'completed' : 'partial';

    if (order.status !== newStatus) {
      await supabase
        .from('purchase_orders')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', orderId);
    }
  },

  /**
   * Ghi lịch sử đơn hàng
   */
  async addOrderHistory(
    orderId: string, 
    action: string, 
    performedBy: string | null, 
    description: string
  ): Promise<void> {
    try {
      await supabase
        .from('purchase_order_history')
        .insert({
          order_id: orderId,
          action,
          description,
          performed_by: performedBy,
        });
    } catch (e) {
      console.warn('Không thể ghi lịch sử:', e);
    }
  },

  // ===================================================================
  // GET OVERDUE INVOICES - Hóa đơn quá hạn
  // ===================================================================
  async getOverdueInvoices(): Promise<SupplierInvoice[]> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('supplier_invoices')
      .select(`
        *,
        order:purchase_orders!supplier_invoices_order_id_fkey(
          id, code:order_code
        ),
        supplier:suppliers!supplier_invoices_supplier_id_fkey(
          id, code, name, short_name
        )
      `)
      .in('status', ['pending', 'partial'])
      .not('due_date', 'is', null)
      .lt('due_date', today)
      .order('due_date', { ascending: true });

    if (error) throw error;

    return (data || []).map((item: any) => ({
      ...item,
      order: Array.isArray(item.order) ? item.order[0] : item.order,
      supplier: Array.isArray(item.supplier) ? item.supplier[0] : item.supplier,
    }));
  },
};

export default supplierInvoiceService;