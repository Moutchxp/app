import type { Brouillon } from './redaction';

/**
 * LOT BROUILLONS-GMAIL — QUAND ENREGISTRER UN BROUILLON, ET COMMENT SAVOIR QU'IL A CHANGÉ. PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUI EXISTAIT, MESURÉ À L'ÉCRAN LE 29/09/2026 AVANT D'ÉCRIRE UNE LIGNE :
 *   · une minuterie de 1 200 ms relancée à chaque changement — premier enregistrement observé à +1,6 s ;
 *   · RIEN d'autre : ni à la fermeture, ni à la réduction, ni au rechargement, ni à la fermeture de l'onglet.
 *     Aucun `pagehide`, aucun `beforeunload`, aucun `sendBeacon` dans tout le module ;
 *   · aucun indicateur visible ;
 *   · et un DOUBLON systématique : un brouillon neuf partait DEUX fois (+1,6 s puis +3,6 s), parce que recevoir
 *     son identifiant modifiait l'état du brouillon, ce qui relançait la minuterie. Une écriture sur deux ne
 *     servait à rien.
 *
 * 🔴 CE MODULE RÉPOND À TROIS QUESTIONS, ET RIEN D'AUTRE :
 *   ① CE QUI COMPTE COMME UN CHANGEMENT — l'identifiant qu'on vient de recevoir n'en est pas un (`signature`) ;
 *   ② COMBIEN DE TEMPS ATTENDRE — deux secondes après la frappe, tout de suite pour un geste discret
 *      (destinataire, objet, pièce jointe), parce que ces gestes-là ne se répètent pas trente fois par seconde ;
 *   ③ Y A-T-IL QUELQUE CHOSE À GARDER — la règle d'Arno, en toutes lettres : « au moins un destinataire, un objet,
 *      du texte hors signature ou une pièce jointe ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * ══ ② LES DEUX DÉLAIS ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 DEUX SECONDES APRÈS LA FRAPPE (demande d'Arno, et c'est le réglage de Gmail). Enregistrer à chaque lettre
 * ferait une requête par caractère ; attendre davantage perdrait une phrase sur un onglet fermé d'un geste.
 */
export const DELAI_FRAPPE_MS = 2000;
/**
 * 🔴 UN GESTE DISCRET S'ENREGISTRE TOUT DE SUITE — ou presque. Ajouter un destinataire, changer l'objet, joindre
 * un fichier : on ne le fait pas trente fois par seconde, et ce sont justement les changements qu'on oublie
 * d'enregistrer parce qu'on ferme dans la foulée. 250 ms suffisent à réunir deux gestes enchaînés.
 */
export const DELAI_GESTE_MS = 250;

/** Ce qui a bougé depuis le dernier enregistrement. Décide du délai, et de rien d'autre. */
export type SorteChangement = 'frappe' | 'geste' | 'aucun';

export function delaiPour(sorte: SorteChangement): number {
  return sorte === 'geste' ? DELAI_GESTE_MS : DELAI_FRAPPE_MS;
}

/** La part du brouillon qui se retrouve en base. Tout le reste (identifiant, état d'écran) n'est pas un changement. */
type PartEnregistrable = Pick<Brouillon,
  'voie' | 'a' | 'cc' | 'cci' | 'objet' | 'corps' | 'citation'>
  & { corpsHtml?: string | null; cibles?: Brouillon['cibles']; interne?: boolean };

/**
 * ══ ① LA SIGNATURE DE CE QUI SERA ÉCRIT ════════════════════════════════════════════════════════════════════════
 *
 * 🔴 C'EST ELLE QUI TUE LE DOUBLON. On compare ce qu'on S'APPRÊTE à écrire à ce qu'on A écrit ; identiques, on
 * n'écrit pas. Recevoir un identifiant, changer de place à l'écran, replier une citation : rien de tout cela ne
 * change la signature, donc rien de tout cela ne déclenche une écriture.
 *
 * ⚠️ `citation` EN FAIT PARTIE. Elle est enregistrée avec le brouillon ; l'oublier ici ferait qu'un brouillon dont
 * seule la citation a changé ne serait jamais réécrit.
 */
