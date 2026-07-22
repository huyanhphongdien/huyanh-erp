// ============================================================================
// webPush — THÔNG BÁO ĐẨY cho bản PWA (cài qua Chrome "Thêm vào màn hình chính")
//
// Vì sao cần: APK cài ngoài hay bị hãng máy (Xiaomi/Oppo/Vivo) force-stop →
// Android chặn sạch FCM. Chrome là app hệ thống, không bị bóp như vậy, nên
// bản PWA thường nhận thông báo ĐÁNG TIN HƠN trên máy khó tính.
//
// Token web lưu chung bảng device_tokens (platform='web') → edge function
// machine-issue-notify gửi được luôn, KHÔNG phải sửa backend.
// ============================================================================
import { Capacitor } from '@capacitor/core'
import { supabase } from '../lib/supabase'

const FIREBASE_CFG = {
  apiKey: 'AIzaSyDDVgEcc6cLDwbQYszWMKotXCbQ1F2GeSI',
  authDomain: 'huyanh-b2b.firebaseapp.com',
  projectId: 'huyanh-b2b',
  storageBucket: 'huyanh-b2b.firebasestorage.app',
  messagingSenderId: '731946898681',
  appId: '1:731946898681:web:9e32d263483fef5c4bbe28',
}
// Khoá VAPID công khai — an toàn khi để trong mã client (thiết kế để lộ ra ngoài)
const VAPID_KEY = 'BA1OZLFfKjBxeiB5Ai__OOYg2DmgQ--Tb3tfONEFU8B_WuVn783KaLRH0CtXy9oPbe7E1fwL6yIVkxTi_YdQAmc'

export type WebPushState = 'unsupported' | 'native' | 'denied' | 'default' | 'granted'

/** Trạng thái hiện tại để UI biết có cần hiện nút "Bật thông báo" không. */
export function webPushState(): WebPushState {
  if (Capacitor.isNativePlatform()) return 'native'
  if (typeof window === 'undefined') return 'unsupported'
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  return Notification.permission as WebPushState
}

async function saveWebToken(token: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { data: emp } = await supabase.from('employees').select('id').eq('user_id', user.id).maybeSingle()
  if (!emp?.id) return
  // onConflict theo TOKEN → 1 người dùng được nhiều máy (điện thoại + máy bảng…)
  await supabase.from('device_tokens').upsert(
    { employee_id: emp.id, token, platform: 'web', updated_at: new Date().toISOString() },
    { onConflict: 'token' },
  )
  console.log('[WebPush] Đã lưu token web cho employee', emp.id)
}

/**
 * Đăng ký nhận đẩy trên web.
 * @param askPermission true = được phép hiện hộp xin quyền (gọi từ cú bấm của user).
 *                      false = chỉ đăng ký khi user ĐÃ cho phép từ trước.
 */
export async function initWebPush(askPermission = false): Promise<WebPushState> {
  const st = webPushState()
  if (st === 'native' || st === 'unsupported' || st === 'denied') return st
  if (st === 'default' && !askPermission) return st

  try {
    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return perm as WebPushState
    }

    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    await navigator.serviceWorker.ready

    const { initializeApp, getApps, getApp } = await import('firebase/app')
    const { getMessaging, getToken, onMessage, isSupported } = await import('firebase/messaging')
    if (!(await isSupported())) return 'unsupported'

    const app = getApps().some(a => a.name === 'ops-web')
      ? getApp('ops-web')
      : initializeApp(FIREBASE_CFG, 'ops-web')
    const messaging = getMessaging(app)

    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg })
    if (token) {
      localStorage.setItem('web_fcm_token', token)
      await saveWebToken(token)
    }

    // Đang mở app mà có tin → tự dựng thông báo (trình duyệt không tự hiện khi tab active)
    onMessage(messaging, (payload) => {
      const d: any = payload.data || {}
      const urgent = d.severity === 'do'
      reg.showNotification(payload.notification?.title || (urgent ? '🔴 Máy đang DỪNG' : '🟡 Máy báo bất thường'), {
        body: payload.notification?.body || 'Có sự cố máy — bấm để xem',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: urgent ? [200, 100, 200] : [150],
        tag: d.issue_id ? `mi-${d.issue_id}` : 'machine-issue',
        data: { url: d.url || '/m/yeu-cau' },
      } as NotificationOptions)
    })

    return 'granted'
  } catch (e) {
    console.error('[WebPush] lỗi:', e)
    return webPushState()
  }
}

/** Gỡ đăng ký (khi đăng xuất) — xoá token web khỏi DB. */
export async function clearWebToken() {
  const token = localStorage.getItem('web_fcm_token')
  if (!token) return
  try { await supabase.from('device_tokens').delete().eq('token', token) } catch { /* bỏ qua */ }
  localStorage.removeItem('web_fcm_token')
}
