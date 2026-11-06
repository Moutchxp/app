// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { EcranAjouterLocatairesAVenir, EcranSortieLocataire, EcranSortieRecherche, libelleFaireSortir } from './SortieLocataires';
import { EcranLocataires } from './EcransLocation';
import type { BailLogement, EncartLogement } from '../../../../lib/location/sortieLocataires';

const ENCART: EncartLogement & { locataireCle: string | null; lotCle: string } = {
  lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', type: 'Appartement T3', meuble: true, etage: '3', porte: 'G', numLotCopro: '27',
  numeroLot: '100', batiment: null, escalier: null, surfaceCarrez: 41.8, surfaceHabitable: null, surface: null, surfaceExterieure: null,
  nombrePieces: 3, ascenseur: true, digicode: null, digicodeCode: null, precisionAcces: null, dpeClasse: null, dpeDate: null, dpeNonSoumis: null,
  chauffage: null, epoqueConstruction: null,
  lots: [
    { lotId: 7, role: 'logement', type: 'Appartement T3', etage: '3', numLotCopro: '27', numeroLot: '100', porte: 'G', place: false },
    { lotId: 8, role: 'annexe', type: 'Cave', etage: '-1', numLotCopro: null, numeroLot: '101', porte: '7', place: false },
    { lotId: 9, role: 'annexe', type: 'Parking · intérieur', etage: null, numLotCopro: null, numeroLot: null, porte: '12', place: true },
  ],
  proprietaire: { id: 5, nom: 'DUPONT Jean' }, syndic: 'Syndic Exemple',
  bail: { entree: '2022-09-01', loyerHc: 1250, provisions: null, taux: 6, base: 'hc' },
  locataireCle: 'W-101', lotCle: '100',
};

/**
 * SORTIE D'UN OU PLUSIEURS LOCATAIRES (Arno, 19/10/2026) — les VRAIS composants, routes simulées : rien ne part.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Le composant PARTAGÉ de l'historique, observé : on vérifie que l'écran de sortie le monte tel quel, en lecture seule. */
const blocHistorique = vi.fn();
vi.mock('../gestion/BlocHistoriqueEchanges', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../gestion/BlocHistoriqueEchanges')>()),
  useFichePersonne: () => ({ fiche: { titre: 'BERNARD Alice', sousTitre: null, adresses: ['alice@exemple.test'], occupations: [] }, erreur: null }),
  BlocHistoriqueEchanges: (p: Record<string, unknown>) => { blocHistorique(p); return createElement('div', { 'data-stub': 'historique-partage' }); },
}));

const ok = (data: unknown, extra: Record<string, unknown> = {}) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data, ...extra }) }) as unknown as Response;
const BAIL: BailLogement = {
  lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', type: 'Appartement', etage: '3', porte: 'G', proprietaire: 'DUPONT Jean', entree: '2022-09-01',
  locataires: [
    { occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01' },
    { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', entree: '2022-09-01' },
  ],
  annexes: [{ lotId: 8, libelle: 'Cave n° 7', occupations: [{ occupationId: 21, locataireId: 101 }] }], autresOccupants: [],
};

/** Hier, à Paris : une date de sortie valide quel que soit le jour où la suite tourne (le futur est refusé). */
const HIER = (() => { const d = new Date(Date.now() - 86_400_000); return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }); })();
const HIER_FR = HIER.split('-').reverse().join('/');
/** La lecture du préavis d'un bail (migration 383 appliquée), sans préavis ouvert. */
const PREAVIS = { disponible: true, meuble: false, zoneTendue: true, dureeProposee: 1, raison: 'logement vide en zone tendue',
  locataires: [
    { occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01', preavis: null },
    { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', entree: '2022-09-01', preavis: null },
  ] };

/** Arno (05/11/2026) — l'aperçu des mails du préavis, tel que la route `apercu-preavis` le rend (simulé : rien ne part). */
const APERCU = {
  mails: [{ sorte: 'preavis_locataires', de: 'gestion@criterimmo.fr', a: ['alice@exemple.test'], cc: ['gestion@criterimmo.fr', 'moi@exemple.test'],
    objet: 'Accusé de réception de votre congé — 4 rue Fictive, 92800 Puteaux', texte: 'Bonjour Alice BERNARD et Paul BERNARD,', html: '<p>Bonjour</p>' }],
  sansEmail: ['Paul BERNARD'], enGestion: true, dateFin: '2099-01-01', envoiPossible: true };
/** Les POST simulés : l'aperçu, puis l'enregistrement (avec l'issue des mails). */
const reponsePost = (init?: RequestInit): Response => {
  const corps = JSON.parse(String(init?.body ?? '{}')) as { action?: string };
  return corps.action === 'apercu-preavis' ? ok(APERCU)
    : ok({ dateMax: '2099-01-01' }, { mails: { etat: 'ok', envois: [{ sorte: 'preavis_locataires', objet: 'Accusé', a: ['alice@exemple.test'], cc: [], envoye: true, motif: null }] } });
};
const posts = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
  .map((c) => JSON.parse(String((c[1] as RequestInit).body)) as Record<string, unknown>);

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); });

