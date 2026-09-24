/**
 * LOT 5e — PRÉPARER UN MESSAGE À ÉCRIRE. Module PUR : aucun import, aucune base, aucun React, aucun réseau.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUI SE JOUE ICI. « Répondre à tous » est le geste le plus dangereux d'une messagerie : une adresse oubliée et la
 * réponse n'arrive pas ; une adresse de trop et un locataire lit ce qu'on écrivait à l'artisan. Ce fichier décide QUI
 * reçoit quoi, et il le fait sans base, sans réseau et sans écran — donc il s'éprouve entièrement.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * TROIS RÈGLES QUI NE SE NÉGOCIENT PAS :
 *   ① `gestion@criterimmo.fr` ne se répond JAMAIS à elle-même — sans quoi chaque réponse à tous se renvoie une copie,
 *      la relève la recapture, et le fil se dédouble ;
 *   ② un destinataire n'apparaît qu'UNE fois, et jamais à la fois en À et en Cc ;
 *   ③ quand les destinataires d'origine ne sont PAS détaillés (message capturé avant la migration 235, colonnes NULL),
 *      on le DIT en clair au lieu de deviner. Une liste inventée qui a l'air juste est pire qu'une liste annoncée
 *      incertaine : personne ne la relit.
 */

/** Par quel geste on arrive à l'écran de rédaction. */
export type VoieRedaction = 'repondre' | 'repondre_tous' | 'transferer' | 'nouveau';

/** Une adresse telle que la base la rend (migration 235). `nom` peut manquer. */
export interface AdresseAffichee { adresse: string; nom?: string | null }

/** Ce qu'on sait du message auquel on répond. Volontairement minimal : ce module ne connaît pas la base. */
export interface MessageOrigine {
  messageId: number;
  de: string;
  deNom?: string | null;
  objet?: string | null;
  recuLe?: string | null;
  corps?: string | null;
  /** Destinataires SÉPARÉS (migration 235). `null` = jamais analysés — ce n'est PAS une liste vide. */
  destA?: AdresseAffichee[] | null;
  destCc?: AdresseAffichee[] | null;
  destReplyTo?: AdresseAffichee[] | null;
  /** La liste FONDUE d'avant (À et Cc mêlés), seul repli quand le détail est inconnu. */
  destinatairesFondus?: string | null;
}

export interface ContexteRedaction {
  /** Notre propre adresse : elle ne figure jamais dans les destinataires d'une réponse. */
  adresseGestion: string;
  /** Signature à insérer, DÉJÀ en texte. Chaîne vide = pas de signature (connexion Google absente). */
  signature?: string;
}

export interface Brouillon {
  voie: VoieRedaction;
  a: string[];
  cc: string[];
  cci: string[];
  objet: string;
  /** Ce que la personne écrit. Pré-rempli de la seule signature, curseur au-dessus. */
  corps: string;
  /** Le message d'origine, cité, REPLIÉ à l'écran. `null` pour un nouveau message. */
  citation: string | null;
  /**
   * 🔴 Les destinataires d'origine n'étaient pas détaillés : la liste proposée est une APPROXIMATION, et l'écran doit
   * le dire avant qu'on envoie. Voir la règle ③.
   */
  destinatairesApproximatifs: boolean;
  /** L'échange visé, pour rester dans le bon fil. `null` = nouveau message hors de tout fil. */
  filId: number | null;
  /** Le message auquel on répond, pour In-Reply-To / References. `null` = nouveau message. */
  repondALeMessageId: number | null;
}

// ── Adresses ──────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Une adresse acceptable. VOLONTAIREMENT SIMPLE : une partie locale, un `@`, un domaine avec au moins un point. La RFC
 * autorise bien plus (guillemets, commentaires, adresses sans point), mais une saisie humaine qui sort de ce cadre est
 * mille fois plus souvent une faute de frappe qu'une adresse exotique — et un mail envoyé à une faute de frappe est
 * perdu sans retour. PUR.
 */
