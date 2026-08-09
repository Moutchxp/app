import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * X2 — dépôt de la saisine CADA. Lectures INJECTÉES (pas de DB pour l'éligibilité/création) ; l'ÉCRITURE passe par le
 * withTransaction mocké. On mocke aussi query pour tester le SQL des candidats (fragments sémantiques, jamais la forme
 * complète). Protocole : comportement + paramètres liés.
 */
const { appels, etat, queryMock, withTransactionMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const etat = { rows: [] as unknown[], insertThrows: null as null | { code?: string; constraint?: string }, insertedId: 99 };
  const queryMock = async (sql: string, params?: unknown[]) => { appels.push({ sql, params: params ?? [] }); return { rows: etat.rows }; };
  const withTransactionMock = async (fn: (q: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) => Promise<unknown>) => {
    const q = async (sql: string, params?: unknown[]) => {
      appels.push({ sql, params: params ?? [] });
      if (/INSERT INTO demande_relance/i.test(sql)) {
        if (etat.insertThrows) { const e = new Error('dup'); Object.assign(e, etat.insertThrows); throw e; }
        return { rows: [{ id: etat.insertedId }] };
      }
      return { rows: [] };
    };
    return fn(q);
  };
  return { appels, etat, queryMock, withTransactionMock };
});
vi.mock('../db/client', () => ({ query: queryMock, withTransaction: withTransactionMock, pool: {}, closePool: async () => undefined }));

import {
  lireSaisinesEligibles, creerSaisineCada, depsReellesSaisissables, SaisineCadaError,
  type DepsSaisissables, type DepsCreerSaisine, type CandidatSaisine,
} from './saisineCadaRepo';
import { piecesDepuisConfig, type ConfigDemandeur, type Lot, type CandidatDossier } from '../sitadel/demande';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const trouver = (re: RegExp) => appels.find((a) => re.test(a.sql));
beforeEach(() => { appels.length = 0; etat.rows = []; etat.insertThrows = null; etat.insertedId = 99; });

// Repères temporels : envoi 14 mars → refus tacite 14 avril → forclusion 14 juin.
const ENVOI = new Date('2026-03-14T10:00:00Z');
const DANS_FENETRE = new Date('2026-05-10T12:00:00Z');   // entre 14 avr et 14 juin
const AVANT_REFUS = new Date('2026-04-01T12:00:00Z');
const APRES_FORCLUSION = new Date('2026-07-01T12:00:00Z');
const RELEVE_FRAICHE = new Date('2026-05-10T06:00:00Z'); // 6 h avant → fraîche (48 h)
const RELEVE_VIEILLE = new Date('2026-04-01T00:00:00Z'); // trop ancienne

const DOSSIER: CandidatDossier = { dossierId: 1, codeInsee: '92004', communeNom: 'Asnières-sur-Seine', canal: 'email', numDau: 'PC0920042500001', dateReelleAutorisation: '2025-06-15', adresse: '12 rue de la Paix', codePostal: '92600', cadastre: ['AB 12'], etatDau: null, absentDuDernierMillesime: false };
const LOT: Lot = { codeInsee: '92004', communeNom: 'Asnières-sur-Seine', canal: 'email', dossiers: [DOSSIER] };
const PIECES = piecesDepuisConfig('PC2,PC3');
const CONF_ENT: ConfigDemandeur = { raisonSociale: 'Criterimmo', formeJuridique: 'SARL', siegeAdresse: '191 avenue Charles de Gaulle 92200 Neuilly', representantNom: 'Arnaud JOREL', representantQualite: 'gérant', emailContact: 'a.jorel@sansvisavis.com', telephone: '' };

