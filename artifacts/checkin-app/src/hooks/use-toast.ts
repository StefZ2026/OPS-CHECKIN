import * as React from "react"

export type ToastType = {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
}

let memoryState: ToastType[] = []
let listeners: Array<(state: ToastType[]) => void> = []

function dispatch() {
  listeners.forEach(l => l(memoryState))
}

export function toast(props: Omit<ToastType, "id">) {
  const id = Math.random().toString(36).slice(2, 9)
  memoryState = [...memoryState, { ...props, id }]
  dispatch()
}

export function useToast() {
  const [toasts, setToasts] = React.useState<ToastType[]>(memoryState)

  React.useEffect(() => {
    listeners.push(setToasts)
    return () => {
      listeners = listeners.filter(l => l !== setToasts)
    }
  }, [])

  const dismiss = (id: string) => {
    memoryState = memoryState.filter(t => t.id !== id)
    dispatch()
  }

  return { toasts, toast, dismiss }
}
