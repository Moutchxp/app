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
 * ══ QUI EST DÉPLIÉ À L'OUVERTURE ═════════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 LOT MESSAGE-CLIQUÉ — LE MESSAGE VISÉ L'EMPORTE SUR TOUT. Demande d'Arno : un clic sur une ligne doit ouvrir
 * EXACTEMENT le message que cette ligne représente — le dernier REÇU sous « Réception », le dernier ENVOYÉ sous
 * « Envoyés », le message TROUVÉ dans une recherche, celui de la ligne dans l'historique. Jusqu'ici la conversation
 * dépliait toujours son dernier message, quel qu'il soit : en Réception, cliquer sur un mail reçu à 12 h 37 ouvrait
 * la réponse que NOUS avions écrite à 15 h 58. On lisait sa propre prose à la place de la question posée.
 *
 * ⚠️ LE VISÉ PASSE MÊME DEVANT LA RÈGLE « HORS FILE » ci-dessous, et c'est délibéré : cette règle protège un CHOIX
 * PAR DÉFAUT, elle n'a pas à contredire une désignation explicite. Qui clique sur la ligne d'un accusé automatique
 * demande à voir cet accusé.
 *
 * ⚠️ UN VISÉ INTROUVABLE NE VIDE PAS L'ÉCRAN : adresse copiée d'un fil dont le message a depuis été déplacé,
 * identifiant abîmé à la main. On retombe alors sur le défaut, sans rien dire — l'échange s'ouvre normalement.
 *
 * À DÉFAUT DE VISÉ : le DERNIER message, et lui seul — c'est ce qu'on vient lire, et c'est le comportement de toutes
 * les messageries. Les autres sont repliés sur une ligne, dépliables un par un.
 *
 * 🔴 UN MESSAGE TENU HORS DE LA FILE N'EST JAMAIS DÉPLIÉ D'EMBLÉE, même s'il est le dernier : c'est presque toujours
 * un accusé automatique, et déplier un « votre demande a bien été reçue » à la place de la vraie conversation serait
 * un contresens. Il reste À SA PLACE, visible et dépliable — on ne le cache pas, on ne le met juste pas en avant. PUR.
 */
export function messagesDeplies(
  messages: readonly MessageDeFil[], messageVise: number | null = null,
): Set<number> {
  if (messageVise !== null && messages.some((m) => m.messageId === messageVise)) return new Set([messageVise]);
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
 * LOT ENVOI-DIAG — CE QU'ON ÉCRIT SUR UN MESSAGE QUI N'EST PAS ARRIVÉ. PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 EN MOTS, JAMAIS EN COULEUR SEULE, et au-dessus du message. C'est l'information la plus importante qu'un fil
 * puisse porter : tout le reste de l'écran raconte une conversation qui a eu lieu, et cette ligne dit qu'une moitié
 * n'a pas été entendue. La mettre en petit, ou en rouge sans texte, reviendrait à la cacher.
 *
 * ⚠️ PLUSIEURS AVIS SE DISENT TOUS. Un mail à cinq destinataires dont deux échouent en produit deux : n'en montrer
 * qu'un ferait croire qu'une seule personne n'a pas reçu. On les joint, l'échec définitif d'abord.
 *
 * ⚠️ `null` DANS LE CAS ORDINAIRE — et c'est le cas de la quasi-totalité des messages. Rendre une chaîne vide
 * obligerait chaque appelant à la tester ; `null` dit « il n'y a rien à afficher ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function mentionNonRemise(m: Pick<MessageDeFil, 'nonRemises'>): {
  texte: string; definitif: boolean;
} | null {
  const avis = m.nonRemises ?? [];
  if (avis.length === 0) return null;
  // L'échec définitif d'abord : c'est lui qui demande une action.
  const ordonnes = [...avis].sort((a, b) => Number(b.sorte === 'permanent') - Number(a.sorte === 'permanent'));
  return {
    texte: ordonnes.map((a) => a.phrase).filter((p) => p !== '').join(' · '),
    definitif: ordonnes.some((a) => a.sorte === 'permanent'),
  };
}

/**
 * LE MESSAGE A-T-IL QUELQUE CHOSE À MONTRER, et sinon pourquoi ? Trois réponses possibles, et aucune n'est le silence :
 * un écran vide laisse croire à un message vide, ce qui est faux 557 fois en base.
 */
