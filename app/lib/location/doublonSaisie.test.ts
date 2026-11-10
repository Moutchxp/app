import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 LOT DOUBLON-RENVOI-ADHOC, points A, B, D, E, F (Arno, 10/11/2026) — le doublon PIEULHET, sa cause, ses suites.
 * Le cas réel (`.captures/doublon-renvoi-adhoc/resultat-prod.txt`) : ligne 847 importée (fichier d'octobre, sans bail, 425,66 € HT) ; bail
 * 542 créé le 06/11, entrée le 10/10 ; ligne 854 saisie le 06/11 et datée du 06/11 (comptée en novembre) ; supprimée le 10/11 depuis
 * « Suivi du mois », avec la fiche de la locataire n° 531. Base simulée : rien n'est écrit, aucun réseau.
 */
type Ligne = Record<string, unknown>;
const requetes: { sql: string; params: unknown[] }[] = [];
let routeur: (s: string, p: unknown[]) => { rows: Ligne[]; rowCount?: number } = () => ({ rows: [] });
const q = vi.fn(async (sql: string, params: unknown[] = []) => {
  requetes.push({ sql, params });
  const r = routeur(sql.replace(/\s+/g, ' '), params);
  return { rows: r.rows, rowCount: r.rowCount ?? r.rows.length };
});
vi.mock('../db/client', () => ({ query: (s: string, p?: unknown[]) => q(s, p), withTransaction: async (f: (x: typeof q) => unknown) => f(q) }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: vi.fn(async (_t: string, c: string) => c === 'date_signature' || c === 'bail_id') }));
vi.mock('./rentreOccupeRepo', () => ({ bailEnPlace: vi.fn(async () => false) }));
vi.mock('../gestion/schema', async (orig) => ({ ...(await orig()), suppressionPersonneDisponible: vi.fn(async () => true), honorairesGestionDisponible: vi.fn(async () => false) }));
vi.mock('../gestion/traceJournal', () => ({ colonnesTrace: vi.fn(async () => ({ colonnes: '', marques: '', valeurs: [] })) }));
vi.mock('../gestion/annuaireEditionRepo', () => ({ marquerPersonneSupprimeeTx: vi.fn(async (qq: typeof q, _s: string, id: number) => qq('UPDATE gestion_annuaire_locataire SET supprime_le = now() WHERE id = $1', [id])) }));

import { alerteMoisCompte, dateSignatureProposee } from './moisCompte';
import { lireChoixLigneImportee, motifLigneImportee, questionLigneImportee, type LigneImporteeProposee } from './suivi/ligneImportee';
import { enregistrerActiviteBail } from './suivi/suiviRepo';
import { planSuppression, supprimerLocation } from './suivi/suppressionLocationRepo';
import { restaurerFicheLocataire } from './restaurerFicheLocataire';

const ecritures = () => requetes.filter((r) => /^\s*(INSERT|UPDATE|DELETE)/i.test(r.sql));
beforeEach(() => { requetes.length = 0; q.mockClear(); routeur = () => ({ rows: [] }); });

describe('🔴🔴 A — le mois compté d’une nouvelle location = le mois de la date d’entrée', () => {
  it('la date de signature proposée est la date d’entrée, tant qu’on ne l’a pas changée à la main', () => {
    expect(dateSignatureProposee({ entree: '2026-10-10', saisie: '2026-11-06', changeeALaMain: false })).toBe('2026-10-10');
    expect(dateSignatureProposee({ entree: '2026-10-10', saisie: '2026-11-06', changeeALaMain: true })).toBe('2026-11-06');
    expect(dateSignatureProposee({ entree: '', saisie: '2026-11-06', changeeALaMain: false })).toBe('2026-11-06');
  });
  it('l’alerte : entrée dans un autre mois que la saisie (cas PIEULHET) ; signature déplacée hors du mois d’entrée ; rien sinon', () => {
    expect(alerteMoisCompte({ entree: '2026-10-10', signature: '2026-10-10', aujourdhui: '2026-11-06' }))
      .toBe('L’entrée du locataire (10/10/2026) est en octobre 2026 : la location sera comptée en octobre 2026, et non dans le mois de la saisie (novembre 2026).');
    expect(alerteMoisCompte({ entree: '2026-10-10', signature: '2026-11-06', aujourdhui: '2026-11-06' }))
      .toBe('Attention : la date de signature (06/11/2026) fera compter cette location en novembre 2026, alors que l’entrée du locataire (10/10/2026) est en octobre 2026.');
    expect(alerteMoisCompte({ entree: '2026-11-02', signature: '2026-11-02', aujourdhui: '2026-11-06' })).toBeNull();
    expect(alerteMoisCompte({ entree: '', signature: '2026-11-06', aujourdhui: '2026-11-06' })).toBeNull();
  });
});

