import { describe, it, expect } from 'vitest';
import { etatProjectionTitre, etatProjectionTitreDepuisComptes, etatAltitudesTitre, etatCoherenceBatimentsTitre, etatMereCaracteristiques, etatPlancheTitre } from './etatFamilleProjection';
import { clotureVisible } from '../../(admin)/admin/(protected)/permis/CaracteristiquesRendu'; // SOURCE UNIQUE de la visibilité du bloc de sortie (pure)

/**
 * RATT-1 / BAT-2 — états portés par la ligne de titre des familles « Bâtiments et projection » / « Caractéristiques du permis ». PUR.
 * ⚠️ BAT-2 RÉVISE la règle RATT-1 « 0 bâtiment → NEUTRE » pour la SOUS-SECTION « Les futurs bâtiments et leurs altitudes » : 0 carte → ROUGE
 *   (une projection exige au moins une carte). Voir le describe `etatAltitudesTitre` plus bas.
 */
describe('RATT-1 — etatProjectionTitre', () => {
  it('non validée → rouge ; validée → vert', () => {
    expect(etatProjectionTitre(false)).toEqual({ texte: 'projection non validée', ton: 'rouge' });
    expect(etatProjectionTitre(true)).toEqual({ texte: 'projection validée', ton: 'vert' });
  });
});

/**
 * CORRECTIF A — repli du titre « Bâtiments et projection » calculé sur les COMPTES de la ligne (validation PAR BÂTIMENT, calqué sur
 * estValidationAcquise, MÊME règle que l'en-tête live). La section et la ligne disent une seule vérité, indépendante du jalon dossier
 * `permis_projection`. Cas couverts : tout validé, rien validé, partiellement validé, 0 bâtiment.
 */
describe('CORRECTIF A — etatProjectionTitreDepuisComptes (comptes → état)', () => {
  it('tout validé (≥1 bâtiment, 0 sans altitude, 0 sans emprise) → VERT', () => {
    expect(etatProjectionTitreDepuisComptes(1, 0, 0)).toEqual({ texte: 'Projection validée', ton: 'vert' });
    expect(etatProjectionTitreDepuisComptes(3, 0, 0)).toEqual({ texte: 'Projections validées', ton: 'vert' }); // pluriel
  });
  it('rien validé (toutes altitudes ET emprises manquantes) → ROUGE disant ce qui manque', () => {
    expect(etatProjectionTitreDepuisComptes(2, 2, 2)).toEqual({ texte: 'projection non validée — à valider : 2 altitudes de sommet et 2 emprises', ton: 'rouge' });
  });
  it('partiellement validé (une seule dimension manque) → ROUGE ciblé', () => {
    expect(etatProjectionTitreDepuisComptes(3, 1, 0)).toEqual({ texte: 'projection non validée — à valider : 1 altitude de sommet', ton: 'rouge' });
    expect(etatProjectionTitreDepuisComptes(3, 0, 2)).toEqual({ texte: 'projection non validée — à valider : 2 emprises', ton: 'rouge' });
  });
  it('0 bâtiment → ROUGE (jamais validé par vacuité)', () => {
    expect(etatProjectionTitreDepuisComptes(0, 0, 0)).toEqual({ texte: 'projection non validée (aucun bâtiment déclaré)', ton: 'rouge' });
  });
});

/**
 * BLOC DE SORTIE VISIBLE (repli AVANT ouverture du sous-bloc « Bâtiments et projection ») — le bloc « Valider le permis — envoyer en
 * Rattachement » doit apparaître DÈS l'ouverture de la ligne pour un permis entièrement validé, sans devoir ouvrir le sous-bloc. Sa
 * visibilité = `clotureVisible(mode, etatProjectionTitreDepuisComptes(comptes).ton === 'vert', dejaPasse)` — MÊME source (estValidationAcquise
 * sur les comptes de la ligne) que le titre de section. Cas : tout validé, partiellement validé, 0 bâtiment. Le réglage de clôture
 * (mode `cloture_manuelle`) est HORS PÉRIMÈTRE : ce filet ne fait qu'ancrer le MOMENT (les comptes suffisent, sans en-tête live).
 */
