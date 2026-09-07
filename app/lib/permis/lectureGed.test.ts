import { describe, it, expect } from 'vitest';
import { lireGedPermis, type DepsLectureGed, type PieceGedMeta } from './lectureGed';
import type { ExtractionPdf } from './extractionPdf';

/**
 * N4 — `lireGedPermis` PUR par injection. On éprouve : le bilan chiffré EXACT (pièces, pages, pages avec/sans texte, pièces
 * muettes), les motifs RÉELS et DISTINGUABLES (type non extractible / PDF sans couche texte / échec de lecture), et le fait
 * qu'un échec d'UNE pièce n'interrompt pas les suivantes (jamais de catch muet, jamais une exception qui remonte).
 */
const meta = (over: Partial<PieceGedMeta> = {}): PieceGedMeta =>
  ({ id: 1, nomFichier: 'p.pdf', typeMime: 'application/pdf', cleStockage: 'k', tailleOctets: 100, ...over });

/**
 * Deps injectées, PILOTÉES PAR LA CLÉ : `lireObjet` renvoie un buffer = la clé elle-même (sauf clés de `absents` → jette) ;
 * `extraire` lit ce buffer (= la clé) pour choisir le résultat dans `extraction` (défaut : un PDF d'une page de texte).
 */
function deps(opts: { pieces: PieceGedMeta[]; extraction?: Record<string, ExtractionPdf>; absents?: string[] }): DepsLectureGed {
  return {
    listerPieces: async () => opts.pieces,
    lireObjet: async (cle) => {
      if (opts.absents?.includes(cle)) throw new Error(`objet introuvable ou vide : ${cle}`);
      return Buffer.from(cle);
    },
    extraire: async (contenu) => opts.extraction?.[contenu.toString()] ?? { ok: true, pages: ['du texte'] },
  };
}

describe('N4 — lireGedPermis : bilan chiffré exact', () => {
  it('un PDF de 3 pages dont 1 sans texte → 3 pages, 2 avec texte, 1 sans, 0 muette', async () => {
    const res = await lireGedPermis(42, deps({
      pieces: [meta({ id: 7, nomFichier: 'arrete.pdf', cleStockage: 'k7' })],
      extraction: { k7: { ok: true, pages: ['page un', '   ', 'page trois'] } },
    }));
    expect(res.dossierId).toBe(42);
    expect(res.bilan).toEqual({ nbPieces: 1, nbPages: 3, pagesAvecTexte: 2, pagesSansTexte: 1, piecesMuettes: 0 });
    expect(res.pieces[0].pages.map((p) => p.aTexte)).toEqual([true, false, true]);
    expect(res.pieces[0].motif).toBeNull();
  });

  it('PDF SANS couche texte (toutes pages vides) → pièce MUETTE, motif « sans couche texte »', async () => {
    const res = await lireGedPermis(1, deps({
      pieces: [meta({ nomFichier: 'scan.pdf', cleStockage: 'k' })],
      extraction: { k: { ok: true, pages: ['', '  '] } },
    }));
    expect(res.bilan.piecesMuettes).toBe(1);
    expect(res.bilan.pagesAvecTexte).toBe(0);
    expect(res.bilan.pagesSansTexte).toBe(2);
    expect(res.pieces[0].muette).toBe(true);
    expect(res.pieces[0].motif).toContain('sans couche texte');
  });

  it('type NON extractible (image) → muette, motif de la brique, 0 page (jamais un silence)', async () => {
    const res = await lireGedPermis(1, deps({
      pieces: [meta({ nomFichier: 'photo.png', typeMime: 'image/png', cleStockage: 'k' })],
      extraction: { k: { ok: false, motif: 'type non extractible (image/png)' } },
    }));
    expect(res.pieces[0].muette).toBe(true);
    expect(res.pieces[0].nbPages).toBe(0);
    expect(res.pieces[0].motif).toBe('type non extractible (image/png)');
  });

  it('ÉCHEC de lecture de l’objet (S3) → motif distinguable, la pièce suivante est QUAND MÊME lue', async () => {
    const res = await lireGedPermis(1, deps({
      pieces: [
        meta({ id: 1, nomFichier: 'manquant.pdf', cleStockage: 'absent' }),
        meta({ id: 2, nomFichier: 'ok.pdf', cleStockage: 'present' }),
      ],
      absents: ['absent'],
      extraction: { present: { ok: true, pages: ['contenu'] } },
    }));
    expect(res.bilan.nbPieces).toBe(2);
    expect(res.pieces[0].muette).toBe(true);
    expect(res.pieces[0].motif).toContain('échec de lecture de l’objet');
    expect(res.pieces[0].motif).toContain('introuvable');
    expect(res.pieces[1].muette).toBe(false); // pièce suivante non interrompue
    expect(res.pieces[1].pages[0].texte).toBe('contenu');
  });

  it('une extraction qui JETTE est capturée (motif d’échec), jamais propagée', async () => {
    const res = await lireGedPermis(1, {
      listerPieces: async () => [meta({ cleStockage: 'k' })],
      lireObjet: async () => Buffer.from('%PDF'),
      extraire: async () => { throw new Error('pdfjs boom'); },
    });
    expect(res.pieces[0].muette).toBe(true);
    expect(res.pieces[0].motif).toContain('échec d’extraction');
    expect(res.pieces[0].motif).toContain('pdfjs boom');
  });

  it('GED vide → bilan tout à zéro (jamais une exception)', async () => {
    const res = await lireGedPermis(1, deps({ pieces: [] }));
    expect(res.bilan).toEqual({ nbPieces: 0, nbPages: 0, pagesAvecTexte: 0, pagesSansTexte: 0, piecesMuettes: 0 });
    expect(res.pieces).toEqual([]);
  });

  it('bilan AGRÉGÉ sur pièces hétérogènes (PDF riche + scan muet + image non extractible)', async () => {
    const res = await lireGedPermis(1, deps({
      pieces: [
        meta({ id: 1, nomFichier: 'r.pdf', cleStockage: 'riche' }),
        meta({ id: 2, nomFichier: 's.pdf', cleStockage: 'scan' }),
        meta({ id: 3, nomFichier: 'i.jpg', typeMime: 'image/jpeg', cleStockage: 'img' }),
      ],
      extraction: {
        riche: { ok: true, pages: ['a', 'b'] },
        scan: { ok: true, pages: ['', ''] },
        img: { ok: false, motif: 'type non extractible (image/jpeg)' },
      },
    }));
    expect(res.bilan).toEqual({ nbPieces: 3, nbPages: 4, pagesAvecTexte: 2, pagesSansTexte: 2, piecesMuettes: 2 });
  });
});

