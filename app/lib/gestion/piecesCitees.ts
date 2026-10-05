/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 3 — LES NOMS DE PIÈCES CITÉS DANS UN CORPS DE MAIL. MODULE PUR ════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (05/10/2026) : sur le mail de Louis Vaglio du 30/06/2026 17:27 (fil 3366), « je ne vois pas de
 * pièces jointes, alors que le texte affiche "<RIB..pdf> <Solde Charges courantes au 31_03_2025.pdf>
 * <Rmbt VAGLIO ARNAUD Aurélie et Louis DPR.pdf>" ».
 *
 * ═══ 🔴 LE DIAGNOSTIC, VÉRIFIÉ DANS GMAIL EN LECTURE SEULE ══════════════════════════════════════════════════════
 *
 * Ce message (RFC `DB8P192MB0549C8526F084C982FC343DFA0F72@…OUTLOOK.COM`) **ne porte AUCUNE pièce jointe** : Gmail
 * ne rend ni `attachments` ni `attachmentIds`, et le message pèse **18 118 octets** en tout — là où les trois PDF
 * cités totalisent 341 ko. Rien ne manque chez nous.
 *
 * Les trois noms sont dans la partie CITÉE du corps, juste après « Le 11 nov. 2025 à 20:09, Blandine Piriou
 * <blandine.piriou@gmail.com> a écrit : ». C'est la façon dont Apple Mail écrit, dans le texte brut, les pièces
 * du mail qu'on cite. Et ces trois fichiers existent bel et bien chez nous, sur QUATRE mails du même fil —
 * 27076, 26914, 6788 et 6813 — conservés, aux mêmes tailles.
 *
 * ═══ 🔴🔴 CE QUE CE MODULE FAIT, ET CE QU'IL NE FAIT PAS ════════════════════════════════════════════════════════
 *
 * Il transforme chaque nom cité qui correspond à une pièce RÉELLE de la MÊME conversation en un morceau
 * « pièce », que l'écran rend en petit lien. Il n'ajoute AUCUNE pièce au mail : le mail n'en a pas, et lui en
 * inventer une aurait fait mentir le trombone, le résumé des pièces et le compteur.
 *
 * ⚠️ SANS CORRESPONDANCE, LE TEXTE RESTE TEL QUEL — demande d'Arno. Un nom cité qu'on ne retrouve pas est un
 * fichier qu'on n'a pas : le souligner aurait promis une porte qui ne s'ouvre pas.
 *
 * ═══ MESURÉ EN BASE (05/10/2026) ════════════════════════════════════════════════════════════════════════════════
 *
 *   1 545 mails citent au moins un nom de fichier entre chevrons (4 034 citations) ;
 *     417 mails ont au moins une citation qui correspond à une VRAIE pièce de la même conversation (1 141 noms).
 *
 * C'est donc 417 mails que ce lot éclaire — et les 1 128 autres gardent leur texte inchangé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Une pièce de la conversation, candidate à être citée. */
export interface PieceCitable {
  pieceId: number;
  nomFichier: string;
  messageId: number;
  /** La date du mail qui la PORTE — c'est elle que l'info-bulle annonce. */
  recuLe: string;
  /** L'expéditeur du mail qui la porte. Sert à choisir entre plusieurs copies. */
  de: string;
}

/** Un morceau du corps : du texte ordinaire, ou un nom de pièce qui ouvre la visionneuse. */
export type MorceauDuCorps =
  | { sorte: 'texte'; texte: string }
  | { sorte: 'piece'; texte: string; pieceId: number; aide: string };

