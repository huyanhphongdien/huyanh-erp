// ============================================================================
// Capacitor Push (FCM Android) — chép từ huyanh-b2b-portal, đổi sang device_tokens
// Chạy trong app native "Huy Anh Ops". Trên web = no-op.
// ============================================================================
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { LocalNotifications } from '@capacitor/local-notifications'
import { supabase } from '../lib/supabase'

// Lưu FCM token vào DB theo employee của user đang đăng nhập
export async function syncFcmTokenToDb() {
  const token = localStorage.getItem('fcm_token')
  if (!token) return
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: emp } = await supabase
      .from('employees').select('id').eq('user_id', user.id).maybeSingle()
    if (!emp?.id) return
    await supabase.from('device_tokens').upsert(
      { employee_id: emp.id, token, platform: 'android', updated_at: new Date().toISOString() },
      { onConflict: 'employee_id,platform' }
    )
    console.log('[Push] Đã lưu FCM token cho employee', emp.id)
  } catch (err) {
    console.error('[Push] Lưu token lỗi:', err)
  }
}

let _inited = false // chống đăng ký listener 2 lần → khỏi bắn thông báo đúp

// Gọi 1 lần khi app mount
export async function initCapacitorPush() {
  const isNative = Capacitor.isNativePlatform()
  if (!isNative || _inited) return
  _inited = true
  try {
    // Kênh HIGH: heads-up "trồi" ra + chuông + rung, kể cả khi app đóng
    try {
      await PushNotifications.createChannel({
        id: 'machine_alerts', name: 'Máy hỏng', description: 'Cảnh báo máy dừng / bất thường',
        importance: 5, visibility: 1, sound: 'default', vibration: true, lights: true, lightColor: '#C1291F',
      })
    } catch { /* máy cũ không hỗ trợ channel — bỏ qua */ }

    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== 'granted') return
    await PushNotifications.register()

    PushNotifications.addListener('registration', async (token) => {
      console.log('[Push] FCM token:', token.value)
      localStorage.setItem('fcm_token', token.value)
      await syncFcmTokenToDb()
    })
    PushNotifications.addListener('registrationError', (e) => console.error('[Push] reg error:', e))

    // Foreground: hiện local notification (kèm chuông) trên kênh HIGH
    PushNotifications.addListener('pushNotificationReceived', (n) => {
      LocalNotifications.schedule({
        notifications: [{
          id: Math.floor(Math.random() * 100000),
          title: n.title || 'Huy Anh Ops',
          body: n.body || 'Có thông báo mới',
          channelId: 'machine_alerts',
          sound: 'default',
          extra: n.data,
        }],
      })
    })

    // Chạm thông báo → điều hướng theo data.url (vd /m/yeu-cau)
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const url = (action.notification.data as any)?.url
      if (url && typeof url === 'string') {
        try { window.location.assign(url) } catch { /* ignore */ }
      }
    })
  } catch (err) {
    console.error('[Push] init lỗi:', err)
  }
}
