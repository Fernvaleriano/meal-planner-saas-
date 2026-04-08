import { useState, useCallback, createContext, useContext } from 'react';
import { AlertTriangle, X } from 'lucide-react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setDialog({
        message,
        title: options.title || 'Confirm',
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        destructive: options.destructive ?? false,
        resolve
      });
    });
  }, []);

  const handleConfirm = () => {
    dialog?.resolve(true);
    setDialog(null);
  };

  const handleCancel = () => {
    dialog?.resolve(false);
    setDialog(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <div className="confirm-dialog-overlay" onClick={handleCancel}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="confirm-dialog-header">
              <AlertTriangle size={20} className={dialog.destructive ? 'confirm-icon-destructive' : 'confirm-icon'} />
              <span className="confirm-dialog-title">{dialog.title}</span>
              <button className="confirm-dialog-close" onClick={handleCancel}>
                <X size={18} />
              </button>
            </div>
            <p className="confirm-dialog-message">{dialog.message}</p>
            <div className="confirm-dialog-actions">
              {dialog.cancelText !== '' && (
                <button className="confirm-dialog-btn confirm-dialog-cancel" onClick={handleCancel}>
                  {dialog.cancelText}
                </button>
              )}
              <button
                className={`confirm-dialog-btn ${dialog.destructive ? 'confirm-dialog-destructive' : 'confirm-dialog-confirm'}`}
                onClick={handleConfirm}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    // Fallback to native confirm if provider not available
    return (message) => Promise.resolve(window.confirm(message));
  }
  return context;
}
