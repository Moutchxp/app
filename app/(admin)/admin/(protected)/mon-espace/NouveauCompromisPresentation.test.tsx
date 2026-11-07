// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MesCompteurs } from './MesCompteurs';
import { URL_MANDAT, URL_REFERENCES, URL_VENTE } from './NouveauCompromis';

/**
 * 🔴 MON ESPACE (Arno, 07/11/2026) — PRÉSENTATION « par côté » du « Nouveau compromis » : un grand bloc par côté, ① répartition du CA, ② commission
 * du négociateur ; le total coupé de même ; les liens du CA dans ①. Seule la disposition change : chaque champ et contrôle est toujours là.
 * (Reprise de l'en-tête des épreuves du taux de commission.) Le VRAI écran,
 * routes simulées (rien n'est écrit, aucun mail). Données fictives.
 *   · « Les deux côtés » : une ligne « entrée et sortie » à 100 %, non modifiable ; seul le taux (pré-rempli du profil), le montant à côté ;
 *   · deux collaborateurs : parts liées (l'une ajuste l'autre), CA par structure, un taux propre à chacun (60 % + 60 % valide), 0 à 100 % ;
 *   · une partie extérieure : refus tant que le total ≠ 100 %, l'écart dit ; non commissionné : inchangé ;
 *   · un collaborateur des deux structures (lu dans les comptes, jamais un nom) : la structure d'abord, puis sa ligne la porte.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const LEA = { id: 5, nom: 'Léa MARTIN', societe: 'criterimmo' as const, tauxCommission: 60 };
const PAUL = { id: 6, nom: 'Paul BERNARD', societe: 'criterimmo' as const };
const MARC = { id: 7, nom: 'Marc DURAND', societe: 'macj' as const, tauxCommission: 35 };
const ZOE = { id: 8, nom: 'Zoé PETIT', societe: 'macj' as const, commissionne: false };
const DEUX = { id: 9, nom: 'Camille DOUBLE', societe: 'les_deux' as const };
const vide = { nb: 0, ids: [] as number[], ca: { htC: 0, ttcC: 0 } };
let titulaire = 5;
let posts: { url: string; corps: Record<string, unknown> }[];
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  posts = []; titulaire = 5;
  try { window.localStorage.setItem('trx-affichage-montants', 'ttc'); } catch { /* sans stockage */ }
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) });
    if (init?.method === 'POST') { posts.push({ url: u, corps: JSON.parse(String(init.body)) }); return ok(99); }
    // La structure imposée par le profil : une seule → imposée ; « les deux » → null (la question reste).
    if (u.startsWith(URL_REFERENCES)) return ok({ disponible: true, aujourdhui: '2026-11-07', titulaireId: titulaire, administrateur: false, lotD: true, personneType: true, prixVente: true,
      mandat: true, uniteCommission: true, negociateurs: [LEA, PAUL, MARC, ZOE, DEUX], apporteurs: [], personnes: [], structureImposee: titulaire === DEUX.id ? null : 'criterimmo' });
    if (u.startsWith(URL_MANDAT)) return ok({ libre: true, numero: 'M-42' });
    if (u.startsWith(URL_VENTE)) return ok(null);
    return ok({ disponible: true, aujourdhui: '2026-11-07', titulaire: { id: titulaire, prenom: 'X', administrateur: false }, ventes: [],
      schema: { lotD: true, personneType: true, uniteCommission: true, prixVente: true, mandat: true }, compteurs: { compromis: vide, actees: { ...vide, annee: 2026 }, parAnnee: [] } });
  }) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-07T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const saisir = async (sel: string, valeur: string) => {
  const el = container.querySelector(sel) as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { set.call(el, valeur); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const texte = (sel: string): string => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
const valeur = (sel: string): string => container.querySelector<HTMLInputElement>(sel)?.value ?? '∅';
const enregistrer = () => container.querySelector<HTMLButtonElement>('[data-enregistrer-dossier]')!;
const soumettre = async () => { await act(async () => { (container.querySelector('[data-formulaire-dossier] form') as HTMLFormElement).requestSubmit(); }); await calmer(); };
const ouvrir = async () => { await act(async () => { root.render(createElement(MesCompteurs)); }); await calmer(); await cliquer('[data-nouveau-compromis-mon-espace]'); };
/** Jusqu'au formulaire, du côté voulu ; la commission et mes clients des deux côtés renseignés. */
const formulaire = async (cote: 'entree' | 'sortie' | 'deux', commission = '12000') => {
  await ouvrir();
  await saisir('[data-parcours-mandat]', 'M-42');
  await cliquer('[data-parcours-verifier]');
  await cliquer(`[data-cote="${cote}"]`);
  await saisir('[data-formulaire-dossier] [data-champ="commission"]', commission);
  for (const [bloc, nom] of [['vendeurs', 'DUPONT'], ['acquereurs', 'MARTIN']] as const) {
    await saisir(`[data-bloc-dossier="${bloc}"] [data-personne-nom]`, nom);
    await saisir(`[data-bloc-dossier="${bloc}"] [data-personne-prenom]`, 'Jean');
    await saisir(`[data-bloc-dossier="${bloc}"] [data-personne-telephone]`, '0600000000');
  }
};
const choisirSortie = async (id: number) => { await cliquer('[data-champ="sortie"]'); await cliquer(`[role="option"][data-option="${id}"]`); };
const n = (x: string): string => x.replace(/\s/g, ' ');
const dans = (bloc: string, zone: string, sel: string) => container.querySelector(`[data-cote-bloc="${bloc}"] [data-zone="${zone}"] ${sel}`);
const zone = (bloc: string, z: string): string => n(container.querySelector(`[data-cote-bloc="${bloc}"] [data-zone="${z}"]`)?.textContent ?? '');
const titres = (): string[] => [...container.querySelectorAll('[data-titre-cote]')].map((t) => t.textContent ?? '');

describe('présentation « par côté » : ① répartition du CA, ② commission du négociateur', () => {
  it('« Les deux côtés » : UN grand bloc ; la ligne unique en ①, le taux en ② (« calculée sur sa part de … ») ; le total coupé, ② sans « 100 % »', async () => {
    await formulaire('deux');
    expect(titres()).toEqual(['Côtés vendeur et acquéreur — Entrée et sortie du mandat']);
    expect(dans('deux', 'ca', '[data-ligne-deux-cotes]')).not.toBeNull();
    expect(zone('deux', 'ca')).toContain('Le total des deux côtés fait toujours 100 % des honoraires.');
    expect(dans('deux', 'commission', '[data-taux="commission-entree"]')).not.toBeNull();
    expect(dans('deux', 'commission', '[data-champ="commission-entree"]')).not.toBeNull();
    expect(zone('deux', 'commission')).toContain('Taux propre à ce négociateur, indépendant de l’autre côté.');
    expect(n(dans('deux', 'commission', '[data-base-commission="entree"]')!.textContent!)).toBe('calculée sur sa part de 12 000 € TTC');
    expect(container.querySelector('[data-propose]')).toBeNull(); // « Les deux côtés » aussi : la ligne « proposé » retirée
    expect(zone('total', 'ca-total')).toContain('CRITERIMMO reçoit 100 % des honoraires');
    expect(zone('total', 'commission-total')).toContain('Léa MARTIN — taux 60 % — 7 200 € TTC (6 000 € HT)');
    expect(zone('total', 'commission-total')).not.toMatch(/100\s?%/);
  });

  it('même structure : deux grands blocs ; négociateur, structure, parts en ① ; taux et commission en ② ; total ① « = 100 % » avec les liens, ② une ligne par négociateur et leur total', async () => {
    await formulaire('entree');
    await choisirSortie(PAUL.id);
    await saisir('[data-partie-pct="0"]', '60');
    await saisir('[data-taux="commission-sortie"]', '60');
    expect(titres()).toEqual(['Côté vendeur — Entrée du mandat', 'Côté acquéreur — Sortie du mandat']);
    for (const [bloc, i, c] of [['entree', 0, 'entree'], ['sortie', 1, 'sortie']] as const) {
      for (const sel of [`[data-champ="${c}"]`, `[data-societe-partie="${i}"]`, `[data-partie-pct="${i}"]`, `[data-partie-eur="${i}"]`]) expect(dans(bloc, 'ca', sel)).not.toBeNull();
      for (const sel of [`[data-taux="commission-${c}"]`, `[data-champ="commission-${c}"]`, `[data-base-commission="${c}"]`]) expect(dans(bloc, 'commission', sel)).not.toBeNull();
      expect(dans(bloc, 'ca', `[data-taux="commission-${c}"]`)).toBeNull();
    }
    expect(n(dans('entree', 'commission', '[data-base-commission="entree"]')!.textContent!)).toBe('calculée sur sa part de 7 200 € TTC');
    // 🔴 Arno (07/11/2026) — la ligne « proposé : … (sa part : …) » retirée de ce formulaire ; « calculée sur sa part de … » reste.
    expect(container.querySelector('[data-propose]')).toBeNull();
    expect(n(container.querySelector('[data-ca-structures]')!.textContent!)).toBe('CRITERIMMO 12 000 € TTC (100 %) · MACJ 0 € TTC (0 %) = 100 %');
    expect(dans('total', 'ca-total', '[data-ajouter-exterieure]')).not.toBeNull();
    expect(dans('total', 'ca-total', '[data-revenir-5050]')).not.toBeNull();
    expect(dans('total', 'ca-total', '[data-total-pct]')).not.toBeNull();
    expect([...container.querySelectorAll('[data-commission-negociateur]')].map((l) => n(l.textContent!))).toEqual([
      'Léa MARTIN — taux 60 % — 4 320 € TTC (3 600 € HT)', 'Paul BERNARD — taux 60 % — 2 880 € TTC (2 400 € HT)']);
    expect(n(container.querySelector('[data-commissions-somme]')!.textContent!)).toBe('Total des commissions — 7 200 € TTC (6 000 € HT)');
    expect(zone('total', 'commission-total')).not.toMatch(/100\s?%/);
  });

  it('structures différentes : CA par structure (70 % / 30 %) et la mention inter-cabinet en ① du total', async () => {
    await formulaire('entree');
    await choisirSortie(MARC.id);
    await saisir('[data-partie-pct="0"]', '70');
    expect(n(container.querySelector('[data-ca-structures]')!.textContent!)).toBe('CRITERIMMO 8 400 € TTC (70 %) · MACJ 3 600 € TTC (30 %) = 100 %');
    expect(dans('total', 'ca-total', '[data-reverse-form="macj"]')).not.toBeNull();
    expect(dans('total', 'ca-total', '[data-inter-cabinet-form]')).not.toBeNull();
    expect(dans('sortie', 'commission', '[data-taux="commission-sortie"]')).not.toBeNull();
  });

  it('un collaborateur des deux structures : son choix de structure est en ① de son bloc', async () => {
    titulaire = DEUX.id;
    await ouvrir();
    await cliquer('[data-structure="macj"]');
    await saisir('[data-parcours-mandat]', 'M-42');
    await cliquer('[data-parcours-verifier]');
    await cliquer('[data-cote="entree"]');
    expect(dans('entree', 'ca', '[data-choix-societe-vente="partie-0"]')).not.toBeNull();
    expect(dans('entree', 'ca', '[data-societe-vente="macj"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(dans('entree', 'commission', '[data-choix-societe-vente]')).toBeNull();
  });

  it('une partie extérieure : son bloc n’a que la partie ① (nom, coordonnées, parts, croix) ; aucun contrôle perdu', async () => {
    await formulaire('entree');
    await choisirSortie(MARC.id);
    await cliquer('[data-ajouter-exterieure]');
    const ext = container.querySelector('[data-cote-bloc="exterieure"]')!;
    expect(ext.querySelector('[data-titre-cote]')!.textContent).toBe('Partie extérieure');
    expect(ext.querySelectorAll('[data-zone]')).toHaveLength(1);
    for (const sel of ['[data-partie-nom]', '[data-partie-coordonnees]', '[data-partie-pct="2"]', '[data-partie-eur="2"]', '[data-retirer-exterieure]']) expect(ext.querySelector(`[data-zone="ca"] ${sel}`)).not.toBeNull();
    // Rien de retiré : apporteur, rétrocession, base, et les champs des deux côtés.
    for (const sel of ['[data-champ="apporteur-annuaire"]', '[data-montant-unite="retro"]', '[data-resume-base]', '[data-champ="entree"]', '[data-champ="sortie"]',
      '[data-partie-pct="0"]', '[data-partie-pct="1"]', '[data-taux="commission-entree"]', '[data-taux="commission-sortie"]', '[data-total-pct]', '[data-total-eur]']) expect(container.querySelector(sel)).not.toBeNull();
  });

  it('la tuile Suivi CA (sans l’option) garde sa disposition : aucun bloc « par côté »', async () => {
    const { BlocRepartition } = await import('../transaction/Repartition');
    await act(async () => { root.render(createElement(BlocRepartition, { etat: { entreeId: 5, sortieId: 7, apporteurId: null, retroTexte: '',
      commissions: { entree: { texte: '', unite: 'ttc', auto: true }, sortie: { texte: '', unite: 'ttc', auto: true } },
      parties: [{ sorte: 'entree', compteId: 5, negociateur: 'Léa MARTIN', societe: 'criterimmo', nom: null, coordonnees: null, mode: 'pct', texte: '50' },
        { sorte: 'sortie', compteId: 7, negociateur: 'Marc DURAND', societe: 'macj', nom: null, coordonnees: null, mode: 'pct', texte: '50' }] },
      onChange: () => {}, negociateurs: [LEA, MARC], apporteurs: [], honorairesTtc: 12000, societeVente: 'criterimmo' })); });
    expect(container.querySelector('[data-cote-bloc], [data-zone], [data-ca-structures]')).toBeNull();
    expect(container.querySelector('[data-bloc-repartition] > .trx-actions [data-revenir-5050]')).not.toBeNull();
    expect(n(container.querySelector('[data-propose="commission-entree"]')?.textContent ?? '')).toContain('proposé : 50 % de');
  });
});
