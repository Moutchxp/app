import { act } from 'react';

/**
 * ══ POUR LES ÉPREUVES : CHOISIR UNE ADRESSE DANS LES SUGGESTIONS (Arno, 17/11/2026, « Adresses uniformisées », lot 3) ═══════════════════════
 * Une adresse de bien se CHOISIT dans les suggestions de la Base Adresse Nationale (`ChampAdresseBan` tel quel) : taper ne suffit plus. Ce geste
 * tape le texte, répond à la seule requête de la Base Adresse Nationale (une suggestion : ce texte, ce code postal, cette commune) — toute autre
 * requête passe au `fetch` simulé de l'épreuve, inchangé — puis retient la suggestion, comme un clic. Sans réseau. Réservé aux épreuves.
 */
export async function choisirAdresseBan(champ: HTMLInputElement, texte: string, codePostal = '92400', commune = 'Courbevoie'): Promise<void> {
  const avant = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => (String(url).startsWith('https://api-adresse.data.gouv.fr/')
    ? ({ ok: true, status: 200, json: async () => ({ features: [{ properties: { label: `${texte} ${codePostal} ${commune}`, name: texte, postcode: codePostal, city: commune } }] }) } as unknown as Response)
    : avant(url, init))) as typeof fetch;
  try {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(champ, texte);
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // le délai des suggestions (250 ms), puis la réponse
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
    const proposition = champ.closest('.cab-enveloppe')?.querySelector('.cab-prop');
    if (proposition === null || proposition === undefined) throw new Error(`Aucune suggestion pour « ${texte} »`);
    await act(async () => { proposition.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
  } finally {
    globalThis.fetch = avant;
  }
}
