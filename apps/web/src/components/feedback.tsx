'use client';

import { cn } from '@sdoh/ui';
import { CheckCircle2, Info, XCircle } from 'lucide-react';

/**
 * Riscontro inline di un'azione. `role="status"` per i messaggi positivi e
 * `role="alert"` per gli errori: gli screen reader annunciano l'esito senza
 * che l'utente debba cercarlo.
 */
export function ActionFeedback({
  result,
  className,
}: {
  result: { ok: boolean; message: string } | null;
  className?: string;
}) {
  if (!result) return null;
  const Icon = result.ok ? CheckCircle2 : XCircle;
  return (
    <p
      role={result.ok ? 'status' : 'alert'}
      className={cn(
        'flex items-start gap-1.5 rounded-md border px-2.5 py-1.5 text-xs',
        result.ok ? 'border-success/25 bg-success-tint text-success' : 'border-danger/25 bg-danger-tint text-danger',
        className,
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="text-ink">{result.message}</span>
    </p>
  );
}

export function InfoNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-start gap-1.5 rounded-md border border-info/25 bg-info-tint px-2.5 py-1.5 text-xs text-ink', className)}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
