"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  memo,
  type ReactNode,
} from "react";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastContextType {
  showToast: (message: string, type?: Toast["type"]) => void;
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback(
    (message: string, type: Toast["type"] = "info") => {
      const id = ++toastId;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ToastItem = memo(function ToastItem({ toast }: { toast: Toast }) {
  const bgColors: Record<string, string> = {
    success: "var(--success)",
    error: "var(--destructive)",
    info: "var(--primary)",
  };

  return (
    <div
      className="animate-slide-up rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg"
      style={{ backgroundColor: bgColors[toast.type] }}
    >
      {toast.message}
    </div>
  );
});
