/**
 * MODULE « GESTION » — LOT 0-bis : TYPOLOGIE du flux. Module PUR (aucune I/O, aucun réseau, aucune base).
 *
 * POURQUOI : la sonde du lot 0 a montré 5 490 messages sur 90 jours, dont 69 % ÉMIS par la boîte de gestion — soit une
 * quarantaine d'envois par jour. Si ce sont de vraies réponses écrites à la main, la file de travail est saine ; si ce
 * sont des envois de logiciel (quittances, avis d'échéance, notifications), elle serait NOYÉE dès le premier jour. Ce
 * module mesure la différence, et surtout il ÉNONCE SA RÈGLE pour qu'elle soit jugeable plutôt que crue.
 *
 * 🔒 ANONYMISATION — règle de conception de tout ce fichier : aucune fonction ne renvoie jamais l'adresse complète d'une
 * personne ni un nom propre. Les adresses sont réduites à leur DOMAINE, les objets sont normalisés puis soumis à un seuil
 * d'occurrences. Les destinataires sont COMPTÉS, jamais rendus.
 */

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 1) Signaux d'automatisme
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * EN-TÊTES qui trahissent un envoi produit par un logiciel. Liste EXPLICITE et COMMENTÉE : c'est elle qu'on affiche dans le
 * rapport, pour que la règle se juge sur pièces.
 *
 * ⚠️ NE FIGURENT PAS ICI, VOLONTAIREMENT, les en-têtes de REDIRECTION (Delivered-To, X-Forwarded-For…) : la sonde a montré
 * qu'ILS SONT SUR 100 % DES MESSAGES — c'est la recopie vers la boîte relue qui les pose, pas l'expéditeur. Les compter
 * comme un signal d'automatisme classerait TOUT le flux « automatique » et rendrait la mesure inutile.
 */
export const ENTETES_AUTOMATISME: ReadonlyArray<{ entete: string; description: string }> = [
  { entete: 'auto-submitted', description: 'envoi déclaré automatique par son émetteur (RFC 3834), hors valeur « no »' },
  { entete: 'list-unsubscribe', description: 'lien de désabonnement : diffusion de masse ou notification de plateforme' },
  { entete: 'list-id', description: 'le message appartient à une liste de diffusion' },
  { entete: 'precedence', description: 'priorité « bulk », « list », « junk » ou « auto_reply »' },
  { entete: 'x-auto-response-suppress', description: 'demande de ne pas répondre automatiquement : posé par les serveurs d’envoi en masse' },
  { entete: 'feedback-id', description: 'identifiant de campagne (routeurs d’e-mail transactionnel)' },
  { entete: 'x-campaign-id', description: 'identifiant de campagne' },
  { entete: 'x-mailer', description: 'un logiciel se nomme lui-même comme émetteur' },
];

/** Valeurs de `Precedence` qui comptent comme un automatisme (« normal » n'en est pas une). */
const PRECEDENCE_AUTOMATIQUE = new Set(['bulk', 'list', 'junk', 'auto_reply']);

/** Parties locales d'adresse qui annoncent qu'on ne peut pas répondre — donc qu'aucun humain n'est au bout. */
const PARTIES_SANS_REPONSE = [
  'no-reply', 'noreply', 'no_reply', 'donotreply', 'do-not-reply', 'ne-pas-repondre', 'nepasrepondre',
  'ne_pas_repondre', 'notification', 'notifications', 'mailer-daemon', 'postmaster', 'bounce', 'bounces', 'mailing',
];

/** Lit un en-tête sans se soucier de la casse de son nom. PUR. */
function entete(entetes: Record<string, string>, nom: string): string | undefined {
  for (const [k, v] of Object.entries(entetes)) if (k.toLowerCase() === nom) return v;
  return undefined;
}

/**
 * Les en-têtes d'automatisme RÉELLEMENT présents, par leur nom. `auto-submitted: no` et `precedence: normal` ne comptent
 * pas (ce sont des déclarations de NON-automatisme). PUR.
 */
