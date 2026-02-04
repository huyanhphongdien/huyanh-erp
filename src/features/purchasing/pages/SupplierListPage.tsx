// ============================================================================
// SUPPLIER LIST PAGE
// File: src/features/purchasing/pages/SupplierListPage.tsx
// Huy Anh ERP System - Module Quản lý đơn hàng
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  Star,
  FileText,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
  AlertCircle,
  CheckCircle,
  XCircle,
  Ban
} from 'lucide-react';

// File: src/features/purchasing/pages/SupplierListPage.tsx
// Service: src/services/supplierService.ts
// Path: 3 cấp lên (../../../)
import { 
  supplierService, 
  type Supplier, 
  type SupplierListItem, 
  type SupplierFilterParams 
} from '../../../services/supplierService';

// ============================================================================
// TYPES
// ============================================================================

interface FilterState {
  search: string;
  status: string;
  supplier_type: string;
  supplier_group: string;
  province: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'active', label: 'Đang hoạt động' },
  { value: 'inactive', label: 'Tạm ngừng' },
  { value: 'blocked', label: 'Đã khóa' }
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'Tất cả loại' },
  { value: 'company', label: 'Công ty' },
  { value: 'individual', label: 'Cá nhân' }
];

const GROUP_OPTIONS = [
  { value: 'all', label: 'Tất cả nhóm' },
  { value: 'primary', label: 'NCC Chính' },
  { value: 'secondary', label: 'NCC Phụ' },
  { value: 'service', label: 'Dịch vụ' }
];

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    active: { label: 'Hoạt động', className: 'bg-green-100 text-green-800', icon: <CheckCircle size={14} /> },
    inactive: { label: 'Tạm ngừng', className: 'bg-yellow-100 text-yellow-800', icon: <XCircle size={14} /> },
    blocked: { label: 'Đã khóa', className: 'bg-red-100 text-red-800', icon: <Ban size={14} /> }
  };
  const { label, className, icon } = config[status] || config.inactive;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${className}`}>
      {icon}{label}
    </span>
  );
};

const TypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const config: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    company: { label: 'Công ty', className: 'bg-blue-100 text-blue-800', icon: <Building2 size={14} /> },
    individual: { label: 'Cá nhân', className: 'bg-purple-100 text-purple-800', icon: <User size={14} /> }
  };
  const { label, className, icon } = config[type] || config.company;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${className}`}>
      {icon}{label}
    </span>
  );
};

