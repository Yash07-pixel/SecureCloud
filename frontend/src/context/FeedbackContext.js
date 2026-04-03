import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const FeedbackContext = createContext(null);

function normalizeMessage(message, fallback) {
  if (Array.isArray(message)) {
    return message.join(', ');
  }
  return message || fallback;
}

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const nextToastId = useRef(1);
  const confirmResolver = useRef(null);

  const notify = useCallback((message, type = 'info') => {
    const id = nextToastId.current++;
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  const notifySuccess = useCallback((message) => notify(message, 'success'), [notify]);
  const notifyError = useCallback((message) => notify(message, 'error'), [notify]);
  const notifyInfo = useCallback((message) => notify(message, 'info'), [notify]);

  const confirm = useCallback(({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'default' }) =>
    new Promise((resolve) => {
      confirmResolver.current = resolve;
      setConfirmState({ title, message, confirmLabel, cancelLabel, tone });
    }), []);

  const closeConfirm = (result) => {
    if (confirmResolver.current) {
      confirmResolver.current(result);
      confirmResolver.current = null;
    }
    setConfirmState(null);
  };

  const value = useMemo(
    () => ({
      notifySuccess,
      notifyError,
      notifyInfo,
      confirm,
      getErrorMessage(error, fallback = 'Something went wrong') {
        const detail = error?.response?.data?.detail;
        return normalizeMessage(detail, fallback);
      },
    }),
    [confirm, notifyError, notifyInfo, notifySuccess]
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>
      {confirmState && (
        <div className="modal-bg">
          <div className="confirm-modal">
            <div className="confirm-title">{confirmState.title}</div>
            <p className="confirm-message">{confirmState.message}</p>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => closeConfirm(false)}>
                {confirmState.cancelLabel}
              </button>
              <button
                className={confirmState.tone === 'danger' ? 'confirm-btn confirm-btn-danger' : 'confirm-btn'}
                onClick={() => closeConfirm(true)}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }
  return context;
}
