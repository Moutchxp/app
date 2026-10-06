/**
 * MODULE « GESTION » — LOT 2 : ce que l'écran DIT. Module PUR (aucune I/O, aucun React) → testable sans navigateur.
 *
 * Il vit à part de la vue pour une raison précise : les phrases affichées quand il n'y a RIEN sont la partie la plus
 * facile à bâcler et la plus coûteuse à l'usage. Une page vide doit dire LAQUELLE des situations on regarde — « la relève
 * n'a jamais tourné », « elle a tourné et n'a rien trouvé », « tout ce qui est arrivé est tenu hors de la file » — sinon
 * l'outil laisse croire au calme alors qu'il est aveugle. C'est exactement le piège que le journal des passes existe pour
 * lever, et il serait absurde de le reproduire à l'écran.
 */

/** Date lisible en français, heure locale. Rendue CÔTÉ CLIENT uniquement (après chargement) → aucun écart d'hydratation. */
export function formaterDateFr(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const jour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(d);
  return `${jour}, ${heure}`;
}

/**
 * Ancienneté LISIBLE (« il y a 3 jours »). L'instant de référence est INJECTÉ — jamais `Date.now()` caché dedans : sans
 * quoi la fonction serait intestable et le rendu dépendrait de la milliseconde. Une date future (horloges désaccordées)
 * est ramenée à « à l'instant » plutôt que de produire un « il y a -2 heures » absurde.
 */
export function depuis(iso: string | null, maintenant: Date): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const minutes = Math.floor((maintenant.getTime() - d.getTime()) / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.floor(heures / 24);
  if (jours < 31) return `il y a ${jours} jour${jours > 1 ? 's' : ''}`;
  const mois = Math.floor(jours / 30);
  return `il y a ${mois} mois`;
}

/** Libellé de l'état d'un événement, en français lisible. */
export function libelleEtat(etat: 'a_traiter' | 'en_cours' | 'traite'): string {
  return etat === 'traite' ? 'Traité' : etat === 'en_cours' ? 'En cours' : 'À traiter';
}

export interface ReperesEcran {
  derniereReleveLe: string | null;
  messagesCaptures: number;
  messagesExclus: number;
  /**
   * LOT VEILLE-VIVE — DATE DU DERNIER MAIL CAPTURÉ. `null` = aucun, ou on ne sait pas encore.
   *
   * 🔴 SÉPARÉE DE L'HEURE DE LA DERNIÈRE PASSE, et c'est le point. Voir `messageReleve`.
   */
  dernierMailLe?: string | null;
}

