import { describe, it, expect, vi, beforeEach } from 'vitest';

// Le déclenchement réel écrit en base : on mocke le client DB pour éprouver le SQL émis (fragments) sans connexion.
// L'orchestration est éprouvée par INJECTION (aucun accès DB réel).
vi.mock('../db/client', () => ({ query: vi.fn(), withTransaction: vi.fn() }));

import { query, withTransaction } from '../db/client';
import {
  executerRelanceAuto, depsReellesRelance, libelleEnvoi,
  type DepsRelanceAuto, type DemandeEnvoyeeRelance, type ContexteRelance, type LotRelance,
} from './relanceAuto';
import type { Lot, CandidatDossier, ConfigDemandeur, Piece } from '../sitadel/demande';

const queryMock = vi.mocked(query as unknown as (...a: unknown[]) => Promise<{ rows: unknown[] }>);
const withTxMock = vi.mocked(withTransaction as unknown as (fn: (q: unknown) => unknown) => Promise<unknown>);

beforeEach(() => { queryMock.mockReset(); withTxMock.mockReset(); });

const DOSSIER: CandidatDossier = {
  dossierId: 1, codeInsee: '92004', communeNom: 'Asnieres', canal: 'email', type: 'PC', numDau: 'PC0920042500001',
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
  reglages: { echeanceAlerteJours: 7, releveFraicheurHeures: 48 },
  cascade: { rappelJoursAvant: 10, avisJoursAvant: 3, saisineDelaiJours: 4 },
  profil: 'entreprise', config: CONFIG_ENT, pieces: PIECES, adresseReponse: 'demandes@sansvisavis.com',
};
// Envoi 14 mars → échéance 14 avril ; 1 dossier actif, aucun satisfait, acheminement 'envoye'.
const DEMANDE: DemandeEnvoyeeRelance = {
  demandeId: 42, reference: 'SVAV-DEM-2026-000042', envoyeLe: new Date('2026-03-14T10:00:00Z'),
  statutAcheminement: 'envoye', dossiersActifs: 1, dossiersSatisfaits: 0,
};

function makeDeps(over: Partial<DepsRelanceAuto> = {}): DepsRelanceAuto {
  return {
    maintenant: () => new Date('2026-04-20T12:00:00Z'),                        // échéance 14 avril dépassée → cible 'saisine'
    lireContexte: vi.fn(async () => CONTEXTE),
    derniereReleveOkLe: vi.fn(async () => new Date('2026-04-20T06:00:00Z')),   // relève fraîche (6 h)
    lireDemandesEnvoyees: vi.fn(async () => [DEMANDE]),
    estSuspendue: vi.fn(async () => false), // CASC-1 : non suspendue par défaut (cascade inchangée)
    lireVivante: vi.fn(async () => null),
    relanceExiste: vi.fn(async () => false),
    dossiersSatisfaitsDepuisRelance: vi.fn(async () => false),
    journaliser: vi.fn(async () => {}),
    lireLot: vi.fn(async () => LOT_RELANCE),
    lireHistorique: vi.fn(async () => []),
    enregistrerRelance: vi.fn(async () => 1),
    transiterRelance: vi.fn(async () => 2),
    ...over,
  };
}

describe('lot 3 — executerRelanceAuto : création de l’étape cible', () => {
  it('échéance dépassée, aucune relance → crée l’étape « saisine » (variante passée, objet par numéro de permis)', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({ enregistrerRelance }));
    expect(bilan).toMatchObject({ examinees: 1, creees: 1, ignorees: 0, erreurs: 0, signalees: 0, identiteIncomplete: false });
    const [demandeId, profil, variante, objet, corps, motif] = enregistrerRelance.mock.calls[0] as unknown as [number, string, string, string, string, string];
    expect(demandeId).toBe(42);
    expect(profil).toBe('entreprise');
    expect(variante).toBe('saisine');                        // étape cible passée explicitement
    expect(objet).toContain('n° PC0920042500001');           // un seul dossier → numéro de permis, jamais SVAV-DEM
    expect(objet).not.toContain('SVAV-DEM');
    expect(corps).toContain('R. 311-12');                    // saisine : refus tacite
    expect(motif).toMatch(/saisine/);
  });

  it('avant l’échéance (fenêtre « rappel ») → crée l’étape « rappel », courtoise (ni CADA ni refus)', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    await executerRelanceAuto(makeDeps({ maintenant: () => new Date('2026-04-06T10:00:00Z'), enregistrerRelance })); // reste 8 j → rappel
    const [, , variante, , corps] = enregistrerRelance.mock.calls[0] as unknown as [number, string, string, string, string];
    expect(variante).toBe('rappel');
    expect(corps).not.toContain('CADA');
    expect(corps).not.toContain('refus');
  });

  it('trop tôt (reste > rappel) → aucune étape (fenêtre null)', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({ maintenant: () => new Date('2026-04-01T10:00:00Z'), enregistrerRelance })); // reste 13 j
    expect(bilan.examinees).toBe(0);
    expect(enregistrerRelance).not.toHaveBeenCalled();
  });
});

