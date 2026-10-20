import { describe, expect, it } from 'vitest';
import { lignesResume } from './resumeBienLignes';

/** 🔴 Arno (20/10/2026) — une ligne par information : la Location d'abord, l'import WIPPIMMO à défaut, jamais les deux. */
const VIDE = { famille: null, familleCle: null, type: null, meuble: null, nombrePieces: null, surfaceHabitableM2: null, surfaceCarrezM2: null,
  surfaceExterieureM2: null, surfaceM2: null };

describe('lignesResume', () => {
  it('lot 176 : « Appartement meublé · Type 2 » sans Location → Logement · Appartement, meublé oui, 2 pièces', () => {
    const r = lignesResume({ nature: 'Appartement meublé', typeBien: 'Type 2' }, VIDE);
    expect([r.famille, r.type, r.meuble, r.pieces]).toEqual(['logement', 'Logement · Appartement', true, 2]);
    expect(lignesResume({ nature: 'Appartement meublé', typeBien: 'Type 2' }, undefined).type).toBe('Logement · Appartement');
  });
  it('la Location l’emporte : jamais deux valeurs contradictoires', () => {
    const r = lignesResume({ nature: 'Appartement meublé', typeBien: 'Type 2' },
      { ...VIDE, famille: 'Logement', familleCle: 'logement', type: 'Studio', meuble: false, nombrePieces: 1 });
    expect([r.type, r.meuble, r.pieces]).toEqual(['Logement · Studio', false, 1]);
  });
  it('rien d’autre n’est deviné : une nature sans « meublé » laisse meublé « non renseigné »', () => {
    expect(lignesResume({ nature: 'Appartement', typeBien: 'Type 3' }, VIDE).meuble).toBeNull();
  });
  it('parking (déduit de l’import) : ni meublé ni pièces ; une surface ; pas d’époque ni de chauffage', () => {
    const r = lignesResume({ nature: 'Parking', typeBien: 'Box' }, VIDE);
    expect([r.famille, 'meuble' in r, 'pieces' in r, r.surfaces.map((s) => s.cle), r.avecComplements]).toEqual(['parking', false, false, ['surface-parking'], false]);
  });
  it('logement / local : trois surfaces, aucune propre au parking', () => {
    expect(lignesResume({ nature: null, typeBien: null }, { ...VIDE, familleCle: 'local', famille: 'Local', type: 'Bureaux' }).surfaces.map((s) => s.mot))
      .toEqual(['Surface', 'Surface Carrez/Boutin', 'Surface extérieure']);
  });
});
