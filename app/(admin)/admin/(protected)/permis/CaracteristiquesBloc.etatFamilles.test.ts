// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { MESURES } from './caracteristiquesForm';
import { etatMereCaracteristiques, etatCoherenceBatimentsTitre, etatAltitudesTitre, type ComptesCaracteristiquesPermis } from '../../../../lib/permis/etatFamilleProjection';

/**
 * BAT-2b — l'ÉTAT des sous-sections PORTEUSES (cohérence des cartes + altitudes) s'affiche sur leurs TITRES dès que la vue passe
 * `avecEtatFamilles` — désormais LES CINQ vues (Projection, Rattachement, Archives, Réponses, Suivi). Comme les cinq montent le MÊME
 * composant avec le MÊME drapeau (câblage vérifié par tsc), rendre ici `CaracteristiquesBloc` avec le drapeau PROUVE ce qu'affiche chaque
 * vue. On rend le composant RÉEL (effets + fetch mocké, jsdom), on lit les TITRES (visibles bloc REPLIÉ, aucun dépliage). Aucun réseau réel.
 * Deux modes couverts : « 4 autres vues » (aide de la section 4 CONSERVÉE) et « Projection » (`etatSection4SansAide` → l'état la remplace).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bornesTous = Object.fromEntries(MESURES.map((m) => [m.colonne, { min: -50, max: 500 }]));

/** Corps minimal TEL QUE json_build_object le rend (altitudes = nombres ou null). `sommet` null = sans altitude de sommet. */
function corps(id: number, sommet: number | null) {
  return {
    id, repere: null,
    nbEtages: null, nbEtagesOrigine: null, nbNiveauxSousSol: null, nbNiveauxSousSolOrigine: null,
    altitudeDernierPlancherNgf: null, altitudeDernierPlancherNgfOrigine: null,
    altitudeSommetNgf: sommet, altitudeSommetNgfOrigine: sommet === null ? null : 'saisie',
    altitudeSommetNgfConfirmeLe: null, altitudeSommetNgfConfirmePar: null, altitudeSommetNgfConfirmeParNom: null,
    hauteurMaxPluNgf: null, hauteurMaxPluNgfOrigine: null,
    altitudePlateauNivellementNgf: null, altitudePlateauNivellementNgfOrigine: null,
    hauteurRelativeM: null, hauteurRelativeMOrigine: null,
    altitudeTerrainNaturelNgf: null, altitudeTerrainNaturelNgfOrigine: null,
    empriseWkt: null, empriseOrigine: null, adresse: null, adresseOrigine: null, majLe: null, majPar: null,
  };
}

/** Charge (payload GET caractéristiques) minimal pour un rendu 'ok', + `nbBatimentsValide` (BAT-2). */
function etat(corpsList: object[], nbBatimentsValide: number | null): object {
  return {
    faits: { numDau: '07511900000', type: 'PC', communeNom: 'Paris 19e', codeInsee: '75119', adresse: null, natureTravaux: null, dateAutorisation: null, surfaceCreee: null },
    global: null, corps: corpsList, bornes: bornesTous,
    journal: { parCorps: {}, permis: {} },
    naturesPossibles: [], piecesParNom: {}, destinationsPossibles: [], margeCoherenceSommetM: 0.1,
    nbBatimentsValide,
  };
}

let root: Root | null = null;
const fetchOrig = global.fetch;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; global.fetch = fetchOrig; });

/** Monte CaracteristiquesBloc (fetch mocké → `e`) et rend le composant. On NE déplie rien : les TITRES des cartouches sont visibles repliés. */
async function monter(e: object, props: { avecEtatFamilles?: boolean; etatSection4SansAide?: boolean; onComptes?: (c: ComptesCaracteristiquesPermis) => void }): Promise<HTMLElement> {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => e })) as unknown as typeof fetch;
  const container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(createElement(CaracteristiquesBloc, { dossierId: 468, ...props })); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return container;
}

