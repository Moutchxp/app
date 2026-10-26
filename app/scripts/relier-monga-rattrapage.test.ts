import { describe, it, expect } from 'vitest';
import { JOUR_DU_RATTRAPAGE, texteRapportRattrapage } from './relier-monga-rattrapage';
import type { PasseRattrapageLiens } from '../lib/gestion/mongaRattrapageLiensRepo';

/** LOT MONGA-LIEN-PAR-LE-GESTE — le rapport du rattrapage dit, par lien, GES-…, référence, étapes et auteur. */
const passe = (p: Partial<PasseRattrapageLiens>): PasseRattrapageLiens => ({
  appliquer: false, disponible: true, poses: [], ambigues: [],
  liens: [{
    reference: 'MNG-25126', evenementId: 37, evenementReference: 'GES-2026-000011', objet: 'Problème de chauffage',
    auteurId: 4, auteurLibelle: 'a.dasilva', affecteLe: '2026-10-23 16:55:00', etapes: 6,
  }],
  ...p,
});

describe('le rapport du rattrapage', () => {
  it('à blanc : annonce l’absence d’écriture et liste GES-…, référence, étapes, auteur', () => {
    const t = texteRapportRattrapage(passe({}), { base: 'svav' });
    expect(t).toContain('À BLANC (aucune écriture)');
    expect(t).toContain('GES-2026-000011');
    expect(t).toContain('MNG-25126');
    expect(t).toContain('étapes qui apparaîtront sur la frise : 6');
    expect(t).toContain('a.dasilva');
    expect(t).toContain('SERAIT posé');
    expect(t).toContain(`rattrapage du ${JOUR_DU_RATTRAPAGE}`);
  });

  it('appliqué : dit ce qui a été posé, et combien de mails ont suivi', () => {
    const t = texteRapportRattrapage(passe({ appliquer: true, poses: [{ reference: 'MNG-25126', issue: 'cree', mailsClasses: 5 }] }), { base: 'svav' });
    expect(t).toContain('APPLIQUÉ');
    expect(t).toContain('lien POSÉ · 5 mail(s) classé(s)');
  });

  it('les références ambiguës sont listées à part, sans lien', () => {
    const t = texteRapportRattrapage(passe({ liens: [], ambigues: [{ reference: 'MNG-25300', evenements: [
      { evenementId: 40, evenementReference: 'GES-2026-000020', auteurLibelle: 'x.un' },
      { evenementId: 41, evenementReference: 'GES-2026-000021', auteurLibelle: 'y.deux' },
    ] }] }), { base: 'svav' });
    expect(t).toContain('MNG-25300');
    expect(t).toContain('RIEN N\'EST POSÉ');
    expect(t).toContain('GES-2026-000021');
  });

  it('sans la migration 311 : le dit, et rien d’autre', () => {
    expect(texteRapportRattrapage(passe({ disponible: false }), { base: 'svav' })).toContain('311');
  });
});
