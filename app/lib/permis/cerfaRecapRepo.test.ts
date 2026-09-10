import { describe, it, expect, vi } from 'vitest';
import { lireDeclarationsRecapOuRepli, memoriserRecapCerfaDepuisGed } from './cerfaRecapRepo';
import type { DeclarationsCerfaStockees } from './cerfaRecapRepo';
import type { ResultatLectureGed, PieceGedMeta } from './lectureGed';

/**
 * REPLI D'AFFICHAGE du récap Cerfa (déps injectées → pur, sans base ni S3). Règles :
 *  · l'INSTANTANÉ stocké prime et court-circuite le repli (aucune lecture GED coûteuse quand ce n'est pas nécessaire) ;
 *  · sinon on reconstitue depuis le TEXTE déjà extrait — la description libre (« Courte description… ») remonte VERBATIM ;
 *  · texte non reconnaissable → null (pas de bloc) ; toute erreur de lecture → null (comportement d'avant, jamais une exception).
 * ⚠️ Le repli n'écrit RIEN et n'appelle aucune IA : il ne fait que relire du texte. Ce test le prouve par construction (aucune écriture mockée).
 */
const STOCKE: DeclarationsCerfaStockees = {
  declarations: { present: true, descriptionProjet: 'depuis la base', descriptionProjetProvenance: 'texte', dateDepot: null, superficieTerrainM2: null, logementsTotal: null,
    logementsIndividuels: null, logementsCollectifs: null, niveauxDessusSol: null, niveauxDessousSol: null, stationnementAvant: null,
    stationnementApres: null, empriseAuSolCreeeM2: null, surfacePlancherTotaleM2: null, decompte: null, absents: [], ambigus: [] },
  pieceSource: 'stocke.pdf', majLe: '2026-09-05T10:00:00Z',
};

const TEXTE_RECAP = 'Courte description de votre projet ou de vos travaux : Surélévation et création de 3 logements. Informations complémentaires';

describe('REPLI récap Cerfa — lireDeclarationsRecapOuRepli (déps injectées)', () => {
  it('instantané STOCKÉ présent → renvoyé tel quel, le repli GED n’est JAMAIS lu (pas de lecture coûteuse inutile)', async () => {
    const lireTexteEtSource = vi.fn();
    const r = await lireDeclarationsRecapOuRepli(468, { lireStocke: async () => STOCKE, lireTexteEtSource });
    expect(r).toBe(STOCKE);
    expect(lireTexteEtSource).not.toHaveBeenCalled(); // priorité absolue au stocké
  });

  it('aucun instantané + texte de récapitulatif lisible → RECONSTITUÉ à la volée (description VERBATIM, source portée, majLe null)', async () => {
    const r = await lireDeclarationsRecapOuRepli(468, {
      lireStocke: async () => null,
      lireTexteEtSource: async () => ({ texte: TEXTE_RECAP, source: 'cerfa_13409-13.pdf' }),
    });
    expect(r).not.toBeNull();
    expect(r!.declarations.present).toBe(true);
    expect(r!.declarations.descriptionProjet).toBe('Surélévation et création de 3 logements.');
    expect(r!.pieceSource).toBe('cerfa_13409-13.pdf');
    expect(r!.majLe).toBeNull(); // reconstitué (non figé en base)
  });

  it('aucun instantané + texte NON reconnaissable comme récapitulatif → null (pas de bloc, comportement d’avant)', async () => {
    const r = await lireDeclarationsRecapOuRepli(468, {
      lireStocke: async () => null,
      lireTexteEtSource: async () => ({ texte: 'un courrier quelconque sans champ de récapitulatif', source: null }),
    });
    expect(r).toBeNull();
  });

  it('aucun instantané + lecture GED en ERREUR → null (jamais une exception propagée)', async () => {
    const r = await lireDeclarationsRecapOuRepli(468, {
      lireStocke: async () => null,
      lireTexteEtSource: async () => { throw new Error('S3 indisponible'); },
    });
    expect(r).toBeNull();
  });
});

// GED minimale : une pièce PDF avec (ou sans) un récapitulatif lisible dans son texte.
const gedAvec = (texte: string): ResultatLectureGed => ({
  dossierId: 468,
  pieces: [{ id: 1, nomFichier: 'recap.pdf', typeMime: 'application/pdf', nbPages: 1, muette: false, motif: null, pages: [{ page: 1, aTexte: true, texte }] }],
  bilan: { nbPieces: 1, nbPages: 1, pagesAvecTexte: 1, pagesSansTexte: 0, piecesMuettes: 0 },
});
const METAS: PieceGedMeta[] = [{ id: 1, nomFichier: 'recap.pdf', typeMime: 'application/pdf', cleStockage: 'k', tailleOctets: 1 }];
const TXT_RECAP = 'Courte description de votre projet ou de vos travaux : Immeuble neuf de 12 logements. Informations complémentaires';

describe('PRODUCTION DE FOND — memoriserRecapCerfaDepuisGed (écriture injectée, sans base, sans IA)', () => {
  it('récapitulatif lisible → ÉCRIT l’instantané (VERBATIM), avec la provenance et le majPar du fond', async () => {
    const ecrire = vi.fn(async () => true);
    const r = await memoriserRecapCerfaDepuisGed(468, gedAvec(TXT_RECAP), METAS, 'recap:fond', { ecrire });
    expect(r).toBe(true);
    expect(ecrire).toHaveBeenCalledOnce();
    const [id, decl, , maj] = ecrire.mock.calls[0] as unknown as [number, { present: boolean; descriptionProjet: string | null }, string | null, string];
    expect(id).toBe(468);
    expect(decl.present).toBe(true);
    expect(decl.descriptionProjet).toBe('Immeuble neuf de 12 logements.');
    expect(maj).toBe('recap:fond');
  });

  it('aucun récapitulatif lisible → n’écrit RIEN (jamais une ligne vide), renvoie false', async () => {
    const ecrire = vi.fn(async () => true);
    const r = await memoriserRecapCerfaDepuisGed(468, gedAvec('un courrier quelconque sans récapitulatif'), METAS, 'recap:fond', { ecrire });
    expect(r).toBe(false);
    expect(ecrire).not.toHaveBeenCalled();
  });
});