/**
 * ══ 🔴 CE QUI RESSEMBLE À UN NOM DE FICHIER ENTRE CHEVRONS ══════════════════════════════════════════════════════
 *
 * ⚠️ `[^<>\n@]` EXCLUT L'ARROBASE, ET IL LE FALLAIT : un corps de mail est plein de `<prenom.nom@gmail.com>`, qui
 * finit par un point et deux à cinq lettres comme un nom de fichier. Mesuré : sans cette exclusion, le compte
 * passe de 4 034 citations à 131 397 — on aurait tenté d'apparier des adresses à des pièces.
 *
 * ⚠️ L'EXTENSION EST BORNÉE À CINQ CARACTÈRES : au-delà, ce n'est plus une extension mais une phrase.
 *
 * ⚠️ LES BLANCS DE BORD SONT TOLÉRÉS (`<  rib.pdf  >`) : aucun client n'en écrit, mais un corps recopié à la
 * main en porte, et refuser le lien pour deux espaces serait un refus qu'on ne saurait pas expliquer.
 */
const CITATION = /<\s*([^<>\n@]{1,120}\.[A-Za-z0-9]{2,5})\s*>/g;

/** Les en-têtes de citation, qui portent l'adresse du mail cité. Apple Mail, Outlook et Gmail les écrivent ainsi. */
const ENTETE_CITATION = /(?:a écrit\s*:|wrote\s*:|Forwarded message)/gi;
const ADRESSE_DANS_LIGNE = /<([^<>\s@]+@[^<>\s@]+)>/;

/** Le jour d'une date ISO, en français. Rien d'inventé : `—` quand la date est illisible. */
function jourFrancais(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d);
}

/** Le mot de l'info-bulle, celui d'Arno : « pièce du mail du 11/11/2025 ». PUR. */
export function aidePieceCitee(recuLe: string): string {
  return `pièce du mail du ${jourFrancais(recuLe)}`;
}

/**
 * ══ 🔴🔴 LAQUELLE DES COPIES ? ═══════════════════════════════════════════════════════════════════════════════════
 *
 * Sur le fil 3366, les trois fichiers existent sur QUATRE mails. Le contenu est le même ; c'est l'info-bulle qui
 * change, et elle doit dire vrai. Arno attend « pièce du mail du 11/11/2025 » — celui que la citation NOMME.
 *
 * 🔴 TROIS RÈGLES, DANS CET ORDRE, ET LA PREMIÈRE EST LA BONNE DANS LE CAS D'ARNO :
 *   ① l'en-tête de citation qui précède le nom porte une ADRESSE (« … Blandine Piriou <blandine.piriou@gmail.com>
 *      a écrit : ») : on prend la copie portée par un mail de CET expéditeur ;
 *   ② sinon, la copie la plus RÉCENTE parmi celles qui précèdent le mail qui cite — la source la plus probable ;
 *   ③ sinon, la plus ancienne. Il y a toujours une réponse : le lien ne doit jamais rester mort.
 *
 * 🔴 L'ADRESSE PLUTÔT QUE LA DATE, et c'est délibéré. La même ligne porte aussi « Le 11 nov. 2025 à 20:09 », mais
 * ce texte change de forme avec la langue et le client (« On 11 Nov 2025 at … »), et il faudrait l'analyser.
 * L'adresse entre chevrons, elle, est écrite pareil partout — et elle désigne la personne, pas l'instant.
 */
export function copieCitee(
  candidates: readonly PieceCitable[], adresseCitee: string | null, dateDuMailQuiCite: string,
): PieceCitable | null {
  if (candidates.length === 0) return null;
  const parDate = [...candidates].sort((a, b) => (a.recuLe < b.recuLe ? -1 : a.recuLe > b.recuLe ? 1 : 0));
  if (adresseCitee !== null) {
    const a = adresseCitee.trim().toLowerCase();
    const trouve = parDate.find((c) => c.de.trim().toLowerCase() === a);
    if (trouve !== undefined) return trouve;
  }
  const avant = parDate.filter((c) => c.recuLe < dateDuMailQuiCite);
  return avant.length > 0 ? avant[avant.length - 1] : parDate[0];
}

