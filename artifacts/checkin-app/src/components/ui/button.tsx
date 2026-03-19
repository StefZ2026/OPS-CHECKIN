import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "xl" | "icon";
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-bold transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none uppercase tracking-wide",
          // Variants
          variant === "default" && "bg-primary text-primary-foreground border-4 border-foreground shadow-brutal",
          variant === "secondary" && "bg-secondary text-secondary-foreground border-4 border-foreground shadow-brutal",
          variant === "destructive" && "bg-destructive text-destructive-foreground border-4 border-foreground shadow-brutal",
          variant === "outline" && "border-4 border-foreground bg-background hover:bg-muted shadow-brutal",
          variant === "ghost" && "hover:bg-muted text-foreground",
          // Sizes
          size === "default" && "h-12 px-6 py-2 text-lg",
          size === "sm" && "h-10 px-4 text-base",
          size === "lg" && "h-16 px-10 text-xl",
          size === "xl" && "h-20 px-12 text-2xl border-[6px]", // Massive tablet button
          size === "icon" && "h-12 w-12",
          className
        )}
        {...props}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading...
          </span>
        ) : (
          children
        )}
      </button>
    )
  }
)
Button.displayName = "Button"

export function buttonVariants({ variant = "default", size = "default", className = "" }: { variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; className?: string } = {}) {
  return [
    "inline-flex items-center justify-center rounded-md font-bold transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none uppercase tracking-wide",
    variant === "default" && "bg-primary text-primary-foreground border-4 border-foreground shadow-brutal",
    variant === "secondary" && "bg-secondary text-secondary-foreground border-4 border-foreground shadow-brutal",
    variant === "destructive" && "bg-destructive text-destructive-foreground border-4 border-foreground shadow-brutal",
    variant === "outline" && "border-4 border-foreground bg-background hover:bg-muted shadow-brutal",
    variant === "ghost" && "hover:bg-muted text-foreground",
    size === "default" && "h-12 px-6 py-2 text-lg",
    size === "sm" && "h-10 px-4 text-base",
    size === "lg" && "h-16 px-10 text-xl",
    size === "xl" && "h-20 px-12 text-2xl border-[6px]",
    size === "icon" && "h-12 w-12",
    className,
  ].filter(Boolean).join(" ");
}

export { Button }
