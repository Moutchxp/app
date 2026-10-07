/**
 * ══ 🔴🔴 LOT BROUILLONS-APERCU — CE QU'UN APERÇU DE BROUILLON MONTRE. MODULE PUR. ═════════════════════════════
 *
 * CONSTAT D'ARNO (02/10/2026), recherche « cecile thai » : « la carte “Brouillons (3)” liste les brouillons, sans
 * moyen de les voir. »
 *
 * 🔴 L'APERÇU EST EN LECTURE SEULE, ET C'EST TOUT SON INTÉRÊT. On cherche un brouillon pour savoir ce qu'il
 * contient ; l'ouvrir dans l'éditeur pour le lire ferait courir le risque de l'enregistrer en le refermant.
 * « Modifier » reste à un clic, et c'est l'éditeur ORDINAIRE qui s'ouvre — jamais un second éditeur.
 *
 * ⚠️ CE FICHIER NE SAIT RIEN DE REACT NI DE LA BASE : il dit seulement QUOI afficher et COMMENT l'écrire. C'est
 * ce qui permet d'éprouver les règles d'affichage sans monter un écran ni une base.
 */

/** Les trois lignes de destinataires, dans l'ordre d'un en-tête de mail. */
export const LIGNES_DESTINATAIRES = ['À', 'Cc', 'Cci'] as const;
export type LigneDestinataire = (typeof LIGNES_DESTINATAIRES)[number];

/** Le titre de la fenêtre, et le mot du geste. Écrits une fois : l'écran et ses épreuves lisent la même source. */
export const TITRE_APERCU_BROUILLON = 'Aperçu du brouillon';
export const MOT_MODIFIER = 'Modifier';
export const AIDE_MODIFIER = 'Ouvre ce brouillon dans l’éditeur habituel.';

/**
 * ══ 🔴🔴 LOT BROUILLON-APERCU-SUPPRESSION, POINT 2 — « VOIR LE MAIL » ════════════════════════════════════════════
 *
 * DEMANDE D'ARNO (07/10/2026) : « ajouter, À GAUCHE de “Modifier”, un bouton “Voir le mail”. Affiché seulement si
 * le brouillon est lié à un mail existant : réponse ou transfert d'un message, ou brouillon appartenant à une
 * conversation. Le clic ferme l'aperçu et ouvre cette conversation, centrée sur le message auquel le brouillon
 * répond (ou sur le dernier message de la conversation s'il n'y a pas de message précis), avec le message
 * déplié. Pas affiché pour un nouveau message jamais envoyé et rattaché à aucun mail. »
 */
export const MOT_VOIR_LE_MAIL = 'Voir le mail';
export const AIDE_VOIR_LE_MAIL = 'Ouvre la conversation de ce brouillon, sur le message auquel il répond.';

/** Ce qu'il faut d'un brouillon pour savoir s'il mène à un mail. La route rend exactement ces deux champs. */
export interface BrouillonAncre {
  filId: number | null;
  repondAMessageId: number | null;
}

/**
 * ══ 🔴🔴 CE BROUILLON MÈNE-T-IL À UN MAIL ? PURE. ════════════════════════════════════════════════════════════════
 *
 * 🔴 C'EST `filId` QUI DÉCIDE, ET LUI SEUL. « Réponse ou transfert d'un message » et « brouillon appartenant à une
 * conversation » sont la MÊME condition vue de deux côtés : un brouillon de réponse porte toujours son échange
 * (la route l'écrit avec le message auquel il répond), et un brouillon rattaché à un échange a toujours un
 * échange à ouvrir, même s'il ne vise aucun message précis.
 *
 * ⚠️ `repondAMessageId` NE SUFFIRAIT PAS : sans `filId`, on saurait quel message viser sans savoir où aller — la
 * conversation s'ouvre par son échange, jamais par un message isolé. Et `repondAMessageId` SEUL sans fil n'existe
 * pas en base (la colonne est renseignée avec le fil, par le même geste).
 *
 * ⚠️ ET UN MESSAGE NEUF REND `false` : il n'a pas d'échange, donc il n'y a rien à montrer. Arno le dit en toutes
 * lettres — « seul “Modifier” reste ». Un bouton qui ouvrirait une conversation vide serait pire qu'absent.
 */
export function brouillonMeneAUnMail(b: BrouillonAncre): boolean {
  return b.filId !== null;
}
/**
 * 🔴 LE PICTO DE LA LIGNE DE RÉSULTAT. Arno : « un picto “œil” (aria-label “Aperçu du brouillon”) ». Le mot est
 * le MÊME que le titre de la fenêtre : on doit reconnaître, en l'ouvrant, ce qu'on a cliqué.
 */
