import { describe, it, expect, vi, beforeEach } from 'vitest';

// Le déclenchement réel écrit en base : on mocke le client DB pour éprouver le SQL émis (fragments) sans connexion.
// L'orchestration est éprouvée par INJECTION (aucun accès DB réel).
vi.mock('../db/client', () => ({ query: vi.fn(), withTransaction: vi.fn() }));

import { query, withTransaction } from '../db/client';
import { executerRelanceAuto, depsReellesRelance, type DepsRelanceAuto, type DemandeEnvoyeeRelance, type ContexteRelance } from './relanceAuto';
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
const PIECES: Piece[] = [{ code: 'PC2', description: '' }, { code: 'PC3', description: '' }];
const CONFIG_ENT: ConfigDemandeur = {
  raisonSociale: 'Criterimmo', formeJuridique: 'SARL', siegeAdresse: '191 av. Charles de Gaulle, 92200 Neuilly',
  representantNom: 'A. Jorel', representantQualite: 'gérant', emailContact: 'contact@sansvisavis.com', telephone: '',
};
const CONTEXTE: ContexteRelance = {
  reglages: { echeanceAlerteJours: 7, releveFraicheurHeures: 48 }, profil: 'entreprise', config: CONFIG_ENT,
  pieces: PIECES, adresseReponse: 'demandes@sansvisavis.com',
};
const DEMANDE_DEPASSEE: DemandeEnvoyeeRelance = {
  demandeId: 42, reference: 'SVAV-DEM-2026-000042', envoyeLe: new Date('2026-03-14T10:00:00Z'),
  statutAcheminement: 'envoye', aReponseRattachee: false,
};

function makeDeps(over: Partial<DepsRelanceAuto> = {}): DepsRelanceAuto {
  return {
    maintenant: () => new Date('2026-04-20T12:00:00Z'),                        // échéance 14 avril → dépassée
    lireContexte: vi.fn(async () => CONTEXTE),
    derniereReleveOkLe: vi.fn(async () => new Date('2026-04-20T06:00:00Z')),   // relève fraîche (6 h)
    lireDemandesEnvoyees: vi.fn(async () => [DEMANDE_DEPASSEE]),
    relanceVivante: vi.fn(async () => false),
    lireLot: vi.fn(async () => LOT),
    enregistrerRelance: vi.fn(async () => 1),
    ...over,
  };
}

