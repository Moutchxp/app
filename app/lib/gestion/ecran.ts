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
}

/**
 * BANDEAU D'ÉTAT : ce que le module sait de lui-même, dit en une phrase. Toujours affiché, y compris quand tout va bien —
 * un outil qui dit depuis quand il n'a pas regardé reste honnête, alors qu'un outil muet laisse confondre « rien n'est
 * arrivé » et « on n'a pas relevé depuis dix jours ».
 */
export function messageReleve(r: ReperesEcran, maintenant: Date): string {
  if (r.derniereReleveLe === null) {
    return 'La relève du courrier n’a encore jamais tourné : aucun message n’a été capturé.';
  }
  const quand = `${formaterDateFr(r.derniereReleveLe)} (${depuis(r.derniereReleveLe, maintenant)})`;
  if (r.messagesCaptures === 0) return `Dernière relève : ${quand}. Elle n’a capturé aucun message.`;
  const exclus = r.messagesExclus > 0
    ? `, dont ${r.messagesExclus} tenu${r.messagesExclus > 1 ? 's' : ''} hors de la file par une règle (jamais supprimé${r.messagesExclus > 1 ? 's' : ''})`
    : '';
  return `Dernière relève : ${quand}. ${r.messagesCaptures} message${r.messagesCaptures > 1 ? 's' : ''} capturé${r.messagesCaptures > 1 ? 's' : ''}${exclus}.`;
}

/**
 * Pourquoi la FILE est vide — quatre situations, quatre phrases. Aucune ne prétend que tout va bien tant qu'on n'en est
 * pas sûr : tant que la relève n'a pas tourné, l'écran dit qu'il est aveugle.
 */
export function messageFileVide(r: ReperesEcran): string {
  if (r.derniereReleveLe === null) {
    return 'Rien à classer : la relève du courrier n’a pas encore été lancée, aucun message n’est donc arrivé jusqu’ici.';
  }
  if (r.messagesCaptures === 0) return 'Rien à classer : la dernière relève n’a capturé aucun message.';
  if (r.messagesExclus >= r.messagesCaptures) {
    return `Rien à classer : les ${r.messagesCaptures} messages capturés sont tous tenus hors de la file par une règle. Ils ne sont pas supprimés — éteindre une règle les fait revenir.`;
  }
  return 'Rien à classer : tous les échanges reçus ont déjà été affectés à un événement ou classés sans suite.';
}

/** Pourquoi la colonne des CARTES est vide. Formulé sans jargon : on décrit le geste, pas le numéro du lot qui l'apportera. */
export function messageEvenementsVide(): string {
  return 'Aucun événement pour l’instant. Une carte s’ouvrira depuis un échange de la file.';
}

/** « 50 affichés sur 213 » — et rien du tout quand tout est montré (une précision inutile est du bruit). */
export function mentionTroncature(affiches: number, total: number): string | null {
  return total > affiches ? `${affiches} affichés sur ${total}` : null;
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
