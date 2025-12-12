import { useState, useEffect, createContext, useContext } from 'react';

// Toast context for global access
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const showToast = (message, actionText = null, actionCallback = null, duration = 3000) => {
    setToast({ message, actionText, actionCallback });
    setTimeout(() => setToast(null), duration);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div className="toast show">
          <span>{toast.message}</span>
          {toast.actionText && (
            <button className="toast-action" onClick={toast.actionCallback}>
              {toast.actionText}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Return a no-op if not within provider
    return { showToast: () => {} };
  }
  return context;
}

// Simple toast component for Layout
function Toast() {
  // This is a placeholder - the actual toast state should be managed via context or state management
  return null;
}

export default Toast;