describe('BLOC DE SORTIE — visible dès l’ouverture depuis les comptes de la ligne', () => {
  const sortieVisible = (nbBat: number, sansAlt: number, sansEmp: number, mode: 'automatique' | 'cloture_manuelle' = 'cloture_manuelle', dejaPasse = false) =>
    clotureVisible(mode, etatProjectionTitreDepuisComptes(nbBat, sansAlt, sansEmp).ton === 'vert', dejaPasse);

  it('tout validé (mode clôture manuelle) → bloc de sortie VISIBLE sans en-tête live', () => {
    expect(sortieVisible(1, 0, 0)).toBe(true);
    expect(sortieVisible(3, 0, 0)).toBe(true);
  });
  it('partiellement validé → bloc de sortie MASQUÉ', () => {
    expect(sortieVisible(3, 1, 0)).toBe(false);
    expect(sortieVisible(2, 0, 2)).toBe(false);
  });
  it('0 bâtiment → bloc de sortie MASQUÉ (jamais validé par vacuité)', () => {
    expect(sortieVisible(0, 0, 0)).toBe(false);
  });
  it('règles de clôture INCHANGÉES : mode automatique OU déjà passé → masqué même tout validé', () => {
    expect(sortieVisible(2, 0, 0, 'automatique')).toBe(false);
    expect(sortieVisible(2, 0, 0, 'cloture_manuelle', true)).toBe(false);
  });
});

describe('BAT-2 — etatAltitudesTitre (section « Les futurs bâtiments et leurs altitudes »)', () => {
  it('AUCUNE carte → ROUGE « aucune carte de bâtiment » (règle RÉVISÉE : plus de neutre par vacuité)', () => {
    expect(etatAltitudesTitre(0, 0)).toEqual({ texte: 'aucune carte de bâtiment', ton: 'rouge' });
    expect(etatAltitudesTitre(0, 5)).toEqual({ texte: 'aucune carte de bâtiment', ton: 'rouge' }); // garde-fou : nb sans altitude ignoré si 0 carte
  });
  it('≥ 1 carte sans altitude → rouge (avec compte) ; pluriel accordé', () => {
    expect(etatAltitudesTitre(2, 1)).toEqual({ texte: 'altitude manquante (1/2)', ton: 'rouge' });
    expect(etatAltitudesTitre(3, 2)).toEqual({ texte: 'altitudes manquantes (2/3)', ton: 'rouge' });
  });
  it('toutes renseignées → vert (avec compte) ; pluriel accordé', () => {
    expect(etatAltitudesTitre(1, 0)).toEqual({ texte: 'altitudes renseignées (1 bâtiment)', ton: 'vert' });
    expect(etatAltitudesTitre(4, 0)).toEqual({ texte: 'altitudes renseignées (4 bâtiments)', ton: 'vert' });
  });
});

describe('BAT-2 — etatCoherenceBatimentsTitre (section « Caractéristiques et bâtiments d’origine »)', () => {
  it('nombre validé NULL (jamais validé — 0 détecté laissé NULL par BAT-1) → NEUTRE, sans mentir', () => {
    expect(etatCoherenceBatimentsTitre(0, null)).toEqual({ texte: 'nombre de bâtiments non validé', ton: 'neutre' });
    expect(etatCoherenceBatimentsTitre(3, null)).toEqual({ texte: 'nombre de bâtiments non validé', ton: 'neutre' }); // le nb de cartes ne suffit pas à valider
  });
  it('cartes ≠ nombre validé → ROUGE, libellé qui DIT l’incohérence (pluriel accordé)', () => {
    expect(etatCoherenceBatimentsTitre(3, 2)).toEqual({ texte: '3 cartes pour 2 bâtiments validés', ton: 'rouge' });
    expect(etatCoherenceBatimentsTitre(1, 2)).toEqual({ texte: '1 carte pour 2 bâtiments validés', ton: 'rouge' });
    expect(etatCoherenceBatimentsTitre(2, 1)).toEqual({ texte: '2 cartes pour 1 bâtiment validé', ton: 'rouge' });
  });
  it('cartes === nombre validé → VERT', () => {
    expect(etatCoherenceBatimentsTitre(1, 1)).toEqual({ texte: 'nombre de cartes cohérent avec le nombre validé', ton: 'vert' });
    expect(etatCoherenceBatimentsTitre(3, 3)).toEqual({ texte: 'nombre de cartes cohérent avec le nombre validé', ton: 'vert' });
    expect(etatCoherenceBatimentsTitre(0, 0)).toEqual({ texte: 'nombre de cartes cohérent avec le nombre validé', ton: 'vert' }); // 0 validé ET 0 carte : cohérent (la vacuité des cartes est portée par la section 4)
  });
});

