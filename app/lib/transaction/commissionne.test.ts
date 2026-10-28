import { describe, expect, it } from 'vitest';
import { bilanVente, parNegociateur, payeTtcDe, resteTtcDe, totaux, TVA, type LigneVente, type Partie, type Vente } from './modele';
import { commissionneDuCote, remunerationDuCote, tuilesCompromis } from './commissions';
import { commissionIgnoree, commissionneDePartie } from './statutLigne';
import { venteDansSociete } from './interCabinet';
import { commissionneEffectif, commissionneLu } from '../admin/commissionneCompte';

/**
 * 🔴 LOT S (Arno, 28/10/2026) — « COMMISSIONNÉ / NON COMMISSIONNÉ » : un administrateur non commissionné n'a aucune commission personnelle
 * dans aucun calcul ; sa part reste dans la répartition et le CA de sa société ; ses montants déjà saisis restent en base, ignorés, et
 * reviennent s'il redevient commissionné ; le choix est figé sur la vente à son enregistrement.
 */

const ligne = (o: Partial<LigneVente>): LigneVente => ({ id: 1, negociateur: 'X', role: 'negociateur', montantTtc: null, nature: 'compromis', compte: false, origine: 'saisie',
  sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null, ...o });
const partie = (o: Partial<Partie>): Partie => ({ sorte: 'entree', compteId: 2, negociateur: 'Arnaud Jorel', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, ...o });
const dossier = { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null, personnes: [] };
/** HEIDIDON : Arnaud (administrateur, associé) à l'entrée, 2 000 € TTC saisis ; Pierre (MACJ, indépendant) à la sortie, 1 000 € TTC. */
const heididon = (arnaud: Partial<Partie>): Vente => ({ id: 38, societe: 'criterimmo', libelle: 'HEIDIDON', honorairesTtc: 4000, statut: 'compromis', annee: 2026, mois: null,
  dateCompromis: null, apporteur: null, note: null, origine: 'import', sourceFichier: null, sourceOnglet: null, sourceLigne: null, double: null, dossier,
  repartition: { retroApporteurTtc: 0, parties: [partie({ statut: 'associe', ...arnaud }), partie({ sorte: 'sortie', compteId: 8, negociateur: 'Pierre Thevenin', societe: 'macj', statut: 'independant' })] },
  lignes: [ligne({ id: 445, negociateur: 'Arnaud Jorel', cote: 'entree', montantTtc: 2000 }), ligne({ id: 446, negociateur: 'Pierre Thevenin', cote: 'sortie', montantTtc: 1000 })] });

describe('🔴 le choix du compte', () => {
  it('un collaborateur est TOUJOURS commissionné ; un administrateur suit son choix (non renseigné : commissionné, comme avant la 441)', () => {
    expect(commissionneEffectif('collaborateur', false)).toBe(true);
    expect(commissionneEffectif('collaborateur', null)).toBe(true);
    expect(commissionneEffectif('administrateur', false)).toBe(false);
    expect(commissionneEffectif('administrateur', true)).toBe(true);
    expect(commissionneEffectif('administrateur', null)).toBe(true);
    expect([commissionneLu('true'), commissionneLu('false'), commissionneLu(null), commissionneLu(false)]).toEqual([true, false, null, false]);
  });
  it('sur la vente : le choix FIGÉ d’abord ; à défaut, celui du compte aujourd’hui ; sinon commissionné', () => {
    expect(commissionneDePartie({ commissionne: false, commissionneCompte: true })).toBe(false);
    expect(commissionneDePartie({ commissionne: true, commissionneCompte: false })).toBe(true);
    expect(commissionneDePartie({ commissionne: null, commissionneCompte: false })).toBe(false);
    expect(commissionneDePartie({})).toBe(true);
  });
});