export function signauxAutomatisme(entetes: Record<string, string>): string[] {
  const trouves: string[] = [];
  for (const { entete: nom } of ENTETES_AUTOMATISME) {
    const valeur = entete(entetes, nom);
    if (valeur === undefined) continue;
    const v = valeur.trim().toLowerCase();
    if (nom === 'auto-submitted' && (v === '' || v === 'no')) continue;
    if (nom === 'precedence' && !PRECEDENCE_AUTOMATIQUE.has(v)) continue;
    if (v === '') continue;
    trouves.push(nom);
  }
  return trouves;
}

/** L'adresse annonce-t-elle qu'aucun humain ne lit les réponses ? Comparaison sur la PARTIE LOCALE seule. PUR. */
export function estAdresseSansReponse(adresse: string): boolean {
  const at = adresse.lastIndexOf('@');
  const locale = (at === -1 ? adresse : adresse.slice(0, at)).trim().toLowerCase();
  return PARTIES_SANS_REPONSE.some((p) => locale === p || locale.startsWith(`${p}+`) || locale.startsWith(`${p}-`) || locale.includes(p));
}

export interface IndiceAutomatisme { automatique: boolean; motifs: string[] }

/**
 * INDICE « probablement automatique / probablement humain ». Deux familles de faits SEULEMENT — ni l'objet, ni le corps, ni
 * les pièces jointes n'entrent dans ce jugement (ils diraient ce qu'on veut leur faire dire) :
 *   ① un en-tête d'automatisme est présent (`ENTETES_AUTOMATISME`) ;
 *   ② l'expéditeur est une adresse sans réponse.
 * Aucun des deux → « probablement humain ». La règle est rendue en clair par `REGLE_AUTOMATISME`, avec ses limites. PUR.
 */
export function indiceAutomatisme(deAdresse: string, entetes: Record<string, string>): IndiceAutomatisme {
  const motifs = signauxAutomatisme(entetes);
  if (estAdresseSansReponse(deAdresse)) motifs.push('adresse sans réponse');
  return { automatique: motifs.length > 0, motifs };
}

/** La règle, écrite pour être LUE et JUGÉE — limites comprises. Rendue telle quelle dans le rapport. */
export const REGLE_AUTOMATISME: readonly string[] = [
  'Un message est dit « probablement AUTOMATIQUE » si AU MOINS UN de ces deux faits est vrai :',
  '  ① il porte l’un de ces en-têtes (un logiciel s’y déclare) :',
  ...ENTETES_AUTOMATISME.map(({ entete: n, description }) => `       ${n.padEnd(26, ' ')} ${description}`),
  '  ② son expéditeur est une adresse sans réponse (no-reply, ne-pas-repondre, notification, mailer-daemon…).',
  'Sinon il est dit « probablement HUMAIN ». RIEN D’AUTRE n’entre dans ce jugement : ni l’objet, ni le corps,',
  'ni les pièces jointes — ils diraient ce qu’on voudrait leur faire dire.',
  '',
  '⚠ DEUX LIMITES CONNUES, à garder en tête en lisant les chiffres :',
  '  · un logiciel de gérance qui n’ajoute AUCUN en-tête et écrit depuis l’adresse normale passera pour HUMAIN',
  '    (la vraie part d’automatique est donc un PLANCHER, jamais un plafond) ;',
  '  · une réponse d’absence automatique porte un In-Reply-To comme une vraie réponse : la ligne « réponses »',
  '    ci-dessus ne prouve pas à elle seule qu’un humain a écrit.',
  '',
  '⚠ Les en-têtes de REDIRECTION (Delivered-To, X-Forwarded-For) ne comptent PAS : la sonde les a trouvés sur',
  '  100 % des messages — c’est la recopie vers la boîte relue qui les pose, pas l’expéditeur.',
];

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 2) Destinataires (COMPTÉS, jamais rendus)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Toute suite qui ressemble à une adresse e-mail dans un texte libre. */
const MOTIF_ADRESSE = /[^\s<>,;:"()[\]]+@[^\s<>,;:"()[\]]+/g;

