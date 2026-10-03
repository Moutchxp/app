import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { annoncerPiecesDrive, concernePieces, ecouterPiecesDrive } from './signalPieceDrive';

/**
 * ══ 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — LE SIGNAL « LE STATUT DRIVE DES PIÈCES A CHANGÉ » ════════════════════════
 *
 * CONSTAT D'ARNO (03/10/2026) : « de retour dans le mail, la miniature n'a pas le picto cylindre ».
 *
 * 🔴 LA CAUSE : le statut Drive des pièces est tenu à DEUX endroits indépendants — les cartes d'un mail
 * (`PiecesJointes`) et le récapitulatif de la conversation (`Conversation`) — et chacun n'était rafraîchi que par
 * SA PROPRE fenêtre de rangement. MESURÉ EN BASE : la ligne du registre existait bien
 * (`gestion_piece_drive` id 26554, pièce 27085, déposée à 21:37:35). Le serveur savait ; l'écran ne lui avait rien
 * redemandé.
 *
 * CE QUE CE FICHIER TIENT :
 *   ① s'abonner, être prévenu, se désabonner ;
 *   ② 🔴 un auditeur qui LÈVE ne fait pas rater les autres ;
 *   ③ 🔴 une liste VIDE concerne TOUT LE MONDE — ne pas savoir doit faire relire, jamais faire ignorer.
 */

const vidangeurs: (() => void)[] = [];
const abonner = (f: Parameters<typeof ecouterPiecesDrive>[0]): void => { vidangeurs.push(ecouterPiecesDrive(f)); };
afterEach(() => { while (vidangeurs.length > 0) vidangeurs.pop()?.(); });

describe('s’abonner et être prévenu', () => {
  it('l’auditeur reçoit les pièces annoncées', () => {
    const recus: number[][] = [];
    abonner((s) => recus.push([...s.pieceIds]));
    annoncerPiecesDrive([7]);
    expect(recus).toEqual([[7]]);
  });

  it('se désabonner coupe net', () => {
    const recus: number[] = [];
    const stop = ecouterPiecesDrive(() => recus.push(1));
    stop();
    annoncerPiecesDrive([7]);
    expect(recus).toEqual([]);
  });

  /**
   * 🔴 UN `Set`, PAS UN TABLEAU : un composant qui se démonte puis se remonte (le dépliage d'un message) ne doit
   * pas laisser derrière lui un auditeur mort, et le MÊME auditeur abonné deux fois ne doit pas faire deux
   * lectures.
   */
  it('🔴 le même auditeur abonné deux fois n’est prévenu qu’une fois', () => {
    let n = 0;
    const f = (): void => { n += 1; };
    abonner(f); abonner(f);
    annoncerPiecesDrive([7]);
    expect(n).toBe(1);
  });

  /** ⚠️ LES DOUBLONS ET LES IDENTIFIANTS ABSURDES SONT ÉCARTÉS : un `0` ou un `-3` ne désigne aucune pièce. */
  it('⚠️ la liste annoncée est nettoyée', () => {
    const recus: number[][] = [];
    abonner((s) => recus.push([...s.pieceIds]));
    annoncerPiecesDrive([7, 7, 0, -3, 1.5, 9]);
    expect(recus).toEqual([[7, 9]]);
  });

  /**
   * 🔴🔴 UN AUDITEUR QUI LÈVE N'EMPÊCHE PAS LES AUTRES D'ÊTRE PRÉVENUS. Sans cette garde, un écran en cours de
   * démontage ferait rater la relecture de tous ceux qui viennent après lui — et le défaut serait intermittent,
   * donc introuvable.
   */
  it('🔴🔴 un auditeur en échec ne fait pas rater les suivants', () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    let n = 0;
    abonner(() => { throw new Error('écran démonté'); });
    abonner(() => { n += 1; });
    annoncerPiecesDrive([7]);
    expect(n).toBe(1);
    erreur.mockRestore();
  });
});

describe('🔴 « ce signal me concerne-t-il ? »', () => {
  it('une pièce en commun suffit', () => {
    expect(concernePieces({ pieceIds: [7, 9] }, [3, 9])).toBe(true);
  });
  it('aucune pièce en commun : on ne relit pas', () => {
    expect(concernePieces({ pieceIds: [7] }, [3, 9])).toBe(false);
  });
  /**
   * 🔴🔴 UNE LISTE VIDE CONCERNE TOUT LE MONDE. C'est le cas d'un geste sur un FICHIER du Drive (corbeille,
   * déplacement, annulation) : l'écran ne sait pas de quelle pièce ce fichier est la copie. Ne pas savoir doit
   * faire relire — le contraire laisserait l'écran sur une image fausse précisément dans le cas où l'on en sait
   * le moins.
   */
  it('🔴🔴 une liste VIDE fait relire tout le monde', () => {
    expect(concernePieces({ pieceIds: [] }, [3, 9])).toBe(true);
    expect(concernePieces({ pieceIds: [] }, [])).toBe(true);
  });
  it('un écran sans pièce n’est concerné que par le signal « on ne sait pas »', () => {
    expect(concernePieces({ pieceIds: [7] }, [])).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LES TROIS ÉCRANS SONT BRANCHÉS — ET LA FENÊTRE DRIVE ANNONCE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le câblage', () => {
  const lire = (f: string): string => readFileSync(f, 'utf8');
  const SFD = 'app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx';
  const PJ = 'app/(admin)/admin/(protected)/gestion/PiecesJointes.tsx';
  const CONV = 'app/(admin)/admin/(protected)/gestion/Conversation.tsx';

  it('🔴 la fenêtre Drive ANNONCE après chaque geste qui change un emplacement', () => {
    const src = lire(SFD);
    expect(src).toContain('annoncerPiecesDrive([piece.pieceId])');
    // ⚠️ Les gestes sur un FICHIER du Drive annoncent SANS liste : ils ne savent pas quelle pièce est touchée.
    expect((src.match(/annoncerPiecesDrive\(\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  /**
   * 🔴🔴 ET LA RELECTURE NE PASSE PLUS PAR `onRangement`. Elle y était, et NULLE PART ailleurs : c'est exactement
   * pour cela que le récapitulatif et les cartes du mail ne se rafraîchissaient pas l'un l'autre. Deux chemins
   * pour la même relecture auraient fait deux requêtes sur le geste le plus courant.
   */
  it('🔴🔴 les deux écrans écoutent, et ne relisent plus depuis `onRangement`', () => {
    for (const [f, relecture] of [[PJ, 'relireDepots'], [CONV, 'relireDepotsFil']] as const) {
      const src = lire(f);
      expect(src).toContain('ecouterPiecesDrive');
      expect(src).not.toContain(`onRangement={(o) => {\n            void ${relecture}();`);
    }
    expect(lire(PJ)).toContain('onRangement={(o) => { if (o?.nomChange === true) onNomChange?.(); }}');
  });

  /**
   * ⚠️ LES CARTES D'UN MAIL FILTRENT SUR LEURS PIÈCES. Une conversation peut avoir douze messages dépliés, donc
   * douze instances du composant : les faire toutes relire pour une pièce qui n'appartient qu'à l'une d'elles
   * ferait douze requêtes au lieu d'une.
   */
  it('⚠️ les cartes d’un mail ne relisent que si le signal les concerne', () => {
    expect(lire(PJ)).toContain('concernePieces(s, miennes)');
  });
});
