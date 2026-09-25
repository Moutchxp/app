import { describe, it, expect } from 'vitest';
import { crc32, dateDos, fluxZip, tailleArchive, type SourceZip } from './zip';

/** Lit tout le flux et rend un seul tableau d'octets. */
async function collecter(flux: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const morceaux: Uint8Array[] = [];
  const lecteur = flux.getReader();
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    if (value) morceaux.push(value);
  }
  const total = morceaux.reduce((t, m) => t + m.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const m of morceaux) { out.set(m, o); o += m.length; }
  return out;
}

const source = (nom: string, texte: string): SourceZip => ({
  nom, lire: async () => new TextEncoder().encode(texte),
});

const lire32 = (b: Uint8Array, o: number): number => new DataView(b.buffer, b.byteOffset).getUint32(o, true);
const lire16 = (b: Uint8Array, o: number): number => new DataView(b.buffer, b.byteOffset).getUint16(o, true);

describe('CRC-32', () => {
  /** Valeur de référence universelle du CRC-32 : un CRC faux fait REFUSER l'archive, sans rien dire de plus. */
  it('« 123456789 » vaut 0xCBF43926', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf4_3926);
  });
  it('un contenu vide vaut 0', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('la date MS-DOS', () => {
  it('est bornée à 1980, l’origine du format', () => {
    // Une année antérieure produirait un champ négatif, que certains extracteurs refusent.
    expect(dateDos(new Date('1970-01-01T00:00:00Z')).date >> 9).toBe(0);
  });
});

describe('l’archive écrite', () => {
  it('commence par la signature ZIP et finit par celle de l’annuaire', async () => {
    const z = await collecter(fluxZip([source('a.txt', 'bonjour')]));
    expect(lire32(z, 0)).toBe(0x0403_4b50);                 // en-tête local
    expect(lire32(z, z.length - 22)).toBe(0x0605_4b50);     // fin d'annuaire central
  });

  it('annonce le BON nombre d’entrées', async () => {
    const z = await collecter(fluxZip([source('a.txt', 'aa'), source('b.txt', 'bbb')]));
    expect(lire16(z, z.length - 22 + 8)).toBe(2);
  });

  /** Sans le bit 11, « Reçu de loyer.pdf » ressort en charabia à l'extraction sous Windows. */
  it('déclare les noms en UTF-8 (bit 11 des drapeaux)', async () => {
    const z = await collecter(fluxZip([source('Reçu de loyer.txt', 'x')]));
    expect(lire16(z, 6) & 0x0800).toBe(0x0800);
  });

  it('ne compresse pas (méthode 0 = « store »)', async () => {
    const z = await collecter(fluxZip([source('a.txt', 'bonjour')]));
    expect(lire16(z, 8)).toBe(0);
    expect(lire32(z, 18)).toBe(lire32(z, 22)); // taille compressée = taille brute
  });

  it('écrit le contenu tel quel, juste après le nom', async () => {
    const z = await collecter(fluxZip([source('a.txt', 'bonjour')]));
    const nomLong = lire16(z, 26);
    expect(new TextDecoder().decode(z.slice(30 + nomLong, 30 + nomLong + 7))).toBe('bonjour');
  });

  it('le poids prévu par tailleArchive est EXACT', async () => {
    const entrees = [source('a.txt', 'aa'), source('bb.txt', 'bbbb')];
    const z = await collecter(fluxZip(entrees));
    expect(tailleArchive([{ nom: 'a.txt', taille: 2 }, { nom: 'bb.txt', taille: 4 }])).toBe(z.length);
  });

  it('une archive sans aucune pièce reste un .zip valide', async () => {
    const z = await collecter(fluxZip([]));
    expect(z.length).toBe(22);
    expect(lire16(z, 8)).toBe(0);
  });
});

describe('les pannes', () => {
  /**
   * 🔴 UNE PIÈCE ILLISIBLE N'EMPORTE PAS L'ARCHIVE. Rendre une archive tronquée serait pire : l'extracteur la
   * déclarerait corrompue, et l'utilisateur perdrait AUSSI les pièces qui allaient bien.
   */
  it('une pièce que le stockage refuse est ÉCARTÉE, et l’archive reste valide', async () => {
    const ecarts: string[] = [];
    const z = await collecter(fluxZip([
      source('bonne.txt', 'ok'),
      { nom: 'perdue.txt', lire: async () => { throw new Error('objet absent'); } },
      source('autre.txt', 'ok2'),
    ], { surEcart: (nom, motif) => ecarts.push(`${nom}:${motif}`) }));
    expect(lire16(z, z.length - 22 + 8)).toBe(2);   // deux entrées, pas trois
    expect(lire32(z, z.length - 22)).toBe(0x0605_4b50);
    expect(ecarts).toEqual(['perdue.txt:objet absent']);
  });

  it('l’écart est SIGNALÉ, jamais silencieux', async () => {
    let dit = false;
    await collecter(fluxZip([{ nom: 'x', lire: async () => { throw new Error('boum'); } }], { surEcart: () => { dit = true; } }));
    expect(dit).toBe(true);
  });

  it('au-delà de 65 535 pièces, on refuse AVANT d’écrire quoi que ce soit', () => {
    const trop = Array.from({ length: 65_536 }, (_, i) => source(`f${i}`, 'x'));
    expect(() => fluxZip(trop)).toThrow(/trop fournie/);
  });
});
