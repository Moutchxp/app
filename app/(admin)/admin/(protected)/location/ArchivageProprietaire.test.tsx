// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 🔴🔴 « SUPPRIMER UN PROPRIÉTAIRE » (Arno, 18/10/2026) — le VRAI écran, routes simulées : rien ne part, rien n'est écrit.
 *   ① au départ, une ligne de recherche seulement ; la recherche ne demande QUE des propriétaires (pastille rouge) ;
 *   ② clic → la fiche commune (même composant que la Gestion) et, collés en haut, la recherche puis le GROS BOUTON ;
 *   ③ aucun bien occupé → bouton rouge « Archiver le propriétaire et son historique » → confirmation simple → sortie ;
 *   ④ au moins un bien occupé → bouton orange → modale des biens occupés (adresse, lot, locataire, entrée), le bien
 *      partagé dit « PAS archivé » → « Confirmer l'archivage du propriétaire et de ses biens » envoie la confirmation ;
 *   ⑤ archivé → « Réactiver le propriétaire et ses biens ».
 */
vi.mock('../gestion/FicheCommune', () => ({
  FicheCommuneLocation: ({ fiche, ouvrir }: { fiche: { sorte: string; id: number }; ouvrir?: (f: { sorte: string; id: number } | null) => void }) =>
    createElement('div', { 'data-fiche-commune': `${fiche.sorte}-${fiche.id}` },
      createElement('button', { type: 'button', 'data-ouvrir-bien': true, onClick: () => ouvrir?.({ sorte: 'lot', id: 40 }) }, 'Ouvrir le bien 40')),
}));
import { EcranArchivageProprietaire } from './ArchivageProprietaire';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
const ligne = (id: number, titre: string, o: Record<string, unknown> = {}) => ({ id, titre, telephone: null, email: null, adresse: null, detail: null, ancien: false, ...o });
const apercu = (o: Record<string, unknown> = {}) => ({
  sujet: 'proprietaire', id: 7, nom: 'EXEMPLE Claire', sortie: null, biens: [40, 41], partages: [], occupees: [], locatairesArchives: [], locatairesGardes: [], ...o,
});

let container: HTMLDivElement;
let root: Root;
let appels: string[];
let envois: Record<string, unknown>[];
let reponseApercu: () => unknown;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = []; envois = [];
  reponseApercu = () => apercu();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    appels.push(u);
    if (init?.method === 'POST') {
      envois.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return ok({ biens: 2, locations: 1, locataires: 1 });
    }
    if (u.includes('proprietairesArchivage=')) {
      return ok({ proprietaires: [ligne(7, 'EXEMPLE Claire', { telephone: '06 12 34 56 78', adresse: '14 rue de l’Essai, PARIS' }), ligne(9, 'ANCIEN Paul', { ancien: true })],
        locataires: [], syndics: [], biens: [], tronque: false });
    }
    if (u.includes('apercuArchivage=')) return ok(reponseApercu());
    return ok({});
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); document.body.innerHTML = ''; vi.useRealTimers(); });

async function calmer(): Promise<void> { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); }
async function taper(texte: string): Promise<void> {
  const input = container.querySelector('input[type="search"]') as HTMLInputElement;
  vi.useFakeTimers();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, texte);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { vi.advanceTimersByTime(250); });
  vi.useRealTimers();
  await calmer();
}
async function cliquer(el: Element | null): Promise<void> {
  if (el === null) throw new Error('élément absent');
  await act(async () => { (el as HTMLElement).click(); });
  await calmer();
}
async function ouvrirClaire(): Promise<void> {
  await act(async () => { root.render(createElement(EcranArchivageProprietaire, { refusFiche: null })); });
  await taper('exemple');
  await cliquer(container.querySelector('[data-index="0"]'));
}
const bouton = () => container.querySelector('[data-bouton-archivage] .arc-gros') as HTMLButtonElement | null;

