// ============================================================================
// SUPPLIER LIST PAGE
// File: src/features/purchasing/pages/SupplierListPage.tsx
// Huy Anh ERP System - Module Quản lý đơn hàng
// ============================================================================
// Đợt 3 audit UI (17/11/2026): bảng tự chế + phân trang tay → AdvancedDataTable (lọc từng cột, ẩn/hiện cột,
// header dính, XUẤT EXCEL thật — nút "Xuất Excel" cũ chỉ bật alert "đang phát triển").
// Ô tìm (tên/mã/MST/HAC-13) vẫn chạy phía server có debounce; lọc Trạng thái/Loại/Nhóm/Tỉnh nằm ở hàng lọc của bảng.
// ============================================================================

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { App as AntdApp } from 'antd';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Building2,
  User,
  Star,
  FileText,
  X,
  CheckCircle,
  XCircle,
  Ban
} from 'lucide-react';

// File: src/features/purchasing/pages/SupplierListPage.tsx
// Service: src/services/supplierService.ts
// Path: 3 cấp lên (../../../)
import {
  supplierService,
  type SupplierListItem,
  type SupplierFilterParams,
  SUPPLIER_STATUS_LABELS,
  SUPPLIER_TYPE_LABELS,
  SUPPLIER_GROUP_LABELS,
} from '../../../services/supplierService';
import { Hac13CodeDisplay } from '../../../components/master-data/Hac13CodeDisplay';
import { useDebounce } from '../../../hooks/useDebounce';
import AdvancedDataTable, { type ColumnDef } from '../../../components/common/AdvancedDataTable';
import { fmtVndNum, fmtNum } from '../../../utils/format';
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Sổ NCC tải một cục tối đa N dòng — chạm trần thì chân bảng báo (`loadLimit` của AdvancedDataTable, không im lặng mất dòng).
 *  Lọc cột (Trạng thái/Loại/Nhóm/Tỉnh) chạy trên các dòng ĐÃ tải → chỉ đúng khi tải đủ. Đếm thật 17/11/2026: 3 NCC
 *  (v_suppliers_list). Khi sổ vượt ~800 NCC thì quay về phân trang + lọc phía server (supplierService.getAll đã nhận
 *  page/pageSize + status/supplier_type/supplier_group/province). */
const SUPPLIER_LOAD_LIMIT = 1000;

const toOptions = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { className: string; icon: React.ReactNode }> = {
    active: { className: 'bg-green-100 text-green-800', icon: <CheckCircle size={14} /> },
    inactive: { className: 'bg-yellow-100 text-yellow-800', icon: <XCircle size={14} /> },
    blocked: { className: 'bg-red-100 text-red-800', icon: <Ban size={14} /> }
  };
  const { className, icon } = config[status] || config.inactive;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${className}`}>
      {icon}{SUPPLIER_STATUS_LABELS[status] || status}
    </span>
  );
};

const TypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const config: Record<string, { className: string; icon: React.ReactNode }> = {
    company: { className: 'bg-blue-100 text-blue-800', icon: <Building2 size={14} /> },
    individual: { className: 'bg-purple-100 text-purple-800', icon: <User size={14} /> }
  };
  const { className, icon } = config[type] || config.company;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${className}`}>
      {icon}{SUPPLIER_TYPE_LABELS[type] || type}
    </span>
  );
};

