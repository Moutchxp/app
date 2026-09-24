/**
 * MODULE « GESTION » — LOT 5-0 : LIRE LES DESTINATAIRES D'UN MAIL, SÉPARÉMENT. Module PUR (aucune I/O, aucune base,
 * aucun réseau) — donc rejouable à tout moment sur des en-têtes déjà capturés.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE MODULE EXISTE. Jusqu'ici la capture fondait `To` et `Cc` dans UNE seule colonne de texte libre
 * (`destinatairesDuMessage`, captureRepo) et jetait `Reply-To`. C'était suffisant pour COMPTER des destinataires — le
 * seul usage d'alors. Ça ne l'est plus : « Répondre à tous » a besoin de savoir QUI était en copie et qui ne l'était
 * pas, et « Répondre » doit écrire à l'adresse que l'auteur a DEMANDÉE (`Reply-To`), pas à celle d'où le mail est parti.
 *
 * ⚠️ LES EN-TÊTES ARRIVENT BRUTS. `versMessageBoite` (imap.ts, NON modifié par ce lot) recopie la ligne d'en-tête telle
 * quelle : un nom accentué y est encore encodé (`=?UTF-8?Q?Ga=C3=ABlle?=`). Sans décodage, l'écran afficherait ce
 * charabia à la place du nom. C'est pourquoi ce module décode lui-même, plutôt que de faire confiance à l'amont.
 *
 * ⚠️ ON NE DÉCOUPE PAS SUR LA VIRGULE. « Dupont, Jean <j@d.fr> » est UNE adresse, pas deux. La virgule ne sépare que
 * hors guillemets et hors chevrons — c'est la seule façon de ne pas couper un nom en deux moitiés inutilisables.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Un destinataire : son adresse, et le nom affiché s'il y en a un. */
export interface Adresse {
  /** Nom affiché, décodé et nettoyé. `null` quand le mail n'en portait pas. */
  nom: string | null;
  /** L'adresse, telle qu'écrite (casse d'origine CONSERVÉE — voir plus bas). */
  adresse: string;
}

/**
 * Forme d'une adresse. Reprise de `MOTIF_ADRESSE` (typologie.ts), ANCRÉE : ici on VALIDE un jeton déjà isolé, là-bas on
 * en EXTRAIT depuis du texte libre. Volontairement tolérante (pas d'exigence de point dans le domaine) : un en-tête mal
 * formé doit être rendu tel qu'il est, pas corrigé au jugé.
 */
const MOTIF_ADRESSE = /^[^\s<>,;:"()[\]]+@[^\s<>,;:"()[\]]+$/;

/** Un mot encodé RFC 2047 : `=?charset?B|Q?données?=`. */
const MOT_ENCODE = /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g;

/**
 * Jeu de caractères d'un mot encodé → encodage Node. Liste FERMÉE et volontairement courte : un jeu inconnu fait rendre
 * le mot TEL QUEL plutôt que du texte faux. Mieux vaut un nom visiblement encodé qu'un nom silencieusement corrompu.
 */
function encodageNode(charset: string): BufferEncoding | null {
  const c = charset.trim().toLowerCase();
  if (c === 'utf-8' || c === 'utf8') return 'utf8';
  if (c === 'iso-8859-1' || c === 'iso-8859-15' || c === 'latin1' || c === 'windows-1252' || c === 'cp1252') return 'latin1';
  if (c === 'us-ascii' || c === 'ascii') return 'ascii';
  return null;
}

