import { describe, it, expect, vi } from 'vitest';
import { deposerPieces, messageEtatGoogle, resumerDepot, type DepsDepot, type IssuePiece } from './depotDrive';
import type { DepotDrive } from './driveRepo';

const AUTEUR = { id: 7, libelle: 'Arnaud Jorel' };

function deps(o: {
  pieces?: Record<number, { nomFichier: string; typeMime: string | null; cleStockage: string } | null>;
  existants?: Record<string, DepotDrive>;
  depot?: DepsDepot['deposer'];
  memoriser?: DepsDepot['memoriser'];
  infos?: { nom: string; driveId: string | null } | null;
} = {}): DepsDepot & { deposes: string[]; memorises: number[] } {
  const deposes: string[] = [];
  const memorises: number[] = [];
  return {
    get deposes() { return deposes; },
    get memorises() { return memorises; },
    lirePiece: async (id) => {
      const p = (o.pieces ?? {})[id];
      if (p === undefined) return { pieceId: id, nomFichier: `piece-${id}.pdf`, typeMime: 'application/pdf', cleStockage: `k${id}` };
      return p === null ? null : { pieceId: id, ...p };
    },
    octets: async () => new Uint8Array([1, 2, 3]),
    depotExistant: async (pieceId, dossierId) => (o.existants ?? {})[`${pieceId}:${dossierId}`] ?? null,
    deposer: o.depot ?? (async (_j, x) => { deposes.push(x.nom); return { ok: true, valeur: { id: `F${x.nom}`, nom: x.nom, webViewLink: `https://drive/${x.nom}` } }; }),
    memoriser: o.memoriser ?? (async (d) => { memorises.push(d.pieceId); return { etat: 'enregistre' }; }),
    infosDossier: async () => (o.infos === undefined ? { nom: 'Dupont', driveId: 'DRV' } : o.infos),
  };
}

const etats = (i: IssuePiece[]): string[] => i.map((x) => x.etat);

