import { describe, it, expect } from 'vitest';
import { biensRecus, entier } from './route';
import { personnesRecues } from '../suivi/route';

/**
 * ══ 🔴🔴 LOT CONTACTS-EXTERNES — CE QUE LES DEUX ROUTES ACCEPTENT DU NAVIGATEUR ════════════════════════════════
 *
 * 🔴 RIEN N'EST CRU SUR PAROLE. Une intervention est un lien vers une PERSONNE, c'est-à-dire exactement ce que la
 * migration 273 a interdit après un incident. La seule porte qui l'autorise est nommée (`intervention`), et la
 * liste des sortes acceptées est FERMÉE ici, dans une fonction pure qu'un navigateur ne peut pas contourner.
 *
 * ⚠️ ON ÉPROUVE LES FONCTIONS PURES, pas les routes entières : le reste (le droit, l'auteur de la session) est
 * tenu par `exigerCompteActif`, et les écritures sont éprouvées sur une vraie base par
 * `contactsExternes.itest.ts`.
 */

describe('🔴 les clés de biens reçues dans l’adresse de la requête', () => {
  it('🔴 découpées, nettoyées, dédoublonnées', () => {
    expect(biensRecus('421, 422 ,421')).toEqual(['421', '422']);
  });

  it('🔴 vide, absent ou que des blancs ⇒ aucune clé (et donc aucune étape 2)', () => {
    expect(biensRecus(null)).toEqual([]);
    expect(biensRecus('')).toEqual([]);
    expect(biensRecus('  , ,  ')).toEqual([]);
  });

  it('⚠️ bornées à cinquante : on refuse un payload absurde, jamais une saisie', () => {
    const cent = Array.from({ length: 100 }, (_, i) => `L${i}`).join(',');
    expect(biensRecus(cent)).toHaveLength(50);
  });

  it('🔴 un identifiant doit être un entier positif', () => {
    expect(entier('57368')).toBe(57368);
    expect(entier(' 12 ')).toBe(12);
    expect(entier('0')).toBeNull();
    expect(entier('-3')).toBeNull();
    expect(entier('abc')).toBeNull();
    expect(entier(null)).toBeNull();
    expect(entier(1.5)).toBeNull();
  });
});

describe('🔴🔴 les personnes reçues, re-validées contre la liste FERMÉE', () => {
  it('🔴 un propriétaire et un locataire passent, avec leur clé et leur libellé', () => {
    expect(personnesRecues([
      { sorte: 'proprietaire', cle: 'P9', libelle: 'GARREAU Gabrielle' },
      { sorte: 'locataire', cle: 'thai cecile#c@x.fr', libelle: 'THAI Cécile' },
    ])).toEqual([
      { sorte: 'proprietaire', cle: 'P9', libelle: 'GARREAU Gabrielle', contactExterneId: null },
      { sorte: 'locataire', cle: 'thai cecile#c@x.fr', libelle: 'THAI Cécile', contactExterneId: null },
    ]);
  });

  it('🔴🔴 UNE SORTE INCONNUE EST ÉCARTÉE, JAMAIS CORRIGÉE — « lot » et « evenement » compris', () => {
    expect(personnesRecues([
      { sorte: 'lot', cle: '421', libelle: '28 av. Marceau' },
      { sorte: 'evenement', cle: '12', libelle: 'GES-2026-000042' },
      { sorte: 'proprietaire', cle: 'P9', libelle: 'GARREAU Gabrielle' },
    ]).map((p) => p.sorte)).toEqual(['proprietaire']);
  });

  it('🔴 une personne sans clé est écartée : elle ne désigne rien', () => {
    expect(personnesRecues([{ sorte: 'locataire', cle: '   ', libelle: 'X' }])).toEqual([]);
    expect(personnesRecues([{ sorte: 'locataire', libelle: 'X' }])).toEqual([]);
  });

  it('⚠️ un libellé manquant retombe sur la clé — une ligne sans nom se relirait sans savoir de qui', () => {
    expect(personnesRecues([{ sorte: 'locataire', cle: 'L1' }])[0].libelle).toBe('L1');
  });

  it('🔴 l’identité est (sorte, clé) : la même clé sur deux sortes n’est pas un doublon', () => {
    expect(personnesRecues([
      { sorte: 'proprietaire', cle: 'X', libelle: 'A' },
      { sorte: 'locataire', cle: 'X', libelle: 'B' },
    ])).toHaveLength(2);
  });

  it('🔴 un doublon exact est écarté, et le PREMIER gagne', () => {
    const r = personnesRecues([
      { sorte: 'locataire', cle: 'L1', libelle: 'Premier' },
      { sorte: 'locataire', cle: 'L1', libelle: 'Second' },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].libelle).toBe('Premier');
  });

  it('⚠️ l’identifiant du contact externe doit être un entier positif, sinon `null`', () => {
    const avec = personnesRecues([{ sorte: 'locataire', cle: 'L1', libelle: 'X', contactExterneId: 42 }]);
    expect(avec[0].contactExterneId).toBe(42);
    for (const mauvais of [0, -1, 'douze', null, undefined, 1.5, {}]) {
      expect(personnesRecues([
        { sorte: 'locataire', cle: 'L1', libelle: 'X', contactExterneId: mauvais },
      ])[0].contactExterneId, JSON.stringify(mauvais)).toBeNull();
    }
  });

  it('⚠️ ce qui n’est pas une liste d’objets rend une liste vide, sans jamais lever', () => {
    for (const x of [null, undefined, 'personnes', 42, {}, [null, 'x', 7]]) {
      expect(personnesRecues(x), JSON.stringify(x)).toEqual([]);
    }
  });

  it('⚠️ bornées à cinquante, et les clés sont bornées en longueur', () => {
    const cent = Array.from({ length: 100 }, (_, i) => ({ sorte: 'locataire', cle: `L${i}`, libelle: 'X' }));
    expect(personnesRecues(cent)).toHaveLength(50);
    const longue = 'x'.repeat(1000);
    expect(personnesRecues([{ sorte: 'locataire', cle: longue, libelle: longue }])[0].cle).toHaveLength(300);
  });
});
