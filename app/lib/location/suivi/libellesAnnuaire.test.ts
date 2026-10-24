import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/client', () => ({ query: async () => ({ rows: [], rowCount: 0 }), withTransaction: async () => { throw new Error('inattendu'); } }));
const { libelles } = await import('./tableauBordRepo');

/**
 * 🔴 Arno (24/10/2026, Q1) — une ligne rattachée à un BAIL affiche les noms de l'annuaire (à jour partout dans le Suivi) ; le texte
 * du fichier d'une ligne reprise reste lisible (« Libellé d'origine » du panneau). Une ligne sans bail garde son texte. Fictif.
 */
describe('🔴 les noms d’une ligne du suivi', () => {
  it('ligne reprise rattachée à un bail : les noms de l’annuaire ; le texte du fichier en « libellé d’origine »', () => {
    expect(libelles({ bail_id: '12', source: 'import', libelle_proprietaire: 'DUPONT PARK', libelle_locataire: 'MARTIN',
      proprietaire_source: 'DUPONT Jean', locataires_source: 'MARTIN Léa, MARTIN Paul' })).toEqual({
      libelleProprietaire: 'DUPONT Jean', libelleLocataire: 'MARTIN Léa, MARTIN Paul',
      libelleOrigine: { proprietaire: 'DUPONT PARK', locataire: 'MARTIN' },
    });
  });
  it('sans bail rattaché : le texte, tel quel (rien n’est inventé)', () => {
    expect(libelles({ bail_id: null, source: 'import', libelle_proprietaire: 'LEBRETON', libelle_locataire: 'GARCON', proprietaire_source: null, locataires_source: null }))
      .toEqual({ libelleProprietaire: 'LEBRETON', libelleLocataire: 'GARCON' });
  });
  it('rattachée mais l’annuaire ne dit rien (bien sans propriétaire, bail sans occupant) : le texte', () => {
    expect(libelles({ bail_id: '12', source: 'import', libelle_proprietaire: 'A', libelle_locataire: 'B', proprietaire_source: null, locataires_source: '  ' }))
      .toEqual({ libelleProprietaire: 'A', libelleLocataire: 'B' });
  });
  it('ligne saisie dans l’outil : les noms de l’annuaire, sans « libellé d’origine »', () => {
    expect(libelles({ bail_id: '12', source: 'saisie', libelle_proprietaire: 'ancien', libelle_locataire: 'ancien', proprietaire_source: 'DUPONT Jean', locataires_source: 'MARTIN Léa' }))
      .toEqual({ libelleProprietaire: 'DUPONT Jean', libelleLocataire: 'MARTIN Léa' });
  });
});
