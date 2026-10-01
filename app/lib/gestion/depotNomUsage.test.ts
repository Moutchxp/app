import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IssuePiece } from './depotDrive';

/**
 * ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — « RENOMMER AVANT DE RANGER » ÉCRIT LE NOM D'USAGE ════════════════════
 *
 * CAS RÉEL D'ARNO (fil 36575, pièce `0836_001.pdf`, 30/09/2026) : « Arno la renomme “Recommandé M Ahmed KHARRAT”
 * avec le stylo, puis la glisse dans le dossier Test. […] Ensuite, la carte de la pièce dans le mail affiche
 * encore “0836_001.pdf”. »
 *
 * CE QU'ON A TROUVÉ EN BASE, ET QUI EXPLIQUE TOUT :
 *   gestion_piece       id 26994   nom_fichier '0836_001.pdf'          nom_usage  NULL
 *   gestion_piece_drive id 26545   nom_depose  'Recommandé M Ahmed…'   nom_drive  NULL
 *
 * Le stylo de la fenêtre « ranger » ne nommait que la COPIE : le nom voyageait avec la requête et mourait avec
 * elle. Tout l'affichage lit `coalesce(nom_usage, nom_fichier)` — il n'y avait rien d'autre à afficher.
 */
const ecrits: { pieceId: number; nom: string }[] = [];
const notes: { ids: string[]; nom: string }[] = [];
const journaux: Record<string, unknown>[] = [];
let nomAffiche = '0836_001.pdf';
let ecritureMarche = true;

vi.mock('./nomUsageRepo', () => ({
  lirePieceANommer: async (pieceId: number) => ({
    pieceId, nomOrigine: '0836_001.pdf', nomAffiche, copies: [],
  }),
  /* 🔴 LOT RANGER-ET-NOM-FIABLES — l'écriture rend désormais TROIS réponses : « écrit », « inchangé » (la base
     portait déjà ce nom — un succès), « indisponible » (la migration 286 manque — un refus). */
  ecrireNomUsage: async (pieceId: number, nom: string) => {
    if (!ecritureMarche) return 'indisponible';
    ecrits.push({ pieceId, nom });
    return 'ecrit';
  },
  noterNomEcritDansDrive: async (ids: readonly string[], nom: string) => {
    notes.push({ ids: [...ids], nom });
  },
  journaliserRenommage: async (o: Record<string, unknown>) => { journaux.push(o); },
}));

const { consignerNomDuDepot } = await import('./depotNomUsage');

const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const depose = (driveFileId: string): IssuePiece => ({
  pieceId: 26994, nomFichier: 'Recommandé M Ahmed KHARRAT.pdf', etat: 'depose',
  lien: null, driveFileId, voie: 'copie_drive',
});

beforeEach(() => {
  ecrits.length = 0; notes.length = 0; journaux.length = 0;
  nomAffiche = '0836_001.pdf';
  ecritureMarche = true;
});

describe('🔴🔴 ① le nom d’usage est écrit', () => {
  it('🔴 la pièce porte désormais le nom choisi au stylo', async () => {
    const b = await consignerNomDuDepot(26994, 'Recommandé M Ahmed KHARRAT.pdf', [depose('D1')], AUTEUR);
    expect(ecrits).toEqual([{ pieceId: 26994, nom: 'Recommandé M Ahmed KHARRAT.pdf' }]);
    expect(b.nomUsageEcrit).toBe(true);
  });

  /**
   * 🔴 LE GESTE SE RACONTE : qui, quand, ancien et nouveau nom — et il vient de l'APPLICATION, pas de Drive.
   *
   * 🔴 LOT RANGER-ET-NOM-FIABLES — ET D'OÙ, DANS L'APPLICATION. Arno : « Journal de chaque renommage : origine
   * (visionneuse mail, visionneuse Drive, Google Drive, rangement) ». La même personne renomme depuis quatre
   * endroits, et les quatre ne se réparent pas pareil : sans ce mot, on relit une suite de renommages sans
   * savoir lequel a déclenché l'autre.
   */
  it('🔴 le journal dit d’où vient le renommage, et par quel geste', async () => {
    await consignerNomDuDepot(26994, 'Recommandé M Ahmed KHARRAT.pdf', [depose('D1')], AUTEUR);
    expect(journaux).toHaveLength(1);
    expect(journaux[0]).toMatchObject({
      pieceId: 26994, ancienNom: '0836_001.pdf', nouveauNom: 'Recommandé M Ahmed KHARRAT.pdf',
      source: 'app', par: 2, parLibelle: 'a.jorel@sansvisavis.com (rangement)',
    });
  });

  it('⚠️ un nom inchangé n’est pas un renommage : ni écriture, ni ligne de journal', async () => {
    nomAffiche = 'Recommandé M Ahmed KHARRAT.pdf';
    await consignerNomDuDepot(26994, 'Recommandé M Ahmed KHARRAT.pdf', [depose('D1')], AUTEUR);
    expect(ecrits).toEqual([]);
    expect(journaux).toEqual([]);
    // …mais le registre, lui, est bien renseigné : le fichier Drive porte ce nom-là.
    expect(notes).toEqual([{ ids: ['D1'], nom: 'Recommandé M Ahmed KHARRAT.pdf' }]);
  });

  it('⚠️ sans nom demandé, il n’y a rien à consigner', async () => {
    await consignerNomDuDepot(26994, '   ', [depose('D1')], AUTEUR);
    expect([ecrits, notes, journaux]).toEqual([[], [], []]);
  });
});

