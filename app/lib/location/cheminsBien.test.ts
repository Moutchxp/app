import { describe, expect, it } from 'vitest';
import { champsRemplisDuChemin, messageEffacement, restreindreAuChemin, viderHorsChemin } from './cheminsBien';

/** 🔴 Arno (25/10/2026) — les choix en cascade remis à zéro : la règle pure. */
describe('🔴 les champs propres à chaque chemin', () => {
  it('ce qui était rempli sur le chemin quitté (le message en dépend)', () => {
    expect(champsRemplisDuChemin('local', { typeLocal: 'commercial', nombrePieces: '' })).toEqual(['typeLocal']);
    expect(champsRemplisDuChemin('logement', { typeLogement: null, nombrePieces: ' ' })).toEqual([]);
    expect(messageEffacement('local')).toBe('Les informations propres à « Local » ont été effacées.');
  });
  it('l’envoi ne garde que le chemin choisi ; les champs communs restent', () => {
    const tout = { adresse: '3 rue du Port', dpeClasse: 'C', typeLogement: 'T2', typeLocal: 'commercial', meuble: true, parkingType: 'box', nombrePieces: '2', surfaceM2: '12' };
    expect(restreindreAuChemin(tout, 'parking')).toEqual({ adresse: '3 rue du Port', dpeClasse: 'C', parkingType: 'box', surfaceM2: '12' });
    expect(restreindreAuChemin(tout, 'local')).toEqual({ adresse: '3 rue du Port', dpeClasse: 'C', typeLocal: 'commercial', nombrePieces: '2' });
    expect(viderHorsChemin(tout, 'logement')).toEqual({ ...tout, typeLocal: '', parkingType: '', surfaceM2: '' });
  });
});
