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
  'voie' | 'a' | 'cc' | 'cci' | 'objet' | 'corps' | 'citation'> & { corpsHtml?: string | null };

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
