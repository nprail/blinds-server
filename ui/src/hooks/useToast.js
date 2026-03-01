import { useState, useCallback } from 'react';

const TOAST_DURATION_MS = 4000;
let toastCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = 'ok') => {
    const id = ++toastCounter;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), TOAST_DURATION_MS);
  }, []);

  const removeToast = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, toast, removeToast };
}
