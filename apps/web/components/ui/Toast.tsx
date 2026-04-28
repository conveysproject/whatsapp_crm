"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { JSX, useState } from "react";

interface ToastProps {
  title: string;
  description?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: "default" | "success" | "error";
}

const variantClasses = {
  default: "bg-white border-gray-200",
  success: "bg-white border-green-500",
  error:   "bg-white border-red-500",
};

export function Toast({ title, description, open, onOpenChange, variant = "default" }: ToastProps): JSX.Element {
  return (
    <ToastPrimitive.Provider swipeDirection="right">
      <ToastPrimitive.Root
        open={open}
        onOpenChange={onOpenChange}
        className={`flex flex-col gap-1 rounded-lg border p-4 shadow-card ${variantClasses[variant]}`}
        duration={4000}
      >
        <ToastPrimitive.Title className="text-sm font-semibold text-gray-900">
          {title}
        </ToastPrimitive.Title>
        {description && (
          <ToastPrimitive.Description className="text-sm text-gray-600">
            {description}
          </ToastPrimitive.Description>
        )}
      </ToastPrimitive.Root>
      <ToastPrimitive.Viewport className="fixed bottom-4 right-4 flex flex-col gap-2 w-80 z-50" />
    </ToastPrimitive.Provider>
  );
}

export function useToast() {
  const [state, setState] = useState<{
    open: boolean;
    title: string;
    description?: string;
    variant?: "default" | "success" | "error";
  }>({ open: false, title: "" });

  const toast = (title: string, opts?: { description?: string; variant?: "default" | "success" | "error" }) => {
    setState({ open: true, title, ...opts });
  };

  return {
    toast,
    toastState: state,
    setToastOpen: (open: boolean) => setState((s) => ({ ...s, open })),
  };
}
