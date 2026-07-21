import type { CapacitorConfig } from '@capacitor/cli'

// ============================================================================
// App Android "Huy Anh Ops" — vận hành sản xuất (thợ bảo trì/điện)
// Chép mẫu từ huyanh-b2b-portal. Dùng LẠI Firebase project huyanh-b2b (khoá FCM
// đã có sẵn trong env Supabase chung). Nạp web live từ huyanhrubber.vn.
// ============================================================================
const config: CapacitorConfig = {
  appId: 'vn.huyanhrubber.qlsx',
  appName: 'Huy Anh Ops',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Nạp web LIVE — web đổi thì app tự cập nhật, khỏi build lại APK.
    url: 'https://huyanhrubber.vn',
    cleartext: false,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0F5132',
      showSpinner: true,
      spinnerColor: '#52C41A',
      androidScaleType: 'CENTER_CROP',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    StatusBar: {
      backgroundColor: '#0F5132',
      style: 'LIGHT',
    },
  },
}

export default config
