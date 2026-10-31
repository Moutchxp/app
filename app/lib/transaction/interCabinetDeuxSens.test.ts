import { describe, expect, it } from 'vitest';
import { celluleGlobal, etiquetteInterCabinet, SOCIETES, type Partie, type Societe, type Vente } from './modele';
import { venteDansSociete } from './interCabinet';
import { lignesCarteAffaire, resultatDesCartes, societeDuCote } from './carteAffaireLignes';
import { detailCa, detailCommissions, detailDu } from './detailCommissions';
import { totalCompromisEnCours } from './compromisEnCours';

/**
 * 🔴 LOT DK (Arno) — L'INTER-CABINET DANS LES DEUX SENS : CRITERIMMO porteuse → MACJ (comme HEIDIDON) et MACJ porteuse → CRITERIMMO (construit en
 * mémoire). La ligne miroir est construite à la lecture depuis la vente d'origine (même source) : « Reversé à … » chez la porteuse = « Reçu de … »
 * chez l'autre, au centime, HT et TTC — cartes, Résultat (Le mois / L'année), Commissions versées, CA, solde inter-cabinet ; le CA global une fois.
 */
const partie = (sorte: Partie['sorte'], compteId: number, negociateur: string, societe: Societe, pourcentage: number): Partie =>
  ({ sorte, compteId, negociateur, societe, nom: null, coordonnees: null, pourcentage, montantHt: null, statut: 'independant' });
const autre = (s: Societe): Societe => (s === 'criterimmo' ? 'macj' : 'criterimmo');
const partagee = (porteuse: Societe, o: Partial<Vente> = {}): Vente => ({
  id: 77, societe: porteuse, libelle: 'PARTAGÉE', honorairesTtc: 10000.01, statut: 'compromis', annee: 2026, mois: null, dateCompromis: '2026-09-14',
  apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, lignes: [], double: null,
  dossier: { adresseBien: '3 rue X', dateActePrevue: '2026-12-01', dateActe: null, entree: { id: 1, nom: 'Entrée' }, sortie: { id: 2, nom: 'Sortie' }, apporteurId: null, personnes: [] },
  repartition: { retroApporteurTtc: 1200, parties: [partie('entree', 1, 'Entrée', porteuse, 62.5), partie('sortie', 2, 'Sortie', autre(porteuse), 37.5)] },
  ...o,
} as Vente);
const somme = (xs: readonly { htC: number; ttcC: number }[]) => xs.reduce((t, x) => ({ htC: t.htC + x.htC, ttcC: t.ttcC + x.ttcC }), { htC: 0, ttcC: 0 });