/**
 * BANDEAU D'ÉTAT : ce que le module sait de lui-même. Toujours affiché, y compris quand tout va bien — un outil qui dit
 * depuis quand il n'a pas regardé reste honnête, alors qu'un outil muet laisse confondre « rien n'est arrivé » et
 * « on n'a pas relevé depuis dix jours ».
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 DEUX FAITS, DEUX PHRASES — LOT VEILLE-VIVE, 27/09/2026. Cette ligne disait « Dernière relève : 01:31. 56 805
 * messages capturés », ce qui se lit « la passe de 01:31 a capturé 56 805 messages » alors que ce nombre est le TOTAL
 * en base depuis toujours. Et surtout elle ne disait nulle part depuis quand plus aucun mail n'arrivait.
 *
 * « La relève tourne » et « du courrier arrive » sont deux faits INDÉPENDANTS : un dimanche calme donne une passe par
 * minute et pas un mail pendant six heures. Les mêler dans une phrase unique est ce qui a rendu l'écran illisible —
 * on ne pouvait pas distinguer un ordonnanceur mort d'une boîte tranquille, et c'est exactement la confusion qui a
 * fait conclure à tort que « la relève ne fonctionne pas ».
 *
 * ⚠️ « DERNIÈRE RELÈVE » EST L'HEURE DE LA DERNIÈRE PASSE, capturée ou non. Un clic sur « Relever maintenant » n'est
 * pas ce que cette ligne suit : la question à laquelle elle répond est « l'ordonnanceur tourne-t-il ? », et un clic
 * humain y répondrait faussement oui. C'est la même règle que le bandeau de veille, et volontairement la même source.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function messageReleve(r: ReperesEcran, maintenant: Date): string {
  if (r.derniereReleveLe === null) {
    return 'La relève du courrier n’a encore jamais tourné : aucun message n’a été capturé.';
  }
  const passe = `Dernière relève : ${formaterDateFr(r.derniereReleveLe)} (${depuis(r.derniereReleveLe, maintenant)}).`;
  // LE DERNIER MAIL, à part. `undefined`/`null` = on ne sait pas : on se taît plutôt que d'écrire « jamais ».
  const mail = r.dernierMailLe
    ? ` Dernier mail reçu : ${formaterDateFr(r.dernierMailLe)} (${depuis(r.dernierMailLe, maintenant)}).`
    : '';
  if (r.messagesCaptures === 0) return `${passe}${mail} Aucun message en base.`;
  const exclus = r.messagesExclus > 0
    ? `, dont ${r.messagesExclus} tenu${r.messagesExclus > 1 ? 's' : ''} hors de la file par une règle (jamais supprimé${r.messagesExclus > 1 ? 's' : ''})`
    : '';
  // « en base » et non « capturés » : ce nombre est le total de toujours, pas la moisson de la dernière passe.
  return `${passe}${mail} ${r.messagesCaptures} message${r.messagesCaptures > 1 ? 's' : ''} en base${exclus}.`;
}

// ── LOT 5-VEILLE — LA RELÈVE AUTOMATIQUE EST-ELLE EN VIE ? ───────────────────────────────────────────────────────────

/**
 * 🔴 L'INCIDENT QUI A FAIT ÉCRIRE CE BLOC — 25/09/2026. Le rapatriement s'est terminé à 06:32 et rien n'a pris le
 * relais : DIX HEURES sans courrier. Le bandeau affichait pourtant, en gris, « Dernière relève : 25 septembre 2026,
 * 06:32 (il y a 9 h) ». Exact, et parfaitement inutile — il manquait deux choses, et elles se tiennent :
 *   ① aucun SEUIL : le même gris, les mêmes mots, que la dernière passe date de quarante secondes ou de dix heures ;
 *   ② la CADENCE ATTENDUE n'était écrite nulle part. Sans « une par minute », « il y a 9 h » n'a pas d'étalon, et
 *      l'œil le lit comme une décoration.
 *
 * 🔴 LE REPÈRE EST LA DERNIÈRE PASSE AUTOMATIQUE, JAMAIS LE DERNIER MESSAGE CAPTURÉ. Une boîte calme un dimanche ne
 * doit déclencher aucune alerte : ne rien trouver est l'état NORMAL de la relève. Ce qui est anormal, c'est qu'elle
 * ne REGARDE plus — et cela ne se lit que dans le journal des passes.
 *
 * 🔴 L'ÉTAT EST DIT EN MOTS, jamais par la seule couleur : « arrêtée depuis 9 h » se lit en niveaux de gris, sur un
 * écran mal réglé, et par quelqu'un qui distingue mal le rouge du vert.
 */
export type NiveauVeille = 'ok' | 'jamais' | 'arretee' | 'echec' | 'inconnu';

