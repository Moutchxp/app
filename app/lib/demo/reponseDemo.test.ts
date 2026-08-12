import { describe, it, expect, vi } from 'vitest';
import type { QueryResult } from 'pg';
import type { ReponseEntrante, PieceAvecContenu, BilanDepot } from '../veille/demandeReponseRepo';
import {
  estProduction, estBaseLocale, SQL_DOSSIER_SUR, pdfDemo, creerDemo, supprimerDemo,
  REFERENCE_DEMO, MESSAGE_ID_DEMO, NOMS_PIECES_DEMO, type FnRequete, type DepsCreation,
} from './reponseDemo';

/**
 * DÉMO — cœur PUR testé sans base : la `query` injectée est un mock qui ENREGISTRE (sql, params) et RÉPOND selon un dispatch par
 * fragment SQL. On prouve les deux garanties exigées : (1) la sélection du dossier sûr EXCLUT tout dossier rattaché à une demande
 * active ; (2) la suppression ne cible QUE les identifiants de la démo (scope demande_id + double-garde par la référence sentinelle),
 * et est idempotente. Plus : les gardes d'environnement et le passage par les fonctions de PRODUCTION (enregistrerReponse / dépôt).
 */
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

interface Appel { sql: string; params: unknown[] }
function mockQuery(reponses: (sql: string) => unknown[] | undefined, appels: Appel[]): FnRequete {
  return (async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    const rows = reponses(sql) ?? [];
    return { rows, rowCount: rows.length } as unknown as QueryResult;
  }) as FnRequete;
}
const withTx = (q: FnRequete) => async <T>(fn: (r: FnRequete) => Promise<T>): Promise<T> => fn(q);

describe('DÉMO — gardes d’environnement (refus par défaut hors local / production)', () => {
  it('estProduction : « production »/« prod » → vrai ; le reste → faux', () => {
    expect(estProduction('production')).toBe(true);
    expect(estProduction('prod')).toBe(true);
    expect(estProduction('Production')).toBe(true);
    expect(estProduction('development')).toBe(false);
    expect(estProduction('test')).toBe(false);
    expect(estProduction(undefined)).toBe(false);
  });

  it('estBaseLocale : n’AUTORISE que les hôtes de bouclage ; refuse distant / illisible / absent', () => {
    expect(estBaseLocale('postgresql://u:p@localhost:5432/svav')).toBe(true);
    expect(estBaseLocale('postgres://127.0.0.1/svav')).toBe(true);
    expect(estBaseLocale('postgresql://u@[::1]:5432/svav')).toBe(true);
    expect(estBaseLocale('postgresql://u:p@db.abcd.supabase.co:5432/postgres')).toBe(false); // base distante → refus
    expect(estBaseLocale('postgresql://u:p@10.0.0.5:5432/svav')).toBe(false);
    expect(estBaseLocale('pas une url')).toBe(false);
    expect(estBaseLocale(undefined)).toBe(false);
    expect(estBaseLocale('')).toBe(false);
  });
});

describe('DÉMO — SQL_DOSSIER_SUR : exclut tout dossier rattaché à une demande ACTIVE', () => {
  it('le critère est l’exact complément de l’index unique partiel (NOT EXISTS … dd.actif)', () => {
    const s = norm(SQL_DOSSIER_SUR);
    expect(s).toContain('FROM sitadel_dossier s');
    expect(s).toContain('NOT EXISTS');
    expect(s).toContain('FROM demande_dossier dd WHERE dd.dossier_id = s.id AND dd.actif'); // exclusion des rattachés actifs
    expect(s).toContain('JOIN commune c ON c.code_insee = s.code_insee');                    // code_insee valide pour la FK demande
    expect(s).toContain('LIMIT 1');
  });
});

