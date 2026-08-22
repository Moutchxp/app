import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * R5c — actions MANUELLES sur les brouillons de relance. On mocke `../db/client` (modèle demandeReponseRepo.test.ts) et on
 * capture chaque (sql, params). Les LECTURES de la régénération sont INJECTÉES (aucun accès config réel) ; les ÉCRITURES
 * passent par le withTransaction mocké. Protocole : COMPORTEMENT + PARAMÈTRES LIÉS + fragments SQL sémantiques normalisés.
 */
const { appels, etat, queryMock, withTransactionMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const etat = { updated: 1, insertedId: 700, relanceRows: [] as unknown[] };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    return { rows: etat.relanceRows, rowCount: etat.relanceRows.length };
  };
  const withTransactionMock = async (fn: (q: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>) => Promise<unknown>) => {
    const q = async (sql: string, params?: unknown[]) => {
      appels.push({ sql, params: params ?? [] });
      if (/INSERT INTO demande_relance/i.test(sql)) return { rows: [{ id: etat.insertedId }], rowCount: 1 };
      // maj/abandon avec RETURNING demande_id (regenerer abandonne SANS returning → tombe dans le défaut).
      if (/RETURNING demande_id/i.test(sql)) return { rows: etat.updated ? [{ demande_id: 42 }] : [], rowCount: etat.updated };
      return { rows: [], rowCount: 1 };
    };
    return fn(q);
  };
  return { appels, etat, queryMock, withTransactionMock };
});

vi.mock('../db/client', () => ({ query: queryMock, withTransaction: withTransactionMock, pool: {}, closePool: async () => undefined }));

import { majRelance, abandonnerRelance, regenererRelance, RelanceActionError, type DepsRegenerer } from './demandeRelanceRepo';
import type { CandidatDossier, ConfigDemandeur, Piece } from '../sitadel/demande';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const trouver = (fragment: RegExp) => appels.find((a) => fragment.test(a.sql));

beforeEach(() => { appels.length = 0; etat.updated = 1; etat.insertedId = 700; etat.relanceRows = []; });

// ── Fixtures de régénération ──────────────────────────────────────────────────
const DOSSIER_DU: CandidatDossier = {
  dossierId: 1, codeInsee: '92004', communeNom: 'Asnieres', canal: 'email', numDau: 'PC0920042500001',
  dateReelleAutorisation: '2025-06-15', adresse: '12 rue de la Paix', codePostal: '92600', cadastre: ['AB 12'], etatDau: null, absentDuDernierMillesime: false,
};
const DOSSIER_FAIT: CandidatDossier = { ...DOSSIER_DU, dossierId: 2, numDau: 'PC0920042500002' };
const CONFIG_ENT: ConfigDemandeur = {
  raisonSociale: 'Criterimmo', formeJuridique: 'SARL', siegeAdresse: '191 av. Charles de Gaulle, 92200 Neuilly',
  representantNom: 'A. Jorel', representantQualite: 'gérant', emailContact: 'contact@sansvisavis.com', telephone: '',
};
const PIECES: Piece[] = [{ code: 'PC2', description: 'plan de masse' }];

function depsRegen(over: Partial<DepsRegenerer> = {}): DepsRegenerer {
  return {
    lireRelance: async () => ({ demandeId: 42, profil: 'entreprise', statut: 'brouillon' }),
    lireDemande: async () => ({ statut: 'envoyee', reference: 'SVAV-DEM-2026-000042', envoyeLe: new Date('2026-03-14T10:00:00Z') }),
    chargerContexte: async () => ({ reglages: { echeanceAlerteJours: 7, releveFraicheurHeures: 48 }, profil: 'entreprise', config: CONFIG_ENT, pieces: PIECES, adresseReponse: 'demandes@sansvisavis.com' }),
    chargerLot: async () => ({ lot: { codeInsee: '92004', communeNom: 'Asnieres', canal: 'email', dossiers: [DOSSIER_DU, DOSSIER_FAIT] }, satisfaitsIds: [DOSSIER_FAIT.dossierId] }),
    ...over,
  };
}

describe('R5c — majRelance (édite un brouillon, journalise, n’écrit pas demande.statut)', () => {
  it('UPDATE objet/corps gardé par statut=brouillon + journal, renvoie true', async () => {
    const ok = await majRelance(9, 'NOUVEL OBJ', 'NOUVEAU CORPS', 'a.jorel');
    expect(ok).toBe(true);
    const upd = trouver(/UPDATE demande_relance SET objet/i)!;
    const s = norm(upd.sql);
    expect(s).toContain("statut = 'brouillon'");   // n'édite qu'un brouillon
    expect(s).toContain('RETURNING demande_id');
    expect(upd.params).toEqual([9, 'NOUVEL OBJ', 'NOUVEAU CORPS']);
    const jrn = trouver(/INSERT INTO demande_journal/i)!;
    expect(norm(jrn.sql)).toContain('VALUES ($1, NULL, NULL, $2, $3)'); // statut_avant/apres NON écrits
    expect(jrn.params).toEqual([42, 'relance 9 : objet/corps édités à la main', 'a.jorel']);
  });

  it('aucun brouillon touché → false et aucun journal', async () => {
    etat.updated = 0;
    expect(await majRelance(9, 'x', 'y', 'a.jorel')).toBe(false);
    expect(trouver(/INSERT INTO demande_journal/i)).toBeUndefined();
  });
});

