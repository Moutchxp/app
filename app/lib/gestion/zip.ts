/**
 * MODULE « GESTION » — LOT 5-PJ-A : ÉCRIRE UNE ARCHIVE .zip EN FLUX. Module PUR (aucune I/O, aucune dépendance npm).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI ÉCRIRE LE FORMAT À LA MAIN plutôt que d'ajouter une bibliothèque : l'archive ne contient que des pièces
 * jointes de mail — des JPEG, des PDF, des XML compressés ou déjà compacts. On les range donc SANS COMPRESSION
 * (méthode « store », 0) : la taille de sortie est connue d'avance, la mémoire ne sert qu'à une pièce à la fois, et il
 * n'y a rien à tenir à jour. Une dépendance de plus se justifierait si l'on compressait ; ici elle ne ferait
 * qu'ajouter une surface.
 *
 * CE QUI EST ÉCRIT : un en-tête local par pièce, puis les octets, puis l'annuaire central et son « end of central
 * directory ». C'est le format ZIP le plus ancien et le plus universellement lu — macOS, Windows, Linux, 7-Zip.
 *
 * 🔴 BORNES ASSUMÉES, et c'est pourquoi l'appelant DOIT plafonner : pas de ZIP64. Au-delà de 4 Gio de total, ou de
 * 65 535 pièces, les champs de l'annuaire débordent. Le plafond de l'appelant (`PLAFOND_ARCHIVE_OCTETS`, 200 Mio) est
 * deux ordres de grandeur en dessous — mais la garde est répétée ici, parce qu'un plafond qui vit ailleurs finit par
 * changer sans qu'on y pense.
 *
 * ⚠️ NOMS EN UTF-8 : le bit 11 des drapeaux généraux est posé (« language encoding flag »). Sans lui, un accent dans
 * « Reçu de loyer.pdf » ressort en charabia à l'extraction sous Windows.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Une entrée de l'archive : un nom déjà nettoyé et dédoublonné (cf. `nomsSansDoublon`), et ses octets. */
export interface EntreeZip {
  nom: string;
  octets: Uint8Array;
}

/** Au-delà, les champs de l'annuaire central débordent : il faudrait ZIP64, qu'on n'écrit pas. */
export const ZIP_TAILLE_MAX = 0xffff_ffff;
export const ZIP_ENTREES_MAX = 0xffff;

