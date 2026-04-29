// Minimal toast implementation for completeness
import * as React from "react"
import { cn } from "@/lib/utils"

export type ToastProps = {
  title: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
  onClose: () => void;
}

export function Toast({ title, description, variant = "default", onClose }: ToastProps) {
  React.useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={cn(
      "fixed bottom-4 right-4 z-50 p-6 rounded-lg border-4 border-foreground shadow-brutal min-w-[300px] animate-in slide-in-from-bottom-5",
      variant === "default" && "bg-white text-foreground",
      variant === "destructive" && "bg-destructive text-white",
      variant === "success" && "bg-[#22c55e] text-white"
    )}>
      <h3 className="font-display text-xl uppercase">{title}</h3>
      {description && <p className="mt-1 font-medium text-lg opacity-90">{description}</p>}
    </div>
  )
}
