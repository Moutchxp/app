import { describe, it, expect } from 'vitest';
import { genererVisuelPng, urlVisuel, partsDescriptif, type DonneesVisuel } from './genererVisuelPng';

function donnees(over: Partial<DonneesVisuel> = {}): DonneesVisuel {
  return {
    verdict: 'SANS_VIS_A_VIS',
    score: 82,
    reference: 'SVAV-K7M2-9QX4',
    urlBase: 'https://www.sansvisavis.com',
    descriptif: {
      ville: 'Asnières-sur-Seine',
      typeBien: 'Appartement',
      surfaceM2: 72.35,
      pieces: 3,
      anneeOuEpoque: '2008',
      etage: 5,
      dernierEtage: false,
      exterieur: 'Balcon',
    },
    ...over,
  };
}

describe('urlVisuel — URL du QR (référence, jamais numéro/jeton)', () => {
  it('encode ref + doc=visuel, sans numéro ni jeton', () => {
    const u = urlVisuel('https://www.sansvisavis.com/', 'SVAV-K7M2-9QX4');
    expect(u).toBe('https://www.sansvisavis.com/verifier?ref=SVAV-K7M2-9QX4&doc=visuel');
    expect(u).not.toMatch(/SAVV-|[?&]n=|[?&]j=/); // ni numéro (SAVV) ni param jeton
  });
});

describe('genererVisuelPng', () => {
  it('sortie = PNG valide (magic 89504e47)', async () => {
    const buf = await genererVisuelPng(donnees());
    expect(buf.subarray(0, 4).toString('hex')).toBe('89504e47');
    expect(buf.length).toBeGreaterThan(2000);
  });

  it('DÉTERMINISME : deux générations aux mêmes entrées → octets identiques', async () => {
    const a = await genererVisuelPng(donnees());
    const b = await genererVisuelPng(donnees());
    expect(a.equals(b)).toBe(true);
  });

  it('le score influence le rendu (octets différents)', async () => {
    const a = await genererVisuelPng(donnees({ score: 82 }));
    const b = await genererVisuelPng(donnees({ score: 61 }));
    expect(a.equals(b)).toBe(false);
  });

  it('ville=null et extérieur=null → PNG valide', async () => {
    const buf = await genererVisuelPng(donnees({ descriptif: { ...donnees().descriptif, ville: null, exterieur: null } }));
    expect(buf.subarray(0, 4).toString('hex')).toBe('89504e47');
    expect(buf.length).toBeGreaterThan(2000);
  });

  it('descriptif entièrement null → génère quand même un PNG valide (aucune ligne descriptif)', async () => {
    const buf = await genererVisuelPng(
      donnees({ descriptif: { ville: null, typeBien: null, surfaceM2: null, pieces: null, anneeOuEpoque: null, etage: null, dernierEtage: null, exterieur: null } }),
    );
    expect(buf.subarray(0, 4).toString('hex')).toBe('89504e47');
  });

  it('score=null → « — » (génération valide, pas de crash)', async () => {
    const buf = await genererVisuelPng(donnees({ score: null }));
    expect(buf.subarray(0, 4).toString('hex')).toBe('89504e47');
  });
});

describe('partsDescriptif — omission propre des null (jamais « null » visible)', () => {
  it('parts non nulles seulement, dans l’ordre attendu', () => {
    const parts = partsDescriptif({ ville: 'Asnières-sur-Seine', typeBien: 'Appartement', surfaceM2: 72.35, pieces: 3, anneeOuEpoque: '2008', etage: 5, dernierEtage: true, exterieur: 'Balcon' });
    expect(parts).toEqual(['Asnières-sur-Seine', 'Appartement', '72,35 m²', '3 pièces', '5ᵉ étage', 'Dernier étage', '2008', 'Balcon']);
  });
  it('ville/extérieur null omis ; jamais la chaîne "null"', () => {
    const parts = partsDescriptif({ ville: null, typeBien: 'Appartement', surfaceM2: null, pieces: 2, anneeOuEpoque: null, etage: 0, dernierEtage: false, exterieur: null });
    expect(parts).toEqual(['Appartement', '2 pièces', 'Rez-de-chaussée']); // dernierEtage=false omis, extérieur null omis
    expect(parts.join(' ')).not.toContain('null');
  });
  it('extérieur « Aucun » omis (choix marketing) ; dernier étage seulement si vrai', () => {
    expect(partsDescriptif({ ville: null, typeBien: null, surfaceM2: null, pieces: null, anneeOuEpoque: null, etage: null, dernierEtage: false, exterieur: 'Aucun' })).toEqual([]);
    expect(partsDescriptif({ ville: null, typeBien: null, surfaceM2: null, pieces: null, anneeOuEpoque: null, etage: null, dernierEtage: true, exterieur: 'Terrasse' })).toEqual(['Dernier étage', 'Terrasse']);
  });
  it('tout null → tableau vide', () => {
    expect(partsDescriptif({ ville: null, typeBien: null, surfaceM2: null, pieces: null, anneeOuEpoque: null, etage: null, dernierEtage: null, exterieur: null })).toEqual([]);
  });
});
