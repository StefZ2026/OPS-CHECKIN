import * as React from "react"

export function TooltipProvider({ children, delayDuration: _d }: { children: React.ReactNode; delayDuration?: number }) {
  return <>{children}</>
}

export function Tooltip({ children, delayDuration: _d }: { children: React.ReactNode; delayDuration?: number }) {
  return <>{children}</>
}

export function TooltipTrigger({ children, asChild: _asChild }: { children: React.ReactNode; asChild?: boolean }) {
  return <>{children}</>
}

export function TooltipContent({
  children,
  side: _side,
  align: _align,
  hidden: _hidden,
}: {
  children: React.ReactNode;
  side?: string;
  align?: string;
  hidden?: boolean;
}) {
  return <div className="hidden">{children}</div>
}
