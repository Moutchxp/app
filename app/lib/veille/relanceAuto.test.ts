import { describe, it, expect, vi, beforeEach } from 'vitest';

// Le déclenchement réel écrit en base : on mocke le client DB pour éprouver le SQL émis (fragments) sans connexion.
// L'orchestration est éprouvée par INJECTION (aucun accès DB réel).
vi.mock('../db/client', () => ({ query: vi.fn(), withTransaction: vi.fn() }));

import { query, withTransaction } from '../db/client';
import {
  executerRelanceAuto, depsReellesRelance,
  type DepsRelanceAuto, type DemandeEnvoyeeRelance, type ContexteRelance, type LotRelance,
} from './relanceAuto';
import type { Lot, CandidatDossier, ConfigDemandeur, Piece } from '../sitadel/demande';

const queryMock = vi.mocked(query as unknown as (...a: unknown[]) => Promise<{ rows: unknown[] }>);
const withTxMock = vi.mocked(withTransaction as unknown as (fn: (q: unknown) => unknown) => Promise<unknown>);

beforeEach(() => { queryMock.mockReset(); withTxMock.mockReset(); });

const DOSSIER: CandidatDossier = {
  dossierId: 1, codeInsee: '92004', communeNom: 'Asnieres', canal: 'email', numDau: 'PC0920042500001',
  dateReelleAutorisation: '2025-06-15', adresse: '12 rue de la Paix', codePostal: '92600', cadastre: ['AB 12'],
  etatDau: null, absentDuDernierMillesime: false,
};
const LOT: Lot = { codeInsee: '92004', communeNom: 'Asnieres', canal: 'email', dossiers: [DOSSIER] };
const LOT_RELANCE: LotRelance = { lot: LOT, satisfaitsIds: [] };
const PIECES: Piece[] = [{ code: 'PC2', description: 'plan de masse' }, { code: 'PC3', description: 'plan en coupe' }];
const CONFIG_ENT: ConfigDemandeur = {
  raisonSociale: 'Criterimmo', formeJuridique: 'SARL', siegeAdresse: '191 av. Charles de Gaulle, 92200 Neuilly',
  representantNom: 'A. Jorel', representantQualite: 'gérant', emailContact: 'contact@sansvisavis.com', telephone: '',
};
const CONTEXTE: ContexteRelance = {
  reglages: { echeanceAlerteJours: 7, releveFraicheurHeures: 48 }, profil: 'entreprise', config: CONFIG_ENT,
  pieces: PIECES, adresseReponse: 'demandes@sansvisavis.com',
};
// Envoi 14 mars → échéance 14 avril ; 1 dossier actif, aucun satisfait.
const DEMANDE_DEPASSEE: DemandeEnvoyeeRelance = {
  demandeId: 42, reference: 'SVAV-DEM-2026-000042', envoyeLe: new Date('2026-03-14T10:00:00Z'),
  statutAcheminement: 'envoye', dossiersActifs: 1, dossiersSatisfaits: 0,
};

function makeDeps(over: Partial<DepsRelanceAuto> = {}): DepsRelanceAuto {
  return {
    maintenant: () => new Date('2026-04-20T12:00:00Z'),                        // échéance 14 avril → dépassée
    lireContexte: vi.fn(async () => CONTEXTE),
    derniereReleveOkLe: vi.fn(async () => new Date('2026-04-20T06:00:00Z')),   // relève fraîche (6 h)
    lireDemandesEnvoyees: vi.fn(async () => [DEMANDE_DEPASSEE]),
    relanceExiste: vi.fn(async () => false),
    dossiersSatisfaitsDepuisRelance: vi.fn(async () => false),
    journaliser: vi.fn(async () => {}),
    lireLot: vi.fn(async () => LOT_RELANCE),
    enregistrerRelance: vi.fn(async () => 1),
    ...over,
  };
}