describe('P2 (Lever 2) — lecture à concurrence bornée : ordre préservé + concurrence plafonnée + échec isolé', () => {
  it('🔴 ORDRE du résultat = ordre des pièces, même si les téléchargements finissent dans le DÉSORDRE', async () => {
    const d: DepsLectureGed = {
      listerPieces: async () => [meta({ id: 1, cleStockage: 'k1' }), meta({ id: 2, cleStockage: 'k2' }), meta({ id: 3, cleStockage: 'k3' })],
      lireObjet: async (cle) => { await new Promise((r) => setTimeout(r, cle === 'k1' ? 15 : cle === 'k2' ? 1 : 8)); return Buffer.from(cle); }, // 1 lent, 2 rapide, 3 moyen
      extraire: async () => ({ ok: true, pages: ['x'] }),
    };
    const res = await lireGedPermis(1, d);
    expect(res.pieces.map((p) => p.id)).toEqual([1, 2, 3]); // ordre des pièces, PAS l'ordre d'arrivée [2, 3, 1]
  });

  it('🔴 concurrence BORNÉE : jamais plus de 6 téléchargements simultanés (et > 1 : la parallélisation est effective)', async () => {
    let actifs = 0, maxActifs = 0;
    const pieces = Array.from({ length: 20 }, (_, i) => meta({ id: i, cleStockage: `k${i}` }));
    const d: DepsLectureGed = {
      listerPieces: async () => pieces,
      lireObjet: async (cle) => { actifs += 1; maxActifs = Math.max(maxActifs, actifs); await new Promise((r) => setTimeout(r, 2)); actifs -= 1; return Buffer.from(cle); },
      extraire: async () => ({ ok: true, pages: ['x'] }),
    };
    await lireGedPermis(1, d);
    expect(maxActifs).toBeLessThanOrEqual(6);
    expect(maxActifs).toBeGreaterThan(1);
  });

  it('un échec de téléchargement d’UNE pièce n’interrompt pas les autres (résultat à SA position)', async () => {
    const d = deps({ pieces: [meta({ id: 1, cleStockage: 'k1' }), meta({ id: 2, cleStockage: 'k2' }), meta({ id: 3, cleStockage: 'k3' })], absents: ['k2'] });
    const res = await lireGedPermis(1, d);
    expect(res.pieces.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(res.pieces[1]).toMatchObject({ muette: true });      // la pièce 2 échouée est muette, à sa position
    expect(res.pieces[1].motif).toMatch(/échec de lecture/);
    expect(res.pieces[0].muette).toBe(false); expect(res.pieces[2].muette).toBe(false);
  });
});