describe('BAT-2 — etatMereCaracteristiques (agrégat des porteuses, 2 états)', () => {
  const vert = { texte: 'nombre de cartes cohérent avec le nombre validé', ton: 'vert' } as const;
  const rouge = { texte: 'altitudes manquantes (1/3)', ton: 'rouge' } as const;
  const neutre = { texte: 'nombre de bâtiments non validé', ton: 'neutre' } as const;

  it('TOUTES les porteuses vertes → mère VERTE', () => {
    expect(etatMereCaracteristiques([vert, { texte: 'altitudes renseignées (3 bâtiments)', ton: 'vert' }]))
      .toEqual({ texte: 'complète', ton: 'vert' });
  });
  it('une porteuse ROUGE → mère ROUGE, et NOMME le blocage en reprenant son texte', () => {
    expect(etatMereCaracteristiques([vert, rouge])).toEqual({ texte: 'altitudes manquantes (1/3)', ton: 'rouge' });
  });
  it('une porteuse NEUTRE → mère ROUGE (« pas encore fait » ≠ « rien à faire »), et la nomme', () => {
    expect(etatMereCaracteristiques([neutre, { texte: 'altitudes renseignées (3 bâtiments)', ton: 'vert' }]))
      .toEqual({ texte: 'nombre de bâtiments non validé', ton: 'rouge' });
  });
  it('plusieurs bloquantes → mère ROUGE, les nomme TOUTES (leurs propres textes, joints)', () => {
    expect(etatMereCaracteristiques([neutre, rouge]))
      .toEqual({ texte: 'nombre de bâtiments non validé · altitudes manquantes (1/3)', ton: 'rouge' });
  });
  it('NON-BLOQUANTES hors calcul : l’appelant ne passe QUE les porteuses → une section informative rouge/vide n’altère JAMAIS la mère', () => {
    // Les non-bloquantes (compte rendu Cerfa, permis déclaré) ne sont pas des entrées. Deux porteuses vertes ⇒ verte, quel que soit l’état
    //   d’une éventuelle section informative (qui n’est simplement pas fournie ici).
    expect(etatMereCaracteristiques([vert, { texte: 'altitudes renseignées (2 bâtiments)', ton: 'vert' }]).ton).toBe('vert');
  });
});

describe('PL-ÉTAT — etatPlancheTitre (ligne « Planche cadastrale »)', () => {
  it('PRIORITÉ au changement en attente : rouge « modifiée — non validée », quel que soit le reste', () => {
    // Un changement à l'écran non appliqué prime sur validée/automatique et sur le cas (une action reste à faire).
    expect(etatPlancheTitre({ selectionValidee: false, changementEnAttente: true, cas: 'correspondance' }))
      .toEqual({ texte: 'sélection modifiée — non validée', ton: 'rouge' });
    expect(etatPlancheTitre({ selectionValidee: true, changementEnAttente: true, cas: 'en_trop' }))
      .toEqual({ texte: 'sélection modifiée — non validée', ton: 'rouge' });
  });

  it('sélection VALIDÉE, mêmes parcelles → VERT + nuance « mêmes parcelles » (cas Chrome b après validation concordante)', () => {
    expect(etatPlancheTitre({ selectionValidee: true, changementEnAttente: false, cas: 'correspondance' }))
      .toEqual({ texte: 'validée — mêmes parcelles que le permis', ton: 'vert' });
  });

  it('sélection VALIDÉE avec ÉCART → VERT + nuance « parcelles différentes » (écart validé reste visible en clair, pas masqué) — cas Chrome c', () => {
    for (const cas of ['manquantes', 'en_trop', 'manquantes_et_en_trop', 'a_verifier'] as const) {
      expect(etatPlancheTitre({ selectionValidee: true, changementEnAttente: false, cas }))
        .toEqual({ texte: 'validée — parcelles différentes du permis', ton: 'vert' });
    }
  });

  it('AUTOMATIQUE concordant (ou incomparable) → NEUTRE « configuration automatique », AUCUNE alerte (cas Chrome a)', () => {
    expect(etatPlancheTitre({ selectionValidee: false, changementEnAttente: false, cas: 'correspondance' }))
      .toEqual({ texte: 'configuration automatique', ton: 'neutre' });
    expect(etatPlancheTitre({ selectionValidee: false, changementEnAttente: false, cas: 'impossible' }))
      .toEqual({ texte: 'configuration automatique', ton: 'neutre' }); // rien à comparer → pas de faux « écart »
  });

  it('AUTOMATIQUE en ÉCART avec le permis → ROUGE « écart… » (rule 3 : signalement sans déplier, jamais un blocage)', () => {
    for (const cas of ['manquantes', 'en_trop', 'manquantes_et_en_trop', 'a_verifier'] as const) {
      expect(etatPlancheTitre({ selectionValidee: false, changementEnAttente: false, cas }))
        .toEqual({ texte: 'écart avec les parcelles déclarées au permis', ton: 'rouge' });
    }
  });
});
