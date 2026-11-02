// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TableauCoutsGlobaux } from './CoutsGlobaux';
import { ligneLocationCa } from '../../../../lib/transaction/locationCa';
import type { EntreesCoutsGlobaux } from '../../../../lib/transaction/coutsGlobal';
import type { ActiviteLue } from '../../../../lib/location/suivi/tableauBord';
import type { RegleCommission } from '../../../../lib/location/suivi/suivi';

/**
 * 🔴 Arno (02/11/2026) — la carte « Coûts » du CA global : le « Variable négociateur » AJOUTE les primes de gestion (et le dit : « dont … de primes de
 * gestion, déjà déduites ») ; le « Total coûts » ne les compte qu'une fois (colonne « Primes de gestion »), inchangé. Données fictives.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const regles: RegleCommission[] = [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }];
let n = 0;
const a = (o: Partial<ActiviteLue>): ActiviteLue => ({
  id: ++n, type: 'bail', dateSignature: '2026-10-08', dateSupposee: false, libelleProprietaire: 'DUPONT', libelleLocataire: 'MARTIN', honoProprietaireHt: 3500, honoLocataireHt: 2500,
  primeSaisie: null, mandatGestion: true, categoriePrime: null, apporteurId: null, apporteurNom: null, apporteurTaux: null, commissionSaisie: null, negociateurId: 5,
  negociateurLibelle: 'Jean-Baptiste PONS', avecGestion: true, origineProprietaire: null, origineLocataire: null, loyerHc: null, charges: null, assurance: null, parking: false,
  vacanceJours: null, rattachement: 'rattache', lotId: 3, bailId: 9, source: 'saisie', lots: [], locataires: [], ...o,
});
// octobre 2026 : variable 900 + 650,55 = 1 550,55 € ; primes 150 + 150 = 300 €
const lignes = [a({}), a({ honoProprietaireHt: 2337, honoLocataireHt: 2000, negociateurId: 8, negociateurLibelle: 'Mélanie' })].map((x) => ligneLocationCa(x, { regles, apporteurs: [] }));
const e: EntreesCoutsGlobaux = { ventes: [], retrocessions: [], location: { lignes, retrocessions: [], salaires: null }, gestion: [] };
const centimes = (t: string): number => Math.round(Number(t.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')) * 100);

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { window.localStorage.setItem('trx-affichage-montants', 'ht'); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

describe('🔴 la carte « Coûts » : le variable avec les primes, comptées une seule fois', () => {
  it('octobre 2026 : Variable 1 850,55 € (dont 300 € de primes, déjà déduites) ; Total coûts = primes + variable hors primes = 1 850,55 €, sans double comptage', async () => {
    await act(async () => {
      root.render(createElement(TableauCoutsGlobaux, { e, rangees: [{ cle: '2026-10', libelle: 'Octobre', annee: 2026, mois: 10 }], total: { cle: '2026', libelle: 'Année 2026', annee: 2026, mois: null },
        titre: 'Coûts', jour: '2026-11-02', salaires: true, onSalaires: () => undefined, idTitre: 'essai', donnee: 'essai-couts' }));
    });
    await act(async () => { (container.querySelector('[data-bloc="essai-couts"] button[aria-expanded]') as HTMLElement).click(); });
    for (const r of ['[data-rangee-couts="2026-10"]', '[data-total-couts]']) {
      const cel = (k: string) => container.querySelector(`${r} [data-cout="${k}"]`)!;
      const montant = (k: string) => centimes(cel(k).querySelector('span')!.textContent!);
      expect([montant('location-primes'), montant('location-variable'), montant('total')]).toEqual([30000, 185055, 185055]);
      expect(cel('location-variable').querySelector('[data-variable-dont-primes]')!.textContent!.replace(/\s/g, ' ')).toBe('dont 300 € de primes de gestion, déjà déduites');
      // les colonnes, primes comptées une fois = le Total coûts
      expect(montant('location-primes') + (montant('location-variable') - montant('location-primes'))).toBe(montant('total'));
    }
    // l'en-tête « Variable négociateur » porte la bulle « i »
    expect(container.querySelector('thead [data-entete-variable="couts-essai-couts"] .svv-pil-ib-btn')).not.toBeNull();
  });
});
