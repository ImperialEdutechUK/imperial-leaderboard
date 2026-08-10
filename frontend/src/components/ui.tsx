'use client';

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';
import { cx } from '@/lib/format';

// ── Button ───────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    icon?: ReactNode;
  }
>(function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all disabled:opacity-45 disabled:cursor-not-allowed select-none whitespace-nowrap';
  const sizes = {
    sm: 'h-8 px-3 text-[13px]',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-[15px]',
  }[size];
  const variants: Record<Variant, string> = {
    primary: 'bg-s1 text-white hover:brightness-110 active:brightness-95 shadow-[0_2px_12px_-4px_rgba(57,135,229,0.6)]',
    secondary: 'bg-overlay text-ink border border-rule hover:bg-[var(--surface-hover)]',
    ghost: 'text-ink-2 hover:text-ink hover:bg-ink/5',
    danger: 'bg-critical text-white hover:brightness-110',
    gold: 'bg-gold text-[#1a1400] hover:brightness-105 shadow-[0_2px_16px_-4px_rgba(244,183,64,0.6)]',
  };
  return (
    <button
      ref={ref}
      className={cx(base, sizes, variants[variant], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ── Inputs ───────────────────────────────────────────────────────────────────

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cx(
          'h-10 w-full rounded-xl border bg-plane px-3 text-sm text-ink placeholder:text-ink-3',
          'focus:border-s1 focus:outline-none focus:ring-2 focus:ring-s1/30 transition',
          invalid ? 'border-critical' : 'border-rule',
          className,
        )}
        {...rest}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cx(
          'h-10 w-full rounded-xl border border-rule bg-plane px-3 text-sm text-ink',
          'focus:border-s1 focus:outline-none focus:ring-2 focus:ring-s1/30 transition',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx('block', className)}>
      <span className="label mb-1.5 block">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 flex items-start gap-1.5 text-[12px] text-critical">
          <XCircle size={13} className="mt-px shrink-0" />
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-[12px] leading-snug text-ink-3">{hint}</span>
      ) : null}
    </label>
  );
}

// ── Surfaces ─────────────────────────────────────────────────────────────────

export function Card({
  children,
  className,
  raised,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { raised?: boolean }) {
  return (
    <div className={cx(raised ? 'card-raised' : 'card', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  right,
  className,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('mb-4 flex items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-ink-3">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

// ── Feedback ─────────────────────────────────────────────────────────────────

/** Status colours always ship with an icon and a label — never colour alone. */
export function Notice({
  tone = 'info',
  title,
  children,
  className,
  onDismiss,
}: {
  tone?: 'info' | 'good' | 'warning' | 'critical';
  title?: string;
  children?: ReactNode;
  className?: string;
  onDismiss?: () => void;
}) {
  const map = {
    info: { Icon: Info, colour: '#3987E5', ring: 'border-s1/30 bg-s1/10', word: 'Note' },
    good: { Icon: CheckCircle2, colour: '#0CA30C', ring: 'border-good/30 bg-good/10', word: 'Success' },
    warning: { Icon: AlertTriangle, colour: '#FAB219', ring: 'border-warning/30 bg-warning/10', word: 'Warning' },
    critical: { Icon: XCircle, colour: '#D03B3B', ring: 'border-critical/30 bg-critical/10', word: 'Problem' },
  }[tone];

  return (
    <div className={cx('flex gap-3 rounded-xl border p-3.5', map.ring, className)} role={tone === 'critical' ? 'alert' : undefined}>
      <map.Icon size={17} style={{ color: map.colour }} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-2">
        <span className="sr-only">{map.word}: </span>
        {title && <div className="mb-0.5 font-semibold text-ink">{title}</div>}
        {children}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="shrink-0 self-start text-ink-3 hover:text-ink" aria-label="Dismiss">
          <X size={15} />
        </button>
      )}
    </div>
  );
}

export function Pill({
  children,
  colour,
  className,
  title,
}: {
  children: ReactNode;
  colour?: string;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-semibold',
        className,
      )}
      style={
        colour
          ? { borderColor: `${colour}55`, background: `${colour}18`, color: 'rgb(var(--ink-rgb))' }
          : { borderColor: 'var(--rule)', background: 'rgb(var(--ink-rgb) / 0.04)', color: 'var(--ink-2)' }
      }
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-rule px-6 py-14 text-center">
      {icon && <div className="mb-3 text-ink-3">{icon}</div>}
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {children && <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-ink-3">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('animate-spin text-ink-3', className)} size={18} />;
}

// ── Modal ────────────────────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'relative z-10 max-h-[88vh] w-full overflow-y-auto rounded-card border border-rule bg-raised shadow-lift animate-fade-up',
          wide ? 'max-w-3xl' : 'max-w-lg',
        )}
      >
        <div className="sticky top-0 flex items-center justify-between gap-4 border-b border-hairline bg-raised px-5 py-4">
          <h2 className="text-[15px] font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="text-ink-3 hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && <div className="border-t border-hairline px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
