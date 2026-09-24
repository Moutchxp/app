/**
 * LOT 5-FIDÈLE — LE MENU « ⋮ » D'UN MESSAGE, À L'IDENTIQUE DE GMAIL. Module PUR : aucun import, aucune base, aucun
 * réseau. Il décide de l'ORDRE, des MOTS et de ce que chaque entrée fait réellement — rien d'autre.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI « À L'IDENTIQUE » EST UNE EXIGENCE, PAS UN GOÛT. L'équipe d'Arno travaille dans Gmail toute la journée.
 * Un menu qui reprend les mêmes mots dans le même ordre se lit sans réapprendre ; un menu qui « fait mieux » oblige
 * chacun à chercher, chaque fois, où est passé ce qu'il connaissait. L'ordre ci-dessous est donc celui de Gmail, et
 * les libellés sont les siens — au mot près.
 *
 * 🔴 AUCUNE ENTRÉE NE FAIT SEMBLANT. Chacune porte ce qu'elle fait VRAIMENT :
 *   · `gmail`   — elle modifie la vraie boîte (libellé, filtre). Droit d'écriture exigé, et journalisée.
 *   · `lien`    — l'API ne sait pas le faire : on ouvre le message DANS Gmail, et l'entrée le DIT.
 *   · `maison`  — c'est notre outil qui répond (rédaction, recherche, impression).
 * Deux entrées de Gmail sont VOLONTAIREMENT ABSENTES : « Supprimer » (décision d'Arno en attente — on n'affiche pas
 * un geste dont la règle n'est pas tranchée) et les réactions emoji (l'API ne les expose pas ; un bouton qui ne
 * marcherait pas coûte plus cher qu'une absence).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

export type ActionMessage =
  | 'repondre' | 'repondre_tous' | 'transferer'
  | 'partager_chat' | 'non_lu' | 'bloquer' | 'spam'
  | 'hameconnage' | 'illegal' | 'filtrer_similaires' | 'traduire'
  | 'imprimer' | 'telecharger' | 'afficher_original'
  | 'deplacer_mail' | 'detacher_mail';

/** D'où vient la réponse : la vraie boîte Gmail, un simple lien vers Gmail, ou notre propre outil. */
export type NatureAction = 'gmail' | 'lien' | 'maison';

export interface EntreeMessage {
  cle: ActionMessage;
  libelle: string;
  nature: NatureAction;
  /** Une ligne d'explication, affichée avec l'entrée quand elle est nécessaire (jamais au survol seul). */
  aide?: string;
  /** Un trait au-dessus, comme dans Gmail. */
  separateurAvant?: boolean;
  /** Le titre de section affiché au-dessus (nos entrées maison sont rangées sous « Gestion »). */
  section?: string;
  /** Une question posée AVANT d'agir. Présente = l'action ne part jamais sur un simple clic. */
  confirmation?: string;
}

/**
 * LE MENU, dans l'ordre de Gmail.
 *
 * `nomExpediteur` entre dans « Bloquer "…" » exactement comme chez Gmail : on doit lire QUI l'on bloque avant de le
 * bloquer. `avecGestes` porte nos entrées maison — elles n'existent que là où elles existaient déjà (un mail dans une
 * conversation), et ce lot n'en retire aucune.
 */