const saisir = (el: HTMLInputElement, valeur: string): void => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, valeur);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('la page « Ajouter ou supprimer un locataire » : deux grosses cartes, rien en dessous', () => {
  it('les deux cartes au format de « Supprimer un propriétaire » ; « Ajouter » mène au formulaire existant ; aucune lecture', () => {
    global.fetch = vi.fn(async () => ok({ lignes: [], total: 0, page: 0 }));
    act(() => root.render(createElement(EcranLocataires)));
    const cartes = [...container.querySelectorAll('.loc-gros-boutons--3d a.loc-gros-bouton')];
    expect(cartes.map((a) => [a.getAttribute('href'), a.firstChild?.textContent, a.classList.contains('loc-gros-bouton--plein'), a.querySelector('small')?.textContent])).toEqual([
      ['/admin/location/locataires/supprimer', 'Supprimer un/des locataire(s)', true, 'Faire sortir un ou plusieurs locataires d’un logement : sortie partielle ou totale, datée ; rien n’est effacé.'],
      ['/admin/location/nouveau-locataire', 'Ajouter un/des locataire(s)', false, 'Faire entrer un ou plusieurs locataires dans un logement.'],
    ]);
    expect(container.querySelector('.svv-page-sub')?.textContent).toBe('Supprimer = sortir du logement : rien n’est effacé, tout reste consultable.');
    expect(container.querySelector('.loc-retour a')?.getAttribute('href')).toBe('/admin/location');
    // Ni liste, ni bouton « + Nouveau locataire », ni lien vers la page « à venir » (gardée dans le code).
    expect(global.fetch).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('+ Nouveau locataire');
    expect(container.querySelector('a[href="/admin/location/locataires/ajouter"]')).toBeNull();
  });

  it('la page « à venir » reste dans le code : sans formulaire d’entrée', () => {
    act(() => root.render(createElement(EcranAjouterLocatairesAVenir)));
    expect(container.textContent).toContain('À venir');
    expect(container.querySelector('form, input')).toBeNull();
  });
});

describe('la recherche des occupants', () => {
  it('en temps réel (200 ms), la requête précédente annulée, chaque résultat VERT avec le MOT « occupant »', async () => {
    vi.useFakeTimers();
    const signaux: AbortSignal[] = [];
    global.fetch = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      if (init?.signal) signaux.push(init.signal);
      return ok([{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', telephone: null, email: null, lotId: 7,
        adresse: '4 rue Fictive, 92800 Puteaux', etage: '3', porte: 'G', proprietaire: 'DUPONT Jean' }]);
    });
    act(() => root.render(createElement(EcranSortieRecherche)));
    const champ = container.querySelector('input[data-recherche-occupants]') as HTMLInputElement;
    act(() => saisir(champ, 'be'));
    act(() => saisir(champ, 'ber'));
    await act(async () => { vi.advanceTimersByTime(250); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('occupants=ber');
    const ligne = container.querySelector('a.sor-ligne') as HTMLAnchorElement;
    expect(ligne.getAttribute('href')).toBe('/admin/location/locataire/101?sortie=11');
    expect(ligne.querySelector('.sor-occupant')?.textContent).toBe('occupant');
    expect(ligne.textContent).toContain('4 rue Fictive');
    expect(ligne.textContent).toContain('3e étage');
    expect(ligne.textContent).toContain('Propriétaire : DUPONT Jean');
    // Une nouvelle frappe annule la requête en cours.
    act(() => saisir(champ, 'bern'));
    expect(signaux[0].aborted).toBe(true);
  });

  it('les couleurs passent par les jetons du thème — aucune couleur en dur', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/SortieLocataires.tsx', 'utf8');
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgb\(/);
    expect(src).toContain('var(--color-svv-green-soft)');
  });
});


