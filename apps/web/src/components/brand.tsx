import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Image from 'next/image';

/**
 * Identità visiva.
 *
 * Il logo ufficiale **non viene ridisegnato né ricostruito**: il componente cerca
 * il file in `public/brand/skill-donor-logo.png` e, se lo trova, lo mostra così
 * com'è. Se il file non c'è, resta un segnaposto tipografico neutro nei soli
 * colori ufficiali — nessuna immagine rotta, nessuna approssimazione del marchio.
 *
 * Per attivarlo basta copiare il file: non serve toccare il codice.
 * Dettagli in `apps/web/public/brand/README.md`.
 */

const LOGO_PATH = '/brand/skill-donor-logo.png';

/**
 * Verifica eseguita una sola volta all'avvio del server. Il componente è un
 * Server Component, quindi la lettura del filesystem non raggiunge il browser.
 */
const hasOfficialLogo = existsSync(join(process.cwd(), 'public', 'brand', 'skill-donor-logo.png'));

export function BrandMark({ size = 24 }: { size?: number }) {
  if (hasOfficialLogo) {
    return (
      <Image
        src={LOGO_PATH}
        alt="Skill Donor"
        width={size}
        height={size}
        priority
        // `contain` preserva le proporzioni originali del marchio.
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-[5px] bg-brand font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.52, lineHeight: 1 }}
    >
      SD
    </span>
  );
}

export function BrandWordmark({ compact = false }: { compact?: boolean }) {
  if (hasOfficialLogo) {
    // Il logo ufficiale contiene già il lettering: non si affianca altro testo.
    const height = compact ? 24 : 30;
    return (
      <Image
        src={LOGO_PATH}
        alt="Skill Donor"
        width={height * 3}
        height={height}
        priority
        style={{ height, width: 'auto', objectFit: 'contain' }}
      />
    );
  }

  return (
    <span className="flex items-center gap-2">
      <BrandMark size={compact ? 22 : 26} />
      {!compact ? (
        <span className="flex flex-col leading-tight">
          <span className="text-[13px] font-semibold tracking-tight text-ink-strong">Skill Donor</span>
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">Operations Hub</span>
        </span>
      ) : null}
    </span>
  );
}

/** Vero quando l'asset ufficiale è presente: usato dalla pagina Impostazioni. */
export const officialLogoInstalled = hasOfficialLogo;
