/**
 * CORRECTIF DU 24/09/2026 — DIRE LA VRAIE RAISON. Module PUR, zéro import : il ne fait que lire une erreur et en
 * écrire une phrase.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI CE FICHIER EXISTE. Arno a envoyé son premier vrai message. L'écran lui a répondu « Envoi impossible : une
 * erreur interne est survenue. Le brouillon est conservé. » — et le mail était PARTI. Deux fautes distinctes, et
 * celle-ci est la seconde : une phrase qui n'apprend rien. « Erreur interne » ne dit ni quoi faire, ni à qui en parler,
 * ni si c'est grave. Elle transforme une panne identifiable en mystère, et elle fait recommencer un geste qui a
 * peut-être déjà abouti.
 *
 * LA RÈGLE POSÉE PAR ARNO : un échec doit dire la VRAIE raison, en français clair, quand elle est connue. Le détail
 * technique — le code, la contrainte, la pile — va dans le journal du serveur, jamais à l'écran.
 *
 * 🔒 CE QUI NE SORT JAMAIS À L'ÉCRAN : le texte brut renvoyé par PostgreSQL ou par Google. Il peut contenir une
 * requête, une adresse, un fragment de jeton. On n'en garde que le CODE, et on écrit la phrase nous-mêmes.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce qu'on retient d'une erreur : une phrase pour l'écran, et une étiquette courte pour le journal du serveur. */
export interface MotifLisible {
  /** La phrase montrée à Arno. Toujours en français, toujours actionnable, jamais un code. */
  phrase: string;
  /** L'étiquette technique, pour le journal du serveur UNIQUEMENT. */
  etiquette: string;
}

/** Le code `pg` d'une erreur PostgreSQL, quand c'en est une. `pg` le pose en `code`, sur cinq caractères. */
function codePostgres(e: unknown): string | null {
  if (typeof e !== 'object' || e === null) return null;
  const c = (e as { code?: unknown }).code;
  return typeof c === 'string' && /^[0-9A-Z]{5}$/.test(c) ? c : null;
}

/** Le nom de la contrainte violée, quand PostgreSQL le donne. Sert la phrase : « quelle » règle a refusé. */
function contrainte(e: unknown): string | null {
  if (typeof e !== 'object' || e === null) return null;
  const c = (e as { constraint?: unknown }).constraint;
  return typeof c === 'string' && c.trim() !== '' ? c.trim() : null;
}

function message(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === 'string' ? e : '';
}

/**
 * TRADUIT une erreur en une phrase que quelqu'un qui n'écrit pas de code peut lire, et sur laquelle il peut agir.
 *
 * Les cas listés ne sont pas une collection exhaustive de codes PostgreSQL : ce sont ceux qui ont une CONDUITE À TENIR
 * différente. Deux erreurs qui appellent le même geste n'ont pas besoin de deux phrases.
 */
export function motifLisible(e: unknown): MotifLisible {
  const code = codePostgres(e);
  const nom = contrainte(e);

  // Une écriture refusée par une RÈGLE de la table. C'est exactement ce qui est arrivé le 23/09 au soir : le journal
  //   n'acceptait pas le mot « envoi ». Le geste à faire est d'appliquer la mise à jour de base qui manque.
  if (code === '23514') {
    return {
      phrase: 'La base a refusé une écriture : une valeur n’entre pas dans ce que la table autorise'
        + `${nom ? ` (règle ${nom})` : ''}. Une mise à jour de la base reste probablement à appliquer.`,
      etiquette: `postgres 23514${nom ? ` ${nom}` : ''}`,
    };
  }
  // Une table ou une colonne absente : c'est toujours une migration non appliquée, jamais une panne.
  if (code === '42P01' || code === '42703') {
    return {
      phrase: 'Une mise à jour de la base n’a pas été appliquée : une table ou une colonne attendue n’existe pas.',
      etiquette: `postgres ${code}`,
    };
  }
  if (code === '23505') {
    return {
      phrase: 'Cet envoi a déjà été enregistré : rien n’a été envoyé une seconde fois.',
      etiquette: `postgres 23505${nom ? ` ${nom}` : ''}`,
    };
  }
  if (code === '23502' || code === '23503') {
    return {
      phrase: 'La base a refusé une écriture : une information obligatoire manque'
        + `${nom ? ` (règle ${nom})` : ''}.`,
      etiquette: `postgres ${code}${nom ? ` ${nom}` : ''}`,
    };
  }
  // Base injoignable, arrêtée, saturée : ce n'est pas la faute de ce qu'on a écrit. On le dit, et on invite à réessayer.
  if (code === '57P01' || code === '57P02' || code === '57P03' || code === '53300' || code === '08006' || code === '08003') {
    return { phrase: 'La base de données n’a pas répondu. Le message n’est pas parti : réessaie dans un instant.',
      etiquette: `postgres ${code}` };
  }
  if (code === '57014' || code === '55P03') {
    return { phrase: 'La base a mis trop longtemps à répondre. Le message n’est pas parti : réessaie dans un instant.',
      etiquette: `postgres ${code}` };
  }
  if (code !== null) {
    return { phrase: `La base de données a refusé l’opération (code ${code}).`, etiquette: `postgres ${code}` };
  }

  // Le réseau. `fetch` échoue avec des messages différents selon la plateforme ; ce qu'il faut dire est le même.
  const m = message(e);
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|fetch failed|network|socket hang up/i.test(m)) {
    return { phrase: 'Le service n’a pas pu être joint (réseau). Réessaie dans un instant.', etiquette: 'reseau' };
  }
  if (/abort|timeout/i.test(m)) {
    return { phrase: 'L’opération a été interrompue avant d’aboutir. Réessaie dans un instant.', etiquette: 'interrompu' };
  }

  // Vraiment inconnue. On le dit TEL QUEL — « inattendue » est honnête, « interne » ne l'était pas : ça sous-entendait
  //   qu'on savait de quoi il s'agissait.
  return {
    phrase: 'Une erreur inattendue est survenue. Elle est consignée dans le journal du serveur : signale-la.',
    etiquette: 'inconnue',
  };
}

/**
 * LA PHRASE D'UN ENVOI QUI A ÉCHOUÉ, brouillon conservé. On ne dit « le brouillon est conservé » QUE quand c'est vrai —
 * c'est-à-dire quand rien n'est parti.
 */
export function phraseEchecEnvoi(e: unknown): MotifLisible {
  const m = motifLisible(e);
  return { phrase: `Envoi impossible : ${minusculeInitiale(m.phrase)} Le brouillon est conservé.`, etiquette: m.etiquette };
}

/** « La base… » → « la base… ». On ne met pas une majuscule au milieu d'une phrase. */
function minusculeInitiale(s: string): string {
  if (s === '') return s;
  // Un mot ENTIÈREMENT en capitales est un sigle : on n'y touche pas.
  const premier = s.split(' ')[0];
  if (premier === premier.toUpperCase() && premier.length > 1) return s;
  return s[0].toLowerCase() + s.slice(1);
}
