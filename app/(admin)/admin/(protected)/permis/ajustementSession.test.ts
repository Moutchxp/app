import { describe, it, expect } from 'vitest';
import { deltaEgal, estAjustementModifie, estRetoucheModifiee, sessionModifiee, basculeRefusee, empriseSelectionnee, type DeltaComparable } from './ajustementSession';

const D = (o: Partial<DeltaComparable> = {}): DeltaComparable => ({ tx: 0, ty: 0, rotDeg: 0, echelle: 1, ...o });

describe('deltaEgal — égalité de deux deltas rigides à epsilon près', () => {
  it('deux identités sont égales', () => {
    expect(deltaEgal(D(), D())).toBe(true);
  });
  it('une différence sur un scalaire (au-delà d’epsilon) → non égal', () => {
    expect(deltaEgal(D(), D({ tx: 0.65 }))).toBe(false);
    expect(deltaEgal(D(), D({ rotDeg: 1 }))).toBe(false);
    expect(deltaEgal(D(), D({ echelle: 1.02 }))).toBe(false);
  });
  it('un écart INFÉRIEUR à epsilon est ignoré (tolérance numérique)', () => {
    expect(deltaEgal(D(), D({ tx: 1e-12 }))).toBe(true);
  });
});

describe('estAjustementModifie — la session en cours diffère-t-elle de son armement ?', () => {
  it('aucune session (null) → false', () => {
    expect(estAjustementModifie(null, [])).toBe(false);
  });

  it('emprise SANS ajustement persisté, delta identité (à peine armée) → NON modifiée', () => {
    const emprises = [{ id: 5, ajustement: null }];
    expect(estAjustementModifie({ bloc: false, id: 5, delta: D() }, emprises)).toBe(false);
  });

  it('emprise SANS ajustement persisté, delta déplacé → MODIFIÉE', () => {
    const emprises = [{ id: 5, ajustement: null }];
    expect(estAjustementModifie({ bloc: false, id: 5, delta: D({ tx: 0.65 }) }, emprises)).toBe(true);
  });

  it('emprise AVEC ajustement persisté, delta ÉGAL au persisté (armée sur le stocké, intouchée) → NON modifiée', () => {
    const stocke = D({ tx: 2, rotDeg: 3, echelle: 1.1 });
    const emprises = [{ id: 7, ajustement: stocke }];
    expect(estAjustementModifie({ bloc: false, id: 7, delta: { ...stocke } }, emprises)).toBe(false);
  });

  it('emprise AVEC ajustement persisté, delta CHANGÉ depuis le persisté → MODIFIÉE', () => {
    const stocke = D({ tx: 2, rotDeg: 3, echelle: 1.1 });
    const emprises = [{ id: 7, ajustement: stocke }];
    expect(estAjustementModifie({ bloc: false, id: 7, delta: D({ tx: 2.5, rotDeg: 3, echelle: 1.1 }) }, emprises)).toBe(true);
  });

  it('geste d’ENSEMBLE (bloc) : armé sur l’identité → non modifié à l’identité, modifié dès un geste', () => {
    expect(estAjustementModifie({ bloc: true, id: null, delta: D() }, [])).toBe(false);
    expect(estAjustementModifie({ bloc: true, id: null, delta: D({ rotDeg: 2 }) }, [])).toBe(true);
  });
});

describe('sessionModifiee — le travail en cours (ajustement OU retouche) a-t-il des modifications non enregistrées ?', () => {
  const emprises = [{ id: 1, ajustement: null }];
  it('rien en cours → non modifié', () => {
    expect(sessionModifiee(null, emprises, 0)).toBe(false);
  });
  it('ajustement déplacé (retouche absente) → modifié', () => {
    expect(sessionModifiee({ bloc: false, id: 1, delta: D({ tx: 46.6 }) }, emprises, 0)).toBe(true);
  });
  it('retouche avec au moins une édition (historique > 0) → modifié, même sans ajustement', () => {
    expect(sessionModifiee(null, emprises, 2)).toBe(true);
  });
  it('ajustement intouché ET retouche sans édition → non modifié', () => {
    expect(sessionModifiee({ bloc: false, id: 1, delta: D() }, emprises, 0)).toBe(false);
  });
});

