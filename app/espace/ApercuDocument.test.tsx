// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Écran d'aperçu — bouton « Télécharger ce document ».
 *
 * PROUVE la décision du 22/09 : le document est récupéré UNE SEULE FOIS au montage, et le bouton ouvre la
 * FEUILLE DE PARTAGE quand l'appareil la propose (iPhone), sinon enregistre le fichier déjà en main. Aucune
 * requête réseau au clic — c'est ce qui corrige le 200-puis-401 observé sur iPhone (Safari rejouait la requête
 * sans session). Prouve aussi qu'aucune branche serveur/client n'est prise AU RENDU (pas d'erreur d'hydratation).
 *
 * `next/link` et `next/dynamic` sont neutralisés : on teste CE composant, pas le routeur ni PDF.js.
 */
vi.mock('next/link', () => ({
  default: ({ href, children, ...r }: { href: string; children: unknown }) =>
    createElement('a', { href, ...r }, children as never),
}));
vi.mock('next/dynamic', () => ({
  default: () => ({ url }: { url: string }) => createElement('div', { 'data-pdf': url }),
}));

import ApercuDocument, { nomDepuisDisposition } from './ApercuDocument';
import {
  LIB_TELECHARGER_DOCUMENT, LIB_RETOUR_ESPACE, LIB_PREPARATION, LIB_SE_RECONNECTER,
  MSG_SESSION_EXPIREE, MSG_DOCUMENT_NON_PREPARE,
} from './presentation';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

/** Réponse type de la route de livraison (octets + en-têtes réels). */
function reponse(over: { status?: number; type?: string; disposition?: string | null } = {}) {
  const entetes = new Headers();
  entetes.set('Content-Type', over.type ?? 'image/png');
  if (over.disposition !== null) entetes.set('Content-Disposition', over.disposition ?? 'inline; filename="Visuel-annonce-SVAV-AAAA-BBBB.png"');
  return {
    ok: (over.status ?? 200) < 400,
    status: over.status ?? 200,
    headers: entetes,
    blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: over.type ?? 'image/png' }),
  } as unknown as Response;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock = vi.fn(async () => reponse());
  global.fetch = fetchMock as unknown as typeof fetch;
  // URL d'objet : jsdom ne l'implémente pas.
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:svav/doc');
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
});
afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
  delete (navigator as unknown as { share?: unknown }).share;
  delete (navigator as unknown as { canShare?: unknown }).canShare;
});

const props = (over: Record<string, unknown> = {}) =>
  ({ certificatId: 469, doc: 'visuel', analyseId: 42, disponible: true, ...over }) as Parameters<typeof ApercuDocument>[0];

/** Rend l'écran et laisse la récupération du document se terminer. */
async function rendrePret(over: Record<string, unknown> = {}) {
  await act(async () => { root.render(createElement(ApercuDocument, props(over))); });
}
const bouton = () => container.querySelector('button');
const lien = (motif: string) => [...container.querySelectorAll('a')].find((a) => (a.textContent ?? '').includes(motif));