describe('🔴 « Supprimer un propriétaire »', () => {
  it('① au départ : la ligne de recherche seule ; la recherche ne vise QUE les propriétaires (pastille rouge, anciens en bas)', async () => {
    await act(async () => { root.render(createElement(EcranArchivageProprietaire, { refusFiche: null })); });
    expect(container.querySelectorAll('input[type="search"]')).toHaveLength(1);
    expect(container.querySelector('[data-bouton-archivage]')).toBeNull();
    expect(container.querySelector('[data-fiche-commune]')).toBeNull();
    await taper('exemple');
    expect(appels.some((u) => u.includes('proprietairesArchivage=exemple'))).toBe(true);
    expect(appels.some((u) => /[?&]q=/.test(u))).toBe(false);
    const types = [...container.querySelectorAll('.loc-res-type')].map((x) => [x.className, x.textContent]);
    expect(types).toEqual([['loc-res-type loc-res-type--proprietaires', 'Propriétaire'], ['loc-res-type loc-res-type--ancien', 'Ancien · Propriétaire']]);
  });

  it('② clic : la fiche commune sous la recherche et le gros bouton, tous deux dans le bandeau collant ; navigation vers un bien', async () => {
    await ouvrirClaire();
    expect(container.querySelector('[data-fiche-commune]')?.getAttribute('data-fiche-commune')).toBe('proprietaire-7');
    const collant = container.querySelector('[data-collant]');
    expect(collant?.querySelector('input[type="search"]')).not.toBeNull();
    expect(collant?.querySelector('[data-bouton-archivage]')).not.toBeNull();
    expect(collant?.contains(container.querySelector('[data-fiche-commune]'))).toBe(false);
    await cliquer(container.querySelector('[data-ouvrir-bien]'));
    expect(container.querySelector('[data-fiche-commune]')?.getAttribute('data-fiche-commune')).toBe('lot-40');
    // Le bouton reste celui du propriétaire ; un lien ramène à sa fiche.
    expect(bouton()?.textContent).toBe('Archiver le propriétaire et son historique');
    await cliquer([...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Revenir à la fiche du propriétaire')) ?? null);
    expect(container.querySelector('[data-fiche-commune]')?.getAttribute('data-fiche-commune')).toBe('proprietaire-7');
  });

  it('③ aucun bien occupé : bouton ROUGE → confirmation simple → sortie (sans confirmation d’occupation)', async () => {
    await ouvrirClaire();
    expect(bouton()?.className).toBe('arc-gros arc-gros--archiver');
    await cliquer(bouton());
    expect(container.querySelector('[data-modale-archivage]')).toBeNull();
    await cliquer(container.querySelector('[data-confirmer-archivage]'));
    expect(envois).toEqual([{ action: 'sortir', sujet: 'proprietaire', id: 7 }]);
    expect(container.textContent).toContain('EXEMPLE Claire est archivé');
  });

  it('④ un bien occupé : bouton ORANGE → modale des biens occupés, bien partagé « PAS archivé » → confirmation envoyée', async () => {
    reponseApercu = () => apercu({
      occupees: [{ occupationId: 3, lotId: 40, adresse: '14 rue de l’Essai, PARIS', lot: '315', locataireId: 2, locataire: 'MODÈLE Jules', entree: '2024-09-01' }],
      partages: [{ lotId: 50, adresse: '9 rue Partagée, PARIS', lot: null, autres: ['COINDIVIS Marc'], occupe: false }],
    });
    await ouvrirClaire();
    expect(bouton()?.className).toBe('arc-gros arc-gros--alerte');
    expect(bouton()?.textContent).toContain('Attention, au moins un bien est actuellement occupé par un locataire');
    await cliquer(bouton());
    const modale = document.querySelector('[data-modale-archivage]');
    expect(modale).not.toBeNull();
    const occ = modale?.querySelector('[data-occupation="3"]');
    expect(occ?.textContent).toContain('14 rue de l’Essai, PARIS · lot 315');
    expect(occ?.textContent).toContain('MODÈLE Jules');
    expect(occ?.textContent).toContain('entré(e) le 01/09/2024');
    expect(modale?.querySelector('[data-biens-partages]')?.textContent).toContain('n’est PAS archivé');
    expect(modale?.querySelector('[data-biens-partages]')?.textContent).toContain('COINDIVIS Marc');
    const confirmer = modale?.querySelector('[data-confirmer-archivage]');
    expect(confirmer?.textContent).toBe('Confirmer l’archivage du propriétaire et de ses biens');
    // « Annuler » ferme sans rien envoyer.
    await cliquer([...(modale?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Annuler') ?? null);
    expect(document.querySelector('[data-modale-archivage]')).toBeNull();
    expect(envois).toEqual([]);
    await cliquer(bouton());
    await cliquer(document.querySelector('[data-confirmer-archivage]'));
    expect(envois).toEqual([{ action: 'sortir', sujet: 'proprietaire', id: 7, confirmeOccupation: true }]);
  });

  it('⑤ archivé : l’état daté et « Réactiver le propriétaire et ses biens »', async () => {
    reponseApercu = () => apercu({ sortie: { le: '2026-10-18T10:00:00Z', par: 'Arno' }, biens: [] });
    await ouvrirClaire();
    expect(container.querySelector('[data-archive]')?.textContent).toContain('Archivé le 18/10/2026 par Arno');
    expect(bouton()?.textContent).toBe('Réactiver le propriétaire et ses biens');
    await cliquer(bouton());
    expect(envois).toEqual([{ action: 'reactiver', sujet: 'proprietaire', id: 7 }]);
  });

  it('sans le droit Gestion : la fiche commune n’est pas montée, le motif est dit', async () => {
    await act(async () => { root.render(createElement(EcranArchivageProprietaire, { refusFiche: 'Droit « Gestion » requis.' })); });
    await taper('exemple');
    await cliquer(container.querySelector('[data-index="0"]'));
    expect(container.querySelector('[data-fiche-commune]')).toBeNull();
    expect(container.textContent).toContain('Droit « Gestion » requis.');
  });
});
