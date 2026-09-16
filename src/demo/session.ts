import { IS_DEMO_MODE, requireCloudUser } from '../config/firebase'

/** Bind an asynchronous operation to the exact signed-in user that started it. */
export interface DataSession {
  readonly uid: string | null
  assertActive(): void
}

export function captureDataSession(): DataSession {
  if (IS_DEMO_MODE) return { uid: null, assertActive: () => {} }
  const user = requireCloudUser()
  return {
    uid: user.uid,
    assertActive() {
      const current = requireCloudUser()
      if (current !== user || current.uid !== user.uid) {
        throw new Error('認証状態が変わったため処理を中断しました。現在のアカウントで再度開いてください。')
      }
    },
  }
}