describe('🔴 LOT DK — l’inter-cabinet, dans les deux sens', () => {
  for (const porteuse of SOCIETES) {
    const recoit = autre(porteuse);
    it(`${porteuse.toUpperCase()} porteuse → ${recoit.toUpperCase()} : « Reversé à » = « Reçu de », au centime, HT et TTC (cartes, Résultat, Commissions versées, CA, solde)`, () => {
      const v = partagee(porteuse);
      const miroir = venteDansSociete(v, recoit)!;
      expect([venteDansSociete(v, porteuse), miroir.miroir?.porteuse, miroir.libelle]).toEqual([v, porteuse, `PARTAGÉE — inter-cabinet reçu de ${porteuse.toUpperCase()}`]);
      // la carte de la porteuse : « reversé à … » ; la carte miroir : la part reçue
      const reverse = somme(lignesCarteAffaire(v, porteuse).lignes.flatMap((l) => (l.reverse === null ? [] : [l.reverse.m])));
      const recu = resultatDesCartes([miroir], recoit).ca;
      expect(reverse).toEqual(recu);
      expect(reverse.htC).toBeGreaterThan(0);
      // le Résultat de l'agence (Le mois, L'année) : l'inter-cabinet de la porteuse = le CA de l'autre
      expect(resultatDesCartes([v], porteuse).interCabinet).toEqual(recu);
      // Commissions versées (porteuse) = le CA reçu (l'autre)
      const verse = detailCommissions([v], porteuse).versees.find((c) => c.cle === `inter-cabinet-${recoit}`)!;
      const ca = detailCa([miroir], recoit).sections.find((x) => x.cle === `recu-${porteuse}`)!;
      expect([verse.htC, verse.ttcC]).toEqual([ca.htC, ca.ttcC]);
      // le solde inter-cabinet : le même montant, vu des deux côtés (signe opposé)
      const du = (s: Societe, vs: Vente[]) => detailDu(detailCommissions(vs, s), detailCa(vs, s), vs, s, '2026-10-31');
      const [a, b] = [du(porteuse, [v]), du(recoit, [miroir])];
      expect([a.soldeInterHtC, a.soldeInterTtcC]).toEqual([-b.soldeInterHtC, -b.soldeInterTtcC]);
      expect([Math.abs(a.soldeInterHtC), Math.abs(a.soldeInterTtcC)]).toEqual([recu.htC, recu.ttcC]);
      // les compromis en cours : la part comptée chez chacune, une fois pour nos deux sociétés
      const [tp, tr, tous] = [totalCompromisEnCours([v], porteuse), totalCompromisEnCours([miroir], recoit), totalCompromisEnCours([v], null)];
      expect(tp.htC + tr.htC - recu.htC).toBe(tous.htC);
    });

    it(`${porteuse.toUpperCase()} porteuse : une modification de la vente d’origine se voit aussitôt chez ${recoit.toUpperCase()} (même source) ; le CA global la compte une fois`, () => {
      const lire = (o: Partial<Vente>) => venteDansSociete(partagee(porteuse, o), recoit)!;
      const avant = lire({});
      // les parts
      const parts = lire({ repartition: { retroApporteurTtc: 1200, parties: [partie('entree', 1, 'Entrée', porteuse, 50), partie('sortie', 2, 'Sortie', recoit, 50)] } });
      expect(parts.honorairesTtc).toBeGreaterThan(avant.honorairesTtc);
      // l'apporteur (sa rétrocession, déduite avant la répartition)
      expect(lire({ repartition: { retroApporteurTtc: 0, parties: partagee(porteuse).repartition!.parties } }).honorairesTtc).toBeGreaterThan(avant.honorairesTtc);
      // le statut, l'acte signé, les dates, l'annulation
      const signee = lire({ statut: 'vendue', mois: 11, dossier: { ...partagee(porteuse).dossier!, dateActe: '2026-11-03' } });
      expect([signee.statut, signee.mois, signee.dossier?.dateActe]).toEqual(['vendue', 11, '2026-11-03']);
      expect(lire({ dateCompromis: '2026-10-01' }).dateCompromis).toBe('2026-10-01');
      const annulee = lire({ statut: 'annulee', annulation: { date: '2026-10-20', motif: 'Rétractation', note: null } });
      expect([annulee.statut, annulee.annulation?.motif]).toEqual(['annulee', 'Rétractation']);
      // le négociateur de l'autre société
      expect(lire({ repartition: { retroApporteurTtc: 1200, parties: [partie('entree', 1, 'Entrée', porteuse, 62.5), partie('sortie', 3, 'Autre nom', recoit, 37.5)] } }).lignes.map((l) => l.negociateur)).toContain('Autre nom');
      // le CA global : la part une fois (total = la commission de la vente)
      const v = partagee(porteuse, { statut: 'vendue', mois: 11 });
      const g = celluleGlobal({ ventes: [v], location: null, gestion: [] }, 2026, null);
      expect(Math.round(g.totalHt * 100)).toBe(Math.round((10000.01 / 1.2) * 100));
      expect(Math.round((g.venteCriterimmoHt + g.venteMacjHt - g.interCabinetHt) * 100)).toBe(Math.round(g.totalHt * 100));
    });
  }
});

describe('🔴 LOT DP — l’étiquette rouge et la société de chaque négociateur (PUR)', () => {
  it('« Inter-cabinet [porteuse] – [l’autre] », la ligne miroir comprise ; une vente d’une seule société : rien', () => {
    expect([etiquetteInterCabinet(partagee('criterimmo')), etiquetteInterCabinet(venteDansSociete(partagee('criterimmo'), 'macj')!)])
      .toEqual(['Inter-cabinet CRITERIMMO – MACJ', 'Inter-cabinet CRITERIMMO – MACJ']);
    expect([etiquetteInterCabinet(partagee('macj')), etiquetteInterCabinet(venteDansSociete(partagee('macj'), 'criterimmo')!)])
      .toEqual(['Inter-cabinet MACJ – CRITERIMMO', 'Inter-cabinet MACJ – CRITERIMMO']);
    const seule = partagee('criterimmo', { repartition: { retroApporteurTtc: 0, parties: [partie('entree', 1, 'Entrée', 'criterimmo', 50), partie('sortie', 2, 'Sortie', 'criterimmo', 50)] } });
    expect([etiquetteInterCabinet(seule), etiquetteInterCabinet(partagee('macj', { repartition: null }))]).toEqual([null, null]);
  });
  it('la société de chaque ligne : la partie de ce côté ; sans répartition, la société de la vente ; les lignes de la carte la portent', () => {
    const v = partagee('criterimmo');
    expect([societeDuCote(v, 'entree'), societeDuCote(v, 'sortie'), societeDuCote({ ...v, repartition: null }, null)]).toEqual(['criterimmo', 'macj', 'criterimmo']);
    expect(lignesCarteAffaire(v, null).lignes.map((l) => l.societe)).toEqual(['criterimmo', 'macj']);
  });
});