describe('R6c — executerRelanceAuto : ne relance QUE sur « depassee »', () => {
  it('« depassee » → une relance créée (profil, motif) et texte réel généré', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({ enregistrerRelance }));

    expect(bilan).toMatchObject({ examinees: 1, creees: 1, ignorees: 0, erreurs: 0, signalees: 0, identiteIncomplete: false });
    expect(enregistrerRelance).toHaveBeenCalledTimes(1);
    const [demandeId, profil, objet, corps, motif] = enregistrerRelance.mock.calls[0] as unknown as [number, string, string, string, string];
    expect(demandeId).toBe(42);
    expect(profil).toBe('entreprise');
    expect(objet).toContain('SVAV-DEM-2026-000042');
    expect(corps).toContain('R. 311-12');
    expect(motif).toMatch(/relance/i);
  });

  it('TOUS les dossiers satisfaits (état « repondue ») → aucune relance', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({
      lireDemandesEnvoyees: vi.fn(async () => [{ ...DEMANDE_DEPASSEE, dossiersActifs: 3, dossiersSatisfaits: 3 }]),
      enregistrerRelance,
    }));
    expect(bilan.examinees).toBe(0);
    expect(enregistrerRelance).not.toHaveBeenCalled();
  });

  it('« indeterminee » (relève trop ancienne) → aucune relance', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({
      derniereReleveOkLe: vi.fn(async () => new Date('2026-04-01T00:00:00Z')), // 19 j > 48 h → indéterminée
      enregistrerRelance,
    }));
    expect(bilan.examinees).toBe(0);
    expect(enregistrerRelance).not.toHaveBeenCalled();
  });

  it('« non_delivree » (rebond) → aucune relance', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({
      lireDemandesEnvoyees: vi.fn(async () => [{ ...DEMANDE_DEPASSEE, statutAcheminement: 'rebond' }]),
      enregistrerRelance,
    }));
    expect(bilan.examinees).toBe(0);
    expect(enregistrerRelance).not.toHaveBeenCalled();
  });

  it('« proche » (avant l’échéance, aucun satisfait) → aucune relance', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({
      maintenant: () => new Date('2026-04-10T12:00:00Z'), // échéance 14 avril → dans 4 j → proche
      enregistrerRelance,
    }));
    expect(bilan.examinees).toBe(0);
    expect(enregistrerRelance).not.toHaveBeenCalled();
  });

  it('§5 — course : lireLot ne renvoie plus aucun dossier dû → aucune relance', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({
      // l'état dit « dépassée » (1 actif / 0 satisfait) mais entre-temps le dossier a été satisfait → 0 dû.
      lireLot: vi.fn(async () => ({ lot: LOT, satisfaitsIds: [DOSSIER.dossierId] })),
      enregistrerRelance,
    }));
    expect(bilan).toMatchObject({ examinees: 1, creees: 0, ignorees: 1 });
    expect(enregistrerRelance).not.toHaveBeenCalled();
  });
});

describe('R5c/R6c — executerRelanceAuto : une relance EXISTE déjà (règle R5c) et note d’obsolescence', () => {
  it('R5c — relance déjà présente (même abandonnée) → aucune nouvelle relance (un abandon manuel est respecté)', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({ relanceExiste: vi.fn(async () => true), enregistrerRelance }));
    expect(bilan).toMatchObject({ ignorees: 1, creees: 0, signalees: 0 });
    expect(enregistrerRelance).not.toHaveBeenCalled(); // le changement de règle du chantier : plus de résurrection au tic suivant
  });

  it('relance existante SANS nouvelle satisfaction → ignorée, aucune note', async () => {
    const journaliser = vi.fn(async () => {});
    const bilan = await executerRelanceAuto(makeDeps({ relanceExiste: vi.fn(async () => true), journaliser }));
    expect(bilan).toMatchObject({ ignorees: 1, creees: 0, signalees: 0 });
    expect(journaliser).not.toHaveBeenCalled();
  });

  it('relance vivante ET dossiers satisfaits DEPUIS → NON régénérée, mais signalée au journal', async () => {
    const journaliser = vi.fn(async () => {});
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({
      relanceExiste: vi.fn(async () => true),
      dossiersSatisfaitsDepuisRelance: vi.fn(async () => true),
      journaliser, enregistrerRelance,
    }));
    expect(bilan).toMatchObject({ creees: 0, ignorees: 1, signalees: 1 });
    expect(enregistrerRelance).not.toHaveBeenCalled();
    expect(journaliser).toHaveBeenCalledWith(42, expect.stringMatching(/NON régénérée/));
  });
});

