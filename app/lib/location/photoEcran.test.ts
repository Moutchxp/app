import { describe, expect, it, vi } from 'vitest';
import { convertirPhoto, dimensionsReduites, type DepsPhoto } from './photoEcran';

/** 🔴 Arno (13/11/2026, lot B) — la photo sur l'iPhone, avant l'envoi : HEIC → JPEG, réduite, redessinée (aucune métadonnée recopiée). */
const fichier = (nom: string, type: string, taille = 3_000_000) => ({ name: nom, type, size: taille }) as unknown as File;
const deps = (o: { echec?: boolean; tailles?: number[] } = {}): DepsPhoto & { encoder: ReturnType<typeof vi.fn> } => {
  const tailles = [...(o.tailles ?? [400_000])];
  return {
    decoder: vi.fn(async () => { if (o.echec) throw new Error('illisible'); return { largeur: 4032, hauteur: 3024, source: {} as CanvasImageSource }; }),
    encoder: vi.fn(async () => ({ size: tailles.shift() ?? 300_000, type: 'image/jpeg' }) as Blob),
  };
};

describe('convertirPhoto', () => {
  it('🔴 un HEIC de l’iPhone : décodé par le navigateur, redessiné en JPEG 1 600 × 1 200, renommé .jpg', async () => {
    const d = deps();
    const r = await convertirPhoto(fichier('IMG_4821.HEIC', 'image/heic'), d);
    expect(r).toMatchObject({ ok: true, nom: 'IMG_4821.jpg', largeur: 1600, hauteur: 1200 });
    expect(d.encoder).toHaveBeenCalledWith(expect.anything(), 1600, 1200, 0.82);
  });
  it('un HEIC sans type annoncé (seulement l’extension) est aussi reconnu', async () => {
    expect(await convertirPhoto(fichier('IMG_1.heic', ''), deps())).toMatchObject({ ok: true, nom: 'IMG_1.jpg' });
  });
  it('trop lourde après la 1re passe : qualité abaissée jusqu’à ~500 Ko', async () => {
    const d = deps({ tailles: [900_000, 700_000, 480_000] });
    expect(await convertirPhoto(fichier('a.jpg', 'image/jpeg'), d)).toMatchObject({ ok: true });
    expect(d.encoder.mock.calls.map((c) => c[3])).toEqual([0.82, 0.72, 0.62]);
  });
  it('refusés, motif clair : pas une image ; trop lourde ; HEIC que ce navigateur ne sait pas lire', async () => {
    expect(await convertirPhoto(fichier('devis.pdf', 'application/pdf'), deps())).toEqual({ ok: false, motif: '« devis.pdf » n’est pas une photo.' });
    expect(await convertirPhoto(fichier('a.jpg', 'image/jpeg', 40 * 1024 * 1024), deps())).toMatchObject({ ok: false, motif: expect.stringContaining('trop lourde') });
    expect(await convertirPhoto(fichier('IMG.HEIC', 'image/heic'), deps({ echec: true }))).toMatchObject({ ok: false, motif: expect.stringContaining('HEIC illisible') });
  });
  it('dimensionsReduites : jamais agrandie ; portrait', () => {
    expect(dimensionsReduites(800, 600)).toEqual({ largeur: 800, hauteur: 600 });
    expect(dimensionsReduites(3024, 4032)).toEqual({ largeur: 1200, hauteur: 1600 });
  });
});
