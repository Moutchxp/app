/**
 * MODULE « GESTION » — LOT 5b : LES RÈGLES D'AFFICHAGE D'UNE CONVERSATION. Fonctions PURES (aucune I/O, aucun React),
 * donc jugeables et testables sans écran ni base.
 *
 * Elles vivent ici, et pas dans le composant, parce que ce sont des DÉCISIONS, pas de la présentation : qui est
 * déplié à l'ouverture, ce qu'on écrit quand on ne sait pas à qui un mail a été envoyé, et comment on nomme un
 * message qu'une règle tient hors de la file de tri. Ces trois réponses doivent être les mêmes partout et pouvoir
 * être relues dans six mois.
 */
import type { AdresseAffichee, MessageDeFil } from './carteRepo';

/**
 * QUI EST DÉPLIÉ À L'OUVERTURE. Le DERNIER message, et lui seul — c'est ce qu'on vient lire, et c'est le comportement
 * de toutes les messageries. Les autres sont repliés sur une ligne, dépliables un par un.
 *
 * 🔴 UN MESSAGE TENU HORS DE LA FILE N'EST JAMAIS DÉPLIÉ D'EMBLÉE, même s'il est le dernier : c'est presque toujours
 * un accusé automatique, et déplier un « votre demande a bien été reçue » à la place de la vraie conversation serait
 * un contresens. Il reste À SA PLACE, visible et dépliable — on ne le cache pas, on ne le met juste pas en avant. PUR.
 */
export function messagesDeplies(messages: readonly MessageDeFil[]): Set<number> {
  const lisibles = messages.filter((m) => !m.horsFile);
  const dernier = lisibles[lisibles.length - 1] ?? null;
  return dernier === null ? new Set() : new Set([dernier.messageId]);
}

/** Ce qu'on affiche d'un destinataire : son nom quand il y en a un, sinon son adresse. PUR. */
export function libelleAdresse(a: AdresseAffichee): string {
  const n = (a.nom ?? '').trim();
  return n === '' ? a.adresse : `${n} <${a.adresse}>`;
}

/** Une ligne de destinataires : le libellé du champ, et ce qu'il contient. */
export interface LigneDestinataires {
  /** « À », « Cc »… ou `null` pour la liste fondue, qui n'a pas de champ identifiable. */
  champ: string | null;
  valeur: string;
  /**
   * Vrai quand on rend la liste FONDUE faute de mieux. L'écran ajoute alors « destinataires non détaillés » : dire
   * qu'on ne sait pas est une information ; laisser croire qu'on sait n'en est pas une.
   */
  approximatif: boolean;
}

/**
 * LES DESTINATAIRES D'UN MESSAGE, tels qu'on peut honnêtement les écrire.
 *
 * 🔴 TROIS SITUATIONS, ET IL NE FAUT PAS LES CONFONDRE (c'est tout l'objet de la migration 235) :
 *   · `destA` non nul  → on a ANALYSÉ les en-têtes : on sait qui était en « À » et qui était en copie, on le dit ;
 *   · `destA` nul      → on n'a JAMAIS analysé (message capturé avant le lot 5-0) : on rend la liste fondue d'avant,
 *                        et on PRÉVIENT que le détail n'est pas connu ;
 *   · rien du tout     → on le dit aussi, plutôt que de laisser une ligne vide qui ressemblerait à un oubli.
 *
 * Au 24/09/2026 les 27 833 messages en base sont dans le DEUXIÈME cas : la mention de repli est donc la règle, et le
 * détail apparaîtra au fil des relèves suivantes. PUR.
 */
export function lignesDestinataires(m: Pick<MessageDeFil, 'destA' | 'destCc' | 'destinatairesFondus'>): LigneDestinataires[] {
  if (m.destA !== null || m.destCc !== null) {
    const lignes: LigneDestinataires[] = [];
    const a = m.destA ?? [];
    const cc = m.destCc ?? [];
    if (a.length > 0) lignes.push({ champ: 'À', valeur: a.map(libelleAdresse).join(', '), approximatif: false });
    if (cc.length > 0) lignes.push({ champ: 'Cc', valeur: cc.map(libelleAdresse).join(', '), approximatif: false });
    // Analysé ET vide : ça arrive (remise en copie cachée seule). On le dit plutôt que de ne rien afficher.
    if (lignes.length === 0) lignes.push({ champ: 'À', valeur: 'aucun destinataire visible', approximatif: false });
    return lignes;
  }
  const fondu = (m.destinatairesFondus ?? '').trim();
  return [{ champ: null, valeur: fondu === '' ? 'destinataires inconnus' : fondu, approximatif: true }];
}

/**
 * CE QU'ON ÉCRIT SUR UN MESSAGE TENU HORS DE LA FILE. En MOTS, jamais en couleur seule — la mention doit rester lisible
 * en niveaux de gris et pour un daltonien. Le motif de la règle est repris tel quel quand il existe : c'est lui qui
 * explique POURQUOI ce message n'encombre pas la file. PUR.
 */
export function mentionHorsFile(m: Pick<MessageDeFil, 'horsFile' | 'motifHorsFile'>): string | null {
  if (!m.horsFile) return null;
  const motif = (m.motifHorsFile ?? '').trim();
  return motif === '' ? 'Hors file de tri' : `Hors file de tri — ${motif}`;
}

/**
 * LE MESSAGE A-T-IL QUELQUE CHOSE À MONTRER, et sinon pourquoi ? Trois réponses possibles, et aucune n'est le silence :
 * un écran vide laisse croire à un message vide, ce qui est faux 557 fois en base.
 */
export type EtatCorps =
  | { v: 'texte'; texte: string }
  | { v: 'html_seul' }
  | { v: 'vide' }
  | { v: 'a_charger' };

/**
 * Décide ce qu'on affiche du corps d'un message.
 *
 * 🔴 C'EST `extrait` QUI TRANCHE, et pas l'absence de `corps`. Le serveur n'envoie le corps complet que du DERNIER
 * message ; pour tous les autres `corps` est `null`, ce qui ne veut PAS dire « vide » mais « pas encore demandé ».
 * Confondre les deux afficherait « message sans texte » sur toute une conversation. L'extrait, lui, est toujours là
 * quand il y a du texte : il dit donc, à coup sûr, s'il y a quelque chose à aller chercher.
 *
 * `corpsCharge` est ce que la lecture paresseuse a ramené — `undefined` tant qu'on n'a rien demandé. PUR.
 */
export function etatCorps(
  m: Pick<MessageDeFil, 'corps' | 'extrait' | 'htmlSeul'>, corpsCharge?: string | null,
): EtatCorps {
  const texte = corpsCharge !== undefined ? corpsCharge : m.corps;
  if (texte !== null && texte !== undefined && texte.trim() !== '') return { v: 'texte', texte };
  // Pas de corps sous la main, mais un extrait : le texte existe, il n'est simplement pas encore arrivé.
  if (corpsCharge === undefined && m.extrait !== null && m.extrait.trim() !== '') return { v: 'a_charger' };
  if (m.htmlSeul) return { v: 'html_seul' };
  return { v: 'vide' };
}

/** La phrase affichée quand un message n'a que de la mise en forme. Le lot 5d la fera disparaître. */
export const MENTION_HTML_SEUL =
  'Contenu disponible en mise en forme uniquement — affichage à venir.';