describe('BAT-2b — état des sous-sections sur les titres (rendu réel du composant partagé)', () => {
  it('MODE 4 AUTRES VUES (avecEtatFamilles) : section 1 = cohérence, section 4 = altitudes ; aide « un par immeuble » CONSERVÉE', async () => {
    // 2 cartes, 1 sans altitude, nombre validé = 2 → section 1 VERTE (cohérent), section 4 ROUGE (1/2 manquante).
    const c = await monter(etat([corps(5, 100), corps(6, null)], 2), { avecEtatFamilles: true });
    const t = c.textContent ?? '';
    expect(t).toContain('nombre de cartes cohérent avec le nombre validé'); // état section 1
    expect(t).toContain('altitude manquante (1/2)');                        // état section 4
    expect(t).toContain('un par immeuble, mesurés sur les plans');          // aide CONSERVÉE (req BAT-2b point 3)
    c.remove();
  });

  it('MODE PROJECTION (avecEtatFamilles + etatSection4SansAide) : mêmes états, mais l’aide de la section 4 est REMPLACÉE par l’état', async () => {
    const c = await monter(etat([corps(5, 100), corps(6, null)], 2), { avecEtatFamilles: true, etatSection4SansAide: true });
    const t = c.textContent ?? '';
    expect(t).toContain('nombre de cartes cohérent avec le nombre validé');
    expect(t).toContain('altitude manquante (1/2)');
    expect(t).not.toContain('un par immeuble, mesurés sur les plans'); // aide REMPLACÉE (comportement BAT-2 de Projection préservé)
    c.remove();
  });

  it('incohérence : cartes ≠ nombre validé → section 1 ROUGE disant l’écart', async () => {
    const c = await monter(etat([corps(5, 100), corps(6, 100)], 3), { avecEtatFamilles: true }); // 2 cartes, 3 validés
    expect(c.textContent ?? '').toContain('2 cartes pour 3 bâtiments validés');
    c.remove();
  });

  it('nombre validé NULL (jamais validé) → section 1 NEUTRE « nombre de bâtiments non validé »', async () => {
    const c = await monter(etat([corps(5, 100)], null), { avecEtatFamilles: true });
    expect(c.textContent ?? '').toContain('nombre de bâtiments non validé');
    c.remove();
  });

  it('SANS drapeau (comportement d’origine) : aucun état sur les titres ; l’aide de la section 4 reste', async () => {
    const c = await monter(etat([corps(5, 100), corps(6, null)], 2), {});
    const t = c.textContent ?? '';
    expect(t).not.toContain('nombre de cartes cohérent avec le nombre validé');
    expect(t).not.toContain('altitude manquante (1/2)');
    expect(t).toContain('un par immeuble, mesurés sur les plans'); // aide d'origine conservée
    c.remove();
  });
});

/**
 * BAT-2d — NON-RÉGRESSION de la désynchro mère ↔ porteuses. Le bloc REMONTE (`onComptes`) des comptes tirés de SES données ; la mère
 * (ProjectionVue) et le résumé de famille (Réponses/Suivi) se calculent sur CES comptes — donc sur la MÊME source que les sous-titres.
 * Ce test reproduit le cas réel du 07512024V0037 (2 cartes, 1 bâtiment validé, 1 altitude manquante) et prouve que la mère calculée sur
 * les comptes remontés est ROUGE, comme les sous-titres — jamais « complète » verte. Sur l'ancien code (aucune remontée), `onComptes`
 * n'était jamais appelé → ce test échoue. C'est le test qui manquait : il COMPARE la valeur qui pilote la mère à ce que le bloc affiche.
 */
describe('BAT-2d — le bloc remonte des comptes cohérents avec ses sous-titres (mère == porteuses)', () => {
  it('bug 07512024V0037 (2 cartes, 1 validé, 1 altitude manquante) : sous-titres ROUGES ⇒ mère (sur comptes remontés) ROUGE, jamais verte', async () => {
    const recu: ComptesCaracteristiquesPermis[] = [];
    const c = await monter(etat([corps(5, 100), corps(6, null)], 1), { avecEtatFamilles: true, onComptes: (x) => recu.push(x) });
    const t = c.textContent ?? '';
    // Les sous-titres du bloc sont ROUGES (données fraîches) :
    expect(t).toContain('2 cartes pour 1 bâtiment validé');
    expect(t).toContain('altitude manquante (1/2)');
    // Le bloc a REMONTÉ ses comptes, reflétant EXACTEMENT ces données (2 cartes, 1 sans altitude, 1 validé) :
    const dernier = recu.at(-1);
    expect(dernier).toEqual({ dossierId: 468, nbCartes: 2, nbSansAltitude: 1, nbBatimentsValide: 1 });
    // La MÈRE se calcule sur CES comptes remontés (exactement ce que fait ProjectionVue) → ROUGE, nommant les deux sections, jamais « complète » :
    const mere = etatMereCaracteristiques([
      etatCoherenceBatimentsTitre(dernier!.nbCartes, dernier!.nbBatimentsValide),
      etatAltitudesTitre(dernier!.nbCartes, dernier!.nbSansAltitude),
    ]);
    expect(mere.ton).toBe('rouge');
    expect(mere.texte).toContain('2 cartes pour 1 bâtiment validé');
    expect(mere.texte).toContain('altitude manquante (1/2)');
    expect(mere.texte).not.toBe('complète');
    c.remove();
  });

  it('tout cohérent (2 cartes, 2 validés, aucune altitude manquante) : sous-titres VERTS ⇒ mère (sur comptes remontés) VERTE', async () => {
    const recu: ComptesCaracteristiquesPermis[] = [];
    const c = await monter(etat([corps(5, 100), corps(6, 100)], 2), { avecEtatFamilles: true, onComptes: (x) => recu.push(x) });
    const dernier = recu.at(-1);
    expect(dernier).toEqual({ dossierId: 468, nbCartes: 2, nbSansAltitude: 0, nbBatimentsValide: 2 });
    const mere = etatMereCaracteristiques([
      etatCoherenceBatimentsTitre(dernier!.nbCartes, dernier!.nbBatimentsValide),
      etatAltitudesTitre(dernier!.nbCartes, dernier!.nbSansAltitude),
    ]);
    expect(mere).toEqual({ texte: 'complète', ton: 'vert' });
    c.remove();
  });
});