/**
 * ══ 🔴🔴 DÉCOUPER LE CORPS EN MORCEAUX. PUR. ════════════════════════════════════════════════════════════════════
 *
 * 🔴 DES MORCEAUX, ET NON DU HTML — c'est la règle de ce module depuis `decouperPourSurligner`, et elle vaut
 * double ici : le corps d'un mail est écrit par n'importe qui. Rendre une chaîne balisée aurait obligé à
 * l'injecter sans échappement, c'est-à-dire à faire confiance à l'expéditeur.
 *
 * ⚠️ LA COMPARAISON DES NOMS IGNORE LA CASSE ET LES BLANCS DE BORD, et rien d'autre : « RIB..pdf » et
 * « rib..pdf » sont le même fichier, « RIB (1).pdf » ne l'est pas. Un rapprochement plus souple aurait fini par
 * ouvrir une pièce qui n'est pas celle qu'on a lue.
 */
export function decouperLesPiecesCitees(
  corps: string,
  pieces: readonly PieceCitable[],
  /** La date du mail qui cite — sert à départager les copies. */
  dateDuMailQuiCite: string,
): MorceauDuCorps[] {
  const texte = corps ?? '';
  if (texte === '' || pieces.length === 0) return [{ sorte: 'texte', texte }];

  /* Par nom normalisé, toutes les copies connues de la conversation. */
  const parNom = new Map<string, PieceCitable[]>();
  for (const p of pieces) {
    const cle = p.nomFichier.trim().toLowerCase();
    if (cle === '') continue;
    parNom.set(cle, [...(parNom.get(cle) ?? []), p]);
  }

  const out: MorceauDuCorps[] = [];
  let curseur = 0;
  CITATION.lastIndex = 0;
  for (let m = CITATION.exec(texte); m !== null; m = CITATION.exec(texte)) {
    const copies = parNom.get(m[1].trim().toLowerCase());
    if (copies === undefined) continue;
    /* 🔴 L'ADRESSE DU DERNIER EN-TÊTE DE CITATION AVANT CE NOM — voir `copieCitee`. */
    const choisie = copieCitee(copies, adresseDuDernierEntete(texte.slice(0, m.index)), dateDuMailQuiCite);
    if (choisie === null) continue;
    if (m.index > curseur) out.push({ sorte: 'texte', texte: texte.slice(curseur, m.index) });
    out.push({
      sorte: 'piece', texte: m[1], pieceId: choisie.pieceId, aide: aidePieceCitee(choisie.recuLe),
    });
    curseur = m.index + m[0].length;
  }
  if (curseur < texte.length) out.push({ sorte: 'texte', texte: texte.slice(curseur) });
  return out.length === 0 ? [{ sorte: 'texte', texte }] : out;
}

/**
 * L'adresse portée par le DERNIER en-tête de citation d'un fragment. `null` s'il n'y en a aucun. PUR.
 *
 * ⚠️ ON REGARDE LA LIGNE DE L'EN-TÊTE, ET LES DEUX QUI SUIVENT : Outlook et Gmail coupent parfois
 * « … <adresse> a écrit : » sur deux lignes, et l'adresse se retrouve après le marqueur.
 */
export function adresseDuDernierEntete(avant: string): string | null {
  const lignes = avant.split('\n');
  for (let i = lignes.length - 1; i >= 0; i -= 1) {
    ENTETE_CITATION.lastIndex = 0;
    if (!ENTETE_CITATION.test(lignes[i])) continue;
    for (const l of [lignes[i], lignes[i + 1] ?? '', lignes[i + 2] ?? '']) {
      const a = ADRESSE_DANS_LIGNE.exec(l);
      if (a !== null) return a[1];
    }
    /* L'en-tête est là mais sans adresse : on ne remonte pas plus haut, ce serait prendre celle d'une AUTRE
       citation — et désigner le mauvais mail est pire que de ne rien désigner. */
    return null;
  }
  return null;
}