const CAND = (over: Partial<CandidatSaisine> = {}): CandidatSaisine => ({ demandeId: 1, reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnières-sur-Seine', profil: 'entreprise', envoyeLe: ENVOI, dossiersActifs: 2, dossiersDus: 1, ...over });
function depsElig(over: Partial<DepsSaisissables> = {}): DepsSaisissables {
  return { lireCandidats: async () => [CAND()], derniereReleveOkLe: async () => RELEVE_FRAICHE, fraicheurHeures: async () => 48, maintenant: () => DANS_FENETRE, ...over };
}
function depsCreer(over: Partial<DepsCreerSaisine> = {}): DepsCreerSaisine {
  return {
    lireMeta: async () => ({ statut: 'envoyee', reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnières-sur-Seine', profil: 'entreprise', envoyeLe: ENVOI, saisineVivante: false }),
    chargerContexte: async () => ({ reglages: { echeanceAlerteJours: 7, releveFraicheurHeures: 48 }, profil: 'entreprise', config: CONF_ENT, pieces: PIECES, adresseReponse: 'a.jorel@sansvisavis.com' }),
    chargerLot: async () => ({ lot: LOT, satisfaitsIds: [] }),
    derniereReleveOkLe: async () => RELEVE_FRAICHE,
    maintenant: () => DANS_FENETRE,
    ...over,
  };
}

describe('X2 — lireSaisinesEligibles : fenêtre + sincérité (relève fraîche)', () => {
  it('fenêtre ouverte + relève fraîche → SAISISSABLE (avec jours avant forclusion)', async () => {
    const r = await lireSaisinesEligibles(depsElig());
    expect(r.saisissables).toHaveLength(1);
    expect(r.indeterminees).toHaveLength(0);
    expect(r.saisissables[0].joursAvantForclusion).toBeGreaterThan(0);
    expect(r.saisissables[0].dossiersDus).toBe(1);
  });

  it('fenêtre ouverte MAIS relève NON fraîche → INDÉTERMINÉE, jamais saisissable (silence non vérifié)', async () => {
    const r = await lireSaisinesEligibles(depsElig({ derniereReleveOkLe: async () => RELEVE_VIEILLE }));
    expect(r.saisissables).toHaveLength(0);
    expect(r.indeterminees).toHaveLength(1);
  });

  it('relève jamais faite (null) → INDÉTERMINÉE', async () => {
    const r = await lireSaisinesEligibles(depsElig({ derniereReleveOkLe: async () => null }));
    expect(r.saisissables).toHaveLength(0);
    expect(r.indeterminees).toHaveLength(1);
  });

  it('avant le refus tacite → écartée (ni saisissable ni indéterminée)', async () => {
    const r = await lireSaisinesEligibles(depsElig({ maintenant: () => AVANT_REFUS }));
    expect(r.saisissables).toHaveLength(0);
    expect(r.indeterminees).toHaveLength(0);
  });

  it('après forclusion → écartée', async () => {
    const r = await lireSaisinesEligibles(depsElig({ maintenant: () => APRES_FORCLUSION, derniereReleveOkLe: async () => APRES_FORCLUSION }));
    expect(r.saisissables).toHaveLength(0);
    expect(r.indeterminees).toHaveLength(0);
  });
});

describe('X2 — depsReellesSaisissables : SQL des candidats (fragments sémantiques)', () => {
  it('filtre : envoyee + émission confirmée + dossier dû + AUCUNE saisine vivante', async () => {
    etat.rows = [];
    await depsReellesSaisissables().lireCandidats();
    const sel = trouver(/FROM demande d/i)!;
    const s = norm(sel.sql);
    expect(s).toContain("d.statut = 'envoyee'");
    expect(s).toContain("canal = 'email' AND statut = 'envoye'");                 // émission CONFIRMÉE
    expect(s).toContain('dd.actif AND dd.satisfait_le IS NULL');                  // au moins un dossier DÛ
    expect(s).toContain("rl.type = 'saisine_cada' AND rl.statut <> 'abandonnee'"); // pas de saisine vivante
  });
});

describe('X2 — creerSaisineCada : garde-fous + création brouillon + 23505', () => {
  it('happy path → INSERT type=saisine_cada / statut=brouillon (objet+corps figés, profil lié) + journal, renvoie l’id', async () => {
    const id = await creerSaisineCada(42, 'admin', depsCreer());
    expect(id).toBe(99);
    const ins = trouver(/INSERT INTO demande_relance/i)!;
    expect(norm(ins.sql)).toContain("'saisine_cada'");
    expect(norm(ins.sql)).toContain("'brouillon'");
    const [demandeId, objet, corps, profil] = ins.params as [number, string, string, string];
    expect(demandeId).toBe(42);
    expect(objet).toContain('Saisine de la Commission');
    expect(corps).toContain('PC0920042500001'); // le corps figé a bien été généré depuis le lot
    expect(profil).toBe('entreprise');
    const jrn = trouver(/INSERT INTO demande_journal/i)!;
    expect(norm(jrn.sql)).toContain('VALUES ($1, NULL, NULL, $2, $3)'); // append-only : demande.statut jamais écrit
    expect(jrn.params[0]).toBe(42);
  });

  it('demande non « envoyee » → refus métier, aucune insertion', async () => {
    await expect(creerSaisineCada(42, 'admin', depsCreer({ lireMeta: async () => ({ statut: 'close', reference: 'R', communeNom: 'X', profil: 'entreprise', envoyeLe: ENVOI, saisineVivante: false }) }))).rejects.toBeInstanceOf(SaisineCadaError);
    expect(trouver(/INSERT INTO demande_relance/i)).toBeUndefined();
  });

  it('saisine déjà vivante (pré-contrôle) → refus « déjà en cours »', async () => {
    await expect(creerSaisineCada(42, 'admin', depsCreer({ lireMeta: async () => ({ statut: 'envoyee', reference: 'R', communeNom: 'X', profil: 'entreprise', envoyeLe: ENVOI, saisineVivante: true }) }))).rejects.toThrow(/déjà en cours/i);
  });

  it('avant refus tacite → refus ; après forclusion → refus', async () => {
    await expect(creerSaisineCada(42, 'admin', depsCreer({ maintenant: () => AVANT_REFUS }))).rejects.toThrow(/refus tacite/i);
    await expect(creerSaisineCada(42, 'admin', depsCreer({ maintenant: () => APRES_FORCLUSION }))).rejects.toThrow(/forclos/i);
  });

  it('relève non fraîche → refus (silence non vérifié), aucune insertion', async () => {
    await expect(creerSaisineCada(42, 'admin', depsCreer({ derniereReleveOkLe: async () => RELEVE_VIEILLE }))).rejects.toThrow(/silence non vérifié/i);
    expect(trouver(/INSERT INTO demande_relance/i)).toBeUndefined();
  });

  it('tous les dossiers satisfaits → refus', async () => {
    await expect(creerSaisineCada(42, 'admin', depsCreer({ chargerLot: async () => ({ lot: LOT, satisfaitsIds: [1] }) }))).rejects.toThrow(/satisfaits/i);
  });

  it('23505 sur demande_relance_vivante_uniq (double-clic) → refus métier NOMMÉ, jamais un 503', async () => {
    etat.insertThrows = { code: '23505', constraint: 'demande_relance_vivante_uniq' };
    await expect(creerSaisineCada(42, 'admin', depsCreer())).rejects.toBeInstanceOf(SaisineCadaError);
    await expect(creerSaisineCada(42, 'admin', depsCreer())).rejects.toThrow(/déjà en cours/i);
  });

  it('23505 sur une AUTRE contrainte → n’est PAS masquée (relancée telle quelle)', async () => {
    etat.insertThrows = { code: '23505', constraint: 'autre_chose' };
    await expect(creerSaisineCada(42, 'admin', depsCreer())).rejects.not.toBeInstanceOf(SaisineCadaError);
  });
});
