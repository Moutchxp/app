// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { EcranAjouterLocatairesAVenir, EcranSortieLocataire, EcranSortieRecherche, FormulaireBail, libelleFaireSortir } from './SortieLocataires';
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

describe('le bloc « Sortie du logement »', () => {
  it('toutes les cases cochées par défaut ; date vide ; la phrase suit les cases', () => {
    act(() => root.render(createElement(FormulaireBail, { bail: BAIL, occupationId: 11, apres: () => {} })));
    const cases = [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    expect(cases.map((c) => c.checked)).toEqual([true, true]);
    expect((container.querySelector('input[data-date-sortie]') as HTMLInputElement).value).toBe('');
    expect(container.querySelector('[data-issue]')?.textContent).toBe('Le logement deviendra VACANT');
    act(() => cases[1].click());
    expect(container.querySelector('[data-issue]')?.textContent).toBe('Le logement reste loué à : BERNARD Paul');
    expect(container.querySelector('[data-annexes-suivent]')?.textContent).toContain('Cave n° 7');
  });

  it('« Valider la sortie » sans date : refus à l’écran, rien n’est envoyé', () => {
    global.fetch = vi.fn();
    act(() => root.render(createElement(FormulaireBail, { bail: BAIL, occupationId: 11, apres: () => {} })));
    act(() => (container.querySelector('button[data-valider]') as HTMLButtonElement).click());
    expect(container.querySelector('[data-refus]')?.textContent).toBe('La date de sortie est obligatoire.');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('avec une date : récapitulatif, puis confirmation ; un échec du mail est DIT, la sortie reste enregistrée', async () => {
    const apres = vi.fn();
    global.fetch = vi.fn(async () => ok({ date: HIER, vacant: false, restants: ['BERNARD Paul'] },
      { mail: { envoye: false, ignore: false, motif: 'Gmail injoignable' } }));
    act(() => root.render(createElement(FormulaireBail, { bail: BAIL, occupationId: 11, apres })));
    act(() => (container.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement).click());
    act(() => saisir(container.querySelector('input[data-date-sortie]') as HTMLInputElement, HIER));
    act(() => (container.querySelector('button[data-valider]') as HTMLButtonElement).click());
    const recap = container.querySelector('[data-recapitulatif]')!;
    expect(recap.textContent).toContain('BERNARD Alice');
    expect(recap.textContent).toContain(HIER_FR);
    expect(recap.textContent).toContain('4 rue Fictive');
    expect(recap.textContent).toContain('DUPONT Jean');
    expect(recap.textContent).toContain('01/09/2022');
    expect(recap.textContent).toContain('Le logement reste loué à : BERNARD Paul');
    await act(async () => { (container.querySelector('button[data-confirmer]') as HTMLButtonElement).click(); });
    const corps = JSON.parse(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body));
    expect(corps).toEqual({ action: 'sortie-locataires', occupationId: 11, sortants: [11], date: HIER });
    expect(apres).toHaveBeenCalledWith('Le logement reste loué à : BERNARD Paul', 'Enregistré, mais mail de confirmation non envoyé : Gmail injoignable.');
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

  it('retour, titre à pastille, encart, cartes TOUTES sélectionnées ; ni bloc « Fiche commune », ni fiche', async () => {
    const f = await rendre((u) => (u.includes('encartBail=') ? ok(ENCART) : ok(BAIL)));
    expect(container.querySelector('.loc-retour a')?.getAttribute('href')).toBe('/admin/location/locataires');
    expect(container.querySelector('.loc-retour a')?.textContent).toBe('← Ajouter ou supprimer un locataire');
    expect(container.querySelector('.arc-biens-titre')?.textContent).toBe('Locataires de ce logement 2');
    const encart = container.querySelector('[data-encart-logement]')!;
    expect(encart.querySelector('h3')?.textContent).toBe('4 rue Fictive, 92800 Puteaux');
    // L'encart est AU-DESSUS des cartes.
    expect(encart.compareDocumentPosition(container.querySelector('.arc-biens-liste')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cartes().map((b) => [b.getAttribute('aria-pressed'), b.textContent])).toEqual([['true', '✓ Faire sortir'], ['true', '✓ Faire sortir']]);
    expect(container.querySelectorAll('mark.arc-surligne--en-place')).toHaveLength(2);
    expect(container.textContent).toContain('Entré(e) dans les lieux le 01/09/2022');
    expect(container.querySelector('a[data-voir-fiche]')?.getAttribute('href')).toBe('/admin/location/locataire/101');
    expect(gros().textContent).toBe('Faire sortir 2 locataires');
    expect(gros().className).toBe('arc-gros arc-gros--archiver');
    expect(container.querySelector('[data-issue]')?.textContent).toBe('Le logement deviendra VACANT');
    expect(container.textContent).not.toContain('Fiche commune avec la Gestion');
    expect(f.mock.calls.map((c) => String(c[0])).sort()).toEqual(['/api/admin/location?bail=11&v=0', '/api/admin/location?encartBail=11', '/api/admin/location?preavisBail=11&p=0']);
  });

  it('la bascule suit le compteur et la phrase ; à 0, le gros bouton est inactif', async () => {
    await rendre(() => ok(BAIL));
    act(() => cartes()[1].click());
    expect(cartes()[1].textContent).toBe('Reste dans le logement');
    expect(gros().textContent).toBe('Faire sortir 1 locataire');
    expect(container.querySelector('[data-issue]')?.textContent).toBe('Le logement reste loué à : BERNARD Paul');
    act(() => cartes()[0].click());
    expect(gros().textContent).toBe('Faire sortir 0 locataire');
    expect(gros().disabled).toBe(true);
  });

  it('confirmation RÉDUITE : titre, qui sort (une fiche par ligne), date mise en avant ; ni logement, ni adresse, ni propriétaire, ni entrée', async () => {
    await rendre(() => ok(BAIL));
    act(() => gros().click());
    const bloc = container.querySelector('[data-recapitulatif]')!;
    expect(bloc.querySelector('.sor-confirmer-titre')?.textContent).toBe('Faire sortir 2 locataires ?');
    expect([...bloc.querySelectorAll('[data-qui-sort] li')].map((li) => li.textContent)).toEqual([
      'BERNARD Alice entré(e) le 01/09/2022', 'BERNARD Paul entré(e) le 01/09/2022']);
    for (const retire of ['Logement', 'Adresse', 'Propriétaire', 'Date d’entrée', 'DUPONT Jean', '4 rue Fictive']) {
      expect(bloc.textContent, retire).not.toContain(retire);
    }
    // Un seul libellé visible pour la date, et le champ a le focus.
    expect(bloc.querySelectorAll('.sor-date-libelle')).toHaveLength(1);
    expect(bloc.querySelector('.sor-date-libelle')?.textContent).toBe('Date de sortie *');
    expect(bloc.textContent).toContain('Obligatoire');
    expect(document.activeElement).toBe(bloc.querySelector('input[data-date-sortie]'));
  });

  it('sans date : « Confirmer » désactivé ET le message dit pourquoi ; les trois messages ; valide → envoi', async () => {
    const f = await rendre((u) => (u.includes('bail=') ? ok(BAIL)
      : ok({ date: HIER, vacant: false, restants: ['BERNARD Paul'] }, { mail: { envoye: true, ignore: false, motif: null } })));
    act(() => cartes()[1].click());
    act(() => gros().click());
    const confirmer = (): HTMLButtonElement => container.querySelector('button[data-confirmer]') as HTMLButtonElement;
    const message = (): string | undefined => container.querySelector('[data-message-date]')?.textContent;
    const date = (): HTMLInputElement => container.querySelector('input[data-date-sortie]') as HTMLInputElement;
    expect(date().value).toBe('');
    expect(confirmer().disabled).toBe(true);
    expect(message()).toBe('Saisissez la date de sortie');
    act(() => saisir(date(), '2020-01-01'));
    expect(confirmer().disabled).toBe(true);
    expect(message()).toBe('La date ne peut pas précéder l’entrée du 01/09/2022');
    act(() => saisir(date(), '2099-01-01'));
    expect(confirmer().disabled).toBe(true);
    expect(message()).toBe('La date ne peut pas être dans le futur : enregistrez un préavis');
    expect(f.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST')).toHaveLength(0);
    act(() => saisir(date(), HIER));
    expect(message()).toBeUndefined();
    expect(confirmer().disabled).toBe(false);
    await act(async () => { confirmer().click(); });
    const post = f.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')!;
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({ action: 'sortie-locataires', occupationId: 11, sortants: [11], date: HIER });
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector('[data-sortie-faite]')?.textContent).toContain('Le logement reste loué à : BERNARD Paul');
  });

  it('conséquence : « Le logement deviendra VACANT » si tous sortent ; sinon « Il restera N locataire(s) » (vert), noms dessous', async () => {
    const TROIS: BailLogement = { ...BAIL, locataires: [...BAIL.locataires, { occupationId: 13, locataireId: 103, nom: 'BERNARD Léo', entree: '2022-09-01' }] };
    await rendre(() => ok(TROIS));
    act(() => gros().click());
    expect(container.querySelector('[data-consequence]')?.textContent).toBe('Le logement deviendra VACANT');
    expect(container.querySelector('[data-consequence]')?.className).toContain('sor-issue--vacant');
    act(() => cartes()[2].click());
    act(() => gros().click());
    const reste = container.querySelector('[data-consequence="reste"]')!;
    expect(reste.querySelector('p')?.textContent).toBe('Il restera 1 locataire dans le logement');
    expect([...reste.querySelectorAll('li')].map((x) => x.textContent)).toEqual(['BERNARD Léo']);
    act(() => cartes()[1].click());
    act(() => gros().click());
    expect(container.querySelector('[data-consequence="reste"] p')?.textContent).toBe('Il restera 2 locataires dans le logement');
    // La phrase sous le gros bouton rouge, elle, ne change pas de forme.
    expect(container.querySelector('[data-issue]')?.textContent).toBe('Le logement reste loué à : BERNARD Paul, BERNARD Léo');
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
    const f = vi.fn(async (u: string | URL | Request) => (String(u).includes('encartBail=') ? ok(ENCART)
      : String(u).includes('preavisBail=') ? ok(preavis) : ok(BAIL)));
    global.fetch = f as unknown as typeof fetch;
    await act(async () => { root.render(createElement(EcranSortieLocataire, { occupationInitiale: 11, gestion })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    return f;
  };

  it('sans le droit Gestion : à la place du gros bouton, « La sortie est validée par un utilisateur de la Gestion » ; le préavis reste possible', async () => {
    await rendre(false);
    expect(container.querySelector('button[data-faire-sortir]')).toBeNull();
    expect(container.querySelector('[data-sortie-gestion-seule]')?.textContent).toBe('La sortie est validée par un utilisateur de la Gestion');
    expect((container.querySelector('button[data-enregistrer-un-preavis]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('« Enregistrer un préavis » : locataires tous cochés, réception obligatoire, durée proposée, date maximale en grand, puis envoi', async () => {
    const f = await rendre(true);
    act(() => (container.querySelector('button[data-enregistrer-un-preavis]') as HTMLButtonElement).click());
    const form = container.querySelector('[data-formulaire-preavis]')!;
    expect([...form.querySelectorAll('input[data-case-preavis]')].map((c) => (c as HTMLInputElement).checked)).toEqual([true, true]);
    expect(form.textContent).toContain('1 mois — proposé (logement vide en zone tendue)');
    const bouton = (): HTMLButtonElement => form.querySelector('button[data-enregistrer-preavis]') as HTMLButtonElement;
    expect(bouton().disabled).toBe(true);
    expect(form.querySelector('[data-message-preavis]')?.textContent).toBe('Saisissez la date de réception du recommandé');
    act(() => saisir(form.querySelector('input[data-recu-le]') as HTMLInputElement, HIER));
    const attendu = (() => { const [a, m, j] = HIER.split('-').map(Number); const d = new Date(Date.UTC(a, m, 1));
      d.setUTCDate(Math.min(j, new Date(Date.UTC(a, m + 1, 0)).getUTCDate())); return d.toISOString().slice(0, 10).split('-').reverse().join('/'); })();
    expect(form.querySelector('[data-date-max] .pvs-max-valeur')?.textContent).toBe(attendu);
    expect(bouton().disabled).toBe(false);
    await act(async () => { bouton().click(); });
    const post = f.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')!;
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({
      action: 'enregistrer-preavis', occupationIds: [11, 12], recuLe: HIER, choix: { mode: 'mois', duree: 1 }, motif: null });
  });

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
    expect(ligne.querySelector('.sor-occupant')?.textContent).toBe('occupant');
    expect(ligne.querySelector('[data-preavis]')?.textContent).toBe('en préavis — sortie au plus tard le 01/11/2099');
  });
});