export function menuMessage(o: { nomExpediteur: string; avecGestes?: boolean }): EntreeMessage[] {
  const qui = (o.nomExpediteur ?? '').trim() || 'cet expéditeur';
  const entrees: EntreeMessage[] = [
    { cle: 'repondre', libelle: 'Répondre', nature: 'maison' },
    { cle: 'repondre_tous', libelle: 'Répondre à tous', nature: 'maison' },
    { cle: 'transferer', libelle: 'Transférer', nature: 'maison' },

    { cle: 'partager_chat', libelle: 'Partager dans le chat', nature: 'lien', separateurAvant: true,
      aide: 'Ouvre ce message dans Gmail, où le partage se fait.' },
    { cle: 'non_lu', libelle: 'Marquer comme non lu', nature: 'gmail' },
    { cle: 'bloquer', libelle: `Bloquer « ${qui} »`, nature: 'gmail',
      confirmation: `Bloquer « ${qui} » ? Ses prochains messages n’arriveront plus dans la boîte de réception : ils iront directement dans les indésirables. Les messages déjà reçus ne bougent pas, et le blocage se défait dans Gmail (Paramètres → Filtres et adresses bloquées).` },
    { cle: 'spam', libelle: 'Signaler comme spam', nature: 'gmail',
      confirmation: 'Signaler ce message comme spam ? Il quitte la boîte de réception pour les indésirables, dans Gmail. Ce geste se défait depuis Gmail.' },
    { cle: 'hameconnage', libelle: 'Signaler comme hameçonnage', nature: 'lien',
      aide: 'Gmail ne permet pas ce signalement depuis une application : le message s’ouvre dans Gmail pour l’y faire.' },
    { cle: 'illegal', libelle: 'Signaler un contenu illégal', nature: 'lien',
      aide: 'Gmail ne permet pas ce signalement depuis une application : le message s’ouvre dans Gmail pour l’y faire.' },
    { cle: 'filtrer_similaires', libelle: 'Filtrer les messages similaires', nature: 'maison',
      aide: 'Cherche dans notre boîte tous les messages de cet expéditeur.' },
    { cle: 'traduire', libelle: 'Traduire', nature: 'lien',
      aide: 'La traduction est une fonction de Gmail : le message s’y ouvre.' },
    { cle: 'imprimer', libelle: 'Imprimer', nature: 'maison' },
    { cle: 'telecharger', libelle: 'Télécharger le message', nature: 'gmail',
      aide: 'Fichier .eml, tiré du message original tel que Gmail l’a reçu.' },
    { cle: 'afficher_original', libelle: 'Afficher l’original', nature: 'gmail',
      aide: 'La source originale, telle que Gmail l’a reçue.' },
  ];
  if (o.avecGestes !== false) {
    entrees.push(
      { cle: 'deplacer_mail', libelle: 'Déplacer ce mail vers un autre événement…', nature: 'maison',
        separateurAvant: true, section: 'Gestion' },
      { cle: 'detacher_mail', libelle: 'Détacher ce mail', nature: 'maison' },
    );
  }
  return entrees;
}

/** Les actions qui MODIFIENT la boîte Gmail : droit d'écriture exigé, et journal. Les autres ne changent rien. */
export const ACTIONS_ECRIVENT_GMAIL: readonly ActionMessage[] = ['non_lu', 'bloquer', 'spam'];

/** Cette action modifie-t-elle la vraie boîte ? PUR. */
export function ecritDansGmail(a: ActionMessage): boolean {
  return ACTIONS_ECRIVENT_GMAIL.includes(a);
}

// ── Les liens vers Gmail ──────────────────────────────────────────────────────────────────────────────────────────

/** Le domaine de Gmail, écrit une fois. */
const GMAIL = 'https://mail.google.com/mail/u/';

/**
 * L'ADRESSE DU MESSAGE DANS GMAIL, pour l'ouvrir dans un onglet.
 *
 * DEUX FORMES, dans cet ordre : par identifiant de fil quand on le connaît (Gmail y va directement) ; sinon par
 * RECHERCHE sur le `Message-ID`, qui marche toujours mais demande à Gmail de chercher. `authuser` présélectionne le
 * compte gestion@ — sans lui, quelqu'un connecté à deux comptes Google tombe dans le mauvais.
 *
 * `null` = on ne sait pas où pointer. Mieux vaut pas de lien qu'un lien qui ouvre la mauvaise boîte. PUR.
 */
export function lienGmail(
  compte: string, o: { gmailThreadId?: string | null; messageIdRfc?: string | null },
): string | null {
  const auth = encodeURIComponent((compte ?? '').trim());
  if (auth === '') return null;
  const fil = (o.gmailThreadId ?? '').trim();
  if (fil !== '') return `${GMAIL}?authuser=${auth}#all/${encodeURIComponent(fil)}`;
  const mid = (o.messageIdRfc ?? '').trim().replace(/^</, '').replace(/>$/, '');
  if (mid === '') return null;
  return `${GMAIL}?authuser=${auth}#search/${encodeURIComponent(`rfc822msgid:${mid}`)}`;
}

/** Le libellé du bouton étoile, selon son état. Le MOT change, jamais la seule couleur. PUR. */
export function libelleEtoile(etoile: boolean): string {
  return etoile ? 'Retirer l’étoile' : 'Ajouter une étoile';
}