/** Le bail 542 de PIEULHET, tel que la base le rend ; `importees` : la ligne 847 (ou rien). */
const routeurSuivi = (importees: Ligne[]) => (s: string): { rows: Ligne[]; rowCount?: number } => {
  if (s.includes('FROM gestion_bail b JOIN gestion_annuaire_lot l ON l.id = b.lot_id')) {
    return { rows: [{ lot_id: '356', proprietaire_id: '143', proprio: 'Propriétaire 143', categorie: null, nature: null, type_bien: null }] };
  }
  if (s.includes('FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire lo ON lo.id = o.locataire_id WHERE o.bail_id = $1 ORDER BY lo.id')) {
    return { rows: [{ id: '531', libelle: 'Stéphanie PIEULHET' }] };
  }
  if (s.startsWith('WITH noms AS')) return { rows: importees };
  if (s.startsWith('INSERT INTO gestion_location_activite')) return { rows: [{ id: '854' }] };
  if (s.startsWith('UPDATE gestion_location_activite SET bail_id')) return { rows: [], rowCount: 1 };
  return { rows: [] };
};
const L847 = { id: '847', date: '2026-10-01', loc: 'PIEULHET', prop: '', ca: '425.66', meme_bien: false };
const SAISIE = { type: 'bail', dateSignature: '2026-10-10', honoProprietaireHt: '0', honoLocataireHt: '425,66', negociateurId: null, apporteurId: null,
  apporteurTaux: '', mandatGestion: false, avecGestion: false, categoriePrime: null };
const AUTEUR = { id: 5, libelle: 'jb.pons@sansvisavis.com' };

