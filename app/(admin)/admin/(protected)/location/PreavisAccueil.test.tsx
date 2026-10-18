// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BlocPreavisAccueil, CLE_TRI, CSS_PREAVIS_ACCUEIL } from './PreavisAccueil';
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

  it('« Valider la sortie » : LA confirmation commune (action `sortie-locataires`), puis la ligne disparaît', async () => {
    await rendre(true);
    clic('button[data-ouvrir-preavis="C"]');
    clic('button[data-valider-sortie]');
    await attendre();
    const conf = container.querySelector('[data-ligne-depliee="C"] [data-recapitulatif]')!;
    expect([...conf.querySelectorAll('[data-sortant]')].map((l) => l.getAttribute('data-sortant'))).toEqual(['11', '12']);
    act(() => saisir(conf.querySelector('input[data-date-sortie]') as HTMLInputElement, HIER));
    await act(async () => { (conf.querySelector('button[data-confirmer]') as HTMLButtonElement).click(); });
    await attendre();
    expect(posts.at(-1)).toEqual({ action: 'sortie-locataires', occupationId: 11, sortants: [11, 12], date: HIER });
    expect(ordre()).toEqual(['B', 'A']);
    expect(container.querySelector('[data-preavis-bilan]')?.textContent).toContain('Sortie enregistrée — BERNARD Alice, BERNARD Paul.');
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
  it('l’encart de l’écran de sortie (même composant) avec les coordonnées, et les dates du préavis ; les champs absents ne s’affichent pas', async () => {
    await rendre();
    clic('button[data-ouvrir-preavis="C"]');
    await attendre();
    const infos = container.querySelector('[data-ligne-depliee="C"] [data-infos-logement]')!;
    const encart = infos.querySelector('[data-encart-logement]')!;
    expect(encart.querySelector('h3')?.textContent).toBe('4 rue Fictive, 92800 Puteaux');
    for (const cle of ['batiment', 'etage', 'porte', 'acces', 'digicode', 'ascenseur', 'proprietaire']) expect(encart.querySelector(`[data-ligne="${cle}"]`), cle).not.toBeNull();
    expect(encart.querySelector('[data-ligne="escalier"]')).toBeNull();
    expect(encart.querySelector('[data-ligne="digicode"] dd')?.textContent).toBe('4521A');
    expect([...encart.querySelectorAll('[data-lots-du-bail] li')].map((li) => li.textContent)).toEqual(['Appartement T3 · 3e étage · porte G · lot n° 100', 'Parking · sous-sol 1 · place 12']);
    const coords = encart.querySelector('[data-coordonnees]')!;
    expect(coords.querySelector('[data-coord-proprietaire]')?.textContent).toContain('06 11 22 33 44');
    expect(coords.querySelector('[data-coord-locataire="101"]')?.textContent).toContain('alice@exemple.test');
    expect(coords.querySelector('[data-coord-locataire="102"]')).toBeNull();
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
  const choisir = (el: HTMLSelectElement, v: string) => act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

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
    expect([...container.querySelectorAll('select[data-confier-a] option')].map((o) => o.textContent)).toEqual(['Arno Test', 'Claire Test']);
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => String(c[0]).includes('edlsConfiables=1'))).toBe(true);
  });

  it('« Planifier » : la ligne passe AUSSITÔT à « EDLS planifié » — confié à X, en attente de confirmation (bleu)', async () => {
    await ouvrirPlanif();
    act(() => saisir(champ('jour'), '2099-11-05'));
    act(() => saisir(champ('debut'), '10:00'));
    choisir(container.querySelector('select[data-confier-a]') as HTMLSelectElement, '4');
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
    expect([...container.querySelectorAll('[data-formulaire-reattribuer] option')].map((o) => o.textContent)).toEqual(['Arno Test']);
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
