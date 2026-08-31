import { describe, it, expect } from 'vitest';
import { fusionnerOptions, LABEL_PROVENANCE, type OptionDestinataire, type ProvenanceAdresse } from './optionsDestinataire';

/**
 * LOT 29 — règles PURES du sélecteur de destinataire, séparées du rendu. `fusionnerOptions` mélange les options serveur (jeu règle B)
 * avec les adresses ajoutées à la main pendant la session, sans jamais dupliquer une adresse déjà connue (dédup insensible à la casse).
 */
const o = (adresse: string, provenance: ProvenanceAdresse = 'repondant'): OptionDestinataire => ({ adresse, provenance });

describe('fusionnerOptions — dédoublonnage session vs serveur', () => {
  it('une adresse ajoutée à la main ABSENTE du serveur apparaît (après les options serveur)', () => {
    expect(fusionnerOptions([o('a@m.fr', 'repondant')], [o('b@m.fr', 'ajout')]))
      .toEqual([{ adresse: 'a@m.fr', provenance: 'repondant' }, { adresse: 'b@m.fr', provenance: 'ajout' }]);
  });

  it('une adresse ajoutée DÉJÀ présente côté serveur n’est PAS dupliquée (dédup insensible à la casse ; le serveur gagne)', () => {
    expect(fusionnerOptions([o('URBA@m.fr', 'ecrit')], [o('urba@m.fr', 'ajout')]))
      .toEqual([{ adresse: 'URBA@m.fr', provenance: 'ecrit' }]); // 1re occurrence (serveur) conservée
  });

  it('liste serveur vide + ajout manuel → seule l’adresse ajoutée (le sélecteur reste utilisable sans adresse connue)', () => {
    expect(fusionnerOptions([], [o('seule@m.fr', 'ajout')])).toEqual([{ adresse: 'seule@m.fr', provenance: 'ajout' }]);
  });

  it('les entrées vides sont ignorées', () => {
    expect(fusionnerOptions([o('  ', 'ecrit')], [])).toEqual([]);
  });
});

describe('LABEL_PROVENANCE — un libellé pour CHAQUE provenance (aucun affichage vide)', () => {
  it('les 5 provenances ont un libellé non vide', () => {
    const toutes: ProvenanceAdresse[] = ['repondant', 'ecrit', 'ajout', 'confirme', 'prada'];
    for (const p of toutes) expect(LABEL_PROVENANCE[p].length).toBeGreaterThan(0);
  });
});
