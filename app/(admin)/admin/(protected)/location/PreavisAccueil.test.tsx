// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { BlocPreavisAccueil, CLE_TRI, CSS_PREAVIS_ACCUEIL } from './PreavisAccueil';
import { FicheInterventionPreavis } from './FicheInterventionPreavis';
import { ficheDepuisEncart, texteFicheIntervention } from '../../../../lib/location/ficheIntervention';
import { AccueilLocation } from './AccueilLocation';
import { PageCompteRendu, motifSansFormulaire } from './PageCompteRendu';
import { naviguerRetour } from '../_composants/NavigationRetour';
import { cheminCompteRendu, redirectionAncienLien } from '../../../../lib/location/cheminCompteRendu';
import { EcranSortieLocataire } from './SortieLocataires';
import { SectionLocationLocataire } from '../gestion/SectionsLocationFiche';
import type { BailLogement, EncartLogement } from '../../../../lib/location/sortieLocataires';
import type { LignePreavisAccueil } from '../../../../lib/location/preavis';
// 🔴 Arno (13/11/2026, lot B) — la conversion de la photo (navigateur) est simulée : jsdom ne décode aucune image
// 🔴 Arno (14/11/2026, iPhone) — les chargements des deux modules sont COMPTÉS : ils ne se chargent qu'au toucher, jamais à l'ouverture
const charges = vi.hoisted(() => ({ photo: 0, vocal: 0 }));
vi.mock('../../../../lib/location/enregistreurVocal', async (orig) => { charges.vocal += 1; return await orig(); });
vi.mock('../../../../lib/location/photoEcran', () => (charges.photo += 1, {
  convertirPhoto: async (f: File) => ({ ok: true, blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), nom: f.name.replace(/\.[^.]+$/, '.jpg'), largeur: 1600, hauteur: 1200 }),
  enBase64: async () => '/9j/',
}));

