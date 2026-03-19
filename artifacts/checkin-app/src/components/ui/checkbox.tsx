import * as React from "react"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, description, checked, onChange, disabled, ...props }, ref) => {
    return (
      <label className={cn(
        "flex items-start space-x-4 cursor-pointer group p-4 rounded-lg transition-colors border-2",
        checked ? "bg-primary/5 border-primary" : "hover:bg-muted/50 border-transparent",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}>
        <div className="relative flex items-center justify-center w-8 h-8 md:w-10 md:h-10 mt-1 shrink-0">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            ref={ref}
            {...props}
          />
          <div className={cn(
            "w-full h-full rounded border-4 border-foreground flex items-center justify-center transition-all",
            "peer-focus-visible:ring-4 peer-focus-visible:ring-ring",
            checked ? "bg-primary border-primary text-white" : "bg-white text-transparent"
          )}>
            <Check className={cn("w-6 h-6 md:w-8 md:h-8 stroke-[4px]", checked ? "opacity-100" : "opacity-0")} />
          </div>
        </div>
        <div className="grid gap-1">
          <p className={cn(
            "font-bold text-xl md:text-2xl leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 transition-colors",
            checked ? "text-primary" : "text-foreground"
          )}>
            {label}
          </p>
          {description && (
            <p className="text-muted-foreground text-sm md:text-base font-medium">
              {description}
            </p>
          )}
        </div>
      </label>
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