const GroupBadge: React.FC<{ group: string }> = ({ group }) => {
  const config: Record<string, { label: string; className: string }> = {
    primary: { label: 'Chính', className: 'bg-emerald-100 text-emerald-800' },
    secondary: { label: 'Phụ', className: 'bg-gray-100 text-gray-800' },
    service: { label: 'Dịch vụ', className: 'bg-orange-100 text-orange-800' }
  };
  const { label, className } = config[group] || config.secondary;
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${className}`}>{label}</span>;
};

const RatingStars: React.FC<{ rating: number }> = ({ rating }) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((star) => (
      <Star key={star} size={14} className={star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'} />
    ))}
    <span className="text-xs text-gray-500 ml-1">({rating.toFixed(1)})</span>
  </div>
);

const EmptyState: React.FC<{ onAdd: () => void }> = ({ onAdd }) => (
  <div className="text-center py-12">
    <Building2 className="mx-auto h-12 w-12 text-gray-400" />
    <h3 className="mt-2 text-sm font-medium text-gray-900">Chưa có nhà cung cấp</h3>
    <p className="mt-1 text-sm text-gray-500">Bắt đầu bằng cách thêm nhà cung cấp đầu tiên.</p>
    <div className="mt-6">
      <button onClick={onAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
        <Plus size={20} />Thêm nhà cung cấp
      </button>
    </div>
  </div>
);

const Pagination: React.FC<{
  page: number; totalPages: number; total: number; pageSize: number;
  onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void;
}> = ({ page, totalPages, total, pageSize, onPageChange, onPageSizeChange }) => {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t">
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-700">
          Hiển thị <span className="font-medium">{from}</span> - <span className="font-medium">{to}</span> trong <span className="font-medium">{total}</span> kết quả
        </span>
        <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className="border rounded px-2 py-1 text-sm">
          {PAGE_SIZE_OPTIONS.map((size) => (<option key={size} value={size}>{size} / trang</option>))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => onPageChange(page - 1)} disabled={page === 1} className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed">
          <ChevronLeft size={20} />
        </button>
        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) pageNum = i + 1;
            else if (page <= 3) pageNum = i + 1;
            else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
            else pageNum = page - 2 + i;
            return (
              <button key={pageNum} onClick={() => onPageChange(pageNum)}
                className={`px-3 py-1 rounded text-sm ${page === pageNum ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`}>
                {pageNum}
              </button>
            );
          })}
        </div>
        <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages} className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed">
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const SupplierListPage: React.FC = () => {
  const navigate = useNavigate();

  const [suppliers, setSuppliers] = useState<SupplierListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [filters, setFilters] = useState<FilterState>({ search: '', status: 'all', supplier_type: 'all', supplier_group: 'all', province: 'all' });
  const [showFilters, setShowFilters] = useState(false);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: SupplierFilterParams = {
        page, pageSize,
        search: filters.search || undefined,
        status: filters.status !== 'all' ? filters.status : undefined,
        supplier_type: filters.supplier_type !== 'all' ? filters.supplier_type : undefined,
        supplier_group: filters.supplier_group !== 'all' ? filters.supplier_group : undefined,
        province: filters.province !== 'all' ? filters.province : undefined
      };
      const result = await supplierService.getAll(params);
      setSuppliers(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      console.error('Load suppliers error:', err);
      setError('Không thể tải danh sách nhà cung cấp');
    } finally {
      setLoading(false);
    }
  };

  const loadProvinces = async () => {
    try {
      const data = await supplierService.getProvinces();
      setProvinces(data);
    } catch (err) {
      console.error('Load provinces error:', err);
    }
  };

  useEffect(() => { loadSuppliers(); }, [page, pageSize, filters]);
  useEffect(() => { loadProvinces(); }, []);

  const handleSearch = (value: string) => { setFilters((prev) => ({ ...prev, search: value })); setPage(1); };
  const handleFilterChange = (key: keyof FilterState, value: string) => { setFilters((prev) => ({ ...prev, [key]: value })); setPage(1); };
  const handleClearFilters = () => { setFilters({ search: '', status: 'all', supplier_type: 'all', supplier_group: 'all', province: 'all' }); setPage(1); };
  const handleAdd = () => navigate('/purchasing/suppliers/new');
  const handleView = (id: string) => { navigate(`/purchasing/suppliers/${id}`); setActionMenuId(null); };
  const handleEdit = (id: string) => { navigate(`/purchasing/suppliers/${id}/edit`); setActionMenuId(null); };
  
  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      setDeleting(true);
      await supplierService.delete(deleteConfirm.id);
      setDeleteConfirm(null);
      loadSuppliers();
    } catch (err) {
      console.error('Delete supplier error:', err);
      alert('Không thể xóa nhà cung cấp');
    } finally {
      setDeleting(false);
    }
  };

  const hasActiveFilters = useMemo(() => {
    return filters.status !== 'all' || filters.supplier_type !== 'all' || filters.supplier_group !== 'all' || filters.province !== 'all';
  }, [filters]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nhà cung cấp</h1>
          <p className="text-gray-500 mt-1">Quản lý danh sách nhà cung cấp</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => alert('Tính năng xuất Excel đang phát triển')} className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50">
            <Download size={20} />Xuất Excel
          </button>
          <button onClick={handleAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus size={20} />Thêm NCC
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 border-b">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input type="text" placeholder="Tìm theo tên, mã, MST..." value={filters.search} onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {filters.search && (
                <button onClick={() => handleSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              )}
            </div>
            <button onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-2 px-4 py-2 border rounded-lg ${hasActiveFilters ? 'border-blue-500 bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}>
              <Filter size={20} />Bộ lọc
              {hasActiveFilters && (
                <span className="w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">
                  {[filters.status, filters.supplier_type, filters.supplier_group, filters.province].filter(f => f !== 'all').length}
                </span>
              )}
            </button>
            <button onClick={loadSuppliers} disabled={loading} className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
                  <select value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)} className="w-full border rounded-lg px-3 py-2">
                    {STATUS_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Loại NCC</label>
                  <select value={filters.supplier_type} onChange={(e) => handleFilterChange('supplier_type', e.target.value)} className="w-full border rounded-lg px-3 py-2">
                    {TYPE_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nhóm NCC</label>
                  <select value={filters.supplier_group} onChange={(e) => handleFilterChange('supplier_group', e.target.value)} className="w-full border rounded-lg px-3 py-2">
                    {GROUP_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tỉnh/Thành phố</label>
                  <select value={filters.province} onChange={(e) => handleFilterChange('province', e.target.value)} className="w-full border rounded-lg px-3 py-2">
                    <option value="all">Tất cả</option>
                    {provinces.map((p) => (<option key={p} value={p}>{p}</option>))}
                  </select>
                </div>
              </div>
              {hasActiveFilters && (
                <div className="mt-4">
                  <button onClick={handleClearFilters} className="text-sm text-blue-600 hover:text-blue-800">Xóa bộ lọc</button>
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="p-4 bg-red-50 border-b border-red-100">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle size={20} /><span>{error}</span>
              <button onClick={loadSuppliers} className="ml-auto text-sm underline">Thử lại</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="mx-auto h-8 w-8 text-gray-400 animate-spin" />
            <p className="mt-2 text-gray-500">Đang tải...</p>
          </div>
        ) : suppliers.length === 0 ? (
          <EmptyState onAdd={handleAdd} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nhà cung cấp</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Loại / Nhóm</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Liên hệ</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Địa chỉ</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Đơn hàng</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Công nợ</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {suppliers.map((supplier) => (
                    <tr key={supplier.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div>
                          <button onClick={() => handleView(supplier.id)} className="font-medium text-blue-600 hover:text-blue-800 text-left">
                            {supplier.name}
                          </button>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500">{supplier.code}</span>
                            {supplier.tax_code && (<><span className="text-gray-300">•</span><span className="text-xs text-gray-500">MST: {supplier.tax_code}</span></>)}
                          </div>
                          {supplier.rating > 0 && <div className="mt-1"><RatingStars rating={supplier.rating} /></div>}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1">
                          <TypeBadge type={supplier.supplier_type} />
                          <GroupBadge group={supplier.supplier_group} />
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1 text-sm">
                          {supplier.contact_name && (<div className="flex items-center gap-1 text-gray-700"><User size={14} className="text-gray-400" />{supplier.contact_name}</div>)}
                          {supplier.phone && (<div className="flex items-center gap-1 text-gray-500"><Phone size={14} className="text-gray-400" />{supplier.phone}</div>)}
                          {supplier.email && (<div className="flex items-center gap-1 text-gray-500"><Mail size={14} className="text-gray-400" /><span className="truncate max-w-[150px]">{supplier.email}</span></div>)}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {supplier.province && (<div className="flex items-center gap-1 text-sm text-gray-500"><MapPin size={14} className="text-gray-400 flex-shrink-0" /><span className="truncate max-w-[150px]">{supplier.province}</span></div>)}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-sm font-medium">{supplier.total_orders || 0}</span>
                        {supplier.active_quotations_count && supplier.active_quotations_count > 0 && (
                          <div className="flex items-center justify-center gap-1 mt-1 text-xs text-blue-600"><FileText size={12} />{supplier.active_quotations_count} báo giá</div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {supplier.total_debt > 0 ? (
                          <span className="text-sm font-medium text-red-600">{new Intl.NumberFormat('vi-VN').format(supplier.total_debt)}</span>
                        ) : (<span className="text-sm text-gray-400">-</span>)}
                      </td>
                      <td className="px-4 py-4 text-center"><StatusBadge status={supplier.status} /></td>
                      <td className="px-4 py-4 text-center">
                        <div className="relative">
                          <button onClick={() => setActionMenuId(actionMenuId === supplier.id ? null : supplier.id)} className="p-2 rounded hover:bg-gray-100">
                            <MoreVertical size={20} />
                          </button>
                          {actionMenuId === supplier.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setActionMenuId(null)} />
                              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border z-20">
                                <div className="py-1">
                                  <button onClick={() => handleView(supplier.id)} className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"><Eye size={16} />Xem chi tiết</button>
                                  <button onClick={() => handleEdit(supplier.id)} className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"><Edit size={16} />Chỉnh sửa</button>
                                  <hr className="my-1" />
                                  <button onClick={() => { setDeleteConfirm({ id: supplier.id, name: supplier.name }); setActionMenuId(null); }}
                                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 size={16} />Xóa</button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          </>
        )}
      </div>

      {/* Delete Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 text-red-600 mb-4"><AlertCircle size={24} /><h3 className="text-lg font-semibold">Xác nhận xóa</h3></div>
            <p className="text-gray-600 mb-6">Bạn có chắc muốn xóa nhà cung cấp <strong>{deleteConfirm.name}</strong>?<br /><span className="text-sm text-gray-500">Hành động này không thể hoàn tác.</span></p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} disabled={deleting} className="px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50">Hủy</button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{deleting ? 'Đang xóa...' : 'Xóa'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierListPage;