"use client";
// Admin UI kit (owner: cms-admin): accessible form fields, tooltips, toasts, confirm modal, action buttons.
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import type { ActionResult } from "@/lib/cms/result";
import { STATUS_LABELS, type ContentStatusKey } from "@/lib/cms/constants";

import { btn, cx, inputCls } from "./styles";
export { btn, cx, inputCls };

// ------------------------------------------------------------------ toasts

type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

// ------------------------------------------------------------------ confirm modal

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}
const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function AdminProviders({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = nextId.current++;
    setToasts((l) => [...l.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), t.kind === "error" ? 12000 : 5000);
  }, []);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const ask = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  useEffect(() => {
    if (opts && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [opts]);
  const close = (v: boolean) => {
    dialogRef.current?.close();
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ToastCtx.Provider value={push}>
      <ConfirmCtx.Provider value={ask}>
        {children}
        <dialog
          ref={dialogRef}
          aria-labelledby="confirm-title"
          onCancel={(e) => {
            e.preventDefault();
            close(false);
          }}
          className="m-auto w-[min(92vw,28rem)] rounded-sm border border-charcoal/20 bg-white p-0 text-charcoal shadow-xl backdrop:bg-charcoal/50"
        >
          {opts ? (
            <div className="p-6">
              <h2 id="confirm-title" className="font-serif text-lg">
                {opts.title}
              </h2>
              {opts.message ? <div className="mt-2 text-sm text-charcoal/80">{opts.message}</div> : null}
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" className={btn.secondary} onClick={() => close(false)} autoFocus>
                  Annuler
                </button>
                <button type="button" className={opts.danger ? btn.danger : btn.primary} onClick={() => close(true)}>
                  {opts.confirmLabel ?? "Confirmer"}
                </button>
              </div>
            </div>
          ) : null}
        </dialog>
        <div aria-live="polite" role="status" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,24rem)] flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={cx(
                "pointer-events-auto rounded-sm border px-4 py-3 text-sm shadow-lg",
                t.kind === "success" && "border-emerald-700/40 bg-emerald-50 text-emerald-900",
                t.kind === "error" && "border-red-700/40 bg-red-50 text-red-900",
                t.kind === "info" && "border-charcoal/30 bg-white",
              )}
            >
              {t.text}
            </div>
          ))}
        </div>
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}

// ------------------------------------------------------------------ run an action + toast

/** Runs a Server Action result handler: toast, refresh on success. */
export function useRunner() {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = useCallback(
    <T,>(fn: () => Promise<ActionResult<T>>, opts: { refresh?: boolean; onOk?: (r: Extract<ActionResult<T>, { ok: true }>) => void; onFail?: (r: Extract<ActionResult<T>, { ok: false }>) => void } = {}) => {
      start(async () => {
        let r: ActionResult<T>;
        try {
          r = await fn();
        } catch {
          toast({ kind: "error", text: "Session expirée ou erreur réseau. Rechargez la page et reconnectez-vous si besoin." });
          return;
        }
        if (r.ok) {
          if (r.message) toast({ kind: "success", text: r.message });
          opts.onOk?.(r);
          if (opts.refresh !== false) router.refresh();
        } else {
          toast({ kind: "error", text: r.error });
          opts.onFail?.(r);
        }
      });
    },
    [router, toast],
  );
  return { run, pending };
}