describe('lot 3 — qualification (B) : aucune génération hors conditions', () => {
  it('relève NON fraîche → aucune génération (silence non vérifié)', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({
      derniereReleveOkLe: vi.fn(async () => new Date('2026-04-01T00:00:00Z')), // 19 j > 48 h → trop vieille
      enregistrerRelance,
    }));
    expect(bilan.examinees).toBe(0);
    expect(enregistrerRelance).not.toHaveBeenCalled();
  });

  it('acheminement en REBOND → aucune génération (demande non délivrée, pas d’échéance)', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({
      lireDemandesEnvoyees: vi.fn(async () => [{ ...DEMANDE, statutAcheminement: 'rebond' }]),
      enregistrerRelance,
    }));
    expect(bilan.examinees).toBe(0);
    expect(enregistrerRelance).not.toHaveBeenCalled();
  });

  it('tous les dossiers satisfaits (aucun dû) → aucune génération', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({
      lireLot: vi.fn(async () => ({ lot: LOT, satisfaitsIds: [DOSSIER.dossierId] })), // 1 actif, 1 satisfait → 0 dû
      enregistrerRelance,
    }));
    expect(bilan).toMatchObject({ examinees: 1, creees: 0, ignorees: 1 });
    expect(enregistrerRelance).not.toHaveBeenCalled();
  });

  it('CASC-1 — demande SUSPENDUE (dossier partiel) → AUCUNE relance ordinaire préparée (ni examinée)', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({ estSuspendue: vi.fn(async () => true), enregistrerRelance }));
    expect(bilan).toMatchObject({ examinees: 0, creees: 0, ignorees: 1 });
    expect(enregistrerRelance).not.toHaveBeenCalled();
  });

  it('CASC-1 — NON-RÉGRESSION : demande NON suspendue → cascade inchangée (l’étape cible est bien créée)', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const bilan = await executerRelanceAuto(makeDeps({ estSuspendue: vi.fn(async () => false), enregistrerRelance }));
    expect(bilan).toMatchObject({ examinees: 1, creees: 1, ignorees: 0 });
    expect(enregistrerRelance).toHaveBeenCalledTimes(1);
  });
});

describe('lot 3 — idempotence & transition (C/D)', () => {
  it('vivante == cible → ne rien faire (aucune écriture)', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const transiterRelance = vi.fn(async () => 2);
    const bilan = await executerRelanceAuto(makeDeps({
      lireVivante: vi.fn(async () => ({ relanceId: 9, variante: 'saisine' as const })), // cible du jour = saisine
      enregistrerRelance, transiterRelance,
    }));
    expect(bilan).toMatchObject({ creees: 0, ignorees: 1 });
    expect(enregistrerRelance).not.toHaveBeenCalled();
    expect(transiterRelance).not.toHaveBeenCalled();
  });

  it('rappel → avis : TRANSITION (une vivante « rappel » précède la cible « avis »)', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const transiterRelance = vi.fn(async () => 2);
    const bilan = await executerRelanceAuto(makeDeps({
      maintenant: () => new Date('2026-04-12T10:00:00Z'),                         // reste 2 j → cible 'avis'
      lireVivante: vi.fn(async () => ({ relanceId: 9, variante: 'rappel' as const })),
      enregistrerRelance, transiterRelance,
    }));
    expect(bilan).toMatchObject({ creees: 1, ignorees: 0 });
    expect(enregistrerRelance).not.toHaveBeenCalled();                            // jamais un simple INSERT : c'est une transition
    const [ancienneId, demandeId, , variante, , , cible] = transiterRelance.mock.calls[0] as unknown as [number, number, string, string, string, string, string];
    expect(ancienneId).toBe(9); expect(demandeId).toBe(42);
    expect(variante).toBe('avis'); expect(cible).toBe('avis');
  });

  it('R5c — pas de vivante MAIS une relance existe (abandonnée) → la cascade s’arrête (aucune résurrection)', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    const transiterRelance = vi.fn(async () => 2);
    const bilan = await executerRelanceAuto(makeDeps({
      lireVivante: vi.fn(async () => null), relanceExiste: vi.fn(async () => true),
      enregistrerRelance, transiterRelance,
    }));
    expect(bilan).toMatchObject({ creees: 0, ignorees: 1, signalees: 0 });
    expect(enregistrerRelance).not.toHaveBeenCalled();
    expect(transiterRelance).not.toHaveBeenCalled();
  });

  it('vivante == cible ET dossiers satisfaits DEPUIS → non régénérée, mais SIGNALÉE au journal (R6c)', async () => {
    const journaliser = vi.fn(async () => {});
    const bilan = await executerRelanceAuto(makeDeps({
      lireVivante: vi.fn(async () => ({ relanceId: 9, variante: 'saisine' as const })),
      dossiersSatisfaitsDepuisRelance: vi.fn(async () => true), journaliser,
    }));
    expect(bilan).toMatchObject({ creees: 0, ignorees: 1, signalees: 1 });
    expect(journaliser).toHaveBeenCalledWith(42, expect.stringMatching(/NON régénérée/));
  });
});

