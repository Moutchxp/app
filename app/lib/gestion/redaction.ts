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
/**
 * LOT 5-PJ-ENVOI — une CINQUIÈME voie : `transferer_piece`. Elle se comporte comme « Transférer » pour l'objet et
 * les destinataires (on choisit à qui), mais l'original n'est PAS cité dans le corps : il est JOINT en entier, en
 * `message/rfc822` (.eml), tiré de Gmail au moment de l'envoi. C'est ce qu'on fait quand le correspondant doit voir
 * le message tel qu'il est arrivé — en-têtes compris — et non une recopie.
 */
export type VoieRedaction = 'repondre' | 'repondre_tous' | 'transferer' | 'nouveau' | 'transferer_piece';

/** Les deux voies qui transfèrent. Écrit une fois : deux listes finiraient par diverger. PUR. */
export function estUnTransfert(voie: VoieRedaction): boolean {
  return voie === 'transferer' || voie === 'transferer_piece';
}

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
   * LOT REDACTION-GMAIL — la citation en HTML, quand on la connaît sous cette forme (demande d'Arno : « la citation
   * du message d'origine est conservée en HTML »). `null` ⇒ on cite la version texte, comme avant ce lot.
   *
   * ⚠️ LES DEUX CITATIONS PARTENT ENSEMBLE, dans les deux versions du message. Ne mettre la citation que dans le
   * HTML ferait disparaître le message d'origine pour qui lit en texte — et l'inverse pour qui lit en HTML.
   */
  citationHtml?: string | null;
  /**
   * 🔴 Les destinataires d'origine n'étaient pas détaillés : la liste proposée est une APPROXIMATION, et l'écran doit
   * le dire avant qu'on envoie. Voir la règle ③.
   */
  destinatairesApproximatifs: boolean;
  /** L'échange visé, pour rester dans le bon fil. `null` = nouveau message hors de tout fil. */
  filId: number | null;
  /** Le message auquel on répond, pour In-Reply-To / References. `null` = nouveau message. */
  repondALeMessageId: number | null;
  /**
   * ══ 🔴 LOT REDACTION-GMAIL — LE CORPS EN TEXTE MIS EN FORME ═══════════════════════════════════════════════════
   * `null` ou vide ⇒ ce brouillon n'a que du texte : c'est le cas des 2 400 brouillons d'avant ce lot, et celui
   * d'un message écrit sans toucher à la barre d'outils.
   *
   * 🔴 `corps` RESTE LA VÉRITÉ TEXTE, et n'est pas un sous-produit : le message part en `multipart/alternative`,
   * et une partie des destinataires — tous les lecteurs d'écran en mode texte — ne verra QUE cette version-là.
   * Les deux sont tenues d'accord par `htmlVersTexte` à chaque frappe.
   */
  corpsHtml?: string | null;
  /**
   * LOT REDACTION-GMAIL — les cibles choisies dans « Classer ce mail ». À l'envoi, chacune devient un rattachement
   * MANUEL confirmé du message envoyé. Vide ou absent ⇒ aucun classement demandé, comportement d'avant ce lot.
   *
   * ⚠️ NOUVEAU MESSAGE SEULEMENT (demande d'Arno) : une réponse hérite du classement de son échange, et proposer
   * de le refaire donnerait deux vérités sur la même conversation.
   */
  cibles?: CibleBrouillon[];
  /**
   * 🔴 LOT CLASSER-DEUX-BOUTONS — « INTERNE » CHOISI PENDANT LA RÉDACTION, et gardé AVEC le brouillon.
   *
   * Il ne vivait que dans l'état React de la fenêtre : la fermer perdait la décision sans rien dire. La marque
   * elle-même est posée sur l'ÉCHANGE à l'envoi — un message neuf n'en a pas encore — mais l'INTENTION appartient
   * au brouillon, au même titre que les biens cochés.
   *
   * ⚠️ IL S'EXCLUT DES CIBLES : « interne » veut dire qu'il n'y a pas de bien à rattacher. Les deux réponses ne
   * peuvent pas être vraies en même temps, et l'écran ne permet pas de les poser ensemble.
   */
  interne?: boolean;
  /**
   * ══ 🔴🔴 LOT CLASSER-AVANT-ENVOI — « HORS GESTION », HÉRITÉ ET JAMAIS CHOISI ICI ══════════════════════════
   *
   * Demande d'Arno : « si la conversation est déjà rattachée, interne ou hors gestion, la case est pré-remplie en
   * vert dans le même état ». Des trois états, c'est le seul qui n'a pas de bouton dans la fenêtre de rédaction :
   * on ne le POSE pas en écrivant, on en HÉRITE en répondant dans un fil déjà marqué ainsi.
   *
   * 🔴 POURQUOI IL DOIT EXISTER ICI MALGRÉ TOUT : sans lui, répondre dans une conversation « hors gestion »
   * tomberait sous l'obligation de classer, et il faudrait reclasser à la main un courrier déjà classé — c'est-à-
   * dire remplacer une file de mails à classer par une file de gestes à refaire.
   *
   * ⚠️ IL S'EXCLUT DES DEUX AUTRES, comme elles s'excluent entre elles : une seule case verte, jamais deux.
   *
   * ⚠️ SANS LA MIGRATION 289, il n'a nulle part où s'écrire : la case verte s'affiche et l'envoi est débloqué,
   * mais le choix ne sera pas retrouvé à la réouverture du brouillon. L'écran le DIT.
   */
  horsGestion?: boolean;
}

