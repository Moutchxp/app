import { describe, it, expect } from 'vitest';
import { aRanger, type Demande } from './PiecesJointes';

/**
 * LOT RANGER-PJ-FIABLE — CE QU'ON EMPORTE DANS LA FENÊTRE « RANGER ».
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 DEMANDE D'ARNO, MOT POUR MOT : « fichiers “._” et images de signature (cid:) : ils ne doivent PAS
 * apparaître comme pièces à ranger. »
 *
 * LE DÉFAUT, VU SUR UN VRAI MAIL le 29/09/2026 (message 56770, fil 354) : deux vraies pièces — une régularisation
 * de charges, un relevé de dépenses — et une image de signature. « Tout ajouter au Drive » annonçait
 * « 3 pièces à ranger », `image001.jpg` comprise. L'écran SAVAIT pourtant que c'en était une : il l'affichait
 * sous « 1 image de signature », dans son propre bloc replié, deux centimètres plus haut.
 *
 * 🔴 CE QUE ÇA COÛTE : le logo du correspondant part dans le dossier du client, à côté du bail — et personne ne
 * le voit passer, puisqu'on a cliqué sur « tout ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const piece = (pieceId: number, nomFichier: string, disponible = true) => ({
  pieceId, nomFichier, tailleOctets: 1024, typeMime: 'application/pdf', disponible,
  motif: null, apercu: false,
} as never);

const VRAIES = [
  piece(1, 'Régularisation individuelle M BENTZ Année 2025.pdf'),
  piece(2, 'Relevé de dépenses Année 2025.pdf'),
];
const SIGNATURES = [piece(3, 'image001.jpg')];
const TOUT: Demande = { quoi: 'message' };

describe('🔴🔴 « Tout ajouter au Drive »', () => {
  it('🔴 n’emporte QUE les vraies pièces — jamais les images de signature', () => {
    const r = aRanger(TOUT, VRAIES, SIGNATURES);
    expect(r.map((p) => p.nom)).toEqual([
      'Régularisation individuelle M BENTZ Année 2025.pdf',
      'Relevé de dépenses Année 2025.pdf',
    ]);
    expect(r.map((p) => p.pieceId)).not.toContain(3);
  });

  /** ⚠️ ET UNE PIÈCE NON CONSERVÉE reste écartée : la proposer promettrait un geste qui échouerait après coup. */
  it('les pièces non conservées sont écartées, comme avant', () => {
    const r = aRanger(TOUT, [...VRAIES, piece(9, 'perdue.pdf', false)], SIGNATURES);
    expect(r.map((p) => p.pieceId)).toEqual([1, 2]);
  });

  it('un message sans vraie pièce n’emporte rien du tout', () => {
    expect(aRanger(TOUT, [], SIGNATURES)).toEqual([]);
  });
});

describe('🔴 le ▲ d’UNE pièce', () => {
  /**
   * 🔴 UNE SIGNATURE RESTE RANGEABLE À LA DEMANDE. Le ▲ de sa propre ligne, dans le bloc des signatures, est un
   * geste EXPLICITE sur une pièce nommée : c'est l'inverse d'un « tout » qui emporte ce qu'on n'a pas regardé.
   * Le lui interdire retirerait une fonction qu'Arno n'a pas demandé de retirer.
   */
  it('🔴 emporte la signature quand c’est ELLE qu’on a désignée', () => {
    const r = aRanger({ quoi: 'piece', pieceId: 3, nom: 'image001.jpg' }, VRAIES, SIGNATURES);
    expect(r.map((p) => p.nom)).toEqual(['image001.jpg']);
  });

  it('emporte la vraie pièce désignée, et elle seule', () => {
    const r = aRanger({ quoi: 'piece', pieceId: 2, nom: 'x' }, VRAIES, SIGNATURES);
    expect(r.map((p) => p.pieceId)).toEqual([2]);
  });
});