describe('lot 3 — historique (E), identité et isolation', () => {
  it('historique : « Pour mémoire » avec la demande initiale PUIS la relance, dans l’ordre reçu', async () => {
    const enregistrerRelance = vi.fn(async () => 1);
    await executerRelanceAuto(makeDeps({
      lireHistorique: vi.fn(async () => [
        { date: new Date('2026-03-14T09:00:00Z'), libelle: 'demande initiale, adressée par courrier électronique' },
        { date: new Date('2026-04-06T09:00:00Z'), libelle: 'nouvelle demande' },
      ]),
      enregistrerRelance,
    }));
    const corps = (enregistrerRelance.mock.calls[0] as unknown as [number, string, string, string, string])[4];
    expect(corps).toContain('Pour mémoire, nos échanges concernant ce permis :');
    const iInit = corps.indexOf('— 14 mars 2026 : demande initiale');
    const iRel = corps.indexOf('— 6 avril 2026 : nouvelle demande');
    expect(iInit).toBeGreaterThanOrEqual(0);
    expect(iRel).toBeGreaterThan(iInit); // ordre chronologique croissant
  });

  it('identité incomplète → aucune relance, on ne lit même pas les demandes', async () => {
    const lireDemandesEnvoyees = vi.fn(async () => [DEMANDE]);
    const bilan = await executerRelanceAuto(makeDeps({
      lireContexte: vi.fn(async () => ({ ...CONTEXTE, config: { ...CONFIG_ENT, raisonSociale: '' } })),
      lireDemandesEnvoyees,
    }));
    expect(bilan.identiteIncomplete).toBe(true);
    expect(lireDemandesEnvoyees).not.toHaveBeenCalled();
  });

  it('ISOLATION : un échec sur une demande n’arrête pas les suivantes', async () => {
    const d2: DemandeEnvoyeeRelance = { ...DEMANDE, demandeId: 43, reference: 'SVAV-DEM-2026-000043' };
    const enregistrerRelance = vi.fn().mockRejectedValueOnce(new Error('course')).mockResolvedValueOnce(2);
    const bilan = await executerRelanceAuto(makeDeps({
      lireDemandesEnvoyees: vi.fn(async () => [DEMANDE, d2]), enregistrerRelance,
    }));
    expect(bilan).toMatchObject({ examinees: 2, creees: 1, erreurs: 1 });
  });
});

describe('lot 3 — libelleEnvoi (E) : nature d’un envoi de l’historique', () => {
  it('relance_id NULL → demande initiale ; rappel/avis → nouvelle demande ; saisine → information de saisine', () => {
    expect(libelleEnvoi(null, null)).toBe('demande initiale, adressée par courrier électronique');
    expect(libelleEnvoi(7, 'rappel')).toBe('nouvelle demande');
    expect(libelleEnvoi(7, 'avis')).toBe('nouvelle demande');
    expect(libelleEnvoi(7, 'saisine')).toBe('information de la saisine à venir');
  });
});

