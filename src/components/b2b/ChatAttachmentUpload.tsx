// ============================================================================
// CHAT ATTACHMENT UPLOAD — Component upload file/image cho chat
// File: src/components/b2b/chat/ChatAttachmentUpload.tsx
// Phase: E1.2.4
// ============================================================================

import { useState, useRef } from 'react'
import {
  Upload,
  Modal,
  Button,
  Space,
  Image,
  Progress,
  Typography,
  message,
} from 'antd'
import type { UploadFile, RcFile } from 'antd/es/upload/interface'
import {
  PlusOutlined,
  FileImageOutlined,
  FileOutlined,
  DeleteOutlined,
  EyeOutlined,
  InboxOutlined,
} from '@ant-design/icons'
import {
  chatAttachmentService,
  ALLOWED_MIME_TYPES,
} from '../../services/b2b/chatAttachmentService'
import { ChatAttachment } from '../../services/b2b/chatMessageService'

const { Dragger } = Upload
const { Text } = Typography

// ============================================
// TYPES
// ============================================

interface ChatAttachmentUploadProps {
  roomId: string
  open: boolean
  onClose: () => void
  onUploadComplete: (attachments: ChatAttachment[], messageType: 'image' | 'file') => void
  maxFiles?: number
  acceptTypes?: 'image' | 'file' | 'all'
}

interface UploadingFile {
  uid: string
  name: string
  status: 'uploading' | 'done' | 'error'
  percent: number
  attachment?: ChatAttachment
  error?: string
}

// ============================================
// CONSTANTS
// ============================================

const ACCEPT_MAP = {
  image: 'image/jpeg,image/png,image/gif,image/webp',
  file: '.pdf,.doc,.docx,.xls,.xlsx,.txt',
  all: ALLOWED_MIME_TYPES.join(','),
}

// ============================================
// COMPONENT
// ============================================

