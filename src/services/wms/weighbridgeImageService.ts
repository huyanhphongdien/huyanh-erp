// ============================================================================
// FILE: src/services/wms/weighbridgeImageService.ts
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P7 — Trạm cân xe — Quản lý ảnh
// MÔ TẢ: Upload/delete ảnh chụp xe tại trạm cân (biển số, hàng, camera)
//         Lưu file trong Supabase Storage bucket "weighbridge-images"
//         Lưu metadata trong bảng weighbridge_images
// ============================================================================

import { supabase } from '../../lib/supabase'
import type { WeighbridgeImage } from './wms.types'

// ============================================================================
// CONSTANTS
// ============================================================================

const BUCKET = 'weighbridge-images'

export type CaptureType = 'front' | 'rear' | 'top' | 'plate' | 'cargo'

// ============================================================================
// UPLOAD
// ============================================================================

/**
 * Upload ảnh từ File object (input file / camera capture)
 * → Upload lên Supabase Storage
 * → Lưu record vào weighbridge_images
 */
async function uploadImage(
  ticketId: string,
  file: File,
  captureType: CaptureType
): Promise<WeighbridgeImage> {
  // 1. Tạo unique filename
  const timestamp = Date.now()
  const ext = file.name.split('.').pop() || 'jpg'
  const filePath = `${ticketId}/${captureType}_${timestamp}.${ext}`

  // 2. Upload lên Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadError) throw uploadError

  // 3. Lấy public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(filePath)

  const imageUrl = urlData.publicUrl

  // 4. Lưu metadata vào DB
  const { data, error } = await supabase
    .from('weighbridge_images')
    .insert({
      ticket_id: ticketId,
      image_url: imageUrl,
      capture_type: captureType,
      captured_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Upload ảnh từ base64 string (camera snapshot từ RTSP stream)
 */
async function uploadBase64(
  ticketId: string,
  base64Data: string,
  captureType: CaptureType,
  mimeType = 'image/jpeg'
): Promise<WeighbridgeImage> {
  // 1. Convert base64 → Blob
  const byteString = atob(base64Data.split(',').pop() || base64Data)
  const ab = new ArrayBuffer(byteString.length)
  const ia = new Uint8Array(ab)
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i)
  }
  const blob = new Blob([ab], { type: mimeType })

  // 2. Tạo filename
  const timestamp = Date.now()
  const ext = mimeType.split('/').pop() || 'jpg'
  const filePath = `${ticketId}/${captureType}_${timestamp}.${ext}`

  // 3. Upload
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, blob, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadError) throw uploadError

  // 4. Public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(filePath)

  // 5. Save metadata
  const { data, error } = await supabase
    .from('weighbridge_images')
    .insert({
      ticket_id: ticketId,
      image_url: urlData.publicUrl,
      capture_type: captureType,
      captured_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Lưu ảnh từ URL bên ngoài (không upload Storage, chỉ lưu URL)
 * Dùng khi capture snapshot từ IP Camera qua API bên ngoài
 */
async function saveExternalUrl(
  ticketId: string,
  imageUrl: string,
  captureType: CaptureType
): Promise<WeighbridgeImage> {
  const { data, error } = await supabase
    .from('weighbridge_images')
    .insert({
      ticket_id: ticketId,
      image_url: imageUrl,
      capture_type: captureType,
      captured_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// ============================================================================
// READ
// ============================================================================

/**
 * Lấy tất cả ảnh của 1 phiếu cân
 */
async function getByTicket(ticketId: string): Promise<WeighbridgeImage[]> {
  const { data, error } = await supabase
    .from('weighbridge_images')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('captured_at', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Lấy ảnh theo loại (VD: lấy tất cả ảnh biển số)
 */
async function getByType(
  ticketId: string,
  captureType: CaptureType
): Promise<WeighbridgeImage[]> {
  const { data, error } = await supabase
    .from('weighbridge_images')
    .select('*')
    .eq('ticket_id', ticketId)
    .eq('capture_type', captureType)
    .order('captured_at', { ascending: false })

  if (error) throw error
  return data || []
}

// ============================================================================
// DELETE
// ============================================================================

/**
 * Xóa 1 ảnh — xóa cả file Storage + record DB
 */
async function deleteImage(imageId: string): Promise<void> {
  // 1. Lấy image URL để tìm file path
  const { data: image, error: fetchError } = await supabase
    .from('weighbridge_images')
    .select('image_url')
    .eq('id', imageId)
    .single()

  if (fetchError) throw fetchError

  // 2. Xóa file từ Storage (nếu là Supabase URL)
  if (image?.image_url?.includes(BUCKET)) {
    try {
      // Extract path từ URL: .../weighbridge-images/ticketId/file.jpg
      const urlParts = image.image_url.split(`${BUCKET}/`)
      if (urlParts[1]) {
        await supabase.storage.from(BUCKET).remove([urlParts[1]])
      }
    } catch (storageError) {
      console.warn('Failed to delete storage file:', storageError)
      // Vẫn tiếp tục xóa DB record
    }
  }

  // 3. Xóa DB record
  const { error } = await supabase
    .from('weighbridge_images')
    .delete()
    .eq('id', imageId)

  if (error) throw error
}

/**
 * Xóa tất cả ảnh của 1 phiếu cân
 */
async function deleteAllByTicket(ticketId: string): Promise<void> {
  const images = await getByTicket(ticketId)
  
  // Xóa files từ Storage
  const storagePaths = images
    .filter(img => img.image_url.includes(BUCKET))
    .map(img => {
      const parts = img.image_url.split(`${BUCKET}/`)
      return parts[1]
    })
    .filter(Boolean)

  if (storagePaths.length > 0) {
    try {
      await supabase.storage.from(BUCKET).remove(storagePaths)
    } catch (storageError) {
      console.warn('Failed to delete storage files:', storageError)
    }
  }

  // Xóa DB records (CASCADE từ ticket sẽ tự xóa, nhưng gọi explicit cho chắc)
  const { error } = await supabase
    .from('weighbridge_images')
    .delete()
    .eq('ticket_id', ticketId)

  if (error) throw error
}

// ============================================================================
// EXPORT
// ============================================================================

export const weighbridgeImageService = {
  uploadImage,
  uploadBase64,
  saveExternalUrl,
  getByTicket,
  getByType,
  deleteImage,
  deleteAllByTicket,
}

export default weighbridgeImageService