const GroupBadge: React.FC<{ group: string }> = ({ group }) => {
  const config: Record<string, string> = {
    primary: 'bg-emerald-100 text-emerald-800',
    secondary: 'bg-gray-100 text-gray-800',
    service: 'bg-orange-100 text-orange-800'
  };
  const className = config[group] || config.secondary;
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${className}`}>{SUPPLIER_GROUP_LABELS[group] || group}</span>;
};

const RatingStars: React.FC<{ rating: number }> = ({ rating }) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((star) => (
      <Star key={star} size={14} className={star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'} />
    ))}
    <span className="text-xs text-gray-500 ml-1">({fmtNum(rating, 1)})</span>
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const SupplierListPage: React.FC = () => {
  const navigate = useNavigate();
  const { message, modal } = AntdApp.useApp();

  const [suppliers, setSuppliers] = useState<SupplierListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400); // gõ xong 400ms mới bắn query
  const [provinces, setProvinces] = useState<string[]>([]);

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: SupplierFilterParams = {
        page: 1,
        pageSize: SUPPLIER_LOAD_LIMIT,
        search: debouncedSearch || undefined,
      };
      const result = await supplierService.getAll(params);
      setSuppliers(result.data);
    } catch (err) {
      console.error('Load suppliers error:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const loadProvinces = async () => {
    try {
      const data = await supplierService.getProvinces();
      setProvinces(data);
    } catch (err) {
      // Chỉ là gợi ý cho ô lọc tỉnh — lỗi thì ô lọc tỉnh quay về gõ chữ
      console.error('Load provinces error:', err);
    }
  };

  useEffect(() => { loadSuppliers(); }, [debouncedSearch]);
  useEffect(() => { loadProvinces(); }, []);

  // Thông báo do trang khác gửi sang (vd "Đã xóa nhà cung cấp" từ trang chi tiết) — trước đây bị rơi mất
  const location = useLocation();
  useEffect(() => {
    const msg = (location.state as { message?: string } | null)?.message;
    if (msg) {
      message.success(msg);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, []);

  const handleAdd = () => navigate('/purchasing/suppliers/new');
  const handleView = (id: string) => navigate(`/purchasing/suppliers/${id}`);
  const handleEdit = (id: string) => navigate(`/purchasing/suppliers/${id}/edit`);

  const handleDelete = (supplier: SupplierListItem) => {
    modal.confirm({
      title: `Xóa nhà cung cấp "${supplier.name}"?`,
      content: 'NCC sẽ bị gỡ khỏi danh sách và chuyển sang Tạm ngừng. Đơn hàng, hóa đơn đã ghi vẫn giữ nguyên.',
      okText: 'Xóa NCC',
      okButtonProps: { danger: true },
      cancelText: 'Không',
      onOk: async () => {
        try {
          await supplierService.delete(supplier.id);
          message.success(`Đã xóa nhà cung cấp ${supplier.name}`);
          loadSuppliers();
        } catch (err) {
          console.error('Delete supplier error:', err);
          message.error(dichLoiHeThong(err, 'Không thể xóa nhà cung cấp'));
        }
      },
    });
  };

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const columns: ColumnDef<SupplierListItem>[] = [
    {
      key: 'code', title: 'Mã NCC', dataIndex: 'code', width: 150, sortable: true,
      render: (_, s) => (s.code && s.code.length === 13 && s.code.startsWith('8999')
        ? <Hac13CodeDisplay code={s.code} variant="badge" showCopy={false} />
        : <span className="text-xs text-gray-600 font-mono">{s.code || '—'}</span>),
    },
    {
      key: 'name', title: 'Nhà cung cấp', dataIndex: 'name', minWidth: 200, sortable: true,
      render: (_, s) => (
        <div>
          <div className="font-medium text-blue-600">{s.name}</div>
          {s.short_name && s.short_name !== s.name && <div className="text-xs text-gray-500">{s.short_name}</div>}
          {s.rating > 0 && <div className="mt-1"><RatingStars rating={s.rating} /></div>}
        </div>
      ),
    },
    { key: 'tax_code', title: 'MST', dataIndex: 'tax_code', width: 120 },
    {
      key: 'supplier_type', title: 'Loại', dataIndex: 'supplier_type', width: 110,
      filterType: 'select', filterOptions: toOptions(SUPPLIER_TYPE_LABELS),
      render: (v) => <TypeBadge type={v} />,
      exportRender: (v) => SUPPLIER_TYPE_LABELS[v] || v || '',
    },
    {
      key: 'supplier_group', title: 'Nhóm', dataIndex: 'supplier_group', width: 110,
      filterType: 'select', filterOptions: toOptions(SUPPLIER_GROUP_LABELS),
      render: (v) => <GroupBadge group={v} />,
      exportRender: (v) => SUPPLIER_GROUP_LABELS[v] || v || '',
    },
    { key: 'contact_name', title: 'Người liên hệ', dataIndex: 'contact_name', width: 150 },
    { key: 'phone', title: 'Điện thoại', dataIndex: 'phone', width: 120 },
    { key: 'email', title: 'Email', dataIndex: 'email', width: 170, ellipsis: true },
    {
      key: 'province', title: 'Tỉnh/Thành', dataIndex: 'province', width: 130,
      ...(provinces.length > 0
        ? { filterType: 'select' as const, filterOptions: provinces.map((p) => ({ value: p, label: p })) }
        : {}),
    },
    {
      key: 'total_orders', title: 'Số đơn', dataIndex: 'total_orders', width: 90, align: 'center', sortable: true,
      filterType: 'number',
      render: (v, s) => (
        <div>
          <span className="text-sm font-medium">{fmtNum(v || 0)}</span>
          {!!s.active_quotations_count && s.active_quotations_count > 0 && (
            <div className="flex items-center justify-center gap-1 mt-1 text-xs text-blue-600"><FileText size={12} />{s.active_quotations_count} báo giá</div>
          )}
        </div>
      ),
      exportRender: (v) => Number(v) || 0,
    },
    {
      key: 'total_debt', title: 'Công nợ (₫)', dataIndex: 'total_debt', width: 130, align: 'right', sortable: true,
      filterType: 'number', summary: 'sum', exportNumFmt: '#,##0',
      render: (v) => (Number(v) > 0
        ? <span className="text-sm font-medium text-red-600">{fmtVndNum(v)}</span>
        : <span className="text-sm text-gray-400">{fmtVndNum(v ?? 0)}</span>),
      exportRender: (v) => Number(v) || 0,
    },
    {
      key: 'status', title: 'Trạng thái', dataIndex: 'status', width: 130, align: 'center',
      filterType: 'select', filterOptions: toOptions(SUPPLIER_STATUS_LABELS),
      render: (v) => <StatusBadge status={v} />,
      exportRender: (v) => SUPPLIER_STATUS_LABELS[v] || v || '',
    },
    {
      key: 'actions', title: 'Thao tác', width: 90, align: 'center', filterable: false,
      render: (_, s) => (
        <div className="flex items-center justify-center gap-1" onClick={stop}>
          <button onClick={() => handleEdit(s.id)} className="p-1.5 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-50" title="Chỉnh sửa">
            <Edit size={16} />
          </button>
          <button onClick={() => handleDelete(s)} className="p-1.5 rounded text-gray-500 hover:text-red-600 hover:bg-red-50" title="Xóa">
            <Trash2 size={16} />
          </button>
        </div>
      ),
      exportRender: () => '',
    },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nhà cung cấp</h1>
          <p className="text-gray-500 mt-1">Quản lý danh sách nhà cung cấp</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Xuất Excel: nút trên thanh công cụ của bảng (xuất đúng các dòng đang lọc) */}
          <button onClick={handleAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus size={20} />Thêm NCC
          </button>
        </div>
      </div>

      {/* Search (server-side, có debounce) */}
      <div className="bg-white rounded-lg shadow mb-4 p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input type="text" placeholder="Tìm theo tên, mã, MST, mã HAC-13..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" title="Xóa từ khóa">
              <X size={16} />
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2">Lọc theo Trạng thái / Loại / Nhóm / Tỉnh ở hàng lọc ngay dưới tiêu đề bảng.</p>
      </div>

      <AdvancedDataTable<SupplierListItem>
        columns={columns}
        dataSource={suppliers}
        rowKey="id"
        loading={loading}
        error={error}
        onRefresh={loadSuppliers}
        onRowClick={(s) => handleView(s.id)}
        title="Nhà cung cấp"
        exportFileName="Nha_Cung_Cap"
        loadLimit={SUPPLIER_LOAD_LIMIT}
        pageSize={50}
        emptyText={search ? 'Không tìm thấy nhà cung cấp phù hợp' : 'Chưa có nhà cung cấp — bấm "Thêm NCC" để tạo'}
      />
    </div>
  );
};

export default SupplierListPage;
