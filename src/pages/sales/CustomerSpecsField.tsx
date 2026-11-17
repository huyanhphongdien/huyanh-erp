// ============================================================================
// CustomSpecsFormList — ô "Yêu cầu kỹ thuật riêng" của khách hàng (Form.List "Thông số / Giá trị")
// File: src/pages/sales/CustomerSpecsField.tsx
//
// Audit 17/11/2026: form cũ ở trang Khách hàng là TextArea bắt gõ JSON tay (lưu thành chuỗi trong cột
// jsonb → trang chi tiết vỡ thành từng ký tự, mở sửa lại hiện "[object Object]"), còn modal sửa ở trang
// chi tiết KHÔNG có ô này → 2 form sửa khách lệch nhau. Nay cả 2 modal dùng CHUNG component này;
// chuyển đổi dòng ⇄ jsonb ở salesCustomerService (customSpecsToRows / rowsToCustomSpecs).
// (Đặt tạm ở pages/sales vì cụm này chỉ sở hữu pages/sales + services/sales — nên dời về components/sales.)
// ============================================================================

import { Form, Input, Button, Row, Col } from 'antd'
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons'

export function CustomSpecsFormList({ name = 'custom_specs' }: { name?: string }) {
  return (
    <Form.Item label="Yêu cầu kỹ thuật riêng" style={{ marginBottom: 0 }}>
      <Form.List name={name}>
        {(fields, { add, remove }) => (
          <>
            {fields.map(({ key, name: rowName }) => (
              <Row key={key} gutter={8} align="middle">
                <Col span={11}>
                  <Form.Item name={[rowName, 'key']} rules={[{ required: true, message: 'Nhập tên thông số' }]}>
                    <Input placeholder="Thông số — VD: PRI tối thiểu" />
                  </Form.Item>
                </Col>
                <Col span={11}>
                  <Form.Item name={[rowName, 'value']}>
                    <Input placeholder="Giá trị — VD: 60" />
                  </Form.Item>
                </Col>
                <Col span={2} style={{ paddingBottom: 24 }}>
                  <Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(rowName)} />
                </Col>
              </Row>
            ))}
            <Form.Item>
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ key: '', value: '' })} block>
                Thêm thông số
              </Button>
            </Form.Item>
          </>
        )}
      </Form.List>
    </Form.Item>
  )
}

export default CustomSpecsFormList
