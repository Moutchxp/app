import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * DEPOT-2 — GARDE de câblage : les compteurs du COMMUTATEUR de process doivent rester branchés sur le FOYER de rafraîchissement.
 * Le même mode de panne — « un composant monte sans le signal de rafraîchissement et garde un état périmé » — s'est produit DEUX
 * fois : DEPOT-1 (BlocDepot), puis DEPOT-2 (commutateur). Ce repo n'a AUCUNE infra d'interaction (pas de jsdom / testing-library ;
 * tous les tests d'UI sont en renderToStaticMarkup, sans effets ni fetch). On fige donc le câblage AU NIVEAU SOURCE, whitespace-
 * normalisé — exactement comme les tests de schéma (`relanceReglagesSchema.test.ts`) lisent les migrations. Le test CASSE si un
 * compteur du commutateur cesse de dépendre du foyer `apresAction`, ou si ADemanderVue cesse de notifier le parent.
 */
const tuile = readFileSync('app/(admin)/admin/(protected)/permis/PermisTuile.tsx', 'utf8').replace(/\s+/g, ' ');
const aDemander = readFileSync('app/(admin)/admin/(protected)/permis/ADemanderVue.tsx', 'utf8').replace(/\s+/g, ' ');

describe('DEPOT-2 — les compteurs du commutateur dépendent du foyer de rafraîchissement', () => {
  it('le foyer unique `apresAction` recharge BIEN les compteurs du commutateur (rechargerCompteursProcess)', () => {
    expect(tuile).toMatch(/apresAction = useCallback\(\(\): void => \{[^}]*rechargerCompteursProcess\(\)/);
  });

  it('ADemanderVue (préparation + dépôt/annulation via BlocDepot) est câblé au foyer : onChangement={apresAction}', () => {
    expect(tuile).toContain('<ADemanderVue');
    expect(tuile).toMatch(/<ADemanderVue[^>]*onChangement=\{apresAction\}/);
  });

  it('la bascule de rail ET les onglets à action passent par le MÊME foyer (aucun compteur périmé)', () => {
    expect(tuile).toMatch(/<BasculeRail[^>]*onBascule=\{apresAction\}/);
    expect(tuile).toMatch(/<ReponsesVue[^>]*onRecompter=\{apresAction\}/);
  });

  it('ADemanderVue funnel ses actions par `signalerChangement`, qui NOTIFIE le parent (onChangement)', () => {
    expect(aDemander).toContain('onChangement?.()');                  // le funnel notifie le parent
    expect(aDemander).toContain('onChangement={signalerChangement}'); // dépôt + annulation (BlocDepot) → funnel
    expect(aDemander).toContain('signalerChangement();');             // création → funnel (jamais un setSignalSuivi nu qui oublierait le parent)
  });
});
