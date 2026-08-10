import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Skill Donor Operations Hub',
    template: '%s · Skill Donor Operations Hub',
  },
  description:
    'Gestionale interno di Skill Donor S.r.l. – SIAVS: attività, progetti, stakeholder, corrispondenza, bozze e decisioni.',
  // Applicazione privata: nessuna indicizzazione, in nessun ambiente.
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ff5900',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="min-h-screen bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