describe('R6b — executerRelanceAuto : ne relance QUE sur « depassee »', () => {
  it('« depassee » → une relance créée (enregistrée avec le profil et un motif)', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({ enregistrerRelance }));

    expect(bilan).toMatchObject({ examinees: 1, creees: 1, ignorees: 0, erreurs: 0, identiteIncomplete: false });
    expect(enregistrerRelance).toHaveBeenCalledTimes(1);
    const [demandeId, profil, objet, corps, motif] = enregistrerRelance.mock.calls[0] as unknown as [number, string, string, string, string];
    expect(demandeId).toBe(42);
    expect(profil).toBe('entreprise');
    expect(objet).toContain('SVAV-DEM-2026-000042');
    expect(corps).toContain('R. 311-12');
    expect(motif).toMatch(/relance/i);
  });

  it('« indeterminee » (relève trop ancienne) → AUCUNE relance', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({
      derniereReleveOkLe: vi.fn(async () => new Date('2026-04-01T00:00:00Z')), // 19 j > 48 h → indéterminée
      enregistrerRelance,
    }));
    expect(bilan.creees).toBe(0);
    expect(bilan.examinees).toBe(0);
    expect(enregistrerRelance).not.toHaveBeenCalled();
  });

  it('« non_delivree » (rebond) → AUCUNE relance : pas de refus tacite à constater', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({
      lireDemandesEnvoyees: vi.fn(async () => [{ ...DEMANDE_DEPASSEE, statutAcheminement: 'rebond' }]),
      enregistrerRelance,
    }));
    expect(bilan.examinees).toBe(0);
    expect(enregistrerRelance).not.toHaveBeenCalled();
  });

  it('« proche » (avant l’échéance) → AUCUNE relance (seule « depassee » déclenche)', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({
      maintenant: () => new Date('2026-04-10T12:00:00Z'), // échéance 14 avril → dans 4 j → proche
      enregistrerRelance,
    }));
    expect(bilan.examinees).toBe(0);
    expect(enregistrerRelance).not.toHaveBeenCalled();
  });

  it('relance VIVANTE déjà présente → ignorée, aucune création', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({ relanceVivante: vi.fn(async () => true), enregistrerRelance }));
    expect(bilan).toMatchObject({ examinees: 1, creees: 0, ignorees: 1 });
    expect(enregistrerRelance).not.toHaveBeenCalled();
  });

  it('identité incomplète → AUCUNE relance, et on ne lit même pas les demandes', async () => {
    const lireDemandesEnvoyees = vi.fn(async () => [DEMANDE_DEPASSEE]);
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({
      lireContexte: vi.fn(async () => ({ ...CONTEXTE, config: { ...CONFIG_ENT, raisonSociale: '' } })),
      lireDemandesEnvoyees, enregistrerRelance,
    }));
    expect(bilan.identiteIncomplete).toBe(true);
    expect(bilan.creees).toBe(0);
    expect(lireDemandesEnvoyees).not.toHaveBeenCalled();
    expect(enregistrerRelance).not.toHaveBeenCalled();
  });

  it('ISOLATION : un échec d’enregistrement n’arrête pas les autres demandes', async () => {
    const d2: DemandeEnvoyeeRelance = { ...DEMANDE_DEPASSEE, demandeId: 43, reference: 'SVAV-DEM-2026-000043' };
    const enregistrerRelance = vi.fn()
      .mockRejectedValueOnce(new Error('course sur l’unique'))
      .mockResolvedValueOnce(2);
    const bilan = await executerRelanceAuto(makeDeps({
      lireDemandesEnvoyees: vi.fn(async () => [DEMANDE_DEPASSEE, d2]), enregistrerRelance,
    }));
    expect(bilan).toMatchObject({ examinees: 2, creees: 1, erreurs: 1 });
  });
});

describe('R6b — depsReellesRelance : SQL émis (fragments sémantiques, paramètres liés)', () => {
  it('relanceVivante : EXISTS sur demande_relance, type=relance, non abandonnée', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ vivante: true }] });
    const v = await depsReellesRelance().relanceVivante(42);

    expect(v).toBe(true);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    const norm = sql.replace(/\s+/g, ' ');
    expect(norm).toContain('FROM demande_relance');
    expect(norm).toContain("type = 'relance'");
    expect(norm).toContain("statut <> 'abandonnee'");
    expect(params).toEqual([42]);
  });

  it('enregistrerRelance : INSERT brouillon dans demande_relance + journal « systeme » SANS toucher demande.statut', async () => {
    const q = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 55 }] }) // INSERT demande_relance RETURNING id
      .mockResolvedValueOnce({ rows: [] });          // INSERT demande_journal
    withTxMock.mockImplementationOnce(async (fn) => fn(q));

    const id = await depsReellesRelance().enregistrerRelance(42, 'entreprise', 'OBJ', 'CORPS', 'motif X');

    expect(id).toBe(55);
    const relanceSql = (q.mock.calls[0][0] as string).replace(/\s+/g, ' ');
    expect(relanceSql).toContain('INSERT INTO demande_relance');
    expect(relanceSql).toContain("'relance'");
    expect(relanceSql).toContain("'brouillon'");
    expect(q.mock.calls[0][1]).toEqual([42, 'OBJ', 'CORPS', 'entreprise']);

    const journalSql = (q.mock.calls[1][0] as string).replace(/\s+/g, ' ');
    expect(journalSql).toContain('INSERT INTO demande_journal');
    expect(journalSql).toContain("'systeme'");
    expect(journalSql).toContain('statut_avant, statut_apres, motif, auteur');
    expect(journalSql).toContain('VALUES ($1, NULL, NULL, $2,'); // aucune transition de statut de la demande
    expect(q.mock.calls[1][1]).toEqual([42, 'motif X']);
  });
});
