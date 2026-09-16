import { IS_DEMO_MODE } from '../config/firebase'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  if (!isOpen) return null
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="settings-title" style={{ backgroundColor: 'white', borderRadius: 8, padding: '2rem', maxWidth: 600, width: '90%' }} onClick={event => event.stopPropagation()}>
        <h2 id="settings-title">実行モード・接続設定</h2>
        <p><strong>{IS_DEMO_MODE ? 'オフライン・デモモード' : 'クラウドモード'}</strong></p>
        <p>デモは架空の請求書だけを使用します。明細と履歴はこのページのメモリ内に保存され、再読み込みで消えます。OCR・認証・外部送信は行いません。</p>
        <p>クラウドを使う場合は、管理者が .env.example を元に Firebase の公開設定を指定し、VITE_DEMO_MODE=false に設定します。ログインとサーバー側の構成が必要です。</p>
        <p>OpenAI の秘密鍵はサーバーの Secret Manager に設定します。Google Cloud Vision はサーバーのサービスアカウントを使用します。ブラウザには API 秘密鍵を入力・保存しません。</p>
        <p>設定手順と利用制限は README および docs のクラウド設定資料を参照してください。</p>
        <button onClick={onClose} style={{ padding: '.75rem 1.5rem', backgroundColor: '#1976d2', color: 'white', border: 0, borderRadius: 6, cursor: 'pointer' }}>閉じる</button>
      </section>
    </div>
  )
}

export default SettingsModal