describe('lot 3 — depsReellesRelance : SQL émis (fragments sémantiques, paramètres liés)', () => {
  it('lireVivante : la relance NON abandonnée + sa variante (paramètre lié)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 9, variante: 'rappel' }] });
    const v = await depsReellesRelance().lireVivante(42);
    expect(v).toEqual({ relanceId: 9, variante: 'rappel' });
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    const norm = sql.replace(/\s+/g, ' ');
    expect(norm).toContain('FROM demande_relance');
    expect(norm).toContain("statut <> 'abandonnee'");
    expect(params).toEqual([42]);
  });

  it('lireHistorique : jointure acheminement × relance, émissions réelles triées par date', async () => {
    queryMock.mockResolvedValueOnce({ rows: [
      { envoye_le: new Date('2026-03-14T09:00:00Z'), relance_id: null, variante: null },
      { envoye_le: new Date('2026-04-06T09:00:00Z'), relance_id: 9, variante: 'rappel' },
    ] });
    const h = await depsReellesRelance().lireHistorique(42);
    expect(h.map((e) => e.libelle)).toEqual(['demande initiale, adressée par courrier électronique', 'nouvelle demande']);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    const norm = sql.replace(/\s+/g, ' ');
    expect(norm).toContain('FROM demande_acheminement a LEFT JOIN demande_relance rl ON rl.id = a.relance_id');
    expect(norm).toContain("a.envoye_le IS NOT NULL AND a.statut = 'envoye'");
    expect(norm).toContain('ORDER BY a.envoye_le ASC');
    expect(params).toEqual([42]);
  });

  it('R5c — relanceExiste : EXISTS sur demande_relance SANS filtre de statut (une abandonnée compte aussi)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ existe: true }] });
    await depsReellesRelance().relanceExiste(42);
    const norm = (queryMock.mock.calls[0][0] as string).replace(/\s+/g, ' ');
    expect(norm).toContain('FROM demande_relance');
    expect(norm).not.toContain("statut <> 'abandonnee'"); // une abandonnée bloque aussi l'auto
  });

  it('enregistrerRelance : INSERT brouillon avec la variante en PARAMÈTRE LIÉ + journal « systeme »', async () => {
    const q = vi.fn().mockResolvedValueOnce({ rows: [{ id: 55 }] }).mockResolvedValueOnce({ rows: [] });
    withTxMock.mockImplementationOnce(async (fn) => fn(q));
    const id = await depsReellesRelance().enregistrerRelance(42, 'entreprise', 'avis', 'OBJ', 'CORPS', 'motif X');
    expect(id).toBe(55);
    const relanceSql = (q.mock.calls[0][0] as string).replace(/\s+/g, ' ');
    expect(relanceSql).toContain('INSERT INTO demande_relance');
    expect(relanceSql).toContain("'brouillon'");
    expect(q.mock.calls[0][1]).toEqual([42, 'OBJ', 'CORPS', 'entreprise', 'avis']); // variante = paramètre lié ($5)
    expect((q.mock.calls[1][0] as string)).toContain('INSERT INTO demande_journal');
    expect(q.mock.calls[1][1]).toEqual([42, 'motif X']);
  });

  it('transiterRelance : UNE transaction — abandon (+ note) → INSERT nouvelle → journal', async () => {
    const q = vi.fn()
      .mockResolvedValueOnce({ rows: [] })            // UPDATE abandonnee + note
      .mockResolvedValueOnce({ rows: [{ id: 70 }] })  // INSERT nouvelle
      .mockResolvedValueOnce({ rows: [] });           // journal
    withTxMock.mockImplementationOnce(async (fn) => fn(q));
    const id = await depsReellesRelance().transiterRelance(9, 42, 'entreprise', 'avis', 'OBJ', 'CORPS', 'avis');
    expect(id).toBe(70);
    const upd = (q.mock.calls[0][0] as string).replace(/\s+/g, ' ');
    expect(upd).toContain("UPDATE demande_relance SET statut = 'abandonnee'");
    expect(upd).toContain('note = btrim(coalesce(note || chr(10)');
    expect(upd).toContain("WHERE id = $1 AND statut <> 'abandonnee'");
    expect(q.mock.calls[0][1]).toEqual([9, "remplacée par l'étape « avis »"]);
    const ins = (q.mock.calls[1][0] as string).replace(/\s+/g, ' ');
    expect(ins).toContain('INSERT INTO demande_relance');
    expect(q.mock.calls[1][1]).toEqual([42, 'OBJ', 'CORPS', 'entreprise', 'avis']);
    expect((q.mock.calls[2][0] as string)).toContain('INSERT INTO demande_journal');
  });
});
