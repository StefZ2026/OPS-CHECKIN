import { useToast } from "@/hooks/use-toast"
import { Toast } from "./toast"

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <>
      {toasts.map((t) => (
        <Toast key={t.id} {...t} onClose={() => dismiss(t.id)} />
      ))}
    </>
  )
}
