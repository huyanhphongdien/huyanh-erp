// ============================================================================
// Nén ảnh trước khi upload — 0.6
// Ảnh chụp điện thoại ~2-8MB → resize + JPEG ~300KB. Lý do chính KHÔNG phải
// tiền lưu trữ mà là SÓNG YẾU ở trạm cân/khu lò làm upload rớt.
//
// AN TOÀN: chỉ nén ẢNH tĩnh; PDF/Word/video/gif → giữ nguyên. Mọi lỗi nén →
// trả về file gốc (KHÔNG bao giờ chặn upload).
// ============================================================================

export async function compressImage(
  file: File,
  opts: { maxDim?: number; quality?: number } = {}
): Promise<File> {
  const { maxDim = 1600, quality = 0.72 } = opts

  // Chỉ nén ảnh tĩnh — bỏ qua gif động, PDF, Word, video…
  if (!file.type.startsWith('image/')) return file
  if (file.type === 'image/gif') return file

  try {
    const bitmap = await createImageBitmap(file)
    let width = bitmap.width
    let height = bitmap.height
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height)
      width = Math.round(width * scale)
      height = Math.round(height * scale)
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close?.(); return file }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    )
    // Nén không lợi (ảnh đã nhỏ) → giữ gốc
    if (!blob || blob.size >= file.size) return file

    const baseName = file.name.replace(/\.(png|jpe?g|webp|heic|heif|bmp)$/i, '')
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file // lỗi nén → giữ gốc, tuyệt đối không chặn upload
  }
}