/**
 * Une cible de classement choisie pendant l'écriture. Même forme que `gestion_rattachement` : à l'envoi, on COPIE.
 *
 * 🔴 LOT FICHE-RATTACHEMENT — `proprietaire` et `locataire` sont sorties du type. Ce n'est pas un resserrement de
 * confort : c'était une VOIE DE CRÉATION de liens « personne », qui ne s'ouvrait qu'au moment de l'envoi. Le type
 * la ferme à la compilation, la route la ferme à l'exécution, et la base la fermera (migration 273).
 */
export interface CibleBrouillon {
  sorte: 'lot' | 'evenement';
  cle: string | null;
  id: number | null;
  libelle: string;
}

/** Deux cibles désignent-elles la même chose ? Sert à ne pas en poser deux fois la même. PUR. */
export function memeCibleBrouillon(a: CibleBrouillon, b: CibleBrouillon): boolean {
  return a.sorte === b.sorte && (a.cle ?? '') === (b.cle ?? '') && (a.id ?? 0) === (b.id ?? 0);
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
  const prefixe = estUnTransfert(voie) ? 'Tr: ' : 'Re: ';
  const dejaReponse = /^(re|rép|rep)\s*(\[\d+\])?\s*:\s*/i;
  const dejaTransfert = /^(tr|fwd|fw|transf)\s*(\[\d+\])?\s*:\s*/i;
  const motif = estUnTransfert(voie) ? dejaTransfert : dejaReponse;
  if (brut === '') return prefixe.trim();
  return motif.test(brut) ? brut : `${prefixe}${brut}`;
}

// ── Citation ──────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Le message d'origine, CITÉ. Une ligne d'introduction puis le texte préfixé de « > », comme toute messagerie depuis
 * trente ans — c'est ce que les clients des correspondants savent replier. Rendu REPLIÉ à l'écran : on écrit
 * au-dessus, on ne relit pas ce qu'on vient de lire. PUR.
 */
/**
 * ══ 🔴 LOT REDACTION-GMAIL — LA CITATION EN HTML ═════════════════════════════════════════════════════════════════
 *
 * La MÊME citation, dans la forme que toutes les messageries emploient : une introduction, puis le message d'origine
 * dans un `blockquote` à barre verticale. C'est ce qui permet au destinataire de replier la citation d'un clic —
 * avec des « > » en début de ligne, son client ne sait pas où elle commence.
 *
 * ⚠️ ELLE N'INVENTE RIEN : le corps d'origine est ÉCHAPPÉ (`echapperTexte`) puis ses sauts de ligne deviennent des
 * `<br>`. On ne réinterprète jamais le message de quelqu'un d'autre comme du HTML — ce serait rouvrir, à l'endroit
 * exact où on ne l'attend pas, tout ce que l'assainisseur existe pour fermer.
 *
 * ⚠️ `null` QUAND `citerMessage` REND `null` : une seule décision, prise au même endroit. PUR.
 */
