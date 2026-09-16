import { useState } from 'react'
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth'
import { auth } from '../config/firebase'

interface PasswordChangeModalProps {
  isOpen: boolean
  onClose: () => void
}

function PasswordChangeModal({ isOpen, onClose }: PasswordChangeModalProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const resetForm = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setStatus('idle')
    setErrorMessage('')
    setIsLoading(false)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMessage('')

    // 입력 검증
    if (newPassword !== confirmPassword) {
      setErrorMessage('新しいパスワードが一致しません')
      setIsLoading(false)
      return
    }

    if (newPassword.length < 6) {
      setErrorMessage('新しいパスワードは6文字以上である必要があります')
      setIsLoading(false)
      return
    }

    try {
      const user = auth.currentUser
      if (!user || !user.email) {
        throw new Error('ユーザーが見つかりません')
      }

      // 1단계: 현재 비밀번호로 재인증
      const credential = EmailAuthProvider.credential(user.email, currentPassword)
      await reauthenticateWithCredential(user, credential)

      // 2단계: 새 비밀번호로 업데이트
      await updatePassword(user, newPassword)

      setStatus('success')
      setTimeout(() => {
        handleClose()
      }, 2000)

    } catch (error: any) {
      console.error('Password change error:', error)
      
      // Firebase 에러 메시지 한국어/일본어화
      if (error.code === 'auth/wrong-password') {
        setErrorMessage('現在のパスワードが正しくありません')
      } else if (error.code === 'auth/weak-password') {
        setErrorMessage('新しいパスワードが弱すぎます')
      } else if (error.code === 'auth/requires-recent-login') {
        setErrorMessage('セキュリティのため、再度ログインしてください')
      } else {
        setErrorMessage('パスワードの変更に失敗しました: ' + (error.message || '不明なエラー'))
      }
      setStatus('error')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '2rem',
          maxWidth: '500px',
          width: '90%',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#1976d2' }}>🔐 パスワード変更</h2>
          <button
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#666',
            }}
          >
            ✕
          </button>
        </div>

        {/* 보안 경고 */}
        <div style={{
          padding: '1rem',
          backgroundColor: '#fff3cd',
          borderRadius: '6px',
          border: '1px solid #ffc107',
          fontSize: '0.9rem',
          marginBottom: '1.5rem',
        }}>
          <strong>セキュリティ:</strong> パスワード変更には現在のパスワードの確認が必要です。
        </div>

        {/* 성공/에러 메시지 */}
        {status !== 'idle' && (
          <div
            style={{
              padding: '0.75rem',
              marginBottom: '1rem',
              borderRadius: '6px',
              textAlign: 'center',
              backgroundColor: status === 'success' ? '#e8f5e9' : '#ffebee',
              color: status === 'success' ? '#2e7d32' : '#c62828',
              border: `1px solid ${status === 'success' ? '#4caf50' : '#f44336'}`,
            }}
          >
            {status === 'success' && '✓ パスワードが正常に変更されました'}
            {status === 'error' && errorMessage}
          </div>
        )}

        {/* 폼 */}
        <form onSubmit={handleSubmit}>
          {/* 현재 비밀번호 */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 'bold',
              color: '#333',
            }}>
              現在のパスワード
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* 새 비밀번호 */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 'bold',
              color: '#333',
            }}>
              新しいパスワード
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              disabled={isLoading}
              minLength={6}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box',
              }}
            />
            <p style={{ fontSize: '0.8rem', color: '#666', margin: '0.25rem 0 0 0' }}>
              6文字以上で入力してください
            </p>
          </div>

          {/* 새 비밀번호 확인 */}
          <div style={{ marginBottom: '2rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 'bold',
              color: '#333',
            }}>
              新しいパスワード（確認）
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: `1px solid ${newPassword && confirmPassword && newPassword !== confirmPassword ? '#f44336' : '#ddd'}`,
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box',
              }}
            />
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p style={{ fontSize: '0.8rem', color: '#f44336', margin: '0.25rem 0 0 0' }}>
                パスワードが一致しません
              </p>
            )}
          </div>

          {/* 버튼 */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#666',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: '1rem',
              }}
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isLoading || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: isLoading || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword 
                  ? '#ccc' 
                  : '#1976d2',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: isLoading || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword 
                  ? 'not-allowed' 
                  : 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold',
              }}
            >
              {isLoading ? '変更中...' : 'パスワード変更'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default PasswordChangeModal