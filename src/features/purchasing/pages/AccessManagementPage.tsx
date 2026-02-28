// ============================================================================
// ACCESS MANAGEMENT PAGE
// File: src/features/purchasing/pages/AccessManagementPage.tsx
// Huy Anh ERP System - Phase 6: Access Control
// ============================================================================
// Route: /purchasing/access
// Trang quản lý phân quyền module Mua hàng — CHỈ BGĐ (level ≤ 3) truy cập
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  ShieldCheck,
  ShieldPlus,
  ShieldX,
  ShieldAlert,
  Users,
  UserCheck,
  UserX,
  Eye,
  Edit3,
  Trash2,
  Search,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ArrowLeft,
  Building2,
  Briefcase,
  Clock,
  Crown,
  Check,
  X,
} from 'lucide-react';
import { purchaseAccessService } from '../../../services/purchaseAccessService';
import type {
  PurchaseAccess,
  AccessStats,
  AccessLevel,
} from '../../../services/purchaseAccessService';
import { usePurchaseAccess } from '../../../hooks/usePurchaseAccess';
import { useAuthStore } from '../../../stores/authStore';
import GrantAccessModal from './components/access/GrantAccessModal';

// ============================================================================
// HELPERS
// ============================================================================

const formatDateTime = (dateStr: string): string => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const ACCESS_LEVEL_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  full: { label: 'Toàn quyền', color: 'text-green-700', bg: 'bg-green-100', icon: Edit3 },
  view_only: { label: 'Chỉ xem', color: 'text-blue-700', bg: 'bg-blue-100', icon: Eye },
};

// ============================================================================
// COMPONENT
// ============================================================================

const AccessManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { canManageAccess } = usePurchaseAccess();

  // State
  const [accessList, setAccessList] = useState<PurchaseAccess[]>([]);
  const [stats, setStats] = useState<AccessStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showGrantModal, setShowGrantModal] = useState(false);

  // ========================================================================
  // FETCH DATA
  // ========================================================================

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await purchaseAccessService.getAccessList({
        activeOnly: !showInactive,
        search: search || undefined,
      });
      setAccessList(data);
    } catch (err: any) {
      console.error('❌ Error loading access list:', err);
      setError(err.message || 'Không thể tải danh sách phân quyền');
    } finally {
      setLoading(false);
    }
  }, [showInactive, search]);

  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const data = await purchaseAccessService.getStats();
      setStats(data);
    } catch (err) {
      console.warn('Could not load stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ========================================================================
  // HANDLERS
  // ========================================================================

  const handleRevoke = async (access: PurchaseAccess) => {
    const name = access.employee?.full_name || 'nhân viên';
    if (!confirm(`Thu hồi quyền truy cập của ${name}? Nhân viên sẽ không thể truy cập module Mua hàng nữa.`)) {
      return;
    }

    try {
      await purchaseAccessService.revokeAccess(access.id, user?.employee_id ?? undefined);
      fetchData();
      fetchStats();
    } catch (err: any) {
      alert('Lỗi thu hồi quyền: ' + err.message);
    }
  };

  const handleToggleLevel = async (access: PurchaseAccess) => {
    const newLevel: AccessLevel = access.access_level === 'full' ? 'view_only' : 'full';
    const name = access.employee?.full_name || 'nhân viên';
    const levelLabel = newLevel === 'full' ? 'Toàn quyền' : 'Chỉ xem';

    if (!confirm(`Đổi quyền của ${name} thành "${levelLabel}"?`)) return;

    try {
      await purchaseAccessService.updateAccessLevel(access.id, newLevel);
      fetchData();
      fetchStats();
    } catch (err: any) {
      alert('Lỗi cập nhật quyền: ' + err.message);
    }
  };

  const handleGrantSuccess = () => {
    setShowGrantModal(false);
    fetchData();
    fetchStats();
  };

  // ========================================================================
  // ACCESS CHECK
  // ========================================================================

  if (!canManageAccess) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <ShieldX className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">Không có quyền</h2>
        <p className="text-gray-500 mb-6">Chỉ Ban Giám đốc mới có quyền quản lý phân quyền module Mua hàng.</p>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
        >
          <ArrowLeft className="w-4 h-4" /> Quay lại
        </button>
      </div>
    );
  }

  // ========================================================================
  // RENDER
  // ========================================================================

  const activeList = accessList.filter(a => a.is_active);
  const inactiveList = accessList.filter(a => !a.is_active);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* ================================================================ */}
      {/* HEADER                                                           */}
      {/* ================================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/purchasing/suppliers')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Phân quyền Mua hàng</h1>
            </div>
            <p className="text-sm text-gray-500 mt-0.5 ml-8">
              Quản lý quyền truy cập module Quản lý Đơn hàng
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowGrantModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <ShieldPlus className="w-4 h-4" />
          Cấp quyền mới
        </button>
      </div>

      {/* ================================================================ */}
      {/* STATS                                                            */}
      {/* ================================================================ */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard
          icon={Crown}
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
          label="Cấp quản lý"
          value={stats?.executive_count}
          sub="Tự động có quyền"
          loading={statsLoading}
        />
        <StatCard
          icon={UserCheck}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
          label="Đã cấp quyền"
          value={stats?.total_granted}
          sub="nhân viên"
          loading={statsLoading}
        />
        <StatCard
          icon={Edit3}
          iconBg="bg-green-100"
          iconColor="text-green-600"
          label="Toàn quyền"
          value={stats?.active_full}
          sub="full access"
          loading={statsLoading}
        />
        <StatCard
          icon={Eye}
          iconBg="bg-cyan-100"
          iconColor="text-cyan-600"
          label="Chỉ xem"
          value={stats?.active_view_only}
          sub="view only"
          loading={statsLoading}
        />
        <StatCard
          icon={UserX}
          iconBg="bg-gray-100"
          iconColor="text-gray-500"
          label="Đã thu hồi"
          value={stats?.revoked_count}
          sub="revoked"
          loading={statsLoading}
        />
      </div>

      {/* Explanation */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700 space-y-1">
            <p className="font-medium">Quy tắc phân quyền:</p>
            <p>• <strong>Giám đốc, Phó GĐ, Trợ lý BGĐ, Trưởng phòng, Phó phòng</strong> — Tự động có <strong>Toàn quyền</strong>, không cần cấp</p>
            <p>• <strong>Nhân viên</strong> — Cần được Ban Giám đốc cấp quyền từ trang này</p>
            <p>• <strong>Toàn quyền</strong> = Xem + Tạo + Sửa + Xóa · <strong>Chỉ xem</strong> = Chỉ xem danh sách</p>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* SEARCH & FILTER                                                  */}
      {/* ================================================================ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm nhân viên..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Hiện đã thu hồi
          </label>

          <button
            onClick={() => { fetchData(); fetchStats(); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-gray-600 text-sm hover:bg-gray-100 rounded-lg border border-gray-200"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* ACCESS TABLE                                                     */}
      {/* ================================================================ */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500 mr-3" />
            <span className="text-gray-500">Đang tải danh sách...</span>
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-red-600 font-medium">{error}</p>
          </div>
        ) : accessList.length === 0 ? (
          <div className="text-center py-16">
            <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-700 mb-2">
              {search ? 'Không tìm thấy' : 'Chưa cấp quyền cho ai'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Bấm "Cấp quyền mới" để thêm nhân viên vào module Mua hàng
            </p>
            <button
              onClick={() => setShowGrantModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              <ShieldPlus className="w-4 h-4" />
              Cấp quyền mới
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Nhân viên</th>
                  <th className="px-4 py-3 font-medium">Phòng ban</th>
                  <th className="px-4 py-3 font-medium">Mức quyền</th>
                  <th className="px-4 py-3 font-medium">Người cấp</th>
                  <th className="px-4 py-3 font-medium">Ngày cấp</th>
                  <th className="px-4 py-3 font-medium">Ghi chú</th>
                  <th className="px-4 py-3 font-medium text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {accessList.map((access, index) => {
                  const levelConfig = ACCESS_LEVEL_CONFIG[access.access_level] || ACCESS_LEVEL_CONFIG.full;
                  const LevelIcon = levelConfig.icon;

                  return (
                    <tr
                      key={access.id}
                      className={`border-b border-gray-50 transition-colors ${
                        access.is_active
                          ? 'hover:bg-blue-50/30'
                          : 'bg-gray-50/50 opacity-60'
                      }`}
                    >
                      {/* # */}
                      <td className="px-4 py-3.5 text-gray-400 text-xs">{index + 1}</td>

                      {/* Nhân viên */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">
                            {access.employee?.full_name?.charAt(0) || '?'}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {access.employee?.full_name || '—'}
                            </p>
                            <p className="text-xs text-gray-400">
                              {access.employee?.code || ''} · {access.employee?.position_name || ''}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Phòng ban */}
                      <td className="px-4 py-3.5">
                        <span className="text-sm text-gray-600">
                          {access.employee?.department_name || '—'}
                        </span>
                      </td>

                      {/* Mức quyền */}
                      <td className="px-4 py-3.5">
                        {access.is_active ? (
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${levelConfig.bg} ${levelConfig.color}`}>
                            <LevelIcon className="w-3 h-3" />
                            {levelConfig.label}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                            <X className="w-3 h-3" />
                            Đã thu hồi
                          </span>
                        )}
                      </td>

                      {/* Người cấp */}
                      <td className="px-4 py-3.5 text-sm text-gray-600">
                        {access.granter?.full_name || '—'}
                      </td>

                      {/* Ngày cấp */}
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-gray-500">
                          {formatDateTime(access.granted_at)}
                        </span>
                        {!access.is_active && access.revoked_at && (
                          <p className="text-xs text-red-400 mt-0.5">
                            Thu hồi: {formatDateTime(access.revoked_at)}
                          </p>
                        )}
                      </td>

                      {/* Ghi chú */}
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-gray-400 italic max-w-[150px] truncate block" title={access.notes || ''}>
                          {access.notes || '—'}
                        </span>
                      </td>

                      {/* Thao tác */}
                      <td className="px-4 py-3.5 text-center">
                        {access.is_active && (
                          <div className="flex items-center justify-center gap-1">
                            {/* Toggle level */}
                            <button
                              onClick={() => handleToggleLevel(access)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title={`Đổi thành ${access.access_level === 'full' ? 'Chỉ xem' : 'Toàn quyền'}`}
                            >
                              {access.access_level === 'full' ? (
                                <Eye className="w-4 h-4" />
                              ) : (
                                <Edit3 className="w-4 h-4" />
                              )}
                            </button>

                            {/* Revoke */}
                            <button
                              onClick={() => handleRevoke(access)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Thu hồi quyền"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* GRANT MODAL                                                      */}
      {/* ================================================================ */}
      <GrantAccessModal
        isOpen={showGrantModal}
        onClose={() => setShowGrantModal(false)}
        onSuccess={handleGrantSuccess}
        grantedBy={user?.employee_id ?? undefined}
      />
    </div>
  );
};

// ============================================================================
// STAT CARD COMPONENT
// ============================================================================

const StatCard: React.FC<{
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  value?: number;
  sub: string;
  loading: boolean;
}> = ({ icon: Icon, iconBg, iconColor, label, value, sub, loading }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-4">
    <div className="flex items-center gap-2 mb-2">
      <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>
      <span className="text-xs text-gray-500 font-medium">{label}</span>
    </div>
    {loading ? (
      <div className="h-7 bg-gray-100 rounded animate-pulse" />
    ) : (
      <>
        <p className="text-lg font-bold text-gray-900">{value ?? 0}</p>
        <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
      </>
    )}
  </div>
);

export default AccessManagementPage;