describe('déposer des pièces', () => {
  it('une pièce part, et le lien Drive revient', async () => {
    const d = deps();
    const i = await deposerPieces(d, 'jeton', [1], 'DOS', AUTEUR);
    expect(etats(i)).toEqual(['depose']);
    expect(i[0].etat === 'depose' && i[0].lien).toBe('https://drive/piece-1.pdf');
    expect(d.memorises).toEqual([1]);
  });

  it('le nom du dossier est mémorisé AVEC le dépôt — pour survivre à un renommage dans le Drive', async () => {
    const vus: unknown[] = [];
    const d = deps({ memoriser: async (x) => { vus.push(x); return { etat: 'enregistre' }; } });
    await deposerPieces(d, 'j', [1], 'DOS', AUTEUR);
    expect(vus[0]).toMatchObject({ dossierNom: 'Dupont', driveId: 'DRV', auteurLibelle: 'Arnaud Jorel' });
  });

  /**
   * 🔴 LE DOUBLON N'EST PAS UNE ERREUR. Le Drive d'un propriétaire n'a pas besoin de deux exemplaires du même bail :
   * on rend « déjà là » AVEC le lien vers le fichier existant, et on ne téléverse rien.
   */
  it('une pièce déjà dans CE dossier n’est pas renvoyée — et le lien existant est proposé', async () => {
    const d = deps({
      existants: { '1:DOS': { pieceId: 1, driveFileId: 'F', dossierId: 'DOS', dossierNom: 'Dupont', webViewLink: 'https://drive/deja', deposeLe: '', deposePar: 'x' } },
    });
    const i = await deposerPieces(d, 'j', [1], 'DOS', AUTEUR);
    expect(etats(i)).toEqual(['deja']);
    expect(i[0].etat === 'deja' && i[0].lien).toBe('https://drive/deja');
    expect(d.deposes).toEqual([]); // rien n'a été téléversé
  });

  it('la même pièce dans un AUTRE dossier reste possible', async () => {
    const d = deps({
      existants: { '1:AUTRE': { pieceId: 1, driveFileId: 'F', dossierId: 'AUTRE', dossierNom: null, webViewLink: null, deposeLe: '', deposePar: 'x' } },
    });
    expect(etats(await deposerPieces(d, 'j', [1], 'DOS', AUTEUR))).toEqual(['depose']);
  });

  /** Deux clics simultanés : la base tranche, et le second apprend que le fichier est là — pas qu'il a échoué. */
  it('un refus de la base (index unique) devient « déjà là », jamais un échec', async () => {
    const d = deps({ memoriser: async () => ({ etat: 'doublon' }) });
    expect(etats(await deposerPieces(d, 'j', [1], 'DOS', AUTEUR))).toEqual(['deja']);
  });

  /**
   * 🔴 LE RÉSULTAT EST PIÈCE PAR PIÈCE. Un « OK » global mentirait dès qu'une pièce échoue, et un « échec » global
   * ferait recommencer les dépôts déjà réussis.
   */
  it('une pièce en échec n’emporte pas les autres', async () => {
    let n = 0;
    const d = deps({
      depot: async (_j, x) => {
        n += 1;
        return n === 2 ? { ok: false, motif: 'Google a refusé' } : { ok: true, valeur: { id: 'F', nom: x.nom, webViewLink: null } };
      },
    });
    const i = await deposerPieces(d, 'j', [1, 2, 3], 'DOS', AUTEUR);
    expect(etats(i)).toEqual(['depose', 'echec', 'depose']);
    expect(i[1].etat === 'echec' && i[1].motif).toBe('Google a refusé');
  });

  it('une pièce non conservée par l’application le DIT, sans faire échouer la série', async () => {
    const d = deps({ pieces: { 2: null } });
    const i = await deposerPieces(d, 'j', [1, 2], 'DOS', AUTEUR);
    expect(etats(i)).toEqual(['depose', 'echec']);
    expect(i[1].etat === 'echec' && i[1].motif).toContain('pas conservée');
  });

  it('une exception pendant la lecture du stockage devient un échec de CETTE pièce', async () => {
    const d = deps();
    d.octets = async () => { throw new Error('stockage muet'); };
    const i = await deposerPieces(d, 'j', [1, 2], 'DOS', AUTEUR);
    expect(etats(i)).toEqual(['echec', 'echec']);
    expect(i[0].etat === 'echec' && i[0].motif).toContain('stockage muet');
  });

  it('un nom de dossier illisible n’empêche pas de déposer', async () => {
    const d = deps({ infos: null });
    expect(etats(await deposerPieces(d, 'j', [1], 'DOS', AUTEUR))).toEqual(['depose']);
  });

  it('le jeton et le nom du dossier ne sont demandés qu’UNE fois pour toute la série', async () => {
    const infos = vi.fn(async () => ({ nom: 'D', driveId: null }));
    const d = deps();
    d.infosDossier = infos;
    await deposerPieces(d, 'j', [1, 2, 3], 'DOS', AUTEUR);
    expect(infos).toHaveBeenCalledTimes(1);
  });
});

describe('le compte rendu', () => {
  const issue = (etat: IssuePiece['etat'], id: number): IssuePiece =>
    (etat === 'echec' ? { pieceId: id, nomFichier: 'x', etat, motif: 'm' } : { pieceId: id, nomFichier: 'x', etat, lien: null });

  it('dit les trois cas avec des MOTS, jamais « 3/5 »', () => {
    const t = resumerDepot([issue('depose', 1), issue('depose', 2), issue('deja', 3), issue('echec', 4)]);
    expect(t).toContain('2 pièces déposées');
    expect(t).toContain('1 déjà dans ce dossier');
    expect(t).toContain('1 en échec');
  });
  it('le singulier est respecté', () => {
    expect(resumerDepot([issue('depose', 1)])).toContain('1 pièce déposée');
  });
  it('rien à dire se dit quand même', () => {
    expect(resumerDepot([])).toContain('Aucune pièce');
  });
});

describe('ce que l’écran dit quand Google manque', () => {
  /** « Jamais connecté » et « expiré » ne se réparent pas pareil : un message unique enverrait au mauvais endroit. */
  it('non connecté renvoie aux réglages', () => {
    expect(messageEtatGoogle({ etat: 'non_connecte', motif: 'x' })).toBe('Drive non connecté — voir réglages');
  });
  it('expiré demande de REFAIRE l’autorisation', () => {
    expect(messageEtatGoogle({ etat: 'expire', motif: 'x' })).toContain('refaire l’autorisation');
  });
  it('connecté ne dit rien', () => {
    expect(messageEtatGoogle({ etat: 'ok', jeton: 'j' })).toBe('');
  });
});