/**
 * ACCUEIL LOCATION — LE BLOC « LOCATAIRES EN PRÉAVIS » (Arno, 18/10/2026). Les VRAIS composants, routes simulées : rien ne
 * part, rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
const HIER = (() => { const d = new Date(Date.now() - 86_400_000); return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }); })();

const ligne = (cle: string, o: Partial<LignePreavisAccueil> = {}): LignePreavisAccueil => ({
  cle, lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', occupationId: 11, occupationIds: [11, 12],
  locataires: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice' }, { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul' }],
  recuLe: '2026-10-01', dateMax: '2099-11-01', etatDesLieuxLe: null, ...o,
});
/** A : fin lointaine, EDL proche · B : échu, sans EDL · C : fin moyenne, EDL lointain. */
const LIGNES = [
  ligne('A', { dateMax: '2099-12-01', etatDesLieuxLe: '2099-01-10', adresse: 'A rue', occupationId: 21, occupationIds: [21, 22],
    locataires: [{ occupationId: 21, locataireId: 201, nom: 'BERNARD Alice' }, { occupationId: 22, locataireId: 202, nom: 'BERNARD Paul' }] }),
  ligne('B', { dateMax: '2020-01-01', recuLe: '2019-12-01', adresse: 'B rue', occupationId: 31, occupationIds: [31],
    locataires: [{ occupationId: 31, locataireId: 301, nom: 'ECHU Bob' }] }),
  ligne('C', { dateMax: '2099-11-01', etatDesLieuxLe: '2099-06-01', adresse: 'C rue' }),
];
/** L'encart « Le logement » (tout ce qui existe ; les champs absents valent `null` et ne s'affichent pas). */
export const ENCART: EncartLogement = {
  lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', type: 'Appartement T3', meuble: false, etage: '3', porte: 'G', numLotCopro: null,
  numeroLot: '100', batiment: 'B', escalier: null, surfaceCarrez: null, surfaceHabitable: null, surface: null, surfaceExterieure: null,
  nombrePieces: null, ascenseur: true, digicode: true, digicodeCode: '4521A', precisionAcces: 'Code au portail', dpeClasse: null, dpeDate: null,
  dpeNonSoumis: null, chauffage: null, epoqueConstruction: null,
  lots: [
    { lotId: 7, role: 'logement', type: 'Appartement T3', etage: '3', numLotCopro: null, numeroLot: '100', porte: 'G', place: false },
    { lotId: 8, role: 'annexe', type: 'Parking', etage: '-1', numLotCopro: null, numeroLot: null, porte: '12', place: true },
  ],
  proprietaire: { id: 5, nom: 'DUPONT Jean' }, syndic: null,
  bail: { entree: null, loyerHc: null, provisions: null, taux: null, base: null },
  coordonnees: {
    proprietaire: { telephones: ['06 11 22 33 44'], emails: ['jean@exemple.test'] },
    locataires: [
      { occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', telephones: ['06 55 66 77 88'], emails: ['alice@exemple.test'] },
      { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', telephones: [], emails: [] },
    ],
  },
};
const BAIL: BailLogement = {
  lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', type: 'Appartement', etage: '3', porte: 'G', proprietaire: 'DUPONT Jean', entree: '2022-09-01',
  locataires: [
    { occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01' },
    { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', entree: '2022-09-01' },
  ],
  annexes: [], autresOccupants: [],
};

let container: HTMLDivElement;
let root: Root;
let lignes: LignePreavisAccueil[];
let posts: Record<string, unknown>[];
let planification = false;
let statutPose: string = 'en_attente';
beforeEach(async () => {
  // 🔴 (7e retour) le micro est gardé ouvert d'un appui à l'autre : chaque épreuve repart d'un micro fermé
  (await import('../../../../lib/location/enregistreurVocal')).libererMicro();
  planification = false;
  statutPose = 'en_attente';
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  try { window.localStorage.removeItem(CLE_TRI); } catch { /* sans stockage */ }
  lignes = LIGNES.map((l) => ({ ...l }));
  posts = [];
  global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push(corps);
      // La sortie validée : le serveur ne rend plus la ligne (le locataire est sorti).
      if (corps.action === 'sortie-locataires') lignes = lignes.filter((l) => !l.occupationIds.includes(Number(corps.occupationId)));
      if (String(corps.action).endsWith('-edls')) {
        // Le serveur relit ensuite la ligne AVEC son EDLS (comme `preavisEnCours`).
        const noms: Record<number, string> = { 3: 'Arno Test', 4: 'Claire Test' };
        lignes = lignes.map((l) => {
          if (JSON.stringify(l.occupationIds) !== JSON.stringify(corps.occupationIds)) return l;
          const avant = l.edls ?? null;
          const jour = String(corps.jour ?? avant?.jour ?? '');
          const [h1, m1] = String(corps.debut ?? avant?.heure ?? '00:00').split(':').map(Number);
          const [h2, m2] = String(corps.fin ?? '').split(':').map(Number);
          return { ...l, etatDesLieuxLe: jour, edls: {
            edlsId: 77, tacheId: 500, jour, heure: String(corps.debut ?? avant?.heure), dureeMinutes: corps.fin ? (h2 * 60 + m2) - (h1 * 60 + m1) : avant?.dureeMinutes ?? 60,
            confieA: noms[Number(corps.confieA)] ?? '', confieAId: Number(corps.confieA), statut: statutPose as 'en_attente', reponduPar: null, motifRefus: null } };
        });
        return ({ ok: true, json: async () => ({ etat: 'ok', data: { edlsId: 77, statut: statutPose, mails: [{ destinataire: 'Claire Test', etat: 'factice' }], agenda: '' } }) }) as unknown as Response;
      }
      // 🔴 (15/11/2026) — l'aperçu du compte rendu rend toujours la phrase de présence (l'écran la vérifie en tête de chaque mail)
      if (corps.action === 'apercu-compte-rendu-previsite') return ok({ mails: [], sansEmail: [], phrase: 'En présence de Alice BERNARD.' });
      return ({ ok: true, json: async () => ({ etat: 'ok', data: {}, mail: { etat: 'sans_adresse' } }) }) as unknown as Response;
    }
    const s = String(u);
    if (s.includes('preavisEnCours=1')) return ok({ disponible: true, etatDesLieux: true, planification, lignes });
    if (s.includes('encartBail=')) return ok(ENCART);
    if (s.includes('edlsConfiables=1')) return ok([{ id: 3, libelle: 'Arno Test', accesGestion: true }, { id: 4, libelle: 'Claire Test', accesGestion: true }]);
    if (s.includes('bail=')) return ok(BAIL);
    return ok({ lignes: [], total: 0, page: 0 });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

/** 🔴 Arno (15/11/2026) — la présence est obligatoire pour voir le récapitulatif du compte rendu : on coche le premier locataire. */
const cocherPresence = (): void => { const c = document.querySelector('[data-presence-locataire]') as HTMLInputElement | null; if (c && !c.checked) act(() => c.click()); };
const attendre = async (): Promise<void> => { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); };
async function rendre(gestion = true): Promise<void> {
  await act(async () => { root.render(createElement(BlocPreavisAccueil, { gestion })); });
  await attendre();
}
/**
 * 🔴 Arno (15/11/2026, 5e retour iPhone) — le compte rendu est une PAGE à part entière : « suivre » le lien de la frise = démonter la Location
 * et rendre la page à sa place (jsdom ne change pas de page). Le retour (« Annuler », après l'envoi) passe par `naviguerRetour.vers`, noté.
 */
let retours: string[] = [];
beforeEach(() => { retours = []; naviguerRetour.vers = (url: string) => { retours.push(url); window.history.replaceState(null, '', url); }; });
afterEach(() => { try { window.sessionStorage.clear(); } catch { /* rien */ } window.history.replaceState(null, '', '/'); });
async function suivreLienCr(): Promise<void> {
  // 🔴 (9e retour) le bouton de la frise ouvre la FENÊTRE du compte rendu ; « Continuer la saisie » y mène à la PAGE du formulaire
  act(() => (container.querySelector('button[data-compte-rendu-previsite]') as HTMLButtonElement).click());
  await attendre();
  const a = document.querySelector('a[data-continuer-saisie]') as HTMLAnchorElement;
  const occ = Number(/\/admin\/location\/previsite\/(\d+)\/compte-rendu$/.exec(a.getAttribute('href') ?? '')![1]);
  act(() => root.unmount()); root = createRoot(container);
  window.history.replaceState(null, '', a.getAttribute('href'));
  await act(async () => { root.render(createElement(PageCompteRendu, { occupationId: occ })); });
  await attendre(); await attendre();
}
/** Le retour sur la Location (après « Annuler » ou l'envoi) : la page démontée, la Location rendue à l'adresse de retour. */
async function revenirSurLocation(): Promise<void> {
  act(() => root.unmount()); root = createRoot(container);
  await rendre(true); await attendre(); await attendre();
}
const ordre = (): string[] => [...container.querySelectorAll('[data-ligne-preavis]')].map((li) => li.getAttribute('data-ligne-preavis')!);
const clic = (sel: string): void => act(() => (container.querySelector(sel) as HTMLButtonElement).click());
/** 🔴 Arno (18/11/2026) — l'heure d'un rendez-vous se choisit en deux listes (heure, minutes) : « saisir » les remplit. */
function choisirHeure(el: Element, v: string): void {
  const [h, m] = v.split(':');
  for (const [sel, x] of [['[data-heure]', h], ['[data-minute]', m]] as const) {
    const champ = el.querySelector(sel) as HTMLElement;
    flushSync(() => champ.click()); // la liste s'ouvre tout de suite (le choix suit dans le même geste)
    const o = champ.closest('.lch')!.querySelector(`li[data-option="${x ?? ''}"]`) as HTMLElement;
    flushSync(() => o.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  }
}
/** Choisir une heure (et, si donnée, une minute) dans un choix d'heure. */
function choisirHeureDans(el: Element, h: string, m: string | null): void {
  for (const [sel, x] of [['[data-heure]', h], ...(m === null ? [] : [['[data-minute]', m]])] as const) {
    const champ = el.querySelector(sel) as HTMLElement;
    flushSync(() => champ.click());
    flushSync(() => (champ.closest('.lch')!.querySelector(`li[data-option="${x}"]`) as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })));
  }
}
function saisir(el: HTMLInputElement, v: string): void {
  if (el.hasAttribute('data-choix-heure')) { choisirHeure(el, v); return; }
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('placement : le même espace que barre de recherche → cases', () => {
  it('entre les cases et le bloc, le MÊME espace réservé (mêmes classes) qu’entre la barre de recherche et les cases', async () => {
    await act(async () => { root.render(createElement(AccueilLocation, { gestion: true })); });
    await attendre();
    const page = container.querySelector('.loc-page')!;
    const enfants = [...page.children];
    const iCases = enfants.findIndex((e) => e.matches('ul.loc-cases'));
    const avant = enfants[iCases - 1];
    const apres = enfants[iCases + 1];
    expect(avant.className).toBe('loc-zone-resultats loc-zone-resultats--vide');
    expect(apres.className).toBe(avant.className);
    expect(apres.hasAttribute('data-espace-preavis')).toBe(true);
    expect(enfants[iCases + 2].matches('[data-bloc-preavis]')).toBe(true);
  });
});

describe('les lignes', () => {
  it('hauteur CONSTANTE : une hauteur fixe (bureau et téléphone) ; 🔴 (15/11/2026) DEUX lignes : nom(s) + adresse, puis colonnes fixes (fin de préavis, rendez-vous, détails) ; texte complet en infobulle', async () => {
    const regle = (sel: string, css: string): string => new RegExp(`${sel.replace('.', '\\.')}\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    const [bureau, mobile] = CSS_PREAVIS_ACCUEIL.split('@media');
    expect(regle('.pva-ligne', bureau)).toMatch(/(^|;)height:4\.75rem/);
    expect(regle('.pva-ligne', mobile)).toMatch(/(^|;)height:10\.5rem/); // 🔴 (16/11/2026) la place de la mention « date dépassée — … »
    expect(CSS_PREAVIS_ACCUEIL).not.toMatch(/\.pva-ligne\{[^}]*min-height/);
    expect(CSS_PREAVIS_ACCUEIL).toMatch(/\.pva-noms,\.pva-detail\{[^}]*white-space:nowrap;overflow:hidden;text-overflow:ellipsis/);
    // les colonnes FIXES, communes à tout le listing : une seule règle de grille, des largeurs fixes (pas de largeur calculée par ligne)
    // 🔴 Arno (18/11/2026) — + la colonne des LOCATAIRES (largeur de son contenu), à droite de la mission
    expect(regle('.pva-l2', bureau)).toBe('display:grid;grid-template-columns:11.75rem 16rem minmax(0,21rem) max-content minmax(0,1fr);align-items:center;column-gap:12px;min-width:0;font-size:.88rem');
    expect(regle('.pva-l2', mobile)).toBe('grid-template-columns:minmax(0,1fr);row-gap:2px');
    expect(mobile).toContain('.pva-col-rdv{order:-2}');
    expect(mobile).toContain('.pva-col-mission{order:-1;min-height:1.2rem}');
    await rendre();
    const a = container.querySelector('[data-ligne-preavis="A"]')!;
    expect(a.querySelector('.pva-noms')?.getAttribute('title')).toBe('BERNARD Alice, BERNARD Paul');
    expect(a.querySelector('[data-adresse-ligne]')?.textContent).toBe('A rue');
    expect([...a.querySelectorAll('.pva-l2 > span')].map((x) => [x.className, x.textContent])).toEqual([
      ['pva-col-fin', 'Fin de préavis 01/12/2099'], ['pva-col-rdv pva-col-rdv--aucun', '— Aucun RDV fixé'], ['pva-col-mission', ''], ['pva-col-loc', ''], ['pva-col-details pva-detail', 'État des lieux le 10/01/2099']]);
    // rien n'est retiré : tout le texte d'avant reste en infobulle de la ligne
    expect(a.querySelector('.pva-textes')?.getAttribute('title')).toBe('BERNARD Alice, BERNARD Paul — A rue · Fin de préavis le 01/12/2099 · État des lieux le 10/01/2099');
    expect(container.querySelector('[data-ligne-preavis="B"] [data-col-fin]')?.textContent).toBe('Fin de préavis 01/01/2020');
    expect(a.querySelectorAll('.pva-textes > span')).toHaveLength(2);
    expect(container.querySelector('[data-nombre-preavis]')?.textContent).toBe('3');
  });

  it('🔴 (15/11/2026) le STATUT de la ligne à la place de « en préavis » fixe (bleu, avec le mot) ; date passée → « Préavis échu — sortie à saisir » en plus', async () => {
    await rendre();
    expect(container.querySelector('[data-ligne-preavis="A"] [data-statut-ligne]')?.textContent).toBe('En préavis');
    expect(container.querySelector('[data-ligne-preavis="A"] [data-statut-ligne]')?.className).toBe('psl-statut psl-statut--en_preavis');
    expect(container.querySelector('[data-ligne-preavis="A"] [data-preavis]')).toBeNull();
    expect(container.querySelector('[data-ligne-preavis="B"] [data-preavis]')?.textContent).toBe('Préavis échu — sortie à saisir');
    expect(container.querySelector('[data-ligne-preavis="B"] [data-preavis]')?.getAttribute('data-preavis')).toBe('echu');
    expect(container.querySelectorAll('[data-ligne-preavis="B"] [data-statut-ligne]')).toHaveLength(1);
    expect(container.querySelector('[data-ligne-preavis="B"] [data-preavis]')?.className).toBe('pvs-mention pvs-mention--echu');
  });

  it('état vide : « Aucun locataire en préavis »', async () => {
    lignes = [];
    await rendre();
    expect(container.querySelector('[data-preavis-vide]')?.textContent).toBe('Aucun locataire en préavis');
  });
});

describe('les tris', () => {
  it('par défaut : fin de préavis la plus proche d’abord ; les 4 sens ; sans état des lieux toujours en dernier ; mémorisé localement', async () => {
    await rendre();
    // 🔴 (15/11/2026) par défaut le tri chronologique des rendez-vous prime ; sans rendez-vous, l'ordre du panneau (fin de préavis) s'applique
    expect(ordre()).toEqual(['B', 'C', 'A']);
    expect(container.querySelector('[data-tri-rdv]')!.getAttribute('data-tri-rdv')).toBe('proches');
    expect(container.querySelectorAll('button.pva-segment[data-tri][aria-pressed="true"]')).toHaveLength(0);
    clic('button[data-tri="fin:desc"]');
    expect(container.querySelector('[data-tri-rdv]')!.getAttribute('data-tri-rdv')).toBe('off'); // un tri du panneau désactive le tri chronologique
    expect(ordre()).toEqual(['A', 'C', 'B']);
    clic('button[data-tri="edl:asc"]');
    expect(ordre()).toEqual(['A', 'C', 'B']);
    clic('button[data-tri="edl:desc"]');
    expect(ordre()).toEqual(['C', 'A', 'B']);
    expect(container.querySelectorAll('button.pva-segment[aria-pressed="true"]')).toHaveLength(1);
    expect(window.localStorage.getItem(CLE_TRI)).toBe('edl:desc');
    // Relu au retour sur l'accueil.
    act(() => root.unmount()); root = createRoot(container);
    await rendre();
    expect(ordre()).toEqual(['C', 'A', 'B']);
  });

  it('Arno (19/10/2026) : le tri ACTIF en ROUGE (texte blanc, jetons du thème) avec aria-pressed ; les autres blancs', async () => {
    expect(CSS_PREAVIS_ACCUEIL).toContain('.pva-segment[aria-pressed="true"]{background:var(--color-svv-red);color:var(--color-svv-surface);border-color:var(--color-svv-red)');
    expect(CSS_PREAVIS_ACCUEIL).toMatch(/\.pva-segment\{[^}]*background:var\(--color-svv-surface\)/);
    await rendre();
    clic('button[data-tri="edl:desc"]');
    expect([...container.querySelectorAll('button.pva-segment')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'true']);
  });

  it('cibles tactiles ≥ 44 px', () => {
    expect(CSS_PREAVIS_ACCUEIL).toMatch(/\.pva-segment\{min-height:44px/);
    expect(CSS_PREAVIS_ACCUEIL).toMatch(/\.pva-ouvrir\{min-height:44px/);
  });
});

describe('la ligne dépliée', () => {
  it('« Ouvrir » / « Fermer » ; liens vers la fiche et l’écran de sortie', async () => {
    await rendre();
    clic('button[data-ouvrir-preavis="C"]');
    expect(container.querySelector('button[data-ouvrir-preavis="C"]')?.textContent).toBe('Fermer');
    const d = container.querySelector('[data-ligne-depliee="C"]')!;
    expect([...d.querySelectorAll('a[data-lien-fiche]')].map((a) => a.getAttribute('href'))).toEqual(['/admin/location/locataire/101', '/admin/location/locataire/102']);
    expect(d.querySelector('a[data-lien-ecran-sortie]')?.getAttribute('href')).toBe('/admin/location/locataire/101?sortie=11');
    clic('button[data-ouvrir-preavis="C"]');
    expect(container.querySelector('[data-ligne-depliee="C"]')).toBeNull();
  });

  it('état des lieux : bornes à l’écran, enregistrement, effacement — par la route de la Location', async () => {
    await rendre();
    clic('button[data-ouvrir-preavis="C"]');
    const champ = (): HTMLInputElement => container.querySelector('input[data-date-edl]') as HTMLInputElement;
    expect(champ().min).toBe('2026-10-01');
    expect(champ().max).toBe('2100-05-01');
    act(() => saisir(champ(), '2026-09-30'));
    expect(container.querySelector('[data-message-edl]')?.textContent).toContain('ne peut pas précéder la réception du recommandé');
    expect((container.querySelector('button[data-enregistrer-edl]') as HTMLButtonElement).disabled).toBe(true);
    act(() => saisir(champ(), '2100-05-02'));
    expect(container.querySelector('[data-message-edl]')?.textContent).toContain('plus de 6 mois');
    act(() => saisir(champ(), '2099-11-05'));
    expect(container.querySelector('[data-message-edl]')).toBeNull();
    await act(async () => { (container.querySelector('button[data-enregistrer-edl]') as HTMLButtonElement).click(); });
    expect(posts.at(-1)).toEqual({ action: 'etat-des-lieux', occupationIds: [11, 12], date: '2099-11-05' });
    await act(async () => { (container.querySelector('button[data-effacer-edl]') as HTMLButtonElement).click(); });
    expect(posts.at(-1)).toEqual({ action: 'etat-des-lieux', occupationIds: [11, 12], date: '' });
  });

  it('« Valider la sortie » : 🔴 Arno (11/11/2026, lot 4) — ouvre DIRECTEMENT « Valider l’état des lieux de sortie » ; saisie, récapitulatif, résultat ; puis la ligne disparaît', async () => {
    const base = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
        if (corps.action === 'apercu-validation-sortie') {
          posts.push(corps);
          return ok({ date: HIER, vacant: true, enGestion: false, sansEmail: [], alertes: [], mails: [
            { sorte: 'sortie_edls_interne', objet: '[Copie interne] État des lieux de sortie — 4 rue Fictive', a: ['gestion@exemple.test'], cc: [], texte: 'Sortie validée', cle: null, famille: 'interne' }] });
        }
        if (corps.action === 'valider-sortie-edls') {
          posts.push(corps);
          lignes = lignes.filter((l) => !l.occupationIds.includes(Number(corps.occupationId)));
          return ok({ date: HIER, vacant: true, restants: [], envois: [
            { sorte: 'sortie_edls_interne', objet: '[Copie interne] État des lieux de sortie — 4 rue Fictive', a: ['gestion@exemple.test'], cc: [], envoye: true, motif: null, famille: 'interne' }] });
        }
      }
      if (String(u).includes('partenairesSortie=')) return ok({ enGestion: false, liste: [] });
      return base(u, init);
    }) as unknown as typeof fetch;
    await rendre(true);
    clic('button[data-ouvrir-preavis="C"]');
    clic('button[data-valider-sortie]');
    await attendre();
    // Plus de sélecteur « Sélectionner / Enregistrer un préavis / Faire sortir » ICI ; le lien « Écran de sortie » reste.
    expect(container.querySelector('[data-ligne-depliee="C"] [data-parcours-sur-bail]')).toBeNull();
    expect(container.querySelector('[data-ligne-depliee="C"] [data-lien-ecran-sortie]')).not.toBeNull();
    const f = (): Element => document.querySelector('[data-fenetre-validation-sortie]')!;
    expect(f().getAttribute('data-fenetre-validation-sortie')).toBe('saisie');
    expect(f().querySelector('[data-titre-validation-sortie]')?.textContent).toBe('Valider l’état des lieux de sortie');
    // Tous les locataires cochés ; aucun destinataire coché ; « Voir le récapitulatif » fermé tant que l'état des lieux n'est pas déclaré réalisé.
    expect([...f().querySelectorAll('input[data-sortant]')].map((x) => (x as HTMLInputElement).checked)).toEqual([true, true]);
    expect([...f().querySelectorAll('input[data-destinataire-sortie]')].filter((x) => (x as HTMLInputElement).checked)).toHaveLength(0);
    expect([...f().querySelectorAll('[data-famille-destinataires]')].map((x) => x.getAttribute('data-famille-destinataires'))).toEqual(['locataire', 'proprietaire']);
    expect((f().querySelector('input[data-date-sortie-effective]') as HTMLInputElement).max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((f().querySelector('button[data-recap-validation]') as HTMLButtonElement).disabled).toBe(true);
    act(() => (f().querySelector('input[data-edls-realise]') as HTMLInputElement).click());
    act(() => saisir(f().querySelector('input[data-date-sortie-effective]') as HTMLInputElement, HIER));
    expect((f().querySelector('button[data-recap-validation]') as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { (f().querySelector('button[data-recap-validation]') as HTMLButtonElement).click(); });
    await attendre();
    expect(f().getAttribute('data-fenetre-validation-sortie')).toBe('recap');
    expect(posts.some((p) => p.action === 'valider-sortie-edls')).toBe(false); // rien avant « Confirmer »
    expect(posts.at(-1)).toMatchObject({ action: 'apercu-validation-sortie', occupationId: 11, realise: true, date: HIER, sortants: [11, 12], destinataires: [] });
    expect(f().querySelector('[data-nombre-mails]')?.textContent).toBe('1 mail partira.');
    expect(f().querySelector('[data-recap-famille="interne"]')).not.toBeNull();
    await act(async () => { (f().querySelector('button[data-confirmer-validation]') as HTMLButtonElement).click(); });
    await attendre();
    expect(posts.at(-1)).toMatchObject({ action: 'valider-sortie-edls', occupationId: 11, sortants: [11, 12], date: HIER });
    expect(f().getAttribute('data-fenetre-validation-sortie')).toBe('resultat');
    expect(f().querySelector('[data-frise-resultat] [data-etape="sortie"]')?.getAttribute('data-statut-etape')).toBe('faite');
    await act(async () => { (f().querySelector('button[data-fermer-validation]') as HTMLButtonElement).click(); });
    await attendre();
    expect(document.querySelector('[data-fenetre-validation-sortie]')).toBeNull();
    expect(ordre()).toEqual(['B', 'A']);
    expect(container.querySelector('[data-preavis-bilan]')?.textContent).toContain('Sortie enregistrée — BERNARD Alice, BERNARD Paul.');
  });

  it('🔴 lot 4 — une alerte de coordonnées ferme « Confirmer et envoyer » (rien ne part)', async () => {
    const base = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST' && String(init.body).includes('apercu-validation-sortie')) {
        return ok({ date: HIER, vacant: true, enGestion: false, sansEmail: [], mails: [], alertes: [{ cle: 'loc-11', libelle: 'Alice BERNARD', phrase: 'Attention : ce texte contient les coordonnées de Jean DUPONT (nom).' }] });
      }
      if (String(u).includes('partenairesSortie=')) return ok({ enGestion: false, liste: [] });
      return base(u, init);
    }) as unknown as typeof fetch;
    await rendre(true);
    clic('button[data-ouvrir-preavis="C"]');
    clic('button[data-valider-sortie]');
    await attendre();
    const f = (): Element => document.querySelector('[data-fenetre-validation-sortie]')!;
    act(() => (f().querySelector('input[data-edls-realise]') as HTMLInputElement).click());
    act(() => saisir(f().querySelector('input[data-date-sortie-effective]') as HTMLInputElement, HIER));
    await act(async () => { (f().querySelector('button[data-recap-validation]') as HTMLButtonElement).click(); });
    await attendre();
    expect(f().querySelector('[data-alerte-coordonnees="loc-11"]')?.textContent).toContain('Attention : ce texte contient les coordonnées de Jean DUPONT');
    expect((f().querySelector('button[data-confirmer-validation]') as HTMLButtonElement).disabled).toBe(true);
    act(() => (f().querySelector('button[data-revenir-validation]') as HTMLButtonElement).click());
    expect(f().getAttribute('data-fenetre-validation-sortie')).toBe('saisie');
  });

  it('sans le droit Gestion : « La sortie est validée par un utilisateur de la Gestion », aucun bouton de sortie', async () => {
    await rendre(false);
    clic('button[data-ouvrir-preavis="C"]');
    expect(container.querySelector('button[data-valider-sortie]')).toBeNull();
    expect(container.querySelector('[data-sortie-gestion-seule]')?.textContent).toBe('La sortie est validée par un utilisateur de la Gestion');
    // La date d'état des lieux, elle, reste saisissable.
    expect((container.querySelector('input[data-date-edl]') as HTMLInputElement).disabled).toBe(false);
  });

  it('le serveur vérifie lui-même le droit Gestion sur la sortie (la route de la Location)', () => {
    const route = readFileSync('app/(admin)/api/admin/location/route.ts', 'utf8');
    expect(route).toMatch(/case 'sortie-locataires'[\s\S]{0,400}exigerCompteActif\(request, 'gestion'\)/);
  });
});

describe('la date d’état des lieux est visible sur la fiche et sur l’écran de sortie', () => {
  const P = { id: 50, occupationId: 11, recuLe: '2026-10-01', dateMax: '2099-11-01', mode: 'mois', dureeMois: 1, motif: null, creePar: 'x',
    creeLe: '2026-10-01', dureeProposee: 1, etatDesLieuxLe: '2099-11-05' };

  it('fiche locataire (section « Location »)', async () => {
    global.fetch = vi.fn(async () => ok({
      fiche: { modifiable: true }, sortie: null,
      locations: [{ occupationId: 11, lotId: 7, adresse: '4 rue Fictive', commune: 'PUTEAUX', entree: '2022-09-01', sortie: null, location: null }],
      preavis: [{ occupationId: 11, preavis: P }],
    })) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(SectionLocationLocataire, { locataireId: 101, ouvrir: () => {} })); });
    await attendre();
    expect(container.querySelector('[data-preavis-fiche] [data-etat-des-lieux]')?.textContent).toBe('État des lieux le 05/11/2099');
  });

  it('écran de sortie', async () => {
    global.fetch = vi.fn(async (u: string | URL | Request) => (String(u).includes('preavisBail=') ? ok({
      disponible: true, meuble: false, zoneTendue: true, dureeProposee: 1, raison: 'x',
      locataires: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01', preavis: P },
        { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', entree: '2022-09-01', preavis: null }],
    }) : String(u).includes('encartBail=') ? ({ ok: true, status: 200, json: async () => ({ etat: 'erreur', message: 'hors épreuve' }) }) as unknown as Response
      : ok(BAIL))) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(EcranSortieLocataire, { occupationInitiale: 11, gestion: true })); });
    await attendre();
    expect(container.querySelector('[data-carte-preavis="11"] [data-etat-des-lieux]')?.textContent).toBe('État des lieux le 05/11/2099');
  });
});

/**
 * Arno (19/10/2026) — FICHE DÉPLIÉE COMPLÈTE ET « EDLS PLANIFIÉ » (tâche du module de tâches de la Gestion).
 */
describe('la ligne dépliée : les informations complètes du logement', () => {
  it('🔴 Arno (11/11/2026, lot 1) — trois blocs dans cet ordre (locataires, propriétaires, logement et annexes) ; rien de l’encart d’avant n’est perdu ; « non renseigné » avec le lien', async () => {
    await rendre();
    clic('button[data-ouvrir-preavis="C"]');
    await attendre();
    const infos = container.querySelector('[data-ligne-depliee="C"] [data-infos-logement]')!;
    expect([...infos.querySelectorAll('[data-bloc-fiche]')].map((b) => b.getAttribute('data-bloc-fiche'))).toEqual(['locataires', 'proprietaires', 'logement']);
    expect([...infos.querySelectorAll('.fip-titre')].map((t) => t.textContent)).toEqual(['① Locataires', '② Propriétaire', '③ Logement et annexes']);
    // ① les locataires, la date d'entrée mise en avant, leurs coordonnées (celles qui manquent : « non renseigné »).
    const locs = [...infos.querySelectorAll('[data-fiche-locataire]')];
    expect(locs.map((x) => x.querySelector('.fip-nom')?.textContent)).toEqual(['BERNARD Alice', 'BERNARD Paul']);
    expect(locs[0].textContent).toContain('06 55 66 77 88');
    expect(locs[0].textContent).toContain('alice@exemple.test');
    expect(locs[1].querySelectorAll('[data-non-renseigne]')).toHaveLength(2);
    expect(locs[0].querySelector('[data-date-entree]')).not.toBeNull();
    // ② le propriétaire, son lien et ses coordonnées.
    const pro = infos.querySelector('[data-fiche-proprietaire]')!;
    expect(pro.querySelector('[data-lien-proprietaire]')?.textContent).toBe('DUPONT Jean');
    expect(pro.textContent).toContain('06 11 22 33 44');
    expect(pro.textContent).toContain('jean@exemple.test');
    // ③ le logement : adresse, digicode, type, étage, n° de lot, porte, accès ; les lots et l'annexe ; les autres informations d'avant.
    const log = infos.querySelector('[data-bloc-fiche="logement"]')!;
    const val = (c: string) => log.querySelector(`[data-ligne-fiche="${c}"] dd`)?.textContent;
    expect([val('adresse'), val('digicode'), val('type'), val('etage'), val('lot'), val('porte'), val('acces')])
      .toEqual(['4 rue Fictive, 92800 Puteaux', '4521A', 'Appartement T3', '3e étage', '100', 'G', 'Code au portail']);
    expect(log.querySelector('[data-lots-concernes]')?.textContent).toBe('2 lots concernés par ce préavis');
    expect(log.querySelector('[data-annexe]')?.textContent).toBe('Parkingétage : sous-sol 1n° de lot : non renseigné — compléter la fiche du bienn° de place : 12');
    expect(log.querySelector('[data-annexe] [data-lien-completer]')?.getAttribute('href')).toBe('/admin/location/bien/7');
    for (const cle of ['batiment', 'ascenseur']) expect(log.querySelector(`[data-autres-infos] [data-ligne="${cle}"]`), cle).not.toBeNull();
    expect(infos.querySelector('[data-dates-preavis]')?.textContent).toBe('Préavis : recommandé reçu le 01/10/2026 — fin du préavis le 01/11/2099');
  });
});

describe('planifier l’état des lieux de sortie (migration 385 appliquée)', () => {
  const ouvrirPlanif = async () => {
    planification = true;
    await rendre();
    clic('button[data-ouvrir-preavis="C"]');
    await attendre();
    clic('button[data-planifier-edls]');
    await attendre();
  };
  const champ = (n: string) => container.querySelector(`[data-edls-${n}]`) as HTMLInputElement;
  /** 🔴 Arno (24/10/2026) — « Confier à » est une ListeChoix verte : ouvrir, cliquer l'option. */
  const choisir = (el: Element, v: string) => {
    act(() => { (el as HTMLElement).click(); });
    act(() => { (el.closest('.lch')!.querySelector(`li[data-option="${v}"]`) as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  };
  const optionsConfier = () => {
    const el = container.querySelector('[data-confier-a]') as HTMLElement;
    act(() => { el.click(); });
    const t = [...el.closest('.lch')!.querySelectorAll('li[role="option"]')].map((o) => o.textContent?.replace('✓', '').trim());
    act(() => { el.click(); });
    return t;
  };

  it('avant la migration 385 : la saisie à la main de la date reste offerte, avec le message', async () => {
    await rendre();
    clic('button[data-ouvrir-preavis="C"]');
    expect(container.querySelector('input[data-date-edl]')).not.toBeNull();
    expect(container.querySelector('[data-planification-indisponible]')).not.toBeNull();
  });

  it('fin proposée = début + 1 h (modifiable) ; fin ≤ début refusée ; « Confier à » = la liste Location ET Gestion ET Workspace', async () => {
    await ouvrirPlanif();
    act(() => saisir(champ('jour'), '2099-11-05'));
    act(() => saisir(champ('debut'), '10:00'));
    expect(champ('fin').getAttribute('data-valeur')).toBe('11:00');
    act(() => saisir(champ('fin'), '09:30'));
    expect(container.querySelector('[data-edls-message]')?.textContent).toBe('L’heure de fin doit être après l’heure de début.');
    expect((container.querySelector('button[data-valider-edls]') as HTMLButtonElement).disabled).toBe(true);
    expect(optionsConfier()).toEqual(['Arno Test', 'Claire Test']);
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => String(c[0]).includes('edlsConfiables=1'))).toBe(true);
  });

  it('« Planifier » : la ligne passe AUSSITÔT à « EDLS planifié » — confié à X, en attente de confirmation (bleu)', async () => {
    await ouvrirPlanif();
    act(() => saisir(champ('jour'), '2099-11-05'));
    act(() => saisir(champ('debut'), '10:00'));
    choisir(container.querySelector('[data-confier-a]')!, '4');
    await act(async () => { (container.querySelector('[data-inviter-locataires="oui"]') as HTMLButtonElement).click(); }); // 🔴 (18/11/2026) le choix obligatoire
    await act(async () => { (container.querySelector('button[data-valider-edls]') as HTMLButtonElement).click(); });
    await act(async () => { (document.querySelector('[data-ok-confirmation]') as HTMLButtonElement | null)?.click(); }); // 🔴 (19/11/2026, règle F) la fenêtre de confirmation : « OK »
    expect(posts.at(-1)).toEqual({ action: 'planifier-edls', occupationIds: [11, 12], jour: '2099-11-05', debut: '10:00', fin: '11:00', confieA: 4, commentaire: '', locataires: 'oui' });
    const ligne = container.querySelector('[data-ligne-preavis="C"]')!;
    // 🔴 (15/11/2026) le statut « RDV état des lieux fixé » (violet) remplace la pastille « EDLS planifié » ; le détail le dit toujours
    expect(ligne.querySelector('[data-statut-ligne]')?.textContent).toBe('RDV état des lieux fixé');
    expect(ligne.querySelector('[data-statut-ligne]')?.className).toBe('psl-statut psl-statut--rdv_edl');
    expect(ligne.querySelector('.pva-textes')?.getAttribute('title')).toContain('EDLS le 05/11/2099 à 10h00 — confié à Claire Test — en attente de confirmation');
  });

  it('confié à soi : « accepté » d’office (le module de tâches inscrit directement dans l’agenda, sans demande)', async () => {
    const { acceptationInitiale } = await import('../../../../lib/gestion/acceptationTache');
    expect(acceptationInitiale(3, 3)).toBe('acceptee');
    statutPose = 'acceptee';
    await ouvrirPlanif();
    act(() => saisir(champ('jour'), '2099-11-05'));
    act(() => saisir(champ('debut'), '10:00'));
    await act(async () => { (container.querySelector('[data-inviter-locataires="oui"]') as HTMLButtonElement).click(); }); // 🔴 (18/11/2026) le choix obligatoire
    await act(async () => { (container.querySelector('button[data-valider-edls]') as HTMLButtonElement).click(); });
    await act(async () => { (document.querySelector('[data-ok-confirmation]') as HTMLButtonElement | null)?.click(); }); // 🔴 (19/11/2026, règle F) la fenêtre de confirmation : « OK »
    expect(container.querySelector('[data-ligne-preavis="C"] .pva-textes')?.getAttribute('title')).toContain('confié à Arno Test — accepté');
  });

  const EDLS = { edlsId: 77, tacheId: 500, jour: '2099-11-05', heure: '10:00', dureeMinutes: 60, confieA: 'Claire Test', confieAId: 4, statut: 'en_attente' as const, reponduPar: null, motifRefus: null };

  it('« Déplacer » : nouvelle plage → action de déplacement (la tâche repasse « en attente », nouveau mail)', async () => {
    planification = true;
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, edls: EDLS, etatDesLieuxLe: '2099-11-05' } : l));
    await rendre();
    clic('button[data-ouvrir-preavis="C"]');
    await attendre();
    clic('button[data-deplacer-edls]');
    await attendre();
    expect(champ('jour').value).toBe('2099-11-05');
    expect(champ('fin').getAttribute('data-valeur')).toBe('11:00');
    act(() => saisir(champ('jour'), '2099-11-06'));
    act(() => saisir(champ('debut'), '14:00'));
    act(() => saisir(champ('fin'), '15:30'));
    await act(async () => { (container.querySelector('[data-inviter-locataires="oui"]') as HTMLButtonElement).click(); }); // 🔴 (18/11/2026) le choix obligatoire
    await act(async () => { (container.querySelector('button[data-valider-edls]') as HTMLButtonElement).click(); });
    await act(async () => { (document.querySelector('[data-ok-confirmation]') as HTMLButtonElement | null)?.click(); }); // 🔴 (19/11/2026, règle F) la fenêtre de confirmation : « OK »
    expect(posts.at(-1)).toEqual({ action: 'deplacer-edls', occupationIds: [11, 12], jour: '2099-11-06', debut: '14:00', fin: '15:30', confieA: 4, locataires: 'oui' });
    expect(container.querySelector('[data-ligne-preavis="C"] .pva-textes')?.getAttribute('title')).toContain('EDLS le 06/11/2099 à 14h00 — confié à Claire Test — en attente de confirmation');
    expect(container.querySelector('[data-edls-bilan]')?.textContent).toContain('mail à Claire Test : préparé (essai)');
  });

  it('refusé : « Refusée par X — à réattribuer » et « Confier à quelqu’un d’autre » (nouveau cycle)', async () => {
    planification = true;
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, edls: { ...EDLS, statut: 'refusee', reponduPar: 'Claire Test' }, etatDesLieuxLe: '2099-11-05' } : l));
    await rendre();
    expect(container.querySelector('[data-ligne-preavis="C"] [data-preavis="edls"]')?.textContent).toBe('EDLS à réattribuer');
    clic('button[data-ouvrir-preavis="C"]');
    await attendre();
    expect(container.querySelector('[data-edls-mention]')?.textContent).toBe('Refusée par Claire Test — à réattribuer');
    clic('button[data-reattribuer-edls]');
    await attendre();
    expect(optionsConfier()).toEqual(['Arno Test']);   // la liste verte du formulaire « réattribuer »
    await act(async () => { (container.querySelector('button[data-valider-reattribution]') as HTMLButtonElement).click(); });
    await act(async () => { (document.querySelector('[data-ok-confirmation]') as HTMLButtonElement | null)?.click(); }); // 🔴 (19/11/2026, règle F) la fenêtre de confirmation : « OK »
    expect(posts.at(-1)).toEqual({ action: 'reattribuer-edls', occupationIds: [11, 12], confieA: 3 });
    expect(container.querySelector('[data-ligne-preavis="C"] .pva-textes')?.getAttribute('title')).toContain('confié à Arno Test — en attente de confirmation');
  });

  it('préavis échu : l’alerte garde la priorité même avec un EDLS planifié', async () => {
    planification = true;
    lignes = lignes.map((l) => (l.cle === 'B' ? { ...l, edls: { ...EDLS, jour: '2020-01-10' } } : l));
    await rendre();
    expect(container.querySelector('[data-ligne-preavis="B"] [data-preavis]')?.textContent).toBe('Préavis échu — sortie à saisir');
    expect(container.querySelector('[data-ligne-preavis="B"] .pva-textes')?.getAttribute('title')).toContain('EDLS le 10/01/2020 à 10h00');
  });

  it('le tri « État des lieux » suit la date de l’EDLS (la même donnée)', async () => {
    planification = true;
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, edls: { ...EDLS, jour: '2098-01-01' }, etatDesLieuxLe: '2098-01-01' } : l));
    await rendre();
    clic('button[data-tri="edl:asc"]');
    expect(ordre()).toEqual(['C', 'A', 'B']);
  });
});

describe('🔴🔴 Arno (11/11/2026, lot 3) — la frise des étapes dans la ligne dépliée', () => {
  it('quatre étapes dans l’ordre ; chaque bouton SOUS son étape ; couleurs par statut ; l’étape en cours marquée ; rien de retiré', async () => {
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'recu', rdv: null, tacheId: null, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null } } : l));
    await rendre();
    clic('button[data-ouvrir-preavis="C"]');
    await attendre();
    const frise = container.querySelector('[data-ligne-depliee="C"] [data-frise-preavis]')!;
    const etapes = [...frise.querySelectorAll('[data-etape]')];
    expect(etapes.map((e) => e.getAttribute('data-etape'))).toEqual(['preavis', 'previsite', 'edls', 'sortie']);
    expect(etapes[0].className).toContain('frp-etape--faite');
    expect(etapes.filter((e) => e.getAttribute('aria-current') === 'step')).toHaveLength(1);
    const sous = (cle: string, sel: string) => frise.querySelector(`[data-etape="${cle}"] ${sel}`);
    // Sous leur étape : la pré-visite, l'état des lieux, la sortie (mêmes blocs, mêmes boutons qu'avant).
    expect(sous('previsite', '[data-bloc-previsite]')).not.toBeNull();
    expect(sous('previsite', '[data-rdv-previsite]')).not.toBeNull();
    expect(sous('edls', '[data-bloc-edl], [data-bloc-edls]')).not.toBeNull();
    expect(sous('sortie', '[data-valider-sortie]')).not.toBeNull();
    // Les liens d'avant restent.
    expect(container.querySelector('[data-ligne-depliee="C"] [data-lien-ecran-sortie]')).not.toBeNull();
  });
});

describe('🔴🔴 Arno (11/11/2026, lot 5) — retouches de PRÉSENTATION de la ligne dépliée', () => {
  it('frise : informations puis boutons dans chaque case ; boutons pleine largeur, même hauteur, centrés ; lignes partagées d’une case à l’autre', async () => {
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'recu', rdv: null, tacheId: null, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null } } : l));
    await rendre(true);
    clic('button[data-ouvrir-preavis="C"]');
    await attendre();
    const frise = container.querySelector('[data-ligne-depliee="C"] [data-frise-preavis]')!;
    for (const [cle, bouton] of [['previsite', '[data-rdv-previsite]'], ['previsite', '[data-refus-previsite]'], ['sortie', '[data-valider-sortie]']]) {
      expect(frise.querySelector(`[data-etape="${cle}"] .frp-actions ${bouton}`), `${bouton} dans la zone des boutons`).not.toBeNull();
    }
    expect(frise.querySelector('[data-etape="edls"] .frp-actions button')).not.toBeNull();
    // Le CSS : une grille partagée (subgrid) pour les EN-TÊTES ; boutons pleine largeur.
    const css = CSS_PREAVIS_ACCUEIL.replace(/\s+/g, ' ');
    // 🔴 Arno (18/11/2026, option A) — seuls les EN-TÊTES partagent leur rangée ; le contenu se range en haut de sa case, sans trou.
    // 🔴 Arno (19/11/2026) — même hauteur pour toutes les cases, contenu CENTRÉ verticalement (retour sur l'option A du 18/11)
    expect(css).toContain('.frp-etape{display:flex;flex-direction:column;justify-content:center;');
    expect(css).toContain('.frp-etape > .pva-bloc{display:flex;flex-direction:column;');
    expect(css).not.toContain('grid-template-rows:subgrid');
    expect(css).toMatch(/\.frp-actions \.loc-boutons \.svv-btn\{width:100%;min-height:48px;[^}]*justify-content:center;text-align:center/);
  });

  it('doublons retirés : bandeau « Préavis reçu » de la case 2, sous-titres « Pré-visite d’état des lieux de sortie », « État des lieux de sortie », « Date officielle de sortie »', async () => {
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'recu', rdv: null, tacheId: null, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null } } : l));
    await rendre(true);
    clic('button[data-ouvrir-preavis="C"]');
    await attendre();
    const frise = container.querySelector('[data-ligne-depliee="C"] [data-frise-preavis]')!;
    expect(frise.querySelector('[data-etape="previsite"] [data-previsite-etat]')).toBeNull();
    const sousTitres = [...frise.querySelectorAll('.pva-bloc > .pvs-libelle')].map((x) => x.textContent);
    expect(sousTitres).toEqual([]);
    expect(frise.textContent).not.toContain('Pré-visite d’état des lieux de sortie');
    expect(frise.textContent).not.toContain('Date officielle de sortie');
    // Les titres des cases, eux, restent ; et un AUTRE état de la pré-visite garde son bandeau.
    // 🔴 Arno (11/11/2026, lot B) — le titre VISIBLE sans chiffre (la pastille numérote) ; le numéro reste dit au lecteur d'écran.
    const visible = (x: Element): string => [...x.childNodes].filter((n) => !(n instanceof HTMLElement && n.classList.contains('frp-lu'))).map((n) => n.textContent).join('');
    expect([...frise.querySelectorAll('.frp-titre')].map(visible)).toEqual(['Préavis reçu', 'Pré-visite', 'État des lieux de sortie', 'Sortie validée']);
    expect([...frise.querySelectorAll('.frp-titre .frp-lu')].map((x) => x.textContent)).toEqual(['Étape 1 : ', 'Étape 2 : ', 'Étape 3 : ', 'Étape 4 : ']);
  });

  it('un autre état de la pré-visite (refusée) garde son bandeau', async () => {
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'refusee', rdv: null, tacheId: null, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null } } : l));
    await rendre(true);
    clic('button[data-ouvrir-preavis="C"]');
    await attendre();
    expect(container.querySelector('[data-ligne-depliee="C"] [data-etape="previsite"] [data-previsite-etat]')).not.toBeNull();
  });

  it('bloc ③ : plus de ligne « Entrée dans les lieux » (doublon du bloc ①) — la fiche envoyée aux collègues la garde ; liens « compléter la fiche du locataire / du propriétaire »', () => {
    const e = { ...ENCART, bail: { ...ENCART.bail, entree: '2022-09-01' }, coordonnees: { ...ENCART.coordonnees!,
      proprietaires: [{ id: 5, nom: 'DUPONT Jean', telephones: [], emails: ['jean@exemple.test'] }] } };
    const f = ficheDepuisEncart(e);
    expect(f.autres.some((x) => x.cle === 'entree')).toBe(true);
    expect(texteFicheIntervention(f)).toContain('Entrée dans les lieux : 01/09/2022');
    act(() => root.render(createElement(FicheInterventionPreavis, { f, lienBien: '/admin/location/bien/7' })));
    expect(container.querySelector('[data-autres-infos] [data-ligne="entree"]')).toBeNull();
    expect(container.textContent).not.toContain('Entrée dans les lieux');
    expect(container.querySelector('[data-autres-infos] [data-ligne="batiment"]')).not.toBeNull();
    const paul = [...container.querySelectorAll('[data-fiche-locataire]')][1];
    const lienPaul = paul.querySelector('[data-lien-completer]')!;
    expect([lienPaul.getAttribute('href'), lienPaul.textContent]).toEqual(['/admin/location/locataire/102', 'compléter la fiche du locataire']);
    const lienJean = container.querySelector('[data-fiche-proprietaire] [data-lien-completer]')!;
    expect([lienJean.getAttribute('href'), lienJean.textContent]).toEqual(['/admin/location/proprietaire/5', 'compléter la fiche du propriétaire']);
    // Le logement, lui, mène toujours à la fiche du bien.
    expect(container.querySelector('[data-bloc-fiche="logement"] [data-lien-completer]')?.textContent).toBe('compléter la fiche du bien');
  });
});

describe('🔴🔴 Arno (11/11/2026) — RÈGLE BLOQUANTE : aucun locataire avec un e-mail, aucun rendez-vous d’état des lieux de sortie (à l’écran)', () => {
  const MOTIF = 'Impossible de valider : aucun locataire n’a d’adresse e-mail. Ajoutez l’e-mail d’au moins un locataire avant de fixer le rendez-vous.';
  const sansEmails = (): void => {
    const base = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (String(u).includes('encartBail=')
      ? ok({ ...ENCART, coordonnees: { ...ENCART.coordonnees!, locataires: ENCART.coordonnees!.locataires.map((x) => ({ ...x, emails: [] })) } })
      : base(u, init))) as unknown as typeof fetch;
  };
  const ouvrirPlanifier = async (): Promise<void> => {
    planification = true;
    await rendre();
    clic('button[data-ouvrir-preavis="C"]');
    await attendre();
    clic('button[data-planifier-edls]');
    await attendre();
  };
  it('aucun e-mail : message rouge, un lien par locataire vers SA fiche, « Planifier » inactif', async () => {
    sansEmails();
    await ouvrirPlanifier();
    const b = container.querySelector('[data-formulaire-edls] [data-blocage-email-locataire]')!;
    expect(b.textContent).toContain(MOTIF);
    expect([...b.querySelectorAll('[data-completer-fiche-locataire]')].map((a) => [a.getAttribute('href'), a.textContent])).toEqual([
      ['/admin/location/locataire/101', 'compléter la fiche de Alice BERNARD'], ['/admin/location/locataire/102', 'compléter la fiche de Paul BERNARD']]);
    expect((container.querySelector('button[data-valider-edls]') as HTMLButtonElement).disabled).toBe(true);
  });
  it('un locataire sur deux avec un e-mail : pas de blocage', async () => {
    await ouvrirPlanifier();
    expect(container.querySelector('[data-formulaire-edls]')).not.toBeNull();
    expect(container.querySelector('[data-blocage-email-locataire]')).toBeNull();
  });
});

describe('🔴🔴 Arno (11/11/2026, 468) — « Valider l’état des lieux de sortie » : pièces jointes et retenue de 20 % (à l’écran)', () => {
  let copro: boolean | null = true;
  let postsPieces: { type: string; corps: unknown }[] = [];
  let reponseDrive: unknown = null;
  const PIECE = (id: number, nom: string, provenance: 'drive' | 'ordinateur', taille = 2048) => ({ id, nom, typeMime: 'application/pdf', taille, provenance });
  const brancher = (): void => {
    const base = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      const s = String(u);
      if (s.includes('retenueSortie=')) return ok({ lotId: 7, copropriete: copro });
      if (s.includes('partenairesSortie=')) return ok({ enGestion: false, liste: [] });
      if (s.startsWith('/api/admin/location/pieces-sortie')) {
        if ((init?.method ?? 'GET') === 'GET') return { ok: true, status: 200, json: async () => reponseDrive } as unknown as Response;
        if (init?.body instanceof FormData) {
          const noms = (init.body.getAll('fichier') as File[]).map((f) => f.name);
          postsPieces.push({ type: 'ordinateur', corps: noms });
          return ok({ pieces: noms.map((n, i) => PIECE(10 + i + postsPieces.length * 5, n, 'ordinateur')), refus: [] });
        }
        const c = JSON.parse(String(init?.body)) as { driveIds: string[] };
        postsPieces.push({ type: 'drive', corps: c.driveIds });
        return ok({ pieces: c.driveIds.map((id, i) => PIECE(100 + i, `${id}.pdf`, 'drive')), refus: [] });
      }
      if (init?.method === 'POST' && String(init.body).includes('apercu-validation-sortie')) {
        const c = JSON.parse(String(init.body)) as Record<string, unknown>;
        posts.push(c);
        return ok({ date: HIER, vacant: true, enGestion: false, sansEmail: [], alertes: [], retenue: c.retenue, mails: [
          { sorte: 'sortie_edls_locataire', objet: 'État des lieux de sortie — 4 rue Fictive', a: ['alice@exemple.test'], cc: [], texte: 'Bonjour', cle: 'loc-11', famille: 'locataire', pieces: ['salon.jpg'] }] });
      }
      return base(u, init);
    }) as unknown as typeof fetch;
  };
  const ouvrir = async (): Promise<Element> => {
    brancher();
    await rendre(true);
    clic('button[data-ouvrir-preavis="C"]');
    clic('button[data-valider-sortie]');
    await attendre(); await attendre();
    return document.querySelector('[data-fenetre-validation-sortie]')!;
  };
  beforeEach(() => { copro = true; postsPieces = []; reponseDrive = null; });

  it('« Voir la fiche du bien » en PREMIER, avant « Voir la fiche du locataire » et « Écran de sortie » (rien de retiré)', async () => {
    await rendre(true);
    clic('button[data-ouvrir-preavis="C"]');
    const liens = [...container.querySelectorAll('[data-ligne-depliee="C"] .pva-liens a')];
    expect(liens.map((a) => a.textContent)).toEqual(['Voir la fiche du bien', 'Voir la fiche du locataire (BERNARD Alice)', 'Voir la fiche du locataire (BERNARD Paul)', 'Écran de sortie']);
    expect(liens[0].getAttribute('href')).toBe('/admin/location/bien/7'); // contexte Location ; en Gestion : la fiche de l'annuaire
  });

  it('retenue — copropriété Oui : cochée, paragraphe modifiable ; décochée : il disparaît ; le choix part avec l’aperçu', async () => {
    const f = await ouvrir();
    const caseR = f.querySelector('[data-retenue-case]') as HTMLInputElement;
    expect([caseR.checked, caseR.disabled]).toEqual([true, false]);
    const para = f.querySelector('textarea[data-retenue-paragraphe]') as HTMLTextAreaElement;
    expect(para.value.startsWith('Le logement étant situé dans un immeuble en copropriété, et conformément à l’article 22')).toBe(true);
    act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(para, 'Provision conservée.'); para.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => (f.querySelector('input[data-edls-realise]') as HTMLInputElement).click());
    act(() => saisir(f.querySelector('input[data-date-sortie-effective]') as HTMLInputElement, HIER));
    await act(async () => { (f.querySelector('button[data-recap-validation]') as HTMLButtonElement).click(); });
    await attendre();
    expect(posts.at(-1)).toMatchObject({ action: 'apercu-validation-sortie', retenue: true, paragrapheRetenue: 'Provision conservée.' });
    act(() => (document.querySelector('button[data-revenir-validation]') as HTMLButtonElement).click());
    act(() => (document.querySelector('[data-retenue-case]') as HTMLInputElement).click());
    expect(document.querySelector('textarea[data-retenue-paragraphe]')).toBeNull();
  });
  it('retenue — copropriété Non : case grisée et « Retenue impossible » ; Non renseigné : utilisable, alerte orange et lien vers la fiche du bien', async () => {
    copro = false;
    let f = await ouvrir();
    expect((f.querySelector('[data-retenue-case]') as HTMLInputElement).disabled).toBe(true);
    expect(f.querySelector('[data-retenue-impossible]')?.textContent).toBe('Retenue impossible : le bien n’est pas en copropriété (article 22).');
    act(() => root.unmount()); root = createRoot(container);
    copro = null;
    f = await ouvrir();
    const c = f.querySelector('[data-retenue-case]') as HTMLInputElement;
    expect([c.disabled, c.checked]).toEqual([false, false]);
    expect(f.querySelector('[data-retenue-a-verifier] a[data-lien-copropriete]')?.getAttribute('href')).toBe('/admin/location/bien/7');
  });

  it('pièces — « Parcourir », glisser-déposer, « Depuis le Drive du bien » : une seule liste (nom, taille, provenance), « Retirer » ; trop lourd refusé à l’écran', async () => {
    reponseDrive = { etat: 'ok', data: { tronque: false, fichiers: [
      { id: 'EDLSORTIE0001', nom: 'EDL sortie.pdf', typeMime: 'application/pdf', taille: 1000, modifieLe: '2026-11-10T09:00:00Z', chemin: ['6 Locataires'], joignable: true, etatDesLieux: true },
      { id: 'SALON0000001', nom: 'salon.jpg', typeMime: 'image/jpeg', taille: 2000, modifieLe: '2026-11-08T09:00:00Z', chemin: [], joignable: true, etatDesLieux: false }] } };
    const f = await ouvrir();
    // ① Parcourir mon ordinateur
    const champ = f.querySelector('input[data-pieces-champ]') as HTMLInputElement;
    Object.defineProperty(champ, 'files', { configurable: true, value: [new File(['%PDF'], 'compte-rendu.pdf', { type: 'application/pdf' })] });
    await act(async () => { champ.dispatchEvent(new Event('change', { bubbles: true })); });
    await attendre();
    // ② Glisser-déposer
    const zone = f.querySelector('[data-pieces-zone]')!;
    const depot = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(depot, 'dataTransfer', { value: { files: [new File(['JPG'], 'cuisine.jpg', { type: 'image/jpeg' })] } });
    await act(async () => { zone.dispatchEvent(depot); });
    await attendre();
    // ③ Depuis le Drive du bien : liste, filtre « États des lieux », cocher, « Joindre »
    await act(async () => { (f.querySelector('[data-pieces-drive]') as HTMLButtonElement).click(); });
    await attendre();
    const fen = document.querySelector('[data-fenetre-drive-bien]')!;
    expect([...fen.querySelectorAll('[data-fichier-drive]')].map((x) => x.getAttribute('data-fichier-drive'))).toEqual(['EDLSORTIE0001', 'SALON0000001']);
    act(() => (fen.querySelector('[data-drive-filtre-edl]') as HTMLInputElement).click());
    expect([...fen.querySelectorAll('[data-fichier-drive]')].map((x) => x.getAttribute('data-fichier-drive'))).toEqual(['EDLSORTIE0001']);
    act(() => (fen.querySelector('[data-cocher-fichier="EDLSORTIE0001"]') as HTMLInputElement).click());
    await act(async () => { (fen.querySelector('[data-drive-joindre]') as HTMLButtonElement).click(); });
    await attendre();
    expect(postsPieces).toEqual([{ type: 'ordinateur', corps: ['compte-rendu.pdf'] }, { type: 'ordinateur', corps: ['cuisine.jpg'] }, { type: 'drive', corps: ['EDLSORTIE0001'] }]);
    const lignesP = () => [...f.querySelectorAll('[data-pieces-liste] [data-piece]')].map((x) => [x.querySelector('.vps-nom')?.textContent, x.querySelector('.vps-meta')?.textContent]);
    expect(lignesP()).toEqual([['compte-rendu.pdf', '0 Mo · ordinateur'], ['cuisine.jpg', '0 Mo · ordinateur'], ['EDLSORTIE0001.pdf', '0 Mo · Drive']]);
    // Retirer
    act(() => (f.querySelector('[data-pieces-liste] [data-retirer-piece]') as HTMLButtonElement).click());
    expect(lignesP().map((x) => x[0])).toEqual(['cuisine.jpg', 'EDLSORTIE0001.pdf']);
    // Trop lourd : refusé à l'écran, rien n'est envoyé
    const avant = postsPieces.length;
    const gros = new File(['x'], 'enorme.pdf', { type: 'application/pdf' });
    Object.defineProperty(gros, 'size', { value: 11 * 1024 * 1024 });
    Object.defineProperty(champ, 'files', { configurable: true, value: [gros] });
    await act(async () => { champ.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(postsPieces.length).toBe(avant);
    expect(f.querySelector('[data-piece-refus]')?.textContent).toContain('au-delà de 10 Mo par fichier');
    expect(f.querySelector('[data-regle-pieces]')?.textContent).toContain('PDF, JPG, PNG, HEIC, Word — 10 Mo par fichier, 15 Mo au total');
  });
  it('Drive : bien sans dossier connu → message clair et lien vers la fiche du bien', async () => {
    reponseDrive = { etat: 'sans_dossier', lotId: 7, motif: 'Ce bien n’a pas de dossier Drive connu : renseignez-le sur la fiche du bien.' };
    const f = await ouvrir();
    await act(async () => { (f.querySelector('[data-pieces-drive]') as HTMLButtonElement).click(); });
    await attendre();
    const m = document.querySelector('[data-fenetre-drive-bien] [data-drive-sans-dossier]')!;
    expect(m.textContent).toContain('renseignez-le sur la fiche du bien');
    expect(m.querySelector('a[data-lien-fiche-bien-drive]')?.getAttribute('href')).toBe('/admin/location/bien/7');
  });
  it('récapitulatif : les pièces par mail et « Vérifiez que les pièces jointes ne contiennent pas de coordonnées… »', async () => {
    const f = await ouvrir();
    act(() => (f.querySelector('input[data-edls-realise]') as HTMLInputElement).click());
    act(() => saisir(f.querySelector('input[data-date-sortie-effective]') as HTMLInputElement, HIER));
    await act(async () => { (f.querySelector('button[data-recap-validation]') as HTMLButtonElement).click(); });
    await attendre();
    expect(document.querySelector('[data-pieces-mail]')?.textContent).toBe('📎 Pièces jointes : salon.jpg');
    expect(document.querySelector('[data-avertissement-pieces]')?.textContent).toBe('Vérifiez que les pièces jointes ne contiennent pas de coordonnées qui ne doivent pas être transmises à ce destinataire.');
  });
});

describe('🔴 Arno (11/11/2026, 468) — la fenêtre « Depuis le Drive du bien » s’ouvre AU-DESSUS de « Valider l’état des lieux de sortie »', () => {
  it('son voile passe au-dessus de celui de la fenêtre de validation (z-index)', async () => {
    const { CSS_PIECES_SORTIE } = await import('./PiecesSortie');
    const { CSS_MODALE_ISSUE } = await import('./ModaleIssue');
    const z = (css: string, sel: RegExp): number => Number(css.replace(/\s+/g, '').match(sel)?.[1] ?? NaN);
    expect(z(CSS_PIECES_SORTIE, /\.mis-voile\.vps-voile\{z-index:(\d+)\}/)).toBeGreaterThan(z(CSS_MODALE_ISSUE, /\.mis-voile\{position:fixed;inset:0;z-index:(\d+)/));
  });
});

describe('🔴🔴 Arno (11/11/2026, lot B) — UNE seule numérotation par case : la pastille ; verte avec coche une fois faite, orange si refusée', () => {
  it('la pastille porte le chiffre (à faire), ✓ (faite) ; refusée / absente : orange ; le CSS le dit', async () => {
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'refusee', rdv: null, tacheId: null, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null } } : l));
    await rendre(true);
    clic('button[data-ouvrir-preavis="C"]');
    await attendre();
    const frise = container.querySelector('[data-ligne-depliee="C"] [data-frise-preavis]')!;
    const pastille = (cle: string): string | null | undefined => frise.querySelector(`[data-etape="${cle}"] [data-pastille-etape]`)?.textContent;
    expect([pastille('preavis'), pastille('previsite'), pastille('edls'), pastille('sortie')]).toEqual(['✓', '2', '3', '4']);
    expect(frise.querySelector('[data-etape="previsite"]')?.className).toContain('frp-etape--refusee');
    const css = CSS_PREAVIS_ACCUEIL.replace(/\s+/g, ' ');
    expect(css).toContain('.frp-etape--faite .frp-numero{background:var(--color-svv-green-ink)}');
    expect(css).toContain('.frp-etape--refusee .frp-numero{background:var(--color-svv-urgence-orange)}');
    // Plus aucun « 1. », « 2. »… visible dans les titres.
    expect([...frise.querySelectorAll('.frp-titre')].some((t) => /^\d\./.test(t.textContent ?? ''))).toBe(false);
  });
});

describe('🔴🔴 Arno (11/11/2026) — le « ← Retour » commun rend le bloc des préavis TEL QU’IL ÉTAIT', () => {
  it('au retour sur la page : la même ligne dépliée, le même statut filtré (restauration notée au départ)', async () => {
    window.history.replaceState(null, '', '/admin/location');
    window.sessionStorage.setItem('svav.retour.restaurer', JSON.stringify({ url: '/admin/location', defilement: 0, le: Date.now(),
      etat: { 'preavis:bloc:location': { ouverte: 'C', filtre: [], recherche: '', ouvert: false } } }));
    await rendre(true);
    expect(container.querySelector('[data-ligne-depliee="C"]')).not.toBeNull();
    window.sessionStorage.clear();
  });
  it('« Voir la fiche du bien » est un lien suivi par le mécanisme commun (même onglet, aucun target) ; « compléter la fiche… » des fenêtres reste un nouvel onglet', async () => {
    await rendre(true);
    clic('button[data-ouvrir-preavis="C"]');
    const l = container.querySelector('[data-ligne-depliee="C"] a[data-lien-fiche-bien]')!;
    expect(l.getAttribute('target')).toBeNull();
    expect(readFileSync('app/(admin)/admin/(protected)/location/EmailLocataireRequis.tsx', 'utf8')).toContain('target="_blank" rel="noopener" data-completer-fiche-locataire');
  });
});

describe('🔴 Arno (11/11/2026) — frise : pastilles sur la ligne du titre ; « Préavis reçu » sur deux lignes', () => {
  it('« Reçu le … » puis « Fin du préavis le … », deux lignes distinctes ; la pastille sur la 1re ligne de la grille, en haut, dans les 4 cases', async () => {
    await rendre(true);
    clic('button[data-ouvrir-preavis="C"]');
    await attendre();
    const lignesP = [...container.querySelectorAll('[data-ligne-depliee="C"] [data-etape="preavis"] [data-ligne-etape]')].map((x) => x.textContent);
    expect(lignesP).toEqual(['Reçu le 01/10/2026', 'Fin du préavis le 01/11/2099']);
    const css = CSS_PREAVIS_ACCUEIL.replace(/\s+/g, ' ');
    expect(css).toContain('.frp-tete{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;align-items:start}');
    expect(css).toContain('.frp-numero{grid-row:1;align-self:start;');
    expect(css).toContain('.frp-statut{grid-column:2;');
    expect(container.querySelectorAll('[data-ligne-depliee="C"] [data-etape] .frp-tete > [data-pastille-etape]:first-child')).toHaveLength(4);
  });
});

describe('🔴🔴 Arno (11/11/2026) — la page DÉFILE toujours après chaque fenêtre de la ligne de préavis (blocage compté, rendu à la dernière fermée)', () => {
  const bloque = (): boolean => document.body.style.overflow === 'hidden';
  const echap = (): void => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
  const preparer = async (): Promise<void> => {
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'recu', rdv: null, tacheId: null, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null } } : l));
    const base = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      const s = String(u);
      if (s.startsWith('/api/admin/location/pieces-sortie')) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: { fichiers: [], tronque: false, lotId: 7 } }) } as unknown as Response;
      if (s.includes('previsiteCollegues=1')) return ok([{ id: 3, libelle: 'Collègue Test' }]);
      if (s.includes('previsiteRefus=')) return ok({ texte: 'Bonjour', objet: 'Pré-visite', sansEmail: [] });
      if (s.includes('retenueSortie=')) return ok({ lotId: 7, copropriete: true });
      if (init?.method === 'POST' && String(init.body).includes('apercu-validation-sortie')) return ok({ mails: [], alertes: [], sansEmail: [], vacant: true, enGestion: false, date: HIER });
      return base(u, init);
    }) as unknown as typeof fetch;
    await rendre(true);
    clic('button[data-ouvrir-preavis="C"]');
    await attendre();
  };
  const ouvrirFenetre = async (sel: string): Promise<void> => { await act(async () => { (document.querySelector(sel) as HTMLButtonElement).click(); }); await attendre(); };
  const cliquer = async (sel: string): Promise<void> => { await act(async () => { (document.querySelector(sel) as HTMLButtonElement).click(); }); await attendre(); };

  it('RDV pré-visite : bloque pendant ; Échap → la page défile ; « Annuler » → la page défile', async () => {
    await preparer();
    await ouvrirFenetre('[data-rdv-previsite]');
    expect(bloque()).toBe(true);
    echap(); await attendre();
    expect([document.querySelector('[data-fenetre-previsite]'), bloque()]).toEqual([null, false]);
    await ouvrirFenetre('[data-rdv-previsite]');
    await cliquer('[data-annuler-previsite]');
    expect(bloque()).toBe(false);
  });
  it('Refus / absence : « Annuler » → la page défile', async () => {
    await preparer();
    await ouvrirFenetre('[data-refus-previsite]');
    expect(bloque()).toBe(true);
    await cliquer('[data-annuler-previsite]');
    expect(bloque()).toBe(false);
  });
  it('deux fenêtres superposées (« Depuis le Drive du bien » au-dessus de « Valider l’état des lieux de sortie ») : fermer la Drive laisse la page bloquée sous la validation ; fermer la validation rend le défilement', async () => {
    await preparer();
    await ouvrirFenetre('[data-valider-sortie]');
    await ouvrirFenetre('[data-pieces-drive]');
    expect(bloque()).toBe(true);
    await cliquer('[data-drive-annuler]');
    expect([document.querySelector('[data-fenetre-drive-bien]'), bloque()]).toEqual([null, true]);
    await cliquer('[data-annuler-validation]');
    expect([document.querySelector('[data-fenetre-validation-sortie]'), bloque()]).toEqual([null, false]);
    // Échap avec les deux ouvertes : tout se ferme, la page défile.
    await ouvrirFenetre('[data-valider-sortie]');
    await ouvrirFenetre('[data-pieces-drive]');
    echap(); await attendre();
    echap(); await attendre();
    expect([document.querySelectorAll('[aria-modal="true"]').length, bloque()]).toEqual([0, false]);
  });
  it('« Valider la sortie » : récapitulatif puis « Revenir » puis « Annuler » → la page défile', async () => {
    await preparer();
    await ouvrirFenetre('[data-valider-sortie]');
    await act(async () => { (document.querySelector('input[data-edls-realise]') as HTMLInputElement).click(); });
    await cliquer('button[data-recap-validation]');
    await cliquer('[data-revenir-validation]');
    await cliquer('[data-annuler-validation]');
    expect(bloque()).toBe(false);
  });
  it('le rafraîchissement des 30 s PENDANT une fenêtre ouverte : la fenêtre reste, puis, fermée, la page défile', async () => {
    await preparer();
    await ouvrirFenetre('[data-rdv-previsite]');
    await act(async () => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    await attendre();
    expect(bloque()).toBe(true);
    await cliquer('[data-annuler-previsite]');
    expect(bloque()).toBe(false);
  });
  it('la ligne repliée (« Fermer ») ou le bloc démonté (changement de page) avec une fenêtre ouverte : rien ne reste bloqué', async () => {
    await preparer();
    await ouvrirFenetre('[data-rdv-previsite]');
    expect(bloque()).toBe(true);
    act(() => root.unmount()); root = createRoot(container); // la page change : tout est démonté
    expect(bloque()).toBe(false);
  });
});

describe('🔴🔴 Arno (13/11/2026) — case « 2 Pré-visite » : rendez-vous fixé en VERT, plus de doublon, « Voir le compte rendu »', () => {
  const RDV = { jour: '2099-11-14', heure: '15:00', dureeMinutes: 60 };
  const avec = (statut: 'programmee' | 'effectuee' | 'recu', o: Record<string, unknown> = {}) => {
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut, rdv: statut === 'recu' ? null : RDV, tacheId: statut === 'recu' ? null : 9, collegues: [], tousRefusent: false,
      rdvPasse: statut === 'effectuee', alerteEnvoyeeLe: null, ...o } } : l));
  };
  let cr: unknown = null; let lectures: string[] = [];
  beforeEach(() => {
    cr = null; lectures = [];
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      if (!init?.method && String(u).includes('previsiteCompteRendu=')) { lectures.push(String(u)); return ok(cr); }
      return (avant as typeof fetch)(u, init);
    }) as unknown as typeof fetch;
  });
  const ouvrir = async () => { await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre(); };
  const sous = (etape: string) => [...container.querySelectorAll(`[data-ligne-depliee="C"] [data-etape="${etape}"] [data-ligne-etape]`)].map((x) => x.textContent);

  it('programmée : le cartouche « Pré-visite programmée — le … » est VERT (le vert de « effectuée ») ; la ligne grise qui le répétait a disparu ; « étape en cours » reste', async () => {
    avec('programmee');
    await ouvrir();
    const c = container.querySelector('[data-ligne-depliee="C"] [data-previsite-etat]')!;
    expect(c.textContent).toBe('Pré-visite programmée — le 14/11/2099 de 15h00 à 16h00');
    expect(c.className).toContain('pvv-etat--programmee');
    const css = (await import('./PrevisiteAccueil')).CSS_PREVISITE.replace(/\s+/g, ' ');
    expect(css).toContain('.pvv-etat--programmee{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}');
    expect(css).toContain('.pvv-etat--effectuee{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}');
    expect(sous('previsite')).toEqual(['étape en cours']);
    expect(container.querySelector('[data-ligne-depliee="C"] [data-etape="previsite"] [data-libelle-etape]')!.textContent).not.toMatch(/Programmée le/);
  });
  it('effectuée : plus de ligne « Effectuée le … » (le cartouche le dit) ; l’étape n’est plus la courante, rien sous le titre', async () => {
    avec('effectuee', { compteRendu: true });
    await ouvrir();
    expect(container.querySelector('[data-ligne-depliee="C"] [data-previsite-etat]')!.textContent).toBe('Pré-visite effectuée — le 14/11/2099 de 15h00 à 16h00');
    expect(sous('previsite')).toEqual([]);
  });
  it('sans cartouche (« À programmer ») : la ligne reste telle quelle, avec « · étape en cours »', async () => {
    avec('recu');
    await ouvrir();
    expect(sous('previsite')).toEqual(['À programmer · étape en cours']);
  });
  it('étape 3 : l’état des lieux de sortie fixé — cartouche VERT, la ligne « Prévu le … — confié à … » disparaît ; refusé : orange, la ligne reste', async () => {
    planification = true; avec('effectuee', { compteRendu: true });
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, edls: { edlsId: 77, tacheId: 500, jour: '2099-06-01', heure: '10:00', dureeMinutes: 60, confieA: 'Claire Test', confieAId: 4,
      statut: 'acceptee' as const, reponduPar: null, motifRefus: null } } : l));
    await ouvrir();
    // 🔴 (16/11/2026) le cartouche VERT de la case 2 (même classe), puis « Prénom NOM : acceptée »
    const m = container.querySelector('[data-ligne-depliee="C"] [data-edls-cartouche]')!;
    expect(m.className).toBe('pvv-etat pvv-etat--programmee');
    expect(m.textContent).toBe('État des lieux programmé — le 01/06/2099 de 10h00 à 11h00');
    expect(container.querySelector('[data-ligne-depliee="C"] [data-edls-collegue]')!.textContent).toBe('Claire TEST : acceptée');
    expect(container.querySelector('[data-ligne-depliee="C"] [data-edls-mention]')).toBeNull();
    expect(CSS_PREAVIS_ACCUEIL.replace(/\s+/g, ' ')).toContain('.pva-edls{margin:0;padding:8px 10px;border-radius:10px;background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);');
    expect(sous('edls')).toEqual(['étape en cours']);
    act(() => root.unmount()); root = createRoot(container);
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, edls: { ...l.edls!, statut: 'refusee' as const, reponduPar: 'Claire Test' } } : l));
    await ouvrir();
    expect(container.querySelector('[data-ligne-depliee="C"] [data-edls-mention]')!.className).toContain('pva-edls--refus');
    expect(container.querySelector('[data-ligne-depliee="C"] [data-edls-collegue]')!.textContent).toBe('Claire TEST : refusée');
    expect(sous('edls')).toEqual(['Prévu le 01/06/2099 — confié à Claire Test · étape en cours']);
  });

  const CR = { texte: 'Bonjour,\nLogement en bon état.\nMail envoyé par Arno', objet: 'Compte rendu de pré-visite', saisiPar: 'Arnaud Jorel', saisiLe: '2026-11-13T12:52:00Z',
    pieces: [{ id: 41, nom: 'photos.pdf', taille: 2_097_152 }], aucunEnvoi: false,
    destinataires: [
      { nom: 'Alice BERNARD', famille: 'locataire', quand: '2026-11-13T12:52:00Z', etat: 'envoye', motif: null },
      { nom: 'Paul BERNARD', famille: 'locataire', quand: null, etat: 'non_envoye', motif: 'pas d’adresse e-mail' },
      { nom: 'Claire Test', famille: 'interne', quand: '2026-11-13T12:52:00Z', etat: 'echec', motif: 'boîte pleine' },
    ] };
  it('« Voir le compte rendu » : la modale (lecture seule) — texte, qui et quand, pièce, chaque destinataire (nom, famille, date, état) ; Fermer ; aucune écriture', async () => {
    avec('effectuee', { compteRendu: true }); cr = CR;
    await ouvrir();
    const n = posts.length;
    clic('[data-ligne-depliee="C"] [data-voir-compte-rendu="oui"]');
    await attendre(); await attendre();
    const f = document.querySelector('[data-fenetre-compte-rendu]')!;
    expect(lectures).toEqual([expect.stringContaining('previsiteCompteRendu=11,12')]);
    // 🔴 (15/11/2026) la section Texte : le texte saisi, sans « Mail envoyé par … » (le mail complet reste dans « Voir le mail tel qu'envoyé »)
    expect(f.querySelector('[data-cr-texte]')!.textContent).toBe(CR.texte.split(/\n\s*Mail envoyé par /)[0].trim());
    expect(f.querySelector('[data-cr-mail-envoye] pre')!.textContent).toBe(CR.texte);
    expect(f.querySelector('[data-cr-saisi]')!.textContent).toBe('Saisi par Arnaud Jorel le 13/11/2026 à 13h52');
    expect(f.querySelector('[data-cr-piece="41"]')!.getAttribute('href')).toBe('/api/admin/location/pieces-sortie?piece=41');
    const d = [...f.querySelectorAll('[data-cr-destinataire]')].map((x) => [x.getAttribute('data-cr-destinataire'), x.querySelector('.pvv-cr-nom')!.textContent,
      x.querySelector('.pvv-cr-quand')!.textContent, x.querySelector('.pvv-cr-etat')!.textContent]);
    expect(d).toEqual([['locataire', 'Alice BERNARD', 'le 13/11/2026 à 13h52', 'envoyé'], ['locataire', 'Paul BERNARD', '—', 'non envoyé (pas d’adresse e-mail)'],
      ['interne', 'Claire Test', 'le 13/11/2026 à 13h52', 'échec (boîte pleine)']]);
    // 🔴 Arno (15/11/2026) — même mise en forme que le récapitulatif : l'étiquette de famille sur chaque envoi
    expect([...f.querySelectorAll('[data-cr-destinataire] [data-etiquette-famille]')].map((x) => x.textContent)).toEqual(['MAIL AUX LOCATAIRES', 'MAIL AUX LOCATAIRES', 'MAIL INTERNE À L’AGENCE']);
    expect(f.textContent).not.toMatch(/@/); // aucune adresse
    expect(f.querySelector('[data-cr-aucun-envoi]')).toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    act(() => (f.querySelector('[data-fermer-compte-rendu]') as HTMLButtonElement).click());
    expect(document.querySelector('[data-fenetre-compte-rendu]')).toBeNull();
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(posts.length).toBe(n);
  });
  it('rien d’envoyé : « Compte rendu conservé en interne — aucun mail envoyé »', async () => {
    avec('effectuee', { compteRendu: true }); cr = { ...CR, aucunEnvoi: true, destinataires: [] };
    await ouvrir();
    clic('[data-ligne-depliee="C"] [data-voir-compte-rendu="oui"]');
    await attendre(); await attendre();
    expect(document.querySelector('[data-cr-aucun-envoi]')!.textContent).toBe('Compte rendu conservé en interne — aucun mail envoyé');
  });
  it('aucun compte rendu saisi : le bouton « Aucun compte rendu saisi », inactif (aucune lecture, aucune saisie nouvelle)', async () => {
    avec('effectuee', { compteRendu: false });
    await ouvrir();
    const b = container.querySelector('[data-ligne-depliee="C"] [data-voir-compte-rendu]') as HTMLButtonElement;
    expect([b.textContent, b.disabled, b.getAttribute('data-voir-compte-rendu')]).toEqual(['Aucun compte rendu saisi', true, 'aucun']);
    expect(lectures).toEqual([]);
  });
  it('programmée : pas de bouton « Voir le compte rendu » ; les autres boutons de la case sont toujours là', async () => {
    avec('programmee');
    await ouvrir();
    expect(container.querySelector('[data-ligne-depliee="C"] [data-voir-compte-rendu]')).toBeNull();
    expect(container.querySelector('[data-ligne-depliee="C"] [data-deplacer-previsite]')).not.toBeNull();
    expect(container.querySelector('[data-ligne-depliee="C"] [data-refus-previsite]')).not.toBeNull();
  });
});

describe('🔴🔴 Arno (13/11/2026) — lot A : le lien de l’invitation ouvre le formulaire ; « non envoyé » en rouge ; iPhone', () => {
  const RDV = { jour: '2026-11-13', heure: '13:45', dureeMinutes: 15 };
  const programmeeCommencee = () => {
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'programmee', rdv: RDV, tacheId: 9, collegues: [], tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null } } : l));
  };
  afterEach(() => { window.history.replaceState(null, '', '/'); });
  // 🔴 Arno (15/11/2026, 5e retour iPhone) — le formulaire est une PAGE : l'ancien lien est redirigé par le serveur (`redirectionAncienLien`,
  // lu par la page Location AVANT tout rendu) ; la Location ne l'ouvre plus en fenêtre.
  it('ancien lien ?previsite=11&geste=compte-rendu → la page /admin/location/previsite/11/compte-rendu (reprise gardée) ; tout autre lien : rien', () => {
    expect(redirectionAncienLien({ previsite: '11', geste: 'compte-rendu' })).toBe('/admin/location/previsite/11/compte-rendu');
    expect(redirectionAncienLien({ previsite: '11', geste: 'compte-rendu', reprise: '1' })).toBe('/admin/location/previsite/11/compte-rendu?reprise=1');
    expect(redirectionAncienLien({ previsite: '11' })).toBeNull();
    expect(redirectionAncienLien({ previsite: 'x', geste: 'compte-rendu' })).toBeNull();
    expect(redirectionAncienLien({ previsite: '0', geste: 'compte-rendu' })).toBeNull();
    expect(redirectionAncienLien({})).toBeNull();
    expect(cheminCompteRendu(11)).toBe('/admin/location/previsite/11/compte-rendu');
    const page = readFileSync('app/(admin)/admin/(protected)/location/page.tsx', 'utf8');
    expect(page).toContain('const cible = redirectionAncienLien(await searchParams);');
    expect(page.indexOf('redirect(cible)')).toBeLessThan(page.indexOf('accesLocation()'));
  });
  it('la Location n’ouvre plus le formulaire en fenêtre, même avec l’ancien paramètre ; 🔴 (9e retour) le bouton de la frise ouvre la fenêtre du compte rendu, dont « Continuer la saisie » est un LIEN vers la page', async () => {
    programmeeCommencee();
    window.history.replaceState(null, '', '/admin/location?previsite=11&geste=compte-rendu');
    await rendre(true); await attendre(); await attendre();
    expect(container.querySelector('[data-ligne-depliee="C"]')).not.toBeNull();
    expect(document.querySelector('[data-fenetre-previsite]')).toBeNull();
    const b = container.querySelector('[data-ligne-depliee="C"] [data-compte-rendu-previsite]') as HTMLButtonElement;
    expect([b.tagName, b.textContent]).toEqual(['BUTTON', 'Compte rendu pré-visite']);
    act(() => b.click()); await attendre();
    expect(document.querySelector('[data-fenetre-compte-rendu="brouillon"]')).not.toBeNull();
    expect(document.querySelector('[data-fenetre-previsite]')).toBeNull();
    const a = document.querySelector('[data-fenetre-compte-rendu] a[data-continuer-saisie]') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('/admin/location/previsite/11/compte-rendu');
  });
  it('la PAGE : le formulaire seul — aucun élément de la Location (bloc des préavis, frise, ligne) ; « ← Retour » vers le bon préavis', async () => {
    programmeeCommencee();
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    await suivreLienCr();
    expect(document.querySelector('[data-fenetre-previsite="saisie"][data-geste-previsite="compte_rendu"]')).not.toBeNull();
    expect(document.querySelector('[data-page-compte-rendu="11"]')).not.toBeNull();
    for (const s of ['[data-bloc-preavis]', '[data-frise-preavis]', '[data-ligne-preavis]', '[data-ligne-depliee]', '.mis-voile', '[aria-modal="true"]']) expect(document.querySelector(s), s).toBeNull();
    const retour = document.querySelector('[data-page-compte-rendu] a[data-retour-lien]') as HTMLAnchorElement;
    expect(retour.getAttribute('href')).toBe('/admin/location?previsite=11');
    expect(retour.textContent).toBe('← Retour');
  });
  it('« Annuler » : retour à la Location sur le bon préavis (ligne dépliée), rien d’envoyé', async () => {
    programmeeCommencee();
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    await suivreLienCr();
    act(() => (document.querySelector('[data-annuler-previsite]') as HTMLButtonElement).click());
    expect(retours).toEqual(['/admin/location?previsite=11']);
    await revenirSurLocation();
    expect(container.querySelector('[data-ligne-depliee="C"]')).not.toBeNull();
    expect(document.querySelector('[data-fenetre-previsite]')).toBeNull();
    expect(posts.filter((c) => String(c.action).includes('compte-rendu'))).toEqual([]);
  });
  it('parcours complet sur la PAGE : saisie, présence, récapitulatif, envoi → retour à la Location, la fenêtre de résultat habituelle (une fois)', async () => {
    programmeeCommencee();
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    await suivreLienCr();
    { const t = document.querySelector('[data-corps-compte-rendu]') as HTMLTextAreaElement; act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(t, 'Logement propre.'); t.dispatchEvent(new Event('input', { bubbles: true })); }); }
    cocherPresence();
    await act(async () => { (document.querySelector('[data-recap-previsite]') as HTMLButtonElement).click(); }); await attendre();
    expect(document.querySelector('[data-fenetre-previsite="recap"]')).not.toBeNull();
    expect(document.querySelector('[data-bloc-preavis]')).toBeNull();
    await act(async () => { (document.querySelector('[data-confirmer-previsite]') as HTMLButtonElement).click(); }); await attendre();
    expect(posts.at(-1)).toMatchObject({ action: 'compte-rendu-previsite', corps: 'Logement propre.', presences: { occupations: [11], personnes: [] } });
    expect(retours).toEqual(['/admin/location?previsite=11']);
    await revenirSurLocation();
    const f = document.querySelector('[data-fenetre-previsite="resultat"][data-geste-previsite="compte_rendu"]')!;
    expect(f.querySelector('[data-titre-previsite]')!.textContent).toBe('✓ Compte rendu envoyé');
    expect(f.querySelector('[data-resume]')!.textContent).toContain('C rue');
    act(() => (document.querySelector('[data-fermer-previsite]') as HTMLButtonElement).click());
    expect(document.querySelector('[data-fenetre-previsite]')).toBeNull();
    // lu une seule fois : un nouveau retour ne le rouvre pas
    await revenirSurLocation();
    expect(document.querySelector('[data-fenetre-previsite]')).toBeNull();
  });
  it('🔴 TOUTE fenêtre ouverte sur téléphone (Valider la sortie, RDV / Tâches, Ajouter une personne…) : la page de fond est MASQUÉE et inerte (une règle commune)', () => {
    const css = readFileSync('app/globals.css', 'utf8').replace(/\s+/g, ' ');
    expect(css).toContain('@media (max-width: 640px) { html:has(.svv-adm-root [aria-modal="true"]) .svv-adm-shell { visibility: hidden; } html:has(.svv-adm-root [aria-modal="true"]) .svv-adm-root [aria-modal="true"] { visibility: visible; } }');
    // les fenêtres de saisie utilisées sur téléphone se déclarent bien « aria-modal » (sans quoi la règle ne les verrait pas)
    for (const f of ['ValidationSortieEdls.tsx', 'ParcoursPreavisSortie.tsx', 'PrevisiteAccueil.tsx', 'CompteRenduSaisie.tsx', '../gestion/FenetreTache.tsx', '../gestion/RecapEnvoisTache.tsx']) {
      expect(readFileSync(`app/(admin)/admin/(protected)/location/${f}`, 'utf8'), f).toContain('aria-modal="true"');
    }
  });
  it('🔴 le fond jusqu’au bord inférieur, EN SOMBRE AUSSI : html et body prennent la couleur du thème résolue, relue au changement de thème, rendue en quittant', async () => {
    const { useFondDeLaPage } = await import('./PageCompteRendu');
    const racine = document.createElement('div'); racine.className = 'svv-adm-root'; racine.setAttribute('data-theme', 'dark');
    racine.style.setProperty('--color-svv-surface', '#1b232f'); document.body.appendChild(racine);
    const hote = document.createElement('div'); racine.appendChild(hote);
    const r2 = createRoot(hote);
    function Sonde() { useFondDeLaPage(); return null; }
    await act(async () => { r2.render(createElement(Sonde)); });
    expect(document.documentElement.style.backgroundColor).toBe('rgb(27, 35, 47)');
    expect(document.body.style.backgroundColor).toBe('rgb(27, 35, 47)');
    // 🔴 (9e retour) la racine aussi, en ligne (plus de règle « :has() » sur <html>)
    expect(racine.style.backgroundColor).toBe('rgb(27, 35, 47)');
    // le thème change (bouton clair / sombre) : la couleur est relue
    racine.style.setProperty('--color-svv-surface', '#ffffff');
    await act(async () => { racine.setAttribute('data-theme', 'light'); await Promise.resolve(); });
    expect(document.body.style.backgroundColor).toBe('rgb(255, 255, 255)');
    await act(async () => { r2.unmount(); });
    expect(document.documentElement.style.backgroundColor).toBe('');
    expect(document.body.style.backgroundColor).toBe('');
    expect(racine.style.backgroundColor).toBe('');
    racine.remove();
  });
  it('🔴 « 1 Issue » : Chrome sur iPhone pose `__gcruniqueid` sur le champ de recherche de la Location avant l’hydratation — React ne s’en plaint pas', () => {
    expect(readFileSync('app/(admin)/admin/(protected)/location/AccueilLocation.tsx', 'utf8')).toContain('<input suppressHydrationWarning value={texte}');
  });
  it('🔴🔴 (15/11/2026) RÉCAPITULATIF PAR FAMILLE : étiquette et couleur, 🔴 (9e retour) les LOCATAIRES d’abord puis l’interne, UNE carte par locataire à son nom, pièces de chaque mail, mention de recette, notes internes dans la seule carte interne', async () => {
    const PHRASE = 'En présence de Alice BERNARD.';
    const APERCU = { phrase: PHRASE, sansEmail: [], notesInternes: ['Mme Léa Martin — mère du locataire'], mails: [
      // le serveur peut les rendre dans n'importe quel ordre : l'écran met les locataires d'abord (9e retour)
      { sorte: 'previsite_compte_rendu', objet: 'CR', a: ['alice@exemple.test'], cc: [], texte: `${PHRASE}\n\nLogement propre.`, famille: 'locataire', destinataire: 'Alice BERNARD',
        pieces: ['Photo-1-cuisine.jpg', 'Vocal-1-cuisine.m4a'], recette: 'Adresse remplacée en recette : envoyé à a.jorel@sansvisavis.com au lieu de l’adresse du locataire.' },
      { sorte: 'previsite_compte_rendu', objet: 'CR', a: ['arno@exemple.test', 'claire@exemple.test'], cc: [], texte: `${PHRASE}\n\nLogement propre.\n\nNotes de présence (internes)`, famille: 'interne',
        pieces: ['Photo-1-cuisine.jpg', 'Vocal-1-cuisine.m4a'] },
      { sorte: 'previsite_compte_rendu', objet: 'CR', a: ['paul@exemple.test'], cc: [], texte: `${PHRASE}\n\nLogement propre.`, famille: 'locataire', destinataire: 'Paul BERNARD',
        pieces: ['Photo-1-cuisine.jpg', 'Vocal-1-cuisine.m4a'] },
    ] };
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (init?.method === 'POST' && String(init.body).includes('"apercu-compte-rendu-previsite"')
      ? ok(APERCU) : (avant as (u: string | URL | Request, i?: RequestInit) => Promise<Response>)(u, init))) as unknown as typeof fetch;
    programmeeCommencee();
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    await suivreLienCr();
    { const t = document.querySelector('[data-corps-compte-rendu]') as HTMLTextAreaElement; act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(t, 'Logement propre.'); t.dispatchEvent(new Event('input', { bubbles: true })); }); }
    cocherPresence();
    await act(async () => { (document.querySelector('[data-recap-previsite]') as HTMLButtonElement).click(); }); await attendre();
    const cartes = [...document.querySelectorAll('[data-famille-mail]')];
    expect(cartes.map((c) => [c.getAttribute('data-famille-mail'), c.querySelector('[data-etiquette-famille]')!.textContent])).toEqual([
      ['locataire', 'MAIL AUX LOCATAIRES'], ['locataire', 'MAIL AUX LOCATAIRES'], ['interne', 'MAIL INTERNE À L’AGENCE']]);
    expect(cartes.map((c) => c.className)).toEqual(['cev-mail mfa-carte mfa-carte--locataire', 'cev-mail mfa-carte mfa-carte--locataire', 'cev-mail mfa-carte mfa-carte--interne']);
    expect(document.querySelector('[data-rappel-familles]')!.textContent).toBe('2 mails locataires · 1 mail interne');
    // une carte par locataire, à son nom ; la carte interne : les collaborateurs destinataires
    expect(cartes.slice(0, 2).map((c) => c.querySelector('[data-destinataire-famille]')!.textContent)).toEqual(['Destinataire : Alice BERNARD', 'Destinataire : Paul BERNARD']);
    expect([...cartes[2].querySelectorAll('[data-collaborateurs-destinataires] li')].map((x) => x.textContent)).toEqual(['arno@exemple.test', 'claire@exemple.test']);
    // la mention de recette, sur la seule carte concernée
    expect(cartes[0].querySelector('[data-recette-remplacement]')!.textContent).toBe('Adresse remplacée en recette : envoyé à a.jorel@sansvisavis.com au lieu de l’adresse du locataire.');
    expect(cartes[1].querySelector('[data-recette-remplacement]')).toBeNull();
    // les pièces jointes de chaque mail ; les notes de présence internes dans la SEULE carte interne
    expect([...cartes[0].querySelectorAll('[data-piece-jointe]')].map((x) => x.textContent)).toEqual(['Photo-1-cuisine.jpg', 'Vocal-1-cuisine.m4a']);
    expect(cartes[2].querySelector('[data-notes-internes-carte]')!.textContent).toContain('Mme Léa Martin — mère du locataire');
    expect(cartes.slice(0, 2).some((c) => c.querySelector('[data-notes-internes-carte]') !== null)).toBe(false);
    // la phrase de présence en tête du texte de chaque carte
    for (const c of cartes) expect(c.querySelector('[data-texte-mail]')!.textContent!.startsWith(PHRASE)).toBe(true);
    global.fetch = avant;
  });
  it('🔴 (15/11/2026) un aperçu SANS « En présence de … » en tête (serveur périmé) : pas de récapitulatif, la raison est dite, rien ne part', async () => {
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (init?.method === 'POST' && String(init.body).includes('"apercu-compte-rendu-previsite"')
      ? ok({ mails: [{ sorte: 'previsite_compte_rendu', objet: 'CR', a: ['arno@exemple.test'], cc: [], texte: 'Logement propre.' }], sansEmail: [] })
      : (avant as (u: string | URL | Request, i?: RequestInit) => Promise<Response>)(u, init))) as unknown as typeof fetch;
    programmeeCommencee();
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    await suivreLienCr();
    { const t = document.querySelector('[data-corps-compte-rendu]') as HTMLTextAreaElement; act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(t, 'Logement propre.'); t.dispatchEvent(new Event('input', { bubbles: true })); }); }
    cocherPresence();
    await act(async () => { (document.querySelector('[data-recap-previsite]') as HTMLButtonElement).click(); }); await attendre();
    expect(document.querySelector('[data-fenetre-previsite="recap"]')).toBeNull();
    expect(document.querySelector('[data-previsite-refus]')!.textContent).toBe('Le récapitulatif ne porte pas « En présence de … » : le serveur doit être relancé (version périmée). Rien n’est parti.');
    global.fetch = avant;
  });
  it('rendez-vous pas commencé, déjà fait, préavis introuvable : la page le dit, sans formulaire', async () => {
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'programmee', rdv: RDV, tacheId: 9, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null } } : l));
    await act(async () => { root.render(createElement(PageCompteRendu, { occupationId: 11 })); }); await attendre(); await attendre();
    expect(document.querySelector('[data-cr-impossible]')!.textContent).toBe('Le compte rendu s’ouvre dès le début du rendez-vous de pré-visite.');
    expect(document.querySelector('[data-fenetre-previsite]')).toBeNull();
    expect(motifSansFormulaire(null)).toContain('plus en cours');
    expect(motifSansFormulaire({ ...lignes[2], previsite: { ...lignes[2].previsite!, statut: 'effectuee', rdvPasse: true } })).toContain('déjà enregistré');
  });
  it('« non envoyé » et « échec » en ROUGE, « envoyé » en vert ; la fenêtre tient dans la zone visible (clavier iPhone), champs en 16 px', async () => {
    const css = (await import('./PrevisiteAccueil')).CSS_PREVISITE.replace(/\s+/g, ' ');
    expect(css).toContain('.pvv-cr-etat--non_envoye{color:var(--color-svv-red)}');
    expect(css).toContain('.pvv-cr-etat--echec{color:var(--color-svv-red)}');
    expect(css).toContain('.pvv-cr-etat--envoye{color:var(--color-svv-green-ink)}');
    expect(css).toContain('.pvv-voile .mis-boite{max-height:100%}');
    expect(css).toContain('font-size:16px;width:100%');
  });
});


describe('🔴🔴 Arno (13/11/2026, lot B) — les photos du formulaire « Compte rendu pré-visite »', () => {
  const RDV = { jour: '2026-11-13', heure: '13:45', dureeMinutes: 15 };
  let deposees: Record<string, unknown>[] = []; let apercus: Record<string, unknown>[] = [];
  beforeEach(() => {
    deposees = []; apercus = []; let n = 70;
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = () => 'blob:apercu'; (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'programmee', rdv: RDV, tacheId: 9, collegues: [], tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null } } : l));
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const c = JSON.parse(String(init.body)) as Record<string, unknown>;
        if (c.action === 'photo-compte-rendu') { deposees.push(c); n += 1; return ok({ id: n, nom: 'photo-previsite.jpg', taille: 300000 }); }
        if (c.action === 'apercu-compte-rendu-previsite') { apercus.push(c); return ok({ mails: [{ sorte: 'previsite_compte_rendu', objet: 'CR', a: ['x@agence.test'], cc: [], texte: 'En présence de Alice BERNARD.\n\nT', piece: 'Photo-1-joint-douche.jpg, Photo-2-rayure-parquet-chambre.jpg' }], sansEmail: [], phrase: 'En présence de Alice BERNARD.' }); }
      }
      return (avant as typeof fetch)(u, init);
    }) as unknown as typeof fetch;
  });
  const clicDoc = (sel: string): void => act(() => (document.querySelector(sel) as HTMLButtonElement).click());
  const ouvrirCr = async () => {
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    await suivreLienCr();
    const t = document.querySelector('[data-corps-compte-rendu]') as HTMLTextAreaElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(t, 'Logement propre.'); t.dispatchEvent(new Event('input', { bubbles: true })); });
  };
  const ajouter = async (sel: string, noms: string[]) => {
    const input = document.querySelector(sel) as HTMLInputElement;
    const fichiers = noms.map((n) => new File([new Uint8Array([1, 2, 3])], n, { type: n.endsWith('.HEIC') ? 'image/heic' : 'image/jpeg' }));
    Object.defineProperty(input, 'files', { value: fichiers, configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    // la conversion se charge au toucher (import dynamique) : on attend que chaque photo soit déposée ou refusée
    for (let k = 0; k < 60 && document.querySelector('[data-photo-etat="envoi"]'); k++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    for (let k = 0; k < 4; k++) await attendre();
  };
  it('🔴 iPhone (14/11/2026) — la conversion des photos ne se charge qu’AU TOUCHER, jamais à l’ouverture du formulaire', async () => {
    await ouvrirCr();
    expect(document.querySelector('[data-photo-camera]')).not.toBeNull();
    expect(charges.photo).toBe(0); // premier essai du fichier qui touche une photo
    await ajouter('[data-photo-camera]', ['IMG_1.jpg']);
    expect(charges.photo).toBe(1);
  });
  const legender = (i: number, v: string) => act(() => {
    const e = document.querySelectorAll('[data-photo-legende]')[i] as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true }));
  });
  it('« Ajouter une photo » ouvre l’appareil photo (capture=environment) ; « Photothèque » sans capture ; plusieurs à la fois ; images seulement', async () => {
    await ouvrirCr();
    const cam = document.querySelector('[data-photo-camera]') as HTMLInputElement;
    const gal = document.querySelector('[data-photo-galerie]') as HTMLInputElement;
    expect([cam.accept, cam.getAttribute('capture'), cam.multiple]).toEqual(['image/*', 'environment', true]);
    expect([gal.accept, gal.getAttribute('capture'), gal.multiple]).toEqual(['image/*', null, true]);
    expect(document.querySelector('[data-ajouter-photo]')!.textContent).toContain('Ajouter une photo');
  });
  it('🔴 LÉGENDE OBLIGATOIRE : une photo sans légende → message clair, la photo en ROUGE, rien n’est envoyé ; légendée → l’aperçu part, dans l’ordre choisi', async () => {
    await ouvrirCr();
    await ajouter('[data-photo-camera]', ['IMG_1.HEIC', 'IMG_2.jpg']);
    expect(deposees.map((d) => d.occupationIds)).toEqual([[11, 12], [11, 12]]);
    expect(deposees[1].dejaIds).toEqual([71]);
    expect([...document.querySelectorAll('[data-photo]')].map((x) => x.getAttribute('data-photo-etat'))).toEqual(['ok', 'ok']);
    legender(0, 'Rayure parquet chambre');
    cocherPresence(); clicDoc('[data-recap-previsite]'); await attendre();
    expect(document.querySelector('[data-previsite-refus]')!.textContent).toBe('La photo 2 n’a pas de légende : chaque photo doit être légendée avant l’envoi.');
    expect(document.querySelector('[data-photo="2"]')!.getAttribute('data-photo-sans-legende')).toBe('oui');
    expect(document.querySelector('[data-photo="2"]')!.className).toContain('pvv-photo--erreur');
    expect(document.querySelector('[data-photo="2"] [data-photo-legende-requise]')!.textContent).toBe('Légende obligatoire avant l’envoi.');
    expect(document.querySelector('[data-photo="1"]')!.getAttribute('data-photo-sans-legende')).toBeNull();
    expect(apercus).toEqual([]);
    legender(1, 'Joint douche');
    clicDoc('[data-photo="1"] [data-photo-descendre]'); // la 1re descend : Joint douche passe en photo 1
    cocherPresence(); clicDoc('[data-recap-previsite]'); await attendre(); await attendre();
    expect(apercus).toHaveLength(1);
    expect(apercus[0].photos).toEqual([{ id: 72, legende: 'Joint douche' }, { id: 71, legende: 'Rayure parquet chambre' }]);
    // le récapitulatif : « Pièces jointes » (jamais « invitation d’agenda » pour des photos)
    expect([...document.querySelectorAll('[data-pieces-famille] [data-piece-jointe]')].map((x) => x.textContent)).toEqual(['Photo-1-joint-douche.jpg', 'Photo-2-rayure-parquet-chambre.jpg']);
    expect(document.querySelector('[data-fenetre-previsite="recap"]')!.textContent).not.toContain('invitation d’agenda');
  });
  it('supprimer une photo avant l’envoi : elle ne part pas', async () => {
    await ouvrirCr();
    await ajouter('[data-photo-galerie]', ['a.jpg', 'b.jpg']);
    legender(0, 'A'); legender(1, 'B');
    // 🔴 Arno (15/11/2026) — supprimer DEMANDE CONFIRMATION (« Garder » : rien ne bouge)
    clicDoc('[data-photo="1"] [data-photo-supprimer]');
    expect(document.querySelector('[data-photo="1"] [data-photo-confirmer]')!.textContent).toContain('Supprimer la photo 1 ?');
    clicDoc('[data-photo="1"] [data-photo-supprimer-non]');
    expect(document.querySelectorAll('[data-photo]')).toHaveLength(2);
    clicDoc('[data-photo="1"] [data-photo-supprimer]');
    clicDoc('[data-photo="1"] [data-photo-supprimer-oui]');
    expect(document.querySelectorAll('[data-photo]')).toHaveLength(1);
    cocherPresence(); clicDoc('[data-recap-previsite]'); await attendre(); await attendre();
    expect(apercus[0].photos).toEqual([{ id: 72, legende: 'B' }]);
  });
});

describe('🔴 Arno (13/11/2026, lot B) — « Voir le compte rendu » : le texte, puis « Photos », chaque photo numérotée avec sa légende', () => {
  it('le texte sans la liste ; les photos (vignette + « Photo N — légende ») ; les autres pièces à part', async () => {
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'effectuee', rdv: { jour: '2026-11-13', heure: '13:45', dureeMinutes: 15 }, tacheId: 9, collegues: [],
      tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null, compteRendu: true } } : l));
    const CR = { texte: 'Logement propre.\n\nPhotos\n\nPhoto 1 — Joint douche\nPhoto 2 — Rayure parquet chambre\n\nMail envoyé par Arno', objet: 'CR', saisiPar: 'Arno', saisiLe: '2026-11-13T15:13:00Z',
      pieces: [{ id: 72, nom: 'photo-previsite.jpg', taille: 300000 }, { id: 71, nom: 'photo-previsite.jpg', taille: 280000 }], aucunEnvoi: false, destinataires: [],
      vocaux: [{ id: 81, nom: 'Vocal-1.m4a', taille: 90000 }] };
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (!init?.method && String(u).includes('previsiteCompteRendu=') ? ok(CR) : (avant as typeof fetch)(u, init))) as unknown as typeof fetch;
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    clic('[data-ligne-depliee="C"] [data-voir-compte-rendu="oui"]'); await attendre(); await attendre();
    const f = document.querySelector('[data-fenetre-compte-rendu]')!;
    expect(f.querySelector('[data-cr-texte]')!.textContent).toBe('Logement propre.'); // 🔴 (15/11/2026) sans « Mail envoyé par … »
    expect([...f.querySelectorAll('[data-cr-photo]')].map((x) => [x.querySelector('img')!.getAttribute('src'), x.querySelector('[data-cr-legende]')!.textContent]))
      .toEqual([['/api/admin/location/pieces-sortie?piece=72', 'Photo 1 — Joint douche'], ['/api/admin/location/pieces-sortie?piece=71', 'Photo 2 — Rayure parquet chambre']]);
    expect(f.querySelector('[data-cr-pieces]')).toBeNull();
    // 🔴 lot C — les vocaux : écoutables ici ; 🔴 (15/11/2026) la section s'appelle « Dictaphone » (ordre du formulaire), chaque vocal porte son statut
    expect(f.querySelector('[data-cr-section="dictaphone"] .pvv-cr-section-titre')!.textContent).toBe('Dictaphone');
    expect(f.querySelector('[data-cr-vocaux]')!.textContent).not.toContain('jamais envoy');
    // 🔴 (11e retour) le titre une fois, le statut en étiquette
    expect(f.querySelector('[data-cr-vocal="1"] [data-cr-vocal-etat]')!.textContent).toBe('NON envoyé (interne)');
    // 🔴 (15/11/2026) — en fichiers vocaux (une ancienne trace : un fichier par vocal), lecture seule
    expect(f.querySelector('[data-cr-vocal="1"] [data-cr-vocal-nom]')!.textContent).toBe('Vocal 1');
    expect(f.querySelector('[data-cr-vocal="1"]')!.getAttribute('data-cr-vocal-prises')).toBe('1');
    expect(f.querySelector('[data-cr-vocal="1"] input, [data-cr-vocal="1"] [data-vocal-supprimer]')).toBeNull();
    act(() => (f.querySelector('[data-fermer-compte-rendu]') as HTMLButtonElement).click());
  });
});

describe('🔴🔴 Arno (15/11/2026) — le formulaire « Compte rendu pré-visite » sur mobile : TEXTE (dictée, clavier), PHOTOS, DICTAPHONE', () => {
  const RDV = { jour: '2026-11-13', heure: '13:45', dureeMinutes: 15 };
  let appels: Record<string, unknown>[] = []; let transcription: { ok: boolean; texte?: string; motif?: string } = { ok: true, texte: 'Le parquet est rayé.' };
  let dictee: { ok: boolean; texte?: string; motif?: string } = { ok: true, texte: 'Cuisine propre' };
  let horloge = 1_000_000; let idSuivant = 80;
  class FauxEnregistreur {
    static isTypeSupported = (t: string) => t === 'audio/mp4';
    static dernier: FauxEnregistreur | null = null;
    mimeType: string; state = 'inactive'; ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
    constructor(_f: unknown, o?: { mimeType?: string }) { this.mimeType = o?.mimeType ?? ''; FauxEnregistreur.dernier = this; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' }) }); this.onstop?.(); }
  }
  beforeEach(() => {
    appels = []; transcription = { ok: true, texte: 'Le parquet est rayé.' }; dictee = { ok: true, texte: 'Cuisine propre' }; horloge = 1_000_000; idSuivant = 80;
    vi.spyOn(Date, 'now').mockImplementation(() => horloge);
    try { window.localStorage.removeItem('svav.compteRendu.photos.vue'); } catch { /* sans stockage */ }
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = () => `blob:vocal-${Math.random()}`; (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FauxEnregistreur;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }) } });
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'programmee', rdv: RDV, tacheId: 9, collegues: [], tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null } } : l));
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const c = JSON.parse(String(init.body)) as Record<string, unknown>;
        if (c.action === 'vocal-compte-rendu') { appels.push(c); idSuivant += 1; return ok({ id: idSuivant, nom: 'Vocal.m4a', taille: 3 }); }
        if (c.action === 'transcrire-vocal') { appels.push(c); return ok(transcription); }
        if (c.action === 'dicter-compte-rendu') { appels.push(c); return ok(dictee); }
        if (c.action === 'apercu-compte-rendu-previsite' || c.action === 'compte-rendu-previsite') { appels.push(c); return ok({ mails: [], sansEmail: [], phrase: 'En présence de Alice BERNARD.' }); }
      }
      return (avant as typeof fetch)(u, init);
    }) as unknown as typeof fetch;
  });
  afterEach(() => { vi.restoreAllMocks(); });
  const clicDoc = (sel: string): void => act(() => (document.querySelector(sel) as HTMLButtonElement).click());
  const ouvrirCr = async (texte = '', curseur = 0) => {
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    await suivreLienCr();
    const t = document.querySelector('[data-corps-compte-rendu]') as HTMLTextAreaElement;
    if (texte !== '') act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(t, texte); t.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => { t.focus(); t.setSelectionRange(curseur, curseur); t.blur(); }); // le toucher d'un bouton fait sortir du champ
  };
  const patienter = async (cond: () => boolean) => { for (let k = 0; k < 60 && !cond(); k++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); await attendre(); };
  /** L'APPUI LONG : le doigt se pose (pointerdown), reste `ms`, se relève (pointerup) — ou SORT du bouton (pointerleave). */
  const maintenir = async (sel: string, ms: number, fin: 'pointerup' | 'pointerleave' = 'pointerup') => {
    const b = document.querySelector(sel) as HTMLButtonElement;
    await act(async () => { b.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })); });
    // l'enregistrement a démarré (chronomètre), ou l'appareil a refusé (message, bouton relâché)
    await patienter(() => b.querySelector('[data-maintien-duree]') !== null || (b.getAttribute('aria-pressed') === 'false' && document.querySelector('[data-vocal-micro], [data-dictee-message]') !== null));
    horloge += ms;
    // le doigt qui SORT du bouton : le navigateur émet « pointerout » (React en tire onPointerLeave)
    await act(async () => { b.dispatchEvent(fin === 'pointerup' ? new MouseEvent('pointerup', { bubbles: true, cancelable: true })
      : new MouseEvent('pointerout', { bubbles: true, cancelable: true, relatedTarget: document.body })); });
    await attendre();
  };

  it('TROIS BLOCS, dans cet ordre : Texte, Photos, Dictaphone ; boutons « Annuler » / « Voir le récapitulatif » EN FIN de formulaire (non collés) ; fond opaque', async () => {
    await ouvrirCr();
    const boite = document.querySelector('[data-fenetre-previsite="saisie"]')!;
    expect([...boite.querySelectorAll('[data-bloc-texte], [data-photos-compte-rendu], [data-vocaux-compte-rendu]')].map((x) => x.querySelector('h3')!.textContent!.split(' ')[0]))
      .toEqual(['Texte', 'Photos', 'Dictaphone']);
    expect(boite.className).toContain('pvv-boite-cr');
    // 🔴 (15/11/2026) — une PAGE : aucune fenêtre, aucun voile ; fond opaque de la page jusqu'au bord inférieur
    expect(boite.closest('.mis-voile')).toBeNull();
    expect(boite.closest('.pvv-page-cr')).not.toBeNull();
    const actions = boite.querySelector('.mis-actions')!;
    expect(boite.lastElementChild).toBe(actions);
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n');
    expect(css).toContain('.pvv-boite-cr .mis-actions{position:static');
    expect(css).toContain('.pvv-page-cr{--pvv-clavier:0px;flex:1 0 auto;background:var(--color-svv-surface)');
  });

  it('🔴 « Maintenir pour dicter » : enregistre TANT QUE le doigt est posé, puis transcrit ; le texte s’insère AU CURSEUR (sans mention) ; aucun fichier gardé ; « Clavier » ouvre la saisie', async () => {
    await ouvrirCr('Entrée propre. Salon rayé.', 15);
    const btn = document.querySelector('[data-dicter]') as HTMLButtonElement;
    expect(btn.getAttribute('style') ?? '').not.toContain('display:none');
    await act(async () => { btn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })); });
    await patienter(() => btn.getAttribute('aria-pressed') === 'true' && btn.className.includes('pvv-maintien--actif') && btn.textContent!.includes('Dictée'));
    expect(btn.className).toContain('pvv-maintien--actif');
    expect(document.activeElement).not.toBe(document.querySelector('[data-corps-compte-rendu]')); // le clavier ne s'ouvre pas
    horloge += 2000;
    await act(async () => { btn.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true })); });
    await patienter(() => appels.some((c) => c.action === 'dicter-compte-rendu'));
    await patienter(() => (document.querySelector('[data-corps-compte-rendu]') as HTMLTextAreaElement).value.includes('Cuisine'));
    expect((document.querySelector('[data-corps-compte-rendu]') as HTMLTextAreaElement).value).toBe('Entrée propre. Cuisine propre Salon rayé.');
    expect(appels.filter((c) => c.action === 'vocal-compte-rendu')).toEqual([]); // la dictée ne dépose rien
    expect(appels.find((c) => c.action === 'dicter-compte-rendu')).toMatchObject({ typeMime: 'audio/mp4', occupationIds: [11, 12] });
    clicDoc('[data-clavier]');
    expect(document.activeElement).toBe(document.querySelector('[data-corps-compte-rendu]'));
  });

  it('dictée : un appui de moins d’une demi-seconde est ignoré ; 🔴 (7e retour) le doigt qui GLISSE hors du bouton n’arrête PAS (seul le retrait du doigt arrête) ; un échec de transcription : message, texte intact', async () => {
    await ouvrirCr('Mon texte.', 10);
    await maintenir('[data-dicter]', 300);
    expect(document.querySelector('[data-dictee-message]')!.textContent).toContain('Appui trop bref');
    expect(appels.some((c) => c.action === 'dicter-compte-rendu')).toBe(false);
    dictee = { ok: false, motif: 'La transcription a échoué.' };
    const b = document.querySelector('[data-dicter]') as HTMLButtonElement;
    await act(async () => { b.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })); });
    await patienter(() => b.querySelector('[data-maintien-duree]') !== null);
    horloge += 1500;
    // un léger glissement : le doigt sort du bouton (pointerout / pointerleave), le navigateur reprend le geste (pointercancel) — on enregistre TOUJOURS
    await act(async () => { b.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, cancelable: true, relatedTarget: document.body })); b.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true })); });
    expect(b.getAttribute('data-enregistrement')).toBe('oui');
    // le retrait du doigt, même hors du bouton : l'arrêt
    await act(async () => { window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })); });
    await attendre();
    await patienter(() => document.querySelector('[data-dictee-motif]') !== null);
    expect(document.querySelector('[data-dictee-motif]')!.textContent).toBe('La transcription a échoué.');
    expect((document.querySelector('[data-corps-compte-rendu]') as HTMLTextAreaElement).value).toBe('Mon texte.');
  });

  it('🔴 DICTAPHONE : plusieurs PRISES dans le même fichier ; « Nouveau fichier vocal » ; renommer ; supprimer une prise et un fichier (confirmés) ; transcription À LA DEMANDE seulement', async () => {
    await ouvrirCr('Début.', 6);
    await maintenir('[data-enregistrer-vocal]', 2000);
    await maintenir('[data-enregistrer-vocal]', 3000);
    await patienter(() => document.querySelectorAll('[data-vocal="1"] [data-prise-etat="ok"]').length === 2);
    expect(document.querySelector('[data-vocal="1"]')!.getAttribute('data-vocal-prises')).toBe('2');
    expect(document.querySelector('[data-vocal="1"] [data-vocal-resume]')!.textContent).toBe('2 prises · 00:05');
    expect(appels.filter((c) => c.action === 'transcrire-vocal')).toEqual([]); // plus automatique
    clicDoc('[data-nouveau-vocal]');
    await maintenir('[data-enregistrer-vocal]', 1000);
    await patienter(() => document.querySelectorAll('[data-vocal="2"] [data-prise-etat="ok"]').length === 1);
    expect([...document.querySelectorAll('[data-vocal]')].map((x) => x.getAttribute('data-vocal-prises'))).toEqual(['2', '1']);
    const nom = document.querySelector('[data-vocal="2"] [data-vocal-nom]') as HTMLInputElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(nom, 'Salle de bain'); nom.dispatchEvent(new Event('input', { bubbles: true })); });
    // supprimer une prise : confirmée
    clicDoc('[data-vocal="1"] [data-prise="1"] [data-prise-supprimer]');
    clicDoc('[data-vocal="1"] [data-prise="1"] [data-prise-supprimer-oui]');
    expect(document.querySelector('[data-vocal="1"]')!.getAttribute('data-vocal-prises')).toBe('1');
    // transcrire le fichier 1, à la demande : inséré au curseur, avec la mention
    clicDoc('[data-vocal="1"] [data-vocal-transcrire]');
    await patienter(() => (document.querySelector('[data-corps-compte-rendu]') as HTMLTextAreaElement).value.includes('parquet'));
    // 🔴 (15/11/2026) — la transcription arrive sur sa ligne : elle reçoit son tiret
    expect((document.querySelector('[data-corps-compte-rendu]') as HTMLTextAreaElement).value).toBe('Début.\n- Le parquet est rayé. (transcrit d’un vocal)');
    // envoi : les prises restantes, groupées par fichier, avec les noms
    cocherPresence(); clicDoc('[data-recap-previsite]'); await attendre(); await attendre();
    expect(appels.find((c) => c.action === 'apercu-compte-rendu-previsite')!.vocaux).toBeUndefined(); // l'aperçu ne reçoit aucun vocal
    clicDoc('[data-confirmer-previsite]'); await attendre(); await attendre();
    const envoi = appels.find((c) => c.action === 'compte-rendu-previsite')!;
    expect(envoi.fichiersVocaux).toEqual([{ nom: 'Vocal 1', ids: [82], locataires: false }, { nom: 'Salle de bain', ids: [83], locataires: false }]);
    expect(envoi.vocaux).toEqual([82, 83]);
  });

  it('supprimer un fichier vocal : confirmation, puis plus rien ; « Garder » ne touche à rien', async () => {
    await ouvrirCr();
    await maintenir('[data-enregistrer-vocal]', 1200);
    await patienter(() => document.querySelector('[data-vocal="1"] [data-prise-etat="ok"]') !== null);
    clicDoc('[data-vocal="1"] [data-vocal-supprimer]');
    expect(document.querySelector('[data-vocal-confirmer]')!.textContent).toContain('Supprimer « Vocal 1 » et ses 1 prise ?');
    clicDoc('[data-vocal-supprimer-non]');
    expect(document.querySelector('[data-vocal="1"]')).not.toBeNull();
    clicDoc('[data-vocal="1"] [data-vocal-supprimer]'); clicDoc('[data-vocal-supprimer-oui]');
    expect(document.querySelector('[data-vocal]')).toBeNull();
  });

  it('🔴 iPhone — l’enregistreur ne se charge qu’AU TOUCHER ; micro refusé ou appareil sans MediaRecorder : message clair, aucun plantage', async () => {
    const avant = charges.vocal;
    await ouvrirCr('CR.', 3);
    expect(charges.vocal).toBe(avant);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { throw new Error('refus'); } } });
    await maintenir('[data-enregistrer-vocal]', 1000);
    expect(document.querySelector('[data-vocal-micro]')!.textContent).toContain('Le micro est inaccessible');
    delete (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [] }) } });
    await maintenir('[data-dicter]', 1000);
    expect(document.querySelector('[data-dictee-message]')!.textContent).toContain('n’est pas disponible sur cet appareil');
    expect((document.querySelector('[data-corps-compte-rendu]') as HTMLTextAreaElement).value).toBe('CR.');
  });
});

describe('🔴 Arno (15/11/2026) — PHOTOS : Carrousel / Liste, choix mémorisé sur l’appareil ; légende toujours modifiable', () => {
  const RDV = { jour: '2026-11-13', heure: '13:45', dureeMinutes: 15 };
  beforeEach(() => {
    try { window.localStorage.removeItem('svav.compteRendu.photos.vue'); } catch { /* sans stockage */ }
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = () => 'blob:apercu'; (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'programmee', rdv: RDV, tacheId: 9, collegues: [], tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null } } : l));
    let n = 70;
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST' && (JSON.parse(String(init.body)) as { action?: string }).action === 'photo-compte-rendu') { n += 1; return ok({ id: n, nom: 'p.jpg', taille: 3 }); }
      return (avant as typeof fetch)(u, init);
    }) as unknown as typeof fetch;
  });
  const ouvrir = async () => {
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    await suivreLienCr();
    const input = document.querySelector('[data-photo-galerie]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: ['a.jpg', 'b.jpg', 'c.jpg'].map((x) => new File([new Uint8Array([1])], x, { type: 'image/jpeg' })), configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    for (let k = 0; k < 60 && document.querySelector('[data-photo-etat="envoi"]'); k++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
  };
  it('🔴 (15/11/2026) Carrousel PAR DÉFAUT : défilement horizontal, une photo à la fois, indicateur 1/n et ‹ › ; le choix est MÉMORISÉ', async () => {
    await ouvrir();
    const bloc = () => document.querySelector('[data-photos-compte-rendu]')!;
    expect(bloc().getAttribute('data-vue-photos')).toBe('carrousel');
    expect(bloc().getAttribute('data-vue-photos')).toBe('carrousel');
    expect(bloc().querySelector('.pvv-carrousel')).not.toBeNull();
    expect(document.querySelector('[data-carrousel-indicateur]')!.textContent).toBe('1/3');
    act(() => (document.querySelector('[data-carrousel-suivante]') as HTMLButtonElement).click());
    expect(document.querySelector('[data-carrousel-indicateur]')!.textContent).toBe('2/3');
    expect(window.localStorage.getItem('svav.compteRendu.photos.vue')).toBeNull(); // le défaut n'est pas un choix
    act(() => (document.querySelector('[data-vue-liste]') as HTMLButtonElement).click());
    expect(window.localStorage.getItem('svav.compteRendu.photos.vue')).toBe('liste');
    expect(bloc().querySelector('.pvv-carrousel')).toBeNull();
    act(() => (document.querySelector('[data-vue-carrousel]') as HTMLButtonElement).click());
    expect(window.localStorage.getItem('svav.compteRendu.photos.vue')).toBe('carrousel');
  });
  it('la légende reste MODIFIABLE à tout moment, dans les deux affichages', async () => {
    window.localStorage.setItem('svav.compteRendu.photos.vue', 'carrousel');
    await ouvrir();
    expect(document.querySelector('[data-photos-compte-rendu]')!.getAttribute('data-vue-photos')).toBe('carrousel');
    const champs = [...document.querySelectorAll('[data-photo-legende]')] as HTMLInputElement[];
    expect(champs).toHaveLength(3);
    expect(champs.every((c) => !c.disabled && !c.readOnly)).toBe(true);
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champs[1], 'Joint douche'); champs[1].dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => (document.querySelector('[data-vue-liste]') as HTMLButtonElement).click());
    expect((document.querySelectorAll('[data-photo-legende]')[1] as HTMLInputElement).value).toBe('Joint douche');
  });
});

describe('🔴🔴 Arno (14/11/2026, 473) — le PRÉAVIS DE TEST à l’écran', () => {
  let preavisTest: { administrateur: boolean; disponible: boolean } | undefined;
  beforeEach(() => {
    preavisTest = { administrateur: true, disponible: true };
    lignes = [...LIGNES.map((l) => ({ ...l })), ligne('T', { adresse: '1 rue du Préavis de Test (FICTIF)', occupationId: 5000, occupationIds: [5000], lotId: 900,
      locataires: [{ occupationId: 5000, locataireId: 70, nom: 'TEST' }], test: true, testId: 3,
      previsite: { statut: 'alerte', rdv: null, tacheId: null, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null } })];
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      if (init?.method !== 'POST' && String(u).includes('preavisEnCours=1')) return ok({ disponible: true, etatDesLieux: true, planification, previsite: true, lignes, preavisTest });
      if (init?.method !== 'POST' && String(u).includes('previsiteCollegues=1')) return ok([{ id: 1, libelle: 'Moi (Arno)' }, { id: 4, libelle: 'Claire Test' }]);
      if (init?.method === 'POST') {
        const c = JSON.parse(String(init.body)) as Record<string, unknown>;
        posts.push(c);
        if (c.action === 'supprimer-preavis-test') lignes = lignes.filter((l) => l.testId !== c.testId);
        return ok({ testId: 3 });
      }
      return (avant as typeof fetch)(u, init);
    }) as unknown as typeof fetch;
  });
  it('badge « TEST » sur la ligne ; 🔴 (15/11/2026, accord d’Arno) dans la vue où il apparaît, le test est compté comme les autres : nombre et filtres = lignes affichées', async () => {
    await rendre(false);
    expect(container.querySelector('[data-ligne-preavis="T"] [data-badge-test]')!.textContent).toBe('TEST');
    const affichees = container.querySelectorAll('[data-ligne-preavis]').length;
    expect(affichees).toBe(4);
    expect(container.querySelector('[data-nombre-preavis]')!.textContent).toBe('4');
    expect(container.querySelector('[data-ligne-preavis="A"] [data-badge-test]')).toBeNull();
    // la pastille du menu (préavis en alerte) n'est pas concernée : elle n'entre pas les tests (inchangée)
    const { compterPreavisEnAlerte } = await import('../../../../lib/location/previsite');
    expect(compterPreavisEnAlerte([{ previsite: { statut: 'alerte' }, test: true }])).toBe(0);
  });
  it('« Préavis de test » : discret, réservé aux administrateurs ; l’explication, puis « Créer le préavis de test »', async () => {
    await rendre(false);
    clic('[data-ouvrir-preavis-test]');
    expect(container.querySelector('[data-panneau-preavis-test]')!.textContent).toContain('ne partent qu’à votre adresse');
    await act(async () => { (container.querySelector('[data-creer-preavis-test]') as HTMLButtonElement).click(); });
    await attendre();
    expect(posts.at(-1)).toEqual({ action: 'creer-preavis-test' });
    expect(container.querySelector('[data-preavis-bilan]')!.textContent).toContain('Préavis de test créé');
  });
  it('un compte non administrateur ne voit pas le bouton', async () => {
    preavisTest = { administrateur: false, disponible: false };
    await rendre(false);
    expect(container.querySelector('[data-ouvrir-preavis-test]')).toBeNull();
  });
  it('dépliée : le bandeau « Préavis de test » ; « Supprimer ce préavis de test » demande confirmation DANS la page, puis la ligne disparaît', async () => {
    await rendre(false);
    clic('button[data-ouvrir-preavis="T"]'); await attendre();
    expect(container.querySelector('[data-bandeau-preavis-test]')!.textContent).toContain('tous ses mails ne partent qu’à votre adresse');
    clic('[data-supprimer-preavis-test]');
    expect(posts.some((p) => p.action === 'supprimer-preavis-test')).toBe(false);
    await act(async () => { (container.querySelector('[data-confirmer-suppression-test]') as HTMLButtonElement).click(); });
    for (let k = 0; k < 4; k++) await attendre();
    expect(posts.find((p) => p.action === 'supprimer-preavis-test')).toEqual({ action: 'supprimer-preavis-test', testId: 3 });
    expect(container.querySelector('[data-ligne-preavis="T"]')).toBeNull();
  });
  it('RDV pré-visite d’un test : « Dans 2 minutes » remplit le créneau ; seul « vous » est proposé (jamais un collègue)', async () => {
    await rendre(false);
    clic('button[data-ouvrir-preavis="T"]'); await attendre();
    clic('[data-ligne-depliee="T"] [data-rdv-previsite]'); await attendre(); await attendre();
    act(() => (document.querySelector('[data-previsite-deux-minutes]') as HTMLButtonElement).click());
    expect((document.querySelector('[data-previsite-jour]') as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(document.querySelector('[data-previsite-debut]')?.getAttribute('data-valeur')).toMatch(/^\d{2}:\d{2}$/);
    const choix = document.querySelector('[data-previsite-destinataires]')!.textContent ?? '';
    expect(choix).toContain('Moi (Arno)');
    expect(choix).not.toContain('Claire Test');
  });
});

describe('🔴🔴 Arno (15/11/2026, retours iPhone) — compte rendu : Entrée et tirets, Clavier en bascule, ordre des boutons, en-tête, thème, vocaux envoyés aux locataires', () => {
  const RDV = { jour: '2026-11-13', heure: '13:45', dureeMinutes: 15 };
  let appels: Record<string, unknown>[] = []; let horloge = 1_000_000; let idSuivant = 90;
  class FauxEnregistreur {
    static isTypeSupported = (t: string) => t === 'audio/mp4';
    mimeType: string; state = 'inactive'; ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
    constructor(_f: unknown, o?: { mimeType?: string }) { this.mimeType = o?.mimeType ?? ''; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' }) }); this.onstop?.(); }
  }
  beforeEach(() => {
    appels = []; horloge = 1_000_000; idSuivant = 90;
    vi.spyOn(Date, 'now').mockImplementation(() => horloge);
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = () => `blob:x-${Math.random()}`; (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FauxEnregistreur;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }) } });
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, locataires: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01' }, { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', entree: '2023-01-15' }],
      previsite: { statut: 'programmee', rdv: RDV, tacheId: 9, collegues: [], tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null } } : l));
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const c = JSON.parse(String(init.body)) as Record<string, unknown>;
        if (c.action === 'vocal-compte-rendu') { appels.push(c); idSuivant += 1; return ok({ id: idSuivant, nom: 'Vocal.m4a', taille: 3 }); }
        if (c.action === 'dicter-compte-rendu') { appels.push(c); return ok({ ok: true, texte: 'Cuisine propre' }); }
        if (c.action === 'apercu-compte-rendu-previsite' || c.action === 'compte-rendu-previsite') { appels.push(c); return ok({ mails: [], sansEmail: [], phrase: 'En présence de Alice BERNARD.' }); }
      }
      return (avant as typeof fetch)(u, init);
    }) as unknown as typeof fetch;
  });
  afterEach(() => { vi.restoreAllMocks(); });
  const zone = () => document.querySelector('[data-corps-compte-rendu]') as HTMLTextAreaElement;
  const taper = (v: string, curseur = v.length) => act(() => {
    const t = zone(); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(t, v); t.setSelectionRange(curseur, curseur); t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const ouvrirCr = async () => { await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre(); await suivreLienCr(); };
  const patienter = async (cond: () => boolean) => { for (let k = 0; k < 60 && !cond(); k++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); await attendre(); };
  const maintenir = async (sel: string, ms: number) => {
    const b = document.querySelector(sel) as HTMLButtonElement;
    await act(async () => { b.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })); });
    await patienter(() => b.querySelector('[data-maintien-duree]') !== null);
    horloge += ms;
    await act(async () => { b.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true })); });
    await attendre();
  };

  it('ordre : « Clavier » à gauche, « Maintenir pour dicter » à droite ; « Photothèque » à gauche, « Ajouter une photo » à droite ; « Entrée » sur la ligne du titre « Texte »', async () => {
    await ouvrirCr();
    const boutons = [...document.querySelectorAll('.pvv-texte-boutons > button')];
    expect(boutons.map((b) => (b.hasAttribute('data-clavier') ? 'clavier' : b.hasAttribute('data-dicter') ? 'dicter' : '?'))).toEqual(['clavier', 'dicter']);
    expect([...document.querySelectorAll('.pvv-photos-boutons label')].map((x) => x.textContent!.replace(/^\W+/u, ''))).toEqual(['Photothèque', 'Ajouter une photo']);
    expect(document.querySelector('[data-bloc-texte] .pvv-bloc-tete [data-entree]')).not.toBeNull();
  });

  it('🔴 « Clavier » en BASCULE : 1er appui ouvre (focus), 2e appui referme (perte du focus) ; libellé et état le disent', async () => {
    await ouvrirCr();
    const b = () => document.querySelector('[data-clavier]') as HTMLButtonElement;
    expect(b().getAttribute('aria-pressed')).toBe('false');
    act(() => b().click());
    expect(document.activeElement).toBe(zone());
    expect(b().getAttribute('aria-pressed')).toBe('true');
    expect(b().textContent).toContain('Fermer le clavier');
    act(() => b().click());
    expect(document.activeElement).not.toBe(zone());
    expect(b().getAttribute('aria-pressed')).toBe('false');
    expect(b().textContent).toContain('Clavier');
  });

  it('🔴 « Entrée » insère une ligne AU CURSEUR sans ouvrir le clavier ; 🔴 (6e retour) le tiret TOUT DE SUITE (« - | ») ; pas sur la 1re ligne ; pas de double tiret ; le tiret orphelin n’est pas enregistré', async () => {
    await ouvrirCr();
    taper('Salon propre');
    expect(zone().value).toBe('Salon propre');
    act(() => (document.querySelector('[data-entree]') as HTMLButtonElement).click());
    expect(zone().value).toBe('Salon propre\n- ');
    expect(document.activeElement).not.toBe(zone());
    taper('Salon propre\n- C');
    expect(zone().value).toBe('Salon propre\n- C');
    taper('Salon propre\n- Cuisine\n- déjà\n');
    expect(zone().value).toBe('Salon propre\n- Cuisine\n- déjà\n');
    // le curseur sur la ligne qui n'a que son tiret : il reste (on va y dicter) ; à l'enregistrement, il est retiré
    taper('Salon propre\n- Cuisine\n- ');
    expect(zone().value).toBe('Salon propre\n- Cuisine\n- ');
    cocherPresence(); act(() => (document.querySelector('[data-recap-previsite]') as HTMLButtonElement).click()); await attendre(); await attendre();
    expect(appels.find((c) => c.action === 'apercu-compte-rendu-previsite')!.corps).toBe('Salon propre\n- Cuisine');
  });

  it('une DICTÉE qui arrive sur une ligne vide reçoit son tiret', async () => {
    await ouvrirCr();
    taper('Entrée.\n');
    await maintenir('[data-dicter]', 1500);
    await patienter(() => zone().value.includes('Cuisine'));
    expect(zone().value).toBe('Entrée.\n- Cuisine propre');
  });

  it('en-tête : l’adresse, puis chaque locataire et « Entré(e) dans les lieux le JJ/MM/AAAA » ; le bouton clair / sombre sur la ligne du titre (même réglage que l’admin)', async () => {
    await ouvrirCr();
    expect(document.querySelector('[data-cr-adresse]')!.textContent).toBe('C rue');
    expect([...document.querySelectorAll('[data-cr-locataire]')].map((x) => x.textContent)).toEqual([
      'BERNARD Alice — Entré(e) dans les lieux le 01/09/2022', 'BERNARD Paul — Entré(e) dans les lieux le 15/01/2023']);
    const theme = document.querySelector('.pvv-titre-ligne [data-theme-bascule]') as HTMLButtonElement;
    expect(theme).not.toBeNull();
    const avant = theme.getAttribute('data-theme-bascule');
    act(() => theme.click());
    expect(window.localStorage.getItem('svv-theme')).toBe(avant === 'dark' ? 'light' : 'dark');
    try { window.localStorage.removeItem('svv-theme'); } catch { /* rien */ }
  });

  it('🔴 vocal « Envoyé aux locataires » : NON par défaut ; activé, il part avec l’aperçu et l’envoi ; le RÉCAPITULATIF le dit pour chaque vocal (vert / interne)', async () => {
    await ouvrirCr();
    taper('CR.');
    await maintenir('[data-enregistrer-vocal]', 1500);
    act(() => (document.querySelector('[data-nouveau-vocal]') as HTMLButtonElement).click());
    await maintenir('[data-enregistrer-vocal]', 1500);
    await patienter(() => document.querySelectorAll('[data-prise-etat="ok"]').length === 2);
    expect([...document.querySelectorAll('[data-vocal-locataires]')].map((x) => x.getAttribute('data-vocal-locataires'))).toEqual(['non', 'non']);
    expect(document.querySelector('[data-vocal="1"] [data-vocal-locataires]')!.textContent).toBe('Non envoyé aux locataires');
    act(() => (document.querySelector('[data-vocal="2"] [data-vocal-locataires-case]') as HTMLInputElement).click());
    expect(document.querySelector('[data-vocal="2"] [data-vocal-locataires]')!.textContent).toBe('Envoyé aux locataires');
    // 🔴 (15/11/2026) — l'envoi aux locataires est ACTIVÉ par défaut : rien à toucher
    expect(document.querySelector('[data-aussi-locataires]')!.getAttribute('aria-pressed')).toBe('true');
    cocherPresence(); act(() => (document.querySelector('[data-recap-previsite]') as HTMLButtonElement).click()); await attendre(); await attendre();
    const apercu = appels.find((c) => c.action === 'apercu-compte-rendu-previsite')!;
    expect(apercu.fichiersVocaux).toEqual([{ nom: 'Vocal 1', ids: [91], locataires: false }, { nom: 'Vocal 2', ids: [92], locataires: true }]);
    expect([...document.querySelectorAll('[data-recap-vocal]')].map((x) => [x.getAttribute('data-recap-vocal'), x.textContent])).toEqual([
      ['interne', 'Vocal 1 — NON envoyé (interne)'], ['envoye', 'Vocal 2 — ENVOYÉ aux locataires']]);
    act(() => (document.querySelector('[data-confirmer-previsite]') as HTMLButtonElement).click()); await attendre(); await attendre();
    expect(appels.find((c) => c.action === 'compte-rendu-previsite')!.fichiersVocaux).toEqual([{ nom: 'Vocal 1', ids: [91], locataires: false }, { nom: 'Vocal 2', ids: [92], locataires: true }]);
  });

  it('🔴 (15/11/2026) « Objet : … » (deux-points, espace) ; le GROS bouton d’envoi aux locataires : activé par défaut (plein rouge, coche, noms), un appui le désactive (contour, « interne uniquement »), l’aide suit', async () => {
    await ouvrirCr();
    expect(document.querySelector('[data-objet-ligne]')!.textContent).toMatch(/^Objet : Compte rendu de pré-visite/);
    const b = document.querySelector('[data-aussi-locataires]') as HTMLButtonElement;
    expect(b.tagName).toBe('BUTTON');
    expect(document.querySelector('input[type="checkbox"][data-aussi-locataires]')).toBeNull();
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(b.className).toContain('svv-btn-primary'); expect(b.className).toContain('pvv-gros'); expect(b.className).toContain('pvv-envoi-loc--oui');
    expect(b.textContent).toBe(' Compte rendu envoyé aux locataires');
    expect(b.querySelector('svg')).not.toBeNull(); // la coche dessinée
    expect(document.querySelector('[data-destinataires-titre]')!.textContent).toBe('Les destinataires :');
    expect(document.querySelector('[data-aide-envoi-locataires]')!.textContent).toContain('chaque locataire reçoit en plus SON propre mail');
    act(() => b.click());
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(b.className).toContain('svv-btn-outline'); expect(b.className).not.toContain('svv-btn-primary');
    expect(b.textContent).toBe('Compte rendu NON envoyé aux locataires (interne uniquement)');
    expect(document.querySelectorAll('[data-destinataire-liste="locataire"]')).toHaveLength(0); // désactivé : les seuls internes
    expect(document.querySelector('[data-aide-envoi-locataires]')!.textContent).toContain('aucun locataire ne le reçoit');
    act(() => b.click());
    expect(b.getAttribute('aria-pressed')).toBe('true');
    const css = (await import('./CompteRenduSaisie')).CSS_COMPTE_RENDU_SAISIE.replace(/\s+/g, ' ');
    expect(css).toContain('.pvv-envoi-loc--oui.svv-btn,.pvv-envoi-loc--oui{background:var(--color-svv-red);color:var(--color-svv-surface)');
  });
  it('🔴🔴 (6e retour) « Les destinataires : » un par ligne — barre VERTE pour chaque locataire, GRISE pour chaque interne ; désactivé : les seuls internes ; mention de recette', async () => {
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (!init?.method && String(u).includes('previsiteDestinataires=')
      ? ok({ locataires: [{ nom: 'Monia MAGNANI', recette: 'Adresse remplacée en recette : envoyé à a.jorel@sansvisavis.com au lieu de l’adresse du locataire.' }],
        sansEmail: ['Paul BERNARD'], internes: ['a.jorel@sansvisavis.com', 'gestion@exemple.test'], recetteInternes: null })
      : (avant as typeof fetch)(u, init))) as unknown as typeof fetch;
    await ouvrirCr();
    await attendre();
    const lignes = () => [...document.querySelectorAll('[data-destinataire-liste]')].map((x) => [x.getAttribute('data-destinataire-liste'), x.querySelector('.pvv-dest-nom')!.textContent, x.className]);
    expect(lignes()).toEqual([['locataire', 'Monia MAGNANI', 'pvv-dest pvv-dest--locataire'], ['interne', 'a.jorel@sansvisavis.com', 'pvv-dest pvv-dest--interne'],
      ['interne', 'gestion@exemple.test', 'pvv-dest pvv-dest--interne']]);
    expect(document.querySelector('[data-destinataire-recette]')!.textContent).toContain('Adresse remplacée en recette');
    expect(document.querySelector('[data-envoi-locataires-sans-email]')!.textContent).toBe('Sans adresse e-mail, ne le recevra pas : Paul BERNARD');
    act(() => (document.querySelector('[data-aussi-locataires]') as HTMLButtonElement).click());
    expect(lignes().map((x) => x[0])).toEqual(['interne', 'interne']);
    const css = (await import('./CompteRenduSaisie')).CSS_COMPTE_RENDU_SAISIE.replace(/\s+/g, ' ');
    expect(css).toContain('.pvv-dest--locataire{--pvv-dest:var(--color-svv-green-ink)}');
    expect(css).toContain('.pvv-dest--interne{--pvv-dest:var(--color-svv-gray)}');
    global.fetch = avant;
  });
  it('vocal marqué « Envoyé aux locataires » mais envoi aux locataires DÉSACTIVÉ : le récapitulatif dit NON envoyé, et pourquoi ; rien ne part aux locataires', async () => {
    await ouvrirCr();
    taper('CR.');
    await maintenir('[data-enregistrer-vocal]', 1500);
    await patienter(() => document.querySelectorAll('[data-prise-etat="ok"]').length === 1);
    act(() => (document.querySelector('[data-vocal-locataires-case]') as HTMLInputElement).click());
    act(() => (document.querySelector('[data-aussi-locataires]') as HTMLButtonElement).click()); // désactivé
    cocherPresence(); act(() => (document.querySelector('[data-recap-previsite]') as HTMLButtonElement).click()); await attendre(); await attendre();
    expect(document.querySelector('[data-recap-vocal]')!.textContent).toBe('Vocal 1 — NON envoyé (interne) — l’envoi aux locataires est désactivé : activez « Compte rendu envoyé aux locataires » pour le joindre');
    expect(appels.find((c) => c.action === 'apercu-compte-rendu-previsite')!.aussiLocataires).toBe(false);
  });

  it('« Voir le compte rendu » : chaque vocal dit s’il est parti aux locataires', async () => {
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'effectuee', rdv: RDV, tacheId: 9, collegues: [], tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null, compteRendu: true } } : l));
    const CR = { texte: 'CR', objet: 'CR', saisiPar: 'Arno', saisiLe: '2026-11-13T15:13:00Z', pieces: [], aucunEnvoi: false, destinataires: [],
      vocaux: [{ id: 81, nom: 'a', taille: 3 }, { id: 82, nom: 'b', taille: 3 }],
      fichiersVocaux: [{ nom: 'Cuisine', prises: [{ id: 81, nom: 'a', taille: 3 }], locataires: true }, { nom: 'Salon', prises: [{ id: 82, nom: 'b', taille: 3 }] }] };
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (!init?.method && String(u).includes('previsiteCompteRendu=') ? ok(CR) : (avant as typeof fetch)(u, init))) as unknown as typeof fetch;
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    clic('[data-ligne-depliee="C"] [data-voir-compte-rendu="oui"]'); await attendre(); await attendre();
    expect([...document.querySelectorAll('[data-cr-vocal-etat]')].map((x) => [x.getAttribute('data-cr-vocal-etat'), x.textContent])).toEqual([
      ['envoye', 'ENVOYÉ aux locataires'], ['interne', 'NON envoyé (interne)']]);
  });

  it('🔴 fond OPAQUE sur toute la hauteur : une PAGE (rien dessous), la page elle-même et la racine opaques ; la marge du bas suit le clavier (zone visible)', async () => {
    await ouvrirCr();
    expect(document.querySelector('.mis-voile, .pvv-voile-cr')).toBeNull();
    const page = document.querySelector('.pvv-page-cr') as HTMLElement;
    expect(page.style.getPropertyValue('--pvv-clavier')).toBe('0px');
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n');
    // 🔴 (9e retour) plus AUCUNE règle « :has() » sur <html> / <body> / la racine (cause de la page blanche sur l'iPhone) : le fond y est posé en ligne
    expect(css).not.toContain('html:has(.pvv-page-cr)');
    expect(css).not.toContain('.svv-adm-root:has(.pvv-page-cr)');
    expect(css).toContain('.pvv-page-cr{--pvv-clavier:0px;flex:1 0 auto;background:var(--color-svv-surface)');
    expect(css).toContain('padding-bottom:var(--pvv-clavier)');
    expect(css).toContain('.pvv-page{min-height:100dvh');
  });
});

describe('🔴🔴 Arno (15/11/2026, 3e retour iPhone) — PRÉSENCE, esthétique homogène, enregistrement en ROUGE', () => {
  const RDV = { jour: '2026-11-13', heure: '13:45', dureeMinutes: 15 };
  let appels: Record<string, unknown>[] = []; let horloge = 1_000_000;
  class FauxEnregistreur {
    static isTypeSupported = (t: string) => t === 'audio/mp4';
    mimeType: string; state = 'inactive'; ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
    constructor(_f: unknown, o?: { mimeType?: string }) { this.mimeType = o?.mimeType ?? ''; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array([1])], { type: 'audio/mp4' }) }); this.onstop?.(); }
  }
  beforeEach(() => {
    appels = []; horloge = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => horloge);
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = () => 'blob:x'; (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FauxEnregistreur;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }) } });
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, locataires: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01' }, { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', entree: '2023-01-15' }],
      previsite: { statut: 'programmee', rdv: RDV, tacheId: 9, collegues: [], tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null } } : l));
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const c = JSON.parse(String(init.body)) as Record<string, unknown>;
        if (c.action === 'apercu-compte-rendu-previsite') { appels.push(c); return ok({ mails: [{ sorte: 'previsite_compte_rendu', objet: 'CR', a: ['x@agence.test'], cc: [], texte: 'En présence de Alice et de Mme Léa Martin.\n\nCR.' }], sansEmail: [], phrase: 'En présence de Alice et de Mme Léa Martin.' }); }
        if (c.action === 'vocal-compte-rendu') { appels.push(c); return ok({ id: 91, nom: 'v', taille: 1 }); }
      }
      return (avant as typeof fetch)(u, init);
    }) as unknown as typeof fetch;
  });
  afterEach(() => { vi.restoreAllMocks(); });
  const ouvrirCr = async () => { await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre(); await suivreLienCr(); };
  const taperTexte = (v: string) => act(() => { const t = document.querySelector('[data-corps-compte-rendu]') as HTMLTextAreaElement; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(t, v); t.dispatchEvent(new Event('input', { bubbles: true })); });
  const saisir = (sel: string, v: string) => act(() => { const e = document.querySelector(sel) as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })); });

  it('PRÉSENCE : un locataire par ligne, case NON cochée, nom et date d’entrée ; quatre parties dans l’ordre : Présence, Texte, Photos, Dictaphone', async () => {
    await ouvrirCr();
    const cases = [...document.querySelectorAll('[data-presence-locataire]')] as HTMLInputElement[];
    expect(cases.map((c) => c.checked)).toEqual([false, false]);
    expect([...document.querySelectorAll('[data-cr-locataire]')].map((x) => x.textContent)).toEqual([
      'BERNARD Alice — Entré(e) dans les lieux le 01/09/2022', 'BERNARD Paul — Entré(e) dans les lieux le 15/01/2023']);
    expect([...document.querySelectorAll('[data-fenetre-previsite="saisie"] .pvv-bloc > .pvv-bloc-titre, [data-fenetre-previsite="saisie"] .pvv-bloc > .pvv-bloc-tete > .pvv-bloc-titre')]
      .map((h) => h.textContent!.split(' ')[0])).toEqual(['Présence', 'Texte', 'Photos', 'Dictaphone']);
  });

  it('🔴 sans personne cochée : récapitulatif REFUSÉ, message clair, liste en rouge ; cochée : le refus s’efface', async () => {
    await ouvrirCr();
    taperTexte('CR.');
    act(() => (document.querySelector('[data-recap-previsite]') as HTMLButtonElement).click()); await attendre();
    expect(appels).toEqual([]);
    expect(document.querySelector('[data-presence-motif]')!.textContent).toBe('Cochez au moins une personne présente à la pré-visite, ou « Absence de la partie locataire ».');
    expect(document.querySelector('[data-bloc-presence]')!.getAttribute('data-presence-erreur')).toBe('oui');
    act(() => (document.querySelector('[data-presence-locataire="12"]') as HTMLInputElement).click());
    expect(document.querySelector('[data-presence-motif]')).toBeNull();
  });

  it('« + Ajouter une personne » : civilité, nom, prénom ; ajoutée COCHÉE, marquée « personne présente », supprimable ; envoyée au serveur avec les locataires cochés', async () => {
    await ouvrirCr();
    taperTexte('CR.');
    act(() => (document.querySelector('[data-ajouter-personne]') as HTMLButtonElement).click());
    const ajouter = () => document.querySelector('[data-personne-ajouter]') as HTMLButtonElement;
    expect(ajouter().disabled).toBe(true); // civilité et nom obligatoires
    act(() => (document.querySelector('[data-personne-civilite="Madame"]') as HTMLInputElement).click());
    saisir('[data-personne-nom]', 'Martin'); saisir('[data-personne-prenom]', 'Léa');
    act(() => ajouter().click());
    expect(document.querySelector('[data-modale-personne]')).toBeNull();
    const ligne = document.querySelector('[data-personne-ajoutee]')!;
    expect(ligne.querySelector('.pvv-presence')!.textContent).toBe('Mme Léa Martin personne présente');
    expect((ligne.querySelector('[data-presence-personne]') as HTMLInputElement).checked).toBe(true);
    act(() => (document.querySelector('[data-presence-locataire="11"]') as HTMLInputElement).click());
    act(() => (document.querySelector('[data-recap-previsite]') as HTMLButtonElement).click()); await attendre(); await attendre();
    expect(appels[0].presences).toEqual({ occupations: [11], personnes: [{ civilite: 'Madame', nom: 'Martin', prenom: 'Léa' }] });
    // la phrase (écrite par le serveur) est visible dans le récapitulatif
    expect(document.querySelector('[data-fenetre-previsite="recap"]')!.textContent).toContain('En présence de Alice et de Mme Léa Martin.');
    act(() => (document.querySelector('[data-revenir-previsite]') as HTMLButtonElement).click()); await attendre();
    // 🔴 (15/11/2026) — retirer se CONFIRME : « Garder » la laisse, « Retirer » l'enlève
    act(() => (document.querySelector('[data-personne-retirer]') as HTMLButtonElement).click());
    expect(document.querySelector('[data-personne-confirmer] .pvv-confirmer-question')!.textContent).toBe('Retirer Mme Léa Martin ?');
    act(() => (document.querySelector('[data-personne-retirer-non]') as HTMLButtonElement).click());
    expect(document.querySelector('[data-personne-ajoutee]')).not.toBeNull();
    act(() => (document.querySelector('[data-personne-retirer]') as HTMLButtonElement).click());
    act(() => (document.querySelector('[data-personne-retirer-oui]') as HTMLButtonElement).click());
    expect(document.querySelector('[data-personne-ajoutee]')).toBeNull();
  });

  it('🔴 plus AUCUN emoji dans le formulaire (icônes SVG de l’admin) ; boutons homogènes (mêmes classes, deux par ligne) ; bouton rond : l’icône seule', async () => {
    await ouvrirCr();
    const boite = document.querySelector('[data-fenetre-previsite="saisie"]')!;
    expect(boite.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(boite.textContent).not.toMatch(/[↵▶⏸‹›↑↓➕☀☾]/);
    for (const sel of ['[data-clavier]', '[data-dicter]', '[data-photo-galerie-bouton]', '[data-ajouter-photo]', '[data-nouveau-vocal]']) {
      expect(document.querySelector(sel)!.className, sel).toContain('pvv-gros');
    }
    expect(document.querySelector('.pvv-photos-boutons')!.className).toContain('pvv-boutons-2');
    const rond = document.querySelector('[data-enregistrer-vocal]')!;
    expect(rond.textContent).toBe('');
    expect(rond.querySelector('svg')).not.toBeNull();
    expect(rond.getAttribute('aria-label')).toBe('Maintenir pour enregistrer');
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n');
    expect(css).toContain('.pvv-boite-cr .mis-actions{display:grid;grid-template-columns:1fr 1fr');
    expect(css).toContain('.pvv-boite-cr .mis-actions .mis-action{width:100%;min-height:56px;font-size:1rem;font-weight:800');
  });

  it('🔴 ENREGISTREMENT EN ROUGE : le bouton rond ET « Maintenir pour dicter » prennent le MÊME code (classe, état) dès que le doigt est posé ; durée SOUS le bouton rond ; retour à la normale au relâchement', async () => {
    await ouvrirCr();
    for (const sel of ['[data-enregistrer-vocal]', '[data-dicter]']) {
      const b = document.querySelector(sel) as HTMLButtonElement;
      await act(async () => { b.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })); });
      expect(b.className, sel).toContain('pvv-maintien--actif'); // rouge AVANT même que le micro réponde
      for (let k = 0; k < 30 && b.querySelector('[data-maintien-duree]') === null; k++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
      expect(b.getAttribute('data-enregistrement')).toBe('oui');
      if (sel === '[data-enregistrer-vocal]') expect(document.querySelector('[data-rond-duree]')!.textContent).toMatch(/^\d{2}:\d{2}$/);
      horloge += 1000;
      await act(async () => { b.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true })); });
      await attendre();
      expect(b.className, sel).not.toContain('pvv-maintien--actif');
    }
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n');
    expect(css).toContain('.pvv-boite-cr .pvv-maintien.pvv-maintien--actif:hover');
    expect(css).toContain('background:var(--color-svv-red) !important');
  });
});

describe('🔴🔴 Arno (15/11/2026, 4e retour iPhone) — flèche d’Entrée, note interne, trames, alignement, suggestions du clavier', () => {
  const RDV = { jour: '2026-11-13', heure: '13:45', dureeMinutes: 15 };
  let appels: Record<string, unknown>[] = [];
  beforeEach(() => {
    appels = [];
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'programmee', rdv: RDV, tacheId: 9, collegues: [], tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null } } : l));
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') { const c = JSON.parse(String(init.body)) as Record<string, unknown>; if (c.action === 'apercu-compte-rendu-previsite') { appels.push(c); return ok({ mails: [], sansEmail: [], phrase: 'En présence de Alice BERNARD.' }); } }
      return (avant as typeof fetch)(u, init);
    }) as unknown as typeof fetch;
  });
  const ouvrirCr = async () => { await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre(); await suivreLienCr(); };
  const saisir = (el: Element, v: string) => act(() => { const e = el as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })); });

  it('« Entrée » : la FLÈCHE seule (SVG), libellé accessible « Aller à la ligne », zone tactile de 44 px', async () => {
    await ouvrirCr();
    const b = document.querySelector('[data-entree]')!;
    expect(b.textContent).toBe('');
    expect(b.querySelector('svg')).not.toBeNull();
    expect(b.getAttribute('aria-label')).toBe('Aller à la ligne');
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n');
    expect(css).toContain('.pvv-entree{min-width:44px;min-height:44px');
  });

  it('🔴 NOTE INTERNE : saisie dans la fenêtre, visible et MODIFIABLE dans la liste, envoyée avec la personne', async () => {
    await ouvrirCr();
    act(() => (document.querySelector('[data-ajouter-personne]') as HTMLButtonElement).click());
    act(() => (document.querySelector('[data-personne-civilite="Madame"]') as HTMLInputElement).click());
    saisir(document.querySelector('[data-personne-nom]')!, 'Martin');
    saisir(document.querySelector('[data-personne-note-modale]')!, 'mère du locataire');
    act(() => (document.querySelector('[data-personne-ajouter]') as HTMLButtonElement).click());
    const note = document.querySelector('[data-personne-ajoutee] [data-personne-note]') as HTMLInputElement;
    expect(note.value).toBe('mère du locataire');
    saisir(note, 'amie du locataire');
    act(() => { const t = document.querySelector('[data-corps-compte-rendu]') as HTMLTextAreaElement; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(t, 'CR.'); t.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => (document.querySelector('[data-recap-previsite]') as HTMLButtonElement).click()); await attendre(); await attendre();
    expect(appels[0].presences).toEqual({ occupations: [], personnes: [{ civilite: 'Madame', nom: 'Martin', prenom: '', note: 'amie du locataire' }] });
  });

  it('trames : « Ajouter une photo » PLEIN comme « Maintenir pour dicter », « Photothèque » en contour comme « Clavier » ; 🔴 (7e retour) « Nouveau fichier vocal » PLEINE LARGEUR', async () => {
    await ouvrirCr();
    expect(document.querySelector('[data-ajouter-photo]')!.className).toContain('pvv-plein');
    expect(document.querySelector('[data-ajouter-photo]')!.className).not.toContain('svv-btn-outline');
    expect(document.querySelector('[data-photo-galerie-bouton]')!.className).toContain('svv-btn-outline');
    expect(document.querySelector('[data-clavier]')!.className).toContain('svv-btn-outline');
    expect(document.querySelector('[data-nouveau-vocal]')!.parentElement!.className).toBe('pvv-nouveau-vocal');
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n');
    expect(css).toContain('.pvv-plein.svv-btn,.pvv-plein{background:var(--color-svv-ink);color:var(--color-svv-surface)');
    expect(css).toContain('.pvv-nouveau-vocal{align-self:stretch;width:100%}');
  });

  it('suggestions du clavier adaptées par champ : texte (correction gardée, pas de remplissage), noms (ni correction ni remplissage)', async () => {
    await ouvrirCr();
    const t = document.querySelector('[data-corps-compte-rendu]')!;
    expect([t.getAttribute('autocomplete'), t.getAttribute('autocorrect'), t.getAttribute('autocapitalize'), t.getAttribute('spellcheck')]).toEqual(['off', 'on', 'sentences', 'true']);
    act(() => (document.querySelector('[data-ajouter-personne]') as HTMLButtonElement).click());
    const nom = document.querySelector('[data-personne-nom]')!;
    expect([nom.getAttribute('autocomplete'), nom.getAttribute('autocorrect'), nom.getAttribute('autocapitalize'), nom.getAttribute('spellcheck')]).toEqual(['off', 'off', 'words', 'false']);
  });
});

describe('🔴 Arno (15/11/2026) — bandeau de recette : l’adresse n’est PAS du texte de la page (Chrome iPhone la transformait en lien → erreur d’hydratation)', () => {
  it('l’adresse vient d’un attribut, affichée par le CSS ; <html> ignore les attributs ajoutés par Chrome iOS', () => {
    const src = readFileSync('app/(admin)/layout.tsx', 'utf8');
    expect(src).toContain('<span className="svv-adresse-css" data-adresse={reel.adresse} role="img" aria-label={reel.adresse} />');
    expect(src).not.toContain('`RECETTE — envois réels autorisés vers ${reel.adresse}`');
    expect(readFileSync('app/globals.css', 'utf8')).toContain('.svv-adresse-css::after{content:attr(data-adresse)}');
    expect(readFileSync('app/layout.tsx', 'utf8')).toMatch(/<html[\s\S]*?suppressHydrationWarning[\s\S]*?>/);
  });
});

describe('🔴🔴 Arno (15/11/2026, 5e retour iPhone) — Carrousel / Liste en vrais boutons ; légendes cadrées avec micro ; confirmations sur une ligne', () => {
  const RDV = { jour: '2026-11-13', heure: '13:45', dureeMinutes: 15 };
  let dictees: Record<string, unknown>[] = []; let dicteeVide = false; let horloge = 1_000_000;
  class FauxEnregistreur {
    static isTypeSupported = (t: string) => t === 'audio/mp4';
    mimeType: string; state = 'inactive'; ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
    constructor(_f: unknown, o?: { mimeType?: string }) { this.mimeType = o?.mimeType ?? ''; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' }) }); this.onstop?.(); }
  }
  beforeEach(() => {
    dictees = []; horloge = 1_000_000; dicteeVide = false;
    vi.spyOn(Date, 'now').mockImplementation(() => horloge);
    try { window.localStorage.removeItem('svav.compteRendu.photos.vue'); } catch { /* sans stockage */ }
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = () => 'blob:apercu'; (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FauxEnregistreur;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }) } });
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'programmee', rdv: RDV, tacheId: 9, collegues: [], tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null } } : l));
    let n = 70;
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const c = JSON.parse(String(init.body)) as Record<string, unknown>;
        if (c.action === 'photo-compte-rendu') { n += 1; return ok({ id: n, nom: 'p.jpg', taille: 3 }); }
        if (c.action === 'dicter-compte-rendu') { dictees.push(c); return ok(dicteeVide ? { ok: true, texte: '' } : { ok: true, texte: 'fissure plafond.' }); }
      }
      return (avant as typeof fetch)(u, init);
    }) as unknown as typeof fetch;
  });
  afterEach(() => { vi.restoreAllMocks(); });
  const patienter = async (cond: () => boolean) => { for (let k = 0; k < 60 && !cond(); k++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); await attendre(); };
  const ouvrir = async () => {
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    await suivreLienCr();
    const input = document.querySelector('[data-photo-galerie]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: ['a.jpg', 'b.jpg'].map((x) => new File([new Uint8Array([1])], x, { type: 'image/jpeg' })), configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await patienter(() => document.querySelector('[data-photo-etat="envoi"]') === null);
  };
  const legende = (n: number) => document.querySelector(`[data-photo="${n}"] [data-photo-legende]`) as HTMLInputElement;
  const taper = (el: HTMLInputElement, v: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  const maintenir = async (b: HTMLButtonElement, ms: number) => {
    await act(async () => { b.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })); });
    await patienter(() => b.getAttribute('data-enregistrement') === 'oui' && b.querySelector('[data-maintien-duree]') !== null);
    horloge += ms;
    await act(async () => { b.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true })); });
    await attendre();
  };

  it('Carrousel / Liste : deux VRAIS boutons séparés, liseré, l’actif marqué (plein rouge), aria-pressed juste ; la bascule Location (pva-segment) n’est pas touchée', async () => {
    await ouvrir();
    const c = document.querySelector('[data-vue-carrousel]') as HTMLButtonElement; const l = document.querySelector('[data-vue-liste]') as HTMLButtonElement;
    expect(c.className).toBe('pvv-choix pvv-vue'); expect(l.className).toBe('pvv-choix pvv-vue');
    expect([c.getAttribute('aria-pressed'), l.getAttribute('aria-pressed')]).toEqual(['true', 'false']);
    act(() => l.click());
    expect([c.getAttribute('aria-pressed'), l.getAttribute('aria-pressed')]).toEqual(['false', 'true']);
    const css = (await import('./CompteRenduSaisie')).CSS_COMPTE_RENDU_SAISIE.replace(/\s+/g, ' ');
    expect(css).toContain('.pvv-segments{display:inline-flex;gap:10px;flex-wrap:wrap}');
    expect(css).toContain('.pvv-choix{box-sizing:border-box;min-height:44px;min-width:44px;padding:0 16px;border-radius:12px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface)');
    expect(css).toContain('.pvv-choix[aria-pressed=true]{background:var(--color-svv-red);border-color:var(--color-svv-red);color:var(--color-svv-surface);font-weight:900}');
  });
  it('🔴 (10e retour) les titres des QUATRE encarts, même style, plus gros ; « Dictaphone » tout court ; astérisque, compteur et boutons de la ligne à leur place', async () => {
    await ouvrir();
    const titres = [...document.querySelectorAll('h3.pvv-titre-encart')];
    expect(titres.map((t) => t.textContent)).toEqual(['Présence *', 'Texte *', 'Photos (2)', 'Dictaphone']);
    expect(titres.every((t) => t.className === 'pvv-bloc-titre pvv-titre-encart')).toBe(true);
    expect(titres[0].querySelector('.pvv-requis')!.textContent).toBe('*');
    expect(titres[2].querySelector('.loc-muet')!.textContent).toBe('(2)');
    expect(document.querySelector('[data-vocaux-compte-rendu]')!.textContent).not.toContain('internes, sauf ceux envoyés aux locataires');
    // les éléments de la même ligne restent dans l'en-tête de leur encart
    expect(titres[1].parentElement!.querySelector('[data-entree]')).not.toBeNull();
    expect(titres[2].parentElement!.querySelector('[data-vue-carrousel]')).not.toBeNull();
    const css = (await import('./CompteRenduSaisie')).CSS_COMPTE_RENDU_SAISIE.replace(/\s+/g, ' ');
    expect(css).toContain('.pvv-bloc-titre{margin:0;font-size:1.05rem;font-weight:900;letter-spacing:.01em}'); // les titres internes (« Ajouter une personne ») ne changent pas
    expect(css).toContain('.pvv-bloc-titre.pvv-titre-encart{font-size:1.45rem;font-weight:900;line-height:1.2;letter-spacing:0;color:var(--color-svv-ink)}');
  });
  it('la légende : cadrée (liseré, accentué au focus, marge droite pour le micro) ; un micro DANS chaque légende ; 🔴 (10e retour) la dictée REMPLACE CETTE légende (capitale, sans point final), sans focus ; dictée vide : la légende reste ; appui bref ignoré', async () => {
    await ouvrir();
    act(() => (document.querySelector('[data-vue-liste]') as HTMLButtonElement).click());
    expect(document.querySelectorAll('[data-dicter-legende]')).toHaveLength(2);
    expect(legende(1).className).toBe('pvv-legende-champ');
    expect(document.querySelector('[data-photo="2"] [data-dicter-legende]')!.getAttribute('aria-label')).toBe('Maintenir pour dicter la légende de la photo 2');
    expect(document.querySelector('[data-photo="2"] [data-dicter-legende] svg')).not.toBeNull();
    taper(legende(1), 'Salon'); taper(legende(2), 'Mur chambre');
    act(() => { legende(2).focus(); legende(2).setSelectionRange(3, 3); legende(2).blur(); });
    await maintenir(document.querySelector('[data-photo="2"] [data-dicter-legende]') as HTMLButtonElement, 900);
    await patienter(() => legende(2).value !== 'Mur chambre');
    expect(legende(2).value).toBe('Fissure plafond'); // 🔴 (10e retour) remplacée, capitale, sans point final
    expect(legende(1).value).toBe('Salon'); // l'autre légende n'est pas touchée
    expect(document.activeElement === legende(2)).toBe(false); // le clavier ne s'ouvre pas
    expect(dictees).toHaveLength(1);
    // une dictée vide (ou échouée) : la légende d'avant reste
    dicteeVide = true;
    await maintenir(document.querySelector('[data-photo="2"] [data-dicter-legende]') as HTMLButtonElement, 900);
    await patienter(() => dictees.length === 2);
    expect(legende(2).value).toBe('Fissure plafond');
    dicteeVide = false;
    // appui de moins de 0,5 s : ignoré, rien n'est transcrit
    await maintenir(document.querySelector('[data-photo="1"] [data-dicter-legende]') as HTMLButtonElement, 200);
    expect(dictees).toHaveLength(2);
    expect(document.querySelector('[data-photo="1"] [data-legende-message]')!.textContent).toContain('Appui trop bref');
    const css = (await import('./CompteRenduSaisie')).CSS_COMPTE_RENDU_SAISIE.replace(/\s+/g, ' ');
    expect(css).toContain('padding:0 60px 0 12px;font:inherit;font-size:16px;border-radius:12px;border:1px solid var(--color-svv-line-strong)');
    expect(css).toContain('.pvv-legende-champ:focus{outline:none;border-color:var(--color-svv-ink);box-shadow:0 0 0 1px var(--color-svv-ink)}');
    expect(css).toContain('.pvv-micro-legende{position:absolute;top:50%;right:4px;transform:translateY(-50%);width:44px;height:44px;border-radius:999px');
  });
  it('confirmation de suppression : « Supprimer la photo 2 ? » sur une ligne, puis « Garder » (contour) à gauche et « Supprimer » (rouge) à droite, sur UNE ligne', async () => {
    await ouvrir();
    act(() => (document.querySelector('[data-vue-liste]') as HTMLButtonElement).click());
    act(() => (document.querySelector('[data-photo="2"] [data-photo-supprimer]') as HTMLButtonElement).click());
    const conf = document.querySelector('[data-photo-confirmer]')!;
    expect(conf.querySelector('.pvv-confirmer-question')!.textContent).toBe('Supprimer la photo 2 ?');
    const boutons = [...conf.querySelectorAll('.pvv-confirmer-boutons > button')];
    expect(boutons.map((b) => [b.textContent, b.className])).toEqual([['Garder', 'pvv-choix'], ['Supprimer', 'pvv-choix pvv-choix--danger']]);
    const css = (await import('./CompteRenduSaisie')).CSS_COMPTE_RENDU_SAISIE.replace(/\s+/g, ' ');
    expect(css).toContain('.pvv-confirmer-boutons{display:grid;grid-template-columns:1fr 1fr;gap:10px}');
    act(() => (conf.querySelector('[data-photo-supprimer-non]') as HTMLButtonElement).click());
    expect(document.querySelectorAll('[data-photo]')).toHaveLength(2);
    act(() => (document.querySelector('[data-photo="2"] [data-photo-supprimer]') as HTMLButtonElement).click());
    act(() => (document.querySelector('[data-photo-supprimer-oui]') as HTMLButtonElement).click());
    expect(document.querySelectorAll('[data-photo]')).toHaveLength(1);
  });
});

describe('🔴🔴 Arno (15/11/2026, 6e retour) — SAUVEGARDE AUTOMATIQUE du compte rendu : rien ne se perd', () => {
  const RDV = { jour: '2026-11-13', heure: '13:45', dureeMinutes: 15 };
  let brouillonServeur: unknown = null; let ecritures: Record<string, unknown>[] = []; let reseau = true; let photosDeposees = 0;
  beforeEach(async () => {
    (await import('../../../../lib/location/fileAttenteLocale')).oublierMemoireLocale();
    brouillonServeur = null; ecritures = []; reseau = true; photosDeposees = 0;
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = () => 'blob:apercu'; (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'programmee', rdv: RDV, tacheId: 9, collegues: [], tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null } } : l));
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      if (!init?.method && String(u).includes('previsiteBrouillon=')) return ok({ brouillon: brouillonServeur, enregistreLe: brouillonServeur ? '2026-11-15T13:05:00.000Z' : null });
      if (init?.method === 'POST') {
        const c = JSON.parse(String(init.body)) as Record<string, unknown>;
        if (c.action === 'brouillon-previsite' || c.action === 'effacer-brouillon-previsite') { ecritures.push({ ...c, keepalive: init.keepalive === true, propre: (init.headers as Record<string, string>)['x-svav-confirmation'] }); return ok({ enregistreLe: '2026-11-15T13:06:00.000Z', efface: true }); }
        if (c.action === 'photo-compte-rendu') {
          if (!reseau) throw new TypeError('Failed to fetch');
          photosDeposees += 1; return ok({ id: 70 + photosDeposees, nom: 'p.jpg', taille: 3 });
        }
      }
      return (avant as typeof fetch)(u, init);
    }) as unknown as typeof fetch;
  });
  const patienter = async (cond: () => boolean, ms = 3000) => { const fin = Date.now() + ms; while (!cond() && Date.now() < fin) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); await attendre(); };
  const ouvrir = async () => { await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre(); await suivreLienCr(); await patienter(() => document.querySelector('[data-corps-compte-rendu]') !== null); };
  const zone = () => document.querySelector('[data-corps-compte-rendu]') as HTMLTextAreaElement;
  const taper = (v: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(zone(), v); zone().dispatchEvent(new Event('input', { bubbles: true })); });

  it('à la réouverture : le brouillon du serveur est RESTAURÉ tel quel (texte, présences, personnes, photos, vocaux, bouton d’envoi), avec « Brouillon restauré — enregistré à 14h05 »', async () => {
    brouillonServeur = { corps: 'Salon propre.', presents: [11], aussiLocataires: false,
      ajoutees: [{ cle: 'p1', civilite: 'Madame', nom: 'Martin', prenom: 'Léa', present: true, note: 'mère du locataire' }],
      photos: [{ id: 71, legende: 'Rayure parquet' }], fichiers: [{ cle: 'f1', nom: 'Cuisine', locataires: true, prises: [{ id: 81, dureeS: 4 }] }] };
    await ouvrir();
    await patienter(() => zone().value === 'Salon propre.');
    expect(zone().value).toBe('Salon propre.');
    // 🔴 (7e retour) plus de bandeau : le petit cartouche sur la ligne de « ← Retour » ; un appui dit l'heure et « Brouillon restauré »
    expect(document.querySelector('[data-brouillon-restaure]')).toBeNull();
    const cartouche = document.querySelector('.pvv-ligne-retour [data-sauvegarde]') as HTMLButtonElement;
    expect(cartouche.textContent).toBe('Enregistré');
    act(() => cartouche.click());
    expect(document.querySelector('[data-sauvegarde-detail]')!.textContent).toBe('Dernier enregistrement à 14h05 · Brouillon restauré');
    expect((document.querySelector('[data-presence-locataire="11"]') as HTMLInputElement).checked).toBe(true);
    expect(document.querySelector('[data-personne-ajoutee] [data-personne-note]')!.getAttribute('value') ?? (document.querySelector('[data-personne-ajoutee] [data-personne-note]') as HTMLInputElement).value).toBe('mère du locataire');
    expect((document.querySelector('[data-photo="1"] [data-photo-legende]') as HTMLInputElement).value).toBe('Rayure parquet');
    expect(document.querySelector('[data-photo="1"] img')!.getAttribute('src')).toBe('/api/admin/location/pieces-sortie?piece=71');
    expect((document.querySelector('[data-vocal="1"] [data-vocal-nom]') as HTMLInputElement).value).toBe('Cuisine');
    expect(document.querySelector('[data-vocal="1"]')!.getAttribute('data-vocal-prises')).toBe('1');
    expect(document.querySelector('[data-vocal="1"] [data-vocal-locataires]')!.getAttribute('data-vocal-locataires')).toBe('oui');
    expect(document.querySelector('[data-aussi-locataires]')!.getAttribute('aria-pressed')).toBe('false');
  });
  it('chaque modification est ENREGISTRÉE seule (court délai) ; le passage en ARRIÈRE-PLAN enregistre tout de suite (keepalive) ; l’indicateur le dit', async () => {
    await ouvrir();
    taper('Cuisine sale');
    await patienter(() => ecritures.length > 0);
    // une sauvegarde ne s'annonce jamais (aucune fenêtre « Modification enregistrée ») : en-tête « propre »
    expect(ecritures[0]).toMatchObject({ action: 'brouillon-previsite', occupationIds: [11, 12], contenu: { corps: 'Cuisine sale' }, propre: 'propre' });
    await patienter(() => document.querySelector('[data-sauvegarde]')?.getAttribute('data-sauvegarde') === 'enregistre');
    expect(document.querySelector('[data-sauvegarde]')!.textContent).toBe('Enregistré');
    taper('Cuisine sale, four à nettoyer');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await patienter(() => ecritures.length > 1, 500);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    expect(ecritures[1]).toMatchObject({ contenu: { corps: 'Cuisine sale, four à nettoyer' }, keepalive: true });
  });
  it('« Annuler » garde le brouillon ; « Effacer le brouillon » (confirmé) le marque effacé et vide le formulaire ; rien n’est envoyé', async () => {
    brouillonServeur = { corps: 'Salon propre.', presents: [], ajoutees: [], photos: [], fichiers: [], aussiLocataires: true };
    await ouvrir();
    await patienter(() => zone().value === 'Salon propre.');
    act(() => (document.querySelector('[data-effacer-brouillon]') as HTMLButtonElement).click());
    act(() => (document.querySelector('[data-effacer-brouillon-non]') as HTMLButtonElement).click());
    expect(zone().value).toBe('Salon propre.');
    act(() => (document.querySelector('[data-effacer-brouillon]') as HTMLButtonElement).click());
    await act(async () => { (document.querySelector('[data-effacer-brouillon-oui]') as HTMLButtonElement).click(); });
    await patienter(() => zone().value === '');
    expect(zone().value).toBe('');
    expect(ecritures.some((e) => e.action === 'effacer-brouillon-previsite')).toBe(true);
    expect(posts.some((c) => String(c.action).startsWith('compte-rendu') || String(c.action).startsWith('apercu'))).toBe(false);
  });
  it('🔴 (8e retour) « Effacer » ATTEND l’enregistrement déjà en route : l’effacement arrive après lui (sinon le brouillon effacé renaissait)', async () => {
    const ordre: string[] = []; let liberer: () => void = () => {};
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const c = JSON.parse(String(init.body)) as Record<string, unknown>;
        if (c.action === 'brouillon-previsite') { ordre.push('envoi'); await new Promise<void>((r) => { liberer = r; }); ordre.push('envoi arrivé'); return ok({ enregistreLe: '2026-11-15T13:06:00.000Z' }); }
        if (c.action === 'effacer-brouillon-previsite') { ordre.push('effacement'); return ok({ efface: true }); }
      }
      return (avant as typeof fetch)(u, init);
    }) as unknown as typeof fetch;
    await ouvrir();
    taper('Texte en route');
    await patienter(() => ordre.includes('envoi'));
    act(() => (document.querySelector('[data-effacer-brouillon]') as HTMLButtonElement).click());
    await act(async () => { (document.querySelector('[data-effacer-brouillon-oui]') as HTMLButtonElement).click(); });
    await attendre();
    expect(ordre).toEqual(['envoi']); // l'effacement attend
    await act(async () => { liberer(); });
    await patienter(() => ordre.includes('effacement'));
    expect(ordre).toEqual(['envoi', 'envoi arrivé', 'effacement']);
    expect(zone().value).toBe('');
  });
  it('réseau coupé : la photo reste dans le téléphone (« en attente du réseau »), puis part TOUTE SEULE au retour du réseau', async () => {
    await ouvrir();
    reseau = false;
    const input = document.querySelector('[data-photo-galerie]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' })], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await patienter(() => document.querySelector('[data-photo-etat="attente"]') !== null);
    expect(document.querySelector('[data-photo-attente]')!.textContent).toContain('En attente du réseau');
    const file = await (await import('../../../../lib/location/fileAttenteLocale')).listerAttente('11,12');
    expect(file.map((e) => e.sorte)).toEqual(['photo']);
    expect((document.querySelector('[data-recap-previsite]') as HTMLButtonElement).disabled).toBe(true);
    reseau = true;
    act(() => { window.dispatchEvent(new Event('online')); });
    await patienter(() => document.querySelector('[data-photo-etat="ok"]') !== null);
    expect(photosDeposees).toBe(1);
    expect(await (await import('../../../../lib/location/fileAttenteLocale')).listerAttente('11,12')).toEqual([]);
  });
  it('page rechargée pendant la coupure : la photo gardée dans le téléphone REVIENT dans le formulaire et repart', async () => {
    const f = await import('../../../../lib/location/fileAttenteLocale');
    await f.mettreEnAttente('11,12', { cle: 'k1', sorte: 'photo', blob: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }), type: 'image/jpeg', legende: 'Joint douche', creeLe: '2026-11-15T13:00:00Z' });
    await ouvrir();
    await patienter(() => document.querySelector('[data-photo-etat="ok"]') !== null);
    expect((document.querySelector('[data-photo="1"] [data-photo-legende]') as HTMLInputElement).value).toBe('Joint douche');
    expect(photosDeposees).toBe(1);
  });
});

describe('🔴🔴 Arno (15/11/2026, 6e retour) — clavier réel ; micro du titre de vocal ; « Écouter » dans le récapitulatif', () => {
  const RDV = { jour: '2026-11-13', heure: '13:45', dureeMinutes: 15 };
  let dictees: Record<string, unknown>[] = []; let horloge = 1_000_000; let id = 300;
  class FauxEnregistreur {
    static isTypeSupported = (t: string) => t === 'audio/mp4';
    mimeType: string; state = 'inactive'; ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
    constructor(_f: unknown, o?: { mimeType?: string }) { this.mimeType = o?.mimeType ?? ''; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' }) }); this.onstop?.(); }
  }
  let joues: string[] = [];
  beforeEach(async () => {
    (await import('../../../../lib/location/fileAttenteLocale')).oublierMemoireLocale();
    dictees = []; horloge = 1_000_000; id = 300; joues = [];
    vi.spyOn(Date, 'now').mockImplementation(() => horloge);
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = () => `blob:vocal-${Math.random()}`; (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FauxEnregistreur;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }) } });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) { joues.push(this.src); return Promise.resolve(); });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'programmee', rdv: RDV, tacheId: 9, collegues: [], tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null } } : l));
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const c = JSON.parse(String(init.body)) as Record<string, unknown>;
        if (c.action === 'vocal-compte-rendu') { id += 1; return ok({ id, nom: 'v.m4a', taille: 3 }); }
        if (c.action === 'dicter-compte-rendu') { dictees.push(c); return ok({ ok: true, texte: 'salle de bains' }); }
        if (c.action === 'apercu-compte-rendu-previsite') return ok({ mails: [], sansEmail: [], phrase: 'En présence de Alice BERNARD.' });
      }
      return (avant as typeof fetch)(u, init);
    }) as unknown as typeof fetch;
  });
  afterEach(() => { vi.restoreAllMocks(); });
  const patienter = async (cond: () => boolean) => { for (let k = 0; k < 80 && !cond(); k++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); await attendre(); };
  const ouvrir = async () => { await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre(); await suivreLienCr(); await patienter(() => document.querySelector('[data-corps-compte-rendu]') !== null); };
  const maintenir = async (b: HTMLButtonElement, ms: number) => {
    await act(async () => { b.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })); });
    await patienter(() => b.getAttribute('data-enregistrement') === 'oui' && b.querySelector('[data-maintien-duree]') !== null);
    horloge += ms;
    await act(async () => { b.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true })); });
    await attendre();
  };

  it('🔴🔴 (7e retour) ROUGE dès le contact, sans attendre le micro ; un seul retour à la ligne par appui, même livré deux fois ; adresse en grand ; liserés de « Ajouter une personne »', async () => {
    // un micro qui tarde à répondre (première autorisation) : le bouton est rouge AU CONTACT
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => new Promise(() => {}) } });
    await ouvrir();
    const d = document.querySelector('[data-dicter]') as HTMLButtonElement;
    act(() => { d.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })); });
    expect(d.getAttribute('data-enregistrement')).toBe('oui');
    expect(d.className).toContain('pvv-maintien--actif');
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })); });
    // « Entrée » activé deux fois par le même toucher (contact puis clic) : UN seul retour à la ligne
    const t = document.querySelector('[data-corps-compte-rendu]') as HTMLTextAreaElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(t, 'Salon'); t.dispatchEvent(new Event('input', { bubbles: true })); });
    const e = document.querySelector('[data-entree]') as HTMLButtonElement;
    act(() => { e.click(); e.click(); });
    expect(t.value).toBe('Salon\n- ');
    horloge += 1000;
    act(() => e.click());
    expect(t.value).toBe('Salon\n\n- ');
    // l'adresse en grand, juste sous le titre
    const adr = document.querySelector('[data-cr-adresse]')!;
    expect(adr.className).toBe('pvv-adresse-cr');
    expect(adr.previousElementSibling!.className).toBe('pvv-titre-ligne');
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n');
    expect(css).toContain('.pvv-adresse-cr{margin:0;font-size:1.3rem;font-weight:900');
    expect(css).toContain('.pvv-mini-modale input[type=text]{padding:0 12px;border-radius:12px;border:1px solid var(--color-svv-line-strong)');
    expect(css).toContain('.pvv-civilite .pvv-case{min-height:48px;padding:0 16px;border-radius:12px;border:1px solid var(--color-svv-line-strong)');
  });
  it('« Clavier » : rouge quand le champ a le focus, BLANC dès qu’il le perd (bouton iOS, appui ailleurs)', async () => {
    await ouvrir();
    const b = document.querySelector('[data-clavier]') as HTMLButtonElement; const zone = document.querySelector('[data-corps-compte-rendu]') as HTMLTextAreaElement;
    act(() => b.click());
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(b.className).toContain('svv-btn-primary');
    act(() => { zone.blur(); });
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(b.className).toContain('svv-btn-outline');
    // un appui AILLEURS (zone non saisissable : WebKit garde le focus) : le champ est quitté, le bouton redevient blanc
    act(() => b.click());
    expect(b.getAttribute('aria-pressed')).toBe('true');
    act(() => { document.querySelector('[data-titre-previsite]')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    expect(document.activeElement).not.toBe(zone);
    expect(b.getAttribute('aria-pressed')).toBe('false');
  });
  it('le TITRE d’un fichier vocal : le même micro à droite dans le champ ; 🔴 (8e retour) la dictée REMPLACE ce titre', async () => {
    await ouvrir();
    await maintenir(document.querySelector('[data-enregistrer-vocal]') as HTMLButtonElement, 900);
    await patienter(() => document.querySelector('[data-prise-etat="ok"]') !== null);
    const nom = document.querySelector('[data-vocal="1"] [data-vocal-nom]') as HTMLInputElement;
    expect(nom.className).toBe('pvv-legende-champ');
    const micro = document.querySelector('[data-vocal="1"] [data-dicter-titre]') as HTMLButtonElement;
    expect(micro.getAttribute('aria-label')).toBe('Maintenir pour dicter le nom du fichier vocal 1');
    act(() => { nom.focus(); nom.setSelectionRange(nom.value.length, nom.value.length); nom.blur(); });
    await maintenir(micro, 900);
    await patienter(() => nom.value !== 'Vocal 1');
    expect(nom.value).toBe('Salle de bains');
    expect(dictees).toHaveLength(1);
  });
  it('le RÉCAPITULATIF : chaque ligne de vocal a « Écouter » (lecture / pause, prises enchaînées)', async () => {
    await ouvrir();
    await maintenir(document.querySelector('[data-enregistrer-vocal]') as HTMLButtonElement, 900);
    await maintenir(document.querySelector('[data-enregistrer-vocal]') as HTMLButtonElement, 900);
    await patienter(() => document.querySelectorAll('[data-prise-etat="ok"]').length === 2);
    const t = document.querySelector('[data-corps-compte-rendu]') as HTMLTextAreaElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(t, 'CR.'); t.dispatchEvent(new Event('input', { bubbles: true })); });
    cocherPresence(); act(() => (document.querySelector('[data-recap-previsite]') as HTMLButtonElement).click()); await attendre(); await attendre();
    const ligne = document.querySelector('[data-recap-vocal-ligne="1"]')!;
    expect(ligne.querySelector('[data-recap-vocal]')!.textContent).toBe('Vocal 1 — NON envoyé (interne)');
    const ecouter = ligne.querySelector('[data-recap-ecouter]') as HTMLButtonElement;
    expect(ecouter.textContent).toBe(' Écouter');
    act(() => ecouter.click());
    expect(ecouter.getAttribute('aria-pressed')).toBe('true');
    expect(ecouter.textContent).toBe(' Pause');
    expect(joues).toHaveLength(1);
    act(() => ecouter.click());
    expect(ecouter.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('🔴🔴 Arno (15/11/2026, 8e retour) — Dictaphone : la DESTINATION des prises toujours visible ; titre dicté qui remplace', () => {
  const RDV = { jour: '2026-11-13', heure: '13:45', dureeMinutes: 15 };
  let horloge = 1_000_000; let id = 500; let dictee: { ok: boolean; texte?: string } = { ok: true, texte: 'salle de bain.' };
  let brouillonServeur: unknown = null;
  class FauxEnregistreur {
    static isTypeSupported = (t: string) => t === 'audio/mp4';
    mimeType: string; state = 'inactive'; ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
    constructor(_f: unknown, o?: { mimeType?: string }) { this.mimeType = o?.mimeType ?? ''; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' }) }); this.onstop?.(); }
    requestData() { this.ondataavailable?.({ data: new Blob([new Uint8Array([4, 5, 6])], { type: 'audio/mp4' }) }); }
  }
  /** 🔴 (9e retour) un dépôt de prise retenu : la prise reste « Sauvegarde en cours… » tant qu'on ne le libère pas */
  let depotRetenu: Promise<void> | null = null;
  beforeEach(async () => {
    (await import('../../../../lib/location/fileAttenteLocale')).oublierMemoireLocale();
    horloge = 1_000_000; id = 500; dictee = { ok: true, texte: 'salle de bain.' }; brouillonServeur = null; depotRetenu = null;
    vi.spyOn(Date, 'now').mockImplementation(() => horloge);
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = () => `blob:v-${Math.random()}`; (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FauxEnregistreur;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }) } });
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'programmee', rdv: RDV, tacheId: 9, collegues: [], tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null } } : l));
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      if (!init?.method && String(u).includes('previsiteBrouillon=')) return ok({ brouillon: brouillonServeur, enregistreLe: brouillonServeur ? '2026-11-15T13:05:00.000Z' : null });
      if (init?.method === 'POST') {
        const c = JSON.parse(String(init.body)) as Record<string, unknown>;
        if (c.action === 'vocal-compte-rendu') { if (depotRetenu) await depotRetenu; id += 1; return ok({ id, nom: 'v.m4a', taille: 3 }); }
        if (c.action === 'dicter-compte-rendu') return ok(dictee);
        if (c.action === 'brouillon-previsite') return ok({ enregistreLe: '2026-11-15T13:06:00.000Z' });
      }
      return (avant as typeof fetch)(u, init);
    }) as unknown as typeof fetch;
  });
  afterEach(() => { vi.restoreAllMocks(); });
  const patienter = async (cond: () => boolean) => { for (let k = 0; k < 80 && !cond(); k++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); await attendre(); };
  const ouvrir = async () => { await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre(); await suivreLienCr(); await patienter(() => document.querySelector('[data-corps-compte-rendu]') !== null); };
  const maintenir = async (b: HTMLButtonElement, ms: number) => {
    await act(async () => { b.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })); });
    await patienter(() => b.getAttribute('data-enregistrement') === 'oui' && b.querySelector('[data-maintien-duree]') !== null);
    horloge += ms;
    await act(async () => { b.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true })); });
    await attendre();
  };
  const rond = () => document.querySelector('[data-enregistrer-vocal]') as HTMLButtonElement;
  const sous = () => document.querySelector('[data-rond-duree]')!.textContent;
  const pastilles = () => [...document.querySelectorAll('[data-pastille-vocal]')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]);
  const prises = (n: number) => document.querySelector(`[data-vocal="${n}"]`)!.getAttribute('data-vocal-prises');

  it('titre dicté : il REMPLACE l’ancien (capitale, sans point) ; une dictée vide ne change rien ; titreDicte', async () => {
    const { titreDicte } = await import('./CompteRenduSaisie');
    expect(titreDicte('  salle de bain.  ', 60)).toBe('Salle de bain');
    expect(titreDicte('   ', 60)).toBe('');
    await ouvrir();
    await maintenir(rond(), 900);
    await patienter(() => document.querySelector('[data-prise-etat="ok"]') !== null);
    const nom = document.querySelector('[data-vocal="1"] [data-vocal-nom]') as HTMLInputElement;
    await maintenir(document.querySelector('[data-vocal="1"] [data-dicter-titre]') as HTMLButtonElement, 900);
    await patienter(() => nom.value !== 'Vocal 1');
    expect(nom.value).toBe('Salle de bain');
    dictee = { ok: true, texte: '' };
    await maintenir(document.querySelector('[data-vocal="1"] [data-dicter-titre]') as HTMLButtonElement, 900);
    await attendre();
    expect(nom.value).toBe('Salle de bain');
  });
  it('pastilles (une par fichier + « Nouveau »), libellé sous le bouton, carte active bordée et étiquetée, prise dans le BON fichier, appui sur une carte, suppression du fichier actif', async () => {
    await ouvrir();
    expect(document.querySelector('[data-pastilles-vocaux]')).toBeNull();
    expect(sous()).toBe('La première prise crée « Vocal 1 »');
    await maintenir(rond(), 900);
    await patienter(() => document.querySelector('[data-prise-etat="ok"]') !== null);
    expect(pastilles()).toEqual([['Vocal 1', 'true']]);
    expect(document.querySelector('[data-pastille-nouveau]')!.textContent).toBe(' Nouveau');
    expect(sous()).toBe('Maintenir pour enregistrer dans « Vocal 1 »');
    act(() => (document.querySelector('[data-pastille-nouveau]') as HTMLButtonElement).click());
    expect(pastilles()).toEqual([['Vocal 1', 'false'], ['Vocal 2', 'true']]);
    expect(sous()).toBe('Maintenir pour enregistrer dans « Vocal 2 »');
    // la carte active : bordée de rouge et étiquetée ; « Choisir ce fichier » ailleurs, « Fichier actif » (désactivé) sur elle
    expect(document.querySelector('[data-vocal="2"]')!.className).toContain('pvv-fichier-vocal--courant');
    expect(document.querySelector('[data-vocal="2"] [data-fichier-actif-etiquette]')!.textContent).toBe('Les prochaines prises vont ici');
    expect(document.querySelector('[data-vocal="1"] [data-fichier-actif-etiquette]')).toBeNull();
    expect((document.querySelector('[data-vocal="2"] [data-vocal-choisir]') as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('[data-vocal="2"] [data-vocal-choisir]')!.textContent).toBe(' Fichier actif');
    expect(document.querySelector('[data-vocal="1"] [data-vocal-choisir]')!.textContent).toBe(' Choisir ce fichier');
    // changer de destination par la pastille : la prise va dans « Vocal 1 »
    act(() => (document.querySelector('[data-pastille-vocal="1"]') as HTMLButtonElement).click());
    expect(sous()).toBe('Maintenir pour enregistrer dans « Vocal 1 »');
    await maintenir(rond(), 900);
    await patienter(() => prises(1) === '2');
    expect([prises(1), prises(2)]).toEqual(['2', '0']);
    // un appui sur une AUTRE carte (hors boutons et champs) la rend active
    act(() => { (document.querySelector('[data-vocal="2"] [data-vocal-resume]') as HTMLElement).click(); });
    expect(pastilles().map((x) => x[1])).toEqual(['false', 'true']);
    // supprimer le fichier ACTIF : le précédent devient actif
    act(() => (document.querySelector('[data-vocal="2"] [data-vocal-supprimer]') as HTMLButtonElement).click());
    act(() => (document.querySelector('[data-vocal-supprimer-oui]') as HTMLButtonElement).click());
    expect(pastilles()).toEqual([['Vocal 1', 'true']]);
    expect(sous()).toBe('Maintenir pour enregistrer dans « Vocal 1 »');
  });
  it('le fichier actif est MÉMORISÉ dans le brouillon et restauré à la réouverture', async () => {
    brouillonServeur = { corps: 'CR', presents: [], ajoutees: [], photos: [], aussiLocataires: true, fichierActif: 'f1',
      fichiers: [{ cle: 'f1', nom: 'Cuisine', locataires: false, prises: [] }, { cle: 'f2', nom: 'Salle de bain', locataires: false, prises: [] }] };
    await ouvrir();
    await patienter(() => document.querySelectorAll('[data-pastille-vocal]').length === 2);
    expect(pastilles()).toEqual([['Cuisine', 'true'], ['Salle de bain', 'false']]);
    expect(sous()).toBe('Maintenir pour enregistrer dans « Cuisine »');
  });

  /* ══ 🔴🔴 Arno (15/11/2026, 9e retour) — JAMAIS DE VOCAL FANTÔME ══ */
  const statut = (f: number, k: number) => document.querySelector(`[data-vocal="${f}"] [data-prise="${k}"] [data-prise-statut]`);
  const refus = () => document.querySelector('[data-previsite-refus]')?.textContent ?? '';
  const recap = () => document.querySelector('[data-recap-previsite]') as HTMLButtonElement;
  it('chaque prise dit son état : « Sauvegarde en cours… » (gris) tant que le serveur n’a pas confirmé, puis « Sauvegardée »', async () => {
    let liberer: () => void = () => {}; depotRetenu = new Promise<void>((r) => { liberer = r; });
    await ouvrir();
    await maintenir(rond(), 900);
    await patienter(() => statut(1, 1) !== null);
    expect([statut(1, 1)!.getAttribute('data-prise-statut'), statut(1, 1)!.textContent, statut(1, 1)!.className]).toEqual(['en_cours', 'Sauvegarde en cours…', 'loc-muet pvv-statut-piece']);
    liberer(); depotRetenu = null;
    await patienter(() => statut(1, 1)!.getAttribute('data-prise-statut') === 'sauvegardee');
    expect(statut(1, 1)!.textContent).toBe('Sauvegardée');
  });
  it('une prise en cours de sauvegarde BLOQUE le récapitulatif, et le refus la NOMME (le bouton n’est pas grisé sans explication)', async () => {
    brouillonServeur = { corps: 'CR', presents: [11], ajoutees: [], photos: [], aussiLocataires: true, fichiers: [] };
    let liberer: () => void = () => {}; depotRetenu = new Promise<void>((r) => { liberer = r; });
    await ouvrir();
    await patienter(() => (document.querySelector('[data-corps-compte-rendu]') as HTMLTextAreaElement).value === 'CR');
    await maintenir(rond(), 900);
    await patienter(() => statut(1, 1) !== null);
    expect(document.querySelector('[data-blocage-envoi]')!.textContent).toBe('Prise 1 de « Vocal 1 » : sauvegarde en cours — attendez « Sauvegardée ».');
    expect(recap().disabled).toBe(false);
    const avant = posts.length;
    await act(async () => { recap().click(); });
    await attendre();
    expect(refus()).toBe('Prise 1 de « Vocal 1 » : sauvegarde en cours — attendez « Sauvegardée ».');
    expect(posts.slice(avant).some((c) => String(c.action).startsWith('apercu'))).toBe(false);
    liberer(); depotRetenu = null;
    await patienter(() => document.querySelector('[data-blocage-envoi]') === null);
    expect(document.querySelector('[data-blocage-envoi]')).toBeNull();
  });
  it('à la réouverture, une prise ou une photo référencée qu’on ne retrouve NULLE PART revient ROUGE « Vide ou perdue — à réenregistrer », bloque l’envoi et se supprime', async () => {
    brouillonServeur = { corps: 'CR', presents: [11], ajoutees: [], aussiLocataires: true,
      photos: [{ cle: 'perdue-72', legende: 'Parquet', perdue: true }],
      fichiers: [{ cle: 'f1', nom: 'Cuisine', locataires: false, prises: [{ id: 81, dureeS: 2 }, { cle: 'perdue-82', dureeS: 1, perdue: true }, { cle: 'jamais-arrivee', dureeS: 3 }] }] };
    await ouvrir();
    await patienter(() => document.querySelectorAll('[data-prise]').length === 3);
    expect(statut(1, 1)!.textContent).toBe('Sauvegardée');
    for (const k of [2, 3]) {
      expect(document.querySelector(`[data-vocal="1"] [data-prise="${k}"]`)!.getAttribute('data-prise-etat')).toBe('perdue');
      expect([statut(1, k)!.textContent, statut(1, k)!.getAttribute('role'), statut(1, k)!.className]).toEqual(['Vide ou perdue — à réenregistrer', 'alert', 'pvv-statut-piece pvv-statut-piece--perdue']);
      expect(document.querySelector(`[data-vocal="1"] [data-prise="${k}"]`)!.className).toContain('pvv-prise--perdue');
      expect((document.querySelector(`[data-vocal="1"] [data-prise="${k}"] [data-prise-ecouter]`) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(document.querySelector('[data-photo="1"]')!.getAttribute('data-photo-etat')).toBe('perdue');
    expect(document.querySelector('[data-photo="1"] [data-photo-perdue]')!.textContent).toBe('Photo vide ou perdue — à reprendre (supprimez-la, puis ajoutez-la de nouveau).');
    const motif = 'Photo 1, Prise 2 de « Cuisine » et Prise 3 de « Cuisine » : vides ou perdues — supprimez-les (et refaites-les) avant d’envoyer.';
    expect(document.querySelector('[data-blocage-envoi="perdue"]')!.textContent).toBe(motif);
    const avant = posts.length;
    await act(async () => { recap().click(); });
    await attendre();
    expect(refus()).toBe(motif);
    expect(posts.slice(avant).some((c) => String(c.action).startsWith('apercu'))).toBe(false);
    // le brouillon garde la trace des perdues (jamais retirées en silence)
    // supprimer : plus rien ne bloque
    for (const k of [3, 2]) {
      act(() => (document.querySelector(`[data-vocal="1"] [data-prise="${k}"] [data-prise-supprimer]`) as HTMLButtonElement).click());
      act(() => (document.querySelector('[data-prise-supprimer-oui]') as HTMLButtonElement).click());
    }
    act(() => (document.querySelector('[data-photo="1"] [data-photo-supprimer]') as HTMLButtonElement).click());
    act(() => (document.querySelector('[data-photo-supprimer-oui]') as HTMLButtonElement).click());
    expect(document.querySelector('[data-blocage-envoi]')).toBeNull();
  });
  it('MISE EN VEILLE pendant une prise : la prise est finalisée TOUT DE SUITE, écrite dans le téléphone puis envoyée ; la fin normale ne la double pas', async () => {
    let liberer: () => void = () => {}; depotRetenu = new Promise<void>((r) => { liberer = r; });
    await ouvrir();
    const b = rond();
    await act(async () => { b.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })); });
    await patienter(() => b.getAttribute('data-enregistrement') === 'oui' && b.querySelector('[data-maintien-duree]') !== null);
    horloge += 1500;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    await patienter(() => document.querySelector('[data-vocal="1"]') !== null);
    expect(prises(1)).toBe('1');
    const { listerAttente, groupeDe } = await import('../../../../lib/location/fileAttenteLocale');
    await patienter(() => false);
    const attente = await listerAttente(groupeDe([11, 12]));
    expect(attente.filter((e) => e.sorte === 'prise').map((e) => [e.fichierCle !== undefined, e.dureeS])).toEqual([[true, 1.5]]);
    // le doigt relevé ensuite : aucune seconde prise
    await act(async () => { b.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true })); });
    await attendre();
    expect(prises(1)).toBe('1');
    liberer(); depotRetenu = null;
    await patienter(() => statut(1, 1)?.getAttribute('data-prise-statut') === 'sauvegardee');
    expect(statut(1, 1)!.textContent).toBe('Sauvegardée');
  });
  it('une prise SANS contenu n’est jamais gardée en silence : c’est dit', async () => {
    const { MESSAGE_PRISE_VIDE } = await import('./CompteRenduSaisie');
    const vide = class extends FauxEnregistreur { stop() { this.state = 'inactive'; this.onstop?.(); } };
    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = vide;
    await ouvrir();
    await maintenir(rond(), 900);
    expect(document.querySelector('[data-vocal="1"]')).toBeNull();
    expect(document.querySelector('[data-vocal-micro]')!.textContent).toBe(MESSAGE_PRISE_VIDE);
  });
});

describe('🔴🔴 Arno (15/11/2026, 9e retour) — « Écouter » sur l’iPhone, la fenêtre du compte rendu depuis la frise, la page jamais blanche', () => {
  const RDV = { jour: '2026-11-13', heure: '13:45', dureeMinutes: 15 };
  let brouillonServeur: unknown = null; let lectureBrouillonRetenue: Promise<void> | null = null;
  let joues: { el: HTMLMediaElement; src: string }[] = []; let pauses = 0; let temps = 0;
  beforeEach(async () => {
    (await import('../../../../lib/location/fileAttenteLocale')).oublierMemoireLocale();
    (await import('./lecteurVocal')).oublierLecteur();
    brouillonServeur = null; lectureBrouillonRetenue = null; joues = []; pauses = 0; temps = 0;
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = () => `blob:v-${Math.random()}`; (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) { joues.push({ el: this, src: this.getAttribute('src') ?? this.src }); return Promise.resolve(); });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => { pauses += 1; });
    vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'get').mockImplementation(() => temps);
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'programmee', rdv: RDV, tacheId: 9, collegues: [], tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null } } : l));
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      if (!init?.method && String(u).includes('previsiteBrouillon=')) {
        if (lectureBrouillonRetenue) await lectureBrouillonRetenue;
        return ok({ brouillon: brouillonServeur, enregistreLe: brouillonServeur ? '2026-11-15T13:05:00.000Z' : null });
      }
      if (init?.method === 'POST' && String(init.body).includes('"brouillon-previsite"')) return ok({ enregistreLe: '2026-11-15T13:06:00.000Z' });
      return (avant as typeof fetch)(u, init);
    }) as unknown as typeof fetch;
  });
  afterEach(() => { vi.restoreAllMocks(); });
  const patienter = async (cond: () => boolean) => { for (let k = 0; k < 80 && !cond(); k++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); await attendre(); };
  const BROUILLON = { corps: 'Salon propre.', presents: [11], aussiLocataires: true, fichierActif: null,
    ajoutees: [{ cle: 'p1', civilite: 'Madame', nom: 'Martin', prenom: 'Léa', present: true, note: 'mère du locataire' }],
    photos: [{ id: 71, legende: 'Rayure parquet' }],
    fichiers: [{ cle: 'f1', nom: 'Cuisine', locataires: true, prises: [{ id: 81, dureeS: 3 }, { id: 82, dureeS: 2 }] }, { cle: 'f2', nom: 'Salon', locataires: false, prises: [{ id: 83, dureeS: 4 }] }] };
  const progression = () => document.querySelector('[data-lecture-progression]');

  it('« Écouter » : la lecture démarre au PREMIER toucher, prises ENCHAÎNÉES, « Lecture… 00:01 / 00:05 » et la barre ; Pause garde la position ; UN SEUL vocal à la fois', async () => {
    brouillonServeur = BROUILLON;
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    await suivreLienCr();
    await patienter(() => document.querySelectorAll('[data-vocal]').length === 2);
    const ecouter = (n: number) => document.querySelector(`[data-vocal="${n}"] [data-vocal-ecouter]`) as HTMLButtonElement;
    act(() => ecouter(1).click());
    expect(joues.map((j) => j.src)).toEqual(['/api/admin/location/pieces-sortie?piece=81']);
    expect([ecouter(1).getAttribute('data-en-lecture'), ecouter(1).textContent]).toEqual(['oui', ' Pause']);
    expect(progression()!.textContent).toBe('Lecture… 00:00 / 00:05');
    temps = 1.4; act(() => { joues[0].el.dispatchEvent(new Event('timeupdate')); });
    expect(progression()!.querySelector('[data-lecture-texte]')!.textContent).toBe('Lecture… 00:01 / 00:05');
    expect(progression()!.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('28');
    // la prise suivante s'enchaîne
    temps = 0; act(() => { joues[0].el.dispatchEvent(new Event('ended')); });
    expect(joues.map((j) => j.src)).toEqual(['/api/admin/location/pieces-sortie?piece=81', '/api/admin/location/pieces-sortie?piece=82']);
    temps = 1; act(() => { joues[0].el.dispatchEvent(new Event('timeupdate')); });
    expect(progression()!.querySelector('[data-lecture-texte]')!.textContent).toBe('Lecture… 00:04 / 00:05');
    // Pause : la position est gardée ; la barre reste
    act(() => ecouter(1).click());
    expect([ecouter(1).getAttribute('data-en-lecture'), progression()!.querySelector('[data-lecture-texte]')!.textContent]).toEqual(['non', 'En pause 00:04 / 00:05']);
    // un AUTRE vocal : le premier s'arrête (un seul à la fois)
    act(() => ecouter(2).click());
    expect(ecouter(1).getAttribute('data-en-lecture')).toBe('non');
    expect(ecouter(2).getAttribute('data-en-lecture')).toBe('oui');
    expect(document.querySelectorAll('[data-lecture-progression]')).toHaveLength(1);
    expect(joues.at(-1)!.src).toBe('/api/admin/location/pieces-sortie?piece=83');
    // une prise seule : même lecteur
    act(() => (document.querySelector('[data-vocal="1"] [data-prise="2"] [data-prise-ecouter]') as HTMLButtonElement).click());
    expect(ecouter(2).getAttribute('data-en-lecture')).toBe('non');
    expect(joues.at(-1)!.src).toBe('/api/admin/location/pieces-sortie?piece=82');
    // jamais le menu de l'appui long sur un bouton ; les champs restent sélectionnables
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n');
    expect(css).toContain('.pvv-page-cr button,.pvv-page-cr .svv-btn,.pvv-page-cr [role=switch],.pvv-page-cr label.pvv-interrupteur,.mis-boite button,.mis-boite .svv-btn,.pvv-voile button{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;touch-action:manipulation}');
    expect(css).toContain('.pvv-page-cr input,.pvv-page-cr textarea,.mis-boite input,.mis-boite textarea{-webkit-user-select:text;user-select:text}');
  });
  it('« Écouter » relâche d’abord le micro gardé ouvert (sinon l’iPhone joue dans l’écouteur) — jamais pendant un enregistrement', async () => {
    const env = await import('../../../../lib/location/enregistreurVocal');
    let arrets = 0;
    class MR { static isTypeSupported = () => true; mimeType = 'audio/mp4'; state = 'inactive'; }
    await env.ouvrirEnregistreur({ securise: true, MediaRecorder: MR as never, mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { arrets += 1; }, readyState: 'live' }] }) as never } });
    const { basculerLecture } = await import('./lecteurVocal');
    act(() => basculerLecture('x', [{ url: '/a', dureeS: 1 }]));
    expect(arrets).toBe(1);
  });
  it('la frise : « Compte rendu pré-visite » ouvre la FENÊTRE (brouillon non envoyé, lecture seule) : objet, adresse, présences et notes internes, texte, photos qui s’AGRANDISSENT, vocaux (titre, statut, lecteur) ; « Continuer la saisie »', async () => {
    brouillonServeur = BROUILLON;
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    clic('[data-ligne-depliee="C"] [data-compte-rendu-previsite]'); await attendre(); await attendre();
    const f = document.querySelector('[data-fenetre-compte-rendu="brouillon"]')!;
    expect(f.getAttribute('aria-modal')).toBe('true');
    expect(f.closest('.mis-voile')!.className).toContain('pvv-voile-consultation');
    expect(f.querySelector('[data-cr-brouillon="oui"]')!.textContent).toBe('Brouillon — non envoyé, dernier enregistrement à 14h05');
    // 🔴🔴 (15/11/2026, retours sur la fenêtre) l'adresse une seule fois, en grand ; plus de ligne grise « locataires — adresse » ; pas d'objet (rien n'est envoyé)
    expect(f.querySelector('[data-cr-adresse-grande]')!.textContent).toBe('C rue');
    expect(f.querySelector('[data-cr-adresse]')).toBeNull();
    expect(f.querySelector('[data-cr-objet]')).toBeNull();
    expect([...f.querySelectorAll('[data-cr-present]')].map((x) => x.textContent)).toEqual(['BERNARD Alice — locataire', 'Madame Léa MARTIN — personne présente — note interne : mère du locataire']);
    expect(f.querySelector('[data-cr-texte]')!.textContent).toBe('Salon propre.');
    expect(f.querySelector('[data-cr-legende]')!.textContent).toBe('Photo 1 — Rayure parquet');
    expect([...f.querySelectorAll('[data-cr-vocal-etat]')].map((x) => x.textContent)).toEqual(['ENVOYÉ aux locataires', 'NON envoyé (interne)']);
    expect(f.querySelectorAll('[data-cr-vocal-ecouter]')).toHaveLength(2);
    expect(f.querySelector('[data-cr-pas-envoye]')!.textContent).toBe('Rien n’est encore envoyé.');
    // la vignette s'agrandit, puis se referme
    act(() => (f.querySelector('[data-cr-agrandir="1"]') as HTMLButtonElement).click());
    expect(document.querySelector('[data-cr-photo-agrandie] img')!.getAttribute('src')).toBe('/api/admin/location/pieces-sortie?piece=71');
    act(() => (document.querySelector('[data-cr-photo-fermer]') as HTMLButtonElement).click());
    expect(document.querySelector('[data-cr-photo-agrandie]')).toBeNull();
    const a = f.querySelector('a[data-continuer-saisie]')!;
    expect([a.textContent, a.getAttribute('href')]).toEqual(['Continuer la saisie', '/admin/location/previsite/11/compte-rendu']);
    expect(posts.some((c) => String(c.action).includes('brouillon'))).toBe(false); // rien n'est écrit en l'ouvrant
  });
  it('la frise, sans aucune saisie : « Aucune saisie enregistrée pour l’instant » et « Commencer la saisie »', async () => {
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    clic('[data-ligne-depliee="C"] [data-compte-rendu-previsite]'); await attendre(); await attendre();
    expect(document.querySelector('[data-cr-brouillon="aucun"]')!.textContent).toBe('Aucune saisie enregistrée pour l’instant.');
    expect(document.querySelector('a[data-continuer-saisie]')!.textContent).toBe('Commencer la saisie');
  });
  it('« Voir le compte rendu » (envoyé) : présences et notes internes, durée des prises, envois LOCATAIRES d’abord puis interne', async () => {
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'effectuee', rdv: RDV, tacheId: 9, collegues: [], tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null, compteRendu: true } } : l));
    const CR = { texte: 'En présence de Alice BERNARD.\n\nCR', objet: 'Objet du CR', saisiPar: 'Arno', saisiLe: '2026-11-13T15:13:00Z', pieces: [], aucunEnvoi: false,
      presences: { occupations: [11], personnes: [{ civilite: 'Madame', nom: 'Martin', prenom: 'Léa', note: 'mère du locataire' }] },
      destinataires: [{ nom: 'Alice BERNARD', famille: 'locataire', quand: '2026-11-13T15:13:00Z', etat: 'envoye', motif: null }, { nom: 'Arno', famille: 'interne', quand: '2026-11-13T15:13:00Z', etat: 'envoye', motif: null }],
      vocaux: [{ id: 81, nom: 'a', taille: 3, dureeS: 3 }], fichiersVocaux: [{ nom: 'Cuisine', prises: [{ id: 81, nom: 'a', taille: 3, dureeS: 3 }], locataires: true }] };
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (!init?.method && String(u).includes('previsiteCompteRendu=') ? ok(CR) : (avant as typeof fetch)(u, init))) as unknown as typeof fetch;
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    clic('[data-ligne-depliee="C"] [data-voir-compte-rendu="oui"]'); await attendre(); await attendre();
    const f = document.querySelector('[data-fenetre-compte-rendu="envoye"]')!;
    expect([...f.querySelectorAll('[data-cr-present]')].map((x) => x.textContent)).toEqual(['BERNARD Alice — locataire', 'Madame Léa MARTIN — personne présente — note interne : mère du locataire']);
    expect([...f.querySelectorAll('[data-cr-destinataire]')].map((x) => x.getAttribute('data-cr-destinataire'))).toEqual(['locataire', 'interne']);
    act(() => (f.querySelector('[data-cr-vocal-ecouter]') as HTMLButtonElement).click());
    expect(f.querySelector('[data-lecture-texte]')!.textContent).toBe('Lecture… 00:00 / 00:03');
    // fermer la fenêtre arrête la lecture
    act(() => (f.querySelector('[data-fermer-compte-rendu]') as HTMLButtonElement).click());
    expect((await import('./lecteurVocal')).etatLecture().cle).toBeNull();
  });
  it('🔴🔴 (11e retour) la consultation : plein écran au téléphone (une seule zone qui défile, fond opaque), aucun bloc écrasé, texte ENTIER, titre de vocal une seule fois, « ← Fermer » en haut, nom du saisisseur', async () => {
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'effectuee', rdv: RDV, tacheId: 9, collegues: [], tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null, compteRendu: true } } : l));
    const TEXTE = 'Compte rendu de la pré-visite du 15/11/2026 — 1 rue du Préavis de Test\n\nEn présence de TEST.\n\n- Logement propre.\n- Rayure du parquet de la chambre\n- Joint de la douche à refaire';
    const CR = { texte: TEXTE, objet: 'Objet', saisiPar: 'Arnaud JOREL', saisiLe: '2026-11-15T15:49:00Z', pieces: [], aucunEnvoi: false, presences: null, destinataires: [],
      vocaux: [{ id: 81, nom: 'a', taille: 3 }], fichiersVocaux: [{ nom: 'Vocal pour locataire', prises: [{ id: 81, nom: 'a', taille: 3, dureeS: 4 }, { id: 82, nom: 'b', taille: 3, dureeS: 4 }, { id: 83, nom: 'c', taille: 3, dureeS: 4 }], locataires: true }] };
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (!init?.method && String(u).includes('previsiteCompteRendu=') ? ok(CR) : (avant as typeof fetch)(u, init))) as unknown as typeof fetch;
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    clic('[data-ligne-depliee="C"] [data-voir-compte-rendu="oui"]'); await attendre(); await attendre();
    const f = document.querySelector('[data-fenetre-compte-rendu="envoye"]')!;
    expect(f.className).toContain('pvv-boite-consultation');
    // en entier, retours à la ligne et tirets compris — 🔴🔴 (15/11/2026, retours sur la fenêtre) sans l'en-tête ni « En présence de … » (générés)
    expect(f.querySelector('[data-cr-texte]')!.textContent).toBe('- Logement propre.\n- Rayure du parquet de la chambre\n- Joint de la douche à refaire');
    expect(f.querySelector('[data-cr-saisi]')!.textContent).toBe('Saisi par Arnaud JOREL le 15/11/2026 à 16h49');
    // le titre du vocal une seule fois ; le statut en étiquette ; les trois prises
    const v = f.querySelector('[data-cr-vocal="1"]')!;
    expect(v.textContent!.split('Vocal pour locataire').length - 1).toBe(1);
    expect(v.querySelector('[data-cr-vocal-etat]')!.className).toBe('pvv-cr-vocal-statut pvv-cr-vocal-statut--envoye');
    expect(v.querySelectorAll('[data-cr-prise]')).toHaveLength(3);
    // « ← Fermer » en haut, « Fermer » en FIN de contenu (après la liste des prises)
    const haut = f.querySelector('[data-fermer-haut]')!; const bas = f.querySelector('[data-fermer-compte-rendu]')!;
    expect(haut.compareDocumentPosition(f.querySelector('[data-cr-texte]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(v.compareDocumentPosition(bas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n');
    expect(css).toContain('.pvv-boite-consultation > *{flex-shrink:0}');
    expect(css).toContain('.pvv-boite-consultation .mis-actions{position:static;margin:18px 0 0;padding:12px 0 16px;border-top:1px solid var(--color-svv-line);background:transparent}');
    expect(css).toContain('.pvv-boite-consultation .pvv-cr-texte{max-height:none;overflow:visible}');
    expect(css).toContain('.pvv-voile-consultation{inset:0;padding:0;align-items:stretch;justify-content:stretch;display:block;overflow-y:auto');
    expect(css).toContain('.pvv-voile-consultation .mis-boite{width:100%;max-height:none;min-height:100%;overflow:visible;border:0;border-radius:0;box-shadow:none');
    act(() => (haut as HTMLButtonElement).click());
    expect(document.querySelector('[data-fenetre-compte-rendu]')).toBeNull();
    global.fetch = avant;
  });
  it('🔴🔴 (15/11/2026, retours sur la fenêtre) AUCUNE information deux fois : adresse, présence, vocaux, photos, signature ; objet seulement avec le mail ; présences reconstituées depuis le texte, mention discrète ; mail tel qu’envoyé inchangé', async () => {
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, test: true, previsite: { statut: 'effectuee', rdv: RDV, tacheId: 9, collegues: [], tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null, compteRendu: true } } : l));
    const TEXTE = ['Compte rendu de la pré-visite du 15/11/2026 — C rue', 'En présence de Alice BERNARD et de M. Jean Durand.', 'Logement propre.\n- Rayure du parquet',
      'Photos', 'Photo 1 — Rayure du parquet\nPhoto 2 — Joint de la douche', 'Enregistrements vocaux joints', 'Vocal pour locataire (2 prises, à écouter dans l’ordre)',
      'Mail envoyé par Arnaud JOREL (a.jorel@sansvisavis.com)', '-- \nService Gestion'].join('\n\n');
    const CR = { texte: TEXTE, objet: '[TEST] Compte rendu de pré-visite', saisiPar: 'Arnaud JOREL', saisiLe: '2026-11-15T14:49:00Z', aucunEnvoi: false, destinataires: [],
      pieces: [{ id: 71, nom: 'Photo-1.jpg', taille: 3 }, { id: 72, nom: 'Photo-2.jpg', taille: 3 }],
      presences: { occupations: [11], personnes: [{ civilite: '', prenom: '', nom: 'M. Jean Durand', note: '' }], locataires: [{ occupationId: 11, civilite: null, prenom: 'Alice', nom: 'Bernard' }], source: 'texte' },
      vocaux: [], fichiersVocaux: [{ nom: 'Vocal pour locataire', prises: [{ id: 81, nom: 'a', taille: 3, dureeS: 4 }, { id: 82, nom: 'b', taille: 3, dureeS: 4 }], locataires: true }] };
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (!init?.method && String(u).includes('previsiteCompteRendu=') ? ok(CR) : (avant as typeof fetch)(u, init))) as unknown as typeof fetch;
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    clic('[data-ligne-depliee="C"] [data-voir-compte-rendu="oui"]'); await attendre(); await attendre();
    const f = document.querySelector('[data-fenetre-compte-rendu="envoye"]')!;
    // en-tête : le titre (badge TEST seul), l'adresse UNE fois en grand, « Saisi par », l'état d'envoi ; plus de ligne grise ni d'objet
    expect(f.querySelector('h2')!.textContent).toBe('TESTCompte rendu de pré-visite');
    expect(f.querySelector('h2 [data-badge-test]')).not.toBeNull();
    expect(f.querySelector('[data-cr-adresse]')).toBeNull();
    expect([...f.querySelector('[data-cr-entete]')!.children].map((x) => x.getAttribute('class'))).toEqual(['pvv-cr-adresse-grande', 'pvv-cr-qui', 'pvv-cr-etat-envoi pvv-cr-etat-envoi--ok']);
    // l'objet : seulement dans « Voir le mail tel qu'envoyé », avec le mail entier, INCHANGÉ
    const mail = f.querySelector('[data-cr-mail-envoye]')!;
    expect(f.querySelectorAll('[data-cr-objet]')).toHaveLength(1);
    expect(mail.querySelector('[data-cr-objet]')!.textContent).toBe('[TEST] Compte rendu de pré-visite');
    expect(mail.querySelector('[data-cr-mail-texte]')!.textContent).toBe(TEXTE.replace(/\n\nPhotos\n\nPhoto 1 — Rayure du parquet\nPhoto 2 — Joint de la douche/, ''));
    // hors du mail tel qu'envoyé, chaque information une seule fois
    const hors = (x: string): number => { const c = f.cloneNode(true) as Element; c.querySelector('[data-cr-mail-envoye]')!.remove(); return c.textContent!.split(x).length - 1; };
    expect(hors('C rue')).toBe(1);
    expect(hors('Jean Durand')).toBe(1);
    expect(hors('Vocal pour locataire')).toBe(1);
    expect(hors('Rayure du parquet')).toBe(2); // le texte saisi, et la légende de la photo 1 (deux informations distinctes)
    expect(hors('Joint de la douche')).toBe(1);
    expect(hors('Mail envoyé par')).toBe(0);
    expect(hors('Service Gestion')).toBe(0);
    expect(hors('En présence')).toBe(0);
    // la section Texte : ce que le collaborateur a saisi, rien d'autre
    expect(f.querySelector('[data-cr-texte]')!.textContent).toBe('Logement propre.\n- Rayure du parquet');
    // la présence, reconstituée depuis le texte : les noms, la mention discrète
    expect([...f.querySelectorAll('[data-cr-present]')].map((x) => x.textContent)).toEqual(['Alice BERNARD — locataire', 'M. Jean Durand — personne présente']);
    expect(f.querySelector('[data-cr-presence-reconstituee]')!.textContent).toBe('reconstitué depuis le texte');
    expect([...f.querySelectorAll('[data-cr-legende]')].map((x) => x.textContent)).toEqual(['Photo 1 — Rayure du parquet', 'Photo 2 — Joint de la douche']);
    global.fetch = avant;
  });
  it('🔴 présences ENREGISTRÉES (journal) : aucune mention « reconstitué » ; brouillon : même règle (adresse une fois, ni objet ni ligne grise)', async () => {
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'effectuee', rdv: RDV, tacheId: 9, collegues: [], tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null, compteRendu: true } } : l));
    const CR = { texte: 'CR', objet: 'Objet', saisiPar: 'Arno', saisiLe: '2026-11-15T14:49:00Z', aucunEnvoi: false, destinataires: [], pieces: [],
      presences: { occupations: [11], personnes: [], locataires: [{ occupationId: 11, civilite: null, prenom: 'Alice', nom: 'Bernard' }] } };
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (!init?.method && String(u).includes('previsiteCompteRendu=') ? ok(CR) : (avant as typeof fetch)(u, init))) as unknown as typeof fetch;
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    clic('[data-ligne-depliee="C"] [data-voir-compte-rendu="oui"]'); await attendre(); await attendre();
    const f = document.querySelector('[data-fenetre-compte-rendu="envoye"]')!;
    expect([...f.querySelectorAll('[data-cr-present]')].map((x) => x.textContent)).toEqual(['Alice BERNARD — locataire']);
    expect(f.querySelector('[data-cr-presence-reconstituee]')).toBeNull();
    expect(f.querySelector('h2 [data-badge-test]')).toBeNull(); // pas un préavis de test : pas de badge
    global.fetch = avant;
  });
  it('la page n’est jamais blanche : « Restauration du brouillon… » visible tant qu’il tarde ; repeinte d’elle-même quand le contenu arrive et au retour de l’arrière-plan', async () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number);
    let liberer: () => void = () => {}; lectureBrouillonRetenue = new Promise<void>((r) => { liberer = r; });
    brouillonServeur = BROUILLON;
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    // la fenêtre de la frise lit aussi le brouillon : on la libère pour atteindre le lien
    const suivre = suivreLienCr(); liberer(); await suivre;
    lectureBrouillonRetenue = new Promise<void>((r) => { liberer = r; });
    act(() => root.unmount()); root = createRoot(container);
    const { PageCompteRendu } = await import('./PageCompteRendu');
    document.documentElement.removeAttribute('data-repeint');
    await act(async () => { root.render(createElement(PageCompteRendu, { occupationId: 11 })); }); await attendre();
    await patienter(() => document.querySelector('[data-corps-compte-rendu]') !== null);
    expect(document.querySelector('[data-brouillon-chargement]')!.textContent).toBe('Restauration du brouillon…');
    expect(document.querySelector('[data-corps-compte-rendu]')).not.toBeNull(); // le formulaire reste visible pendant ce temps
    document.documentElement.removeAttribute('data-repeint');
    liberer();
    await patienter(() => document.querySelector('[data-brouillon-chargement]') === null);
    await patienter(() => document.documentElement.hasAttribute('data-repeint'));
    expect(document.documentElement.hasAttribute('data-repeint')).toBe(true);
    document.documentElement.removeAttribute('data-repeint');
    act(() => { window.dispatchEvent(new Event('pageshow')); });
    await patienter(() => document.documentElement.hasAttribute('data-repeint'));
    expect(document.documentElement.hasAttribute('data-repeint')).toBe(true);
    raf.mockRestore();
  });
});

describe('🔴🔴 Arno (15/11/2026) — filtres par STATUT au-dessus de la liste : compteurs et filtrage = lignes AFFICHÉES ; fenêtres toujours lisibles', () => {
  const PV = (statut: 'alerte' | 'recu' | 'programmee' | 'effectuee' | 'refusee') => ({ statut, rdv: null, tacheId: null, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null });
  const EDLS = { edlsId: 1, tacheId: 2, jour: '2099-06-01', heure: '10:00', dureeMinutes: 60, confieA: 'Arno Test', confieAId: 3, statut: 'acceptee' as const, reponduPar: null, motifRefus: null };
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* rien */ }
    lignes = [
      { ...LIGNES[0], previsite: PV('alerte') },
      { ...LIGNES[1], previsite: PV('programmee') },
      { ...LIGNES[2], previsite: PV('effectuee'), edls: EDLS },
      ligne('T', { adresse: 'T rue', occupationId: 41, occupationIds: [41], test: true, testId: 9, previsite: PV('programmee'),
        locataires: [{ occupationId: 41, locataireId: 401, nom: 'TEST' }] }),
    ];
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (!init?.method && String(u).includes('preavisEnCours=1')
      ? ok({ disponible: true, etatDesLieux: true, previsite: true, planification: true, lignes }) : (avant as typeof fetch)(u, init))) as unknown as typeof fetch;
  });
  const compteurs = () => Object.fromEntries([...container.querySelectorAll('[data-filtre-previsite]')].map((b) => [b.getAttribute('data-filtre-previsite'), b.textContent]));
  it('chaque compteur = ses lignes dans la liste affichée (préavis de test compris) ; « Tous » = le total affiché', async () => {
    await rendre(true);
    expect(ordre()).toHaveLength(4);
    expect(compteurs()).toEqual({ tous: 'Tous (4)', en_preavis: 'En préavis 1', rdv_previsite: 'RDV pré-visite fixé 2', refus_previsite: 'Refus / absence pré-visite 0',
      previsite_effectuee: 'Pré-visite effectuée 0', rdv_edl: 'RDV état des lieux fixé 1', alerte: 'Alerte préavis 1' });
    expect(container.querySelector('[data-nombre-preavis]')!.textContent).toBe('4');
    // la somme des compteurs de statut = le total : aucune ligne perdue
    const somme = [...container.querySelectorAll('[data-compteur-previsite]')].filter((x) => x.getAttribute('data-compteur-previsite') !== 'alerte').reduce((n, x) => n + Number(x.textContent), 0);
    expect(somme).toBe(4);
  });
  it('un clic sur un statut n’affiche QUE ses lignes ; cumulable ; combinable avec l’alerte et le tri ; « Tous » remet tout', async () => {
    await rendre(true);
    clic('[data-filtre-previsite="rdv_previsite"]'); await attendre();
    expect(ordre().sort()).toEqual(['B', 'T']);
    expect([...container.querySelectorAll('[data-ligne-preavis] [data-statut-ligne]')].every((x) => x.textContent === 'RDV pré-visite fixé')).toBe(true);
    clic('[data-filtre-previsite="alerte"]'); await attendre();
    expect(ordre().sort()).toEqual(['A', 'B', 'T']);
    clic('[data-tri="statut:desc"]'); await attendre();
    expect(ordre()[2]).toBe('A'); // le tri s'applique aux lignes filtrées
    clic('[data-filtre-previsite="tous"]'); await attendre();
    expect(ordre()).toHaveLength(4);
  });
  it('les deux rangées ne s’appellent plus pareil : « Tri par statut » (le tri) et « Statut » (le filtre)', async () => {
    await rendre(true);
    const libelles = [...container.querySelectorAll('.pva-tri-libelle')].map((x) => x.textContent);
    expect(libelles).toContain('Tri par statut');
    expect(libelles.filter((x) => x === 'Statut')).toHaveLength(1);
  });
  it('chaque filtre porte la couleur de son statut (comme le cartouche) ; le filtre choisi est MÉMORISÉ', async () => {
    await rendre(true);
    expect(container.querySelector('[data-filtre-previsite="rdv_edl"]')!.className).toBe('pva-segment pvv-pastille psl-filtre psl-filtre--rdv_edl');
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n');
    expect(css).toContain('.psl-filtre--rdv_edl{--psl-fond:var(--color-svv-violet-soft);--psl-encre:var(--color-svv-violet)}');
    expect(css).toContain('.psl-statut--rdv_edl{background:var(--color-svv-violet-soft);color:var(--color-svv-violet)}');
    clic('[data-filtre-previsite="rdv_edl"]'); await attendre();
    expect(ordre()).toEqual(['C']);
    act(() => root.unmount()); root = createRoot(container);
    await rendre(true);
    expect(ordre()).toEqual(['C']);
    expect(container.querySelector('[data-filtre-previsite="rdv_edl"]')!.getAttribute('aria-pressed')).toBe('true');
  });
  it('fenêtres : les blocs ne RÉTRÉCISSENT jamais (texte jamais coupé) ; la barre de boutons des récapitulatifs est opaque et garde sa place', async () => {
    const { CSS_MODALE_ISSUE } = await import('./ModaleIssue');
    const { CSS_PARCOURS } = await import('./ParcoursPreavisSortie');
    expect(CSS_MODALE_ISSUE).toContain('.mis-boite > *{flex-shrink:0}');
    // la barre collante n'a plus de marge basse négative (elle recouvrait le dernier bloc, même tout en bas)
    const c = CSS_PARCOURS.replace(/\s+/g, ' ');
    expect(c).toContain('.pss-boite .mis-actions{position:sticky;bottom:0;margin:0 -24px;padding:12px 24px 22px;background:var(--color-svv-surface)');
    expect(c).toContain('.mis-boite.pss-boite{padding-bottom:0}');
    expect(c).not.toContain('margin:0 -24px -22px');
    expect(c).not.toContain('calc(-16px - env(safe-area-inset-bottom))');
    // les autres fenêtres en colonne qui défilent : même règle (fiche locataire, tâche de la Gestion)
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('app/(admin)/admin/(protected)/location/ModaleFicheLocataire.tsx', 'utf8')).toContain('.mfl-boite > *{flex-shrink:0}');
    expect(readFileSync('app/(admin)/admin/(protected)/gestion/FenetreTache.tsx', 'utf8')).toContain('.tchf > *{flex-shrink:0}');
  });
});

describe('🔴🔴 Arno (15/11/2026) — tris repliés derrière l’icône « Tris » ; tri chronologique des rendez-vous', () => {
  const PV = (statut: 'alerte' | 'recu' | 'programmee' | 'effectuee' | 'refusee', jour?: string) => ({ statut, rdv: jour ? { jour, heure: '10:00', dureeMinutes: 60 } : null, tacheId: null, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null });
  const EDLS = (jour: string) => ({ edlsId: 1, tacheId: 2, jour, heure: '09:00', dureeMinutes: 60, confieA: 'Arno Test', confieAId: 3, statut: 'acceptee' as const, reponduPar: null, motifRefus: null });
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* rien */ }
    lignes = [
      { ...LIGNES[0], previsite: PV('programmee', '2099-03-01') },   // A : RDV pré-visite loin
      { ...LIGNES[1], previsite: PV('refusee') },                    // B : sans rendez-vous
      { ...LIGNES[2], previsite: PV('effectuee', '2099-01-10'), edls: EDLS('2099-02-01') }, // C : prochain = EDL du 01/02/2099
    ];
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (!init?.method && String(u).includes('preavisEnCours=1')
      ? ok({ disponible: true, etatDesLieux: true, previsite: true, planification: true, lignes }) : (avant as typeof fetch)(u, init))) as unknown as typeof fetch;
  });
  const panneau = () => container.querySelector('[data-panneau-tris]') as HTMLElement;
  it('l’icône « Tris » au BOUT de la rangée « Statut » (≥ 44 px, « Trier la liste ») ; un clic ouvre le panneau avec EXACTEMENT les tris d’avant ; second clic ou « Fermer » le replie', async () => {
    await rendre(true);
    const rangee = container.querySelector('[data-filtres-statut]')!;
    const icone = rangee.lastElementChild as HTMLButtonElement;
    expect(icone.hasAttribute('data-ouvrir-tris')).toBe(true);
    expect([icone.getAttribute('aria-label'), icone.title, icone.getAttribute('aria-expanded')]).toEqual(['Trier la liste', 'Trier la liste', 'false']);
    expect(panneau().hidden).toBe(true);
    expect([...panneau().querySelectorAll('[data-tri]')].map((b) => b.getAttribute('data-tri'))).toEqual(['fin:asc', 'fin:desc', 'edl:asc', 'edl:desc', 'statut:asc', 'statut:desc', 'previsite:asc', 'previsite:desc']);
    act(() => icone.click());
    expect([panneau().hidden, icone.getAttribute('aria-expanded')]).toEqual([false, 'true']);
    act(() => icone.click());
    expect(panneau().hidden).toBe(true);
    act(() => icone.click());
    act(() => (container.querySelector('[data-fermer-tris]') as HTMLButtonElement).click());
    expect(panneau().hidden).toBe(true);
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n');
    expect(css).toContain('.pva-icone-tris{position:relative;display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px');
  });
  it('une pastille sur l’icône quand un tri non standard est actif', async () => {
    await rendre(true);
    expect(container.querySelector('[data-ouvrir-tris] [data-tri-actif]')).toBeNull();
    clic('button[data-tri="edl:desc"]'); await attendre();
    expect(container.querySelector('[data-ouvrir-tris] [data-tri-actif]')).not.toBeNull();
    clic('button[data-tri="fin:asc"]'); await attendre();
    expect(container.querySelector('[data-ouvrir-tris] [data-tri-actif]')).toBeNull();
  });
  it('le tri chronologique : à DROITE de la ligne au-dessus de la liste ; plus proches (défaut) → plus lointains → désactivé ; séparateur « Sans rendez-vous fixé (n) » ; aucune ligne perdue', async () => {
    await rendre(true);
    const b = () => container.querySelector('[data-tri-rdv]') as HTMLButtonElement;
    expect(b().closest('.pva-avant-liste')).not.toBeNull();
    expect([b().getAttribute('data-tri-rdv'), b().textContent]).toEqual(['proches', 'RDV : plus proches d’abord']);
    expect(ordre()).toEqual(['C', 'A', 'B']);
    expect(container.querySelector('[data-separateur-sans-rdv]')!.textContent).toBe('Sans rendez-vous fixé (1)');
    act(() => b().click()); await attendre();
    expect([b().getAttribute('data-tri-rdv'), b().textContent]).toEqual(['lointains', 'RDV : plus lointains d’abord']);
    expect(ordre()).toEqual(['A', 'C', 'B']);
    act(() => b().click()); await attendre();
    expect([b().getAttribute('data-tri-rdv'), b().textContent]).toEqual(['off', 'Tri RDV désactivé']);
    expect(container.querySelector('[data-separateur-sans-rdv]')).toBeNull();
    expect(ordre()).toHaveLength(3);
    act(() => b().click()); await attendre();
    expect(b().getAttribute('data-tri-rdv')).toBe('proches');
  });
  it('actif, il PRIME sur les tris du panneau ; choisir un tri du panneau le désactive ; compatible avec les filtres ; mémorisé', async () => {
    await rendre(true);
    clic('button[data-tri="edl:desc"]'); await attendre();
    expect(container.querySelector('[data-tri-rdv]')!.getAttribute('data-tri-rdv')).toBe('off');
    act(() => (container.querySelector('[data-tri-rdv]') as HTMLButtonElement).click()); await attendre(); // → plus proches
    expect(ordre()).toEqual(['C', 'A', 'B']);
    clic('[data-filtre-previsite="rdv_previsite"]'); await attendre();
    expect(ordre()).toEqual(['A']);
    act(() => (container.querySelector('[data-tri-rdv]') as HTMLButtonElement).click()); await attendre(); // → plus lointains
    act(() => root.unmount()); root = createRoot(container);
    await rendre(true);
    expect(container.querySelector('[data-tri-rdv]')!.getAttribute('data-tri-rdv')).toBe('lointains'); // mémorisé sur l'appareil
  });
});

describe('🔴🔴 Arno (15/11/2026) — le listing sur DEUX lignes, colonnes fixes ; le tri RDV par défaut', () => {
  const PV = (statut: 'alerte' | 'recu' | 'programmee' | 'effectuee' | 'refusee', jour?: string, heure = '10:00') => ({ statut, rdv: jour ? { jour, heure, dureeMinutes: 60 } : null, tacheId: null, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null });
  const EDLS = { edlsId: 1, tacheId: 2, jour: '2099-02-03', heure: '11:30', dureeMinutes: 60, confieA: 'Arno Test', confieAId: 3, statut: 'acceptee' as const, reponduPar: null, motifRefus: null };
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* rien */ }
    lignes = [
      { ...LIGNES[0], previsite: PV('programmee', '2099-01-10', '00:16') },
      { ...LIGNES[1], previsite: PV('effectuee', '2026-11-15', '00:16') },
      { ...LIGNES[2], previsite: PV('effectuee', '2099-01-05'), edls: EDLS },
    ];
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (!init?.method && String(u).includes('preavisEnCours=1')
      ? ok({ disponible: true, etatDesLieux: true, previsite: true, planification: true, lignes }) : (avant as typeof fetch)(u, init))) as unknown as typeof fetch;
  });
  const col = (cle: string, c: string) => container.querySelector(`[data-ligne-preavis="${cle}"] [data-col-${c}]`)!;
  it('ligne 2 : la MÊME grille pour toutes les lignes ; A « Fin de préavis », B le rendez-vous (pré-visite / état des lieux / effectuée), C les détails', async () => {
    await rendre(true);
    for (const cle of ['A', 'B', 'C']) expect([...container.querySelectorAll(`[data-ligne-preavis="${cle}"] .pva-l2 > span`)].map((x) => x.className.split(' ')[0])).toEqual(['pva-col-fin', 'pva-col-rdv', 'pva-col-mission', 'pva-col-loc', 'pva-col-details']);
    expect([col('A', 'rdv').textContent, col('A', 'rdv').getAttribute('data-col-rdv')]).toEqual(['Pré-visite · sam. 10/01 · 00h16', 'previsite']);
    expect([col('C', 'rdv').textContent, col('C', 'rdv').getAttribute('data-col-rdv')]).toEqual(['État des lieux · mar. 03/02 · 11h30', 'edl']);
    expect([col('B', 'rdv').textContent, col('B', 'rdv').getAttribute('data-col-rdv')]).toEqual(['Pré-visite effectuée le 15/11', 'effectuee']);
    // 🔴 (15/11/2026) « confié à Prénom NOM » + l'état de la mission, juste à droite de la date ; la colonne C ne répète plus la date
    expect(col('C', 'mission').textContent).toBe('confié à Arno TESTConfirmé');
    expect(col('C', 'details').textContent).toBe('');
    expect(col('A', 'fin').textContent).toBe('Fin de préavis 01/12/2099');
    // ligne 1 : badge éventuel + nom(s) + adresse ; le cartouche de statut et « Ouvrir » à droite
    const a = container.querySelector('[data-ligne-preavis="A"] .pva-ligne')!;
    expect([...a.children].map((x) => x.className.split(' ')[0])).toEqual(['pva-textes', 'psl-cartouches', 'svv-btn']);
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n');
    expect(css).toContain('.pva-col-rdv--previsite{color:var(--color-svv-sarcelle)}');
    expect(css).toContain('.pva-col-rdv--edl{color:var(--color-svv-violet)}');
  });
  it('le tri RDV : « plus proches d’abord » à la première ouverture ; une valeur d’un ancien format est ignorée ; le libellé dit l’état réel', async () => {
    window.localStorage.setItem('svav.preavis.triRdv:bloc:location', 'off'); // l'ancien format (texte nu, ancienne clé)
    window.localStorage.setItem('svav.preavis.triRdv.v2:bloc:location', 'off'); // une valeur invalide sous la nouvelle clé
    await rendre(true);
    const b = container.querySelector('[data-tri-rdv]') as HTMLButtonElement;
    expect([b.getAttribute('data-tri-rdv'), b.textContent]).toEqual(['proches', 'RDV : plus proches d’abord']);
    // 🔴 (16/11/2026) C se classe par son état des lieux (statut « RDV état des lieux fixé »), plus par sa pré-visite effectuée ; B (pré-visite
    // effectuée) n'a plus de rendez-vous fixé : sous le séparateur
    expect(ordre()).toEqual(['A', 'C', 'B']);
    expect(container.querySelector('[data-separateur-sans-rdv]')!.textContent).toBe('Sans rendez-vous fixé (1)');
  });
  it('🔴🔴 (16/11/2026, constaté en production) pré-visite effectuée → « Sans rendez-vous fixé » ; un RDV DÉPASSÉ (étape pas faite) EN TÊTE avec sa mention rouge ; plus lointains : l’inverse ; aucune ligne perdue', async () => {
    lignes = [
      { ...LIGNES[0], previsite: PV('effectuee', '2020-01-10') }, // le cas MAGNANI : aucun RDV à venir
      { ...LIGNES[1], previsite: PV('programmee', '2020-01-14', '09:30') }, // le cas FAYET : pré-visite passée, sans compte rendu
      { ...LIGNES[2], previsite: PV('effectuee', '2020-01-05'), edls: EDLS },
    ];
    await rendre(true);
    expect(ordre()).toEqual(['B', 'C', 'A']);
    expect(container.querySelector('[data-separateur-sans-rdv]')!.textContent).toBe('Sans rendez-vous fixé (1)');
    const sep = container.querySelector('[data-separateur-sans-rdv]')!;
    expect(sep.compareDocumentPosition(container.querySelector('[data-ligne-preavis="A"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const m = container.querySelector('[data-ligne-preavis="B"] [data-rdv-depassee]')!;
    expect([m.getAttribute('data-rdv-depassee'), m.textContent, m.className]).toEqual(['previsite', 'date dépassée — compte rendu à faire', 'pva-rdv-depassee']);
    expect(m.closest('[data-col-rdv]')!.querySelector('.pva-rdv-date')!.textContent).toBe('Pré-visite · mar. 14/01 · 09h30');
    expect(container.querySelector('[data-ligne-preavis="C"] [data-rdv-depassee]')).toBeNull(); // état des lieux à venir
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n');
    expect(css).toContain('.pva-rdv-depassee{font-size:.72rem;line-height:1.1;font-weight:700;color:var(--color-svv-red)}');
    act(() => (container.querySelector('[data-tri-rdv]') as HTMLButtonElement).click()); await attendre();
    expect(ordre()).toEqual(['C', 'B', 'A']); // plus lointains : l'état des lieux de 2099, puis le RDV dépassé ; le groupe sans RDV inchangé
    act(() => (container.querySelector('[data-tri-rdv]') as HTMLButtonElement).click()); await attendre();
    expect(container.querySelector('[data-separateur-sans-rdv]')).toBeNull(); // désactivé : ordre du panneau, sans séparateur
    expect(ordre().sort()).toEqual(['A', 'B', 'C']);
  });
});

describe('🔴🔴 Arno (15/11/2026) — mission à droite de la date (sans date en double) ; compte rendu en sections', () => {
  const PV = (statut: 'programmee' | 'effectuee', jour: string, collegues: { libelle: string; statut: 'en_attente' | 'acceptee' | 'refusee' | null }[]) =>
    ({ statut, rdv: { jour, heure: '10:30', dureeMinutes: 60 }, tacheId: 9, collegues: collegues.map((c) => ({ collaborateurId: 1, email: null, motif: null, ...c })), tousRefusent: collegues.length > 0 && collegues.every((c) => c.statut === 'refusee'), rdvPasse: false, alerteEnvoyeeLe: null });
  const EDLS = (statut: 'en_attente' | 'acceptee' | 'refusee') => ({ edlsId: 1, tacheId: 2, jour: '2099-02-03', heure: '11:30', dureeMinutes: 60, confieA: 'Claire Test', confieAId: 4, statut, reponduPar: null, motifRefus: null });
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* rien */ }
    lignes = [
      { ...LIGNES[0], previsite: PV('programmee', '2099-01-10', [{ libelle: 'Claire Test', statut: 'en_attente' }]) },
      { ...LIGNES[1], previsite: PV('programmee', '2099-01-12', [{ libelle: 'Arno Test', statut: 'acceptee' }]) },
      { ...LIGNES[2], previsite: PV('effectuee', '2099-01-05', []), edls: EDLS('refusee') },
    ];
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (!init?.method && String(u).includes('preavisEnCours=1')
      ? ok({ disponible: true, etatDesLieux: true, previsite: true, planification: true, lignes }) : (avant as typeof fetch)(u, init))) as unknown as typeof fetch;
  });
  const sel = (cle: string, s: string) => container.querySelector(`[data-ligne-preavis="${cle}"] ${s}`)!;
  it('« confié à Prénom NOM » + cartouche : En attente de confirmation / Confirmé / Refusé — à réattribuer, juste à droite de la date', async () => {
    await rendre(true);
    expect([sel('A', '.pva-confie').textContent, sel('A', '[data-etat-mission]').textContent, sel('A', '[data-etat-mission]').className]).toEqual(['confié à Claire TEST', 'En attente de confirmation', 'pva-etat-mission pva-etat-mission--attente']);
    expect([sel('B', '.pva-confie').textContent, sel('B', '[data-etat-mission]').textContent]).toEqual(['confié à Arno TEST', 'Confirmé']);
    expect([sel('C', '[data-col-rdv]').textContent, sel('C', '.pva-confie').textContent, sel('C', '[data-etat-mission]').textContent]).toEqual(['État des lieux · mar. 03/02 · 11h30', 'confié à Claire TEST', 'Refusé — à réattribuer']);
    // la mission vient juste après la date, dans la même grille pour toutes les lignes
    for (const cle of ['A', 'B', 'C']) expect([...container.querySelectorAll(`[data-ligne-preavis="${cle}"] .pva-l2 > span`)].map((x) => x.className.split(' ')[0])).toEqual(['pva-col-fin', 'pva-col-rdv', 'pva-col-mission', 'pva-col-loc', 'pva-col-details']);
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n');
    expect(css).toContain('.pva-etat-mission--attente{background:var(--color-svv-orange-soft);color:var(--color-svv-orange)}');
    expect(css).toContain('.pva-etat-mission--confirme{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}');
    expect(css).toContain('.pva-etat-mission--refuse{background:var(--color-svv-red-soft);color:var(--color-svv-red)}');
  });
  it('AUCUNE date répétée dans la colonne C (« Pré-visite le … », « EDLS le … », « Pré-visite effectuée le … ») ; le texte complet reste en infobulle', async () => {
    await rendre(true);
    for (const cle of ['A', 'B', 'C']) expect(sel(cle, '[data-col-details]').textContent).not.toMatch(/Pré-visite le|EDLS le|Pré-visite effectuée/);
    expect(sel('B', '[data-col-details]').textContent).toBe('');
    expect(sel('C', '[data-col-details]').textContent).toBe('');
    // seul ce qui n'est affiché nulle part ailleurs reste : la date d'état des lieux saisie au préavis (sans état des lieux planifié)
    expect(sel('A', '[data-col-details]').textContent).toBe('État des lieux le 10/01/2099');
    expect(sel('C', '.pva-textes').getAttribute('title')).toContain('Refusée par Claire Test — à réattribuer');
  });
  it('« Voir le compte rendu » : sections dans l’ordre du formulaire ; une photo et un vocal par ligne ; texte sans signature ; le mail tel qu’envoyé repliable', async () => {
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, edls: null, previsite: { ...PV('effectuee', '2099-01-05', []), compteRendu: true } } : l));
    const CR = { texte: 'Compte rendu de la pré-visite du 05/01/2099 — C rue\n\nEn présence de Alice BERNARD.\n\nLogement propre.\n- Rayure parquet\n\nPhotos\nPhoto 1 — Parquet chambre\nPhoto 2 — Joint douche\n\nMail envoyé par Arnaud JOREL', objet: 'Objet', saisiPar: 'Arnaud JOREL', saisiLe: '2026-11-15T15:49:00Z',
      pieces: [{ id: 71, nom: 'p.jpg', taille: 3 }, { id: 72, nom: 'p.jpg', taille: 3 }], aucunEnvoi: false, corps: 'Logement propre.\n- Rayure parquet',
      presences: { occupations: [11], personnes: [{ civilite: 'Madame', nom: 'Martin', prenom: 'Léa', note: 'mère du locataire' }], locataires: [{ occupationId: 11, civilite: 'Madame', prenom: 'Alice', nom: 'Bernard' }] },
      destinataires: [{ nom: 'Alice BERNARD', famille: 'locataire', quand: '2026-11-15T15:49:00Z', etat: 'envoye', motif: null }, { nom: 'Arnaud JOREL', famille: 'interne', quand: '2026-11-15T15:49:00Z', etat: 'envoye', motif: null }],
      vocaux: [{ id: 81, nom: 'a', taille: 3 }], fichiersVocaux: [{ nom: 'Vocal pour locataire', prises: [{ id: 81, nom: 'a', taille: 3, dureeS: 4 }, { id: 82, nom: 'b', taille: 3, dureeS: 3 }], locataires: true }, { nom: 'Vocal pour agence', prises: [{ id: 83, nom: 'c', taille: 3, dureeS: 5 }] }] };
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (!init?.method && String(u).includes('previsiteCompteRendu=') ? ok(CR) : (avant as typeof fetch)(u, init))) as unknown as typeof fetch;
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    clic('[data-ligne-depliee="C"] [data-voir-compte-rendu="oui"]'); await attendre(); await attendre();
    const f = document.querySelector('[data-fenetre-compte-rendu="envoye"]')!;
    expect([...f.querySelectorAll('[data-cr-section]')].map((x) => x.getAttribute('data-cr-section'))).toEqual(['presence', 'texte', 'photos', 'dictaphone', 'envois']);
    expect([...f.querySelectorAll('.pvv-cr-section-titre')].map((x) => x.textContent)).toEqual(['Présence', 'Texte', 'Photos', 'Dictaphone', 'Envois']);
    // en-tête : objet, adresse en grand, saisi par, état de l'envoi
    expect(f.querySelector('[data-cr-entete] [data-cr-adresse-grande]')!.textContent).toBe('C rue');
    expect(f.querySelector('[data-cr-etat-envoi]')!.textContent).toBe('Envoyé à 2 destinataires');
    expect([...f.querySelectorAll('[data-cr-present]')].map((x) => x.textContent)).toEqual(['Madame Alice BERNARD — locataire', 'Madame Léa MARTIN — personne présente — note interne : mère du locataire']);
    expect(f.querySelector('[data-cr-note-interne]')!.tagName).toBe('EM');
    expect(f.querySelector('[data-cr-texte]')!.textContent).toBe('Logement propre.\n- Rayure parquet');
    // une photo par ligne : miniature à gauche (agrandissable), légende à droite
    const photos = [...f.querySelectorAll('[data-cr-photo]')];
    expect(photos.map((x) => [x.className, x.firstElementChild!.hasAttribute('data-cr-agrandir'), x.querySelector('[data-cr-legende]')!.textContent])).toEqual([
      ['pvv-cr-ligne-photo', true, 'Photo 1 — Parquet chambre'], ['pvv-cr-ligne-photo', true, 'Photo 2 — Joint douche']]);
    // un vocal par ligne : Écouter, titre, durée, étiquette ; les prises en dépliant
    const v = [...f.querySelectorAll('[data-cr-vocal]')];
    expect(v.map((x) => [x.querySelector('[data-cr-vocal-nom]')!.textContent, x.querySelector('[data-cr-vocal-duree]')!.textContent, x.querySelector('[data-cr-vocal-etat]')!.textContent, x.querySelector('[data-cr-vocal-ecouter]') !== null])).toEqual([
      ['Vocal pour locataire', '00:07', 'ENVOYÉ aux locataires', true], ['Vocal pour agence', '00:05', 'NON envoyé (interne)', true]]);
    expect(v[0].querySelector('[data-cr-prises] summary')!.textContent).toBe('2 prises');
    expect(v[0].querySelectorAll('[data-cr-prise]')).toHaveLength(2);
    // envois : locataires (vert) puis interne (gris) ; le mail tel qu'envoyé, repliable, garde la signature
    expect([...f.querySelectorAll('[data-cr-destinataire]')].map((x) => x.getAttribute('data-cr-destinataire'))).toEqual(['locataire', 'interne']);
    expect(f.querySelector('[data-cr-mail-envoye] summary')!.textContent).toBe('Voir le mail tel qu’envoyé');
    expect(f.querySelector('[data-cr-mail-envoye] pre')!.textContent).toContain('Mail envoyé par Arnaud JOREL');
  });
});

describe('🔴🔴 (16/11/2026, responsable location) — « Absence de la partie locataire » et « Compte rendu envoyé aux propriétaires » (écran)', () => {
  const RDV = { jour: '2026-11-13', heure: '13:45', dureeMinutes: 15 };
  let appels: Record<string, unknown>[] = [];
  let destinataires: Record<string, unknown> = {};
  const UN = [{ cle: '5|proprio@exemple.test', proprietaireId: 5, nom: 'DUPONT Jean', email: 'proprio@exemple.test', recette: null }];
  const PLUSIEURS = [...UN, { cle: '5|jean.dupont@exemple.test', proprietaireId: 5, nom: 'DUPONT Jean', email: 'jean.dupont@exemple.test', recette: null },
    { cle: '6|sci@exemple.test', proprietaireId: 6, nom: 'SCI Les Tilleuls', email: 'sci@exemple.test', recette: 'Adresse remplacée en recette : envoyé à a.jorel@sansvisavis.com.' }];
  beforeEach(() => {
    appels = [];
    destinataires = { locataires: [{ nom: 'Alice BERNARD', recette: null }], sansEmail: [], internes: ['a.jorel@sansvisavis.com'], recetteInternes: null,
      proprietaires: UN, proprietairesSansEmail: [], collaborateur: 'Arnaud JOREL' };
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, locataires: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01' }, { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', entree: '2023-01-15' }],
      previsite: { statut: 'programmee', rdv: RDV, tacheId: 9, collegues: [], tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null } } : l));
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      if (!init?.method && String(u).includes('previsiteDestinataires=')) return ok(destinataires);
      if (init?.method === 'POST') {
        const c = JSON.parse(String(init.body)) as Record<string, unknown>;
        if (c.action === 'apercu-compte-rendu-previsite') {
          appels.push(c);
          const phrase = (c.presences as { absence?: boolean }).absence ? 'Pré-visite réalisée en l’absence des locataires, par Arnaud JOREL (Sans Vis-à-Vis / CRITERIMMO).' : 'En présence de Alice BERNARD.';
          return ok({ mails: [{ sorte: 'previsite_compte_rendu', objet: 'CR', a: ['a.jorel@sansvisavis.com'], cc: [], texte: `${phrase}\n\nCR.`, famille: 'interne' },
            { sorte: 'previsite_compte_rendu', objet: 'CR', a: ['proprio@exemple.test'], cc: [], texte: `Bonjour DUPONT Jean,\n\n${phrase}\n\n- CR.`, famille: 'proprietaire', destinataire: 'DUPONT Jean' },
            { sorte: 'previsite_compte_rendu', objet: 'CR', a: ['alice@exemple.test'], cc: [], texte: `Madame, Monsieur,\n\n${phrase}\n\n- CR.`, famille: 'locataire', destinataire: 'Alice BERNARD' }],
          sansEmail: [], phrase });
        }
      }
      return (avant as typeof fetch)(u, init);
    }) as unknown as typeof fetch;
  });
  afterEach(() => { vi.restoreAllMocks(); });
  const ouvrirCr = async () => { await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre(); await suivreLienCr(); await attendre(); };
  const taper = (v: string) => act(() => { const t = document.querySelector('[data-corps-compte-rendu]') as HTMLTextAreaElement; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(t, v); t.dispatchEvent(new Event('input', { bubbles: true })); });
  const cases = () => [...document.querySelectorAll('[data-presence-locataire]')] as HTMLInputElement[];
  const recap = async () => { act(() => (document.querySelector('[data-recap-previsite]') as HTMLButtonElement).click()); await attendre(); await attendre(); };

  it('« Absence de la partie locataire » toujours proposée sous les locataires ; cochée : les cases des locataires décochées et GRISÉES, le collaborateur présent ; décochée : l’état d’avant revient', async () => {
    await ouvrirCr();
    const absence = document.querySelector('[data-absence-locataires]') as HTMLInputElement;
    expect(absence).not.toBeNull(); expect(absence.checked).toBe(false);
    expect(absence.closest('[data-presence-absence]')!.textContent).toContain('Absence de la partie locataire');
    // l'absence vient APRÈS les locataires
    const lis = [...document.querySelectorAll('[data-cr-locataires] > li')];
    expect(lis.findIndex((x) => x.hasAttribute('data-presence-absence'))).toBe(2);
    act(() => cases()[0].click());
    expect(cases().map((c) => c.checked)).toEqual([true, false]);
    act(() => absence.click());
    expect(cases().map((c) => [c.checked, c.disabled])).toEqual([[false, true], [false, true]]);
    expect(document.querySelector('[data-presence-collaborateur]')!.textContent).toBe('Arnaud JOREL collaborateur — présent (Sans Vis-à-Vis / CRITERIMMO)');
    // les personnes ajoutées restent possibles
    expect((document.querySelector('[data-ajouter-personne]') as HTMLButtonElement).disabled).toBe(false);
    act(() => absence.click());
    expect(cases().map((c) => [c.checked, c.disabled])).toEqual([[true, false], [false, false]]);
    expect(document.querySelector('[data-presence-collaborateur]')).toBeNull();
    const css = (await import('./CompteRenduSaisie')).CSS_COMPTE_RENDU_SAISIE.replace(/\s+/g, ' ');
    expect(css).toContain('.pvv-presence:has(input:disabled){opacity:.5');
  });
  it('validation : sans personne cochée ni absence, refus ; absence seule : le récapitulatif part (présences { absence })', async () => {
    await ouvrirCr(); taper('CR.');
    await recap();
    expect(appels).toEqual([]);
    expect(document.querySelector('[data-presence-motif]')!.textContent).toBe('Cochez au moins une personne présente à la pré-visite, ou « Absence de la partie locataire ».');
    act(() => (document.querySelector('[data-absence-locataires]') as HTMLInputElement).click());
    await recap();
    expect(appels).toHaveLength(1);
    expect(appels[0].presences).toEqual({ occupations: [], personnes: [], absence: true });
    expect(appels[0].proprietaires).toBeNull();
    expect(document.querySelector('[data-fenetre-previsite="recap"]')).not.toBeNull();
  });
  it('« Compte rendu envoyé aux propriétaires » : sous celui des locataires, même style, DÉSACTIVÉ par défaut (creux) ; activé : plein, une adresse seule cochée d’office', async () => {
    await ouvrirCr();
    const b = document.querySelector('[data-aussi-proprietaires]') as HTMLButtonElement;
    const blocs = [...document.querySelectorAll('[data-bloc-envoi-locataires], [data-bloc-envoi-proprietaires]')].map((x) => (x.hasAttribute('data-bloc-envoi-locataires') ? 'locataires' : 'proprietaires'));
    expect(blocs).toEqual(['locataires', 'proprietaires']);
    expect(b.getAttribute('aria-pressed')).toBe('false'); expect(b.className).toContain('svv-btn-outline');
    expect(b.textContent).toBe('Compte rendu NON envoyé aux propriétaires');
    expect(document.querySelector('[data-destinataires-proprietaires]')).toBeNull();
    act(() => b.click());
    expect(b.getAttribute('aria-pressed')).toBe('true'); expect(b.className).toContain('svv-btn-primary');
    expect(b.textContent!.trim()).toBe('Compte rendu envoyé aux propriétaires');
    const lignesP = [...document.querySelectorAll('[data-destinataire-liste="proprietaire"]')];
    expect(lignesP.map((x) => [x.querySelector('[data-adresse-email]')!.textContent, x.querySelector('[data-adresse-nom]')!.textContent, x.className]))
      .toEqual([['proprio@exemple.test', 'DUPONT Jean', 'pvv-dest pvv-dest--proprietaire']]);
    expect((lignesP[0].querySelector('input') as HTMLInputElement).checked).toBe(true);
    const css = (await import('./CompteRenduSaisie')).CSS_COMPTE_RENDU_SAISIE.replace(/\s+/g, ' ');
    expect(css).toContain('.pvv-dest--proprietaire{--pvv-dest:var(--color-svv-red)}');
  });
  it('plusieurs adresses : une ligne chacune, toutes cochées, décochables une par une ; un propriétaire sans adresse grisé ; la dernière décochée désactive le bouton', async () => {
    destinataires = { ...destinataires, proprietaires: PLUSIEURS, proprietairesSansEmail: ['MARTIN Paul'] };
    await ouvrirCr(); taper('CR.');
    act(() => (document.querySelector('[data-aussi-proprietaires]') as HTMLButtonElement).click());
    const boites = () => [...document.querySelectorAll('[data-adresse-proprietaire]')] as HTMLInputElement[];
    expect(boites().map((x) => [x.getAttribute('data-adresse-proprietaire'), x.checked])).toEqual([['5|proprio@exemple.test', true], ['5|jean.dupont@exemple.test', true], ['6|sci@exemple.test', true]]);
    expect(document.querySelector('[data-proprietaire-sans-adresse]')!.textContent).toBe('MARTIN Paulaucune adresse mail — compléter la fiche');
    expect(document.querySelector('[data-proprietaire-sans-adresse]')!.className).toContain('pvv-dest--sans');
    expect(document.querySelector('[data-destinataire-recette]')!.textContent).toContain('Adresse remplacée en recette');
    act(() => boites()[1].click());
    expect(boites().map((x) => x.checked)).toEqual([true, false, true]);
    // le récapitulatif reçoit les seules adresses cochées
    act(() => cases()[0].click());
    await recap();
    expect(appels[0].proprietaires).toEqual({ adresses: [{ proprietaireId: 5, email: 'proprio@exemple.test' }, { proprietaireId: 6, email: 'sci@exemple.test' }] });
    // l'ordre des cartes : locataires → propriétaires → interne
    expect([...document.querySelectorAll('[data-mails-prevus] [data-etiquette-famille]')].map((x) => x.getAttribute('data-etiquette-famille'))).toEqual(['locataire', 'proprietaire', 'interne']);
    act(() => (document.querySelector('[data-revenir-previsite]') as HTMLButtonElement).click()); await attendre();
    act(() => boites()[0].click()); act(() => boites()[2].click());
    expect(document.querySelector('[data-aussi-proprietaires]')!.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('[data-destinataires-proprietaires]')).toBeNull();
  });
  it('« Voir le compte rendu » : section PRÉSENCE « Locataires absents », puis le collaborateur et les personnes ajoutées ; le propriétaire dans les envois', async () => {
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'effectuee', rdv: RDV, tacheId: 9, collegues: [], tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null, compteRendu: true } } : l));
    const CR = { texte: 'Compte rendu de la pré-visite du 13/11/2026 — C rue\n\nPré-visite réalisée en l’absence des locataires, par Arnaud JOREL (Sans Vis-à-Vis / CRITERIMMO).\n\nLogement propre.',
      objet: 'CR', saisiPar: 'Arnaud JOREL', saisiLe: '2026-11-13T15:13:00Z', pieces: [], aucunEnvoi: false,
      destinataires: [{ nom: 'DUPONT Jean', famille: 'proprietaire', quand: '2026-11-13T15:13:00Z', etat: 'envoye', motif: null }],
      presences: { occupations: [], locataires: [], personnes: [{ civilite: 'Madame', prenom: 'Léa', nom: 'Martin', note: '' }], absence: { par: 'Arnaud JOREL' } } };
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (!init?.method && String(u).includes('previsiteCompteRendu=') ? ok(CR) : (avant as typeof fetch)(u, init))) as unknown as typeof fetch;
    await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre();
    clic('[data-ligne-depliee="C"] [data-voir-compte-rendu="oui"]'); await attendre(); await attendre();
    const sec = document.querySelector('[data-cr-section="presence"]')!;
    expect(sec.querySelector('[data-cr-locataires-absents]')!.textContent).toBe('Locataires absents');
    expect([...sec.querySelectorAll('[data-cr-present]')].map((x) => [x.getAttribute('data-cr-present'), x.textContent])).toEqual([
      ['collaborateur', 'Arnaud JOREL — collaborateur (Sans Vis-à-Vis / CRITERIMMO)'], ['personne', 'Madame Léa MARTIN — personne présente']]);
    expect(document.querySelector('[data-cr-texte]')!.textContent).toBe('Logement propre.');
    expect(document.querySelector('[data-cr-destinataire="proprietaire"]')!.textContent).toContain('DUPONT Jean');
  });
});

describe('🔴🔴 Arno (16/11/2026) — la pré-visite ET l’état des lieux fixés en même temps : deux statuts, deux rendez-vous, les deux filtres', () => {
  const PV = (statut: 'programmee' | 'effectuee' | 'refusee' | 'recu', jour: string, collegues: { libelle: string; statut: 'en_attente' | 'acceptee' | 'refusee' | null }[] = []) =>
    ({ statut, rdv: statut === 'recu' || statut === 'refusee' ? null : { jour, heure: '10:30', dureeMinutes: 60 }, tacheId: 9, collegues: collegues.map((c) => ({ collaborateurId: 1, email: null, motif: null, ...c })),
      tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null });
  const EDLS = (jour: string, statut: 'en_attente' | 'acceptee' | 'refusee' = 'en_attente') => ({ edlsId: 1, tacheId: 2, jour, heure: '11:30', dureeMinutes: 60, confieA: 'Claire Test', confieAId: 4, statut, reponduPar: null, motifRefus: null });
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* rien */ }
    lignes = [
      { ...LIGNES[0], previsite: PV('programmee', '2099-01-10', [{ libelle: 'Arno Test', statut: 'acceptee' }]), edls: EDLS('2099-02-03') },
      { ...LIGNES[1], previsite: PV('effectuee', '2099-01-05'), edls: EDLS('2099-01-20', 'acceptee') },
      { ...LIGNES[2], previsite: PV('refusee', ''), edls: EDLS('2099-01-07') },
    ];
    const avant = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (!init?.method && String(u).includes('preavisEnCours=1')
      ? ok({ disponible: true, etatDesLieux: true, previsite: true, planification: true, lignes }) : (avant as typeof fetch)(u, init))) as unknown as typeof fetch;
  });
  const sel = (cle: string, s: string) => container.querySelector(`[data-ligne-preavis="${cle}"] ${s}`)!;
  const statuts = (cle: string) => [...container.querySelectorAll(`[data-ligne-preavis="${cle}"] [data-statut-ligne]`)].map((x) => x.getAttribute('data-statut-ligne'));
  const ordre = () => [...container.querySelectorAll('[data-ligne-preavis]')].map((x) => x.getAttribute('data-ligne-preavis'));

  it('DEUX cartouches de statut côte à côte (pré-visite programmée + état des lieux) ; effectuée ou refusée : un seul', async () => {
    await rendre(true);
    expect(statuts('A')).toEqual(['rdv_previsite', 'rdv_edl']);
    expect([...container.querySelectorAll('[data-ligne-preavis="A"] [data-statut-ligne]')].map((x) => x.textContent)).toEqual(['RDV pré-visite fixé', 'RDV état des lieux fixé']);
    expect(statuts('B')).toEqual(['rdv_edl']);
    expect(statuts('C')).toEqual(['rdv_edl']);
    // dans le même conteneur, à droite
    expect(sel('A', '[data-cartouches-ligne]').querySelectorAll('[data-statut-ligne]')).toHaveLength(2);
  });
  it('les deux dates l’une sous l’autre (pré-visite puis état des lieux), chacune avec « confié à … » et son cartouche, sur les colonnes communes', async () => {
    await rendre(true);
    const deux = sel('A', '[data-col-rdv="deux"]');
    expect([...deux.children].map((x) => x.className)).toEqual(['pva-rdv-item pva-col-rdv--previsite', 'pva-col-mission', 'pva-col-loc', 'pva-rdv-item pva-col-rdv--edl', 'pva-col-mission', 'pva-col-loc']);
    expect([...deux.querySelectorAll('.pva-rdv-date')].map((x) => x.textContent)).toEqual(['Pré-visite · sam. 10/01 · 10h30', 'État des lieux · mar. 03/02 · 11h30']);
    expect([...deux.querySelectorAll('.pva-confie')].map((x) => x.textContent)).toEqual(['confié à Arno TEST', 'confié à Claire TEST']);
    expect([...deux.querySelectorAll('[data-etat-mission]')].map((x) => x.textContent)).toEqual(['Confirmé', 'En attente de confirmation']);
    expect([...container.querySelectorAll('[data-ligne-preavis="A"] .pva-l2 > span')].map((x) => x.className.split(' ')[0])).toEqual(['pva-col-fin', 'pva-col-rdv', 'pva-col-details']);
    expect(sel('A', '.pva-ligne').className).toBe('pva-ligne pva-ligne--deux-rdv');
    // les lignes à un seul rendez-vous : inchangées
    expect([...container.querySelectorAll('[data-ligne-preavis="B"] .pva-l2 > span')].map((x) => x.className.split(' ')[0])).toEqual(['pva-col-fin', 'pva-col-rdv', 'pva-col-mission', 'pva-col-loc', 'pva-col-details']);
    expect(sel('B', '.pva-ligne').className).toBe('pva-ligne');
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n').replace(/\s+/g, ' ');
    expect(css).toContain('.pva-col-rdv--deux{grid-column:span 3;display:grid;grid-template-columns:subgrid;');
    expect(css).toContain('.pva-col-rdv--deux > *{order:0}');
  });
  it('la mention rouge « date dépassée » sur chaque rendez-vous concerné', async () => {
    lignes = lignes.map((l) => (l.cle === 'A' ? { ...l, previsite: PV('programmee', '2020-01-10'), edls: EDLS('2020-02-03') } : l));
    await rendre(true);
    expect([...sel('A', '[data-col-rdv="deux"]').querySelectorAll('[data-rdv-depassee]')].map((x) => [x.getAttribute('data-rdv-depassee'), x.textContent]))
      .toEqual([['previsite', 'date dépassée — compte rendu à faire'], ['edl', 'date dépassée — sortie à valider']]);
  });
  it('FILTRES : la ligne comptée et visible dans les deux ; « Tous » ne la compte qu’une fois', async () => {
    await rendre(true);
    const n = (f: string) => container.querySelector(`[data-compteur-previsite="${f}"]`)!.textContent;
    expect([n('rdv_previsite'), n('rdv_edl')]).toEqual(['1', '3']);
    expect(container.querySelector('[data-filtre-previsite="tous"]')!.textContent).toBe('Tous (3)');
    clic('[data-filtre-previsite="rdv_previsite"]'); await attendre();
    expect(ordre()).toEqual(['A']);
    clic('[data-filtre-previsite="rdv_previsite"]'); clic('[data-filtre-previsite="rdv_edl"]'); await attendre();
    expect(ordre().sort()).toEqual(['A', 'B', 'C']);
    clic('[data-filtre-previsite="rdv_previsite"]'); await attendre(); // les deux filtres : la ligne une seule fois
    expect(ordre().sort()).toEqual(['A', 'B', 'C']);
  });
  it('TRI RDV : datée par son prochain rendez-vous non réalisé (la pré-visite), dans les « Rendez-vous fixés »', async () => {
    await rendre(true);
    // C : état des lieux le 07/01 ; A : pré-visite le 10/01 (son état des lieux le 03/02) ; B : état des lieux le 20/01
    expect(ordre()).toEqual(['C', 'A', 'B']);
    expect(container.querySelector('[data-separateur-sans-rdv]')).toBeNull();
  });
  it('FRISE : cartouche VERT en case 2 (pré-visite) ET en case 3 (état des lieux), chacun avec « Prénom NOM : … » dessous', async () => {
    await rendre(true);
    clic('button[data-ouvrir-preavis="A"]'); await attendre();
    const c2 = sel('A', '[data-etape="previsite"] [data-previsite-etat]');
    expect([c2.className, c2.textContent]).toEqual(['pvv-etat pvv-etat--programmee', 'Pré-visite programmée — le 10/01/2099 de 10h30 à 11h30']);
    expect(sel('A', '[data-etape="previsite"] [data-previsite-collegues]').textContent).toBe('Arno TEST : acceptée');
    const c3 = sel('A', '[data-etape="edls"] [data-edls-cartouche]');
    expect([c3.className, c3.textContent]).toEqual(['pvv-etat pvv-etat--programmee', 'État des lieux programmé — le 03/02/2099 de 11h30 à 12h30']);
    expect(sel('A', '[data-etape="edls"] [data-edls-collegue]').textContent).toBe('Claire TEST : en attente');
  });
  it('« Planifier l’état des lieux de sortie » présent et ACTIF avec une pré-visite seulement programmée ; le formulaire s’ouvre', async () => {
    lignes = lignes.map((l) => (l.cle === 'A' ? { ...l, edls: null } : l));
    await rendre(true);
    expect(statuts('A')).toEqual(['rdv_previsite']);
    clic('button[data-ouvrir-preavis="A"]'); await attendre();
    const b = sel('A', '[data-planifier-edls]') as HTMLButtonElement;
    expect(b.disabled).toBe(false);
    act(() => b.click()); await attendre();
    expect(sel('A', '[data-formulaire-edls]').getAttribute('data-formulaire-edls')).toBe('planifier');
  });
});

describe('🔴🔴 Arno (16/11/2026, 475) — « Valider la sortie », case 20 % cochée : les dates d’AG de la copropriété', () => {
  let luAg: Record<string, unknown> = {};
  const LU = (o: Record<string, unknown> = {}) => ({ disponible: true, lotId: 7, copropriete: { id: 7, libelle: 'Résidence Fictive' }, immeuble: 'Résidence Fictive',
    coproprieteSaisie: true, suggestions: [], adresse: '4 rue Fictive', moi: 'Arnaud Jorel',
    proposition: { derniere: { date: '2026-03-12', par: 'Claire Test', le: '2026-04-01T10:00:00.000Z' }, prochaine: { date: '2027-03-12', statut: null, mention: 'projection — généralement à la même période chaque année', par: null, le: null } }, ...o });
  const ouvrir = async (): Promise<Element> => {
    const base = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      const s = String(u);
      if (s.includes('agSortie=')) return ok(luAg);
      if (s.includes('retenueSortie=')) return ok({ lotId: 7, copropriete: 'coproprieteSaisie' in luAg ? luAg.coproprieteSaisie : true });
      if (s.includes('partenairesSortie=')) return ok({ enGestion: false, liste: [] });
      if (init?.method === 'POST' && String(init.body).includes('apercu-validation-sortie')) {
        const c = JSON.parse(String(init.body)) as Record<string, unknown>; posts.push(c);
        return ok({ date: HIER, vacant: true, enGestion: false, sansEmail: [], alertes: [], retenue: true, mails: [],
          ag: { lignes: [['Dernière AGO (assemblée générale ordinaire)', '12/03/2026'], ['Prochaine AGO', '12/03/2027 (date projetée)']], copropriete: 'Résidence Fictive', aRattacher: false } });
      }
      return base(u, init);
    }) as unknown as typeof fetch;
    await rendre(true);
    clic('button[data-ouvrir-preavis="C"]');
    clic('button[data-valider-sortie]');
    await attendre(); await attendre(); await attendre();
    const f = document.querySelector('[data-fenetre-validation-sortie]')!;
    act(() => (f.querySelector('input[data-edls-realise]') as HTMLInputElement).click());
    act(() => saisir(f.querySelector('input[data-date-sortie-effective]') as HTMLInputElement, HIER));
    return f;
  };
  const q = (s: string) => document.querySelector(s) as HTMLElement;
  const recap = () => document.querySelector('button[data-recap-validation]') as HTMLButtonElement;
  beforeEach(() => { luAg = LU(); });

  it('🔴 (Arno, 17/11/2026) « Dernière AGO connue (assemblée générale ordinaire) * », « Prochaine AGO * » et la phrase d’aide « Seule l’AGO compte … »', async () => {
    await ouvrir();
    expect([...document.querySelectorAll('[data-ag-sortie] .pvs-libelle')].map((x) => x.textContent).filter((t) => /AGO/.test(t ?? '')))
      .toEqual(['Dernière AGO connue (assemblée générale ordinaire) *', 'Prochaine AGO *']);
    expect(q('[data-ag-aide-ago]').textContent).toBe('Seule l’AGO compte : c’est l’assemblée qui clôture les comptes de la copropriété.');
  });

  it('préremplies depuis l’historique : la dernière AG (« saisie par … le … »), la prochaine à + 1 an avec « projection — … » ; aucun statut choisi', async () => {
    await ouvrir();
    expect((q('input[data-ag-derniere]') as HTMLInputElement).value).toBe('2026-03-12');
    expect(q('[data-ag-derniere-auteur]').textContent).toContain('saisie par Claire TEST le 01/04/2026');
    expect((q('input[data-ag-prochaine]') as HTMLInputElement).value).toBe('2027-03-12');
    expect(q('[data-ag-projection]').textContent).toBe('projection — généralement à la même période chaque année');
    expect([...document.querySelectorAll('[data-ag-statut-choix]')].map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['Date projetée', 'false'], ['Date officielle', 'false']]);
    expect(q('[data-ag-prochaine-auteur]').textContent).toBe('renseignée par Arnaud JOREL');
    expect(q('[data-ag-copropriete]').textContent).toContain('Résidence Fictive');
  });
  it('🔴 statut OBLIGATOIRE : « Voir le récapitulatif » fermé, message clair, statut en rouge ; choisi : ouvert, et les dates partent avec l’aperçu', async () => {
    await ouvrir();
    expect(recap().disabled).toBe(true);
    expect(q('[data-ag-message]').textContent).toBe('Choisissez le statut de la prochaine AGO : « Date projetée » ou « Date officielle ».');
    expect(q('[data-ag-statut]').className).toContain('vag-defaut');
    act(() => q('[data-ag-statut-choix="projetee"]').click());
    expect(recap().disabled).toBe(false);
    act(() => q('[data-ag-confirmer]').click());
    expect(q('[data-ag-confirmee]').textContent).toBe('✓ confirmée comme référence');
    await act(async () => { recap().click(); }); await attendre();
    expect(posts.at(-1)).toMatchObject({ retenue: true, ag: { derniere: '2026-03-12', derniereConfirmee: true, prochaine: '2027-03-12', statut: 'projetee' }, mentionAg: false });
    expect([...document.querySelectorAll('[data-resume-ag]')].map((x) => x.textContent)).toEqual(['Dernière AGO (assemblée générale ordinaire)12/03/2026', 'Prochaine AGO12/03/2027 (date projetée)']);
    expect(q('[data-resume-ag-copropriete]').textContent).toBe('CopropriétéRésidence Fictive');
  });
  it('rien de connu : dernière AG vide, en rouge, bloquante ; la saisir propose la prochaine à + 1 an', async () => {
    luAg = LU({ proposition: { derniere: null, prochaine: null } });
    await ouvrir();
    expect((q('input[data-ag-derniere]') as HTMLInputElement).value).toBe('');
    expect(q('input[data-ag-derniere]').getAttribute('aria-invalid')).toBe('true');
    expect(q('[data-ag-message]').textContent).toBe('Renseignez la date de la dernière AGO connue (assemblée générale ordinaire).');
    expect(recap().disabled).toBe(true);
    act(() => saisir(q('input[data-ag-derniere]') as HTMLInputElement, '2026-05-20'));
    expect((q('input[data-ag-prochaine]') as HTMLInputElement).value).toBe('2027-05-20');
  });
  it('🔴 (Arno, 17/11/2026) projection PÉRIMÉE (dernière AGO 12/03/2015) : champ VIDE, la fenêtre d’alerte, sortie bloquée ; « Fermer » laisse vide ; une projetée passée refusée dans la fenêtre ; une officielle reportée', async () => {
    luAg = LU({ proposition: { derniere: { date: '2015-03-12', par: 'Claire Test', le: '2026-04-01T10:00:00.000Z' }, prochaine: null, projectionPerimee: '2016-03-12' } });
    await ouvrir();
    expect((q('input[data-ag-prochaine]') as HTMLInputElement).value).toBe('');
    expect(q('[data-ag-alerte-projection] [aria-modal="true"]')).not.toBeNull();
    expect(q('[data-ag-alerte-texte]').textContent).toBe('La prochaine AGO calculée, le 12/03/2016, est déjà passée : une AGO plus récente a sans doute eu lieu.');
    expect(recap().disabled).toBe(true);
    act(() => { q('[data-ag-alerte-fermer]').click(); });
    expect(q('[data-ag-alerte-projection]')).toBeNull();
    expect((q('input[data-ag-prochaine]') as HTMLInputElement).value).toBe('');
    expect(recap().disabled).toBe(true);
    // la même fenêtre si l’on tape soi-même une date projetée déjà passée
    act(() => { q('[data-ag-statut-choix="projetee"]').click(); });
    act(() => saisir(q('input[data-ag-prochaine]') as HTMLInputElement, '2016-03-12'));
    expect((q('input[data-ag-prochaine]') as HTMLInputElement).value).toBe('');
    expect(q('[data-ag-alerte-texte]').textContent).toContain('La date projetée de la prochaine AGO, le 12/03/2016, est déjà passée');
    // dans la fenêtre : une projetée passée refusée ; une officielle (même passée) reportée dans le champ
    act(() => saisir(q('input[data-ag-alerte-date]') as HTMLInputElement, '2016-03-12'));
    act(() => { q('[data-ag-alerte-statut="projetee"]').click(); });
    act(() => { q('[data-ag-alerte-reporter]').click(); });
    expect(q('[data-ag-alerte-motif]').textContent).toContain('Une date projetée doit être à venir');
    act(() => { q('[data-ag-alerte-statut="officielle"]').click(); });
    act(() => { q('[data-ag-alerte-reporter]').click(); });
    expect(q('[data-ag-alerte-projection]')).toBeNull();
    expect((q('input[data-ag-prochaine]') as HTMLInputElement).value).toBe('2016-03-12');
    expect(q('[data-ag-statut-choix="officielle"]').getAttribute('aria-pressed')).toBe('true');
    expect(recap().disabled).toBe(false);
  });
  it('🔴 (Arno, 17/11/2026) saisir une dernière AGO ancienne : la projection passée n’est pas reprise, la fenêtre s’ouvre', async () => {
    luAg = LU({ proposition: { derniere: null, prochaine: null } });
    await ouvrir();
    act(() => saisir(q('input[data-ag-derniere]') as HTMLInputElement, '2015-03-12'));
    expect((q('input[data-ag-prochaine]') as HTMLInputElement).value).toBe('');
    expect(q('[data-ag-alerte-texte]').textContent).toBe('La prochaine AGO calculée, le 12/03/2016, est déjà passée : une AGO plus récente a sans doute eu lieu.');
  });
  it('une prochaine AG OFFICIELLE déjà connue : proposée en priorité, statut officielle, avec qui l’a saisie', async () => {
    luAg = LU({ proposition: { derniere: { date: '2026-03-12', par: 'Claire Test', le: '2026-04-01T10:00:00.000Z' }, prochaine: { date: '2027-04-02', statut: 'officielle', mention: null, par: 'Paul Syndic', le: '2026-10-01T09:00:00.000Z' } } });
    await ouvrir();
    expect((q('input[data-ag-prochaine]') as HTMLInputElement).value).toBe('2027-04-02');
    expect(q('[data-ag-statut-choix="officielle"]').getAttribute('aria-pressed')).toBe('true');
    expect(q('[data-ag-prochaine-auteur]').textContent).toBe('date officielle déjà connue — renseignée par Paul SYNDIC le 01/10/2026');
    expect(document.querySelector('[data-ag-projection]')).toBeNull();
    expect(recap().disabled).toBe(false);
  });
  it('« Mentionner … l’assemblée générale de mars 2027 » : le paragraphe des locataires et la phrase des propriétaires la portent ; décoché : retirée', async () => {
    await ouvrir();
    act(() => (q('[data-ag-mention] input') as HTMLInputElement).click());
    expect((q('textarea[data-retenue-paragraphe]') as HTMLTextAreaElement).value).toContain('couvrant votre période d’occupation, prévue en principe lors de l’assemblée générale ordinaire de mars 2027.');
    expect(q('[data-retenue-proprietaires]').textContent).toContain('approbation des comptes de la copropriété, prévue en principe lors de l’assemblée générale ordinaire de mars 2027.');
    act(() => (q('[data-ag-mention] input') as HTMLInputElement).click());
    expect((q('textarea[data-retenue-paragraphe]') as HTMLTextAreaElement).value).not.toContain('assemblée générale');
  });
  it('un bien relié à AUCUNE copropriété : la rattacher (celles qui couvrent son adresse), en créer une, ou « à rattacher » ; copropriété non renseignée : « Immeuble en copropriété » proposé, le bandeau reste', async () => {
    luAg = LU({ copropriete: null, coproprieteSaisie: null, suggestions: [{ id: 7, libelle: 'Résidence Fictive' }] });
    await ouvrir();
    expect(q('[data-retenue-a-verifier]')).not.toBeNull(); // « Copropriété non renseignée sur la fiche du bien » reste
    act(() => (q('[data-retenue-case]') as HTMLInputElement).click()); // non renseigné : case décochée au départ
    expect((q('[data-ag-copro-choisie="7"]') as HTMLInputElement).checked).toBe(true);
    act(() => (q('[data-ag-copro-oui] input') as HTMLInputElement).click());
    act(() => q('[data-ag-statut-choix="officielle"]').click());
    await act(async () => { recap().click(); }); await attendre();
    expect(posts.at(-1)).toMatchObject({ coproprieteChoix: { rattacher: 7 }, coproprieteOui: true, ag: { statut: 'officielle' } });
    act(() => (document.querySelector('button[data-revenir-validation]') as HTMLButtonElement).click());
    act(() => (q('[data-ag-copro="aucune"]') as HTMLInputElement).click());
    expect(q('[data-ag-a-rattacher]').textContent).toBe('Les dates seront enregistrées avec la sortie, à rattacher à une copropriété.');
    act(() => (q('[data-ag-copro="creer"]') as HTMLInputElement).click());
    expect((q('input[data-ag-copro-nom]') as HTMLInputElement).value).toBe('4 rue Fictive');
    expect(document.querySelectorAll('[data-fenetre-validation-sortie] select')).toHaveLength(0);
  });
  it('case 20 % décochée : aucune date demandée ; historique non installé : la fenêtre le dit, rien n’est bloqué', async () => {
    await ouvrir();
    act(() => (q('[data-retenue-case]') as HTMLInputElement).click());
    expect(document.querySelector('[data-ag-sortie]')).toBeNull();
    expect(recap().disabled).toBe(false);
    act(() => root.unmount()); root = createRoot(container);
    luAg = { disponible: false, lotId: 7 };
    await ouvrir();
    expect(q('[data-ag-indisponible]').textContent).toContain('migration 475');
    expect(recap().disabled).toBe(false);
  });
});

describe('🔴 Arno (18/11/2026) — le bloc des LOCATAIRES sous les informations du rendez-vous, pleine largeur (jamais une colonne de la case)', () => {
  it('pré-visite et état des lieux : dans la zone des informations, sous le cartouche du collègue ; jamais enfant direct de la case', async () => {
    planification = true;
    const etat = { etat: 'attente', par: null, main: false, reponses: [{ occupationId: 11, nom: 'Alice BERNARD', reponse: null, le: null }] } as const;
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l,
      previsite: { statut: 'programmee', rdv: { jour: '2099-01-05', heure: '10:00', dureeMinutes: 60 }, tacheId: 40, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null },
      edls: { edlsId: 1, tacheId: 41, jour: '2099-01-06', heure: '14:00', dureeMinutes: 60, confieA: 'Claire Test', confieAId: 4, statut: 'en_attente', reponduPar: null, motifRefus: null },
      reponsesRdv: { previsite: { ...etat, reponses: [...etat.reponses] }, edl: { ...etat, reponses: [...etat.reponses] }, disponible: true } } : l));
    await rendre(true);
    clic('button[data-ouvrir-preavis="C"]');
    await attendre();
    for (const sorte of ['previsite', 'edl']) {
      const b = container.querySelector(`[data-rdv-locataires="${sorte}"]`)!;
      expect(b, sorte).not.toBeNull();
      expect(b.closest('.frp-infos'), `${sorte} dans les informations`).not.toBeNull();
      expect(b.parentElement?.classList.contains('frp-etape')).toBe(false);
      expect(b.classList.contains('pva-bloc')).toBe(false);
      expect(b.querySelector('[data-cartouche-locataires]')?.textContent).toBe('Locataires : En attente');
    }
  });
});

describe('🔴 Arno (18/11/2026, option 1) — « Valider le rendez-vous sans prévenir les locataires » : seulement tant que le rendez-vous est à venir', () => {
  const etat = () => ({ etat: 'attente', par: null, main: false, reponses: [{ occupationId: 11, nom: 'Alice BERNARD', reponse: null, le: null }] } as const);
  const poser = (pv: 'avenir' | 'passe' | 'effectuee', jourEdl: string) => {
    planification = true;
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l,
      previsite: { statut: pv === 'effectuee' ? 'effectuee' : 'programmee', rdv: { jour: pv === 'avenir' ? '2099-01-05' : '2020-01-05', heure: '10:00', dureeMinutes: 60 },
        tacheId: 40, collegues: [], tousRefusent: false, rdvPasse: pv !== 'avenir', alerteEnvoyeeLe: null },
      edls: { edlsId: 1, tacheId: 41, jour: jourEdl, heure: '14:00', dureeMinutes: 60, confieA: 'Claire Test', confieAId: 4, statut: 'en_attente', reponduPar: null, motifRefus: null },
      reponsesRdv: { previsite: { ...etat(), reponses: [...etat().reponses] }, edl: { ...etat(), reponses: [...etat().reponses] }, disponible: true } } : l));
  };
  const voir = async () => { await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre(); };
  it('à venir : le bouton est là (pré-visite et état des lieux)', async () => {
    poser('avenir', '2099-01-06');
    await voir();
    for (const s of ['previsite', 'edl']) expect(container.querySelector(`[data-rdv-locataires="${s}"] [data-valider-rdv-main]`), s).not.toBeNull();
  });
  it('effectuée, ou passé : plus de bouton ; le cartouche et la liste des réponses restent', async () => {
    for (const pv of ['effectuee', 'passe'] as const) {
      poser(pv, '2020-01-06');
      await voir();
      for (const s of ['previsite', 'edl']) {
        const b = container.querySelector(`[data-rdv-locataires="${s}"]`)!;
        expect(b.querySelector('[data-valider-rdv-main]'), `${pv} ${s}`).toBeNull();
        expect(b.querySelector('[data-cartouche-locataires]')?.textContent).toBe('Locataires : En attente');
        expect(b.querySelector('[data-reponse-locataire]')?.textContent).toBe('Alice BERNARD : pas encore répondu');
      }
      act(() => root.unmount()); root = createRoot(container);
    }
  });
});

describe('🔴 Arno (18/11/2026) — le statut des LOCATAIRES dans la ligne repliée, et la réponse de chacun dans l’encart « ① LOCATAIRE »', () => {
  const rep = (occupationId: number, nom: string, reponse: 'accepte' | 'refuse' | null, le: string | null = null) => ({ occupationId, nom, reponse, le });
  const pv = { statut: 'programmee' as const, rdv: { jour: '2099-01-05', heure: '09:53', dureeMinutes: 60 }, tacheId: 40, collegues: [{ libelle: 'Arno Test', statut: 'acceptee' as const }],
    tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null };
  const poser = (etat: unknown) => { lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: pv, reponsesRdv: { previsite: etat as never, edl: null, disponible: true } } as unknown as LignePreavisAccueil : l)); };
  const court = () => container.querySelector('[data-ligne-preavis="C"] .pva-ligne [data-cartouche-locataires-court]');
  it.each([
    ['attente', { etat: 'attente', par: null, main: false, reponses: [rep(11, 'Alice BERNARD', null)] }, 'Locataires : En attente'],
    ['confirmé par un locataire', { etat: 'confirme', par: 'Alice BERNARD', main: false, reponses: [rep(11, 'Alice BERNARD', 'accepte', '2026-11-18T21:40:00.000Z')] }, 'Locataires : Confirmé'],
    ['« Non » (sans demande)', { etat: 'confirme', par: 'Arnaud JOREL', main: true, sansDemande: true, parLe: '2026-11-18T22:01:00.000Z', reponses: [] }, 'Locataires : Confirmé'],
    ['refusé', { etat: 'refuse', par: null, main: false, reponses: [rep(11, 'Alice BERNARD', 'refuse'), rep(12, 'Paul BERNARD', 'refuse')] }, 'Locataires : Refusé'],
  ])('ligne repliée — %s : le mot écrit, à droite de la mission, AUCUN nom de locataire', async (_n, etat, mot) => {
    poser(etat);
    await rendre();
    const c = court()!;
    expect(c.textContent).toBe(mot);
    expect(c.closest('.pva-col-loc')?.previousElementSibling?.classList.contains('pva-col-mission')).toBe(true);
    const ligne = container.querySelector('[data-ligne-preavis="C"] .pva-l2')!.textContent!;
    for (const nom of ['Alice', 'Paul', 'BERNARD', 'JOREL']) expect(ligne).not.toContain(nom);
  });
  it('ligne repliée — aucun cartouche sans rendez-vous fixé', async () => {
    await rendre();
    expect(container.querySelectorAll('[data-cartouche-locataires-court]')).toHaveLength(0);
  });
  it('encart dépliée — chaque locataire a son état (avec la date et le rendez-vous) ; « Non » : une seule mention, avec qui l’a confirmé', async () => {
    poser({ etat: 'confirme', par: 'Alice BERNARD', main: false, reponses: [rep(11, 'Alice BERNARD', 'accepte', '2026-11-18T21:40:00.000Z'), rep(12, 'Paul BERNARD', null)] });
    await rendre();
    clic('button[data-ouvrir-preavis="C"]');
    await attendre(); await attendre();
    const t = (o: number) => [...container.querySelectorAll(`[data-reponse-rdv-locataire="${o}"]`)].map((x) => x.textContent);
    expect(t(11)).toEqual(['Pré-visite du 05/01 à 09h53 : A accepté le rendez-vous — le 18/11 à 22h40']);
    expect(t(12)).toEqual(['Pré-visite du 05/01 à 09h53 : En attente de réponse']);
  });
});


describe('🔴 Arno (18/11/2026) — minutes 00/15/30/45, « Locataires : Non sollicités », « Fixer une pré-visite » après un refus', () => {
  const ouvrirC = async () => { await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre(); };
  it('le formulaire de l’état des lieux : heures « 10h » dans la plage (début 8h à 20h, fin jusqu’à 21h ; 20h et 21h : 00 seulement), minutes 00/15/30/45', async () => {
    planification = true;
    await ouvrirC();
    clic('[data-planifier-edls]'); await attendre();
    const f = container.querySelector('[data-formulaire-edls]')!;
    expect(f.querySelectorAll('input[type="time"]')).toHaveLength(0);
    const ouvrirListe = (el: Element, sel: string): string[] => {
      const c = el.querySelector(sel) as HTMLElement;
      act(() => c.click());
      const l = [...c.closest('.lch')!.querySelectorAll('li[data-option]')].map((x) => x.textContent?.replace('✓', '') ?? '');
      act(() => c.click());
      return l;
    };
    const debut = f.querySelector('[data-edls-debut]')!;
    const fin = f.querySelector('[data-edls-fin]')!;
    expect(ouvrirListe(debut, '[data-heure]')).toEqual(['h', '8h', '9h', '10h', '11h', '12h', '13h', '14h', '15h', '16h', '17h', '18h', '19h', '20h']);
    expect(ouvrirListe(fin, '[data-heure]')).toEqual(['h', '8h', '9h', '10h', '11h', '12h', '13h', '14h', '15h', '16h', '17h', '18h', '19h', '20h', '21h']);
    choisirHeureDans(debut, '20', null);
    expect(ouvrirListe(debut, '[data-minute]')).toEqual(['min', '00']);
    choisirHeureDans(fin, '21', null);
    expect(ouvrirListe(fin, '[data-minute]')).toEqual(['min', '00']);
    choisirHeureDans(fin, '08', null);
    expect(ouvrirListe(fin, '[data-minute]')).toEqual(['min', '15', '30', '45']);
    choisirHeureDans(debut, '10', null);
    expect(ouvrirListe(debut, '[data-minute]')).toEqual(['min', '00', '15', '30', '45']);
  });
  it('20h00 – 21h00 : accepté par l’écran (le bouton s’active) ; un rendez-vous existant à 22h00 s’affiche tel quel', async () => {
    planification = true;
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, edls: { edlsId: 1, tacheId: 41, jour: '2099-01-06', heure: '22:00', dureeMinutes: 60, confieA: 'Claire Test', confieAId: 4,
      statut: 'en_attente', reponduPar: null, motifRefus: null } } : l));
    await ouvrirC();
    expect(container.querySelector('[data-edls-cartouche]')?.textContent).toContain('22h00');
    clic('[data-deplacer-edls]'); await attendre();
    const d = container.querySelector('[data-edls-debut]')!;
    expect(d.getAttribute('data-valeur')).toBe('');
    act(() => saisir(d as HTMLInputElement, '20:00'));
    act(() => saisir(container.querySelector('[data-edls-fin]') as HTMLInputElement, '21:00'));
    act(() => { (container.querySelector('[data-inviter-locataires="oui"]') as HTMLButtonElement).click(); });
    expect(container.querySelector('[data-edls-fin]')?.getAttribute('data-valeur')).toBe('21:00');
    expect((container.querySelector('button[data-valider-edls]') as HTMLButtonElement).disabled).toBe(false);
  });
  it('un rendez-vous existant à 09h53 s’affiche tel quel ; en le déplaçant, la minute est à choisir parmi les quatre (aucun arrondi)', async () => {
    planification = true;
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, edls: { edlsId: 1, tacheId: 41, jour: '2099-01-06', heure: '09:53', dureeMinutes: 60, confieA: 'Claire Test', confieAId: 4,
      statut: 'en_attente', reponduPar: null, motifRefus: null } } : l));
    await ouvrirC();
    expect(container.querySelector('[data-ligne-preavis="C"] .pva-rdv-date')?.textContent).toContain('09h53');
    expect(container.querySelector('[data-edls-cartouche]')?.textContent).toContain('09h53');
    clic('[data-deplacer-edls]'); await attendre();
    const d = container.querySelector('[data-edls-debut]')!;
    expect(d.querySelector('[data-heure]')?.getAttribute('data-valeur')).toBe('09');
    expect(d.querySelector('[data-minute]')?.getAttribute('data-valeur')).toBe('');
    expect(d.getAttribute('data-valeur')).toBe('');
    expect((container.querySelector('button[data-valider-edls]') as HTMLButtonElement).disabled).toBe(true);
  });
  it('ligne repliée : « Locataires : Non sollicités » (gris) pour un rendez-vous non sollicité et non confirmé, sans nom', async () => {
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { statut: 'programmee', rdv: { jour: '2099-01-05', heure: '10:00', dureeMinutes: 60 }, tacheId: 40, collegues: [],
      tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null }, reponsesRdv: { previsite: { etat: 'non_invites', par: null, main: false, reponses: [] }, edl: null, disponible: true } } as unknown as LignePreavisAccueil : l));
    await rendre();
    const c = container.querySelector('[data-ligne-preavis="C"] [data-cartouche-locataires-court]')!;
    expect(c.textContent).toBe('Locataires : Non sollicités');
    expect(c.className).toContain('pva-loc--non_invites');
    expect(CSS_PREAVIS_ACCUEIL).toMatch(/\.pva-loc--non_invites\{[^}]*color:var\(--color-svv-muted\)/);
  });
  it('après un « Refus / absence » : « Fixer une pré-visite » (le formulaire habituel, avec le choix Oui / Non) ; fixée ensuite : la mention discrète', async () => {
    const refusee = { statut: 'refusee', rdv: null, tacheId: null, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null, refusLe: '2026-11-15T09:00:00Z', rdvFixeLe: null };
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: refusee } as unknown as LignePreavisAccueil : l));
    await ouvrirC();
    const b = container.querySelector('[data-rdv-previsite]') as HTMLButtonElement;
    expect(b.textContent).toBe('Fixer une pré-visite');
    act(() => b.click()); await attendre();
    expect(document.querySelector('[data-fenetre-previsite] [data-choix-locataires]')).not.toBeNull();
    expect(document.querySelector('[data-fenetre-previsite] [data-previsite-debut][data-choix-heure]')).not.toBeNull();
    act(() => root.unmount()); root = createRoot(container); document.querySelectorAll('.mis-voile').forEach((n) => n.remove());
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { ...refusee, statut: 'programmee', rdv: { jour: '2099-01-05', heure: '10:00', dureeMinutes: 60 }, tacheId: 40,
      rdvFixeLe: '2026-11-18T21:00:00Z' } } as unknown as LignePreavisAccueil : l));
    await ouvrirC();
    expect(container.querySelector('[data-refus-avant]')?.textContent).toBe('Refus / absence signalé le 15/11/2026 — pré-visite fixée ensuite le 18/11/2026');
    expect(container.querySelector('[data-rdv-previsite]')).toBeNull(); // programmée : « Déplacer la pré-visite », comme d'habitude
  });
});

describe('🔴 Arno (19/11/2026) — libellés des rendez-vous', () => {
  it('« Modifier / déplacer la pré-visite », « Modifier / déplacer l’état des lieux », « Valider le rendez-vous sans demander de confirmation aux locataires »', async () => {
    planification = true;
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l,
      previsite: { statut: 'programmee', rdv: { jour: '2099-01-05', heure: '10:00', dureeMinutes: 60 }, tacheId: 40, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null },
      edls: { edlsId: 1, tacheId: 41, jour: '2099-01-06', heure: '14:00', dureeMinutes: 60, confieA: 'Claire Test', confieAId: 4, statut: 'en_attente', reponduPar: null, motifRefus: null },
      reponsesRdv: { previsite: { etat: 'attente', par: null, main: false, reponses: [] }, edl: null, disponible: true } } as unknown as LignePreavisAccueil : l));
    await rendre(true);
    clic('button[data-ouvrir-preavis="C"]');
    await attendre();
    expect(container.querySelector('[data-deplacer-previsite]')?.textContent).toBe('Modifier / déplacer la pré-visite');
    expect(container.querySelector('[data-deplacer-edls]')?.textContent).toBe('Modifier / déplacer l’état des lieux');
    expect(container.querySelector('[data-rdv-locataires="previsite"] [data-valider-rdv-main]')?.textContent).toBe('Valider le rendez-vous sans demander de confirmation aux locataires');
  });
});


describe('🔴 Arno (19/11/2026) — règles uniformes des rendez-vous : A (collègues), J (passé), F (fenêtre de confirmation)', () => {
  const pvAvenir = { statut: 'programmee', rdv: { jour: '2099-01-05', heure: '10:00', dureeMinutes: 60 }, tacheId: 40,
    collegues: [{ collaborateurId: 3, libelle: 'Arno Test', email: null, statut: 'acceptee', motif: null }], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null };
  const poser = (pv: unknown, jourEdl: string) => {
    planification = true;
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: pv,
      edls: { edlsId: 1, tacheId: 41, jour: jourEdl, heure: '14:00', dureeMinutes: 60, confieA: 'Claire Test', confieAId: 4, statut: 'en_attente', reponduPar: null, motifRefus: null },
      reponsesRdv: { previsite: { etat: 'attente', par: null, main: false, reponses: [{ occupationId: 11, nom: 'Alice BERNARD', reponse: null, le: null }] }, edl: null, disponible: true } } as unknown as LignePreavisAccueil : l));
  };
  const voir = async () => { await rendre(true); clic('button[data-ouvrir-preavis="C"]'); await attendre(); };
  it('A — « Modifier / déplacer la pré-visite » : les collègues du rendez-vous cochés au départ, modifiables', async () => {
    poser(pvAvenir, '2099-01-06');
    global.fetch = ((orig) => vi.fn(async (u: string | URL | Request, init?: RequestInit) => (String(u).includes('previsiteCollegues=1')
      ? ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data: [{ id: 3, libelle: 'Arno Test', accesGestion: true }, { id: 4, libelle: 'Claire Test', accesGestion: true }] }) }) as unknown as Response
      : orig(u, init))))(global.fetch) as unknown as typeof fetch;
    await voir();
    clic('[data-deplacer-previsite]'); await attendre(); await attendre();
    const cases = [...document.querySelectorAll('[data-fenetre-previsite] [data-destinataire]')] as HTMLInputElement[];
    expect(cases.map((c) => [c.getAttribute('data-destinataire'), c.checked])).toEqual([['3', true], ['4', false]]);
  });
  it('J — passé : plus de « Modifier / déplacer » (pré-visite ni état des lieux) ; l’existant reste affiché', async () => {
    poser({ ...pvAvenir, rdv: { jour: '2020-01-05', heure: '10:00', dureeMinutes: 60 }, rdvPasse: true }, '2020-01-06');
    await voir();
    expect(container.querySelector('[data-deplacer-previsite]')).toBeNull();
    expect(container.querySelector('[data-deplacer-edls]')).toBeNull();
    expect(container.querySelector('[data-edls-cartouche]')?.textContent).toContain('06/01/2020');
  });
  it('F — « Valider le rendez-vous sans demander de confirmation aux locataires » : la fenêtre de confirmation (une phrase, « OK »), clavier', async () => {
    poser(pvAvenir, '2099-01-06');
    await voir();
    clic('[data-rdv-locataires="previsite"] [data-valider-rdv-main]');
    await attendre();
    const m = document.querySelector('[data-modale-confirmation] [role="alertdialog"]')!;
    expect(m).not.toBeNull();
    expect(document.querySelector('[data-phrase-confirmation]')?.textContent).toBe('La pré-visite est confirmée côté locataires, sans leur demander de confirmation.');
    expect(document.activeElement?.hasAttribute('data-ok-confirmation')).toBe(true);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(document.querySelector('[data-modale-confirmation]')).toBeNull();
  });
});
