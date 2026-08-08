import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * R1 — repo des RÉPONSES entrantes. On mocke `../db/client` (modèle demandeRepoTransition.test.ts) et on capture chaque
 * (sql, params) émis. Protocole : on assère le COMPORTEMENT et les PARAMÈTRES LIÉS ; le SQL n'est vérifié que par
 * FRAGMENTS sémantiques sur une chaîne whitespace-normalisée, jamais par sa forme exacte.
 */
const { appels, etat, queryMock, withTransactionMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const etat = { rows: [] as unknown[], rowCount: 1, conflit: false };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    return { rows: etat.rows, rowCount: etat.rowCount };
  };
  const withTransactionMock = async (fn: (q: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>) => Promise<unknown>) => {
    const q = async (sql: string, params?: unknown[]) => {
      appels.push({ sql, params: params ?? [] });
      // ON CONFLICT DO NOTHING : conflit → 0 ligne renvoyée (message déjà connu).
      if (/RETURNING id/i.test(sql)) return etat.conflit ? { rows: [], rowCount: 0 } : { rows: [{ id: 4242 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    };
    return fn(q);
  };
  return { appels, etat, queryMock, withTransactionMock };
});

vi.mock('../db/client', () => ({
  query: queryMock,
  withTransaction: withTransactionMock,
  pool: {},
  closePool: async () => undefined,
}));

import { enregistrerReponse, listerReponses, rattacherAMain, marquerTraitee, deposerEtLierPieces, type ReponseEntrante, type PieceAvecContenu } from './demandeReponseRepo';
import type { ResultatDepotEntrant } from '../stockage';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const trouver = (fragment: RegExp) => appels.find((a) => fragment.test(a.sql));

beforeEach(() => { appels.length = 0; etat.rows = []; etat.rowCount = 1; etat.conflit = false; });

const RECU = new Date('2026-08-04T21:30:00.000Z');
const BASE: ReponseEntrante = {
  profilBoite: 'entreprise',
  messageId: '<29d85848-20c3-1430-45fe-81c7bcf9cafe@sansvisavis.com>', // AVEC chevrons
  deAdresse: 'urba-reglementaire@mairie-aubervilliers.fr',
  recuLe: RECU,
};

describe('R1 — enregistrerReponse', () => {
  it('insère dans demande_reponse (RETURNING id) avec les paramètres liés dans l’ordre du schéma, et renvoie l’id', async () => {
    const id = await enregistrerReponse({
      ...BASE, demandeId: 154, inReplyTo: '<in@reply>', referencesBrut: '<a> <b>', deNom: 'Mairie', objet: 'RE: réf.',
      corpsTexte: 'texte', rattachementMethode: 'message_id', rattacheLe: RECU, note: 'n',
    });
    expect(id).toBe(4242);
    const ins = trouver(/INSERT INTO demande_reponse\b/i);
    expect(ins).toBeDefined();
    expect(norm(ins!.sql)).toContain('INSERT INTO demande_reponse');
    expect(norm(ins!.sql)).toContain('ON CONFLICT (message_id) DO NOTHING'); // idempotence (R3)
    expect(norm(ins!.sql)).toContain('RETURNING id');
    // paramètres liés, dans l'ordre du schéma
    expect(ins!.params).toEqual([
      154, 'entreprise', '<29d85848-20c3-1430-45fe-81c7bcf9cafe@sansvisavis.com>', '<in@reply>', '<a> <b>',
      'urba-reglementaire@mairie-aubervilliers.fr', 'Mairie', 'RE: réf.', RECU, 'texte', 'message_id', RECU, 'n',
    ]);
  });

  it('demandeId absent → NULL lié (file « à rattacher ») et rattachement_methode défaut « aucun »', async () => {
    await enregistrerReponse(BASE);
    const ins = trouver(/INSERT INTO demande_reponse\b/i)!;
    expect(ins.params[0]).toBeNull();            // demande_id
    expect(ins.params[10]).toBe('aucun');        // rattachement_methode (défaut)
    expect(ins.params[11]).toBeNull();           // rattache_le
    expect(ins.params[2]).toBe(BASE.messageId);  // message_id AVEC chevrons, tel quel
  });

  it('chaque pièce est insérée dans demande_reponse_piece avec le reponse_id lié (dépôt non fait → cle_stockage NULL)', async () => {
    await enregistrerReponse({ ...BASE, pieces: [{ nomFichier: 'PC2.pdf', typeMime: 'application/pdf', tailleOctets: 12345 }] });
    const pj = trouver(/INSERT INTO demande_reponse_piece\b/i);
    expect(pj).toBeDefined();
    expect(pj!.params[0]).toBe(4242);            // reponse_id = id RETURNING
    expect(pj!.params[1]).toBe('PC2.pdf');
    expect(pj!.params[2]).toBe('application/pdf');
    expect(pj!.params[3]).toBe(12345);
    expect(pj!.params[4]).toBeNull();            // cle_stockage : rien déposé dans ce chantier
    expect(pj!.params[6]).toBeNull();            // stocke_le
  });

  it('sans pièces : aucun INSERT dans demande_reponse_piece', async () => {
    await enregistrerReponse(BASE);
    expect(trouver(/INSERT INTO demande_reponse_piece\b/i)).toBeUndefined();
  });

  it('message déjà connu (ON CONFLICT message_id) → renvoie null et n’insère aucune pièce', async () => {
    etat.conflit = true;
    const id = await enregistrerReponse({ ...BASE, pieces: [{ nomFichier: 'PC2.pdf', typeMime: 'application/pdf' }] });
    expect(id).toBeNull();
    expect(trouver(/INSERT INTO demande_reponse_piece\b/i)).toBeUndefined();
  });
});

describe('R4 — deposerEtLierPieces (dépôt injecté, base mockée)', () => {
  const PIECES = (n: number): PieceAvecContenu[] => Array.from({ length: n }, (_, i) => ({ nomFichier: `f${i}.pdf`, typeMime: 'application/pdf', contenu: Buffer.from(`x${i}`) }));

  it('type accepté → déposé : persiste cle_stockage + empreinte ; deposer appelé SANS le nom d’origine', async () => {
    etat.rows = [{ id: 100, cle_stockage: null }]; // ligne de pièce renvoyée par le SELECT
    const deposer = vi.fn(async (): Promise<ResultatDepotEntrant> => ({ depose: true, cle: 'demandes/1/reponses/4242/uuid.pdf', taille: 2, empreinte: 'abc123' }));
    const bilan = await deposerEtLierPieces(4242, 1, PIECES(1), 50 * 1024 * 1024, deposer);

    expect(bilan).toEqual({ deposees: 1, nonDeposees: 0 });
    // deposer reçoit (contenu, typeMime, opts) — JAMAIS le nomFichier → le nom d'origine ne peut pas entrer dans la clé.
    expect(deposer).toHaveBeenCalledWith(Buffer.from('x0'), 'application/pdf', { demandeId: 1, reponseId: 4242, tailleMaxOctets: 50 * 1024 * 1024 });
    const upd = trouver(/SET cle_stockage/i);
    expect(upd?.params).toEqual([100, 'demandes/1/reponses/4242/uuid.pdf', 2, 'abc123']);
  });

  it('type refusé → non déposé : ligne conservée, motif renseigné', async () => {
    etat.rows = [{ id: 100, cle_stockage: null }];
    const deposer = vi.fn(async (): Promise<ResultatDepotEntrant> => ({ depose: false, motif: 'type non autorisé pour le dépôt : « x/x »' }));
    const bilan = await deposerEtLierPieces(4242, 1, PIECES(1), 50 * 1024 * 1024, deposer);

    expect(bilan).toEqual({ deposees: 0, nonDeposees: 1 });
    const upd = trouver(/SET motif_non_stocke/i);
    expect(upd?.params).toEqual([100, 'type non autorisé pour le dépôt : « x/x »']);
  });

  it('IDEMPOTENCE : pièce déjà déposée (cle_stockage renseignée) → deposer JAMAIS rappelé', async () => {
    etat.rows = [{ id: 100, cle_stockage: 'demandes/1/reponses/4242/deja.pdf' }];
    const deposer = vi.fn(async (): Promise<ResultatDepotEntrant> => ({ depose: true, cle: 'x', taille: 1, empreinte: 'y' }));
    const bilan = await deposerEtLierPieces(4242, 1, PIECES(1), 50 * 1024 * 1024, deposer);

    expect(deposer).not.toHaveBeenCalled();
    expect(bilan.deposees).toBe(1);
  });

  it('ISOLATION : l’échec d’UNE pièce n’empêche ni les autres ni la réponse (aucune exception)', async () => {
    etat.rows = [{ id: 100, cle_stockage: null }, { id: 101, cle_stockage: null }];
    let call = 0;
    const deposer = vi.fn(async (): Promise<ResultatDepotEntrant> => {
      call += 1;
      if (call === 1) throw new Error('S3 down');
      return { depose: true, cle: 'demandes/1/reponses/4242/ok.pdf', taille: 2, empreinte: 'ok' };
    });
    const bilan = await deposerEtLierPieces(4242, 1, PIECES(2), 50 * 1024 * 1024, deposer);

    expect(bilan).toEqual({ deposees: 1, nonDeposees: 1 });
    const echec = appels.find((a) => /SET motif_non_stocke/i.test(a.sql) && String(a.params[1]).includes('échec de dépôt'));
    expect(echec).toBeDefined();
  });

  it('réponse NON rattachée → deposer reçoit demandeId null (clé « non-rattachees »)', async () => {
    etat.rows = [{ id: 100, cle_stockage: null }];
    const deposer = vi.fn(async (): Promise<ResultatDepotEntrant> => ({ depose: true, cle: 'demandes/non-rattachees/4242/uuid.pdf', taille: 2, empreinte: 'z' }));
    await deposerEtLierPieces(4242, null, PIECES(1), 50 * 1024 * 1024, deposer);

    expect(deposer).toHaveBeenCalledWith(expect.anything(), 'application/pdf', { demandeId: null, reponseId: 4242, tailleMaxOctets: 50 * 1024 * 1024 });
  });
});

describe('R1 — listerReponses (filtres par paramètre lié, jamais d’interpolation)', () => {
  it('par demande_id → clause paramétrée + paramètre lié', async () => {
    await listerReponses({ demandeId: 154 });
    const sel = trouver(/FROM demande_reponse/i)!;
    expect(sel.params).toEqual([154]);
    expect(norm(sel.sql)).toContain('WHERE demande_id = $1');
    expect(norm(sel.sql)).toContain('ORDER BY recu_le DESC');
  });

  it('non rattachées → WHERE demande_id IS NULL, aucun paramètre', async () => {
    await listerReponses({ nonRattachees: true });
    const sel = trouver(/FROM demande_reponse/i)!;
    expect(sel.params).toEqual([]);
    expect(norm(sel.sql)).toContain('WHERE demande_id IS NULL');
  });

  it('sans filtre → aucune clause WHERE, aucun paramètre', async () => {
    await listerReponses();
    const sel = trouver(/FROM demande_reponse/i)!;
    expect(sel.params).toEqual([]);
    expect(norm(sel.sql)).not.toContain('WHERE');
  });

  it('mappe les colonnes snake_case → camelCase', async () => {
    etat.rows = [{
      id: 7, demande_id: 154, profil_boite: 'entreprise', message_id: '<x@y>', de_adresse: 'a@b', de_nom: 'Mairie',
      objet: 'RE', recu_le: '2026-08-04 21:30:00+00', rattachement_methode: 'message_id',
      rattache_le: '2026-08-05 09:00:00+00', traite_le: null, note: null, cree_le: '2026-08-05 09:00:00+00',
    }];
    const [r] = await listerReponses({ demandeId: 154 });
    expect(r).toEqual({
      id: 7, demandeId: 154, profilBoite: 'entreprise', messageId: '<x@y>', deAdresse: 'a@b', deNom: 'Mairie',
      objet: 'RE', recuLe: '2026-08-04 21:30:00+00', rattachementMethode: 'message_id',
      rattacheLe: '2026-08-05 09:00:00+00', traiteLe: null, note: null, creeLe: '2026-08-05 09:00:00+00',
    });
  });
});

describe('R1 — rattacherAMain (n’écrit JAMAIS demande.statut)', () => {
  it('pose demande_id + méthode « manuel » + rattache_le, consigne l’auteur, renvoie true si une ligne est modifiée', async () => {
    etat.rowCount = 1;
    const ok = await rattacherAMain(7, 154, 'a.jorel');
    expect(ok).toBe(true);
    const upd = trouver(/UPDATE demande_reponse\b/i)!;
    expect(upd.params).toEqual([7, 154, 'rattaché à la main par a.jorel']);
    const s = norm(upd.sql);
    expect(s).toContain("rattachement_methode = 'manuel'");
    expect(s).toContain('rattache_le = now()');
    // ne touche PAS demande.statut : la seule table ciblée est demande_reponse, aucun 'statut'
    expect(s).toContain('UPDATE demande_reponse');
    expect(s).not.toContain('statut');
    expect(appels.some((a) => /UPDATE\s+demande\b(?!_reponse)/i.test(a.sql))).toBe(false);
  });

  it('aucune ligne modifiée → false', async () => {
    etat.rowCount = 0;
    expect(await rattacherAMain(999, 154, 'a.jorel')).toBe(false);
  });
});

describe('R1 — marquerTraitee (idempotent, n’écrit pas demande.statut)', () => {
  it('pose traite_le=now() gardé par traite_le IS NULL, renvoie true', async () => {
    etat.rowCount = 1;
    const ok = await marquerTraitee(9);
    expect(ok).toBe(true);
    const upd = trouver(/UPDATE demande_reponse\b/i)!;
    expect(upd.params).toEqual([9]);
    const s = norm(upd.sql);
    expect(s).toContain('traite_le = now()');
    expect(s).toContain('traite_le IS NULL');   // idempotence
    expect(s).not.toContain('statut');
  });

  it('déjà traitée → aucune ligne → false', async () => {
    etat.rowCount = 0;
    expect(await marquerTraitee(9)).toBe(false);
  });
});