/** Ce que la base sait de la relève AUTOMATIQUE. Les passes manuelles et les rattrapages n'entrent pas ici. */
export interface VeilleReleve {
  /** Fin de la dernière passe automatique TERMINÉE (ISO), ou `null` si aucune n'a jamais tourné. */
  derniereLe: string | null;
  /** Son issue. `null` quand il n'y en a aucune. */
  resultat: 'ok' | 'erreur' | null;
  /** Le motif, quand elle a échoué. */
  erreur: string | null;
  /** Cadence attendue, en secondes — `gestion_config.releve_continue_secondes`, jamais un chiffre en dur. */
  intervalleS: number;
  /** Combien d'intervalles de retard avant de crier — réglage (migration 249), défaut 10. */
  toleranceIntervalles: number;
  /**
   * ══ 🔴 LOT VEILLE-VIVE — QUAND CES VALEURS ONT-ELLES ÉTÉ MESURÉES ? ═════════════════════════════════════════════
   * Absent ⇒ comportement d'avant : on suppose la mesure fraîche.
   *
   * POURQUOI CE CHAMP EXISTE. Le défaut du 27/09/2026 était une horloge vivante comparée à une heure gelée. Le
   * battement le répare — mais il reste un cas où l'heure regèle sans que personne le sache : le battement lui-même
   * échoue (serveur injoignable, session expirée, ordinateur qui sort de veille). L'écran se remettrait alors à
   * vieillir en silence et redirait « arrêtée » par la même mécanique, par une autre porte.
   *
   * On ne peut pas conclure « la relève est arrêtée » à partir d'une mesure qu'on n'a pas pu rafraîchir : on ne sait
   * pas. C'est un état distinct, et le dire ainsi est la seule réponse honnête.
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  mesureLe?: string | null;
}

export interface EtatVeille {
  niveau: NiveauVeille;
  /** La phrase du bandeau. Elle porte l'état À ELLE SEULE. */
  texte: string;
  /** Le geste à faire, ou `null` quand il n'y a rien à faire. */
  aide: string | null;
}

/** Bornes du réglage de tolérance. En deçà de 2 intervalles, un simple tour un peu long crierait au loup. */
export const VEILLE_INTERVALLES_DEFAUT = 10;
export const VEILLE_INTERVALLES_MIN = 2;
export const VEILLE_INTERVALLES_MAX = 500;

/** Ramène la tolérance dans ses bornes. Absente ou aberrante ⇒ le défaut. PUR. */
export function toleranceVeilleValide(brut: number | null | undefined): number {
  if (typeof brut !== 'number' || !Number.isFinite(brut) || brut <= 0) return VEILLE_INTERVALLES_DEFAUT;
  return Math.min(Math.max(Math.round(brut), VEILLE_INTERVALLES_MIN), VEILLE_INTERVALLES_MAX);
}

/** La cadence, dite comme on la dirait à voix haute. « une par minute » vaut mieux que « 60 s ». PUR. */
export function cadence(intervalleS: number): string {
  if (intervalleS === 60) return 'une par minute';
  if (intervalleS < 60) return `une toutes les ${intervalleS} s`;
  const minutes = Math.round(intervalleS / 60);
  return `une toutes les ${minutes} min`;
}

/**
 * Ancienneté FINE : sous la minute, on compte en secondes. `depuis()` dirait « à l'instant », ce qui est vrai mais
 * n'apprend rien — or c'est justement ce chiffre-là qui donne son étalon à la cadence annoncée à côté. PUR.
 */
export function anciennete(iso: string | null, maintenant: Date): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const secondes = Math.floor((maintenant.getTime() - d.getTime()) / 1000);
  if (secondes < 0) return 'à l’instant';
  if (secondes < 60) return `il y a ${secondes} s`;
  return depuis(iso, maintenant);
}

/**
 * UNE DURÉE NUE — « 15 min », « 3 h », « 2 jours » — sans « il y a ». PUR.
 *
 * 🔴 POURQUOI ELLE EXISTE. Le bandeau écrivait « arrêtée depuis ${anciennete(…)} », et `anciennete` rend « il y a
 * 15 min » : l'écran affichait donc « La relève automatique est arrêtée depuis IL Y A 15 MIN ». C'est ce que lisait
 * Arno le 27/09/2026. La phrase a besoin d'une durée, pas d'une ancienneté — deux choses différentes, et les
 * confondre produit du charabia dans la ligne la plus importante de l'écran.
 */
