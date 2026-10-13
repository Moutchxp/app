import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LOT TACHES-PIECES-DRIVE — l'ouverture sur le dossier du bien (et un bien sans dossier), la RÉFÉRENCE enregistrée
 * sans copie, le retrait tracé. Base et Drive simulés.
 */
let dossierDuBien: string | null = 'DOSSIER_LOT_27';
const lectures: string[] = [];
vi.mock('./annuaireRepo', () => ({
  ficheLot: async () => ({ etat: 'ok', data: { driveDossierId: dossierDuBien } }),
}));
vi.mock('./drive', async (orig) => ({
  ...(await orig<typeof import('./drive')>()),
  lireMetadonnees: async (_j: string, id: string) => {
    lectures.push(id);
    if (id === 'DOSSIER_X') return { ok: true, valeur: { id, nom: 'Un dossier', typeMime: 'application/vnd.google-apps.folder', lien: null, parents: [], tailleOctets: null } };
    if (id === 'INTERDIT') return { ok: false, motif: 'accès refusé (403)' };
    return { ok: true, valeur: { id, nom: id === 'DOSSIER_LOT_27' ? '26 - 7 avenue de l’Union' : `${id}.pdf`, typeMime: 'application/pdf', lien: `https://drive.google.com/file/d/${id}/view`, parents: [], tailleOctets: 10 } };
  },
}));

interface Appel { sql: string; params: unknown[] }
let appels: Appel[] = [];
const queryMock = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ');
  appels.push({ sql: s, params });
  if (s.includes('FROM gestion_tache WHERE id = $1 FOR UPDATE')) return { rows: [{ lot_id: 27, etat: 'a_faire', objet: 'x', note: null, jour: '2026-10-15', heure: null, rappels: [], confiee_a: 2, confiee_a_libelle: 'A', evenement_id: null }] };
  if (s.includes('FROM admin_utilisateur WHERE id = $1')) return { rows: [{ l: 'Arnaud Jorel' }] };
  if (s.startsWith('UPDATE gestion_tache_piece SET retire_le')) return { rows: [{ nom: 'Bail.pdf' }] };
  return { rows: [] };
});
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...(a as [string, unknown[]])),
  withTransaction: async (f: (q: unknown) => unknown) => f((...a: unknown[]) => queryMock(...(a as [string, unknown[]]))),
}));
vi.mock('./schema', () => ({ acceptationTacheDisponible: async () => false, agendaTacheDisponible: async () => false, piecesTacheDisponible: async () => true, contactsTacheDisponible: async () => false, tachesDisponibles: async () => true }));

const { departDuBien, relirePieces, RACINE_TACHES } = await import('./tachesDrive');
const { ajouterPieces, retirerPiece } = await import('./tachesRepo');
const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };

beforeEach(() => { appels = []; lectures.length = 0; dossierDuBien = 'DOSSIER_LOT_27'; });

describe('🔴 ouverture du sélecteur', () => {
  it('sur le dossier Drive du bien — le même que « Dossier Drive ↗ »', async () => {
    expect(await departDuBien('jeton', 27)).toEqual({ id: 'DOSSIER_LOT_27', nom: '26 - 7 avenue de l’Union' });
  });
  it('bien sans dossier Drive : null ⇒ la route ouvre à la racine, avec un message', async () => {
    dossierDuBien = null;
    expect(await departDuBien('jeton', 27)).toBeNull();
    expect(RACINE_TACHES).toBe('svav:racine');
  });
});

describe('🔴 la référence, sans copie', () => {
  it('chaque fichier choisi est RELU dans le Drive : nom, type et lien viennent de Google', async () => {
    const r = await relirePieces('jeton', ['Bail']);
    expect(r).toEqual({ ok: true, valeur: [{ driveId: 'Bail', nom: 'Bail.pdf', typeMime: 'application/pdf', lien: 'https://drive.google.com/file/d/Bail/view' }] });
  });
  it('un dossier ou un fichier illisible est refusé avec un message', async () => {
    expect(await relirePieces('jeton', ['DOSSIER_X'])).toMatchObject({ ok: false });
    expect(await relirePieces('jeton', ['INTERDIT'])).toMatchObject({ ok: false, motif: expect.stringContaining('403') });
  });
  it('seule la référence est écrite (identifiant, nom, type, lien, auteur) — aucun contenu', async () => {
    expect(await ajouterPieces(3, [{ driveId: 'Bail', nom: 'Bail.pdf', typeMime: 'application/pdf', lien: 'https://drive.google.com/file/d/Bail/view' }], AUTEUR))
      .toEqual({ ok: true, id: 3 });
    const ins = appels.find((a) => a.sql.startsWith('INSERT INTO gestion_tache_piece'));
    expect(ins?.params).toEqual([3, 'Bail', 'Bail.pdf', 'application/pdf', 'https://drive.google.com/file/d/Bail/view', 'Arnaud Jorel']);
    expect(ins?.sql).toContain('(tache_id, drive_fichier_id, nom, type_mime, lien, ajoute_par_libelle)');
    const trace = appels.find((a) => a.sql.includes('INSERT INTO gestion_tache_action'));
    expect(trace?.params[3]).toBe(JSON.stringify({ pieceAjoutee: 'Bail.pdf' }));
  });
});

describe('🔴 retirer une pièce : de la tâche seulement, et tracé', () => {
  it('marquée retirée, jamais effacée ; tracée ; aucun appel au Drive', async () => {
    expect(await retirerPiece(3, 'Bail', AUTEUR)).toEqual({ ok: true, id: 3 });
    expect(appels.some((a) => a.sql.startsWith('DELETE'))).toBe(false);
    const trace = appels.find((a) => a.sql.includes('INSERT INTO gestion_tache_action'));
    expect(trace?.params[3]).toBe(JSON.stringify({ pieceRetiree: 'Bail.pdf' }));
    expect(lectures).toEqual([]);
  });
});