export function ActionButton({
  run: action,
  children,
  variant = "secondary",
  size = "small",
  confirm,
  onOk,
  disabled,
  title,
}: {
  run: () => Promise<ActionResult<never> | ActionResult<unknown> | ActionResult<undefined>>;
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "small" | "normal";
  confirm?: ConfirmOptions;
  onOk?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  const ask = useConfirm();
  const { run, pending } = useRunner();
  return (
    <button
      type="button"
      title={title}
      disabled={pending || disabled}
      className={cx(btn[variant], size === "small" && btn.small)}
      onClick={async () => {
        if (confirm && !(await ask(confirm))) return;
        run(action as () => Promise<ActionResult<unknown>>, { onOk: () => onOk?.() });
      }}
    >
      {pending ? "…" : children}
    </button>
  );
}

// ------------------------------------------------------------------ form primitives

export function HelpTip({ children, label = "Aide" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative ml-1 inline-block align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-charcoal/40 text-xs text-charcoal hover:bg-beige/30"
      >
        ?
      </button>
      <span
        id={id}
        role="tooltip"
        hidden={!open}
        className="absolute left-0 top-6 z-30 w-64 rounded-sm border border-charcoal/20 bg-white p-3 text-xs font-normal leading-relaxed text-charcoal shadow-lg"
      >
        {children}
      </span>
    </span>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  help,
  required,
  counter,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  help?: ReactNode;
  required?: boolean;
  counter?: { value: number; max: number };
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
          {help ? <HelpTip label={`Aide : ${label}`}>{help}</HelpTip> : null}
        </label>
        {counter ? (
          <span className={cx("text-xs tabular-nums", counter.value > counter.max ? "text-red-700" : "text-charcoal/60")} aria-live="off">
            {counter.value}/{counter.max}
          </span>
        ) : null}
      </div>
      {children}
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-charcoal/60">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-err`} role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type Common = { label: string; hint?: ReactNode; error?: string | null; help?: ReactNode; counterMax?: number };

export function TextInput({ label, hint, error, help, counterMax, id, required, ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} htmlFor={fid} hint={hint} error={error} help={help} required={required} counter={counterMax ? { value: String(rest.value ?? "").length, max: counterMax } : undefined}>
      <input id={fid} required={required} aria-invalid={!!error} aria-describedby={[hint ? `${fid}-hint` : "", error ? `${fid}-err` : ""].join(" ").trim() || undefined} className={cx(inputCls, error && "border-red-700")} {...rest} />
    </Field>
  );
}

export function TextArea({ label, hint, error, help, counterMax, id, required, ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} htmlFor={fid} hint={hint} error={error} help={help} required={required} counter={counterMax ? { value: String(rest.value ?? "").length, max: counterMax } : undefined}>
      <textarea id={fid} required={required} aria-invalid={!!error} aria-describedby={[hint ? `${fid}-hint` : "", error ? `${fid}-err` : ""].join(" ").trim() || undefined} className={cx(inputCls, "min-h-24", error && "border-red-700")} {...rest} />
    </Field>
  );
}

export function Select({ label, hint, error, help, id, options, ...rest }: Common & SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} htmlFor={fid} hint={hint} error={error} help={help}>
      <select id={fid} aria-invalid={!!error} className={cx(inputCls, error && "border-red-700")} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Toggle({ label, checked, onChange, hint, help, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode; help?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 accent-charcoal" />
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
          {help ? <HelpTip label={`Aide : ${label}`}>{help}</HelpTip> : null}
        </label>
        {hint ? <p className="text-xs text-charcoal/60">{hint}</p> : null}
      </div>
    </div>
  );
}

export function Card({ title, children, actions, className }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-sm border border-charcoal/15 bg-white p-4 sm:p-5", className)}>
      {title || actions ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title ? <h2 className="font-serif text-lg">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Notice({ kind = "info", children }: { kind?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  return (
    <div
      role={kind === "error" ? "alert" : "note"}
      className={cx(
        "rounded-sm border px-4 py-3 text-sm",
        kind === "info" && "border-beige bg-beige/15",
        kind === "warn" && "border-amber-600/50 bg-amber-50 text-amber-900",
        kind === "error" && "border-red-700/40 bg-red-50 text-red-900",
        kind === "ok" && "border-emerald-700/40 bg-emerald-50 text-emerald-900",
      )}
    >
      {children}
    </div>
  );
}

export function StatusBadge({ status }: { status: ContentStatusKey }) {
  const tone: Record<ContentStatusKey, string> = {
    DRAFT: "bg-charcoal/10 text-charcoal",
    SCHEDULED: "bg-amber-100 text-amber-900",
    PUBLISHED: "bg-emerald-100 text-emerald-900",
    ARCHIVED: "bg-charcoal/20 text-charcoal/70",
  };
  return <span className={cx("inline-block rounded-full px-2.5 py-0.5 text-xs font-medium", tone[status])}>{STATUS_LABELS[status]}</span>;
}

export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
}

export function SubmitBar({ pending, dirty, label = "Enregistrer", children }: { pending: boolean; dirty?: boolean; label?: string; children?: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-t border-charcoal/15 bg-offwhite/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <button type="submit" disabled={pending} className={btn.primary}>
        {pending ? "Enregistrement…" : label}
      </button>
      {dirty ? <span className="text-xs text-amber-800">Modifications non enregistrées</span> : null}
      <div className="ml-auto flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function useMemoJson<T>(v: T) {
  return useMemo(() => JSON.stringify(v), [v]);
}

export function ButtonLike(props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof btn }) {
  const { variant = "secondary", className, ...rest } = props;
  return <button type="button" className={cx(btn[variant as "primary"], className)} {...rest} />;
}