export function signatureBrouillon(b: PartEnregistrable): string {
  return JSON.stringify([
    b.voie, b.a, b.cc, b.cci, b.objet, b.corps, b.corpsHtml ?? null, b.citation ?? null,
    /**
     * ══ 🔴🔴 LOT CLASSER-DEUX-BOUTONS — LE CLASSEMENT ENTRE DANS LA SIGNATURE ══════════════════════════════════
     *
     * VU À L'ÉCRAN LE 30/09/2026, la migration 285 appliquée : on cochait un bien, on validait, la case verte
     * « Rattaché » s'affichait — et la colonne `cibles` restait vide en base.
     *
     * 🔴 LA CAUSE : cette signature dit « ce qu'on s'apprête à écrire ». Le classement n'y était pas, donc
     * changer les biens ne changeait PAS la signature, donc `sorteDuChangement` répondait « aucun », donc
     * l'enregistrement automatique ne partait jamais. La colonne existait, la route l'écrivait, et rien ne la
     * déclenchait : le travail de classement se perdait aussi sûrement qu'avant la migration.
     *
     * ⚠️ C'EST EXACTEMENT LE MOTIF DE `citation`, deux lignes plus haut : tout ce qui se retrouve en base doit
     * figurer ici, sans quoi un brouillon dont SEULE cette part a changé n'est jamais réécrit.
     */
    b.cibles ?? [], b.interne === true,
  ]);
}

/**
 * QU'EST-CE QUI A CHANGÉ ? Sert à choisir le délai.
 *
 * ⚠️ UN CHANGEMENT MIXTE COMPTE COMME UNE FRAPPE : si le corps a bougé en même temps qu'un destinataire, la
 * personne est en train d'écrire — on ne va pas la faire attendre moins parce qu'elle a aussi collé une adresse.
 */
export function sorteDuChangement(avant: PartEnregistrable | null, apres: PartEnregistrable): SorteChangement {
  if (avant === null) return 'geste';
  if (signatureBrouillon(avant) === signatureBrouillon(apres)) return 'aucun';
  if (avant.corps !== apres.corps || (avant.corpsHtml ?? null) !== (apres.corpsHtml ?? null)) return 'frappe';
  return 'geste';
}

/**
 * ══ ③ Y A-T-IL QUELQUE CHOSE À GARDER ? ════════════════════════════════════════════════════════════════════════
 *
 * Les quatre critères d'Arno, dans ses mots : « au moins un destinataire, un objet, du texte hors signature ou une
 * pièce jointe ». On compare au brouillon TEL QU'IL EST NÉ, parce qu'une réponse naît déjà remplie (objet « Re: … »,
 * destinataire repris, signature) — sans cet étalon, ouvrir une réponse suffirait à créer un brouillon.
 *
 * 🔴 DÉFAUT RÉPARÉ, VU DANS LA BASE LE 29/09/2026 AU MATIN. Le brouillon n° 51 n'avait ni destinataire, ni objet,
 * ni pièce, et son corps était la seule signature — pourtant il existait. Sa cause : mettre du SURLIGNAGE sur la
 * signature change le HTML, et la conversion HTML → texte réinsère alors un espace ou un saut de ligne. Le corps
 * « différait » donc de l'original, d'un caractère invisible, et cela suffisait à créer un brouillon vide.
 *
 * ⚠️ ON COMPARE DONC LE CORPS SUR SON TEXTE UTILE (espaces normalisés) — et LUI SEUL : partout ailleurs, la
 * comparaison reste au caractère près, parce qu'ajouter une ligne vide au-dessus de la signature EST une saisie.
 * Mettre en gras une signature ne l'est pas.
 */
export function brouillonAQuelqueChose(
  courant: Pick<Brouillon, 'a' | 'cc' | 'cci' | 'objet' | 'corps'>,
  origine: Pick<Brouillon, 'corps'>,
  avecPieces = false,
): boolean {
  if (avecPieces) return true;
  if (courant.a.length > 0 || courant.cc.length > 0 || courant.cci.length > 0) return true;
  if (courant.objet.trim() !== '') return true;
  return texteUtile(courant.corps) !== texteUtile(origine.corps);
}

/** Le texte, débarrassé de ce qui ne se voit pas : espaces multiples, sauts de ligne, bords. PUR. */
export function texteUtile(brut: string): string {
  return brut.replace(/\s+/g, ' ').trim();
}

/**
 * ══ L'INDICATEUR, EN BAS DE LA FENÊTRE ═════════════════════════════════════════════════════════════════════════
 *
 * 🔴 DISCRET (demande d'Arno) : deux mots, jamais une alerte. Il dit ce qui se passe au moment où cela se passe —
 * c'est la seule chose qui distingue « mon texte est en sécurité » de « je crois que mon texte est en sécurité ».
 *
 * ⚠️ `repos` NE DIT RIEN. Au premier affichage il n'y a rien à annoncer : écrire « Brouillon enregistré » avant
 * qu'un seul caractère ait été tapé serait faux, et un indicateur qui ment ne se lit plus.
 */
