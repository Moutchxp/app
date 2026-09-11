// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { MESURES } from './caracteristiquesForm';
import { etatCaracteristiquesPermis, type ComptesCaracteristiquesPermis } from '../../../../lib/permis/etatFamilleProjection';

/**
 * BAT-2b / BAT-4 — l'ÉTAT s'affiche sur le TITRE de la SEULE porteuse « Les futurs bâtiments et leurs altitudes » (section 4, qui couvre
 * DÉSORMAIS altitude ET cohérence du nombre) dès que la vue passe `avecEtatFamilles` — LES CINQ vues (Projection, Rattachement, Archives,
 * Réponses, Suivi). La section 1 « Caractéristiques et bâtiments d'origine » est redevenue NON BLOQUANTE (aucun état sur son titre). Comme
 * les cinq montent le MÊME composant avec le MÊME drapeau (câblage vérifié par tsc), rendre ici `CaracteristiquesBloc` avec le drapeau PROUVE
 * ce qu'affiche chaque vue. On rend le composant RÉEL (effets + fetch mocké, jsdom), on lit les TITRES (visibles bloc REPLIÉ, aucun dépliage).
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

describe('BAT-4 — état sur la SEULE porteuse (section 4) ; section 1 non bloquante', () => {
  it('MODE 4 AUTRES VUES : section 4 porte l’ALTITUDE ; section 1 SANS état ; aide « un par immeuble » CONSERVÉE', async () => {
    // 2 cartes, 1 sans altitude, nombre validé = 2 → cohérence VERTE (2==2) ⇒ section 4 ROUGE au seul motif altitude (1/2).
    const c = await monter(etat([corps(5, 100), corps(6, null)], 2), { avecEtatFamilles: true });
    const t = c.textContent ?? '';
    expect(t).toContain('altitude manquante (1/2)');                              // état section 4 (motif altitude)
    expect(t).not.toContain('nombre de cartes cohérent avec le nombre validé');   // BAT-4 : section 1 n'a PLUS d'état (ce libellé vert n'est jamais rendu)
    expect(t).toContain('un par immeuble, mesurés sur les plans');               // aide CONSERVÉE
    c.remove();
  });

  it('MODE PROJECTION (etatSection4SansAide) : même état section 4, l’aide est REMPLACÉE par l’état', async () => {
    const c = await monter(etat([corps(5, 100), corps(6, null)], 2), { avecEtatFamilles: true, etatSection4SansAide: true });
    const t = c.textContent ?? '';
    expect(t).toContain('altitude manquante (1/2)');
    expect(t).not.toContain('un par immeuble, mesurés sur les plans'); // aide REMPLACÉE (comportement Projection préservé)
    c.remove();
  });

  it('INCOHÉRENCE (cartes ≠ nombre validé, altitudes OK) → portée par la SECTION 4, une seule fois (plus par section 1)', async () => {
    const c = await monter(etat([corps(5, 100), corps(6, 100)], 3), { avecEtatFamilles: true }); // 2 cartes, 3 validés
    const t = c.textContent ?? '';
    expect(t).toContain('2 cartes / 3 validés');                          // libellé abrégé BAT-4, sur la section 4
    expect((t.match(/2 cartes \/ 3 validés/g) ?? []).length).toBe(1);     // une SEULE fois (jamais dupliqué sur section 1 devenue plate)
    c.remove();
  });

  it('nombre validé NULL (jamais validé) → SECTION 4 « nombre de bâtiments non validé » (motif cohérence, composé)', async () => {
    const c = await monter(etat([corps(5, 100)], null), { avecEtatFamilles: true });
    expect(c.textContent ?? '').toContain('nombre de bâtiments non validé');
    c.remove();
  });

  it('LES DEUX motifs (incohérence + altitude) → titre abrégé « cohérence · altitude » sur la section 4', async () => {
    // 2 cartes, 1 sans altitude, 1 validé → « 2 cartes / 1 validé · altitude manquante (1/2) ».
    const c = await monter(etat([corps(5, 100), corps(6, null)], 1), { avecEtatFamilles: true });
    expect(c.textContent ?? '').toContain('2 cartes / 1 validé · altitude manquante (1/2)');
    c.remove();
  });

  it('SANS drapeau (comportement d’origine) : aucun état sur les titres ; l’aide de la section 4 reste', async () => {
    const c = await monter(etat([corps(5, 100), corps(6, null)], 2), {});
    const t = c.textContent ?? '';
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
describe('BAT-2d / BAT-4 — le bloc remonte des comptes cohérents avec son sous-titre (mère == unique porteuse, jamais divergente)', () => {
  it('bug 07512024V0037 (2 cartes, 1 validé, 1 altitude manquante) : sous-titre section 4 ROUGE ⇒ mère (sur comptes remontés) ROUGE, jamais verte', async () => {
    const recu: ComptesCaracteristiquesPermis[] = [];
    const c = await monter(etat([corps(5, 100), corps(6, null)], 1), { avecEtatFamilles: true, onComptes: (x) => recu.push(x) });
    // Le sous-titre de la section 4 réunit les DEUX motifs (données fraîches) — abrégé :
    expect(c.textContent ?? '').toContain('2 cartes / 1 validé · altitude manquante (1/2)');
    // Le bloc a REMONTÉ ses comptes, reflétant EXACTEMENT ces données (2 cartes, 1 sans altitude, 1 validé) :
    const dernier = recu.at(-1);
    expect(dernier).toEqual({ dossierId: 468, nbCartes: 2, nbSansAltitude: 1, nbBatimentsValide: 1 });
    // La MÈRE se calcule sur CES comptes (exactement ce que fait ProjectionVue → etatCaracteristiquesPermis) → ROUGE, REPREND le sous-titre, jamais « complète » :
    const mere = etatCaracteristiquesPermis(dernier!);
    expect(mere.ton).toBe('rouge');
    expect(mere.texte).toBe('2 cartes / 1 validé · altitude manquante (1/2)'); // 🔴 propriété BAT-2d : mère == sous-titre de la porteuse
    expect(mere.texte).not.toBe('complète');
    c.remove();
  });

  it('tout cohérent (2 cartes, 2 validés, aucune altitude manquante) : sous-titre VERT ⇒ mère (sur comptes remontés) VERTE', async () => {
    const recu: ComptesCaracteristiquesPermis[] = [];
    const c = await monter(etat([corps(5, 100), corps(6, 100)], 2), { avecEtatFamilles: true, onComptes: (x) => recu.push(x) });
    const dernier = recu.at(-1);
    expect(dernier).toEqual({ dossierId: 468, nbCartes: 2, nbSansAltitude: 0, nbBatimentsValide: 2 });
    expect(etatCaracteristiquesPermis(dernier!)).toEqual({ texte: 'complète', ton: 'vert' });
    c.remove();
  });
});
