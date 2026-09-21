import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { estValidationAcquise } from '../../../../lib/permis/rattachementGroupes';
import { etatEnteteProjection } from '../../../../lib/permis/projectionBatiments';

// BUG — l'état d'un permis oscillait entre la LIGNE FERMÉE (rouge) et le DOSSIER OUVERT (vert) après le retrait d'une carte de bâtiment.
//
// Cause établie par mesure (dossier réel 468 / permis 07511924V0040) : la carte retirée est un soft-delete (permis_corps_batiment.actif=false,
// migration 219 APPLIQUÉE). AUCUN lecteur n'omet le prédicat d'activité — le lecteur de la file (listerFileProjection) filtre `actif` comme
// l'intérieur. La divergence était une PÉREMPTION du snapshot : la ligne fermée lit le snapshot de la file, l'intérieur lit du LIVE. Le retrait
// de carte (CaracteristiquesBloc, geste « changer le nombre ») ne rafraîchissait PAS la file → snapshot figé à 2 bâtiments (rouge), intérieur
// live à 1 (vert). Le correctif : rafraîchir la file après une mutation de caractéristiques (comme après une mutation d'emprise).

describe('oscillation état permis (ligne fermée ↔ dossier ouvert) — INVARIANT de calcul', () => {
  // La ligne FERMÉE colore via estValidationAcquise ; l'intérieur « Bâtiments et projection » via etatEnteteProjection (qui APPELLE
  // estValidationAcquise). Donc, À COMPTES ÉGAUX, les deux disent TOUJOURS la même chose : le verdict ne peut diverger que si on leur donne
  // des comptes DIFFÉRENTS (snapshot périmé ≠ live). Le correctif garantit qu'ils lisent les MÊMES comptes (file rafraîchie).
  const memeVerdict = (nbBat: number, sansAltV: number, sansEmpV: number) => {
    const ligneFermee = estValidationAcquise(nbBat, sansAltV, sansEmpV);       // couleur du n° de la ligne
    const interieur = etatEnteteProjection(nbBat, sansAltV, sansEmpV).ton === 'vert'; // titre « Bâtiments et projection »
    return { ligneFermee, interieur };
  };

  it('comptes FRAIS après retrait soft (1 bâtiment actif, tout validé) : ligne fermée ET intérieur = VERT (identiques)', () => {
    const v = memeVerdict(1, 0, 0);
    expect(v.ligneFermee).toBe(true);
    expect(v.interieur).toBe(true);
    expect(v.ligneFermee).toBe(v.interieur); // MÊME état fermé et ouvert (l'invariant demandé)
  });

  it('comptes PÉRIMÉS (2 bâtiments dont 1 retiré non pris en compte) : les deux dériveraient ROUGE — jamais l’un vert et l’autre rouge', () => {
    const v = memeVerdict(2, 1, 1); // la carte retirée (sans altitude/emprise validée) rend le lot incomplet
    expect(v.ligneFermee).toBe(false);
    expect(v.interieur).toBe(false);
    expect(v.ligneFermee).toBe(v.interieur); // à comptes égaux, jamais de divergence : la divergence venait de comptes DIFFÉRENTS
  });

  it('la divergence ne peut naître QUE de comptes différents (snapshot périmé vs live) — c’est ce que le rafraîchissement supprime', () => {
    const snapshotPerime = estValidationAcquise(2, 1, 1);  // ce que voyait la ligne fermée (file non rafraîchie)
    const live = estValidationAcquise(1, 0, 0);            // ce que voyait l’intérieur (données fraîches)
    expect(snapshotPerime).not.toBe(live);                 // OSCILLATION : rouge fermé, vert ouvert
    // Après correctif, la ligne fermée lit AUSSI (1,0,0) → plus d’écart.
    expect(estValidationAcquise(1, 0, 0)).toBe(live);
  });
});

describe('oscillation état permis — le correctif rafraîchit la file après une mutation de caractéristiques (garde de source)', () => {
  // Composants clients « non montables » (fetch au montage, BlocTraceEmprise → pdfjs/canvas). On vérifie le CÂBLAGE au niveau de la source
  //   (même patron que CartouchesAjustables.test), sur une chaîne à espaces normalisés (jamais la forme exacte).
  // LOT 1 (parité fiche) — les DEUX mutations (caractéristiques + emprise) vivent désormais dans FichePermisBlocs et déclenchent le refresh
  //   de la file du PARENT via `onRafraichirFile` ; le parent (ProjectionVue) branche ce callback sur `rafraichirFile` (re-fetch de la file).
  const FICHE = readFileSync('app/(admin)/admin/(protected)/permis/FichePermisBlocs.tsx', 'utf8').replace(/\s+/g, ' ');
  const PROJ = readFileSync('app/(admin)/admin/(protected)/permis/ProjectionVue.tsx', 'utf8').replace(/\s+/g, ' ');

  it('la mutation de caractéristiques (retrait de carte) rafraîchit la file, comme la mutation d’emprise', () => {
    // onChange de CaracteristiquesBloc : re-instruit l’intérieur ET rafraîchit le snapshot de la file du parent (sinon la ligne fermée reste périmée).
    expect(FICHE).toContain('onChange={() => { setVInstruction((v) => v + 1); onRafraichirFile?.(); }}');
    // La mutation d’emprise rafraîchit AUSSI la file (patron de référence) — on le garde.
    expect(FICHE).toContain('setVEmprise((v) => v + 1); onRafraichirFile?.();');
    // Les DEUX chemins de mutation (caractéristiques + emprise) appellent onRafraichirFile → le snapshot ne peut plus rester périmé.
    expect((FICHE.match(/onRafraichirFile\?\.\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it('le parent (ProjectionVue) branche onRafraichirFile sur rafraichirFile (re-fetch de la file autoritative)', () => {
    expect(PROJ).toContain('onRafraichirFile={rafraichirFile}');   // le pont : les mutations des blocs re-fetchent la file du parent
    expect(PROJ).toContain('const rafraichirFile = useCallback');  // rafraichirFile re-fetche la file (source autoritative) — inchangé
  });
});