describe('l’écran de sortie ALIGNÉ sur « Supprimer un des biens » (?sortie=…)', () => {
  const rendre = async (reponse: (u: string, init?: RequestInit) => Response): Promise<ReturnType<typeof vi.fn>> => {
    const f = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (String(u).includes('encartBail=') ? ok(ENCART)
      : String(u).includes('preavisBail=') ? ok(PREAVIS) : reponse(String(u), init)));
    global.fetch = f as unknown as typeof fetch;
    await act(async () => { root.render(createElement(EcranSortieLocataire, { occupationInitiale: 11, gestion: true })); });
    await act(async () => { await Promise.resolve(); });
    return f;
  };
  const gros = (): HTMLButtonElement => container.querySelector('button[data-faire-sortir]') as HTMLButtonElement;
  const cartes = (): HTMLButtonElement[] => [...container.querySelectorAll('button[data-choisir]')] as HTMLButtonElement[];

  it('accord du libellé', () => {
    expect(libelleFaireSortir(0)).toBe('Faire sortir 0 locataire');
    expect(libelleFaireSortir(1)).toBe('Faire sortir 1 locataire');
    expect(libelleFaireSortir(2)).toBe('Faire sortir 2 locataires');
  });

  it('bouton désactivé LISIBLE (fond gris, texte gris foncé, curseur interdit) — pour les deux blocs', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/SortieLocataires.tsx', 'utf8');
    expect(src).toContain('.sor-compact .sor-confirmer-btn:disabled,.pvs-compact .sor-confirmer-btn:disabled{background:var(--color-svv-field);border-color:var(--color-svv-line-strong);color:var(--color-svv-muted);opacity:1;cursor:not-allowed}');
  });

  it('le serveur refuse toujours une sortie sans date, et un préavis sans réception (mêmes règles, pures)', async () => {
    const { verifierSortie } = await import('../../../../lib/location/sortieLocataires');
    const { verifierPreavis } = await import('../../../../lib/location/preavis');
    expect(verifierSortie(BAIL, [11], '', '2026-10-19').ok).toBe(false);
    expect(verifierPreavis({ recuLe: '', choix: { mode: 'mois', duree: 1 }, entrees: [] }, '2026-10-19').ok).toBe(false);
  });

  it('la recherche, au gabarit de l’écran des biens : résultats VERTS avec le mot « occupant »', async () => {
    vi.useFakeTimers();
    await rendre((u) => (u.includes('occupants=') ? ok([{ occupationId: 31, locataireId: 301, nom: 'MARTIN Léa', telephone: null, email: null,
      lotId: 9, adresse: '9 rue Autre', etage: null, porte: null, proprietaire: 'DURAND Paul' }]) : ok(BAIL)));
    act(() => saisir(container.querySelector('input[data-recherche-occupants]') as HTMLInputElement, 'mar'));
    await act(async () => { vi.advanceTimersByTime(250); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const res = container.querySelector('button[data-occupation="31"]')!;
    expect(res.querySelector('.loc-res-type--locataires')?.textContent).toBe('occupant');
    expect(res.textContent).toContain('MARTIN Léa');
  });
});