export function duree(iso: string | null, maintenant: Date): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const minutes = Math.floor((maintenant.getTime() - d.getTime()) / 60_000);
  if (minutes < 1) return 'moins d’une minute';
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `${heures} h`;
  const jours = Math.floor(heures / 24);
  if (jours < 31) return `${jours} jour${jours > 1 ? 's' : ''}`;
  return `${Math.floor(jours / 30)} mois`;
}

/** Le geste à faire quand la relève automatique ne tourne plus. Écrit UNE fois : deux formulations dériveraient. */
const AIDE_VEILLE =
  'Le bouton « Relever maintenant » rattrape tout de suite. Pour remettre la relève automatique en route : voir ops/README.md.';

/** Un motif d'échec reste LISIBLE : une trace de pile entière dans un bandeau ne se lit pas. PUR. */
function motifCourt(erreur: string | null): string {
  const m = (erreur ?? '').trim().split('\n')[0];
  if (m === '') return 'motif non enregistré';
  return m.length > 200 ? `${m.slice(0, 200)}…` : m;
}

/**
 * L'ÉTAT DE LA RELÈVE AUTOMATIQUE, en une phrase. PUR — l'instant est injecté, jamais lu dans la fonction.
 *
 * Le seuil naît du RÉGLAGE (`intervalleS × toleranceIntervalles`), jamais d'un nombre écrit ici : le jour où la
 * cadence passera à 30 s, l'alerte suivra sans qu'on touche à ce fichier.
 */
export function etatVeille(v: VeilleReleve, maintenant: Date): EtatVeille {
  const intervalleS = v.intervalleS > 0 ? v.intervalleS : 60;
  const tolerance = toleranceVeilleValide(v.toleranceIntervalles);

  if (v.derniereLe === null || v.resultat === null) {
    return {
      niveau: 'jamais',
      texte: '⚠ La relève automatique n’a encore jamais tourné : le courrier n’arrive pas tout seul dans l’application.',
      aide: AIDE_VEILLE,
    };
  }
  if (v.resultat === 'erreur') {
    return {
      niveau: 'echec',
      texte: `⚠ La dernière relève automatique a échoué à ${dateHeureCourte(v.derniereLe, maintenant)} : ${motifCourt(v.erreur)}`,
      aide: AIDE_VEILLE,
    };
  }
  const seuilMs = intervalleS * tolerance * 1000;
  /**
   * 🔴 AVANT DE CONCLURE, VÉRIFIER QU'ON SAIT. Si la mesure elle-même est plus vieille que le seuil, l'écran n'a pas
   * pu se rafraîchir : il n'a AUCUN moyen de savoir si des passes ont eu lieu depuis. Dire « arrêtée » serait
   * reproduire, par une autre porte, la fausse alerte du 27/09/2026.
   */
  if (v.mesureLe) {
    const mesure = new Date(v.mesureLe).getTime();
    if (!Number.isNaN(mesure) && maintenant.getTime() - mesure > seuilMs) {
      return {
        niveau: 'inconnu',
        texte: `⚠ Impossible de vérifier la relève automatique : cet écran n’a pas pu se mettre à jour depuis `
          + `${duree(v.mesureLe, maintenant)}.`,
        aide: 'Rafraîchissez la page. Si le problème persiste, la connexion au serveur est en cause, pas la relève.',
      };
    }
  }
  const retardMs = maintenant.getTime() - new Date(v.derniereLe).getTime();
  if (retardMs > seuilMs) {
    return {
      niveau: 'arretee',
      // « depuis 15 min », et non « depuis il y a 15 min » : voir `duree`.
      texte: `⚠ La relève automatique est arrêtée depuis ${duree(v.derniereLe, maintenant)}`
        + ' — le courrier arrivé depuis n’est pas dans l’application.',
      aide: AIDE_VEILLE,
    };
  }
  return {
    niveau: 'ok',
    texte: `Relève automatique : dernière passe ${anciennete(v.derniereLe, maintenant)} (${cadence(intervalleS)})`,
    aide: null,
  };
}

