import { describe, expect, it } from 'vitest';
import { parNegociateur, payeTtcDe, resteTtcDe, totaux, type LigneVente, type Partie, type Societe, type Vente } from './modele';
import { tuilesCompromis } from './commissions';
import { venteDansSociete } from './interCabinet';

/**
 * 🔴 LOT AA (Arno, 29/10/2026) — LA RÈGLE : la commission d'un négociateur est payée UNIQUEMENT par la société où il travaille sur cette vente,
 * et comptée UNIQUEMENT dans les « Commissions versées » de cette société (s'il est indépendant). Jamais dans l'autre société, jamais deux fois
 * pour une même transaction — dans les deux sens. Vérifiée sur chaque calcul : tuiles Compromis, Le mois / L'année (totaux), paye affichée,
 * espaces négociateurs, reste à l'agence, CA global.
 */
const ligne = (negociateur: string, cote: 'entree' | 'sortie', montantTtc: number): LigneVente => ({ id: cote === 'entree' ? 1 : 2, negociateur, role: 'negociateur', montantTtc,
  montantHt: null, cote, nature: 'compromis', compte: false, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
const partie = (sorte: 'entree' | 'sortie', compteId: number, negociateur: string, societe: Societe, statut: Partie['statut']): Partie =>
  ({ sorte, compteId, negociateur, societe, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, statut });
/** 4 000 TTC, 50 / 50 : l'entrée (porteuse) chez `porteuse`, la sortie chez l'autre société, 1 000 TTC chacun. */
const vente = (porteuse: Societe, statutSortie: Partie['statut'] = 'independant', statutEntree: Partie['statut'] = 'associe'): Vente => {
  const autre: Societe = porteuse === 'criterimmo' ? 'macj' : 'criterimmo';
  return { id: 38, societe: porteuse, libelle: 'HEIDIDON', honorairesTtc: 4000, statut: 'compromis', annee: 2026, mois: null, dateCompromis: null, apporteur: null, note: null,
    origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, double: null,
    dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 2, nom: 'Arnaud' }, sortie: { id: 8, nom: 'Pierre' }, apporteurId: null, personnes: [] },
    repartition: { retroApporteurTtc: 0, parties: [partie('entree', 2, 'Arnaud', porteuse, statutEntree), partie('sortie', 8, 'Pierre', autre, statutSortie)] },
    lignes: [ligne('Arnaud', 'entree', 1000), ligne('Pierre', 'sortie', 1000)] };
};
/** La vente telle que chaque vue la lit : la porteuse a la vente d'origine, l'autre société sa ligne miroir, le CA global la vente d'origine. */
const vues = (v: Vente) => { const autre: Societe = v.societe === 'criterimmo' ? 'macj' : 'criterimmo';
  return { porteuse: { s: v.societe, v }, autre: { s: autre, v: venteDansSociete(v, autre)! }, global: { s: null, v } }; };
const vendue = (v: Vente): Vente => ({ ...v, statut: 'vendue', mois: 11 });

describe('🔴 LOT AA — une seule commission par négociateur et par transaction, dans sa seule société', () => {
  for (const porteuse of ['criterimmo', 'macj'] as const) {
    const sens = porteuse === 'criterimmo' ? 'CRITERIMMO → MACJ' : 'MACJ → CRITERIMMO';
    it(`${sens} : Pierre (indépendant, l'autre société) — compté chez elle seule, une fois au global`, () => {
      const x = vues(vente(porteuse));
      // tuiles Compromis : indépendants
      expect(tuilesCompromis([x.porteuse.v], x.porteuse.s).independantsHt).toBe(0);
      expect(tuilesCompromis([x.autre.v], x.autre.s).independantsHt).toBeCloseTo(1000 / 1.2, 9);
      expect(tuilesCompromis([x.global.v], null).independantsHt).toBeCloseTo(1000 / 1.2, 9);
      // Le mois / L'année : paye déduite
      expect(totaux([vendue(x.porteuse.v)], [], x.porteuse.s).payeHt).toBe(0);
      expect(totaux([vendue(x.autre.v)], [], x.autre.s).payeHt).toBeCloseTo(1000 / 1.2, 9);
      expect(totaux([vendue(x.global.v)], [], null).payeHt).toBeCloseTo(1000 / 1.2, 9);
      // la colonne « Paye négo » (affichée) : la porteuse n'affiche que la sienne (Arnaud) ; la somme des deux sociétés = le global, sans doublon
      const porteuseAffiche = payeTtcDe(x.porteuse.v, x.porteuse.s), autreAffiche = payeTtcDe(x.autre.v, x.autre.s);
      expect([porteuseAffiche, autreAffiche, payeTtcDe(x.global.v, null)]).toEqual([1000, 1000, 2000]);
      expect(porteuseAffiche + autreAffiche).toBe(payeTtcDe(x.global.v, null));
      // espaces négociateurs : Pierre payé chez l'autre société seulement
      const pierre = (v: Vente, s: Societe | null) => parNegociateur([vendue(v)], [], s).find((l) => l.negociateur === 'Pierre')?.payeHt ?? 0;
      expect([pierre(x.porteuse.v, x.porteuse.s), pierre(x.autre.v, x.autre.s), pierre(x.global.v, null)].map((h) => h * 1.2)).toEqual([0, 1000, 1000]);
      // reste à l'agence : la porteuse ne déduit pas Pierre (elle reverse sa part en inter-cabinet) ; l'autre société le déduit de sa part
      expect(resteTtcDe(vendue(x.porteuse.v), [], undefined, x.porteuse.s)).toBeCloseTo(2000, 9);
      expect(resteTtcDe(vendue(x.autre.v), [], undefined, x.autre.s)).toBeCloseTo(1000, 9);
      // CA global : la commission une fois (l'inter-cabinet entre nos sociétés neutralisé)
      expect(tuilesCompromis([x.global.v], null).caTtc).toBeCloseTo(4000, 9);
      expect(totaux([vendue(x.global.v)], [], null).caTtc).toBeCloseTo(4000, 9);
    });
    it(`${sens} : Pierre salarié de l'autre société — interne chez elle seule, jamais chez la porteuse`, () => {
      const x = vues(vente(porteuse, 'salarie'));
      expect(tuilesCompromis([x.porteuse.v], x.porteuse.s).internesHt).toBeCloseTo(1000 / 1.2, 9); // Arnaud (associé de la porteuse) seul
      expect(tuilesCompromis([x.autre.v], x.autre.s).internesHt).toBeCloseTo(1000 / 1.2, 9); // Pierre seul
      expect(tuilesCompromis([x.global.v], null).internesHt).toBeCloseTo(2000 / 1.2, 9);
      expect([tuilesCompromis([x.porteuse.v], x.porteuse.s).independantsHt, tuilesCompromis([x.autre.v], x.autre.s).independantsHt]).toEqual([0, 0]);
    });
  }
  it('même société (les deux négociateurs chez CRITERIMMO) : inchangé — tout chez elle, rien chez MACJ', () => {
    const v = vente('criterimmo');
    const meme: Vente = { ...v, repartition: { ...v.repartition!, parties: v.repartition!.parties.map((p) => ({ ...p, societe: 'criterimmo' as const })) } };
    expect(venteDansSociete(meme, 'macj')).toBeNull();
    expect(tuilesCompromis([meme], 'criterimmo').independantsHt).toBeCloseTo(1000 / 1.2, 9);
    expect(payeTtcDe(meme, 'criterimmo')).toBe(2000);
    expect(tuilesCompromis([meme], 'criterimmo').caTtc).toBeCloseTo(4000, 9);
  });
});
