import { describe, expect, it } from 'vitest';
import {
  cleN3, cleN4, etatDossierBien, lettrePlace, libellePlace, placeDuStatut, planDossierBien, planRangement, refusEcritureArbre,
  type BienARanger, type MaillonArbre,
} from './arbreStatutDrive';

/** 🔴 Arno (21/10/2026, 403-404) — le dossier d'un bien dans l'arbre de son statut : places, plan, garde-fous, rangement. PUR. */
describe('🔴 la place du dossier selon le statut', () => {
  it('en gestion → locative › Actifs ; ancienne → locative › Inactifs ; location seule → l’arbre « location seule », sans branche', () => {
    expect(placeDuStatut('en_gestion')).toEqual({ arbre: 'locative', branche: 'Actifs' });
    expect(placeDuStatut('ancienne_gestion')).toEqual({ arbre: 'locative', branche: 'Inactifs' });
    expect(placeDuStatut('location_seule')).toEqual({ arbre: 'location_seule', branche: null });
    expect(['en_gestion', 'ancienne_gestion', 'location_seule'].map((s) => libellePlace(placeDuStatut(s as never))))
      .toEqual(['Base de données locative › Actifs', 'Base de données locative › Inactifs', 'Base de données location seule']);
  });

  it('un propriétaire aux statuts mêlés a UN N3 par place (clés distinctes) ; les clés d’origine A / I sont gardées', () => {
    expect(['en_gestion', 'ancienne_gestion', 'location_seule'].map((s) => lettrePlace(placeDuStatut(s as never)))).toEqual(['A', 'I', 'L']);
    expect(cleN3(49, placeDuStatut('en_gestion'))).toBe('p:49:A');
    expect(cleN3(49, placeDuStatut('location_seule'))).toBe('p:49:L');
    const a = cleN4(49, placeDuStatut('en_gestion'), '25 Rue Henri Barbusse, 92230 Gennevilliers');
    const l = cleN4(49, placeDuStatut('location_seule'), '25 Rue Henri Barbusse, 92230 Gennevilliers');
    expect(a).toMatch(/^a:49:A:[0-9a-f]{12}$/);
    expect(l.slice(0, 7)).toBe('a:49:L:');
    expect(a.slice(7)).toBe(l.slice(7));
  });
});

describe('🔴 le plan du dossier d’un bien (N3 → N6, sans BAIL)', () => {
  const base = { place: placeDuStatut('location_seule'), annee: 2026, proprietaire: { id: 49, nom: 'CHALAH Ramdane' },
    adresse: { cle: 'a:49:L:abc', nom: '25 Rue Henri Barbusse' }, bien: { teteId: 436, nom: 'Logement (lot app-1)' }, parentN3: 'RACINE_LS', existants: new Map<string, string>() };

  it('tout manque : N3 sous la racine, N4, N5, les 7 rubriques, PNO / Taxe foncière et l’année — un parent avant ses enfants', () => {
    const p = planDossierBien(base);
    if (!p.ok) throw new Error(p.motif);
    expect(p.creations.map((c) => c.cle)).toEqual(['p:49:L', 'a:49:L:abc', 'b:436', 'r:436:0', 'r:436:1', 'pr:436:0', 'y:pr:436:0:2026', 'pr:436:1', 'y:pr:436:1:2026',
      'r:436:2', 'r:436:3', 'r:436:4', 'r:436:5', 'r:436:6']);
    expect(p.creations[0].parent).toEqual({ driveId: 'RACINE_LS' });
    expect(p.creations.filter((c) => c.sorte === 'rubrique').map((c) => c.nom)).toEqual(['0 En attente', '1 Propriétaire', '2 Diagnostics', '3 Photos', '4 Syndic', '5 Travaux', '6 Locataires']);
    expect(p.creations.some((c) => c.cle.startsWith('bl:') || c.nom.startsWith('BAIL'))).toBe(false);
  });

  it('ce qui existe n’est pas recréé : les enfants visent son identifiant ; rejoué complet → rien', () => {
    const p = planDossierBien({ ...base, existants: new Map([['p:49:L', 'N3'], ['a:49:L:abc', 'N4']]) });
    if (!p.ok) throw new Error(p.motif);
    expect(p.creations[0]).toMatchObject({ cle: 'b:436', parent: { driveId: 'N4' } });
    const tout = planDossierBien(base);
    if (!tout.ok) throw new Error();
    const rejoue = planDossierBien({ ...base, existants: new Map(tout.creations.map((c, i) => [c.cle, `D${i}`])) });
    expect(rejoue).toEqual({ ok: true, creations: [] });
  });

  it('sans parent connu pour un N3 manquant : refus dit', () => {
    expect(planDossierBien({ ...base, parentN3: null })).toEqual({ ok: false, motif: 'Le dossier « Base de données location seule » du Drive est introuvable : le dossier du propriétaire ne peut pas y être créé.' });
  });
});