describe('🔴🔴 ② la copie entre au REGISTRE des fichiers que l’app a nommés', () => {
  /**
   * 🔴 SANS `nom_drive`, LA COPIE ÉCHAPPE POUR TOUJOURS À LA REPRISE. C'est la règle de la migration 286, et
   * c'est la bonne : « ne pas savoir ce qu'on y a écrit n'est pas une raison de renommer, c'est exactement la
   * raison de ne pas le faire ». La copie d'Arno tombait donc hors de portée du mécanisme censé la tenir à jour.
   */
  it('🔴 l’identifiant Drive est inscrit sous le nom qu’on y a écrit', async () => {
    await consignerNomDuDepot(26994, 'Recommandé M Ahmed KHARRAT.pdf', [depose('D1')], AUTEUR);
    expect(notes).toEqual([{ ids: ['D1'], nom: 'Recommandé M Ahmed KHARRAT.pdf' }]);
  });

  /**
   * 🔴🔴 UN « DÉJÀ LÀ » N'ENTRE PAS AU REGISTRE. Son identifiant est celui d'une copie faite AVANT, qui n'a pas
   * été écrite sous ce nom-ci. L'inscrire ferait croire, à la reprise suivante, qu'un humain l'a renommée dans
   * Drive — et l'application reprendrait un nom que personne n'a donné.
   */
  it('🔴🔴 un « déjà dans ce dossier » ne fait entrer personne', async () => {
    const deja: IssuePiece = {
      pieceId: 26994, nomFichier: 'x.pdf', etat: 'deja', lien: null, driveFileId: 'ANCIEN',
    };
    await consignerNomDuDepot(26994, 'Recommandé M Ahmed KHARRAT.pdf', [deja], AUTEUR);
    expect([ecrits, notes, journaux]).toEqual([[], [], []]);
  });

  it('⚠️ un échec de dépôt ne consigne rien non plus', async () => {
    const echec: IssuePiece = { pieceId: 26994, nomFichier: 'x.pdf', etat: 'echec', motif: 'refus' };
    await consignerNomDuDepot(26994, 'Nouveau.pdf', [echec], AUTEUR);
    expect([ecrits, notes, journaux]).toEqual([[], [], []]);
  });

  it('⚠️ les dépôts d’une AUTRE pièce ne sont pas consignés ici', async () => {
    const autre: IssuePiece = {
      pieceId: 99, nomFichier: 'y.pdf', etat: 'depose', lien: null, driveFileId: 'D9', voie: 'octets',
    };
    await consignerNomDuDepot(26994, 'Nouveau.pdf', [autre], AUTEUR);
    expect(notes).toEqual([]);
  });
});

describe('🔒 consigner un nom ne peut pas faire rater un dépôt', () => {
  /**
   * ⚠️ LE FICHIER EST DANS LE DRIVE. Dire le dépôt raté parce qu'on n'a pas su noter son nom enverrait le
   * déposer une seconde fois — c'est-à-dire fabriquer un doublon pour avoir voulu être rigoureux.
   */
  it('⚠️ sans la migration 286, l’écriture échoue et le dépôt reste bon', async () => {
    ecritureMarche = false;
    const b = await consignerNomDuDepot(26994, 'Nouveau.pdf', [depose('D1')], AUTEUR);
    expect(b.nomUsageEcrit).toBe(false);
    // Aucune ligne de journal : on ne raconte pas un renommage qu'on n'a pas pu faire.
    expect(journaux).toEqual([]);
  });
});