/**
 * Adresses DISTINCTES des en-têtes `To` + `Cc`. ⚠️ Sert UNIQUEMENT à COMPTER (« combien de destinataires ? ») : la valeur
 * de retour ne doit JAMAIS être affichée — c'est la règle d'anonymisation du lot. Lecture tolérante (un nom affiché peut
 * contenir une virgule) : on extrait les jetons en forme d'adresse plutôt que de découper sur la virgule. PUR.
 */
export function destinatairesDe(entetes: Record<string, string>): string[] {
  const brut = `${entete(entetes, 'to') ?? ''} , ${entete(entetes, 'cc') ?? ''}`;
  return [...new Set((brut.match(MOTIF_ADRESSE) ?? []).map((a) => a.trim().toLowerCase()))];
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 3) Normalisation d'un objet (le cœur de l'anonymisation)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const MOIS = 'janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre';
/** Longueur maximale d'un objet affiché : au-delà, la queue porte le détail, donc le risque d'identité. */
const LONGUEUR_OBJET_MAX = 70;

/**
 * NORMALISE un objet pour en faire un GABARIT comparable et anonyme. Étapes, dans cet ordre (chacune compte) :
 *   1. préfixes de réponse/transfert retirés EN CASCADE (« Re: TR: Re: » → rien) → un échange entier tombe dans UN gabarit ;
 *   2. COUPE à la première séparation ( — – | / : - entourés d'espaces) : en courrier de gérance, le gabarit est en tête
 *      (« Quittance de loyer ») et l'IDENTITÉ est dans la queue (« — Mme Martin, 53 av. des Ternes ») ;
 *   3. adresses e-mail → `<adresse>` ;
 *   4. civilité suivie de mots capitalisés → `<nom>` (le motif dominant du français : « M. Durand », « Madame Martin ») ;
 *   5. dates (chiffrées ou « mois AAAA ») → `<date>` ; montants → `<montant>` ; références alphanumériques → `<ref>` ;
 *   6. tout reste de chiffres → `<n>` ;
 *   7. tronqué à 70 caractères.
 * Un objet vide devient « (sans objet) ». PUR — et c'est la SEULE porte par laquelle un objet peut atteindre le rapport.
 */
