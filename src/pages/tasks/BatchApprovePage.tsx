// ============================================================================
// BATCH APPROVE PAGE - Phê duyệt nhanh hàng loạt
// File: src/pages/tasks/BatchApprovePage.tsx
// Huy Anh ERP System
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Table, Rate, Input, Button, Select, DatePicker, Badge, Space,
  message, Modal, Tag, Tooltip, Card, Typography, Spin, Empty,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckSquare, RefreshCw, AlertTriangle, ExternalLink,
} from 'lucide-react';
import dayjs from 'dayjs';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import { createEvaluation } from '../../services/evaluationService';
import { calculateRating } from '../../types/evaluation.types';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// ============================================================================
// TYPES
// ============================================================================

interface PendingTask {
  id: string;
  code: string;
  name: string;
  status: string;
  progress: number;
  self_score: number | null;
  completed_date: string | null;
  evaluation_status: string;
  assignee: {
    id: string;
    full_name: string;
    department_id: string | null;
  } | null;
  department: {
    id: string;
    name: string;
  } | null;
  // Local state for inline editing
  manager_score?: number;
  note?: string;
}

interface DepartmentOption {
  id: string;
  name: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

const BatchApprovePage: React.FC = () => {
  const { user } = useAuthStore();

  // Permission check
  const isAdmin = user?.role === 'admin';
  const isManager = (user?.position_level ?? 99) <= 5;
  const hasAccess = isAdmin || isManager;

  // Data state
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);

