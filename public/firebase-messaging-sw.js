/* ==========================================================================
   Service worker nhận THÔNG BÁO ĐẨY cho bản PWA (cài qua Chrome).
   Chrome giữ service worker này sống kể cả khi đã đóng tab → máy hỏng vẫn kêu.
   Ưu điểm so với APK: Chrome là app hệ thống, không bị hãng máy bóp/force-stop.
   ========================================================================== */
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyDDVgEcc6cLDwbQYszWMKotXCbQ1F2GeSI',
  authDomain: 'huyanh-b2b.firebaseapp.com',
  projectId: 'huyanh-b2b',
  storageBucket: 'huyanh-b2b.firebasestorage.app',
  messagingSenderId: '731946898681',
  appId: '1:731946898681:web:9e32d263483fef5c4bbe28',
})

const messaging = firebase.messaging()

// Tin CHỈ CÓ data (không có khối notification) → tự dựng thông báo.
// Tin có sẵn notification thì trình duyệt tự hiện, không cần vào đây.
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {}
  const title = payload.notification?.title || (d.severity === 'do' ? '🔴 Máy đang DỪNG' : '🟡 Máy báo bất thường')
  self.registration.showNotification(title, {
    body: payload.notification?.body || d.body || 'Có sự cố máy — bấm để xem',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: d.severity === 'do' ? [200, 100, 200] : [150],
    requireInteraction: d.severity === 'do',   // máy dừng: giữ tới khi bấm
    tag: d.issue_id ? `mi-${d.issue_id}` : 'machine-issue',
    data: { url: d.url || '/m/yeu-cau' },
  })
})

// Chạm thông báo → mở hàng chờ nhận việc (dùng lại tab đang mở nếu có)
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/m/yeu-cau'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes('/m/') && 'focus' in c) { c.navigate(target); return c.focus() }
      }
      return clients.openWindow(target)
    }),
  )
})