describe('🔴 le garde : les deux arbres seulement, « Documents clients scannés » jamais', () => {
  const racines = { locative: 'R_LOC', locationSeule: 'R_LS' };
  const sous = (racine: string, ...noms: string[]): MaillonArbre[] => [...noms.map((n, i) => ({ id: `X${i}`, nom: n, parentId: null })), { id: racine, nom: 'racine', parentId: 'DRIVE' }];

  it('sous l’une ou l’autre racine : permis', () => {
    expect(refusEcritureArbre(sous('R_LOC', 'N4', 'N3', 'Actifs'), racines)).toBeNull();
    expect(refusEcritureArbre(sous('R_LS', 'N4', 'N3'), racines)).toBeNull();
  });

  it('🔴 « Documents clients scannés » à N’IMPORTE QUELLE profondeur : refusé — même si la chaîne passe aussi par une racine', () => {
    const scannes = [{ id: 'Z1', nom: '1 actifs', parentId: 'DCS' }, { id: 'DCS', nom: 'Documents clients scannés', parentId: 'DRIVE' }];
    expect(refusEcritureArbre(scannes, racines)).toMatch(/archive du cabinet/);
    expect(refusEcritureArbre([...sous('R_LOC', 'N4'), { id: 'D', nom: 'documents  CLIENTS scannes', parentId: null }], racines)).toMatch(/archive du cabinet/);
    expect(refusEcritureArbre([{ id: 'p', nom: '2 vendus', parentId: 'DCS' }, { id: 'DCS', nom: 'Documents clients scannés', parentId: null }], racines)).toMatch(/archive du cabinet/);
  });

  it('hors des deux arbres, chaîne vide, aucune racine connue : refusé', () => {
    expect(refusEcritureArbre([{ id: 'A', nom: '00 Arrivée des mails', parentId: 'DRIVE' }], racines)).toMatch(/ni sous « Base de données locative » ni sous « Base de données location seule »/);
    expect(refusEcritureArbre([], racines)).toMatch(/n’a pas pu être situé/);
    expect(refusEcritureArbre(sous('R_LOC', 'N4'), { locative: null, locationSeule: null })).toMatch(/Aucune racine/);
  });
});

describe('🔴 l’état du dossier et le plan de rangement', () => {
  it('à sa place / à créer / à déplacer', () => {
    expect(etatDossierBien('en_gestion', { arbre: 'locative', branche: 'Actifs' })).toEqual({ etat: 'ok' });
    expect(etatDossierBien('location_seule', null)).toEqual({ etat: 'a_creer' });
    expect(etatDossierBien('location_seule', { arbre: 'locative', branche: 'Actifs' }))
      .toEqual({ etat: 'a_deplacer', depuis: { arbre: 'locative', branche: 'Actifs' }, vers: { arbre: 'location_seule', branche: null } });
    expect(etatDossierBien('ancienne_gestion', { arbre: 'locative', branche: 'Actifs' })).toMatchObject({ etat: 'a_deplacer', vers: { branche: 'Inactifs' } });
  });

  it('le rangement : déplacements des N5 mal placés, biens sans dossier listés, les autres comptés', () => {
    const b = (lotId: number, statut: BienARanger['statut'], n5: BienARanger['n5']): BienARanger => ({ lotId, statut, n5, n5DriveId: n5 === null ? null : `N5-${lotId}`, titre: `bien ${lotId}` });
    const p = planRangement([b(1, 'en_gestion', { arbre: 'locative', branche: 'Actifs' }), b(2, 'location_seule', { arbre: 'locative', branche: 'Actifs' }),
      b(3, 'ancienne_gestion', { arbre: 'location_seule', branche: null }), b(4, 'location_seule', null)]);
    expect(p.enPlace).toBe(1);
    expect(p.deplacements.map((d) => [d.lotId, d.n5DriveId, libellePlace(d.vers)])).toEqual([[2, 'N5-2', 'Base de données location seule'], [3, 'N5-3', 'Base de données locative › Inactifs']]);
    expect(p.sansDossier.map((x) => x.lotId)).toEqual([4]);
  });
});