export function citerMessageHtml(m: MessageOrigine, dateLisible?: string, corpsHtml?: string | null): string | null {
  const texte = citerMessage(m, dateLisible);
  if (texte === null) return null;
  const qui = (m.deNom ?? '').trim() !== '' ? `${(m.deNom ?? '').trim()} <${m.de}>` : m.de;
  const quand = (dateLisible ?? '').trim();
  const intro = quand === '' ? `${qui} a écrit :` : `Le ${quand}, ${qui} a écrit :`;
  const echapper = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  /**
   * 🔴 LE HTML D'ORIGINE EST PRÉFÉRÉ QUAND ON L'A — c'est la demande d'Arno (« la citation est conservée en
   * HTML ») : citer la version texte d'un message qui était mis en forme perd ses listes, ses liens et ses gras.
   * L'appelant DOIT l'avoir déjà assaini : ce module est pur et ne peut pas le faire lui-même.
   */
  const dedans = (corpsHtml ?? '').trim() !== ''
    ? (corpsHtml as string)
    : echapper((m.corps ?? '').replace(/\r\n/g, '\n').trimEnd()).split('\n').join('<br />');
  const corpsCite = dedans.trim() === '' ? '' :
    `<blockquote style="margin: 0 0 0 0.5rem; padding-left: 0.8rem; border-left: 2px solid #cccccc">${dedans}</blockquote>`;
  return `<div>${echapper(intro)}</div>${corpsCite}`;
}

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
  o: { filId?: number | null; dateLisible?: string; origineHtml?: string | null } = {},
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
    // LOT REDACTION-GMAIL — la même citation, en HTML. `origineHtml` doit arriver DÉJÀ ASSAINI (module pur).
    citationHtml: citerMessageHtml(origine, o.dateLisible, o.origineHtml),
    repondALeMessageId: origine.messageId,
  };

  // LOT 5-PJ-ENVOI — le TRANSFERT EN PIÈCE JOINTE ne CITE PAS l'original : il le joint en entier. Laisser la
  //   citation ferait lire deux fois la même chose, et laisserait croire que le .eml n'est qu'un doublon.
  if (voie === 'transferer_piece') return { ...base, citation: null, citationHtml: null };
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

/**
 * La phrase affichée sous un TRANSFERT, au sujet des pièces.
 *
 * ⚠️ ELLE A CHANGÉ DE SENS AU LOT 5-PJ-ENVOI, et c'est la seule raison pour laquelle son nom est resté : elle disait
 * « les pièces ne sont pas transférées » tant que l'éditeur ne savait pas en porter. Il le sait désormais — les
 * pièces du message d'origine sont REPRISES automatiquement, et retirables une à une. Laisser l'ancienne phrase
 * aurait fait joindre des pièces en affirmant le contraire, ce qui est pire que de ne rien dire.
 */
