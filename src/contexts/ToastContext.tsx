"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';

// Toast message type
interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'error';
}

// Context value type
interface ToastContextValue {
  showToast: (text: string, type?: 'success' | 'error') => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Provider component that enables toast notifications app-wide
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [mounted, setMounted] = useState(false);

  // Only render portal after mount to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    const id = `toast-${Date.now()}`;
    setToasts(prev => [...prev, { id, text, type }]);

    // Auto-dismiss after 2 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Render toasts via portal - only after mount to avoid hydration mismatch */}
      {mounted && createPortal(
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className={`
                glass flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/40
                animate-in slide-in-from-top-2 fade-in duration-200
              `}
            >
              {toast.type === 'success' ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <X className="w-4 h-4 text-red-600" />
              )}
              <span className="text-sm font-semibold text-zinc-900">{toast.text}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

/**
 * Hook to trigger toast notifications from any component
 * Must be used within a ToastProvider
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