export type EtatCorps =
  | { v: 'texte'; texte: string }
  /**
   * 🔴 LOT BIEN-RATTACHE — LE MAIL N'A QUE DU HTML, ET ON L'AFFICHE. Le `html` porté ici est DÉJÀ ASSAINI par le
   * serveur (`lireCorpsDuMessage`) : le composant se contente de le poser. 1 180 mails en base sont dans ce cas.
   */
  | { v: 'html'; html: string }
  /** On SAIT qu'il y a du HTML, on ne l'a pas encore. État transitoire, le temps d'un aller-retour. */
  | { v: 'html_a_charger' }
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
  m: Pick<MessageDeFil, 'corps' | 'extrait'> & Partial<Pick<MessageDeFil, 'aHtml' | 'html'>>,
  corpsCharge?: string | null,
  /** Le HTML DÉJÀ ASSAINI par le serveur. `undefined` = on ne l'a pas encore demandé. */
  htmlCharge?: string | null,
): EtatCorps {
  /**
   * ══ 🔴🔴 LE HTML D'ABORD, LE TEXTE EN SECOURS — LOT LECTURE-HTML-FIL-TROMBONE, 29/09/2026 ════════════════════
   *
   * RÈGLE D'ARNO : « si une partie HTML existe, c'est elle qui s'affiche ; le texte brut ne sert qu'en l'absence
   * de HTML ». C'est aussi ce que fait Gmail, et tous les logiciels de messagerie.
   *
   * ═══ CE QUE CETTE INVERSION RÉPARE, SUR UN CAS QU'ARNO A VU ═════════════════════════════════════════════════
   * Le mail 57185 porte 1 216 caractères de texte ET 7 998 de HTML. L'ancienne règle — « du texte ? alors le
   * texte » — affichait donc la version de secours : la signature d'Arno y devenait « <https://www.sansvisavis.com/> »,
   * une adresse Google Maps en clair sur trois lignes, et pas de logo. La mise en forme était là, à côté, inutilisée.
   *
   * 🔴 ET CE N'EST PAS UN CAS RARE : 56 367 mails sur 57 223 ont une version HTML. L'ancienne règle ne servait donc
   * la BONNE version que pour les 557 mails qui n'avaient que ça — l'exception commandait la règle.
   *
   * ⚠️ LE TEXTE N'EST PAS PERDU pour autant : il reste la version affichée pour les 454 mails qui n'ont que lui, et
   * il continue de nourrir l'EXTRAIT des listes et la recherche plein texte, qui ne lisent jamais le HTML.
   */
  if (htmlCharge !== undefined && htmlCharge !== null && htmlCharge.trim() !== '') {
    return { v: 'html', html: htmlCharge };
  }
  /**
   * Le HTML arrive avec la liste pour le message déplié d'emblée : on le prend sans aller-retour.
   *
   * ⚠️ `?? null` — LE CHAMP PEUT ÊTRE ABSENT, et pas seulement nul. Une lecture plus ancienne que ce lot (un mail
   * déplacé vers une carte, une réponse d'API d'hier) ne le porte pas du tout ; le lire sans précaution ferait
   * échouer TOUT l'affichage d'une conversation sur un `undefined.trim()`. Le type dit `string | null`, la
   * réalité d'un champ qui voyage en JSON dit `string | null | undefined`.
   */
  const htmlDeLaListe = m.html ?? null;
  if (htmlCharge === undefined && htmlDeLaListe !== null && htmlDeLaListe.trim() !== '') {
    return { v: 'html', html: htmlDeLaListe };
  }
  /**
   * ⚠️ ON SAIT QU'IL Y A DU HTML ET ON NE L'A PAS : on l'ATTEND, on ne se rabat pas sur le texte. Se rabattre
   * afficherait la version de secours une fraction de seconde puis la bonne — un clignotement qui donne
   * l'impression que l'écran hésite, et qui ferait lire deux fois la même signature.
   */
  if (m.aHtml === true && htmlCharge === undefined) return { v: 'html_a_charger' };

  const texte = corpsCharge !== undefined ? corpsCharge : m.corps;
  if (texte !== null && texte !== undefined && texte.trim() !== '') return { v: 'texte', texte };
  // Pas de corps sous la main, mais un extrait : le texte existe, il n'est simplement pas encore arrivé.
  if (corpsCharge === undefined && m.extrait !== null && m.extrait.trim() !== '') return { v: 'a_charger' };
  return { v: 'vide' };
}

/**
 * La phrase affichée pendant qu'on va CHERCHER la mise en forme.
 *
 * 🔴 ELLE NE DIT PLUS « affichage à venir ». Ce texte-là annonçait une fonctionnalité future ; celui-ci annonce
 * une lecture en cours, qui aboutit. Si elle reste affichée, c'est que la lecture a échoué — et c'est alors une
 * information, pas une excuse.
 */
export const MENTION_HTML_SEUL = 'Mise en forme en cours de lecture…';

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LOT FIL-LECTURE — DANS QUEL ORDRE ON LIT UNE CONVERSATION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** « recent » = le plus récent en haut (le défaut) ; « ancien » = l'ordre chronologique, celui d'avant ce lot. */
export type OrdreFil = 'recent' | 'ancien';

