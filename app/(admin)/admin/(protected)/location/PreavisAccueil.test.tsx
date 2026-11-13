// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BlocPreavisAccueil, CLE_TRI, CSS_PREAVIS_ACCUEIL } from './PreavisAccueil';
import { FicheInterventionPreavis } from './FicheInterventionPreavis';
import { ficheDepuisEncart, texteFicheIntervention } from '../../../../lib/location/ficheIntervention';
import { AccueilLocation } from './AccueilLocation';
import { EcranSortieLocataire } from './SortieLocataires';
import { SectionLocationLocataire } from '../gestion/SectionsLocationFiche';
import type { BailLogement, EncartLogement } from '../../../../lib/location/sortieLocataires';
import type { LignePreavisAccueil } from '../../../../lib/location/preavis';

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
beforeEach(() => {
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

const attendre = async (): Promise<void> => { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); };
async function rendre(gestion = true): Promise<void> {
  await act(async () => { root.render(createElement(BlocPreavisAccueil, { gestion })); });
  await attendre();
}
const ordre = (): string[] => [...container.querySelectorAll('[data-ligne-preavis]')].map((li) => li.getAttribute('data-ligne-preavis')!);
const clic = (sel: string): void => act(() => (container.querySelector(sel) as HTMLButtonElement).click());
function saisir(el: HTMLInputElement, v: string): void {
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
  it('hauteur CONSTANTE : une hauteur fixe (bureau et téléphone), deux lignes de texte tronquées, texte complet en infobulle', async () => {
    const regle = (sel: string, css: string): string => new RegExp(`${sel.replace('.', '\\.')}\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    const [bureau, mobile] = CSS_PREAVIS_ACCUEIL.split('@media');
    expect(regle('.pva-ligne', bureau)).toMatch(/(^|;)height:4\.75rem/);
    expect(regle('.pva-ligne', mobile)).toMatch(/(^|;)height:6\.25rem/);
    expect(CSS_PREAVIS_ACCUEIL).not.toMatch(/\.pva-ligne\{[^}]*min-height/);
    expect(CSS_PREAVIS_ACCUEIL).toMatch(/\.pva-noms,\.pva-detail\{[^}]*white-space:nowrap;overflow:hidden;text-overflow:ellipsis/);
    await rendre();
    const a = container.querySelector('[data-ligne-preavis="A"]')!;
    expect(a.querySelector('.pva-noms')?.getAttribute('title')).toBe('BERNARD Alice, BERNARD Paul');
    expect(a.querySelector('.pva-detail')?.textContent).toBe('A rue · Fin de préavis le 01/12/2099 · État des lieux le 10/01/2099');
    expect(container.querySelector('[data-ligne-preavis="B"] .pva-detail')?.textContent).toBe('B rue · Fin de préavis le 01/01/2020');
    expect(a.querySelectorAll('.pva-textes > span')).toHaveLength(2);
    expect(container.querySelector('[data-nombre-preavis]')?.textContent).toBe('3');
  });

  it('mention orange AVEC LE MOT : « en préavis » ; date passée → « Préavis échu — sortie à saisir »', async () => {
    await rendre();
    expect(container.querySelector('[data-ligne-preavis="A"] [data-preavis]')?.textContent).toBe('en préavis');
    expect(container.querySelector('[data-ligne-preavis="B"] [data-preavis]')?.textContent).toBe('Préavis échu — sortie à saisir');
    expect(container.querySelector('[data-ligne-preavis="B"] [data-preavis]')?.getAttribute('data-preavis')).toBe('echu');
    // Arno (19/10/2026) : « en préavis » en BLEU (plus d'orange) ; l'échu garde sa couleur d'alerte.
    expect(container.querySelector('[data-ligne-preavis="A"] [data-preavis]')?.className).toBe('pvs-mention pvs-mention--en_preavis');
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
    expect(ordre()).toEqual(['B', 'C', 'A']);
    expect(container.querySelector('button[data-tri="fin:asc"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelectorAll('button.pva-segment[aria-pressed="true"]')).toHaveLength(1);
    clic('button[data-tri="fin:desc"]');
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
    expect(champ('fin').value).toBe('11:00');
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
    await act(async () => { (container.querySelector('button[data-valider-edls]') as HTMLButtonElement).click(); });
    expect(posts.at(-1)).toEqual({ action: 'planifier-edls', occupationIds: [11, 12], jour: '2099-11-05', debut: '10:00', fin: '11:00', confieA: 4, commentaire: '' });
    const ligne = container.querySelector('[data-ligne-preavis="C"]')!;
    expect(ligne.querySelector('[data-preavis="edls"]')?.textContent).toBe('EDLS planifié');
    expect(ligne.querySelector('[data-preavis="edls"]')?.className).toBe('pvs-mention pvs-mention--en_preavis');
    expect(ligne.querySelector('.pva-detail')?.textContent).toContain('EDLS le 05/11/2099 à 10h00 — confié à Claire Test — en attente de confirmation');
  });

  it('confié à soi : « accepté » d’office (le module de tâches inscrit directement dans l’agenda, sans demande)', async () => {
    const { acceptationInitiale } = await import('../../../../lib/gestion/acceptationTache');
    expect(acceptationInitiale(3, 3)).toBe('acceptee');
    statutPose = 'acceptee';
    await ouvrirPlanif();
    act(() => saisir(champ('jour'), '2099-11-05'));
    act(() => saisir(champ('debut'), '10:00'));
    await act(async () => { (container.querySelector('button[data-valider-edls]') as HTMLButtonElement).click(); });
    expect(container.querySelector('[data-ligne-preavis="C"] .pva-detail')?.textContent).toContain('confié à Arno Test — accepté');
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
    expect(champ('fin').value).toBe('11:00');
    act(() => saisir(champ('jour'), '2099-11-06'));
    act(() => saisir(champ('debut'), '14:00'));
    act(() => saisir(champ('fin'), '15:30'));
    await act(async () => { (container.querySelector('button[data-valider-edls]') as HTMLButtonElement).click(); });
    expect(posts.at(-1)).toEqual({ action: 'deplacer-edls', occupationIds: [11, 12], jour: '2099-11-06', debut: '14:00', fin: '15:30', confieA: 4 });
    expect(container.querySelector('[data-ligne-preavis="C"] .pva-detail')?.textContent).toContain('EDLS le 06/11/2099 à 14h00 — confié à Claire Test — en attente de confirmation');
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
    expect(posts.at(-1)).toEqual({ action: 'reattribuer-edls', occupationIds: [11, 12], confieA: 3 });
    expect(container.querySelector('[data-ligne-preavis="C"] .pva-detail')?.textContent).toContain('confié à Arno Test — en attente de confirmation');
  });

  it('préavis échu : l’alerte garde la priorité même avec un EDLS planifié', async () => {
    planification = true;
    lignes = lignes.map((l) => (l.cle === 'B' ? { ...l, edls: { ...EDLS, jour: '2020-01-10' } } : l));
    await rendre();
    expect(container.querySelector('[data-ligne-preavis="B"] [data-preavis]')?.textContent).toBe('Préavis échu — sortie à saisir');
    expect(container.querySelector('[data-ligne-preavis="B"] .pva-detail')?.textContent).toContain('EDLS le 10/01/2020 à 10h00');
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
    // Le CSS : une grille partagée (subgrid) — en-tête, informations, boutons à la même hauteur d'une case à l'autre ; boutons pleine largeur.
    const css = CSS_PREAVIS_ACCUEIL.replace(/\s+/g, ' ');
    expect(css).toContain('.frp-etape{display:grid;grid-row:span 3;grid-template-rows:subgrid;');
    expect(css).toContain('.frp-etape > .pva-bloc{grid-row:2 / span 2;display:grid;grid-template-rows:subgrid;');
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
    const m = container.querySelector('[data-ligne-depliee="C"] [data-edls-mention]')!;
    expect(m.className).toBe('pva-edls');
    expect(CSS_PREAVIS_ACCUEIL.replace(/\s+/g, ' ')).toContain('.pva-edls{margin:0;padding:8px 10px;border-radius:10px;background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);');
    expect(sous('edls')).toEqual(['étape en cours']);
    act(() => root.unmount()); root = createRoot(container);
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, edls: { ...l.edls!, statut: 'refusee' as const, reponduPar: 'Claire Test' } } : l));
    await ouvrir();
    expect(container.querySelector('[data-ligne-depliee="C"] [data-edls-mention]')!.className).toContain('pva-edls--refus');
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
    expect(f.querySelector('[data-cr-texte]')!.textContent).toBe(CR.texte);
    expect(f.querySelector('[data-cr-saisi]')!.textContent).toBe('Saisi par Arnaud Jorel le 13/11/2026 à 13h52');
    expect(f.querySelector('[data-cr-piece="41"]')!.getAttribute('href')).toBe('/api/admin/location/pieces-sortie?piece=41');
    const d = [...f.querySelectorAll('[data-cr-destinataire]')].map((x) => [x.getAttribute('data-cr-destinataire'), x.querySelector('.pvv-cr-nom')!.textContent,
      x.querySelector('.pvv-cr-quand')!.textContent, x.querySelector('.pvv-cr-etat')!.textContent]);
    expect(d).toEqual([['locataire', 'Alice BERNARD', 'le 13/11/2026 à 13h52', 'envoyé'], ['locataire', 'Paul BERNARD', '—', 'non envoyé (pas d’adresse e-mail)'],
      ['interne', 'Claire Test', 'le 13/11/2026 à 13h52', 'échec (boîte pleine)']]);
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
  it('?previsite=11&geste=compte-rendu : la ligne s’ouvre ET le formulaire « Compte rendu pré-visite » est déjà ouvert ; le paramètre est retiré de l’adresse', async () => {
    programmeeCommencee();
    window.history.replaceState(null, '', '/admin/location?previsite=11&geste=compte-rendu');
    await rendre(true); await attendre(); await attendre();
    expect(container.querySelector('[data-ligne-depliee="C"]')).not.toBeNull();
    const f = document.querySelector('[data-fenetre-previsite="saisie"][data-geste-previsite="compte_rendu"]');
    expect(f).not.toBeNull();
    expect(f!.querySelector('[data-corps-compte-rendu]')).not.toBeNull();
    expect(window.location.search).toBe('?previsite=11');
    act(() => (document.querySelector('[data-annuler-previsite]') as HTMLButtonElement).click());
  });
  it('sans « geste » : la ligne s’ouvre seulement (comme avant) ; rendez-vous pas commencé : le formulaire ne s’ouvre pas', async () => {
    programmeeCommencee();
    window.history.replaceState(null, '', '/admin/location?previsite=11');
    await rendre(true); await attendre();
    expect(document.querySelector('[data-fenetre-previsite]')).toBeNull();
    act(() => root.unmount()); root = createRoot(container);
    lignes = lignes.map((l) => (l.cle === 'C' ? { ...l, previsite: { ...l.previsite!, rdvPasse: false } } : l));
    window.history.replaceState(null, '', '/admin/location?previsite=11&geste=compte-rendu');
    await rendre(true); await attendre();
    expect(document.querySelector('[data-fenetre-previsite]')).toBeNull();
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
