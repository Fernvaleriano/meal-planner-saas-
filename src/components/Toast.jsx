import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { X, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';

// Toast context for global access
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((toast) => {
    const id = Date.now() + Math.random();
    const newToast = { id, ...toast };
    setToasts(prev => [...prev, newToast]);

    // Auto-dismiss after duration (unless it has a retry action)
    if (!toast.onRetry) {
      const duration = toast.duration || 5000;
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showError = useCallback((message, options = {}) => {
    return addToast({ type: 'error', message, ...options });
  }, [addToast]);

  const showSuccess = useCallback((message, options = {}) => {
    return addToast({ type: 'success', message, ...options });
  }, [addToast]);

  const value = {
    toasts,
    addToast,
    removeToast,
    showError,
    showSuccess
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  // Return no-op functions if context is not available to prevent crashes
  if (!context) {
    return {
      toasts: [],
      addToast: () => {},
      removeToast: () => {},
      showError: () => {},
      showSuccess: () => {}
    };
  }
  return context;
}

function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss }) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    if (toast.onRetry && !isRetrying) {
      setIsRetrying(true);
      try {
        await toast.onRetry();
        onDismiss();
      } catch (error) {
        console.error('Retry failed:', error);
        setIsRetrying(false);
      }
    }
  };

  const Icon = toast.type === 'error' ? AlertCircle : CheckCircle;

  return (
    <div className={`toast toast-${toast.type}`}>
      <div className="toast-icon">
        <Icon size={20} />
      </div>
      <div className="toast-content">
        <p className="toast-message">{toast.message}</p>
        {toast.onRetry && (
          <button
            className="toast-retry-btn"
            onClick={handleRetry}
            disabled={isRetrying}
          >
            <RefreshCw size={14} className={isRetrying ? 'spinning' : ''} />
            {isRetrying ? 'Retrying...' : 'Retry'}
          </button>
        )}
      </div>
      <button className="toast-dismiss" onClick={onDismiss}>
        <X size={18} />
      </button>
    </div>
  );
}

export default Toast;