describe('récupération UNIQUE du document, au montage', () => {
  it('un seul appel réseau, same-origin (cookie de session), sur la route de livraison', async () => {
    await rendrePret();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/internaute/espace/certificats/469/telecharger?doc=visuel');
    expect(opts.credentials).toBe('same-origin');
  });

  it('l’APERÇU consomme le fichier déjà récupéré (URL d’objet), pas une 2e requête', async () => {
    await rendrePret();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:svav/doc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('un PDF passe la MÊME URL d’objet au viewer', async () => {
    await rendrePret({ doc: 'nominatif', disposition: undefined });
    expect(container.querySelector('[data-pdf]')?.getAttribute('data-pdf')).toBe('blob:svav/doc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('nominatif pas encore déposé → AUCUNE requête, aucun bouton de téléchargement', async () => {
    await rendrePret({ doc: 'nominatif', disponible: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(bouton()).toBeNull();
    expect(lien(LIB_RETOUR_ESPACE)).toBeDefined(); // le retour reste, rien ne disparaît
  });
});

describe('état « Préparation… » puis bouton actif', () => {
  it('AU RENDU INITIAL (identique au serveur) : bouton VISIBLE mais INACTIF, libellé « Préparation… »', () => {
    // Rendu synchrone : la récupération n'a pas encore abouti — c'est exactement ce que rend le serveur.
    act(() => { root.render(createElement(ApercuDocument, props())); });
    expect(bouton()?.textContent).toBe(LIB_PREPARATION);
    expect(bouton()?.disabled).toBe(true);
  });

  it('une fois le document prêt : libellé « Télécharger ce document », bouton actif', async () => {
    await rendrePret();
    expect(bouton()?.textContent).toBe(LIB_TELECHARGER_DOCUMENT);
    expect(bouton()?.disabled).toBe(false);
  });

  it('AUCUN accès à navigator AU RENDU (hydratation) — seulement au clic', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const espion = vi.fn();
    Object.defineProperty(navigator, 'share', { configurable: true, get: () => { espion(); return undefined; } });
    await rendrePret();
    expect(espion).not.toHaveBeenCalled(); // rien pendant le rendu ni le montage
    act(() => { bouton()?.click(); });
    expect(espion).toHaveBeenCalled(); // consulté seulement dans le geste
  });
});

describe('clic — feuille de partage quand l’appareil la propose', () => {
  it('LE TEST DU LOT — partage appelé avec le FICHIER (nom et type réels), aucune requête réseau', async () => {
    const share = vi.fn(async (_d: ShareData) => undefined);
    (navigator as unknown as { share: unknown }).share = share;
    (navigator as unknown as { canShare: unknown }).canShare = vi.fn(() => true);
    await rendrePret();
    act(() => { bouton()?.click(); });
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0][0] as ShareData & { files: File[]; title: string };
    expect(arg.files[0].name).toBe('Visuel-annonce-SVAV-AAAA-BBBB.png'); // nom porté par Content-Disposition
    expect(arg.files[0].type).toBe('image/png');
    expect(typeof arg.title).toBe('string');
    expect(fetchMock).toHaveBeenCalledTimes(1); // toujours une seule requête : celle du montage
  });

  it('ANNULATION par l’internaute (AbortError) → silencieux, aucun enregistrement forcé', async () => {
    const clicLien = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    (navigator as unknown as { share: unknown }).share = vi.fn(async () => {
      throw Object.assign(new Error('annulé'), { name: 'AbortError' });
    });
    (navigator as unknown as { canShare: unknown }).canShare = vi.fn(() => true);
    await rendrePret();
    await act(async () => { bouton()?.click(); });
    expect(clicLien).not.toHaveBeenCalled(); // on ne force rien : l'internaute a fermé la feuille
  });

  it('refus du partage pour une AUTRE raison → repli sur l’enregistrement', async () => {
    const clicLien = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    (navigator as unknown as { share: unknown }).share = vi.fn(async () => { throw new Error('NotAllowedError'); });
    (navigator as unknown as { canShare: unknown }).canShare = vi.fn(() => true);
    await rendrePret();
    await act(async () => { bouton()?.click(); });
    expect(clicLien).toHaveBeenCalledTimes(1);
  });
});

describe('clic — repli téléchargement (ordinateur, ou partage de fichiers indisponible)', () => {
  it('sans navigator.share → enregistrement depuis l’URL d’OBJET, SANS nouvelle requête', async () => {
    let ancre: HTMLAnchorElement | null = null;
    const clicLien = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      ancre = this;
    });
    await rendrePret();
    act(() => { bouton()?.click(); });
    expect(clicLien).toHaveBeenCalledTimes(1);
    expect(ancre!.getAttribute('href')).toBe('blob:svav/doc'); // le fichier déjà en main
    expect(ancre!.getAttribute('download')).toBe('Visuel-annonce-SVAV-AAAA-BBBB.png');
    expect(fetchMock).toHaveBeenCalledTimes(1); // AUCUNE 2e requête : plus de 401 possible
  });

  it('canShare refuse les fichiers (navigateur sans partage de fichiers) → repli aussi', async () => {
    const clicLien = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const share = vi.fn(async (_d: ShareData) => undefined);
    (navigator as unknown as { share: unknown }).share = share;
    (navigator as unknown as { canShare: unknown }).canShare = vi.fn(() => false);
    await rendrePret();
    act(() => { bouton()?.click(); });
    expect(share).not.toHaveBeenCalled();
    expect(clicLien).toHaveBeenCalledTimes(1);
  });
});

describe('échecs de récupération — jamais de fichier cassé proposé', () => {
  it('401 → « session expirée » + lien de reconnexion, AUCUN bouton de téléchargement', async () => {
    fetchMock.mockResolvedValueOnce(reponse({ status: 401 }));
    await rendrePret();
    expect(container.textContent).toContain(MSG_SESSION_EXPIREE);
    expect(bouton()).toBeNull();
    expect(lien(LIB_SE_RECONNECTER)?.getAttribute('href')).toBe('/espace/connexion');
  });

  it('autre erreur serveur → message de préparation impossible, aucun bouton', async () => {
    fetchMock.mockResolvedValueOnce(reponse({ status: 503 }));
    await rendrePret();
    expect(container.textContent).toContain(MSG_DOCUMENT_NON_PREPARE);
    expect(bouton()).toBeNull();
  });

  it('panne réseau → même message, jamais de plantage', async () => {
    fetchMock.mockImplementationOnce(async () => { throw new Error('network'); });
    await rendrePret();
    expect(container.textContent).toContain(MSG_DOCUMENT_NON_PREPARE);
  });

  it('dans tous les cas, « Retour » reste présent', async () => {
    fetchMock.mockResolvedValueOnce(reponse({ status: 401 }));
    await rendrePret();
    expect(lien(LIB_RETOUR_ESPACE)?.getAttribute('href')).toBe('/espace?analyse=42');
  });
});

describe('nomDepuisDisposition (pur)', () => {
  it('lit le nom entre guillemets, avec ou sans attachment', () => {
    expect(nomDepuisDisposition('inline; filename="Certificat-SAVV-2026-000029.pdf"')).toBe('Certificat-SAVV-2026-000029.pdf');
    expect(nomDepuisDisposition('attachment; filename="Visuel-annonce-SVAV-AAAA-BBBB.png"')).toBe('Visuel-annonce-SVAV-AAAA-BBBB.png');
  });

  it('en-tête absent ou sans nom → null (l’appelant applique un repli)', () => {
    expect(nomDepuisDisposition(null)).toBeNull();
    expect(nomDepuisDisposition('attachment')).toBeNull();
  });

  it('en-tête sans guillemets → nom quand même', () => {
    expect(nomDepuisDisposition('attachment; filename=doc.pdf')).toBe('doc.pdf');
  });
});