/**
 * Pourquoi la FILE DES ÉCHANGES SANS ÉVÉNEMENT est vide — quatre situations, quatre phrases. Aucune ne prétend que
 * tout va bien tant qu'on n'en est pas sûr : tant que la relève n'a pas tourné, l'écran dit qu'il est aveugle.
 *
 * 🔴 AUCUNE NE DIT PLUS « RIEN À CLASSER » (lot STATUT-HORS-GESTION, règle métier ③). Cette file répond à la
 * question de l'ÉVÉNEMENT, qui est FACULTATIF : un échange sans événement n'est pas « à classer », et le dire ici
 * réclamait un travail qui n'existe pas. « À classer » est réservé au STATUT D'UN MAIL — son rattachement à un bien.
 */
export function messageFileVide(r: ReperesEcran): string {
  if (r.derniereReleveLe === null) {
    return 'Aucun échange sans événement : la relève du courrier n’a pas encore été lancée, aucun message n’est donc arrivé jusqu’ici.';
  }
  if (r.messagesCaptures === 0) return 'Aucun échange sans événement : la dernière relève n’a capturé aucun message.';
  if (r.messagesExclus >= r.messagesCaptures) {
    return `Aucun échange sans événement : les ${r.messagesCaptures} messages capturés sont tous tenus hors de la file par une règle. Ils ne sont pas supprimés — éteindre une règle les fait revenir.`;
  }
  return 'Aucun échange sans événement : tous les échanges reçus ont déjà été posés sur un événement ou classés sans suite.';
}

/**
 * Pourquoi la colonne des CARTES est vide. Formulé sans jargon : on décrit le geste, pas le numéro du lot qui
 * l'apportera. 🔴 ET ON DIT QUE C'EST NORMAL : l'événement est FACULTATIF, une colonne vide n'est pas un retard.
 */
export function messageEvenementsVide(): string {
  return 'Aucun événement pour l’instant — ils sont facultatifs. Une carte s’ouvre depuis un échange quand une '
    + 'demande attend une réponse de notre part.';
}

/** « 50 affichés sur 213 » — et rien du tout quand tout est montré (une précision inutile est du bruit). */
export function mentionTroncature(affiches: number, total: number): string | null {
  return total > affiches ? `${affiches} affichés sur ${total}` : null;
}

/**
 * LOT ERGO-BOITE-2 — L'INFO-BULLE DE L'ENTRÉE « À rattacher », qui dit CE QUE LE NOMBRE COMPTE.
 *
 * 🔴 POURQUOI ELLE EXISTE. Le compteur ne montre plus que les mails à trancher (ceux qui ont au moins une
 * proposition). Les mails SANS aucun candidat n'y sont plus — ils ne se règlent pas d'un clic — mais les taire
 * serait les faire disparaître : ils sont bien plus nombreux, et c'est souvent le courrier d'un nouvel
 * interlocuteur. L'info-bulle les nomme donc ici, et l'écran de la file les liste (onglet « Sans candidat »).
 *
 * `null` pour le nombre à trancher = on ne l'a pas encore mesuré : aucune bulle plutôt qu'une phrase inventée.
 */
export function titreARattacher(aTrancher: number | null, sansCandidat: number | null): string | undefined {
  if (aTrancher === null) return undefined;
  const debut = `${aTrancher} mail(s) avec au moins une proposition à trancher`;
  // `0` se dit comme « aucun » : il n'y a alors rien à mentionner, pas une phrase à moitié vide.
  if (sansCandidat === null || sansCandidat <= 0) return debut;
  return `${debut} · ${sansCandidat} sans aucun candidat, à rattacher à la main (onglet « Sans candidat »)`;
}

/**
 * Message d'échec de lecture. Un REFUS n'est pas une PANNE : dire « erreur » là où le vrai motif est « ce compte n'a
 * pas le droit » envoie chercher un bug qui n'existe pas. `0` = aucune réponse HTTP du tout (réseau coupé).
 */