// ── CRC-32, table calculée une fois ──────────────────────────────────────────────────────────────────────────────
const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb8_8320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (polynôme ZIP). Le format l'exige entrée par entrée ; un CRC faux fait refuser l'archive. PUR. */
export function crc32(octets: Uint8Array): number {
  let c = 0xffff_ffff;
  for (let i = 0; i < octets.length; i += 1) c = TABLE_CRC[(c ^ octets[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffff_ffff) >>> 0;
}

/**
 * Date et heure au format MS-DOS, que le ZIP porte encore. Bornée à 1980 (l'origine du format) : une date antérieure
 * produirait une année négative, que certains extracteurs refusent. PUR.
 */
export function dateDos(d: Date): { date: number; heure: number } {
  const an = Math.max(1980, d.getFullYear());
  return {
    date: ((an - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    heure: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
  };
}

function ecrire32(v: DataView, o: number, n: number): void { v.setUint32(o, n >>> 0, true); }
function ecrire16(v: DataView, o: number, n: number): void { v.setUint16(o, n & 0xffff, true); }

/** Drapeaux généraux : seul le bit 11 (noms en UTF-8) est posé. */
const DRAPEAU_UTF8 = 0x0800;

/** L'en-tête local d'une entrée, suivi de son nom. PUR. */
function enTeteLocal(nomUtf8: Uint8Array, crc: number, taille: number, horodatage: { date: number; heure: number }): Uint8Array {
  const buf = new Uint8Array(30 + nomUtf8.length);
  const v = new DataView(buf.buffer);
  ecrire32(v, 0, 0x0403_4b50);        // signature
  ecrire16(v, 4, 20);                 // version minimale
  ecrire16(v, 6, DRAPEAU_UTF8);
  ecrire16(v, 8, 0);                  // méthode 0 = « store », aucune compression
  ecrire16(v, 10, horodatage.heure);
  ecrire16(v, 12, horodatage.date);
  ecrire32(v, 14, crc);
  ecrire32(v, 18, taille);            // compressée = brute, puisqu'on ne compresse pas
  ecrire32(v, 22, taille);
  ecrire16(v, 26, nomUtf8.length);
  ecrire16(v, 28, 0);                 // pas de champ « extra »
  buf.set(nomUtf8, 30);
  return buf;
}

/** Une ligne de l'annuaire central. PUR. */
function ligneAnnuaire(
  nomUtf8: Uint8Array, crc: number, taille: number, decalage: number, horodatage: { date: number; heure: number },
): Uint8Array {
  const buf = new Uint8Array(46 + nomUtf8.length);
  const v = new DataView(buf.buffer);
  ecrire32(v, 0, 0x0201_4b50);
  ecrire16(v, 4, 20);                 // version qui a écrit
  ecrire16(v, 6, 20);                 // version minimale pour lire
  ecrire16(v, 8, DRAPEAU_UTF8);
  ecrire16(v, 10, 0);
  ecrire16(v, 12, horodatage.heure);
  ecrire16(v, 14, horodatage.date);
  ecrire32(v, 16, crc);
  ecrire32(v, 20, taille);
  ecrire32(v, 24, taille);
  ecrire16(v, 28, nomUtf8.length);
  ecrire16(v, 30, 0);                 // extra
  ecrire16(v, 32, 0);                 // commentaire
  ecrire16(v, 34, 0);                 // numéro de disque
  ecrire16(v, 36, 0);                 // attributs internes
  ecrire32(v, 38, 0);                 // attributs externes
  ecrire32(v, 42, decalage);
  buf.set(nomUtf8, 46);
  return buf;
}

/** La fin de l'annuaire central. PUR. */
function finAnnuaire(nombre: number, tailleAnnuaire: number, decalageAnnuaire: number): Uint8Array {
  const buf = new Uint8Array(22);
  const v = new DataView(buf.buffer);
  ecrire32(v, 0, 0x0605_4b50);
  ecrire16(v, 4, 0);
  ecrire16(v, 6, 0);
  ecrire16(v, 8, nombre);
  ecrire16(v, 10, nombre);
  ecrire32(v, 12, tailleAnnuaire);
  ecrire32(v, 16, decalageAnnuaire);
  ecrire16(v, 20, 0);                 // pas de commentaire d'archive
  return buf;
}

/**
 * Le poids EXACT de l'archive, connu AVANT de l'écrire — c'est le cadeau de la méthode « store ». Permet d'annoncer
 * un `Content-Length` honnête, donc une barre de progression qui avance vraiment dans le navigateur. PUR.
 */
export function tailleArchive(entrees: readonly { nom: string; taille: number }[]): number {
  let total = 0;
  for (const e of entrees) {
    const nom = new TextEncoder().encode(e.nom).length;
    total += 30 + nom + e.taille;   // en-tête local + nom + octets
    total += 46 + nom;              // ligne d'annuaire + nom
  }
  return total + 22;                // fin d'annuaire
}

/** Une pièce, lue PARESSEUSEMENT : les octets ne sont demandés qu'au moment d'être écrits dans le flux. */
export interface SourceZip {
  nom: string;
  /** Rend les octets de la pièce. Appelée UNE fois, au moment d'écrire — jamais toutes d'un coup. */
  lire(): Promise<Uint8Array>;
}

/**
 * ÉCRIT l'archive EN FLUX. Les pièces sont lues UNE À UNE et relâchées aussitôt : une archive de 200 Mio ne fait
 * jamais tenir 200 Mio en mémoire, seulement la plus grosse pièce. C'est la seule façon de servir un « Tout
 * télécharger » sans faire dépendre la tenue du serveur du poids des mails reçus.
 *
 * ⚠️ UNE PIÈCE ILLISIBLE N'EMPORTE PAS L'ARCHIVE. Le stockage peut refuser une pièce (objet manquant, panne) : on
 * l'ÉCARTE et on continue, plutôt que de rendre une archive tronquée que l'extracteur déclarera corrompue. Le rappel
 * `surEcart` permet à l'appelant de le dire — un fichier silencieusement absent serait pire que l'échec.
 */
export function fluxZip(
  sources: readonly SourceZip[],
  opts: { maintenant?: Date; surEcart?: (nom: string, motif: string) => void } = {},
): ReadableStream<Uint8Array> {
  if (sources.length > ZIP_ENTREES_MAX) throw new Error(`archive trop fournie : ${sources.length} pièces (maximum ${ZIP_ENTREES_MAX}).`);
  const horodatage = dateDos(opts.maintenant ?? new Date());
  const encodeur = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const annuaire: Uint8Array[] = [];
      let decalage = 0;
      let nombre = 0;
      try {
        for (const s of sources) {
          let octets: Uint8Array;
          try {
            octets = await s.lire();
          } catch (e) {
            opts.surEcart?.(s.nom, e instanceof Error ? e.message : String(e));
            continue; // pièce écartée : l'archive reste VALIDE, et l'appelant sait qu'elle manque
          }
          if (decalage + octets.length > ZIP_TAILLE_MAX) {
            opts.surEcart?.(s.nom, 'archive au-delà de 4 Gio : pièce non incluse');
            continue;
          }
          const nomUtf8 = encodeur.encode(s.nom);
          const crc = crc32(octets);
          const local = enTeteLocal(nomUtf8, crc, octets.length, horodatage);
          ctrl.enqueue(local);
          ctrl.enqueue(octets);
          annuaire.push(ligneAnnuaire(nomUtf8, crc, octets.length, decalage, horodatage));
          decalage += local.length + octets.length;
          nombre += 1;
        }
        const debutAnnuaire = decalage;
        let tailleAnnuaire = 0;
        for (const ligne of annuaire) { ctrl.enqueue(ligne); tailleAnnuaire += ligne.length; }
        ctrl.enqueue(finAnnuaire(nombre, tailleAnnuaire, debutAnnuaire));
        ctrl.close();
      } catch (e) {
        // Une panne ICI (et non sur une pièce) casse le flux : mieux vaut un téléchargement interrompu, que le
        //   navigateur signale, qu'une archive complète en apparence et corrompue à l'ouverture.
        ctrl.error(e);
      }
    },
  });
}