describe('DÉMO — pdfDemo : PDF minimal valide généré à la volée', () => {
  it('produit un Buffer %PDF … %%EOF portant le titre, avec échappement des caractères spéciaux', () => {
    const pdf = pdfDemo('PC2 (DÉMO)');
    expect(Buffer.isBuffer(pdf)).toBe(true);
    const s = pdf.toString('latin1');
    expect(s.startsWith('%PDF-')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(s).toContain('xref');
    expect(s).toContain('PC2 \\(DÉMO\\)'); // la parenthèse est échappée dans la chaîne PDF
  });
});

describe('DÉMO — creerDemo : refus de sécurité', () => {
  const base = (over: Partial<DepsCreation>): DepsCreation => ({
    query: mockQuery(() => [], []), withTransaction: (fn) => fn(mockQuery(() => [], [])),
    enregistrerReponse: vi.fn(async () => 1), deposerEtLierPieces: vi.fn(async () => ({ deposees: 2, nonDeposees: 0 })),
    stockageConfigure: () => true, maintenant: new Date('2026-08-13T10:00:00Z'), ...over,
  });

  it('refuse si le stockage n’est pas configuré (la démo dépose de vraies pièces)', async () => {
    await expect(creerDemo(base({ stockageConfigure: () => false }))).rejects.toThrow(/stockage/i);
  });

  it('refuse si la démo existe déjà (référence sentinelle présente)', async () => {
    const appels: Appel[] = [];
    const q = mockQuery((sql) => (sql.includes('SELECT id FROM demande WHERE reference') ? [{ id: 42 }] : []), appels);
    await expect(creerDemo(base({ query: q }))).rejects.toThrow(/déjà présente/i);
  });

  it('refuse s’il n’existe aucun dossier sûr', async () => {
    const q = mockQuery((sql) => (sql.includes('sitadel_dossier') ? [] : []), []);
    await expect(creerDemo(base({ query: q }))).rejects.toThrow(/aucun dossier sûr/i);
  });
});

describe('DÉMO — creerDemo : chemin nominal (production + sentinelles)', () => {
  it('insère la demande sentinelle sur le dossier sûr, puis passe par enregistrerReponse + deposerEtLierPieces (2 PDF)', async () => {
    const appels: Appel[] = [];
    const q = mockQuery((sql) => {
      if (sql.includes('SELECT id FROM demande WHERE reference')) return [];                         // pas encore créée
      if (sql.includes('sitadel_dossier')) return [{ dossier_id: 42, num_dau: 'PC0920042500001', code_insee: '92004', commune_nom: 'Asnières' }];
      if (sql.includes('RETURNING id')) return [{ id: 500 }];                                        // INSERT demande
      return [];
    }, appels);
    const enregistrerReponse = vi.fn<(r: ReponseEntrante) => Promise<number | null>>(() => Promise.resolve(777));
    const deposerEtLierPieces = vi.fn<(reponseId: number, demandeId: number | null, pieces: PieceAvecContenu[], t: number) => Promise<BilanDepot>>(
      () => Promise.resolve({ deposees: 2, nonDeposees: 0 }),
    );
    const r = await creerDemo({
      query: q, withTransaction: withTx(q), enregistrerReponse, deposerEtLierPieces,
      stockageConfigure: () => true, maintenant: new Date('2026-08-13T10:00:00Z'),
    });

    expect(r).toMatchObject({ demandeId: 500, reference: REFERENCE_DEMO, dossierId: 42, reponseId: 777, bilan: { deposees: 2 } });
    // demande insérée avec la référence sentinelle + le code_insee DU DOSSIER SÛR, statut envoyée
    const insDem = appels.find((a) => a.sql.includes('INSERT INTO demande ') && a.sql.includes('RETURNING id'))!;
    expect(insDem.params[0]).toBe(REFERENCE_DEMO);
    expect(insDem.params[1]).toBe('92004');
    expect(norm(insDem.sql)).toContain("statut, objet, corps, dest_canal, dest_email, dest_nom, note");
    expect(norm(insDem.sql)).toContain("VALUES ($1, $2, 'envoyee'");
    // dossier sûr rattaché (actif) + acheminement daté
    expect(appels.some((a) => a.sql.includes('INSERT INTO demande_dossier') && a.params[1] === 42)).toBe(true);
    expect(appels.some((a) => a.sql.includes('INSERT INTO demande_acheminement'))).toBe(true);
    // réponse RATTACHÉE via la fonction de PRODUCTION : demande_id + méthode manuel + 2 pièces PDF, message_id sentinelle
    expect(enregistrerReponse).toHaveBeenCalledTimes(1);
    const rep = enregistrerReponse.mock.calls[0][0];
    expect(rep).toMatchObject({ demandeId: 500, messageId: MESSAGE_ID_DEMO, rattachementMethode: 'manuel' });
    expect(rep.pieces?.map((p) => p.nomFichier)).toEqual(NOMS_PIECES_DEMO);
    // DÉPÔT via la fonction de PRODUCTION, 2 contenus PDF, dans le bon ordre
    expect(deposerEtLierPieces).toHaveBeenCalledTimes(1);
    const [repId, demId, pieces] = deposerEtLierPieces.mock.calls[0];
    expect(repId).toBe(777); expect(demId).toBe(500);
    expect(pieces).toHaveLength(2);
    expect(pieces.every((p) => Buffer.isBuffer(p.contenu) && p.contenu.toString('latin1').startsWith('%PDF-'))).toBe(true);
    expect(pieces.map((p) => p.nomFichier)).toEqual(NOMS_PIECES_DEMO);
  });
});

describe('DÉMO — supprimerDemo : scellée sur la démo, idempotente', () => {
  it('idempotent : aucune demande sentinelle → aucun DELETE, aucun objet supprimé', async () => {
    const appels: Appel[] = [];
    const q = mockQuery(() => [], appels); // la référence sentinelle ne renvoie rien
    const supprimer = vi.fn<(cle: string) => Promise<void>>(() => Promise.resolve());
    const r = await supprimerDemo({ query: q, withTransaction: withTx(q), supprimer });
    expect(r).toEqual({ supprime: false, demandeId: null, objetsStockage: 0 });
    expect(appels.some((a) => /DELETE/i.test(a.sql))).toBe(false);
    expect(supprimer).not.toHaveBeenCalled();
  });

  it('efface UNIQUEMENT la démo : objets de stockage de SES pièces + lignes scellées sur demande_id, DELETE final double-gardé par la référence', async () => {
    const appels: Appel[] = [];
    const q = mockQuery((sql) => {
      if (sql.includes('SELECT id FROM demande WHERE reference')) return [{ id: 500 }];
      if (sql.includes('cle_stockage')) return [{ cle_stockage: 'demandes/500/reponses/777/a.pdf' }, { cle_stockage: 'demandes/500/reponses/777/b.pdf' }];
      return [];
    }, appels);
    const supprimer = vi.fn<(cle: string) => Promise<void>>(() => Promise.resolve());
    const r = await supprimerDemo({ query: q, withTransaction: withTx(q), supprimer });

    expect(r).toEqual({ supprime: true, demandeId: 500, objetsStockage: 2 });
    // stockage : uniquement les 2 clés des pièces de la démo
    expect(supprimer.mock.calls.map((c) => c[0])).toEqual(['demandes/500/reponses/777/a.pdf', 'demandes/500/reponses/777/b.pdf']);
    // la lecture des clés est bornée à la demande démo (r.demande_id = $1 = 500)
    const selCles = appels.find((a) => a.sql.includes('cle_stockage') && a.sql.includes('JOIN demande_reponse'))!;
    expect(selCles.params).toEqual([500]);
    // TOUS les DELETE sont scopés sur demande_id = 500 (jamais un balayage large)
    const deletes = appels.filter((a) => /^\s*DELETE/i.test(a.sql));
    expect(deletes.length).toBeGreaterThanOrEqual(5);
    expect(deletes.every((a) => a.params[0] === 500)).toBe(true);
    // les tables filles attendues sont bien ciblées
    for (const t of ['demande_reponse', 'demande_acheminement', 'demande_relance', 'demande_dossier', 'demande_journal']) {
      expect(deletes.some((a) => new RegExp(`DELETE FROM ${t}\\b`).test(a.sql) && a.params.length === 1 && a.params[0] === 500)).toBe(true);
    }
    // DELETE FINAL de la demande : DOUBLE-GARDE (id ET référence sentinelle) → impossible d'atteindre une autre demande
    const delDem = deletes.find((a) => /DELETE FROM demande\b/.test(a.sql) && a.sql.includes('reference'))!;
    expect(delDem.params).toEqual([500, REFERENCE_DEMO]);
  });
});