describe('🔴🔴 B — une ligne importée sans bail : jamais de seconde ligne en silence', () => {
  it('le cas PIEULHET : la saisie sans choix est REFUSÉE, rien n’est écrit, la ligne 847 est rendue avec la question', async () => {
    routeur = routeurSuivi([L847]);
    const r = await enregistrerActiviteBail(542, SAISIE, AUTEUR);
    expect(r.etat).toBe('refus');
    if (r.etat !== 'refus') return;
    expect(r.lignesImportees).toEqual([{ id: 847, dateSignature: '2026-10-01', libelleLocataire: 'PIEULHET', libelleProprietaire: '', caHt: 425.66, memeBien: false }]);
    expect(r.motif).toContain('Une ligne importée existe déjà pour ce locataire (PIEULHET) en octobre 2026 : la relier à ce bail ?');
    expect(ecritures()).toEqual([]);
    const recherche = requetes.find((x) => x.sql.trim().startsWith('WITH noms AS'))!.sql.replace(/\s+/g, ' ');
    expect(recherche).toContain("a.source = 'import' AND a.bail_id IS NULL AND a.annule_le IS NULL");
    expect(recherche).toContain('abs(a.date_signature - repere.d) <= 92');
  });
  it('« Oui, la relier » : la ligne 847 reçoit le bail 542 (sa date et ses montants restent), AUCUNE ligne créée, le choix au journal', async () => {
    routeur = routeurSuivi([L847]);
    const r = await enregistrerActiviteBail(542, { ...SAISIE, ligneImportee: { relier: 847 } }, AUTEUR);
    expect(r).toMatchObject({ etat: 'ok', data: { id: 847 } });
    const e = ecritures();
    expect(e.some((x) => x.sql.includes('INSERT INTO gestion_location_activite'))).toBe(false);
    const maj = e.find((x) => x.sql.includes('UPDATE gestion_location_activite'))!;
    expect(maj.params.slice(0, 2)).toEqual([847, 542]);
    expect(maj.sql).not.toMatch(/date_signature|hono_/);
    const j = e.find((x) => x.sql.includes('INSERT INTO gestion_journal'))!;
    expect(j.params.slice(0, 2)).toEqual([847, 'ligne_importee_reliee']);
    expect(j.params).toContain('jb.pons@sansvisavis.com');
  });
  it('« Non, créer une nouvelle ligne » : la ligne est créée ET le refus de relier est tracé au journal', async () => {
    routeur = routeurSuivi([L847]);
    const r = await enregistrerActiviteBail(542, { ...SAISIE, ligneImportee: 'nouvelle' }, AUTEUR);
    expect(r.etat).toBe('ok');
    expect(ecritures().some((x) => x.sql.includes('INSERT INTO gestion_location_activite'))).toBe(true);
    const j = ecritures().find((x) => x.sql.includes('INSERT INTO gestion_journal'))!;
    expect(j.params.slice(0, 2)).toEqual([854, 'ligne_importee_non_reliee']);
    expect(String(j.params[4])).toContain('n° 847');
  });
  it('aucune ligne importée trouvée : la saisie s’enregistre comme avant, sans question ni journal de choix', async () => {
    routeur = routeurSuivi([]);
    expect((await enregistrerActiviteBail(542, SAISIE, AUTEUR)).etat).toBe('ok');
    expect(ecritures().some((x) => x.sql.includes('gestion_journal'))).toBe(false);
  });
  it('relier une ligne qui n’est plus candidate : refus, rien n’est écrit', async () => {
    routeur = routeurSuivi([]);
    const r = await enregistrerActiviteBail(542, { ...SAISIE, ligneImportee: { relier: 847 } }, AUTEUR);
    expect(r.etat).toBe('refus');
    expect(ecritures()).toEqual([]);
  });
  it('la question, mot pour mot celle d’Arno ; le choix se lit, sinon rien', () => {
    const l: LigneImporteeProposee = { id: 1, dateSignature: '2026-10-01', libelleLocataire: 'X', libelleProprietaire: '', caHt: 0, memeBien: true };
    expect(questionLigneImportee(l)).toBe('Une ligne importée existe déjà pour ce bien en octobre 2026 : la relier à ce bail ?');
    expect(motifLigneImportee([l])).toMatch(/^Une ligne importée existe déjà pour ce bien en octobre 2026 : la relier à ce bail \? Rien n’a été enregistré/);
    expect(lireChoixLigneImportee({ ligneImportee: { relier: '847' } })).toEqual({ relier: 847 });
    expect(lireChoixLigneImportee({ ligneImportee: 'nouvelle' })).toBe('nouvelle');
    for (const b of [{}, null, { ligneImportee: 'oui' }, { ligneImportee: { relier: -1 } }]) expect(lireChoixLigneImportee(b)).toBeNull();
  });
});

/** La ligne 854 et la locataire 531, dont le bail 542 est en cours (ou non). */
const routeurSuppression = (bailEnCours: boolean) => (s: string): { rows: Ligne[]; rowCount?: number } => {
  if (s.includes('FROM gestion_location_activite a LEFT JOIN gestion_annuaire_lot l ON l.id = a.lot_id WHERE a.id = $1')) {
    return { rows: [{ id: '854', date: '2026-11-06', bail_id: '542', lot_id: '356', locataire_id: '531', bien: '28 Avenue Marceau, Courbevoie', libelle: null }] };
  }
  if (s.includes('FROM gestion_annuaire_locataire lo WHERE lo.id = $2')) return { rows: [{ id: '531', nom: 'Stéphanie PIEULHET', supprime: false }] };
  if (s.includes('LEFT JOIN gestion_bail g ON g.id = o.bail_id WHERE o.locataire_id = $1 AND o.sortie IS NULL')) return { rows: bailEnCours ? [{ '?column?': 1 }] : [] };
  return { rows: [] };
};

