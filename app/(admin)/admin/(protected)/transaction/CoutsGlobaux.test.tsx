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
 * 🔴 Arno (02/11/2026) — la carte « Coûts » du CA global : le « Variable négociateur (primes incluses) » est la seule colonne qui compte les primes ;
 * « dont primes de gestion » les montre en gris, non comptées ; le « Total coûts » = la somme des colonnes comptées, inchangé. Données fictives.
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
  it('octobre 2026 : Variable (primes incluses) 1 850,55 € ; « dont primes » 300 € en gris, non comptée ; Total coûts = somme des colonnes comptées = 1 850,55 €', async () => {
    await act(async () => {
      root.render(createElement(TableauCoutsGlobaux, { e, rangees: [{ cle: '2026-10', libelle: 'Octobre', annee: 2026, mois: 10 }], total: { cle: '2026', libelle: 'Année 2026', annee: 2026, mois: null },
        titre: 'Coûts', jour: '2026-11-02', salaires: true, onSalaires: () => undefined, idTitre: 'essai', donnee: 'essai-couts' }));
    });
    await act(async () => { (container.querySelector('[data-bloc="essai-couts"] button[aria-expanded]') as HTMLElement).click(); });
    for (const r of ['[data-rangee-couts="2026-10"]', '[data-total-couts]']) {
      const cel = (k: string) => container.querySelector(`${r} [data-cout="${k}"]`)!;
      const montant = (k: string) => centimes(cel(k).querySelector('span')!.textContent!);
      expect([montant('location-primes'), montant('location-variable'), montant('total')]).toEqual([30000, 185055, 185055]);
      // la colonne des primes : « dont », en gris, non comptée ; les colonnes COMPTÉES (montants de coût) font le Total coûts
      expect(cel('location-primes').querySelector('[data-dont-primes]')!.className).toBe('loc-muet');
      const comptees = [...container.querySelectorAll(`${r} [data-cout]`)].filter((x) => !['total', 'n1', 'ecart'].includes(x.getAttribute('data-cout')!))
        .reduce((t, x) => { const c = x.querySelector(':scope > span:not(.loc-muet)'); return t + (c === null ? 0 : centimes(c.textContent!)); }, 0);
      expect(comptees).toBe(montant('total'));
    }
    // l'en-tête « Variable négociateur » porte la bulle « i »
    expect(container.querySelector('thead [data-entete-variable="couts-essai-couts"] .svv-pil-ib-btn')).not.toBeNull();
    expect(container.querySelector('thead [data-entete-variable="couts-essai-couts"]')!.textContent).toContain('Variable négociateur (primes incluses)');
  });
});
