import { describe, expect, it } from 'vitest';
import { doitRelire, messageMiseAJour, misesAJourDesAutres, peutBattre } from './rafraichir';
import { empreinteDe, type VenteMonEspace } from './mesAffaires';

/** 🔴 MON ESPACE, LOT 7 — les règles du rafraîchissement automatique (PUR). Données fictives : moi = compte 5, Marc = compte 7. */
const v = (id: number, version: number, auteurId: number | null, prenom: string | null = 'Marc'): VenteMonEspace => ({ id, version, libelle: `AFFAIRE ${id}`,
  derniereModification: { auteurId, prenom, libelle: 'marc@x.fr' } } as unknown as VenteMonEspace);

describe('🔴 le rafraîchissement de « Mon espace »', () => {
  it('l’empreinte change dès qu’une affaire visible change de version, apparaît ou disparaît ; la première mesure ne relit rien', () => {
    const a = empreinteDe([{ id: 2, version: 10 }, { id: 1, version: 7 }]);
    expect(a).toBe(empreinteDe([{ id: 1, version: 7 }, { id: 2, version: 10 }]));
    expect(a).not.toBe(empreinteDe([{ id: 1, version: 7 }, { id: 2, version: 11 }]));
    expect(a).not.toBe(empreinteDe([{ id: 1, version: 7 }]));
    expect([doitRelire(null, a), doitRelire(a, a), doitRelire(a, `${a}x`)]).toEqual([false, false, true]);
  });
  it('les changements d’un AUTRE se disent (les miens, non) ; une affaire apparue compte', () => {
    const avant = [v(1, 7, 7), v(2, 10, 5)];
    const apres = [v(1, 12, 7), v(2, 13, 5), v(3, 14, 7, null)];
    expect(misesAJourDesAutres(avant, apres, 5)).toEqual([{ id: 1, libelle: 'AFFAIRE 1', qui: 'Marc' }, { id: 3, libelle: 'AFFAIRE 3', qui: 'marc@x.fr' }]);
    expect(messageMiseAJour(misesAJourDesAutres(avant, apres, 5))).toBe('Marc a mis à jour « AFFAIRE 1 » et 1 autre affaire');
    expect(messageMiseAJour([])).toBeNull();
  });
  it('jamais pendant un geste, ni onglet caché (la règle de la Gestion, reprise telle quelle)', () => {
    expect(peutBattre({ visible: true, chargementEnCours: false, gesteEnCours: true, releveEnCours: false })).toBe(false);
    expect(peutBattre({ visible: false, chargementEnCours: false, gesteEnCours: false, releveEnCours: false })).toBe(false);
    expect(peutBattre({ visible: true, chargementEnCours: false, gesteEnCours: false, releveEnCours: false })).toBe(true);
  });
});