describe('🔴🔴 E — la suppression depuis « Suivi du mois » ne supprime JAMAIS la fiche d’un locataire dont le bail est en cours', () => {
  it('le cas PIEULHET rejoué : seule la ligne 854 est annulée ; la fiche 531 n’est pas touchée ; le journal le dit', async () => {
    routeur = routeurSuppression(true);
    const r = await supprimerLocation(854, { id: 1, libelle: 'a.jorel@sansvisavis.com' });
    expect(r.etat).toBe('ok');
    if (r.etat !== 'ok') return;
    expect(r.data.locataires).toEqual([{ id: 531, nom: 'Stéphanie PIEULHET', conserve: true, autreBien: null, bailEnCours: true }]);
    const e = ecritures();
    expect(e.filter((x) => x.sql.includes('gestion_annuaire_locataire'))).toEqual([]);
    expect(e.find((x) => x.sql.includes('UPDATE gestion_location_activite SET annule_le'))!.params).toEqual([854, 'a.jorel@sansvisavis.com']);
    expect(String(e.find((x) => x.sql.includes('INSERT INTO gestion_journal'))!.params[2]))
      .toContain('Stéphanie PIEULHET : fiche conservée (bail en cours) — seule la ligne de suivi est annulée');
  });
  it('sans bail en cours (locataire parti), la règle d’avant demeure : la fiche est supprimée avec la location', async () => {
    routeur = routeurSuppression(false);
    const p = await planSuppression(q as never, 854);
    expect(p?.locataires).toEqual([{ id: 531, nom: 'Stéphanie PIEULHET', conserve: false, autreBien: null, bailEnCours: false }]);
  });
  it('la fenêtre de confirmation le dit (phrase du locataire, et « seule la ligne de suivi est annulée »)', async () => {
    const { phraseLocataire, phraseBailEnCours } = await import('../../(admin)/admin/(protected)/location/SupprimerLocation');
    const l = { id: 531, nom: 'Stéphanie PIEULHET', conserve: true, autreBien: null, bailEnCours: true };
    expect(phraseLocataire(l)).toBe('Stéphanie PIEULHET a un bail en cours : sa fiche est conservée. Seule la ligne de suivi de cette location est annulée.');
    expect(phraseBailEnCours({ id: 854, bien: 'b', dateSignature: '2026-11-06', locataires: [l] })).toMatch(/^Seule la ligne de suivi est annulée/);
    expect(phraseBailEnCours({ id: 854, bien: 'b', dateSignature: '2026-11-06', locataires: [{ ...l, conserve: false, bailEnCours: false }] })).toBeNull();
  });
});

const routeurFiche = (o: { supprimee: boolean; bailEnCours: boolean; archiveAvant?: boolean }) => (s: string): { rows: Ligne[]; rowCount?: number } => {
  if (s.includes('FROM gestion_annuaire_locataire l WHERE l.id = $1')) {
    return { rows: [{ id: 531, nom: 'Stéphanie PIEULHET', supprime_le: o.supprimee ? '2026-11-10 15:09:09.236109+01' : null, supprime_par_libelle: 'jb.pons@sansvisavis.com',
      archive_le: o.supprimee ? '2026-11-10 15:09:09.236109+01' : null, archive_par_libelle: 'jb.pons@sansvisavis.com', archive_de_la_suppression: o.archiveAvant !== true }] };
  }
  if (s.includes('FROM gestion_annuaire_occupation o JOIN gestion_bail g ON g.id = o.bail_id')) {
    return { rows: o.bailEnCours ? [{ occupation: 560, bail: 542, entree: '2026-10-10', adresse: '28 Avenue Marceau', commune: 'Courbevoie' }] : [] };
  }
  return { rows: [], rowCount: 1 };
};