export function normaliserObjet(objet: string | null | undefined): string {
  let s = (objet ?? '').replace(/\s+/g, ' ').trim();
  if (s === '') return '(sans objet)';

  // 1) préfixes en cascade
  for (let avant = ''; avant !== s;) {
    avant = s;
    s = s.replace(/^(?:re|r[ée]p(?:onse)?|fwd?|tr|transf(?:ert)?)\s*(?:\[\d+\])?\s*:\s*/i, '');
  }
  // 2) coupe à la première séparation (la queue porte l'identité)
  const sep = s.search(/\s+[—–|/:-]\s+/);
  if (sep > 0) s = s.slice(0, sep);

  // 3→5) jetons, du plus spécifique au plus général
  s = s.replace(MOTIF_ADRESSE, '<adresse>');
  s = s.replace(/\b(?:M\.|Mme\.?|Mlle\.?|Monsieur|Madame|Mademoiselle|Dr\.?|Me\.?)\s+(?:[A-ZÀ-ÞŒ][\p{L}'’-]*\s*){1,3}/gu, '<nom> ');
  s = s.replace(new RegExp(`\\b(?:${MOIS})\\s+\\d{4}\\b`, 'gi'), '<date>');
  s = s.replace(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, '<date>');
  s = s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '<date>');
  // ⚠️ pas de `\b` après la devise : « € » n'est pas un caractère de mot, une frontière y est impossible (le montant
  //   passerait alors à travers, et « 1 250,50 » finirait en « <n> <n>,<n> » — lisible, mais plus un gabarit).
  s = s.replace(/\b\d[\d\s.,]*\s*(?:€|eur\b|euros?\b)/gi, '<montant>');
  s = s.replace(/\b[A-Z]{2,}[-_ ]?\d{2,}[A-Z\d-]*\b/g, '<ref>');
  // 6) tout reste de chiffres
  s = s.replace(/\d+/g, '<n>');

  s = s.replace(/\s+/g, ' ').trim();
  if (s === '') return '(sans objet)';
  return s.length > LONGUEUR_OBJET_MAX ? `${s.slice(0, LONGUEUR_OBJET_MAX).trimEnd()}…` : s;
}

/** La règle d'anonymisation, écrite pour être LUE — c'est ce qui autorise à afficher des objets. */
export const REGLE_ANONYMISATION: readonly string[] = [
  'Ce rapport ne montre JAMAIS : le nom d’une personne, une adresse e-mail complète, un numéro, un montant,',
  'le corps d’un message, ni le nom d’un fichier joint. Ce qu’il montre est obtenu ainsi :',
  '  · les EXPÉDITEURS sont réduits à leur DOMAINE (« orange.fr »), jamais l’adresse ;',
  '  · les DESTINATAIRES sont seulement COMPTÉS — aucune adresse ne sort de la mesure ;',
  '  · les OBJETS sont NORMALISÉS en gabarits : préfixes « Re:/TR: » retirés, coupe à la première séparation',
  '    (« — », « : », « | »… : en gérance le gabarit est en tête, l’identité dans la queue), civilité + nom',
  '    remplacés par <nom>, adresses par <adresse>, dates par <date>, montants par <montant>, références par',
  '    <ref>, chiffres restants par <n>, et le tout tronqué à 70 caractères ;',
  '  · un gabarit n’est AFFICHÉ que s’il revient AU MOINS 3 FOIS. Un objet vu une ou deux fois est propre à une',
  '    situation, donc à une personne : il est compté mais jamais montré.',
];

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 4) Palmarès sous seuil d'occurrences (k-anonymat)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface LignePalmares { valeur: string; nb: number }
export interface Palmares {
  lignes: LignePalmares[];   // les plus fréquentes, au-dessus du seuil
  masquees: number;          // nombre de valeurs DISTINCTES écartées par le seuil
  masqueesOccurrences: number; // nombre de messages qu'elles représentent
  restantes: number;         // valeurs au-dessus du seuil mais hors du top affiché
}

/** Seuil d'affichage par défaut : une valeur vue moins de 3 fois est propre à une situation, donc potentiellement à une personne. */
export const SEUIL_AFFICHAGE_DEFAUT = 3;

/**
 * Palmarès des valeurs les plus fréquentes, SOUS SEUIL D'OCCURRENCES (k-anonymat). Ce qui passe sous le seuil n'est pas
 * perdu : il est compté et annoncé (« N valeurs vues moins de 3 fois »), simplement jamais montré. Tri par fréquence
 * décroissante puis alphabétique (déterministe → deux passes donnent le même rapport). PUR.
 */
export function palmares(valeurs: readonly string[], max = 15, seuil = SEUIL_AFFICHAGE_DEFAUT): Palmares {
  const comptes = new Map<string, number>();
  for (const v of valeurs) comptes.set(v, (comptes.get(v) ?? 0) + 1);

  let masquees = 0, masqueesOccurrences = 0;
  const visibles: LignePalmares[] = [];
  for (const [valeur, nb] of comptes) {
    if (nb < seuil) { masquees += 1; masqueesOccurrences += nb; continue; }
    visibles.push({ valeur, nb });
  }
  visibles.sort((a, b) => b.nb - a.nb || a.valeur.localeCompare(b.valeur));
  return { lignes: visibles.slice(0, max), masquees, masqueesOccurrences, restantes: Math.max(0, visibles.length - max) };
}