export function messageErreurHttp(statut: number): string {
  if (statut === 403) return 'Accès refusé : ce compte n’a pas le droit « Gestion ».';
  if (statut === 401) return 'Session expirée : reconnectez-vous.';
  if (statut === 0) return 'La lecture a échoué (réseau indisponible). Réessayez dans un instant.';
  if (statut === 503) return 'La base n’a pas répondu. Réessayez dans un instant.';
  return 'La lecture a échoué. Réessayez dans un instant.';
}

/**
 * LOT 4c — TAILLE D'UNE PIÈCE JOINTE, en français et lisible d'un coup d'œil. PURE.
 *
 * Unités décimales (1 ko = 1000 o) : c'est ce qu'affichent le Finder et les boîtes mail, donc ce que l'utilisateur
 * comparera. Une taille absente se DIT (« taille inconnue ») plutôt que de s'afficher « 0 o », qui ferait croire à
 * une pièce vide.
 */
export function formaterTaille(octets: number | null): string {
  if (octets === null || !Number.isFinite(octets) || octets < 0) return 'taille inconnue';
  if (octets < 1000) return `${octets} o`;
  if (octets < 1000 * 1000) return `${(octets / 1000).toFixed(octets < 10_000 ? 1 : 0)} ko`;
  return `${(octets / 1_000_000).toFixed(octets < 10_000_000 ? 1 : 0)} Mo`;
}

/** Qui parle dans un message, du point de vue de l'agence : nous, ou l'autre. Le sens est dit par un MOT. */
export function libelleSens(sens: 'recu' | 'envoye'): string {
  return sens === 'envoye' ? 'nous avons écrit' : 'reçu de';
}

/**
 * LOT 5-DIRECT — L'HORODATAGE FAÇON MESSAGERIE : la date ET l'heure de réception, en heure de Paris.
 *
 * POURQUOI PAS « il y a 3 h » (ce que `depuis` rend, et qui reste utilisé ailleurs) : « il y a 3 h » ne dit pas si un
 * mail est arrivé à 9 h ou à 14 h, et c'est précisément ce qu'on veut savoir d'un courrier professionnel. Toutes les
 * messageries montrent l'heure du jour, la veille en toutes lettres, puis la date.
 *
 *   · aujourd'hui      → « 14:32 »
 *   · hier             → « hier 18:05 »
 *   · cette année      → « 12 sept. 09:14 »
 *   · année différente → « 12 sept. 2025 09:14 »
 *
 * 🔴 TOUJOURS EN HEURE DE PARIS, jamais l'heure du serveur ni celle du navigateur : un même mail doit porter la même
 * heure sur le téléphone d'Arno, sur son Mac et dans un export. `Intl` gère le passage heure d'été / heure d'hiver,
 * y compris pour un message reçu avant un changement d'heure et lu après. PUR (l'instant de référence est injecté).
 */
export const FUSEAU_AFFICHAGE = 'Europe/Paris';

/** Les champs d'une date, lus DANS le fuseau d'affichage — jamais via les getters locaux, qui suivraient la machine. */
function champsParis(d: Date): { annee: number; mois: number; jour: number; heure: string } {
  const p = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU_AFFICHAGE, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const v = (t: string): string => p.find((x) => x.type === t)?.value ?? '';
  return { annee: Number(v('year')), mois: Number(v('month')), jour: Number(v('day')), heure: `${v('hour')}:${v('minute')}` };
}

/** Le jour calendaire d'une date, en heure de Paris, sous forme comparable. PUR. */
function jourParis(d: Date): number {
  const c = champsParis(d);
  return c.annee * 10000 + c.mois * 100 + c.jour;
}

/**
 * Date et heure de réception, façon messagerie. `iso` absent ou illisible → « — » (jamais une date inventée). PUR.
 */