export const MENTION_PIECES_NON_JOINTES =
  'Les pièces jointes du message d’origine ont été reprises ci-dessous : retirez celles que vous ne voulez pas envoyer.';

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

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LOT BROUILLON-SILENCIEUX — À PARTIR DE QUAND UN BROUILLON EXISTE-T-IL ?
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * 🔴 LE DÉFAUT RÉPARÉ, ET IL VENAIT DE MOI. L'enregistrement automatique gardait tout brouillon dont l'objet, le
 * corps OU les destinataires n'étaient pas vides. Or une RÉPONSE naît déjà remplie : objet « Re: … », destinataire
 * repris du message, corps contenant la signature. Le test était donc vrai dès la première seconde, et ouvrir puis
 * fermer « Répondre » laissait un brouillon vide derrière soi. Mes essais du lot REPONSE-VISIBLE en ont créé douze.
 *
 * LA BONNE QUESTION N'EST PAS « EST-CE VIDE ? » MAIS « QUELQU'UN A-T-IL ÉCRIT QUELQUE CHOSE ? » — c'est-à-dire :
 * l'état courant s'écarte-t-il de celui que l'éditeur a PRÉ-REMPLI ? On compare donc au brouillon d'origine, et à
 * lui seul. Quatre écarts comptent, ceux qu'Arno a nommés :
 *   · le CORPS diffère (du texte en plus de la signature et de la citation) ;
 *   · un DESTINATAIRE a été ajouté, retiré ou changé — À, Cc ou Cci ;
 *   · l'OBJET a été modifié ;
 *   · une PIÈCE JOINTE a été ajoutée (elle ne vit pas dans le brouillon : l'appelant la signale).
 *
 * ⚠️ SYMÉTRIQUE, DONC RÉVERSIBLE. Effacer ce qu'on venait d'écrire ramène « non touché » : c'est ce qui permet
 * d'abandonner à la fermeture un brouillon redevenu vide, sans avoir à mémoriser qu'il a été rempli un jour.
 *
 * ⚠️ ON COMPARE LE TEXTE BRUT, SANS `trim()`. Ajouter une ligne vide au-dessus de la signature EST une saisie — on
 * est en train d'écrire. La comparer à sa version rognée reviendrait à perdre ce début de message.
 *
 * PUR : aucune I/O, aucune horloge. C'est une décision, elle doit pouvoir se rejouer.
 */
export function brouillonTouche(
  origine: Pick<Brouillon, 'a' | 'cc' | 'cci' | 'objet' | 'corps'>
    & { cibles?: CibleBrouillon[]; interne?: boolean },
  courant: Pick<Brouillon, 'a' | 'cc' | 'cci' | 'objet' | 'corps'>
    & { cibles?: CibleBrouillon[]; interne?: boolean },
  avecPieces = false,
): boolean {
  if (avecPieces) return true;
  if (courant.corps !== origine.corps) return true;
  if (courant.objet !== origine.objet) return true;
  /**
   * LOT REDACTION-GMAIL — CHOISIR UNE CIBLE DE CLASSEMENT EST UNE SAISIE. Sans cette ligne, ouvrir « Nouveau
   * message », classer le mail puis fermer perdrait le classement sans rien dire : le brouillon aurait été jugé
   * « pas touché », donc jamais enregistré.
   *
   * ⚠️ ON NE REGARDE PAS `corpsHtml` : il est DÉRIVÉ de `corps` à chaque frappe (l'un est le rendu texte de
   * l'autre). Le comparer ferait déclarer « touché » un brouillon simplement rouvert, puisque la conversion
   * texte → HTML d'un corps hérité ne redonne pas octet pour octet le HTML d'origine.
   */
  if ((courant.cibles ?? []).length !== (origine.cibles ?? []).length) return true;
  /**
   * 🔴 LOT CLASSER-DEUX-BOUTONS — ET « INTERNE » EST UNE SAISIE AU MÊME TITRE. C'est même le seul choix qui ne
   * laisse AUCUNE autre trace : pas de destinataire de plus, pas d'objet, pas de cible. Sans cette ligne,
   * cliquer « Interne » puis fermer perdait la décision en silence — le brouillon était jugé « pas touché ».
   */
  if ((courant.interne === true) !== (origine.interne === true)) return true;
  return !memesAdresses(origine.a, courant.a)
    || !memesAdresses(origine.cc, courant.cc)
    || !memesAdresses(origine.cci, courant.cci);
}

/**
 * Deux listes d'adresses sont-elles les mêmes ? L'ORDRE COMPTE, et c'est voulu : réordonner les destinataires est
 * un geste de l'utilisateur, donc une saisie. PUR.
 */
function memesAdresses(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LOT LECTURE-HTML-FIL-TROMBONE — LES MOTS DU GESTE QUI JETTE UN BROUILLON
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Ce que l'éditeur écrit autour du bouton qui jette un brouillon. Tout vient d'ici : trois mots, une seule source. */
export interface MotsJeterBrouillon {
  /** L'info-bulle et le libellé accessible du bouton de la barre du bas. */
  infobulle: string;
  /** La question posée avant d'agir — elle DIT ce qui va se passer, sans rien promettre de plus. */
  question: string;
  /** Le mot du bouton qui confirme. */
  confirmer: string;
  /** Le compte rendu, une fois le geste fait. */
  compteRendu: string;
  /** Y a-t-il un retour possible, donc un bandeau « Annuler » de 10 secondes ? */
  reversible: boolean;
}

/**
 * ══ 🔴🔴 POURQUOI CES MOTS DÉPENDENT D'UNE MIGRATION ═══════════════════════════════════════════════════════════
 *
 * La corbeille des brouillons repose sur `gestion_brouillon.corbeille_le` (migration 276). Tant que la colonne
 * n'est pas là, le geste fait EXACTEMENT ce qu'il faisait avant ce lot : il date `abandonne_le`, le brouillon
 * quitte la liste, et personne ne peut le revoir.
 *
 * 🔴 ALORS ON NE PROMET PAS LE RETOUR. Dire « Mettre à la corbeille » et montrer un bandeau « Annuler » sur une
 * base où rien ne peut être réintégré serait un mensonge que l'on découvre au pire moment — après avoir cliqué.
 * Une promesse de retour qu'on ne peut pas tenir est pire que pas de promesse.
 *
 * PUR : la sonde est posée par la route (`corbeilleBrouillonDisponible`), jamais ici.
 */
export function motsJeterBrouillon(corbeilleDisponible: boolean): MotsJeterBrouillon {
  if (corbeilleDisponible) {
    return {
      infobulle: 'Mettre à la corbeille',
      question: 'Mettre ce brouillon à la corbeille ? Il pourra en être réintégré.',
      confirmer: 'Mettre à la corbeille',
      compteRendu: 'Brouillon mis à la corbeille.',
      reversible: true,
    };
  }
  return {
    infobulle: 'Supprimer le brouillon',
    question: 'Supprimer ce brouillon ? Il quittera la liste « Brouillons », sans retour possible.',
    confirmer: 'Supprimer',
    compteRendu: 'Brouillon supprimé.',
    reversible: false,
  };
}
