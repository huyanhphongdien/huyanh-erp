// ============================================================================
// SPRINT 3.2 — Performance Config Page
// File: src/pages/performance/PerformanceConfigPage.tsx
// Mục đích: UI cho HR/BGD chỉnh weights + thresholds qua web
//   thay vì sửa code/SQL.
// Route: /performance/config (admin only — kiểm tra qua role/level)
// ============================================================================

import { useState, useEffect } from 'react';
import { Card, Button, message, Modal, Tooltip, Tag } from 'antd';
import { Save, RotateCcw, Info, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';

interface ConfigRow {
  config_key: string;
  config_value: any;
  description: string | null;
  updated_at: string;
}

const DEFAULTS: Record<string, any> = {
  formula_weights: { quality: 0.5, on_time: 0.2, volume: 0.2, difficulty: 0.1 },
  task_source_weights: { recurring: 0.5, self: 0.5, assigned: 1.0, project: 1.0 },
  difficulty_scores: { normal: 70, hard: 85, critical: 100 },
  grade_thresholds: { A: 90, B: 75, C: 60, D: 40 },
  attendance_weights: {
    base: 80, bonus_full_attendance: 10, bonus_no_late: 5,
    bonus_overtime_per_hour: 1, bonus_overtime_max: 5,
    penalty_absent: 10, penalty_late: 3, penalty_late_max: 15,
    penalty_early_leave: 2,
  },
  combined_weights: { task: 0.7, attendance: 0.3 },
};

const KEY_LABELS: Record<string, string> = {
  formula_weights: 'Trọng số 4 thành tố (final_score)',
  task_source_weights: 'Trọng số task theo nguồn (quality)',
  difficulty_scores: 'Điểm theo độ khó (difficulty_score)',
  grade_thresholds: 'Ngưỡng điểm xếp hạng (A/B/C/D/F)',
  attendance_weights: 'Trọng số chấm công (attendance_score)',
  combined_weights: 'Tỷ trọng kết hợp task+chấm công',
};

const KEY_HINTS: Record<string, string> = {
  formula_weights: 'Tổng phải = 1.0. Vd: quality 0.5 + on_time 0.2 + volume 0.2 + difficulty 0.1',
  task_source_weights: 'recurring/self thường thấp hơn (0.5) vì việc định kỳ; assigned/project cao (1.0)',
  difficulty_scores: 'normal=70 (mặc định), hard=85, critical=100. Tăng nếu muốn thưởng task khó nhiều hơn',
  grade_thresholds: 'A≥90, B≥75, C≥60, D≥40, F<40. Hạ ngưỡng nếu phân bố quá nghiêm',
  attendance_weights: 'base=80 + thưởng (đủ công, không trễ, OT approved) - phạt (vắng, trễ, về sớm). Cap [0,100]. ⚠️ OT chỉ tính khi approved',
  combined_weights: 'Tổng = 1.0. task 0.7 + attendance 0.3 (mặc định)',
};

export default function PerformanceConfigPage() {
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const { user } = useAuthStore();

  // Permission check: chỉ level ≤3 (BGD/Trợ lý) được edit
  const canEdit = (user as any)?.position_level != null && (user as any).position_level <= 3;

  useEffect(() => { loadConfigs(); }, []);

  async function loadConfigs() {
    setLoading(true);
    const { data, error } = await supabase
      .from('performance_config')
      .select('config_key, config_value, description, updated_at')
      .order('config_key');

    if (error) {
      message.error('Không tải được cấu hình: ' + error.message);
    } else {
      setConfigs(data || []);
      const initialEditing: Record<string, string> = {};
      (data || []).forEach(c => {
        initialEditing[c.config_key] = JSON.stringify(c.config_value, null, 2);
      });
      setEditing(initialEditing);
    }
    setLoading(false);
  }

  function validateValue(key: string, jsonStr: string): string | null {
    let parsed: any;
    try { parsed = JSON.parse(jsonStr); } catch { return 'JSON không hợp lệ'; }

    if (typeof parsed !== 'object' || parsed === null) return 'Phải là object';

    // Validation theo key
    if (key === 'formula_weights' || key === 'combined_weights') {
      const sum = Object.values(parsed).reduce((a: number, b: any) => a + Number(b), 0);
      if (Math.abs(sum - 1.0) > 0.001) {
        return `Tổng phải = 1.0 (đang ${sum.toFixed(3)})`;
      }
    }
    if (key === 'grade_thresholds') {
      const { A, B, C, D } = parsed;
      if (!(A > B && B > C && C > D)) return 'Phải A > B > C > D';
      if (A > 100 || D < 0) return 'Range phải [0, 100]';
    }
    if (key === 'difficulty_scores') {
      const { normal, hard, critical } = parsed;
      if (!(normal <= hard && hard <= critical)) return 'Phải normal ≤ hard ≤ critical';
    }
    return null;
  }

  function handleChange(key: string, value: string) {
    setEditing(prev => ({ ...prev, [key]: value }));
    const err = validateValue(key, value);
    setErrors(prev => ({ ...prev, [key]: err || '' }));
  }

  async function saveConfig(key: string) {
    const err = validateValue(key, editing[key]);
    if (err) { message.error('Validate fail: ' + err); return; }

    setSaving(key);
    const parsed = JSON.parse(editing[key]);
    const { error } = await supabase
      .from('performance_config')
      .update({
        config_value: parsed,
        updated_by: (user as any)?.employee_id || (user as any)?.id,
        updated_at: new Date().toISOString(),
      })
      .eq('config_key', key);

    setSaving(null);
    if (error) {
      message.error('Save fail: ' + error.message);
    } else {
      message.success(`Đã lưu ${KEY_LABELS[key] || key}. Snapshot tháng hiện tại sẽ tính lại tối nay 23:30.`);
      loadConfigs();
    }
  }

  function resetToDefault(key: string) {
    Modal.confirm({
      title: `Reset ${KEY_LABELS[key]} về mặc định?`,
      content: 'Giá trị hiện tại sẽ được thay bằng default. Bạn có chắc?',
      okText: 'Reset', cancelText: 'Hủy', okType: 'danger',
      onOk: () => {
        if (DEFAULTS[key]) {
          setEditing(prev => ({ ...prev, [key]: JSON.stringify(DEFAULTS[key], null, 2) }));
          setErrors(prev => ({ ...prev, [key]: '' }));
        }
      },
    });
  }

  if (loading) {
    return <div style={{ padding: 24 }}>Đang tải cấu hình...</div>;
  }

  if (!canEdit) {
    return (
      <div style={{ padding: 24 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#dc2626' }}>
            <AlertTriangle size={24} />
            <div>
              <h3 style={{ margin: 0 }}>Không có quyền truy cập</h3>
              <p style={{ margin: '4px 0 0', color: '#6b7280' }}>
                Chỉ Ban Giám đốc + Trợ lý BGD (level ≤3) mới có quyền chỉnh cấu hình hiệu suất.
                Bạn ở level {(user as any)?.position_level || '?'}.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 24 }}>Cấu hình Hiệu suất</h2>
        <p style={{ color: '#6b7280', marginTop: 4 }}>
          Chỉnh trọng số + ngưỡng cho công thức tính điểm. Snapshot tháng hiện tại sẽ tự tính lại tối nay 23:30.
          Tháng đã lock không bị ảnh hưởng.
        </p>
      </div>

      {configs.map(cfg => {
        const err = errors[cfg.config_key];
        const isModified = editing[cfg.config_key] !== JSON.stringify(cfg.config_value, null, 2);
        const isSaving = saving === cfg.config_key;

        return (
          <Card key={cfg.config_key} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{KEY_LABELS[cfg.config_key] || cfg.config_key}</h3>
                  <Tag style={{ fontFamily: 'Consolas, monospace', fontSize: 11 }}>{cfg.config_key}</Tag>
                  {isModified && <Tag color="orange">Chưa lưu</Tag>}
                </div>
                {KEY_HINTS[cfg.config_key] && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    <Info size={12} />
                    <span>{KEY_HINTS[cfg.config_key]}</span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Tooltip title="Reset về mặc định">
                  <Button icon={<RotateCcw size={14} />} size="small"
                    onClick={() => resetToDefault(cfg.config_key)} />
                </Tooltip>
                <Button type="primary" icon={<Save size={14} />} size="small"
                  loading={isSaving} disabled={!!err || !isModified}
                  onClick={() => saveConfig(cfg.config_key)}>
                  Lưu
                </Button>
              </div>
            </div>

            <textarea
              value={editing[cfg.config_key] || ''}
              onChange={e => handleChange(cfg.config_key, e.target.value)}
              style={{
                width: '100%', minHeight: 120,
                fontFamily: 'Consolas, monospace', fontSize: 13,
                padding: 8, border: `1px solid ${err ? '#dc2626' : '#d1d5db'}`,
                borderRadius: 6, resize: 'vertical',
              }}
            />
            {err && (
              <div style={{ color: '#dc2626', fontSize: 12, marginTop: 6 }}>
                ⚠️ {err}
              </div>
            )}
            {cfg.description && (
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                {cfg.description}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              Updated: {new Date(cfg.updated_at).toLocaleString('vi-VN')}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
