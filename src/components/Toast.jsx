import { useState, useEffect, createContext, useContext } from 'react'
import { Check } from 'lucide-react'

const ToastContext = createContext({})

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)

  const showToast = (message, actionText = null, actionCallback = null) => {
    setToast({ message, actionText, actionCallback })
    setTimeout(() => setToast(null), 5000)
  }

  const hideToast = () => setToast(null)

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      {toast && (
        <div className="toast show">
          <div className="toast-content">
            <div className="toast-icon">
              <Check size={16} />
            </div>
            <span className="toast-message">{toast.message}</span>
          </div>
          {toast.actionText && (
            <button
              className="toast-action"
              onClick={() => {
                hideToast()
                toast.actionCallback?.()
              }}
            >
              {toast.actionText}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

// Simple Toast component for Layout
export default function Toast() {
  return null // Toast is rendered via ToastProvider
}