describe('l’encart « Le logement » et l’historique des échanges (écran de sortie)', () => {
  const rendre = async (gestion: boolean, encart: unknown = ENCART): Promise<void> => {
    global.fetch = vi.fn(async (u: string | URL | Request) => (String(u).includes('encartBail=') ? ok(encart)
      : String(u).includes('preavisBail=') ? ok(PREAVIS) : ok(BAIL))) as unknown as typeof fetch;
    blocHistorique.mockClear();
    await act(async () => { root.render(createElement(EcranSortieLocataire, { occupationInitiale: 11, gestion })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  };

  it('l’encart n’affiche QUE les champs présents (ni « — », ni « non renseigné »)', async () => {
    await rendre(true);
    const e = container.querySelector('[data-encart-logement]')!;
    const lignes = [...e.querySelectorAll('[data-ligne]')].map((x) => x.getAttribute('data-ligne'));
    expect(lignes).toEqual(['proprietaire', 'type', 'etage', 'porte', 'copro', 'lot', 'carrez', 'pieces', 'ascenseur', 'syndic', 'entree', 'loyer']);
    expect(e.textContent).not.toContain('Taux de gestion');
    expect(e.textContent).not.toMatch(/non renseigné|—/);
    expect(e.querySelector('[data-ligne="type"] dd')?.textContent).toBe('Appartement T3 · meublé');
    expect(e.querySelector('[data-ligne="carrez"] dd')?.textContent).toBe('41,8 m²');
    expect(e.querySelector('[data-ligne="loyer"] dd')?.textContent).toMatch(/^1\s250,00 € \/ mois hors charges$/);
    expect(e.querySelector('a[data-lien-proprietaire]')?.getAttribute('href')).toBe('/admin/location/proprietaire/5');
  });

  it('un bien sans aucune information facultative : seuls l’adresse, le propriétaire et le lot', async () => {
    await rendre(true, { ...ENCART, type: null, meuble: null, etage: null, porte: null, numLotCopro: null, numeroLot: null, surfaceCarrez: null,
      nombrePieces: null, ascenseur: null, syndic: null, bail: { entree: null, loyerHc: null, provisions: null, taux: null, base: null },
      lots: [{ lotId: 7, role: 'logement', type: null, etage: null, numLotCopro: null, numeroLot: null, porte: null, place: false }] });
    const e = container.querySelector('[data-encart-logement]')!;
    expect([...e.querySelectorAll('[data-ligne]')].map((x) => x.getAttribute('data-ligne'))).toEqual(['proprietaire']);
    expect([...e.querySelectorAll('[data-lot]')].map((x) => x.textContent)).toEqual(['Logement']);
  });

  it('il liste TOUS les lots du bail : logement + annexes, avec étage, porte ou place, n° de lot', async () => {
    await rendre(true);
    const lots = [...container.querySelectorAll('[data-lots-du-bail] [data-lot]')].map((x) => [x.getAttribute('data-role'), x.textContent]);
    expect(lots).toEqual([
      ['logement', 'Appartement T3 · 3e étage · porte G · lot de copro n° 27 · lot n° 100'],
      ['annexe', 'Cave · sous-sol 1 · porte 7 · lot n° 101'],
      ['annexe', 'Parking · intérieur · place 12'],
    ]);
  });

  it('l’historique est LE composant partagé (périmètre « bien »), en LECTURE SEULE, sous les cartes', async () => {
    await rendre(true);
    expect(blocHistorique).toHaveBeenCalled();
    const p = blocHistorique.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(p.sorte).toBe('locataire');
    expect(p.cle).toBe('W-101');
    expect(p.perimetre).toEqual({ sorte: 'bien', cle: '100', bienNouveauMessage: null });
    expect(p.redaction).toBeNull();
    expect(p.onGesteMail).toBeUndefined();
    const bloc = container.querySelector('[data-historique-logement]')!;
    expect(bloc.textContent).toContain('écrire, répondre ou transférer se fait depuis la Gestion');
    expect(container.querySelector('.arc-biens-liste')!.compareDocumentPosition(bloc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sans le droit « Gestion » : pas d’historique, et on le dit', async () => {
    await rendre(false);
    expect(blocHistorique).not.toHaveBeenCalled();
    expect(container.querySelector('[data-historique-refus]')?.textContent).toContain('droit « Gestion »');
  });
});

describe('le taux de gestion reste affiché ailleurs', () => {
  it('la carte de location de la fiche bien / locataire (`LocationCarte`, rendue par la section « Location ») montre toujours le taux', () => {
    const carte = readFileSync('app/(admin)/admin/(protected)/gestion/LocationCarte.tsx', 'utf8');
    expect(carte).toContain('<span data-taux-gestion>');
    expect(carte).toContain('Taux de gestion (% HT)');
    const sections = readFileSync('app/(admin)/admin/(protected)/gestion/SectionsLocationFiche.tsx', 'utf8');
    expect(sections).toMatch(/<LocationCarte location=/);
  });
});

describe('le préavis sur l’écran de sortie et dans la recherche (Arno, 18/10/2026)', () => {
  const rendre = async (gestion: boolean, preavis: unknown = PREAVIS): Promise<ReturnType<typeof vi.fn>> => {
    const f = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (init?.method === 'POST' ? reponsePost(init) : String(u).includes('encartBail=') ? ok(ENCART)
      : String(u).includes('preavisBail=') ? ok(preavis) : ok(BAIL)));
    global.fetch = f as unknown as typeof fetch;
    await act(async () => { root.render(createElement(EcranSortieLocataire, { occupationInitiale: 11, gestion })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    return f;
  };

  it('un locataire EN PRÉAVIS : la mention orange (avec le mot) sur sa carte, et « Corriger » / « Annuler » ; échu → alerte', async () => {
    const p = { id: 50, occupationId: 11, recuLe: '2026-10-01', dateMax: '2099-11-01', mode: 'mois', dureeMois: 1, motif: null, creePar: 'x', creeLe: '2026-10-01', dureeProposee: 1 };
    await rendre(true, { ...PREAVIS, locataires: [{ ...PREAVIS.locataires[0], preavis: p }, PREAVIS.locataires[1]] });
    const carte = container.querySelector('[data-carte-preavis="11"]')!;
    expect(carte.querySelector('[data-preavis]')?.textContent).toBe('en préavis — sortie au plus tard le 01/11/2099');
    expect(carte.querySelector('button[data-corriger-preavis]')).not.toBeNull();
    expect(carte.querySelector('button[data-annuler-preavis]')).not.toBeNull();
    // Le locataire en préavis reste OCCUPANT : sa carte est là, sélectionnable pour la sortie.
    expect(container.querySelectorAll('button[data-choisir]')).toHaveLength(2);
    act(() => root.unmount()); root = createRoot(container);
    await rendre(true, { ...PREAVIS, locataires: [{ ...PREAVIS.locataires[0], preavis: { ...p, dateMax: '2020-01-01' } }, PREAVIS.locataires[1]] });
    expect(container.querySelector('[data-carte-preavis="11"] [data-preavis]')?.textContent).toBe('Préavis échu — sortie à saisir (au plus tard le 01/01/2020)');
    expect(container.querySelector('[data-carte-preavis="11"] [data-preavis]')?.getAttribute('data-preavis')).toBe('echu');
  });

  it('la recherche des occupants : un locataire en préavis y figure, avec la mention', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn(async () => ok([{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', telephone: null, email: null, lotId: 7,
      adresse: '4 rue Fictive', etage: null, porte: null, proprietaire: null, preavisDateMax: '2099-11-01' }])) as unknown as typeof fetch;
    act(() => root.render(createElement(EcranSortieRecherche)));
    act(() => saisir(container.querySelector('input[data-recherche-occupants]') as HTMLInputElement, 'ber'));
    await act(async () => { vi.advanceTimersByTime(250); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const ligne = container.querySelector('a.sor-ligne')!;
    // Arno (19/10/2026) : l'occupant EN PRÉAVIS passe au bleu, avec le mot.
    expect(ligne.querySelector('.sor-occupant')?.textContent).toBe('en préavis');
    expect(ligne.querySelector('.sor-occupant')?.className).toBe('sor-occupant sor-occupant--preavis');
    expect(ligne.querySelector('[data-preavis]')?.textContent).toBe('en préavis — sortie au plus tard le 01/11/2099');
  });
});

describe('Arno (19/10/2026) — les deux boutons de l’écran de sortie : blancs, puis rouge à la sélection', () => {
  const rendre = async (preavis: unknown = PREAVIS): Promise<void> => {
    global.fetch = vi.fn(async (u: string | URL | Request) => (String(u).includes('encartBail=') ? ok(ENCART)
      : String(u).includes('preavisBail=') ? ok(preavis) : ok(BAIL))) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(EcranSortieLocataire, { occupationInitiale: 11, gestion: true })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  };
  const sortir = (): HTMLButtonElement => container.querySelector('button[data-faire-sortir]') as HTMLButtonElement;
  const preavis = (): HTMLButtonElement => container.querySelector('button[data-enregistrer-un-preavis]') as HTMLButtonElement;
  const etats = () => [sortir(), preavis()].map((b) => [b.className, b.getAttribute('aria-pressed'), b.textContent]);
  const blocSortie = () => container.querySelector('[data-recapitulatif]');
  const blocPreavis = () => container.querySelector('[data-formulaire-preavis]');

  it('couleurs : blanc (bordure et texte foncés) puis rouge du thème (texte blanc) — jetons --color-svv-*', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/SortieLocataires.tsx', 'utf8');
    expect(src).toContain('.sor-bascule{background:var(--color-svv-surface);border-color:var(--color-svv-ink);color:var(--color-svv-ink)}');
    expect(src).toContain('.sor-bascule[aria-pressed="true"]{background:var(--color-svv-red);border-color:var(--color-svv-red);color:var(--color-svv-surface)}');
  });

  it('cartes « Locataires de ce logement » : en préavis → nom surligné en BLEU avec la mention ; sans préavis → vert ; échu → alerte', async () => {
    const p = { id: 50, occupationId: 11, recuLe: '2026-10-01', dateMax: '2099-11-01', mode: 'mois', dureeMois: 1, motif: null, creePar: 'x', creeLe: '2026-10-01', dureeProposee: 1 };
    await rendre({ ...PREAVIS, locataires: [{ ...PREAVIS.locataires[0], preavis: p }, PREAVIS.locataires[1]] });
    const alice = container.querySelector('[data-locataire="11"]')!;
    expect(alice.querySelector('mark')?.className).toBe('arc-surligne sor-surligne--preavis');
    expect(alice.querySelector('[data-preavis]')?.textContent).toBe('en préavis — sortie au plus tard le 01/11/2099');
    expect(alice.querySelector('[data-preavis]')?.className).toBe('pvs-mention pvs-mention--en_preavis');
    expect(container.querySelector('[data-locataire="12"] mark')?.className).toBe('arc-surligne arc-surligne--en-place');
    act(() => root.unmount()); root = createRoot(container);
    await rendre({ ...PREAVIS, locataires: [{ ...PREAVIS.locataires[0], preavis: { ...p, dateMax: '2020-01-01' } }, PREAVIS.locataires[1]] });
    expect(container.querySelector('[data-locataire="11"] [data-preavis]')?.className).toBe('pvs-mention pvs-mention--echu');
  });

  it('recherche des occupants : sans préavis, toujours « occupant » en vert', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn(async () => ok([{ occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', telephone: null, email: null, lotId: 7,
      adresse: '4 rue Fictive', etage: null, porte: null, proprietaire: null, preavisDateMax: null }])) as unknown as typeof fetch;
    act(() => root.render(createElement(EcranSortieRecherche)));
    act(() => saisir(container.querySelector('input[data-recherche-occupants]') as HTMLInputElement, 'ber'));
    await act(async () => { vi.advanceTimersByTime(250); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.querySelector('.sor-occupant')?.className).toBe('sor-occupant');
    expect(container.querySelector('.sor-occupant')?.textContent).toBe('occupant');
  });

  it('le bleu du préavis vient des jetons du thème ; l’échu garde son orange d’alerte', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/SortieLocataires.tsx', 'utf8');
    expect(src).toContain('.sor-occupant--preavis{background:var(--color-svv-blue-soft);color:var(--color-svv-blue);border-color:var(--color-svv-blue)}');
    expect(src).toContain('.sor-surligne--preavis{background:var(--color-svv-blue-soft);color:var(--color-svv-blue)}');
    const pvs = readFileSync('app/(admin)/admin/(protected)/location/Preavis.tsx', 'utf8');
    expect(pvs).toMatch(/\.pvs-mention\{[^}]*background:var\(--color-svv-blue-soft\);color:var\(--color-svv-blue\)/);
    expect(pvs).toContain('.pvs-mention--echu{background:var(--color-svv-urgence-orange)');
  });
});

describe('Arno (19/10/2026) — l’écran de sortie retravaillé', () => {
  const rendre = async (encart: unknown = ENCART_COORDS): Promise<ReturnType<typeof vi.fn>> => {
    const f = vi.fn(async (u: string | URL | Request) => (String(u).includes('encartBail=') ? ok(encart)
      : String(u).includes('preavisBail=') ? ok(PREAVIS) : ok(BAIL)));
    global.fetch = f as unknown as typeof fetch;
    await act(async () => { root.render(createElement(EcranSortieLocataire, { occupationInitiale: 11, gestion: true })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    return f;
  };
  const ENCART_COORDS = { ...ENCART, coordonnees: {
    proprietaire: null,
    locataires: [
      { occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', telephones: ['06 11 22 33 44', '01 40 00 00 00'], emails: ['alice@exemple.test', 'alice.pro@exemple.test'],
        telephonesDetail: [{ valeur: '06 11 22 33 44', libelle: 'Portable' }, { valeur: '01 40 00 00 00', libelle: null }] },
      { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', telephones: [], emails: [], telephonesDetail: [] },
    ] } };
  const cartes = (): HTMLButtonElement[] => [...container.querySelectorAll('button[data-choisir]')] as HTMLButtonElement[];

  it('les deux gros boutons : « Enregistrer un préavis » à GAUCHE (premier), « Faire sortir » à DROITE', async () => {
    await rendre();
    const gros = [...container.querySelectorAll('.sor-deux-boutons > *')];
    expect(gros.map((b) => b.hasAttribute('data-enregistrer-un-preavis') ? 'preavis' : b.hasAttribute('data-faire-sortir') ? 'sortie' : '?')).toEqual(['preavis', 'sortie']);
  });

  it('l’encart sur trame GRISE, en deux parties : « Le logement » puis « Les locataires » (pastille du nombre)', async () => {
    await rendre();
    const cadre = container.querySelector('[data-selection-locataires]')!;
    expect(cadre.className).toBe('arc-biens sor-cadre');
    expect([...cadre.querySelectorAll(':scope > .sor-partie')].map((p) => p.getAttribute('data-partie'))).toEqual(['logement', 'locataires']);
    expect(cadre.querySelector('[data-partie="logement"] [data-encart-logement]')).not.toBeNull();
    expect(cadre.querySelector('[data-partie="locataires"] .arc-biens-liste')).not.toBeNull();
    expect(cadre.querySelector('[data-partie="locataires"] .loc-pastille')?.textContent).toBe('2');
    const css = readFileSync('app/(admin)/admin/(protected)/location/SortieLocataires.tsx', 'utf8');
    expect(css).toContain('.sor-cadre{background:var(--color-svv-field);border:1px solid var(--color-svv-line)');
    // Le taux de gestion reste absent de l'encart.
    expect(cadre.textContent).not.toMatch(/Taux de gestion/);
  });

  it('chaque carte : tous les téléphones (avec libellé) et e-mails, cliquables, un par ligne ; rien si vide', async () => {
    await rendre();
    const alice = container.querySelector('[data-locataire="11"] [data-coordonnees-carte]')!;
    expect([...alice.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Portable : 06 11 22 33 44', 'tel:0611223344'], ['01 40 00 00 00', 'tel:0140000000'],
      ['alice@exemple.test', 'mailto:alice@exemple.test'], ['alice.pro@exemple.test', 'mailto:alice.pro@exemple.test']]);
    expect(container.querySelector('[data-locataire="12"] [data-coordonnees-carte]')).toBeNull();
  });

});

describe('Arno (19/10/2026) — le bloc « Enregistrer un préavis » compact, alimenté par les cartes', () => {
  const rendre = async (): Promise<ReturnType<typeof vi.fn>> => {
    const f = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (init?.method === 'POST' ? reponsePost(init)
      : String(u).includes('encartBail=') ? ok(ENCART) : String(u).includes('preavisBail=') ? ok(PREAVIS) : ok(BAIL)));
    global.fetch = f as unknown as typeof fetch;
    await act(async () => { root.render(createElement(EcranSortieLocataire, { occupationInitiale: 11, gestion: true })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    return f;
  };
  const cartes = (): HTMLButtonElement[] => [...container.querySelectorAll('button[data-choisir]')] as HTMLButtonElement[];

  it('la correction d’un préavis (fiche, cartes) garde son formulaire : seul le bloc de l’écran de sortie est compacté', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/Preavis.tsx', 'utf8');
    expect(src).toMatch(/<FormulairePreavis entrees=\{\[entree\]\}/);
  });
});