export function dateHeureCourte(iso: string | null | undefined, maintenant: Date): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';

  const c = champsParis(d);
  const jour = jourParis(d);
  const aujourdhui = jourParis(maintenant);
  // « hier » se calcule sur le CALENDRIER de Paris, pas en retirant 24 h : la nuit du changement d'heure dure 23 ou
  //   25 heures, et un décompte en heures ferait alors mentir le mot.
  const veille = jourParis(new Date(maintenant.getTime() - 86_400_000));

  if (jour === aujourdhui) return c.heure;
  if (jour === veille) return `hier ${c.heure}`;

  const moisCourt = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, month: 'short' }).format(d);
  const annee = c.annee === champsParis(maintenant).annee ? '' : ` ${c.annee}`;
  return `${c.jour} ${moisCourt}${annee} ${c.heure}`;
}

/**
 * ══ 🔴 LOT RECAP-SANS-DOUBLON — UNE DATE COURTE MAIS ABSOLUE : « 30/09 à 17:49 ». PUR. ═══════════════════════════
 *
 * ⚠️ POURQUOI PAS `dateHeureCourte`, QUI EXISTE JUSTE AU-DESSUS. Parce qu'elle est RELATIVE : elle rend « 17:49 »
 * pour aujourd'hui et « hier 17:49 » pour la veille. C'est exactement ce qu'il faut sur une ligne de courrier —
 * et exactement ce qu'il ne faut pas ici.
 *
 * Cette forme-ci sert aux renvois « aussi envoyée le 30/09 à 17:49 », posés sous une pièce qui apparaît PLUSIEURS
 * fois dans une conversation. Leur seul travail est de dire LAQUELLE des autres apparitions : trois renvois qui
 * diraient tous « 17:49 » ne distingueraient rien, et « hier » obligerait à savoir quel jour on est.
 *
 * ⚠️ L'ANNÉE N'Y EST PAS, et c'est assumé : ces renvois vivent DANS une conversation, dont les messages portent
 * déjà leur date complète. L'infobulle de la ligne, elle, donne la date entière (`dateHeureComplete`).
 */
export function dateJourEtHeure(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const c = champsParis(d);
  return `${String(c.jour).padStart(2, '0')}/${String(c.mois).padStart(2, '0')} à ${c.heure}`;
}

/**
 * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 3 — L'HEURE SEULE, EN HEURE DE PARIS ══════════════════════════════════════
 *
 * Arno : un badge « Mis à jour par Monga · <heure> ».
 *
 * 🔴 DÉFAUT MESURÉ À L'ÉCRAN AVANT D'ÉCRIRE CETTE FONCTION : la vignette découpait l'heure dans la chaîne ISO
 * (`iso.slice(11, 16)`). La route rend l'heure en UTC ; le badge affichait donc **17:28** pour une écriture faite
 * à **19:28**. Deux heures d'écart, et rien à l'écran pour s'en apercevoir.
 *
 * 🔴 TOUJOURS EN HEURE DE PARIS, jamais celle du navigateur : c'est la règle de ce fichier (voir
 * `FUSEAU_AFFICHAGE`), et elle vaut ici autant qu'ailleurs — un même événement doit porter la même heure sur le
 * téléphone d'Arno, sur son Mac et dans un export.
 */
export function heureParis(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return champsParis(d).heure;
}

/** Date complète et heure, pour une infobulle ou un en-tête de message. Toujours en heure de Paris. PUR. */
export function dateHeureComplete(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU_AFFICHAGE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(d).replace(' à ', ' à ');
}

/**
 * LOT 5-FUSION-B — LE MOT DU GESTE D'AFFECTATION, une seule fois dans tout le module. Décision d'Arno du 24/09/2026 :
 * « Classer dans une carte » remplace « Affecter » PARTOUT — écran partagé, plein écran, et menu « ⋯ » d'un échange.
 *
 * 🔒 SEUL LE MOT CHANGE : même bouton, même route `/api/admin/gestion/fils/[id]/affectation`, même journal, même
 * réversibilité (« Détacher l'échange » le défait). Deux mots pour un même geste font douter qu'il s'agisse du même
 * geste — et c'est ce doute qui fait cliquer deux fois, ou pas du tout.
 *
 * ⚠️ IL VIT ICI, dans le module PUR de l'écran, et non dans `GestionVue` : la vue conversation en a besoin, et
 * `GestionVue` importe déjà la vue conversation. L'inverse aurait créé un cycle d'imports — le défaut qui se
 * manifeste par un composant « undefined » au premier rendu, longtemps après le commit (cf. `gestesMail.tsx`).
 */