const ChatAttachmentUpload = ({
  roomId,
  open,
  onClose,
  onUploadComplete,
  maxFiles = 5,
  acceptTypes = 'all',
}: ChatAttachmentUploadProps) => {
  const [fileList, setFileList] = useState<UploadingFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  // ============================================
  // HANDLERS
  // ============================================

  const handleBeforeUpload = (file: RcFile, files: RcFile[]): boolean => {
    // Check max files
    if (fileList.length + files.length > maxFiles) {
      message.error(`Tối đa ${maxFiles} file`)
      return false
    }

    // Check file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      message.error(`Loại file không được hỗ trợ: ${file.name}`)
      return false
    }

    // Check file size (50MB)
    if (file.size > 50 * 1024 * 1024) {
      message.error(`File quá lớn: ${file.name}. Tối đa 50MB`)
      return false
    }

    // Add to list with uploading status
    const newFile: UploadingFile = {
      uid: file.uid,
      name: file.name,
      status: 'uploading',
      percent: 0,
    }

    setFileList((prev) => [...prev, newFile])

    // Start upload
    uploadFile(file, file.uid)

    return false // Prevent default upload
  }

  const uploadFile = async (file: RcFile, uid: string) => {
    try {
      const attachment = await chatAttachmentService.uploadFile(
        roomId,
        file,
        (percent: number) => {
          setFileList((prev) =>
            prev.map((f) => (f.uid === uid ? { ...f, percent } : f))
          )
        }
      )

      setFileList((prev) =>
        prev.map((f) =>
          f.uid === uid
            ? { ...f, status: 'done', percent: 100, attachment }
            : f
        )
      )
    } catch (error) {
      console.error('Upload error:', error)
      setFileList((prev) =>
        prev.map((f) =>
          f.uid === uid
            ? { ...f, status: 'error', error: 'Upload thất bại' }
            : f
        )
      )
    }
  }

  const handleRemove = (uid: string) => {
    const file = fileList.find((f) => f.uid === uid)
    
    // Delete from storage if already uploaded
    if (file?.attachment?.path) {
      chatAttachmentService.deleteFile(file.attachment.path).catch(console.error)
    }

    setFileList((prev) => prev.filter((f) => f.uid !== uid))
  }

  const handlePreview = (file: UploadingFile) => {
    if (file.attachment?.url && chatAttachmentService.isImage(file.attachment.fileType)) {
      setPreviewImage(file.attachment.url)
    }
  }

  const handleSend = () => {
    const successFiles = fileList.filter((f) => f.status === 'done' && f.attachment)
    
    if (successFiles.length === 0) {
      message.warning('Chưa có file nào được upload')
      return
    }

    const attachments = successFiles.map((f) => f.attachment!)
    
    // Determine message type
    const allImages = attachments.every((a) => chatAttachmentService.isImage(a.fileType))
    const messageType = allImages ? 'image' : 'file'

    onUploadComplete(attachments, messageType)
    handleClose()
  }

  const handleClose = () => {
    // Cleanup uploaded files that weren't sent
    fileList.forEach((f) => {
      if (f.attachment?.path) {
        chatAttachmentService.deleteFile(f.attachment.path).catch(console.error)
      }
    })
    
    setFileList([])
    onClose()
  }

  // ============================================
  // RENDER
  // ============================================

  const isUploading = fileList.some((f) => f.status === 'uploading')
  const hasFiles = fileList.length > 0
  const completedCount = fileList.filter((f) => f.status === 'done').length

  return (
    <>
      <Modal
        title="Đính kèm tệp"
        open={open}
        onCancel={handleClose}
        width={520}
        footer={
          <Space>
            <Button onClick={handleClose}>Hủy</Button>
            <Button
              type="primary"
              onClick={handleSend}
              disabled={isUploading || completedCount === 0}
              loading={isUploading}
            >
              Gửi {completedCount > 0 ? `(${completedCount})` : ''}
            </Button>
          </Space>
        }
      >
        {/* Upload Area */}
        {fileList.length < maxFiles && (
          <Dragger
            multiple
            accept={ACCEPT_MAP[acceptTypes]}
            showUploadList={false}
            beforeUpload={handleBeforeUpload}
            style={{ marginBottom: hasFiles ? 16 : 0 }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">
              Kéo thả file vào đây hoặc click để chọn
            </p>
            <p className="ant-upload-hint">
              Hỗ trợ: Hình ảnh, PDF, Word, Excel. Tối đa {maxFiles} file, 50MB/file
            </p>
          </Dragger>
        )}

        {/* File List */}
        {hasFiles && (
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {fileList.map((file) => (
              <div
                key={file.uid}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 12px',
                  marginBottom: 8,
                  borderRadius: 8,
                  backgroundColor: '#fafafa',
                  border: '1px solid #f0f0f0',
                }}
              >
                {/* Thumbnail / Icon */}
                <div style={{ marginRight: 12 }}>
                  {file.attachment && chatAttachmentService.isImage(file.attachment.fileType) ? (
                    <Image
                      src={file.attachment.url}
                      width={48}
                      height={48}
                      style={{ objectFit: 'cover', borderRadius: 4 }}
                      preview={false}
                      onClick={() => handlePreview(file)}
                    />
                  ) : (
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 4,
                        backgroundColor: '#e6f7ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <FileOutlined style={{ fontSize: 24, color: '#1677ff' }} />
                    </div>
                  )}
                </div>

                {/* File Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    strong
                    ellipsis
                    style={{ display: 'block', marginBottom: 4 }}
                  >
                    {file.name}
                  </Text>
                  
                  {file.status === 'uploading' && (
                    <Progress
                      percent={file.percent}
                      size="small"
                      showInfo={false}
                      style={{ marginBottom: 0 }}
                    />
                  )}
                  
                  {file.status === 'done' && file.attachment && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {chatAttachmentService.formatFileSize(file.attachment.fileSize)}
                    </Text>
                  )}
                  
                  {file.status === 'error' && (
                    <Text type="danger" style={{ fontSize: 12 }}>
                      {file.error}
                    </Text>
                  )}
                </div>

                {/* Actions */}
                <Space>
                  {file.status === 'done' && file.attachment && 
                   chatAttachmentService.isImage(file.attachment.fileType) && (
                    <Button
                      type="text"
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => handlePreview(file)}
                    />
                  )}
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemove(file.uid)}
                    disabled={file.status === 'uploading'}
                  />
                </Space>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Image Preview */}
      <Image
        style={{ display: 'none' }}
        preview={{
          visible: !!previewImage,
          src: previewImage || '',
          onVisibleChange: (visible) => {
            if (!visible) setPreviewImage(null)
          },
        }}
      />
    </>
  )
}

export default ChatAttachmentUpload