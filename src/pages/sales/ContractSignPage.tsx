// ============================================================================
// CONTRACT SIGN PAGE (Trung / Huy — Trình ký)
// File: src/pages/sales/ContractSignPage.tsx
//
// URL: /sales/contracts/sign
//
// Mục đích: Trung (trunglxh@) hoặc Huy (huylv@) nhận queue HĐ status='approved'
// (đã Phú LV/Minh LD duyệt + nhập bank) → tải SC/PI → in ra → ký + đóng dấu
// → scan thành PDF → upload lên → markSigned (status='signed').
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Table,
  Tag,
  Button,
  Drawer,
  Space,
  Typography,
  Descriptions,
  Upload,
  Row,
  Col,
  message,
  Modal,
  Empty,
  Breadcrumb,
  Alert,
  Divider,
  Input,
} from 'antd'
import type { UploadFile, UploadProps } from 'antd/es/upload/interface'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  EyeOutlined,
  ReloadOutlined,
  HomeOutlined,
  EditOutlined,
  InboxOutlined,
  RollbackOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../../stores/authStore'
import {
  salesContractWorkflowService,
  type SalesOrderContract,
} from '../../services/sales/salesContractWorkflowService'
import {
  downloadContract,
  deriveKind,
} from '../../services/sales/contractGeneratorService'

const { Title, Text } = Typography
const { TextArea } = Input

