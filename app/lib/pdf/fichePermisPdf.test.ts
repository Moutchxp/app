import { describe, it, expect } from 'vitest';
import { composerFichePermis, genererFichePermisPdf, NOM_FICHIER_FICHE_SYNTHESE, type SourceFichePermis } from './fichePermisPdf';

/**
 * N1-B — fiche de synthèse (1 page A4). On teste séparément la COMPOSITION pure (libellés, « non renseigné », bornage des
 * pièces) et le RENDU PDF (1 seule page, en-tête/pied valides, déterminisme, aucun « undefined » en clair). Calqué sur
 * `certificatPdf.test.ts` (helper nbPages, %PDF-/%%EOF, a.equals(b)).
 */
function nbPages(buf: Buffer): number {
  return (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}
const source = (over: Partial<SourceFichePermis> = {}): SourceFichePermis => ({
  numDau: '0930012500081', type: 'PC', reference: 'SVAV-DEM-2026-000042',
  communeNom: 'Aubervilliers', codeInsee: '93001', adresse: '12 rue des Fleurs',
  categorie: 'Immeuble neuf', natureTravaux: 'Construction neuve', dateAutorisation: '2026-05-01',
  surface: '2000', logements: 20, satisfaitLe: '2026-07-20', satisfaitPar: 'automatique',
  pieces: ['arrete-PC.pdf', 'plan-masse.pdf'], ...over,
});
const EMIS = new Date('2026-08-14T09:00:00Z');

describe('N1-B — composerFichePermis (PUR) : « non renseigné » partout où une valeur manque', () => {
  it('champs complets → libellés attendus, commune + INSEE, m² sur la surface', () => {
    const f = composerFichePermis(source());
    const map = new Map(f.champs);
    expect(map.get('Numéro de permis')).toBe('0930012500081');
    expect(map.get('Commune')).toBe('Aubervilliers (INSEE 93001)');
    expect(map.get('Surface créée')).toBe('2000 m²');
    expect(map.get('Nature des travaux')).toBe('Construction neuve');
    expect(map.get('Date d’acceptation')).toBe('01/05/2026'); // 'YYYY-MM-DD' → 'JJ/MM/AAAA'
    expect(map.get('Origine')).toBe('automatique');
  });

  it('valeurs absentes → « non renseigné » (jamais une case vide ni un zéro trompeur)', () => {
    const f = composerFichePermis(source({ adresse: null, dateAutorisation: null, surface: null, logements: null, satisfaitLe: null, satisfaitPar: null, natureTravaux: null, communeNom: null }));
    const map = new Map(f.champs);
    expect(map.get('Adresse')).toBe('non renseigné');
    expect(map.get('Date d’acceptation')).toBe('non renseigné');
    expect(map.get('Surface créée')).toBe('non renseigné');
    expect(map.get('Logements créés')).toBe('non renseigné'); // pas « 0 »
    expect(map.get('Date de satisfaction')).toBe('non renseigné');
    expect(map.get('Origine')).toBe('non renseigné');
    expect(map.get('Nature des travaux')).toBe('non renseigné');
    expect(map.get('Commune')).toBe('INSEE 93001'); // code INSEE seul si le nom manque
  });

  it('0 logement RÉEL est affiché « 0 » (distinct de « non renseigné » = null)', () => {
    expect(new Map(composerFichePermis(source({ logements: 0 })).champs).get('Logements créés')).toBe('0');
  });

  it('aucune pièce → « aucune pièce en GED » (jamais un vide muet)', () => {
    expect(composerFichePermis(source({ pieces: [] })).pieces).toEqual(['aucune pièce en GED']);
  });

  it('liste de pièces bornée : au-delà du maximum, une ligne « + N autre(s) » (jamais un silence, jamais un débordement de page)', () => {
    const beaucoup = Array.from({ length: 30 }, (_, i) => `piece-${i + 1}.pdf`);
    const p = composerFichePermis(source({ pieces: beaucoup })).pieces;
    expect(p.length).toBeLessThan(30);
    expect(p[p.length - 1]).toMatch(/\+ \d+ autre/);
  });
});

describe('N1-B — genererFichePermisPdf : PDF valide, 1 SEULE page, déterministe', () => {
  it('en-tête/pied PDF, une seule page même avec beaucoup de pièces, pas d’« undefined » en clair', async () => {
    const buf = await genererFichePermisPdf({ ...source({ pieces: Array.from({ length: 40 }, (_, i) => `piece-${i}.pdf`) }), emisLe: EMIS });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.subarray(-6).toString()).toContain('%%EOF');
    expect(nbPages(buf)).toBe(1);                       // borne « 1 page » tenue même sur données volumineuses
    expect(buf.length).toBeGreaterThan(3000);
    expect(buf.toString('latin1')).not.toContain('undefined');
    expect(buf.toString('latin1')).not.toContain('null');
  });

  it('déterministe : mêmes données + même date → octets identiques ; une date différente → octets différents', async () => {
    const a = await genererFichePermisPdf({ ...source(), emisLe: EMIS });
    const b = await genererFichePermisPdf({ ...source(), emisLe: EMIS });
    expect(a.equals(b)).toBe(true);
    const c = await genererFichePermisPdf({ ...source(), emisLe: new Date('2026-08-15T09:00:00Z') });
    expect(a.equals(c)).toBe(false);
  });

  it('nom de fichier canonique exporté', () => {
    expect(NOM_FICHIER_FICHE_SYNTHESE).toBe('Fiche de synthèse du permis.pdf');
  });
});
