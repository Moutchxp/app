import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * L'EDLS PLANIFIÉ (Arno, 19/10/2026) — le dépôt, base SIMULÉE, module de tâches simulé (on vérifie qu'on L'APPELLE, sans
 * second système de tâches). Fragments sémantiques et paramètres liés, jamais la forme exacte d'un SQL.
 */
type Appel = { sql: string; params: unknown[] };
const appels: Appel[] = [];
const norme = (s: string): string => s.replace(/\s+/g, ' ');
let groupe: Record<string, unknown>[] = [];
let liens: Record<string, unknown>[] = [];
let liensApres: Record<string, unknown>[] | null = null;
let lectures = 0;
let permis: number[] = [3, 4];

function repondre(sql: string, params: unknown[]): { rows: unknown[]; rowCount: number } {
  const s = norme(sql);
  appels.push({ sql: s, params });
  if (s.includes('FROM gestion_annuaire_occupation o LEFT JOIN gestion_location_preavis p')) return { rows: groupe, rowCount: groupe.length };
  if (s.includes('FROM gestion_location_edls e JOIN gestion_tache t') && s.includes('FOR UPDATE OF e')) {
    lectures += 1;
    const r = lectures > 1 && liensApres !== null ? liensApres : liens;
    return { rows: r, rowCount: r.length };
  }
  if (s.includes('FROM admin_utilisateur')) return { rows: permis.map((id) => ({ id })), rowCount: permis.length };
  if (s.startsWith('INSERT INTO gestion_location_edls')) return { rows: [{ id: 77 }], rowCount: 1 };
  return { rows: [], rowCount: 1 };
}
const query = vi.fn(async (sql: string, params: unknown[] = []) => repondre(sql, params));
vi.mock('../db/client', () => ({
  query: (sql: string, params?: unknown[]) => query(sql, params ?? []),
  withTransaction: async (fn: (q: (sql: string, params?: unknown[]) => Promise<unknown>) => Promise<unknown>) => fn((sql, params) => query(sql, params ?? [])),
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('../gestion/schema', () => ({ tachesDisponibles: async () => true }));
const creerTache = vi.fn(async (..._a: unknown[]) => ({ ok: true, id: 500, demande: { demandeId: 1, statut: 'en_attente', jeton: 'j', destinataireLibelle: 'Claire Test' } }));
const decalerTache = vi.fn(async (..._a: unknown[]) => ({ ok: true, id: 500, demande: { demandeId: 2, statut: 'en_attente', jeton: 'j2' } }));
const modifierTache = vi.fn(async (..._a: unknown[]) => ({ ok: true, id: 500, demande: { demandeId: 3, statut: 'en_attente', jeton: 'j3' } }));
const annulerTache = vi.fn(async (..._a: unknown[]) => ({ ok: true, id: 500 }));
const listerCollaborateurs = vi.fn(async (..._a: unknown[]) => [
  { id: 3, libelle: 'Arno Test', accesGestion: true }, { id: 4, libelle: 'Claire Test', accesGestion: true },
  { id: 5, libelle: 'Paul Gestion-seule', accesGestion: true }, { id: 6, libelle: 'Zoé Sans-gestion', accesGestion: false },
]);
vi.mock('../gestion/tachesRepo', () => ({
  creerTache: (...a: unknown[]) => creerTache(...a), decalerTache: (...a: unknown[]) => decalerTache(...a),
  modifierTache: (...a: unknown[]) => modifierTache(...a), annulerTache: (...a: unknown[]) => annulerTache(...a),
  listerCollaborateurs: (...a: unknown[]) => listerCollaborateurs(...a),
}));
vi.mock('./sortieLocatairesRepo', () => ({
  encartDuBail: vi.fn(async () => ({
    lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', type: 'Appartement T3', meuble: false, etage: '3', porte: 'G', numLotCopro: null, numeroLot: '100',
    batiment: 'B', escalier: null, surfaceCarrez: null, surfaceHabitable: null, surface: null, surfaceExterieure: null, nombrePieces: null,
    ascenseur: true, digicode: true, digicodeCode: '4521A', precisionAcces: 'Code au portail', dpeClasse: null, dpeDate: null, dpeNonSoumis: null,
    chauffage: null, epoqueConstruction: null,
    lots: [{ lotId: 7, role: 'logement', type: 'Appartement T3', etage: '3', numLotCopro: null, numeroLot: '100', porte: 'G', place: false },
      { lotId: 8, role: 'annexe', type: 'Parking', etage: null, numLotCopro: null, numeroLot: null, porte: '12', place: true }],
    proprietaire: { id: 5, nom: 'DUPONT Jean' }, syndic: null, bail: { entree: null, loyerHc: null, provisions: null, taux: null, base: null },
    coordonnees: { proprietaire: { telephones: ['06 11 22 33 44'], emails: [] },
      locataires: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', telephones: [], emails: ['alice@exemple.test'] }] },
  })),
}));

import { confiablesEdls, deplacerEdls, planifierEdls, reattribuerEdls } from './edlsRepo';

const AUTEUR = { id: 3, libelle: 'arno@exemple.fr' };
const ecritures = (): Appel[] => appels.filter((a) => /^(UPDATE|INSERT|DELETE)/.test(a.sql));
const LIEN = (o: Record<string, unknown> = {}) => ({ id: '20', tache_id: '500', etat: 'a_faire', jour: '2026-11-03', heure: '10:00', duree: 90,
  confiee_a: '4', confiee_a_libelle: 'Claire Test', objet: 'EDL de sortie', note: 'récap', rappels: [], evenement_id: null, statut: 'en_attente', ...o });

beforeEach(() => {
  appels.length = 0; lectures = 0; liensApres = null; permis = [3, 4];
  groupe = [{ id: '11', locataire_id: '101', lot_id: '7', sortie: null, recu_le: '2026-10-01', date_max: '2026-11-01' }];
  liens = [];
  for (const f of [creerTache, decalerTache, modifierTache, annulerTache]) f.mockClear();
});

describe('« Confier à » : Location ET Gestion ET adresse du Workspace', () => {
  it('la liste du module de tâches (Workspace), filtrée par les deux tuiles', async () => {
    permis = [3, 4];
    expect((await confiablesEdls(3)).map((c) => c.libelle)).toEqual(['Arno Test', 'Claire Test']);
    const s = appels.find((a) => a.sql.includes('FROM admin_utilisateur'))!.sql;
    expect(s).toContain("role = 'administrateur' OR (perm_gestion IS TRUE AND perm_location IS TRUE)");
  });
});

describe('planifierEdls', () => {
  const D = { occupationIds: [11], jour: '2026-11-03', debut: '10:00', fin: '11:30', confieA: 4, commentaire: 'clés chez le gardien' };

  it('UNE tâche du module de tâches, sur la bonne plage, rattachée au bien ; puis le lien, la date d’EDLS, le journal', async () => {
    const r = await planifierEdls(D, AUTEUR);
    expect(r).toMatchObject({ etat: 'ok', data: { edlsId: 77 }, tacheId: 500 });
    expect(creerTache).toHaveBeenCalledTimes(1);
    const [lotId, saisie] = creerTache.mock.calls[0] as [number, Record<string, unknown>];
    expect(lotId).toBe(7);
    expect(saisie).toMatchObject({ objet: 'EDL de sortie', jour: '2026-11-03', heure: '10:00', dureeMinutes: 90, confieeA: 4 });
    expect(String(saisie.note)).toContain('Lots concernés (2) :');
    expect(String(saisie.note)).toContain('Commentaire : clés chez le gardien');
    const lien = ecritures().find((a) => a.sql.startsWith('INSERT INTO gestion_location_edls'))!;
    expect(lien.params.slice(0, 4)).toEqual([500, 7, [11], 'clés chez le gardien']);
    // La date de l'EDLS EST la date d'état des lieux de l'occupation (une seule donnée — le tri la lit).
    const date = ecritures().find((a) => a.sql.startsWith('UPDATE gestion_annuaire_occupation'))!;
    expect(date.sql).toContain('SET etat_des_lieux_prevu_le = $2::date');
    expect(date.params).toEqual([[11], '2026-11-03']);
    expect(ecritures().filter((a) => a.sql.startsWith('INSERT INTO gestion_journal')).map((a) => a.params[1])).toEqual(['location_edls_planifie']);
    expect(appels.some((a) => /\bDELETE\b/.test(a.sql))).toBe(false);
    // LIRE (verrou) avant toute écriture.
    expect(appels.findIndex((a) => a.sql.includes('FOR UPDATE OF o'))).toBeLessThan(appels.findIndex((a) => /^(UPDATE|INSERT)/.test(a.sql)));
  });

  it('refus AVANT toute écriture : fin ≤ début, personne hors des deux tuiles, déjà planifié, locataire sorti', async () => {
    expect(await planifierEdls({ ...D, fin: '10:00' }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'fin' });
    expect(await planifierEdls({ ...D, confieA: 5 }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'confieA' });
    liens = [LIEN()];
    expect(await planifierEdls(D, AUTEUR)).toMatchObject({ etat: 'refus' });
    liens = [];
    groupe = [{ ...groupe[0], sortie: '2026-10-15' }];
    expect(await planifierEdls(D, AUTEUR)).toMatchObject({ etat: 'refus' });
    expect(creerTache).not.toHaveBeenCalled();
    expect(ecritures()).toHaveLength(0);
  });

  it('un autre EDLS arrivé entre-temps : la tâche créée est ANNULÉE (jamais effacée), aucun lien posé', async () => {
    liensApres = [LIEN({ tache_id: '499' })];
    expect(await planifierEdls(D, AUTEUR)).toMatchObject({ etat: 'refus' });
    expect(annulerTache).toHaveBeenCalledWith(500, AUTEUR);
    expect(ecritures().some((a) => a.sql.startsWith('INSERT INTO gestion_location_edls'))).toBe(false);
  });

  it('un ancien lien dont la tâche est annulée se CLÔT (jamais effacé) avant le nouveau', async () => {
    liens = [LIEN({ etat: 'annulee' })];
    expect(await planifierEdls(D, AUTEUR)).toMatchObject({ etat: 'ok' });
    const clos = ecritures().find((a) => a.sql.startsWith('UPDATE gestion_location_edls'))!;
    expect(clos.sql).toContain('SET clos_le = now()');
  });
});

describe('deplacerEdls', () => {
  const D = { occupationIds: [11], jour: '2026-11-05', debut: '14:00', fin: '15:00' };

  it('même personne : le module DÉCALE la tâche (demande relancée → « en attente ») ; nouveau mail « déplacé » ; date et journal', async () => {
    liens = [LIEN({ statut: 'acceptee' })];
    const r = await deplacerEdls(D, AUTEUR);
    expect(r).toMatchObject({ etat: 'ok', tacheId: 500 });
    expect(decalerTache).toHaveBeenCalledWith(500, { jour: '2026-11-05', heure: '14:00', dureeMinutes: 60 }, AUTEUR);
    expect(modifierTache).not.toHaveBeenCalled();
    // Le mail de la demande relancée est celui d'un DÉPLACEMENT (ancienne date portée).
    if (r.etat === 'ok') expect(r.demande?.ancienneDate).toEqual({ jour: '2026-11-03', heure: '10:00', dureeMinutes: 90 });
    const j = ecritures().find((a) => a.sql.startsWith('INSERT INTO gestion_journal'))!;
    expect(j.params.slice(1, 4)).toEqual(['location_edls_deplace', '2026-11-03 10:00 (90 min) — Claire Test', '2026-11-05 14:00 (60 min) — Claire Test']);
    expect(ecritures().find((a) => a.sql.startsWith('UPDATE gestion_annuaire_occupation'))!.params).toEqual([[11], '2026-11-05']);
  });

  it('autre personne : le module MODIFIE la tâche (nouvelle demande à la nouvelle personne)', async () => {
    liens = [LIEN()];
    await deplacerEdls({ ...D, confieA: 3 }, AUTEUR);
    expect(modifierTache).toHaveBeenCalledTimes(1);
    expect((modifierTache.mock.calls[0] as unknown[])[1]).toMatchObject({ jour: '2026-11-05', heure: '14:00', dureeMinutes: 60, confieeA: 3, objet: 'EDL de sortie' });
  });

  it('sans EDLS planifié, ou à l’identique : refus, rien n’est écrit', async () => {
    expect(await deplacerEdls(D, AUTEUR)).toMatchObject({ etat: 'refus' });
    liens = [LIEN()];
    expect(await deplacerEdls({ ...D, jour: '2026-11-03', debut: '10:00', fin: '11:30' }, AUTEUR)).toMatchObject({ etat: 'refus' });
    expect(ecritures()).toHaveLength(0);
  });
});

describe('reattribuerEdls — après un refus seulement', () => {
  it('refusé : nouvelle personne par le module (nouveau cycle), journalisé', async () => {
    liens = [LIEN({ statut: 'refusee' })];
    expect(await reattribuerEdls({ occupationIds: [11], confieA: 3 }, AUTEUR)).toMatchObject({ etat: 'ok' });
    expect((modifierTache.mock.calls[0] as unknown[])[1]).toMatchObject({ confieeA: 3, jour: '2026-11-03', heure: '10:00', dureeMinutes: 90 });
    expect(ecritures().some((a) => a.sql.startsWith('INSERT INTO gestion_journal') && a.params[1] === 'location_edls_reattribue')).toBe(true);
  });
  it('pas refusé : refus (utiliser « Déplacer »)', async () => {
    liens = [LIEN({ statut: 'en_attente' })];
    expect(await reattribuerEdls({ occupationIds: [11], confieA: 3 }, AUTEUR)).toMatchObject({ etat: 'refus' });
    expect(modifierTache).not.toHaveBeenCalled();
  });
});