describe('R5c — abandonnerRelance (statut → abandonnee, SANS nouvelle relance)', () => {
  it('UPDATE abandonnee (idempotent) + journal, renvoie true', async () => {
    const ok = await abandonnerRelance(9, 'a.jorel');
    expect(ok).toBe(true);
    const upd = trouver(/UPDATE demande_relance SET statut = 'abandonnee'/i)!;
    const s = norm(upd.sql);
    expect(s).toContain("statut <> 'abandonnee'"); // idempotence
    expect(s).toContain('RETURNING demande_id');
    expect(upd.params).toEqual([9]);
    // AUCUNE nouvelle relance produite (c'est la différence avec « régénérer »).
    expect(trouver(/INSERT INTO demande_relance/i)).toBeUndefined();
    const jrn = trouver(/INSERT INTO demande_journal/i)!;
    expect(jrn.params).toEqual([42, 'relance 9 abandonnée à la main', 'a.jorel']);
  });

  it('rien à abandonner → false', async () => {
    etat.updated = 0;
    expect(await abandonnerRelance(9, 'a.jorel')).toBe(false);
  });
});

describe('R5c — regenererRelance (abandonne le courant + produit un nouveau depuis les données actuelles)', () => {
  it('abandonne AVANT d’insérer (unique partiel 076) et ne liste QUE les dossiers dus', async () => {
    const nouvelId = await regenererRelance(9, 'a.jorel', depsRegen());
    expect(nouvelId).toBe(700);

    const iAb = appels.findIndex((a) => /UPDATE demande_relance SET statut = 'abandonnee' WHERE id = \$1 AND statut = 'brouillon'/i.test(a.sql));
    const iIns = appels.findIndex((a) => /INSERT INTO demande_relance/i.test(a.sql));
    expect(iAb).toBeGreaterThanOrEqual(0);
    expect(iIns).toBeGreaterThan(iAb); // abandon d'abord, insertion ensuite

    const ins = appels[iIns];
    expect(norm(ins.sql)).toContain("'brouillon'");
    expect(norm(ins.sql)).toContain('variante');    // cascade lot 2 — variante écrite à la création (régénération manuelle)…
    expect(norm(ins.sql)).toContain("'saisine'");    // …et vaut 'saisine' (CHECK élargi migration 136 ; écart 'formelle' du lot 1 refermé)
    const [demandeId, objet, corps, profil] = ins.params as [number, string, string, string];
    expect(demandeId).toBe(42);
    expect(profil).toBe('entreprise');
    // lot 1 — un SEUL dossier DÛ (l'autre satisfait) → objet par NUMÉRO de permis, la référence interne SVAV-DEM n'apparaît
    //   nulle part (règle E). L'INSERT stocke toujours variante='formelle' (assertions ci-dessus, CHECK migration 128).
    expect(objet).toContain('n° PC0920042500001');         // objet régénéré depuis les données actuelles (numéro de permis)
    expect(objet).not.toContain('SVAV-DEM-2026-000042');
    expect(corps).toContain('PC0920042500001');            // dossier DÛ listé…
    expect(corps).not.toContain('PC0920042500002');        // …dossier déjà satisfait EXCLU (R6c)
    expect(trouver(/INSERT INTO demande_journal/i)).toBeDefined();
  });

  it('relance non-brouillon → RelanceActionError, aucune écriture', async () => {
    await expect(regenererRelance(9, 'a', depsRegen({ lireRelance: async () => ({ demandeId: 42, profil: 'entreprise', statut: 'abandonnee' }) })))
      .rejects.toBeInstanceOf(RelanceActionError);
    expect(appels.some((a) => /INSERT INTO demande_relance/i.test(a.sql))).toBe(false);
  });

  it('demande « close » → refus (la clôture empêche toute relance)', async () => {
    await expect(regenererRelance(9, 'a', depsRegen({ lireDemande: async () => ({ statut: 'close', reference: 'X', envoyeLe: new Date('2026-03-14T10:00:00Z') }) })))
      .rejects.toThrow(/clôture|close/i);
    expect(appels.some((a) => /INSERT INTO demande_relance/i.test(a.sql))).toBe(false);
  });

  it('plus aucun dossier dû → AucunDossierNonSatisfaitError (remonte pour un 409 explicite)', async () => {
    await expect(regenererRelance(9, 'a', depsRegen({ chargerLot: async () => ({ lot: { codeInsee: '92004', communeNom: 'Asnieres', canal: 'email', dossiers: [DOSSIER_DU, DOSSIER_FAIT] }, satisfaitsIds: [DOSSIER_DU.dossierId, DOSSIER_FAIT.dossierId] }) })))
      .rejects.toThrow(/tous les dossiers sont satisfaits/i);
  });
});

describe('R5c — aucune action de relance n’écrit demande.statut (assertion explicite)', () => {
  it('majRelance / abandonnerRelance / regenererRelance : jamais d’UPDATE de la table demande', async () => {
    await majRelance(9, 'o', 'c', 'a');
    await abandonnerRelance(9, 'a');
    await regenererRelance(9, 'a', depsRegen());
    // demande_relance / demande_journal sont écrits, mais JAMAIS la table `demande` (statut/clôture ont un autre écrivain).
    expect(appels.some((a) => /UPDATE\s+demande\b/i.test(a.sql))).toBe(false);
  });
});
