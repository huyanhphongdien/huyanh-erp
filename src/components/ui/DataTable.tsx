/**
 * DataTable Component
 * Wrapper cho Ant Design Table với cấu hình mặc định
 * Bao gồm: pagination, sorting, empty state, loading
 */

import React from 'react';
import { Table, Empty, Card, Input, Space, Button, Dropdown, Alert } from 'antd';
import type { TableProps, TablePaginationConfig } from 'antd';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import {
  SearchOutlined,
  ReloadOutlined,
  DownloadOutlined,
  SettingOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { colors } from '../../config/antdTheme';
import { dichLoiHeThong } from '../../utils/dichLoiHeThong';

// ==========================================
// TYPES
// ==========================================
export interface DataTableProps<T> extends Omit<TableProps<T>, 'title'> {
  /** Title của table */
  title?: React.ReactNode;
  /** Subtitle */
  subtitle?: string;
  /** Search placeholder */
  searchPlaceholder?: string;
  /** Search value (controlled) */
  searchValue?: string;
  /** Search onChange */
  onSearch?: (value: string) => void;
  /** Show search box */
  showSearch?: boolean;
  /** Show refresh button */
  showRefresh?: boolean;
  /** Refresh handler */
  onRefresh?: () => void;
  /** Show export button */
  showExport?: boolean;
  /** Export handler */
  onExport?: () => void;
  /** Extra actions */
  extra?: React.ReactNode;
  /** Wrap trong Card */
  wrapInCard?: boolean;
  /** Card props */
  cardProps?: React.ComponentProps<typeof Card>;
  /** Empty description */
  emptyText?: string;
  /** Alias for emptyText */
  emptyMessage?: string;
  /** Custom empty component */
  emptyComponent?: React.ReactNode;
  /** Default page size */
  defaultPageSize?: number;
  /** Page size options */
  pageSizeOptions?: number[];
  /** Show total in pagination */
  showTotal?: boolean;
  /** Sticky header */
  stickyHeader?: boolean;
  /** Max height for scroll */
  maxHeight?: number;
  /** Alias for dataSource */
  data?: T[];
  /** Alias for loading */
  isLoading?: boolean;
  /**
   * Lỗi của lần tải (Error | object Supabase — vd `error` của useQuery). Có lỗi thì KHÔNG hiện chữ "trống"
   * (emptyText) mà hiện khối "Không tải được dữ liệu" + Thử lại — mất mạng/RLS không bị đọc thành "chưa có ai".
   */
  error?: unknown;
  /** Nút "Thử lại" trong khối lỗi (vd `refetch` của useQuery) */
  onRetry?: () => void;
}

// ==========================================
// DATA TABLE COMPONENT
// ==========================================
function DataTable<T extends object>({
  title,
  subtitle,
  searchPlaceholder = 'Tìm kiếm...',
  searchValue,
  onSearch,
  showSearch = true,
  showRefresh = false,
  onRefresh,
  showExport = false,
  onExport,
  extra,
  wrapInCard = true,
  cardProps,
  emptyText: emptyTextProp,
  emptyMessage,
  emptyComponent,
  defaultPageSize = 10,
  pageSizeOptions = [10, 20, 50, 100],
  showTotal = true,
  stickyHeader = false,
  maxHeight,
  columns,
  pagination,
  loading: loadingProp,
  isLoading,
  data,
  dataSource: dataSourceProp,
  locale,
  scroll,
  error,
  onRetry,
  ...tableProps
}: DataTableProps<T>) {
  const emptyText = emptyTextProp || emptyMessage || 'Không có dữ liệu';
  const loading = loadingProp ?? isLoading;
  const dataSource = dataSourceProp ?? data;
  // State
  const [internalSearch, setInternalSearch] = React.useState('');
  const searchVal = searchValue ?? internalSearch;
  
  // Pagination config
  const paginationConfig: TablePaginationConfig | false = pagination === false 
    ? false 
    : {
        defaultPageSize,
        pageSizeOptions,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: showTotal 
          ? (total, range) => `${range[0]}-${range[1]} / ${total} mục`
          : undefined,
        ...pagination,
      };
  
  // Scroll config
  const scrollConfig = {
    x: 'max-content' as const,
    ...(maxHeight && { y: maxHeight }),
    ...scroll,
  };
  
  // Empty state — lỗi xét TRƯỚC trống: lỗi tải thì không bao giờ hiện "Chưa có …"
  const emptyState = error ? (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description="Không tải được dữ liệu"
      style={{ padding: '40px 0' }}
    />
  ) : emptyComponent || (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={emptyText}
      style={{ padding: '40px 0' }}
    />
  );

  // Khối lỗi phía trên bảng (vẫn giữ dữ liệu cũ nếu lần tải trước đã có)
  const errorBlock = error ? (
    <Alert
      type="error"
      showIcon
      style={{ marginBottom: 12 }}
      title="Không tải được dữ liệu"
      description={dichLoiHeThong(error, 'Có lỗi khi tải')}
      action={onRetry ? (
        <Button size="small" icon={<ReloadOutlined />} onClick={onRetry}>
          Thử lại
        </Button>
      ) : undefined}
    />
  ) : null;
  
  // Toolbar
  const renderToolbar = () => {
    if (!showSearch && !showRefresh && !showExport && !extra) {
      return null;
    }
    
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 16,
        flexWrap: 'wrap',
        gap: 12,
      }}>
        {/* Left: Search */}
        <div style={{ flex: 1, minWidth: 200, maxWidth: 400 }}>
          {showSearch && (
            <Input
              placeholder={searchPlaceholder}
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              value={searchVal}
              onChange={(e) => {
                const val = e.target.value;
                setInternalSearch(val);
                onSearch?.(val);
              }}
              allowClear
              style={{ width: '100%' }}
            />
          )}
        </div>
        
        {/* Right: Actions */}
        <Space>
          {showRefresh && (
            <Button
              icon={<ReloadOutlined />}
              onClick={onRefresh}
              loading={loading as boolean}
            >
              Làm mới
            </Button>
          )}
          {showExport && (
            <Button
              icon={<DownloadOutlined />}
              onClick={onExport}
            >
              Xuất Excel
            </Button>
          )}
          {extra}
        </Space>
      </div>
    );
  };
  
  // Header
  const renderHeader = () => {
    if (!title && !subtitle) return null;
    
    return (
      <div style={{ marginBottom: 16 }}>
        {title && (
          <div style={{ 
            fontSize: 18, 
            fontWeight: 600, 
            color: colors.textPrimary,
          }}>
            {title}
          </div>
        )}
        {subtitle && (
          <div style={{ 
            fontSize: 13, 
            color: colors.textSecondary,
            marginTop: 4,
          }}>
            {subtitle}
          </div>
        )}
      </div>
    );
  };
  
  // Table content
  const tableContent = (
    <>
      {renderHeader()}
      {renderToolbar()}
      {errorBlock}
      <Table<T>
        columns={columns}
        dataSource={dataSource}
        pagination={paginationConfig}
        loading={loading}
        scroll={scrollConfig}
        locale={{
          emptyText: emptyState,
          ...locale,
        }}
        style={{
          // Sticky header styles
          ...(stickyHeader && {
            // Table header will be sticky
          }),
        }}
        {...tableProps}
      />
    </>
  );
  
  // Wrap in card if needed
  if (wrapInCard) {
    return (
      <Card
        style={{
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
        }}
        styles={{
          body: { padding: 20 },
        }}
        {...cardProps}
      >
        {tableContent}
      </Card>
    );
  }
  
  return tableContent;
}

// ==========================================
// TABLE UTILITIES
// (formatNumber / formatCurrency 'VNĐ' / formatDate cũ đã gỡ 17/11/2026 — 0 nơi import, lại cạnh tranh với
//  nguồn định dạng chung src/utils/format.ts: fmtNum / fmtVnd / fmtVndCompact / fmtDate / fmtDateTime)
// ==========================================

/** Create sorter for column */
export const createSorter = <T,>(key: keyof T) => (a: T, b: T) => {
  const aVal = a[key];
  const bVal = b[key];
  
  if (typeof aVal === 'number' && typeof bVal === 'number') {
    return aVal - bVal;
  }
  if (typeof aVal === 'string' && typeof bVal === 'string') {
    return aVal.localeCompare(bVal, 'vi');
  }
  return 0;
};

/** Highlight search text */
export const highlightText = (text: string, search: string) => {
  if (!search) return text;
  
  const parts = text.split(new RegExp(`(${search})`, 'gi'));
  return parts.map((part, i) => 
    part.toLowerCase() === search.toLowerCase() 
      ? <mark key={i} style={{ background: '#fff3cd', padding: 0 }}>{part}</mark>
      : part
  );
};

export default DataTable;