export const AIDE_OEIL = TITRE_APERCU_BROUILLON;

/**
 * CE QU'UN APERÇU A BESOIN DE SAVOIR. Recopié du dépôt plutôt qu'importé : le type du brouillon vit à côté de
 * fonctions qui tirent `pg`, et l'écran ne doit jamais tirer `pg` (garde de frontière, leçon du 24/09/2026).
 */
export interface BrouillonVu {
  objet: string;
  a: readonly string[];
  cc: readonly string[];
  cci: readonly string[];
  corps: string;
  corpsHtml: string | null;
  citation: string | null;
}

/**
 * LES LIGNES D'EN-TÊTE RÉELLEMENT AFFICHÉES. PUR.
 *
 * ⚠️ UNE LIGNE VIDE NE S'AFFICHE PAS. « Cc : » suivi de rien n'apprend rien et allonge l'en-tête ; l'absence de la
 * ligne dit déjà qu'il n'y a pas de copie. C'est la règle de l'en-tête compact de la conversation (lot FIL-LECTURE).
 *
 * ⚠️ MAIS « À » S'AFFICHE MÊME VIDE, et c'est délibéré : un brouillon sans destinataire est un brouillon qu'on ne
 * peut pas envoyer. Le taire ferait chercher l'erreur ailleurs.
 */
export function enTeteApercu(b: BrouillonVu): { ligne: LigneDestinataire; valeur: string }[] {
  const propre = (liste: readonly string[]): string =>
    liste.map((x) => (x ?? '').trim()).filter((x) => x !== '').join(', ');
  const a = propre(b.a);
  const cc = propre(b.cc);
  const cci = propre(b.cci);
  const out: { ligne: LigneDestinataire; valeur: string }[] = [{ ligne: 'À', valeur: a }];
  if (cc !== '') out.push({ ligne: 'Cc', valeur: cc });
  if (cci !== '') out.push({ ligne: 'Cci', valeur: cci });
  return out;
}

/** L'objet affiché. Un brouillon sans objet le dit, plutôt que de laisser un titre vide. PUR. */
export function objetApercu(b: BrouillonVu): string {
  const o = (b.objet ?? '').trim();
  return o === '' ? '(sans objet)' : o;
}

/**
 * LE CORPS À RENDRE, ET SOUS QUELLE FORME. PUR.
 *
 * 🔴 LE HTML D'ABORD, LE TEXTE EN REPLI — l'ordre de l'éditeur et de la conversation. Un brouillon mis en forme
 * (gras, listes, images collées) n'a de sens qu'en HTML ; rendre son texte brut afficherait les balises ou
 * perdrait la mise en forme.
 *
 * ⚠️ LA CITATION EST RECOLLÉE SOUS LE CORPS, comme à l'envoi : c'est ce que le destinataire recevra. L'aperçu doit
 * montrer le mail tel qu'il partirait, pas la moitié qu'on a tapée.
 *
 * 🔴🔴 ET SA VERSION **HTML** EST FOURNIE PAR L'APPELANT, jamais fabriquée ici en recollant du texte. La base ne
 * garde la citation qu'en TEXTE (il n'y a pas de colonne pour l'autre) : la concaténer telle quelle dans du HTML
 * ferait passer des chevrons de citation — « > » — pour des balises, et ouvrirait une injection là où il n'y en
 * avait pas. L'appelant passe ce que `reprendreBrouillon` produit déjà pour l'éditeur, par la même conversion.
 */
export function corpsApercu(
  b: BrouillonVu & { citationHtml?: string | null },
): { sorte: 'html'; html: string } | { sorte: 'texte'; texte: string } {
  const html = (b.corpsHtml ?? '').trim();
  const citation = (b.citation ?? '').trim();
  if (html !== '') {
    const citeHtml = (b.citationHtml ?? '').trim();
    return { sorte: 'html', html: citeHtml === '' ? html : `${html}${citeHtml}` };
  }
  const texte = (b.corps ?? '').trim();
  return { sorte: 'texte', texte: citation === '' ? texte : `${texte}\n\n${citation}` };
}

/** Le compte des pièces, écrit comme on le lit. PUR. */
export function motPiecesBrouillon(n: number): string {
  return n === 0 ? 'aucune pièce jointe' : n === 1 ? '1 pièce jointe' : `${n} pièces jointes`;
}
