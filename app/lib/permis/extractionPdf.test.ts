import { describe, it, expect } from 'vitest';
import { extrairePagesPdf } from './extractionPdf';
import { genererFichePermisPdf, type SourceFichePermis } from '../pdf/fichePermisPdf';

/**
 * N4 — brique UNIQUE d'extraction. On vérifie : le rejet DISTINGUABLE d'un type non extractible, et l'extraction RÉELLE d'un
 * PDF (généré par notre propre moteur) — page par page, texte présent. Jamais un silence.
 */
describe('N4 — extrairePagesPdf', () => {
  it('type non PDF → { ok:false } avec un motif explicite (jamais une exception)', async () => {
    const r = await extrairePagesPdf(Buffer.from('\x89PNG'), 'image/png');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('type non extractible');
  });

  it('typeMime nul → { ok:false } (type inconnu)', async () => {
    const r = await extrairePagesPdf(Buffer.from('x'), null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('inconnu');
  });

  it('PDF réel (fiche générée) → { ok:true }, une page, texte extrait', async () => {
    const source: SourceFichePermis = {
      numDau: '0930012500081', type: 'PC', reference: 'SVAV-DEM-2026-000042',
      communeNom: 'Aubervilliers', codeInsee: '93001', adresse: '12 rue des Fleurs',
      categorie: 'Immeuble neuf', natureTravaux: 'Construction neuve', dateAutorisation: '2026-05-01',
      surface: '2000', logements: 20, satisfaitLe: '2026-07-20', satisfaitPar: 'automatique',
      pieces: ['arrete-PC.pdf'],
    };
    const pdf = await genererFichePermisPdf({ ...source, emisLe: new Date('2026-08-14T09:00:00Z') });
    const r = await extrairePagesPdf(pdf, 'application/pdf');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pages.length).toBe(1);
      const texte = r.pages.join(' ');
      expect(texte).toContain('0930012500081'); // le numéro de permis est bien dans la couche texte
    }
  });
});
