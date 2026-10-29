import { describe, expect, it } from 'vitest';
import { societePorteuse, type Partie, type Societe, type Vente } from './modele';
import { planRegistre, miroirsAttendus, venteDansSociete, ventePorteeAilleurs } from './interCabinet';
import { tuilesCompromis } from './commissions';

/**
 * 🔴 LOT AE (Arno, 29/10/2026) — LA VENTE APPARTIENT TOUJOURS À LA SOCIÉTÉ DU NÉGOCIATEUR D'ENTRÉE (pour un collaborateur des deux sociétés :
 * celle choisie pour la vente) ; la page de saisie ne compte que sans négociateur d'entrée. Chez l'autre société : sa part reçue (ligne miroir).
 */
const partie = (sorte: Partie['sorte'], compteId: number, negociateur: string, societe: Societe | null, pct: number): Partie =>
  ({ sorte, compteId, negociateur, societe, nom: null, coordonnees: null, pourcentage: pct, montantHt: null, statut: 'independant' });
/** Saisie depuis la page `page` (sa colonne `societe`), 6 000 TTC. */
const vente = (page: Societe, parties: Partie[]): Vente => ({ id: 77, societe: page, libelle: 'DURAND', honorairesTtc: 6000, statut: 'compromis', annee: 2026, mois: null,
  dateCompromis: null, apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, double: null, lignes: [],
  dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: null, sortie: null, apporteurId: null, personnes: [] },
  repartition: { retroApporteurTtc: 0, parties } });
const vues = (v: Vente) => ({ criterimmo: venteDansSociete(v, 'criterimmo'), macj: venteDansSociete(v, 'macj') });

describe('🔴 LOT AE — la société porteuse = celle du négociateur d’entrée, quelle que soit la page de saisie', () => {
  it('créée dans CRITERIMMO, entrée MACJ (Mylène), sortie CRITERIMMO (JB) : portée par MACJ ; CRITERIMMO la voit en ligne miroir (sa part reçue)', () => {
    const v = vente('criterimmo', [partie('entree', 7, 'Mylène', 'macj', 50), partie('sortie', 5, 'JB', 'criterimmo', 50)]);
    expect(societePorteuse(v)).toBe('macj');
    expect(ventePorteeAilleurs(v, 'criterimmo')).toEqual({ porteuse: 'macj', recue: true });
    const x = vues(v);
    expect(x.macj).toBe(v);
    expect(x.criterimmo?.miroir).toMatchObject({ porteuse: 'macj', origineId: 77 });
    expect(x.criterimmo?.libelle).toBe('DURAND — inter-cabinet reçu de MACJ');
  });
  it('sans part CRITERIMMO (les deux côtés chez MACJ) : portée par MACJ, n’apparaît pas chez CRITERIMMO', () => {
    const v = vente('criterimmo', [partie('entree', 7, 'Mylène', 'macj', 50), partie('sortie', 8, 'Pierre', 'macj', 50)]);
    expect(ventePorteeAilleurs(v, 'criterimmo')).toEqual({ porteuse: 'macj', recue: false });
    expect(vues(v).criterimmo).toBeNull();
  });
  it('sens inverse : créée dans MACJ, entrée CRITERIMMO → portée par CRITERIMMO, miroir chez MACJ', () => {
    const v = vente('macj', [partie('entree', 5, 'JB', 'criterimmo', 50), partie('sortie', 8, 'Pierre', 'macj', 50)]);
    expect(ventePorteeAilleurs(v, 'macj')).toEqual({ porteuse: 'criterimmo', recue: true });
    expect(vues(v).macj?.miroir?.porteuse).toBe('criterimmo');
  });
  it('Cédric (« CRITERIMMO et MACJ ») à l’entrée : la société CHOISIE pour la vente fait la porteuse', () => {
    for (const choisie of ['criterimmo', 'macj'] as const) {
      const v = vente('criterimmo', [partie('entree', 9, 'Cédric', choisie, 50), partie('sortie', 5, 'JB', 'criterimmo', 50)]);
      expect(societePorteuse(v)).toBe(choisie);
      expect(ventePorteeAilleurs(v, 'criterimmo')).toEqual(choisie === 'criterimmo' ? null : { porteuse: 'macj', recue: true });
    }
  });
  it('sans négociateur d’entrée : la page de saisie (règle d’avant)', () => {
    const v = vente('criterimmo', [partie('sortie', 8, 'Pierre', 'macj', 100)]);
    expect(societePorteuse(v)).toBe('criterimmo');
    expect(ventePorteeAilleurs(v, 'criterimmo')).toBeNull();
  });
  it('bascule après modification (entrée MACJ → entrée CRITERIMMO) : l’ancienne miroir de CRITERIMMO ANNULÉE (journalisée, jamais supprimée), une miroir neuve chez MACJ', () => {
    const avant = vente('macj', [partie('entree', 7, 'Mylène', 'macj', 50), partie('sortie', 5, 'JB', 'criterimmo', 50)]);
    const registre = miroirsAttendus(avant).map((a) => ({ ...a, etat: 'active' as const, modifieLe: '2026-10-29' }));
    expect(registre.map((e) => [e.societe, e.porteuse])).toEqual([['criterimmo', 'macj']]);
    const apres = { ...avant, repartition: { retroApporteurTtc: 0, parties: [partie('entree', 5, 'JB', 'criterimmo', 50), partie('sortie', 7, 'Mylène', 'macj', 50)] } };
    const ops = planRegistre(miroirsAttendus(apres), registre);
    expect(ops.map((o) => [o.sorte, o.societe])).toEqual([['creer', 'macj'], ['annuler', 'criterimmo']]);
    // CRITERIMMO voit la vente d'origine (porteuse), jamais sa miroir annulée en plus
    expect(venteDansSociete(apres, 'criterimmo', registre[0])).toBe(apres);
  });
  it('tuiles et CA global sans doublon : CA porteuse + CA reçu = la commission ; le global la compte une fois', () => {
    const v = vente('criterimmo', [partie('entree', 7, 'Mylène', 'macj', 60), partie('sortie', 5, 'JB', 'criterimmo', 40)]);
    const x = vues(v);
    const ca = (l: Vente | null, s: Societe | null) => tuilesCompromis(l === null ? [] : [l], s).caTtc;
    expect(ca(x.macj, 'macj')).toBeCloseTo(6000, 9);
    expect(ca(x.criterimmo, 'criterimmo')).toBeCloseTo(2400, 9);
    expect(ca(v, null)).toBeCloseTo(6000, 9);
    expect(tuilesCompromis([v], null).neutraliseHt).toBeCloseTo(2400 / 1.2, 9);
  });
});
