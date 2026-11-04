import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.example.starter',
  appName: 'Xổ Số Miền Nam',
  webDir: 'dist',
  backgroundColor: '#f8fafc',
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false,
      statsUrl: '',
      channelUrl: '',
    },
  },
}

export default config
