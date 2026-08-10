import { Slot } from '@radix-ui/react-slot';
import * as React from 'react';
import { cn } from './cn';

/* ------------------------------------------------------------------ Button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
type ButtonSize = 'sm' | 'md' | 'icon';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors ' +
  'disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-brand whitespace-nowrap';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // Sfondo #C44300 (variante scura del brand): bianco su questo fondo raggiunge 5:1.
  primary: 'bg-brand-strong text-white hover:bg-brand-deep active:bg-brand-deep',
  secondary: 'border border-line bg-surface text-ink hover:bg-brand-tint hover:border-brand-border',
  ghost: 'text-ink hover:bg-surface-sunken',
  danger: 'bg-danger text-white hover:brightness-90',
  link: 'text-brand-strong underline underline-offset-2 hover:text-brand-deep',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-9 px-3.5 text-sm',
  icon: 'h-8 w-8 p-0',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', asChild = false, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      // I bottoni dentro un form sono submit per default: quasi mai ciò che serve.
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
});

/* ------------------------------------------------------------------- Badge */

type BadgeTone = 'neutral' | 'brand' | 'danger' | 'warning' | 'success' | 'info' | 'outline';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-ink border-line',
  brand: 'bg-brand-tint text-brand-deep border-brand-border',
  danger: 'bg-danger-tint text-danger border-danger/25',
  warning: 'bg-warning-tint text-warning border-warning/25',
  success: 'bg-success-tint text-success border-success/25',
  info: 'bg-info-tint text-info border-info/25',
  outline: 'bg-transparent text-muted border-line',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-4',
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('sd-panel', className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-line-soft px-4 py-3', className)}>
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-ink-strong">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Campi */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-9 w-full rounded-md border border-line bg-surface px-2.5 text-sm text-ink',
          'placeholder:text-faint focus-visible:border-brand focus-visible:outline-2',
          'focus-visible:outline-offset-0 focus-visible:outline-brand disabled:bg-surface-sunken',
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full rounded-md border border-line bg-surface px-2.5 py-2 text-sm text-ink',
          'placeholder:text-faint focus-visible:border-brand focus-visible:outline-2',
          'focus-visible:outline-offset-0 focus-visible:outline-brand',
          className,
        )}
        {...props}
      />
    );
  },
);

/**
 * Select nativo: in un gestionale denso è più rapido da usare da tastiera di
 * qualunque menu personalizzato, ed è accessibile senza lavoro aggiuntivo.
 */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'h-9 w-full rounded-md border border-line bg-surface px-2 text-sm text-ink',
          'focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-0',
          'focus-visible:outline-brand disabled:bg-surface-sunken',
          className,
        )}
        {...props}
      />
    );
  },
);

export function Field({
  label,
  hint,
  error,
  htmlFor,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const hintId = hint && htmlFor ? `${htmlFor}-hint` : undefined;
  const errorId = error && htmlFor ? `${htmlFor}-error` : undefined;
  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink">
        {label}
        {required ? (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <p id={hintId} className="text-[11px] text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-[11px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------- Stati */

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}>
      {icon ? <div className="text-brand" aria-hidden="true">{icon}</div> : null}
      <p className="text-sm font-medium text-ink-strong">{title}</p>
      {description ? <p className="max-w-md text-xs text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Si è verificato un errore',
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn('rounded-md border border-danger/30 bg-danger-tint px-4 py-3 text-sm', className)}
    >
      <p className="font-medium text-danger">{title}</p>
      {description ? <p className="mt-1 text-xs text-ink">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded bg-surface-sunken', className)} />;
}

/** Segnala una funzione presente nell'architettura ma non ancora attiva. */
export function NotImplementedNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-line bg-surface-sunken px-3 py-2 text-xs text-muted">
      {children}
    </p>
  );
}

/* -------------------------------------------------------------- Accessibilità */

/** Testo leggibile dagli screen reader ma non visibile. */
export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

export function Separator({ className, orientation = 'horizontal' }: { className?: string; orientation?: 'horizontal' | 'vertical' }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', 'bg-line', className)}
    />
  );
}