/**
 * ══ 🔴🔴 LE PIED DE CONVERSATION AJOUTE-T-IL QUELQUE CHOSE ? PUR. ══════════════════════════════════════════════
 *
 * LE DÉFAUT, VU PAR ARNO SUR LE FIL 36526 : deux rangées « Répondre / Répondre à tous / Transférer » l'une
 * SOUS L'AUTRE. Elles ne sont pourtant pas en double dans le code — ce sont deux choses différentes :
 *   · celle de CHAQUE message déplié, qui répond À CE MESSAGE (lot FIL-LECTURE) ;
 *   · celle du PIED de conversation, qui répond au message le PLUS RÉCENT (lot 5e).
 *
 * Sur une conversation d'UN SEUL message, ces deux rangées répondent au même message et se touchent : c'est le
 * même bouton, écrit deux fois. Et ce n'est pas propre au fil 36526 — cela arrive AUSSI sur un long fil lu dans
 * l'ordre chronologique, où le plus récent est en bas : le pied se retrouve collé sous sa propre rangée.
 *
 * 🔴 LA RÈGLE : le pied ne paraît QUE s'il ne fait pas doublon avec la rangée qui le précède immédiatement —
 * c'est-à-dire quand le dernier message AFFICHÉ n'est pas celui auquel le pied répond, ou qu'il est replié.
 * Il garde donc tout son sens là où il sert : un fil lu du plus récent au plus ancien, où le pied attend en bas.
 *
 * ⚠️ ON NE SUPPRIME PAS LE PIED, et on ne supprime pas non plus la rangée du message. Arno demande « une seule
 * rangée par message déplié, et une seule en fin de fil » : les deux existent, on retire seulement le cas où
 * elles se superposent.
 */
export function piedUtile(
  messages: readonly { messageId: number }[], ordre: OrdreFil, deplies: ReadonlySet<number>,
): boolean {
  if (messages.length === 0) return false;
  const affiches = ordonnerMessages(messages, ordre);
  const dernierAffiche = affiches[affiches.length - 1];
  // Le pied répond au plus RÉCENT, qui est le dernier de l'ordre chronologique.
  const plusRecent = messages[messages.length - 1];
  if (dernierAffiche.messageId !== plusRecent.messageId) return true; // le pied n'est pas sous sa propre rangée
  return !deplies.has(plusRecent.messageId);                          // replié : aucune rangée au-dessus
}

/**
 * 🔴 LE PLUS RÉCENT D'ABORD, PAR DÉFAUT. Demande d'Arno du 27/09/2026 : ce qu'on vient lire est la dernière
 * nouvelle, et elle était en bas d'un échange de douze messages — il fallait dérouler pour la trouver.
 */
export const ORDRE_FIL_DEFAUT: OrdreFil = 'recent';

/**
 * L'ordre d'affichage. Le serveur rend TOUJOURS les messages du plus ancien au plus récent : c'est l'ordre du
 * stockage, et il ne change pas. On ne fait que le retourner pour l'œil — aucune requête, aucun tri par date qui
 * pourrait diverger de celui de la base. PUR.
 *
 * ⚠️ UNE COPIE, JAMAIS `reverse()` SUR PLACE : la liste vient de l'état React ; la retourner en place muterait cet
 * état sans que React le sache, et deux rendus successifs donneraient deux ordres différents pour le même état.
 */
export function ordonnerMessages<T>(messages: readonly T[], ordre: OrdreFil): T[] {
  return ordre === 'recent' ? [...messages].reverse() : [...messages];
}

/** Le mot du sélecteur, pour l'ordre en cours. PUR. */
export function libelleOrdre(ordre: OrdreFil): string {
  return ordre === 'recent' ? 'Plus récent d’abord' : 'Plus ancien d’abord';
}

/** L'autre ordre — ce que le clic va donner. PUR. */
export function ordreSuivant(ordre: OrdreFil): OrdreFil {
  return ordre === 'recent' ? 'ancien' : 'recent';
}

/**
 * ══ LA MÉMOIRE DU CHOIX ══════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 `localStorage`, ET NON UNE PRÉFÉRENCE EN BASE — choix assumé, et voici pourquoi. Une préférence par
 * collaborateur demanderait une table, une migration, une route, et un geste de plus à chaque lecture de la
 * conversation. Or c'est un pli de lecture, pas une donnée du métier : personne n'a besoin de le retrouver sur un
 * autre poste, et personne n'a besoin de l'auditer. Le navigateur suffit, et il ne coûte rien.
 *
 * ⚠️ TOUT EST SOUS `try/catch`, DANS LES DEUX SENS. `localStorage` peut lever à la simple LECTURE : navigation
 * privée, cookies bloqués, quota plein. Une conversation ne doit jamais refuser de s'afficher parce qu'un navigateur
 * n'a pas voulu se souvenir d'un ordre de lecture.
 *
 * ⚠️ ET UNE VALEUR INCONNUE VAUT LE DÉFAUT : ce qui est lu là vient du disque de quelqu'un, pas de notre code.
 */
export const CLE_ORDRE_FIL = 'svv.gestion.ordreFil';

export function lireOrdreMemorise(): OrdreFil {
  try {
    const v = globalThis.localStorage?.getItem(CLE_ORDRE_FIL);
    return v === 'recent' || v === 'ancien' ? v : ORDRE_FIL_DEFAUT;
  } catch {
    return ORDRE_FIL_DEFAUT; // stockage refusé : on lit dans l'ordre par défaut, et on n'en parle pas
  }
}

export function memoriserOrdre(ordre: OrdreFil): void {
  try {
    globalThis.localStorage?.setItem(CLE_ORDRE_FIL, ordre);
  } catch {
    // Rien à dire : le choix vaut pour cet écran, il ne survivra simplement pas au rechargement.
  }
}
