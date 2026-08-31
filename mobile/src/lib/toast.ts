// Minimal global toast — mirrors the web app's sonner usage:
//   toast.success("Saved"); toast.error("Failed"); toast.message("Title", desc)
export type ToastKind = "success" | "error" | "info";
export type ToastItem = { id: number; kind: ToastKind; text: string; desc?: string };

type Listener = (t: ToastItem) => void;
const listeners = new Set<Listener>();
let seq = 1;

function emit(kind: ToastKind, text: string, desc?: string) {
  const item: ToastItem = { id: seq++, kind, text, desc };
  listeners.forEach((l) => l(item));
}

export const toast = {
  success: (text: string, desc?: string) => emit("success", text, desc),
  error: (text: string, desc?: string) => emit("error", text, desc),
  info: (text: string, desc?: string) => emit("info", text, desc),
  message: (text: string, desc?: string) => emit("info", text, desc),
};

export function subscribeToasts(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