/** Décode le corps d'un mot encodé en `Q` (quoted-printable d'en-tête : `_` = espace, `=XX` = octet). PUR. */
function octetsDeQ(donnees: string): number[] {
  const octets: number[] = [];
  for (let i = 0; i < donnees.length; i++) {
    const c = donnees[i];
    if (c === '_') { octets.push(0x20); continue; }
    if (c === '=' && i + 2 < donnees.length && /^[0-9a-fA-F]{2}$/.test(donnees.slice(i + 1, i + 3))) {
      octets.push(Number.parseInt(donnees.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }
    octets.push(c.charCodeAt(0) & 0xff);
  }
  return octets;
}

/**
 * Décode les mots encodés RFC 2047 d'un en-tête. Deux mots encodés qui se suivent sont COLLÉS (la norme veut que
 * l'espace qui les sépare disparaisse) : sans ça, « Gaëlle François » découpé en deux mots par le client d'envoi
 * ressortirait avec un espace en trop au milieu d'un prénom.
 *
 * Tout ce qui n'est pas un mot encodé est laissé INTACT. Un mot encodé illisible est rendu tel quel — on ne devine pas. PUR.
 */
export function decoderMotsEncodes(brut: string): string {
  const colle = brut.replace(/\?=[ \t]+=\?/g, '?==?');
  return colle.replace(MOT_ENCODE, (tout, charset: string, codage: string, donnees: string) => {
    const encodage = encodageNode(charset);
    if (encodage === null) return tout;
    try {
      const octets = codage.toLowerCase() === 'b'
        ? Buffer.from(donnees, 'base64')
        : Buffer.from(octetsDeQ(donnees));
      return octets.toString(encodage);
    } catch {
      return tout; // donnée corrompue : on rend l'original, jamais une approximation
    }
  });
}

/**
 * Découpe une liste d'adresses en fragments. La virgule (et le point-virgule, qu'emploient certains clients) ne SÉPARE
 * que hors guillemets et hors chevrons. C'est tout l'enjeu : « "Dupont, Jean" <j@d.fr>, Marie <m@d.fr> » fait DEUX
 * destinataires, pas trois. PUR.
 */
function decouperListe(brut: string): string[] {
  const fragments: string[] = [];
  let courant = '';
  let dansGuillemets = false;
  let dansChevrons = false;
  let echappe = false;
  for (const c of brut) {
    if (echappe) { courant += c; echappe = false; continue; }
    if (c === '\\' && dansGuillemets) { courant += c; echappe = true; continue; }
    if (c === '"') { dansGuillemets = !dansGuillemets; courant += c; continue; }
    if (!dansGuillemets && c === '<') { dansChevrons = true; courant += c; continue; }
    if (!dansGuillemets && c === '>') { dansChevrons = false; courant += c; continue; }
    if (!dansGuillemets && !dansChevrons && (c === ',' || c === ';')) { fragments.push(courant); courant = ''; continue; }
    courant += c;
  }
  fragments.push(courant);
  return fragments.map((f) => f.trim()).filter((f) => f !== '');
}

/** Nettoie un nom affiché : guillemets retirés, échappements défaits, espaces resserrés. `null` s'il ne reste rien. PUR. */
function nettoyerNom(brut: string): string | null {
  // `[\s\S]` plutôt que `.` + drapeau `s` : la cible TypeScript du dépôt est antérieure à es2018, où ce drapeau n'existe pas.
  const sansGuillemets = brut.trim().replace(/^"([\s\S]*)"$/, '$1');
  const nom = sansGuillemets.replace(/\\(.)/g, '$1').replace(/\s+/g, ' ').trim();
  return nom === '' ? null : nom;
}

/**
 * Analyse UN fragment (`Nom <adresse>` ou `adresse` nue). `null` si rien d'exploitable — une entrée de groupe
 * (« Undisclosed recipients: »), un en-tête tronqué, une ligne vide. PUR.
 */
function analyserFragment(fragment: string): Adresse | null {
  const decode = decoderMotsEncodes(fragment);
  const ouvrant = decode.lastIndexOf('<');
  const fermant = ouvrant === -1 ? -1 : decode.indexOf('>', ouvrant + 1);

  const brute = ouvrant !== -1 && fermant !== -1 ? decode.slice(ouvrant + 1, fermant) : decode;
  const nom = ouvrant !== -1 && fermant !== -1 ? nettoyerNom(decode.slice(0, ouvrant)) : null;

  // ⚠️ LA CASSE DE L'ADRESSE EST CONSERVÉE. Ailleurs dans le module on minuscule pour COMPARER ; ici on garde pour
  //   ÉCRIRE. La norme rend la partie locale sensible à la casse, et ces adresses serviront un jour de destinataires
  //   réels : les abîmer serait irréparable, alors que les comparer en minuscules reste possible à tout moment.
  const adresse = brute.trim().replace(/^mailto:/i, '').trim();
  if (!MOTIF_ADRESSE.test(adresse)) return null;
  return { nom, adresse };
}

/**
 * Analyse une liste d'adresses d'en-tête. Rend TOUJOURS un tableau — VIDE quand l'en-tête est absent, vide ou
 * inexploitable. C'est volontaire et ça porte du sens : `[]` dit « on a regardé, il n'y avait personne », là où la
 * colonne à `NULL` en base dira « on n'a jamais regardé ». Les deux ne doivent jamais se confondre.
 *
 * Dédoublonnage SANS TENIR COMPTE DE LA CASSE, en gardant la PREMIÈRE écriture rencontrée (et donc le premier nom). PUR.
 */
export function analyserListeAdresses(brut: string | null | undefined): Adresse[] {
  if (brut === null || brut === undefined) return [];
  const vues = new Set<string>();
  const out: Adresse[] = [];
  for (const fragment of decouperListe(brut)) {
    const a = analyserFragment(fragment);
    if (a === null) continue;
    const cle = a.adresse.toLowerCase();
    if (vues.has(cle)) continue;
    vues.add(cle);
    out.push(a);
  }
  return out;
}

/** Valeur d'un en-tête, quelle que soit la casse de son nom. Même lecture tolérante que `typologie.ts`. PUR. */
function entete(entetes: Record<string, string>, nom: string): string | undefined {
  for (const [k, v] of Object.entries(entetes)) if (k.toLowerCase() === nom) return v;
  return undefined;
}

/** Les quatre listes de destinataires d'un message, séparées. */
export interface DestinatairesSepares {
  a: Adresse[];
  cc: Adresse[];
  /**
   * Presque toujours vide : une copie cachée n'arrive pas chez le destinataire. Elle est en revanche présente sur NOS
   * PROPRES ENVOIS, que la boîte recopie — et c'est justement là qu'on en a besoin.
   */
  cci: Adresse[];
  /** Adresse de réponse demandée par l'auteur. Vide = répondre à l'expéditeur, comme avant. */
  repondreA: Adresse[];
}

/**
 * Sépare les destinataires d'un message à partir de ses en-têtes DÉJÀ LUS. Aucune relecture de la boîte, aucun octet
 * retéléchargé : tout est là, c'était simplement jeté.
 *
 * ⚠️ UN SEUL `To` EST VU. `versMessageBoite` range les en-têtes dans un objet (un nom → une valeur) : un message
 * portant deux lignes `To:` ne laisse que la dernière. C'est rarissime et ce lot ne le change pas — le noter vaut
 * mieux que le corriger dans `imap.ts`, hors périmètre. PUR.
 */
export function destinatairesSepares(entetes: Record<string, string>): DestinatairesSepares {
  return {
    a: analyserListeAdresses(entete(entetes, 'to')),
    cc: analyserListeAdresses(entete(entetes, 'cc')),
    cci: analyserListeAdresses(entete(entetes, 'bcc')),
    repondreA: analyserListeAdresses(entete(entetes, 'reply-to')),
  };
}
