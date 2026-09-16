import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getAuth } from 'firebase/auth'

// A fresh checkout never contacts an external service. Cloud mode is opt-in.
export const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE !== 'false'

const configuredFirebase = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}
const missingFields = Object.entries(configuredFirebase)
  .filter(([, value]) => !value || /^(REPLACE|YOUR_|example|demo-)/i.test(value))
  .map(([key]) => key)
export const cloudConfigurationError = !IS_DEMO_MODE && missingFields.length
  ? `Firebase の設定が必要です: ${missingFields.join(', ')} (.env.example を参照)`
  : null

// Initializing these SDK objects is local. Demo paths never subscribe, authenticate,
// upload or query; the .invalid domains below are intentionally non-operational.
const app = initializeApp(IS_DEMO_MODE || cloudConfigurationError ? {
  apiKey: 'demo-only-invoice-public-key',
  authDomain: 'invoice-demo.invalid',
  projectId: 'demo-invoice-public',
  storageBucket: 'invoice-demo.invalid',
  appId: 'demo-invoice-public',
} : configuredFirebase)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const auth = getAuth(app)

export function requireCloudUser() {
  if (IS_DEMO_MODE) throw new Error('デモモードではクラウド処理を実行できません。')
  if (cloudConfigurationError) throw new Error(cloudConfigurationError)
  if (!auth.currentUser) throw new Error('ログインが必要です。')
  return auth.currentUser
}

export default app