const RE_ADRESSE = /^[^\s@,<>"]+@(?:[^\s@,<>".]+\.)+[^\s@,<>".]{2,}$/;

export function adresseValide(brut: string | null | undefined): boolean {
  return RE_ADRESSE.test((brut ?? '').trim());
}

/** L'adresse nue d'une saisie « Nom <a@b.fr> », ou de « a@b.fr ». Minuscules, sans espaces. PUR. */
export function extraireAdresse(brut: string | null | undefined): string {
  const s = (brut ?? '').trim();
  const chevrons = /<([^<>]+)>\s*$/.exec(s);
  return (chevrons ? chevrons[1] : s).trim().toLowerCase();
}

/**
 * Découpe une saisie libre en adresses : virgules, points-virgules, espaces et retours à la ligne séparent. Sert au
 * collage d'une liste entière depuis un autre courriel — le geste le plus fréquent, et celui qu'on rate le plus. PUR.
 */
export function decouperAdresses(brut: string | null | undefined): string[] {
  return (brut ?? '')
    .split(/[,;\n\r]+|\s{2,}/)
    .map((x) => extraireAdresse(x))
    .filter((x) => x !== '');
}

/**
 * NETTOIE une liste d'adresses : minuscules, sans doublon, sans les adresses exclues, dans l'ordre d'apparition.
 * C'est ici que vivent les règles ① et ② — et c'est pour ça qu'elles sont éprouvables sans écran. PUR.
 */
export function nettoyerDestinataires(brutes: readonly string[], exclure: readonly string[] = []): string[] {
  const hors = new Set(exclure.map((e) => extraireAdresse(e)).filter((e) => e !== ''));
  const vus = new Set<string>();
  const out: string[] = [];
  for (const b of brutes) {
    const a = extraireAdresse(b);
    if (a === '' || hors.has(a) || vus.has(a)) continue;
    vus.add(a);
    out.push(a);
  }
  return out;
}

const adressesDe = (l: AdresseAffichee[] | null | undefined): string[] => (l ?? []).map((x) => x.adresse);

// ── Objet ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Le préfixe d'objet. UNE SEULE FOIS : « Re: Re: Re: » est le bruit qui rend un objet illisible au bout de trois
 * échanges, et le module le retire déjà à l'affichage (lot 4d-C). On ne le réintroduit pas ici.
 *
 * ⚠️ Un objet qui commence DÉJÀ par le bon préfixe est laissé tel quel — y compris ses variantes étrangères (« RE: »,
 * « FW: », « TR: », « Fwd: ») : une réponse à une réponse anglaise ne devient pas « Re: RE: ». PUR.
 */
export function prefixerObjet(objet: string | null | undefined, voie: VoieRedaction): string {
  const brut = (objet ?? '').trim();
  if (voie === 'nouveau') return '';
  const prefixe = voie === 'transferer' ? 'Tr: ' : 'Re: ';
  const dejaReponse = /^(re|rép|rep)\s*(\[\d+\])?\s*:\s*/i;
  const dejaTransfert = /^(tr|fwd|fw|transf)\s*(\[\d+\])?\s*:\s*/i;
  const motif = voie === 'transferer' ? dejaTransfert : dejaReponse;
  if (brut === '') return prefixe.trim();
  return motif.test(brut) ? brut : `${prefixe}${brut}`;
}

// ── Citation ──────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Le message d'origine, CITÉ. Une ligne d'introduction puis le texte préfixé de « > », comme toute messagerie depuis
 * trente ans — c'est ce que les clients des correspondants savent replier. Rendu REPLIÉ à l'écran : on écrit
 * au-dessus, on ne relit pas ce qu'on vient de lire. PUR.
 */
export function citerMessage(m: MessageOrigine, dateLisible?: string): string | null {
  const corps = (m.corps ?? '').replace(/\r\n/g, '\n').trimEnd();
  const qui = (m.deNom ?? '').trim() !== '' ? `${(m.deNom ?? '').trim()} <${m.de}>` : m.de;
  const quand = (dateLisible ?? '').trim();
  const intro = quand === '' ? `${qui} a écrit :` : `Le ${quand}, ${qui} a écrit :`;
  if (corps === '') return intro;
  return `${intro}\n${corps.split('\n').map((l) => (l === '' ? '>' : `> ${l}`)).join('\n')}`;
}

// ── Le brouillon de départ ────────────────────────────────────────────────────────────────────────────────────────

/**
 * PRÉPARE LE BROUILLON. C'est la fonction qui décide QUI reçoit quoi, et le seul endroit où cette décision est prise.
 *
 * `repondre`        → à l'expéditeur seul (ou à son Reply-To s'il en a un : c'est là qu'il A DEMANDÉ qu'on réponde).
 * `repondre_tous`   → à l'expéditeur, et en copie tous les autres destinataires connus, MOINS nous, MOINS les doublons.
 * `transferer`      → aucun destinataire (on ne devine jamais à qui l'on transfère), objet « Tr: », message entier cité.
 * `nouveau`         → tout vide.
 *
 * ⚠️ LES PIÈCES JOINTES NE SUIVENT PAS UN TRANSFERT dans ce lot, et l'écran le dit en toutes lettres : elles viendront
 * avec le lot Drive. Les joindre ici demanderait de les relire depuis le stockage objet et de les remonter à Gmail —
 * un chemin qui mérite son propre lot, pas un coin de celui-ci. PUR.
 */
export function preparerBrouillon(
  voie: VoieRedaction, origine: MessageOrigine | null, ctx: ContexteRedaction,
  o: { filId?: number | null; dateLisible?: string } = {},
): Brouillon {
  const nous = ctx.adresseGestion;
  const signature = (ctx.signature ?? '').trim();
  const corps = signature === '' ? '' : `\n\n${signature}`;
  const vide: Brouillon = {
    voie, a: [], cc: [], cci: [], objet: prefixerObjet(null, voie), corps, citation: null,
    destinatairesApproximatifs: false, filId: o.filId ?? null, repondALeMessageId: null,
  };
  if (voie === 'nouveau' || origine === null) return { ...vide, voie: 'nouveau', objet: '', filId: o.filId ?? null };

  const base: Brouillon = {
    ...vide,
    objet: prefixerObjet(origine.objet, voie),
    citation: citerMessage(origine, o.dateLisible),
    repondALeMessageId: origine.messageId,
  };

  if (voie === 'transferer') return base; // à qui ? personne ne peut le deviner à notre place.

  // À : le Reply-To s'il est CONNU (l'expéditeur a demandé qu'on réponde là), sinon l'expéditeur.
  const replyTo = adressesDe(origine.destReplyTo);
  const a = nettoyerDestinataires(replyTo.length > 0 ? replyTo : [origine.de], [nous]);

  if (voie === 'repondre') {
    // Répondre à l'expéditeur SEUL. Si l'expéditeur est nous-mêmes (on répond à notre propre envoi), la liste serait
    //   vide : on retombe alors sur les destinataires du message, qui sont les gens à qui l'on parlait.
    const repli = a.length > 0 ? a : nettoyerDestinataires(adressesDe(origine.destA), [nous]);
    return { ...base, a: repli };
  }

  // ── RÉPONDRE À TOUS ─────────────────────────────────────────────────────────────────────────────────────────────
  // 🔴 `null` (jamais analysé) et `[]` (analysé, personne) ne se confondent pas : c'est tout l'objet de la migration
  //   235, et c'est ce qui distingue « il n'y avait personne en copie » de « on ne sait pas qui était en copie ».
  const detaille = origine.destA != null || origine.destCc != null;
  if (detaille) {
    const cc = nettoyerDestinataires([...adressesDe(origine.destA), ...adressesDe(origine.destCc)], [nous, ...a]);
    const aFinal = a.length > 0 ? a : nettoyerDestinataires(adressesDe(origine.destA), [nous]);
    return { ...base, a: aFinal, cc: nettoyerDestinataires(cc, [nous, ...aFinal]) };
  }
  // Rien de détaillé : on propose la liste FONDUE, et l'écran annonce qu'elle est à relire.
  const fondus = nettoyerDestinataires(decouperAdresses(origine.destinatairesFondus), [nous, ...a]);
  return { ...base, a, cc: fondus, destinatairesApproximatifs: true };
}

/** La phrase affichée quand les destinataires ne sont pas détaillés. Une seule formulation, partout. */
export const MENTION_DESTINATAIRES_APPROXIMATIFS =
  'destinataires non détaillés — vérifie la liste avant d’envoyer';

/** La phrase affichée quand aucune signature n'a pu être récupérée. Une seule formulation, partout. */
export const MENTION_SANS_SIGNATURE =
  'Aucune signature : la connexion Google de gestion@ n’est pas encore faite.';

/** La phrase affichée sous un transfert, au sujet des pièces. Une seule formulation, partout. */
export const MENTION_PIECES_NON_JOINTES =
  'Les pièces jointes du message d’origine ne sont pas transférées — elles viendront avec le lot Drive.';

// ── Ce qu'on peut envoyer, et ce qu'on refuse ─────────────────────────────────────────────────────────────────────

export interface RefusEnvoi { pret: false; motif: string }
export interface PretEnvoi { pret: true }

/**
 * LE BROUILLON EST-IL ENVOYABLE ? Contrôlé À L'ÉCRAN pour désactiver le bouton, et REJOUÉ CÔTÉ SERVEUR avant l'appel
 * réseau — jamais l'un sans l'autre : l'écran évite une erreur, le serveur est la seule autorité. PUR.
 */
export function pretAEnvoyer(b: Pick<Brouillon, 'a' | 'cc' | 'cci' | 'objet' | 'corps'>): PretEnvoi | RefusEnvoi {
  const toutes = [...b.a, ...b.cc, ...b.cci];
  if (toutes.length === 0) return { pret: false, motif: 'Indiquez au moins un destinataire.' };
  const fautives = toutes.filter((x) => !adresseValide(x));
  if (fautives.length > 0) {
    return { pret: false, motif: `Adresse incorrecte : ${fautives.slice(0, 3).join(', ')}${fautives.length > 3 ? '…' : ''}` };
  }
  if (b.objet.trim() === '') return { pret: false, motif: 'Indiquez un objet.' };
  if (b.corps.trim() === '') return { pret: false, motif: 'Le message est vide.' };
  return { pret: true };
}

/**
 * Le message est-il encore ANNULABLE ? La fenêtre d'annulation court depuis le clic ; passé le délai, l'envoi part.
 * PUR, et pilotée par une horloge injectée — sans quoi l'épreuve dépendrait du temps qui passe.
 */
export function encoreAnnulable(clicLe: Date, maintenant: Date, delaiS: number): boolean {
  return maintenant.getTime() - clicLe.getTime() < delaiS * 1000;
}

/** Secondes restantes avant le départ, arrondies au-dessus. `0` = c'est parti. PUR. */
export function secondesRestantes(clicLe: Date, maintenant: Date, delaiS: number): number {
  const reste = delaiS * 1000 - (maintenant.getTime() - clicLe.getTime());
  return reste <= 0 ? 0 : Math.ceil(reste / 1000);
}