describe('R6c — executerRelanceAuto : identité et isolation', () => {
  it('identité incomplète → aucune relance, on ne lit même pas les demandes', async () => {
    const lireDemandesEnvoyees = vi.fn(async () => [DEMANDE_DEPASSEE]);
    const bilan = await executerRelanceAuto(makeDeps({
      lireContexte: vi.fn(async () => ({ ...CONTEXTE, config: { ...CONFIG_ENT, raisonSociale: '' } })),
      lireDemandesEnvoyees,
    }));
    expect(bilan.identiteIncomplete).toBe(true);
    expect(lireDemandesEnvoyees).not.toHaveBeenCalled();
  });

  it('ISOLATION : un échec d’enregistrement n’arrête pas les autres demandes', async () => {
    const d2: DemandeEnvoyeeRelance = { ...DEMANDE_DEPASSEE, demandeId: 43, reference: 'SVAV-DEM-2026-000043' };
    const enregistrerRelance = vi.fn().mockRejectedValueOnce(new Error('course')).mockResolvedValueOnce(2);
    const bilan = await executerRelanceAuto(makeDeps({
      lireDemandesEnvoyees: vi.fn(async () => [DEMANDE_DEPASSEE, d2]), enregistrerRelance,
    }));
    expect(bilan).toMatchObject({ examinees: 2, creees: 1, erreurs: 1 });
  });
});

describe('R6c — depsReellesRelance : SQL émis (fragments sémantiques, paramètres liés)', () => {
  it('lireDemandesEnvoyees : compte dossiers actifs et satisfaits (paramètre profil lié)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await depsReellesRelance().lireDemandesEnvoyees('entreprise');
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    const norm = sql.replace(/\s+/g, ' ');
    expect(norm).toContain('FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif');
    expect(norm).toContain('dd.satisfait_le IS NOT NULL');
    expect(norm).toContain("d.statut = 'envoyee'");
    expect(params).toEqual(['entreprise']);
  });

  it('R5c — relanceExiste : EXISTS sur demande_relance SANS filtre de statut (une abandonnée compte aussi)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ existe: true }] });
    const v = await depsReellesRelance().relanceExiste(42);
    expect(v).toBe(true);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    const norm = sql.replace(/\s+/g, ' ');
    expect(norm).toContain('FROM demande_relance');
    expect(norm).toContain("type = 'relance'");
    // Le changement de règle : plus de filtre `statut <> 'abandonnee'` → une relance abandonnée bloque aussi l'auto.
    expect(norm).not.toContain("statut <> 'abandonnee'");
    expect(params).toEqual([42]);
  });

  it('dossiersSatisfaitsDepuisRelance : satisfaction postérieure à la relance vivante', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ obsolete: true }] });
    const o = await depsReellesRelance().dossiersSatisfaitsDepuisRelance(42);
    expect(o).toBe(true);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    const norm = sql.replace(/\s+/g, ' ');
    expect(norm).toContain('FROM demande_relance rl');
    expect(norm).toContain('dd.satisfait_le > rl.generee_le');
    expect(params).toEqual([42]);
  });

  it('journaliser : note « systeme » sans transition de statut de la demande', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await depsReellesRelance().journaliser(42, 'note X');
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    const norm = sql.replace(/\s+/g, ' ');
    expect(norm).toContain('INSERT INTO demande_journal');
    expect(norm).toContain("VALUES ($1, NULL, NULL, $2, 'systeme')");
    expect(params).toEqual([42, 'note X']);
  });

  it('enregistrerRelance : INSERT brouillon + journal « systeme », sans toucher demande.statut', async () => {
    const q = vi.fn().mockResolvedValueOnce({ rows: [{ id: 55 }] }).mockResolvedValueOnce({ rows: [] });
    withTxMock.mockImplementationOnce(async (fn) => fn(q));

    const id = await depsReellesRelance().enregistrerRelance(42, 'entreprise', 'OBJ', 'CORPS', 'motif X');

    expect(id).toBe(55);
    const relanceSql = (q.mock.calls[0][0] as string).replace(/\s+/g, ' ');
    expect(relanceSql).toContain('INSERT INTO demande_relance');
    expect(relanceSql).toContain("'brouillon'");
    expect(q.mock.calls[0][1]).toEqual([42, 'OBJ', 'CORPS', 'entreprise']);
    const journalSql = (q.mock.calls[1][0] as string).replace(/\s+/g, ' ');
    expect(journalSql).toContain('INSERT INTO demande_journal');
    expect(journalSql).toContain('VALUES ($1, NULL, NULL, $2,');
    expect(q.mock.calls[1][1]).toEqual([42, 'motif X']);
  });
});