export default function ContractSignPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<SalesOrderContract[]>([])

  // Drawer state
  const [active, setActive] = useState<SalesOrderContract | null>(null)
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [signing, setSigning] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [sendingBack, setSendingBack] = useState(false)
  const [docLoading, setDocLoading] = useState<'SC' | 'PI' | 'BOTH' | null>(null)

  const isAllowedSigner = useMemo(
    () => salesContractWorkflowService.isAllowedSigner(user?.email),
    [user],
  )

  const signerLabel = useMemo(() => {
    const email = user?.email?.toLowerCase()
    if (email === 'trunglxh@huyanhrubber.com') return 'Mr. Trung (Trình ký)'
    if (email === 'huylv@huyanhrubber.com') return 'Mr. Huy (Trình ký)'
    return user?.email || '—'
  }, [user])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await salesContractWorkflowService.listForSigning()
      setRows(data)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      message.error(`Không tải được queue: ${msg}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openSign = (row: SalesOrderContract) => {
    setActive(row)
    setFileList([])
  }

  const closeSign = () => {
    setActive(null)
    setFileList([])
  }

  const handleDownload = async (type: 'SC' | 'PI' | 'BOTH') => {
    if (!active) return
    setDocLoading(type)
    try {
      const fd = active.form_data || {}
      const orderId = active.sales_order_id  // auto-heal buyer_address từ DB
      if (type === 'BOTH') {
        await downloadContract(
          deriveKind(fd.incoterm || 'FOB', 'SC'),
          fd,
          `${fd.contract_no || 'contract'}_SC.docx`,
          orderId,
        )
        await downloadContract(
          deriveKind(fd.incoterm || 'FOB', 'PI'),
          fd,
          `${fd.contract_no || 'contract'}_PI.docx`,
          orderId,
        )
      } else {
        await downloadContract(
          deriveKind(fd.incoterm || 'FOB', type),
          fd,
          `${fd.contract_no || 'contract'}_${type}.docx`,
          orderId,
        )
      }
      message.success('Đã tải .docx — in ra ký + đóng dấu rồi scan upload lại')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      message.error(`Tải .docx thất bại: ${msg}`)
    } finally {
      setDocLoading(null)
    }
  }

  const uploadProps: UploadProps = {
    accept: 'application/pdf',
    maxCount: 1,
    fileList,
    beforeUpload: (file) => {
      if (file.type !== 'application/pdf') {
        message.error('Chỉ chấp nhận file PDF')
        return Upload.LIST_IGNORE
      }
      if (file.size > 20 * 1024 * 1024) {
        message.error('File quá lớn (>20MB)')
        return Upload.LIST_IGNORE
      }
      setFileList([file as UploadFile])
      return false // Không auto-upload, đợi user bấm "Xác nhận đã ký"
    },
    onRemove: () => {
      setFileList([])
    },
  }

  /** Trung/Huy bấm "Xác nhận đã duyệt" — HĐ OK, sẵn sàng in ký.
   *  Không đổi status, không upload PDF — chỉ set timestamp confirm. */
  const handleConfirmReady = () => {
    if (!active) return
    Modal.confirm({
      title: '✅ Xác nhận HĐ đã duyệt — sẵn sàng in ký',
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>
            Bạn xác nhận thông tin HĐ <strong>{active.form_data?.contract_no}</strong> đã ĐÚNG
            (bao gồm bank info Phú LV nhập).
          </p>
          <Alert
            type="info"
            showIcon
            message="Sau khi xác nhận"
            description={<>
              • Có thể tải SC/PI .docx → in ra → ký + đóng dấu (ai cũng làm được, không cần chữ ký số)<br />
              • Scan PDF có chữ ký HA → upload vào folder <strong>"HĐ HA đã ký"</strong><br />
              • Khi KH gửi lại bản đã ký 2 bên → upload <strong>"HĐ FINAL ký 2 bên"</strong>
            </>}
            style={{ marginTop: 8 }}
          />
        </div>
      ),
      okText: 'Xác nhận đã duyệt',
      cancelText: 'Quay lại',
      okButtonProps: { type: 'primary', style: { background: '#1B4D3E' } },
      width: 520,
      onOk: async () => {
        setConfirming(true)
        try {
          const updated = await salesContractWorkflowService.confirmReadyToSign(active.id)
          message.success(`Đã xác nhận HĐ ${active.form_data?.contract_no}`)
          setActive(updated)  // refresh drawer với signer_confirmed_at
          void refresh()
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          message.error(`Xác nhận thất bại: ${msg}`)
        } finally {
          setConfirming(false)
        }
      },
    })
  }

  /** Trung/Huy bấm "Trả lại Phú LV" — phát hiện sai (bank/giá/...). */
  const handleSendBack = () => {
    if (!active) return
    let reason = ''
    Modal.confirm({
      title: '🔁 Trả lại Phú LV để review lại',
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>
            HĐ <strong>{active.form_data?.contract_no}</strong> sẽ chuyển{' '}
            <Tag color="orange">reviewing</Tag>. Phú LV/Minh LD nhận thông báo + email.
          </p>
          <p style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
            Lý do trả lại <span style={{ color: '#cf1322' }}>*</span>
          </p>
          <TextArea
            rows={3}
            placeholder="VD: Bank account sai số TK, số HĐ trùng đơn khác, giá USD không khớp với deal đã chốt..."
            onChange={(e) => { reason = e.target.value }}
          />
        </div>
      ),
      okText: 'Trả lại',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      width: 520,
      onOk: async () => {
        if (!reason.trim()) {
          message.error('Cần nhập lý do trả lại')
          throw new Error('missing reason')
        }
        setSendingBack(true)
        try {
          await salesContractWorkflowService.sendBackToReview(active.id, reason.trim())
          message.success('Đã trả lại Phú LV review')
          closeSign()
          void refresh()
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          message.error(`Trả lại thất bại: ${msg}`)
        } finally {
          setSendingBack(false)
        }
      },
    })
  }

  const handleConfirmSigned = async () => {
    if (!active) return
    if (fileList.length === 0) {
      message.error('Cần upload PDF đã ký + đóng dấu')
      return
    }
    const file = fileList[0].originFileObj as File | undefined
    if (!file) {
      message.error('Không đọc được file PDF')
      return
    }
    Modal.confirm({
      title: 'Xác nhận đã ký + đóng dấu',
      content: (
        <div>
          <div>
            HĐ <strong>{active.form_data?.contract_no}</strong> sẽ chuyển sang{' '}
            <Tag color="success">signed</Tag>. File PDF <strong>{file.name}</strong> sẽ được upload và lưu lại.
          </div>
          <Alert
            type="warning"
            showIcon
            message="Hành động này không thể undo"
            style={{ marginTop: 8 }}
          />
        </div>
      ),
      okText: 'Xác nhận ký',
      cancelText: 'Quay lại',
      okButtonProps: { type: 'primary', style: { background: '#1B4D3E' } },
      onOk: async () => {
        setSigning(true)
        try {
          // 1) Upload PDF lên Storage
          const path = await salesContractWorkflowService.uploadSignedPdf(
            active.id,
            active.revision_no,
            file,
          )
          // 2) markSigned → status='signed' + signer_id + signed_pdf_url
          await salesContractWorkflowService.markSigned(active.id, path)
          message.success(`Đã ký HĐ ${active.form_data?.contract_no}`)
          closeSign()
          void refresh()
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          message.error(`Ký thất bại: ${msg}`)
        } finally {
          setSigning(false)
        }
      },
    })
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <Breadcrumb
        items={[
          { href: '/', title: <HomeOutlined /> },
          { title: 'Sales' },
          { title: 'Hợp đồng — Queue Trình ký' },
        ]}
        style={{ marginBottom: 16 }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0, color: '#1B4D3E' }}>
          <EditOutlined /> Queue Trình ký HĐ
        </Title>
        <Tag color={isAllowedSigner ? 'green' : 'orange'}>{signerLabel}</Tag>
        <Button
          icon={<ReloadOutlined />}
          onClick={refresh}
          loading={loading}
          style={{ marginLeft: 'auto' }}
        >
          Tải lại
        </Button>
      </div>

      {!isAllowedSigner && (
        <Alert
          type="warning"
          showIcon
          message="Bạn không nằm trong danh sách được phép ký HĐ."
          description={`Email được phép: ${salesContractWorkflowService.ALLOWED_SIGNER_EMAILS.join(', ')}. Bạn đang đăng nhập với ${user?.email || '—'}. RLS DB sẽ chặn upload PDF.`}
          style={{ marginBottom: 16 }}
        />
      )}

      <Card>
        <Table
          dataSource={rows}
          rowKey="id"
          loading={loading}
          locale={{ emptyText: <Empty description="Chưa có HĐ nào chờ ký" /> }}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          columns={[
            {
              title: 'Số HĐ',
              dataIndex: ['form_data', 'contract_no'],
              key: 'contract_no',
              width: 140,
              render: (v: string, r: SalesOrderContract) => (
                <Space direction="vertical" size={2}>
                  <Text strong>{v || '—'}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    rev #{r.revision_no}
                  </Text>
                </Space>
              ),
            },
            {
              title: 'Khách hàng',
              dataIndex: ['form_data', 'buyer_name'],
              key: 'buyer_name',
              ellipsis: true,
            },
            {
              title: 'Grade',
              dataIndex: ['form_data', 'grade'],
              key: 'grade',
              width: 100,
              render: (v: string) => <Tag color="blue">{v || '—'}</Tag>,
            },
            {
              title: 'Tấn / Cont',
              key: 'qty',
              width: 110,
              render: (_: unknown, r: SalesOrderContract) => (
                <Text>
                  {r.form_data?.quantity || '—'} MT
                  <br />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {r.form_data?.containers} {r.form_data?.cont_type}
                  </Text>
                </Text>
              ),
            },
            {
              title: 'Giá trị USD',
              dataIndex: ['form_data', 'amount'],
              key: 'amount',
              width: 140,
              align: 'right',
              render: (v: string) => <Text strong>${v || '—'}</Text>,
            },
            {
              title: 'Kiểm tra duyệt',
              key: 'reviewed_at',
              width: 200,
              render: (_: unknown, r: SalesOrderContract) => (
                <Space direction="vertical" size={2}>
                  <Text style={{ fontSize: 12 }}>
                    {r.reviewer_employee?.full_name || '—'}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {r.reviewed_at
                      ? new Date(r.reviewed_at).toLocaleString('vi-VN')
                      : '—'}
                  </Text>
                </Space>
              ),
            },
            {
              title: 'Action',
              key: 'action',
              width: 100,
              fixed: 'right',
              render: (_: unknown, r: SalesOrderContract) => (
                <Button
                  type="primary"
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => openSign(r)}
                  style={{ background: '#1B4D3E' }}
                >
                  Mở
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        title={
          <Space>
            <EditOutlined />
            <span>Ký HĐ {active?.form_data?.contract_no}</span>
            <Tag color="warning">Chờ ký</Tag>
            <Tag>rev #{active?.revision_no}</Tag>
          </Space>
        }
        open={!!active}
        onClose={closeSign}
        width={720}
        extra={
          active && (
            <Space>
              {/* Step 1: Chưa xác nhận → 2 nút chọn */}
              {!active.signer_confirmed_at && (
                <>
                  <Button
                    danger
                    icon={<RollbackOutlined />}
                    onClick={handleSendBack}
                    loading={sendingBack}
                  >
                    Trả lại Phú LV
                  </Button>
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    onClick={handleConfirmReady}
                    loading={confirming}
                    style={{ background: '#1B4D3E' }}
                  >
                    Xác nhận đã duyệt
                  </Button>
                </>
              )}
              {/* Step 2: Đã xác nhận → nút upload FINAL khi có file */}
              {active.signer_confirmed_at && (
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={handleConfirmSigned}
                  loading={signing}
                  disabled={fileList.length === 0}
                  style={{ background: '#1B4D3E' }}
                >
                  Đánh dấu FINAL (KH đã ký lại)
                </Button>
              )}
            </Space>
          )
        }
      >
        {active && (
          <>
            {/* Step 1: Quy trình review */}
            {!active.signer_confirmed_at ? (
              <Alert
                type="info"
                showIcon
                message="Bước 1: Review thông tin HĐ"
                description={
                  <ol style={{ marginBottom: 0, paddingLeft: 20 }}>
                    <li>Xem kỹ thông tin bên dưới (KH, grade, giá, bank info Phú LV nhập)</li>
                    <li>Tải SC/PI .docx → kiểm tra format</li>
                    <li><strong>OK</strong> → bấm "✅ Xác nhận đã duyệt" — cho phép in HĐ</li>
                    <li><strong>Sai</strong> → bấm "🔁 Trả lại Phú LV" với lý do — Phú LV sẽ review lại</li>
                  </ol>
                }
                style={{ marginBottom: 16 }}
              />
            ) : (
              <Alert
                type="success"
                showIcon
                message={`✅ Đã xác nhận lúc ${new Date(active.signer_confirmed_at).toLocaleString('vi-VN')}`}
                description={
                  <ol style={{ marginBottom: 0, paddingLeft: 20 }}>
                    <li>Tải SC/PI .docx → in ra giấy → ký + đóng dấu HA (ai cũng làm được)</li>
                    <li>Scan bản HA ký → upload vào folder "<strong>HĐ HA đã ký</strong>" (tab Hợp đồng)</li>
                    <li>Gửi cho KH duyệt → KH ký lại + scan PDF FINAL gửi về</li>
                    <li>Upload PDF FINAL của KH bên dưới → bấm "Đánh dấu FINAL"</li>
                  </ol>
                }
                style={{ marginBottom: 16 }}
              />
            )}

            <Card size="small" style={{ marginBottom: 16 }} title="Tóm tắt HĐ">
              <Descriptions size="small" column={2} bordered>
                <Descriptions.Item label="Số HĐ">
                  {active.form_data?.contract_no || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Ngày HĐ">
                  {active.form_data?.contract_date || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Buyer" span={2}>
                  <strong>{active.form_data?.buyer_name}</strong>
                  <br />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {active.form_data?.buyer_address}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="Grade">
                  <Tag color="blue">{active.form_data?.grade}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Incoterm">
                  <Tag>{active.form_data?.incoterm}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Tấn">
                  {active.form_data?.quantity}
                </Descriptions.Item>
                <Descriptions.Item label="Giá USD/MT">
                  {active.form_data?.unit_price}
                </Descriptions.Item>
                <Descriptions.Item label="Tổng USD" span={2}>
                  <strong>${active.form_data?.amount}</strong>
                </Descriptions.Item>
                {active.form_data?.extra_terms && (
                  <Descriptions.Item label="📌 Other Conditions" span={2}>
                    <div style={{
                      padding: 8, background: '#e6f4ff', border: '1px solid #91caff',
                      borderRadius: 6, whiteSpace: 'pre-wrap', fontSize: 12, color: '#1677ff',
                    }}>
                      {active.form_data.extra_terms}
                    </div>
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="Bank (Kiểm tra nhập)" span={2}>
                  <div style={{ fontSize: 12 }}>
                    {active.form_data?.bank_account_name} —{' '}
                    {active.form_data?.bank_account_no}
                    <br />
                    {active.form_data?.bank_full_name}
                    <br />
                    SWIFT {active.form_data?.bank_swift}
                  </div>
                </Descriptions.Item>
                <Descriptions.Item label="Người duyệt" span={2}>
                  {active.reviewer_employee?.full_name || '—'} lúc{' '}
                  {active.reviewed_at
                    ? new Date(active.reviewed_at).toLocaleString('vi-VN')
                    : '—'}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Divider>{active.signer_confirmed_at ? 'Bước 1 · Tải HĐ ra in (ai cũng làm được)' : 'Tải HĐ để review'}</Divider>
            <Space.Compact block style={{ marginBottom: 16 }}>
              <Button
                icon={<DownloadOutlined />}
                loading={docLoading === 'SC'}
                onClick={() => handleDownload('SC')}
                style={{ flex: 1 }}
              >
                Tải SC
              </Button>
              <Button
                icon={<DownloadOutlined />}
                loading={docLoading === 'PI'}
                onClick={() => handleDownload('PI')}
                style={{ flex: 1 }}
              >
                Tải PI
              </Button>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                loading={docLoading === 'BOTH'}
                onClick={() => handleDownload('BOTH')}
                style={{ flex: 1.2, background: '#1B4D3E' }}
              >
                Tải SC + PI
              </Button>
            </Space.Compact>

            {/* Step 2: Upload FINAL — CHỈ hiện sau khi đã xác nhận */}
            {active.signer_confirmed_at && (
              <>
                <Divider>Bước 2 · Upload PDF FINAL (KH đã ký lại — 2 bên)</Divider>
                <Alert
                  type="info"
                  showIcon
                  message="Quy trình"
                  description={<>
                    File <strong>HĐ HA đã ký</strong> (1 bên) → upload vào tab "Hợp đồng" → folder
                    "<strong>✍️ HĐ HA đã ký</strong>" (không cần đánh dấu trạng thái).<br />
                    File <strong>HĐ FINAL</strong> (KH ký lại, 2 bên) → upload ở đây để đánh dấu HĐ
                    chuyển sang trạng thái <Tag color="success">signed</Tag>.
                  </>}
                  style={{ marginBottom: 12 }}
                />
                <Upload.Dragger {...uploadProps} style={{ marginBottom: 8 }}>
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">
                    Kéo file PDF FINAL (KH ký lại) vào đây hoặc bấm chọn
                  </p>
                  <p className="ant-upload-hint">
                    PDF có chữ ký + đóng dấu CỦA CẢ 2 BÊN. &lt; 20MB.
                  </p>
                </Upload.Dragger>
                {fileList.length > 0 && (
                  <Alert
                    type="success"
                    showIcon
                    message={`Đã chọn: ${fileList[0].name} (${((fileList[0].size || 0) / 1024).toFixed(0)} KB)`}
                    style={{ marginTop: 8 }}
                  />
                )}
              </>
            )}
          </>
        )}
      </Drawer>
    </div>
  )
}