describe('estRetoucheModifiee — ouvrir une retouche n’est pas retoucher (équivalent sommets de estAjustementModifie)', () => {
  it('entrer en retouche sans rien modifier (historique vide) → NON modifié', () => {
    expect(estRetoucheModifiee(0)).toBe(false); // demarrerRetouche pose hist: [] → rien à perdre, aucune « retouche en cours »
  });
  it('déplacer un sommet (une édition dans l’historique) → modifié', () => {
    expect(estRetoucheModifiee(1)).toBe(true);
  });
  it('annuler ce déplacement pour revenir à l’identique (historique de nouveau vide) → NON modifié', () => {
    expect(estRetoucheModifiee(0)).toBe(false); // « Annuler la dernière action » dépile l’historique (annulerRetouche) → retour à intouchée
  });
  it('unifié avec sessionModifiee : la retouche seule pilote « modifié » sans ajustement', () => {
    expect(sessionModifiee(null, [], 0)).toBe(false);
    expect(sessionModifiee(null, [], 1)).toBe(true);
  });
});

describe('basculeRefusee — changer de polygone ET/OU de mode est-il refusé (⇒ confirmation) ?', () => {
  it('rien en cours → jamais refusé', () => {
    expect(basculeRefusee(null, { id: 2, mode: 'ajuster' }, true)).toBe(false);
  });
  it('cible = état courant (même emprise + même mode) → pas un changement → non refusé', () => {
    expect(basculeRefusee({ id: 2, mode: 'ajuster' }, { id: 2, mode: 'ajuster' }, true)).toBe(false);
  });
  it('changement de POLYGONE, session intouchée → non refusé (bascule directe)', () => {
    expect(basculeRefusee({ id: 1, mode: 'ajuster' }, { id: 2, mode: 'ajuster' }, false)).toBe(false);
  });
  it('changement de POLYGONE, travail non enregistré → REFUSÉ', () => {
    expect(basculeRefusee({ id: 1, mode: 'ajuster' }, { id: 2, mode: 'ajuster' }, true)).toBe(true);
  });
  it('changement de MODE (même emprise), travail non enregistré → REFUSÉ', () => {
    expect(basculeRefusee({ id: 1, mode: 'ajuster' }, { id: 1, mode: 'retoucher' }, true)).toBe(true);
  });
  it('changement de MODE (même emprise), session intouchée → non refusé (bascule directe)', () => {
    expect(basculeRefusee({ id: 1, mode: 'ajuster' }, { id: 1, mode: 'retoucher' }, false)).toBe(false);
  });
});

describe('empriseSelectionnee (défaut A) — SOURCE UNIQUE : cerclé, nom, surlignage, tiges et cible dérivent tous de cet id', () => {
  it('rien en cours → null', () => {
    expect(empriseSelectionnee(null, null)).toBeNull();
  });
  it('ajustement d’UNE emprise → son id (le polygone visé)', () => {
    expect(empriseSelectionnee({ bloc: false, id: 17 }, null)).toBe(17);
  });
  it('SÉLECTIONNER LA SECONDE (id 17) → la cible est bien 17, jamais une autre (16/18)', () => {
    // Dossier réel 11430 (corps 3, emprises 16/17/18) : sélectionner « bâtiment en projet (2) » = id 17 → l'id visé est 17, pas 16 ni 18.
    expect(empriseSelectionnee({ bloc: false, id: 17 }, null)).toBe(17);
    expect(empriseSelectionnee({ bloc: false, id: 16 }, null)).toBe(16);
    expect(empriseSelectionnee({ bloc: false, id: 18 }, null)).toBe(18);
  });
  it('retouche → l’emprise retouchée (le mode ne change pas la cible)', () => {
    expect(empriseSelectionnee(null, { id: 42 })).toBe(42);
  });
  it('geste d’ENSEMBLE (bloc) → null (aucune emprise unique sélectionnée)', () => {
    expect(empriseSelectionnee({ bloc: true, id: null }, null)).toBeNull();
  });
});
