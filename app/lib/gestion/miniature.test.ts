import { describe, it, expect } from 'vitest';
import { genererMiniature, ENTREE_MAX_OCTETS, MINIATURE_COTE, TYPE_MINIATURE } from './miniature';

/**
 * LOT 5-PJ-A — LA FABRIQUE DE VIGNETTES, ÉPROUVÉE SUR SES REFUS.
 *
 * Les cas de SUCCÈS (un vrai PDF, un vrai JPEG) sont mesurés à la main hors suite : ils chargent `sharp` et un
 * rasteriseur WebAssembly, et feraient de chaque `npm test` une affaire de dizaines de secondes pour éprouver du code
 * de bibliothèque plutôt que le nôtre. Ce qui est à NOUS, et qui doit être tenu par un test, c'est la liste de ce
 * qu'on REFUSE D'OUVRIR — et elle est ici.
 */
describe('ce qu’on n’ouvre JAMAIS', () => {
  /**
   * 🔴 LE CAS QUI JUSTIFIE CE FICHIER. Un SVG est un document qui peut porter du script et aller chercher des
   * ressources distantes. Le rendre reviendrait à exécuter chez nous ce qu'un inconnu nous a envoyé par mail. Le
   * refus intervient AVANT toute lecture des octets : rien n'est décodé, rien n'est interprété.
   */
  it('un SVG piégé est refusé sans être ouvert', async () => {
    const piege = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("//dehors")</script></svg>');
    expect(await genererMiniature(piege, 'image/svg+xml', 'piege.svg')).toEqual({ ok: false, motif: 'type sans miniature' });
  });

  it('un HTML est refusé sans être ouvert', async () => {
    const piege = Buffer.from('<html><script>alert(1)</script></html>');
    expect(await genererMiniature(piege, 'text/html', 'piege.html')).toEqual({ ok: false, motif: 'type sans miniature' });
  });

  it('un relevé SEPA (XML) n’a pas de vignette — il aura son étiquette de type', async () => {
    expect(await genererMiniature(Buffer.from('<?xml version="1.0"?><Document/>'), 'application/xml', 'camt053.xml'))
      .toEqual({ ok: false, motif: 'type sans miniature' });
  });

  it('une pièce vide est refusée', async () => {
    expect(await genererMiniature(Buffer.alloc(0), 'image/png', 'vide.png')).toEqual({ ok: false, motif: 'pièce vide' });
  });

  /** Une borne d'ENTRÉE, avant toute allocation : on ne décode pas 80 Mo pour en tirer une vignette de 300 pixels. */
  it('une pièce au-delà de la borne d’entrée est refusée AVANT tout décodage', async () => {
    const enorme = Buffer.alloc(ENTREE_MAX_OCTETS + 1);
    const r = await genererMiniature(enorme, 'image/jpeg', 'enorme.jpg');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('trop volumineuse');
  });

  /** Du vrai courrier contient des fichiers mal formés : ils doivent rendre un MOTIF, jamais faire tomber la route. */
  it('une image illisible rend un motif, elle ne jette pas', async () => {
    const r = await genererMiniature(Buffer.from('ceci n’est pas une image'), 'image/jpeg', 'casse.jpg');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif.length).toBeGreaterThan(0);
  });

  it('un PDF illisible rend un motif, il ne jette pas', async () => {
    const r = await genererMiniature(Buffer.from('%PDF-1.4 et puis plus rien'), 'application/pdf', 'casse.pdf');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif.length).toBeGreaterThan(0);
  });
});

describe('les bornes, écrites une seule fois', () => {
  it('la vignette est du JPEG', () => {
    expect(TYPE_MINIATURE).toBe('image/jpeg');
  });
  it('le côté de la vignette reste modeste', () => {
    expect(MINIATURE_COTE).toBeLessThanOrEqual(512);
  });
});