describe('🔴🔴 D — restaurer la fiche de Stéphanie PIEULHET (n° 531, bail 542 en cours)', () => {
  it('--essai : dit ce qui serait restauré, sans RIEN écrire', async () => {
    routeur = routeurFiche({ supprimee: true, bailEnCours: true });
    const r = await restaurerFicheLocataire({ locataireId: 531, appliquer: false, q, auteur: { id: null, libelle: 'script' } });
    expect(r.etat).toBe('a_restaurer');
    expect(r.lignes.join('\n')).toContain('Bail en cours n° 542 (occupation 560) — 28 Avenue Marceau, Courbevoie — entrée le 2026-10-10.');
    expect(ecritures()).toEqual([]);
  });
  it('--appliquer : la fiche seule redevient active (suppression et archivage nés du même geste levés), une ligne au journal — rien d’autre', async () => {
    routeur = routeurFiche({ supprimee: true, bailEnCours: true });
    const r = await restaurerFicheLocataire({ locataireId: 531, appliquer: true, q, auteur: { id: null, libelle: 'script' } });
    expect(r.etat).toBe('restauree');
    const e = ecritures();
    expect(e).toHaveLength(2);
    expect(e[0].sql.replace(/\s+/g, ' ')).toContain('UPDATE gestion_annuaire_locataire SET supprime_le = NULL');
    expect(e[0].sql).toContain('CASE WHEN archive_le = supprime_le THEN NULL ELSE archive_le END');
    expect(e[1].sql).toContain("VALUES ('annuaire', $1, 'annuaire_restaure'");
    expect(e[1].params[0]).toBe(531);
  });
  it('refus sans écriture : fiche non supprimée, ou aucun bail en cours', async () => {
    routeur = routeurFiche({ supprimee: false, bailEnCours: true });
    expect((await restaurerFicheLocataire({ locataireId: 531, appliquer: true, q, auteur: { id: null, libelle: 's' } })).etat).toBe('refus');
    routeur = routeurFiche({ supprimee: true, bailEnCours: false });
    expect((await restaurerFicheLocataire({ locataireId: 531, appliquer: true, q, auteur: { id: null, libelle: 's' } })).etat).toBe('refus');
    expect(ecritures()).toEqual([]);
  });
  it('le script ouvre sa session en lecture seule hors --appliquer', () => {
    const src = readFileSync('app/scripts/restaurer-fiche-locataire.ts', 'utf8');
    expect(src).toContain("if (!appliquer) await client.query('SET TRANSACTION READ ONLY');");
  });
});

describe('🔴 F — le journal enregistre le compte RÉELLEMENT connecté', () => {
  it('l’auteur vient du jeton de session signé de la requête (son identifiant), jamais d’un champ envoyé par l’écran', async () => {
    process.env.ADMIN_SESSION_SECRET = 'secret-de-test-uniquement-0123456789abcdef';
    const { signerJeton, NOM_COOKIE, permsToutes } = await import('../admin/session');
    const { auteurDeLaRequete } = await import('../gestion/auteur');
    const jeton = await signerJeton({ sub: 2, identifiant: 'a.jorel@sansvisavis.com', role: 'administrateur', perms: permsToutes(), doitChanger: false, peutModifierPermis: true });
    const req = new Request('http://localhost/api/admin/location/suivi', { method: 'POST', headers: { cookie: `${NOM_COOKIE}=${jeton}` },
      body: JSON.stringify({ action: 'supprimer-location', id: 854, auteur: 'jb.pons@sansvisavis.com' }) });
    expect(await auteurDeLaRequete(req)).toEqual({ id: 2, libelle: 'a.jorel@sansvisavis.com' });
  });
  it('la route de suppression prend l’auteur de la session, et le dépôt l’écrit tel quel (annulation et journal)', async () => {
    const route = readFileSync('app/(admin)/api/admin/location/suivi/route.ts', 'utf8');
    expect(route).toContain('const auteur = await auteurDeLaRequete(request);');
    expect(route).toMatch(/supprimerLocation\(corps\.id, auteur\)/);
    routeur = routeurSuppression(true);
    await supprimerLocation(854, { id: 2, libelle: 'a.jorel@sansvisavis.com' });
    const j = ecritures().find((x) => x.sql.includes('INSERT INTO gestion_journal'))!;
    expect(j.params.slice(3, 5)).toEqual([2, 'a.jorel@sansvisavis.com']);
  });
});
