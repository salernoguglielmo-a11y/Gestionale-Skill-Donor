/**
 * Sanitizzazione dei contenuti provenienti dall'esterno.
 *
 * L'app non renderizza MAI HTML proveniente da email o documenti: i corpi sono
 * mostrati come testo semplice in un `<pre>`, quindi React fa già l'escaping.
 * Questa funzione esiste per i casi in cui un contenuto esterno debba essere
 * ridotto a testo (anteprime, riepiloghi, esportazioni) e come rete di sicurezza
 * se in futuro qualcuno dovesse gestire HTML.
 *
 * Non esiste alcun uso di `dangerouslySetInnerHTML` nel repository.
 */

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Consente solo URL http/https. Blocca `javascript:`, `data:` e schemi esotici
 * che finirebbero in un attributo href.
 */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