export const LIBELLE_CLASSER = 'Classer dans une carte';

/**
 * LOT 5-GMAIL — LA PHRASE DE DESCRIPTION DU MODULE, une seule fois. Elle s'affiche en toutes lettres sous le titre
 * dans l'écran partagé (`EnTetePage`), et dans une info-bulle CLIQUABLE quand le plein écran compacte l'en-tête.
 *
 * ⚠️ Elle vit ICI et non dans la page : deux copies de la même phrase divergent au premier mot changé, et c'est
 * toujours celle qu'on lit le moins qui garde l'ancienne version.
 */
export const INTRO_GESTION =
  /**
   * 🔴 LOT STATUT-HORS-GESTION — TEXTE DICTÉ PAR ARNO, MOT POUR MOT (28/09/2026).
   *
   * L'ancienne phrase disait « à gauche les échanges À CLASSER » : elle assimilait « pas encore posé sur un
   * événement » à « à classer », ce qui est précisément la confusion que ces deux lots suppriment. La colonne de
   * gauche n'est d'ailleurs plus une file d'échanges mais la BOÎTE DE RÉCEPTION, et l'événement y est dit
   * FACULTATIF en toutes lettres.
   */
  'Courrier de gestion locative : à gauche la boîte de réception de gestion@criterimmo.fr, où chaque mail est '
  + 'rattaché à un ou plusieurs biens, ou marqué hors gestion ; à droite les événements (facultatifs), '
  + 'c’est-à-dire les demandes qui attendent une réponse de notre part.';

/**
 * LOT 5-FIDÈLE — L'HEURE D'UN MESSAGE, ÉCRITE COMME GMAIL L'ÉCRIT.
 *
 * Trois formes, et Gmail choisit selon l'ancienneté — c'est ce que l'équipe lit toute la journée :
 *   · aujourd'hui  → « 19:07 (il y a 3 heures) » — l'heure exacte, et depuis combien de temps ;
 *   · hier         → « hier 17:24 » ;
 *   · avant        → « 22 sept. 18:44 » (l'année n'apparaît que si ce n'est pas la nôtre).
 *
 * ⚠️ Le « il y a … » n'est mis QUE sur le jour même : au-delà, Gmail donne la date, parce que « il y a 6 jours » ne
 * dit pas si c'était lundi ou mardi. Toujours en heure de Paris (cf. `FUSEAU_AFFICHAGE`). PUR.
 */
export function heureGmail(iso: string | null | undefined, maintenant: Date): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const c = champsParis(d);
  const jour = jourParis(d);
  const aujourdhui = jourParis(maintenant);
  const veille = jourParis(new Date(maintenant.getTime() - 86_400_000));

  if (jour === aujourdhui) {
    const ecoule = maintenant.getTime() - d.getTime();
    return `${c.heure} (${depuisCourt(ecoule)})`;
  }
  if (jour === veille) return `hier ${c.heure}`;
  const moisCourt = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, month: 'short' }).format(d);
  const annee = c.annee === champsParis(maintenant).annee ? '' : ` ${c.annee}`;
  return `${c.jour} ${moisCourt}${annee} ${c.heure}`;
}

/** « il y a 3 heures », « il y a 12 minutes », « à l'instant ». Uniquement pour le jour même. PUR. */
function depuisCourt(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} minute${minutes > 1 ? 's' : ''}`;
  const heures = Math.floor(minutes / 60);
  return `il y a ${heures} heure${heures > 1 ? 's' : ''}`;
}
