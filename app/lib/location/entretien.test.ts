import { describe, expect, it } from 'vitest';
import { verifierEntretiens, libelleEntretien } from './entretien';
import { resumeAnnexe, annotationPropre } from './annexeLocation';

describe('🔴 entretien à prévoir : Non vide tout ; chaudière, ramonage, autres nommés avec dates facultatives', () => {
  it('Non (ou non répondu) ⇒ aucune ligne, même si des lignes sont envoyées', () => {
    expect(verifierEntretiens('non', [{ sorte: 'chaudiere' }])).toEqual({ ok: true, aPrevoir: false, entretiens: [] });
    expect(verifierEntretiens(null, [{ sorte: 'chaudiere' }])).toEqual({ ok: true, aPrevoir: null, entretiens: [] });
  });
  it('Oui ⇒ chaudière (date), ramonage (sans date), deux autres ; une seule chaudière', () => {
    const v = verifierEntretiens(true, [{ sorte: 'chaudiere', dateAnniversaire: '2026-10-01' }, { sorte: 'ramonage' }, { sorte: 'chaudiere' },
      { sorte: 'autre', nom: 'Climatisation', dateAnniversaire: '2027-05-02' }, { sorte: 'autre', nom: ' VMC ' }]);
    expect(v).toEqual({ ok: true, aPrevoir: true, entretiens: [
      { sorte: 'chaudiere', nom: null, dateAnniversaire: '2026-10-01' }, { sorte: 'ramonage', nom: null, dateAnniversaire: null },
      { sorte: 'autre', nom: 'Climatisation', dateAnniversaire: '2027-05-02' }, { sorte: 'autre', nom: 'VMC', dateAnniversaire: null }] });
    expect(libelleEntretien({ sorte: 'ramonage', nom: null })).toBe('Ramonage');
  });
  it('un autre sans nom, une date invalide : refusés', () => {
    expect(verifierEntretiens('oui', [{ sorte: 'autre', nom: '' }]).ok).toBe(false);
    expect(verifierEntretiens('oui', [{ sorte: 'ramonage', dateAnniversaire: '2026-02-30' }]).ok).toBe(false);
  });
});

describe('🔴 annexe repliée : la ligne résumée ; annotation', () => {
  it('type · intérieur/extérieur · place/box · lot · porte/place', () => {
    expect(resumeAnnexe({ categorie: 'parking', parkingSituation: 'interieur', parkingType: 'box_simple', numLotCopro: '12', porte: '4' }))
      .toBe('Parking · Intérieur · Box simple · lot 12 · place 4');
    expect(resumeAnnexe({ categorie: 'cave', porte: '7' })).toBe('Cave · porte 7');
    expect(resumeAnnexe({ categorie: 'autre', nomAnnexe: 'Cellier' })).toBe('Cellier');
  });
  it('annotation : vide ⇒ null, sinon le texte', () => {
    expect(annotationPropre('  ')).toBeNull();
    expect(annotationPropre(' ligne 1\nligne 2 ')).toBe('ligne 1\nligne 2');
  });
});