export type EtatEnregistrement = 'repos' | 'enregistrement' | 'enregistre' | 'echec';

export const MOTS_ENREGISTREMENT: Record<EtatEnregistrement, string> = {
  repos: '',
  enregistrement: 'Enregistrement…',
  enregistre: 'Brouillon enregistré',
  /** ⚠️ ON LE DIT. Taire un enregistrement raté ferait croire que le texte est gardé alors qu'il ne l'est pas. */
  echec: 'Brouillon non enregistré',
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT BANDEAU-ET-BROUILLONS — CE QU'UNE LIGNE DE BROUILLON DOIT MONTRER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   CONSTAT D'ARNO, vu à l'écran le 30/09/2026 : les cinq premières lignes de la liste « Brouillons » s'appelaient
   toutes « Service Gestion 2 rue Mars et Roty, 92800 Puteaux 06 23 53 32 36 01 4… ». Cinq brouillons
   indiscernables, tous nommés d'après NOTRE PROPRE SIGNATURE.

   🔴 LA CAUSE : à défaut d'objet, la ligne affichait le début du CORPS. Or un brouillon neuf naît déjà rempli —
   avec la signature, et rien d'autre. « Le début du message » était donc, presque toujours, la signature.

   ═══ LA RÈGLE D'ARNO ════════════════════════════════════════════════════════════════════════════════════════════

   Le titre est l'OBJET, toujours. Sans objet, « (sans objet) », en gris et en italique — un mot qui se lit comme
   une absence, pas comme un nom de message. Puis, en dessous, une ligne d'extrait de ce qui a été SAISI : ni la
   signature, ni la citation. Rien saisi ⇒ rien affiché : une ligne vide dit exactement la vérité, et c'est plus
   honnête qu'un faux titre.
*/

/** Le mot d'un brouillon sans objet. Écrit une fois : le titre et l'infobulle disent le même. PUR. */
export const SANS_OBJET_BROUILLON = '(sans objet)';

/** Le titre d'une ligne de brouillon. `sansObjet` dit à l'écran de le peindre en gris italique. PUR. */
export function titreBrouillon(objet: string): { texte: string; sansObjet: boolean } {
  const o = objet.trim();
  return o === '' ? { texte: SANS_OBJET_BROUILLON, sansObjet: true } : { texte: o, sansObjet: false };
}

/** Une ligne, débarrassée de ce qui ne se voit pas, pour comparer deux lignes entre elles. PUR. */
const ligneNormalisee = (l: string): string => l.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * ══ 🔴 L'EXTRAIT DE CE QUI A ÉTÉ SAISI. PUR. ═══════════════════════════════════════════════════════════════════
 *
 * On retire DEUX choses, et seulement deux :
 *   ① LES LIGNES DE LA SIGNATURE, où qu'elles soient. On ne coupe pas « tout ce qui suit la signature » : on
 *      écrit parfois SOUS elle, et couper à l'aveugle perdrait ce texte-là. Une ligne saisie qui se trouverait
 *      identique à une ligne de signature disparaîtrait aussi — c'est sans conséquence, et l'inverse (garder la
 *      signature) est le défaut qu'on répare.
 *   ② LA CITATION du message d'origine. Elle est rangée à part dans le brouillon, mais un « Répondre » repris,
 *      ou un texte collé, peut la ramener dans le corps. Les lignes en « > » et l'en-tête « Le … a écrit : » sont
 *      les deux formes qu'on rencontre.
 *
 * ⚠️ SIGNATURE ABSENTE (`null`, ou pas encore chargée) : on ne retire rien de ce côté-là. Mieux vaut un extrait
 * qui contient la signature qu'un extrait amputé de ce qui a été écrit.
 */
export function extraitSaisi(corps: string, signature: string | null, max = 90): string {
  const lignesSignature = new Set(
    (signature ?? '').split('\n').map(ligneNormalisee).filter((l) => l !== ''),
  );

  const gardees: string[] = [];
  for (const brute of corps.split('\n')) {
    const l = brute.trim();
    // La citation commence ici, et tout ce qui suit lui appartient.
    if (/^>/.test(l)) break;
    if (/^Le .+ a écrit\s*:?\s*$/i.test(l)) break;
    if (/^-{2,}\s*Forwarded message\s*-{2,}/i.test(l)) break;
    if (l === '') continue;
    if (lignesSignature.has(ligneNormalisee(l))) continue;
    gardees.push(l);
  }

  const texte = gardees.join(' ').replace(/\s+/g, ' ').trim();
  if (texte.length <= max) return texte;
  return `${texte.slice(0, max - 1).trimEnd()}…`;
}