  // Selection
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // Filters
  const [filterDepartment, setFilterDepartment] = useState<string | undefined>(undefined);
  const [filterEmployee, setFilterEmployee] = useState<string | undefined>(undefined);
  const [filterDateRange, setFilterDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  // Batch action
  const [batchScore, setBatchScore] = useState<number>(4);

  // Inline edits: task_id -> { manager_score, note }
  const [inlineEdits, setInlineEdits] = useState<Record<string, { manager_score?: number; note?: string }>>({});

  // ============================================================================
  // FETCH DATA
  // ============================================================================

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase
        .from('tasks')
        .select(`
          id, code, name, status, progress, self_score, completed_date, evaluation_status,
          assignee:employees!tasks_assignee_id_fkey(id, full_name, department_id),
          department:departments!tasks_department_id_fkey(id, name)
        `)
        .eq('evaluation_status', 'pending_approval')
        .eq('status', 'finished')
        .order('completed_date', { ascending: false });

      // If manager (not admin), filter by their department
      if (!isAdmin && user.department_id) {
        query = query.eq('department_id', user.department_id);
      }

      const { data, error } = await query;
      if (error) throw error;

      const normalized = (data || []).map((t: any) => ({
        ...t,
        assignee: Array.isArray(t.assignee) ? t.assignee[0] : t.assignee,
        department: Array.isArray(t.department) ? t.department[0] : t.department,
      }));

      setTasks(normalized);
      setSelectedRowKeys([]);
      setInlineEdits({});
    } catch (err: any) {
      console.error('Error fetching pending tasks:', err);
      message.error('Lỗi tải danh sách công việc chờ duyệt');
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin]);

  const fetchDepartments = useCallback(async () => {
    const { data } = await supabase
      .from('departments')
      .select('id, name')
      .order('name');
    setDepartments(data || []);
  }, []);

  useEffect(() => {
    if (hasAccess) {
      fetchTasks();
      fetchDepartments();
    }
  }, [hasAccess, fetchTasks, fetchDepartments]);

  // ============================================================================
  // FILTERED DATA
  // ============================================================================

  const filteredTasks = useMemo(() => {
    let result = [...tasks];

    if (filterDepartment) {
      result = result.filter(t => t.department?.id === filterDepartment);
    }

    if (filterEmployee) {
      result = result.filter(t =>
        t.assignee?.full_name?.toLowerCase().includes(filterEmployee.toLowerCase())
      );
    }

    if (filterDateRange && filterDateRange[0] && filterDateRange[1]) {
      const start = filterDateRange[0].startOf('day');
      const end = filterDateRange[1].endOf('day');
      result = result.filter(t => {
        if (!t.completed_date) return false;
        const d = dayjs(t.completed_date);
        return d.isAfter(start) && d.isBefore(end);
      });
    }

    return result;
  }, [tasks, filterDepartment, filterEmployee, filterDateRange]);

  // Employee options for filter
  const employeeOptions = useMemo(() => {
    const map = new Map<string, string>();
    tasks.forEach(t => {
      if (t.assignee) {
        map.set(t.assignee.id, t.assignee.full_name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ value: id, label: name }));
  }, [tasks]);

  // ============================================================================
  // INLINE EDIT HANDLERS
  // ============================================================================

  const getManagerScore = (taskId: string, fallback?: number): number => {
    return inlineEdits[taskId]?.manager_score ?? fallback ?? 4;
  };

  const getNote = (taskId: string): string => {
    return inlineEdits[taskId]?.note ?? '';
  };

  const setManagerScore = (taskId: string, score: number) => {
    setInlineEdits(prev => ({
      ...prev,
      [taskId]: { ...prev[taskId], manager_score: score },
    }));
  };

  const setNote = (taskId: string, note: string) => {
    setInlineEdits(prev => ({
      ...prev,
      [taskId]: { ...prev[taskId], note },
    }));
  };

  // ============================================================================
  // APPROVE LOGIC
  // ============================================================================

  const approveTasks = async (taskIds: string[]) => {
    if (!user?.employee_id) {
      message.error('Không xác định được thông tin người dùng');
      return;
    }

    setApproving(true);
    let successCount = 0;
    let errorCount = 0;

    for (const taskId of taskIds) {
      try {
        const task = tasks.find(t => t.id === taskId);
        if (!task) continue;

        const managerScore = getManagerScore(taskId);
        const selfScore = task.self_score ?? managerScore;
        const note = getNote(taskId);

        // Calculate final_score = self_score × 40% + manager_score × 60%
        const finalScore = Math.round(selfScore * 0.4 + managerScore * 0.6);
        const starToPercent = managerScore * 20; // 1-5 stars → 20-100
        const rating = calculateRating(starToPercent);

        // 1. Insert into task_evaluations
        const { error: evalError } = await createEvaluation({
          task_id: taskId,
          employee_id: task.assignee?.id || '',
          evaluator_id: user.employee_id,
          score: finalScore,
          content: note || undefined,
        });

        if (evalError) {
          console.error('Evaluation insert error for task', taskId, evalError);
          // Continue anyway - evaluation might already exist
        }

        // 2. Insert into task_approvals
        const { error: approvalError } = await supabase
          .from('task_approvals')
          .insert({
            task_id: taskId,
            approver_id: user.employee_id,
            action: 'approved',
            approved_score: finalScore,
            original_score: selfScore,
            rating,
            comments: note || 'Phê duyệt nhanh hàng loạt',
          });

        if (approvalError) {
          console.error('Approval insert error for task', taskId, approvalError);
        }

        // 3. Update task evaluation_status + final_score
        const { error: updateError } = await supabase
          .from('tasks')
          .update({
            evaluation_status: 'approved',
            final_score: finalScore,
            self_score: selfScore,
          })
          .eq('id', taskId);

        if (updateError) throw updateError;

        // 4. Update self_evaluation status if exists
        await supabase
          .from('task_self_evaluations')
          .update({ status: 'approved', updated_at: new Date().toISOString() })
          .eq('task_id', taskId)
          .eq('status', 'pending');

        successCount++;
      } catch (err: any) {
        console.error('Error approving task:', taskId, err);
        errorCount++;
      }
    }

    setApproving(false);

    if (successCount > 0) {
      message.success(`Đã duyệt thành công ${successCount} công việc`);
    }
    if (errorCount > 0) {
      message.error(`Lỗi duyệt ${errorCount} công việc`);
    }

    // Refresh
    fetchTasks();
  };

  const handleApproveSelected = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('Chưa chọn công việc nào');
      return;
    }

    // Apply batch score to selected tasks that don't have individual scores
    const updatedEdits = { ...inlineEdits };
    selectedRowKeys.forEach(key => {
      const id = key as string;
      if (!updatedEdits[id]?.manager_score) {
        updatedEdits[id] = { ...updatedEdits[id], manager_score: batchScore };
      }
    });
    setInlineEdits(updatedEdits);

    approveTasks(selectedRowKeys as string[]);
  };

  const handleApproveAll = () => {
    if (filteredTasks.length === 0) {
      message.warning('Không có công việc nào để duyệt');
      return;
    }

    Modal.confirm({
      title: 'Xác nhận duyệt tất cả',
      content: `Bạn sắp duyệt tất cả ${filteredTasks.length} công việc với điểm manager: ${batchScore} sao. Hành động này không thể hoàn tác.`,
      okText: 'Duyệt tất cả',
      okButtonProps: { danger: true, style: { backgroundColor: '#1B4D3E', borderColor: '#1B4D3E' } },
      cancelText: 'Hủy',
      icon: <AlertTriangle className="w-5 h-5 text-orange-500" />,
      onOk: () => {
        // Apply batch score to all
        const updatedEdits = { ...inlineEdits };
        filteredTasks.forEach(t => {
          if (!updatedEdits[t.id]?.manager_score) {
            updatedEdits[t.id] = { ...updatedEdits[t.id], manager_score: batchScore };
          }
        });
        setInlineEdits(updatedEdits);

        approveTasks(filteredTasks.map(t => t.id));
      },
    });
  };

  // ============================================================================
  // TABLE COLUMNS
  // ============================================================================

  const columns: ColumnsType<PendingTask> = [
    {
      title: 'Mã CV',
      dataIndex: 'code',
      key: 'code',
      width: 110,
      render: (code: string) => (
        <Text strong style={{ color: '#1B4D3E', fontSize: 13 }}>{code}</Text>
      ),
    },
    {
      title: 'Tên công việc',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string, record: PendingTask) => (
        <a
          href={`/tasks/${record.id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#1B4D3E', fontWeight: 500 }}
        >
          {name} <ExternalLink size={12} style={{ display: 'inline', marginLeft: 4 }} />
        </a>
      ),
    },
    {
      title: 'Nhân viên',
      key: 'assignee',
      width: 160,
      render: (_: any, record: PendingTask) => (
        <Text>{record.assignee?.full_name || '—'}</Text>
      ),
      filters: employeeOptions.map(e => ({ text: e.label, value: e.value })),
      onFilter: (value, record) => record.assignee?.id === value,
    },
    {
      title: 'Phòng ban',
      key: 'department',
      width: 140,
      render: (_: any, record: PendingTask) => (
        <Tag color="blue">{record.department?.name || '—'}</Tag>
      ),
    },
    {
      title: 'Hoàn thành',
      dataIndex: 'completed_date',
      key: 'completed_date',
      width: 120,
      render: (date: string | null) =>
        date ? dayjs(date).format('DD/MM/YYYY') : '—',
      sorter: (a, b) => {
        const da = a.completed_date ? new Date(a.completed_date).getTime() : 0;
        const db = b.completed_date ? new Date(b.completed_date).getTime() : 0;
        return da - db;
      },
    },
    {
      title: 'NV tự chấm',
      dataIndex: 'self_score',
      key: 'self_score',
      width: 140,
      align: 'center',
      render: (score: number | null) =>
        score != null ? (
          <Rate disabled value={score} style={{ fontSize: 14 }} />
        ) : (
          <Text type="secondary">Chưa chấm</Text>
        ),
    },
    {
      title: 'Manager chấm',
      key: 'manager_score',
      width: 150,
      align: 'center',
      render: (_: any, record: PendingTask) => (
        <Rate
          value={getManagerScore(record.id)}
          onChange={(val) => setManagerScore(record.id, val)}
          style={{ fontSize: 14 }}
        />
      ),
    },
    {
      title: 'Ghi chú',
      key: 'note',
      width: 180,
      render: (_: any, record: PendingTask) => (
        <Input
          size="small"
          placeholder="Ghi chú..."
          value={getNote(record.id)}
          onChange={(e) => setNote(record.id, e.target.value)}
          style={{ fontSize: 13 }}
        />
      ),
    },
  ];

  // ============================================================================
  // PERMISSION GATE
  // ============================================================================

  if (!hasAccess) {
    return (
      <div className="p-8 text-center">
        <Empty
          description="Bạn không có quyền truy cập trang này. Chỉ quản lý (cấp phó phòng trở lên) hoặc admin mới được phép."
        />
      </div>
    );
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  const selectedCount = selectedRowKeys.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckSquare size={24} style={{ color: '#1B4D3E' }} />
            <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
              Phê duyệt công việc
            </Title>
            <Badge
              count={filteredTasks.length}
              style={{ backgroundColor: '#1B4D3E' }}
              overflowCount={999}
            />
          </div>
          <Button
            icon={<RefreshCw size={14} />}
            onClick={fetchTasks}
            loading={loading}
          >
            Tải lại
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border-b px-6 py-3">
        <Space size="middle" wrap>
          <Select
            placeholder="Phòng ban"
            allowClear
            style={{ width: 200 }}
            value={filterDepartment}
            onChange={setFilterDepartment}
            options={departments.map(d => ({ value: d.id, label: d.name }))}
            disabled={!isAdmin}
          />
          <Select
            placeholder="Nhân viên"
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: 200 }}
            value={filterEmployee}
            onChange={(val) => setFilterEmployee(val)}
            options={employeeOptions}
          />
          <RangePicker
            placeholder={['Từ ngày', 'Đến ngày']}
            format="DD/MM/YYYY"
            value={filterDateRange}
            onChange={(dates) => setFilterDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
          />
        </Space>
      </div>

      {/* Table */}
      <div className="px-6 py-4" style={{ paddingBottom: selectedCount > 0 ? 80 : 16 }}>
        <Spin spinning={loading}>
          <Card bodyStyle={{ padding: 0 }}>
            <Table<PendingTask>
              rowKey="id"
              columns={columns}
              dataSource={filteredTasks}
              rowSelection={{
                selectedRowKeys,
                onChange: setSelectedRowKeys,
              }}
              pagination={{
                pageSize: 50,
                showSizeChanger: true,
                pageSizeOptions: ['20', '50', '100'],
                showTotal: (total) => `Tổng ${total} công việc`,
              }}
              scroll={{ x: 1100 }}
              size="middle"
              locale={{
                emptyText: (
                  <Empty
                    description="Không có công việc chờ duyệt"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                ),
              }}
            />
          </Card>
        </Spin>
      </div>

      {/* Sticky Bottom Action Bar */}
      {filteredTasks.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            backgroundColor: '#fff',
            borderTop: '2px solid #1B4D3E',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 -4px 12px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <Text strong>
              <CheckSquare size={14} style={{ display: 'inline', marginRight: 4 }} />
              Đã chọn: <span style={{ color: '#1B4D3E' }}>{selectedCount}</span> công việc
            </Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text>Manager chấm:</Text>
              <Rate
                value={batchScore}
                onChange={setBatchScore}
                style={{ fontSize: 16 }}
              />
            </div>
          </div>

          <Space>
            <Button
              type="primary"
              size="large"
              disabled={selectedCount === 0 || approving}
              loading={approving}
              onClick={handleApproveSelected}
              style={{
                backgroundColor: '#1B4D3E',
                borderColor: '#1B4D3E',
              }}
            >
              Duyệt đã chọn ({selectedCount})
            </Button>
            <Tooltip title="Duyệt tất cả công việc hiện tại">
              <Button
                size="large"
                danger
                disabled={approving}
                onClick={handleApproveAll}
              >
                Duyệt tất cả ({filteredTasks.length})
              </Button>
            </Tooltip>
          </Space>
        </div>
      )}
    </div>
  );
};

export default BatchApprovePage;