describe('🔴 administrateur NON COMMISSIONNÉ (Arnaud) : aucune commission personnelle dans aucun calcul ; sa part et le CA inchangés', () => {
  const v = heididon({ commissionneCompte: false });
  it('sa commission (2 000 € saisis) reste sur la vente, intacte, mais ignorée ; celle de Pierre compte', () => {
    expect(v.lignes[0].montantTtc).toBe(2000);
    expect(commissionIgnoree(v, v.lignes[0])).toBe(true);
    expect(commissionIgnoree(v, v.lignes[1])).toBe(false);
    expect(payeTtcDe(v)).toBe(1000);
  });
  it('tuiles : ni versée ni interne pour lui ; CA, inter-cabinet et solde inchangés', () => {
    const c = tuilesCompromis([v], 'criterimmo');
    expect(c.internesHt).toBe(0);
    expect(c.independantsHt).toBe(0);
    expect(c.caTtc).toBeCloseTo(4000, 9);
    expect(c.commissionsTtc).toBeCloseTo(2000, 9); // l'inter-cabinet vers MACJ, seul
    expect(c.soldeTtc).toBeCloseTo(2000, 9);
    expect(bilanVente(v, 'criterimmo').caHt).toBeCloseTo(4000 / TVA, 9);
    expect(v.repartition!.parties[0].pourcentage).toBe(50);
  });
  it('pas de calcul proposé, pas d’« Appliquer le calcul » pour son côté ; celui de Pierre reste', () => {
    expect(commissionneDuCote(v, 'entree')).toBe(false);
    expect(remunerationDuCote(v, 'entree')).toBeNull();
    expect(remunerationDuCote(v, 'sortie')).toMatchObject({ calculTtc: 1000, ecart: false });
  });
  it('Le mois / L’année et l’espace négociateurs : reste à l’agence et paye sans lui ; il porte toujours sa part de CA', () => {
    const vendue = { ...v, statut: 'vendue' as const, mois: 11 };
    const t = totaux([vendue], [], 'criterimmo');
    expect([t.internesHt, t.payeHt, t.aRenseignerHt]).toEqual([0, 0, 0]);
    expect(t.resteHt).toBeCloseTo(2000 / TVA, 9);
    expect(resteTtcDe(vendue, [], undefined, 'criterimmo')).toBeCloseTo(2000, 9);
    const arnaud = parNegociateur([vendue], [], 'criterimmo').find((l) => l.negociateur === 'Arnaud Jorel')!;
    expect(arnaud.payeHt).toBe(0);
    expect(arnaud.caHt).toBeCloseTo(2000 / TVA, 9);
  });
  it('la ligne miroir de MACJ ne recopie pas sa commission (elle n’a pas lieu d’y être) ; Pierre inchangé', () => {
    const inverse = { ...v, repartition: { retroApporteurTtc: 0, parties: [partie({ sorte: 'entree', compteId: 8, negociateur: 'Pierre Thevenin', societe: 'macj' }),
      partie({ sorte: 'sortie', statut: 'associe', commissionneCompte: false })] }, dossier: { ...dossier, entree: { id: 8, nom: 'Pierre Thevenin' }, sortie: { id: 2, nom: 'Arnaud Jorel' } },
    lignes: [ligne({ negociateur: 'Arnaud Jorel', cote: 'sortie', montantTtc: 2000 })] };
    const m = venteDansSociete(inverse, 'criterimmo')!;
    expect(m.lignes.filter((l) => l.role === 'negociateur')).toEqual([]);
    expect(m.miroir!.cotes).toMatchObject([{ cote: 'sortie', negociateur: 'Arnaud Jorel', commissionne: false }]);
    expect(m.honorairesTtc).toBeCloseTo(2000, 9);
  });
});

describe('🔴 administrateur COMMISSIONNÉ : le calcul actuel, inchangé', () => {
  const v = heididon({ commissionneCompte: true });
  it('sa commission est interne (associé), affichée, non déduite ; le calcul proposé et l’écart reviennent', () => {
    expect(payeTtcDe(v)).toBe(3000);
    expect(tuilesCompromis([v], 'criterimmo').internesHt).toBeCloseTo(2000 / TVA, 9);
    expect(remunerationDuCote(v, 'entree')).toMatchObject({ calculTtc: 1000, ecart: true, saisie: { montant: 2000, unite: 'ttc' } });
  });
});

describe('🔴 les montants anciens : conservés, et réaffichés au retour ; le choix figé à la date de la vente', () => {
  it('une vente d’avant (rien de figé) suit le compte : non commissionné → ignorés ; redevenu commissionné → les mêmes 2 000 € comptent', () => {
    expect(payeTtcDe(heididon({ commissionne: null, commissionneCompte: false }))).toBe(1000);
    expect(payeTtcDe(heididon({ commissionne: null, commissionneCompte: true }))).toBe(3000);
  });
  it('figé « non commissionné » à l’enregistrement : un changement ULTÉRIEUR du compte ne touche pas la vente (et inversement)', () => {
    expect(payeTtcDe(heididon({ commissionne: false, commissionneCompte: true }))).toBe(1000);
    expect(payeTtcDe(heididon({ commissionne: true, commissionneCompte: false }))).toBe(3000);
  });
  it('un collaborateur (Pierre) n’a jamais le choix : toujours compté', () => {
    const v = heididon({});
    expect(commissionIgnoree(v, v.lignes[1])).toBe(false);
    expect(commissionneDuCote(v, 'sortie')).toBe(true);
  });
});
