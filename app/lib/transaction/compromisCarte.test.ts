import { describe, expect, it } from 'vitest';
import { carteCompromis, trierCompromis } from './compromisCarte';
import type { Vente } from './modele';

/** 🔴 LOT E — la carte compacte d'un compromis (pur) : « à renseigner », date dépassée, tri par date butoir. */
const d = (o: Partial<NonNullable<Vente['dossier']>> = {}): NonNullable<Vente['dossier']> =>
  ({ adresseBien: null, dateActePrevue: null, dateActe: null, entree: null, sortie: null, apporteurId: null, personnes: [], ...o });

describe('la carte compacte', () => {
  it('vendeurs, acquéreurs, adresse, prix, commission HT/TTC, date butoir', () => {
    const c = carteCompromis({ libelle: 'X', honorairesTtc: 12000, prixVente: 450000, dossier: d({ adresseBien: '1 rue A', dateActePrevue: '2027-01-15',
      personnes: [{ id: 1, role: 'vendeur', nom: 'DUPONT', telephone: null, email: null, adresse: null }, { id: 2, role: 'vendeur', nom: 'DURAND', telephone: null, email: null, adresse: null },
        { id: 3, role: 'acquereur', nom: 'MARTIN', telephone: null, email: null, adresse: null }] }) }, '2026-10-27');
    expect(c).toMatchObject({ vendeurs: 'DUPONT, DURAND', acquereurs: 'MARTIN', adresse: '1 rue A', prix: 450000, commissionHt: 10000, commissionTtc: 12000, butoir: '2027-01-15', depassee: false });
  });
  it('ce qui manque s’écrit « à renseigner » ; sans noms, le libellé d’origine en ligne 1', () => {
    const c = carteCompromis({ libelle: 'MARMONIER', honorairesTtc: 14000, prixVente: null, dossier: null }, '2026-10-27');
    expect([c.vendeurs, c.acquereurs, c.adresse, c.prix, c.butoir]).toEqual(['MARMONIER', 'acquéreurs à renseigner', 'adresse à renseigner', null, null]);
    const v = carteCompromis({ libelle: 'X', honorairesTtc: 1, dossier: d({ personnes: [{ id: 3, role: 'acquereur', nom: 'MARTIN', telephone: null, email: null, adresse: null }] }) }, '2026-10-27');
    expect(v.vendeurs).toBe('vendeurs à renseigner');
  });
  it('une date butoir passée est « dépassée » (le jour même ne l’est pas)', () => {
    expect(carteCompromis({ libelle: 'X', honorairesTtc: 1, dossier: d({ dateActePrevue: '2026-10-26' }) }, '2026-10-27').depassee).toBe(true);
    expect(carteCompromis({ libelle: 'X', honorairesTtc: 1, dossier: d({ dateActePrevue: '2026-10-27' }) }, '2026-10-27').depassee).toBe(false);
  });
  it('le tri : la date butoir la plus proche d’abord, sans date à la fin', () => {
    const l = [{ id: 1, dossier: null }, { id: 2, dossier: d({ dateActePrevue: '2027-01-15' }) }, { id: 3, dossier: d({ dateActePrevue: '2026-11-05' }) }, { id: 4, dossier: d() }];
    expect(trierCompromis(l).map((x) => x.id)).toEqual([3, 2, 1, 4]);
  });
});
