/**
 * MODULE « GESTION » — LOT 5-BOITE-2 : LE LU / NON LU VIENT DE GMAIL, ET DE NULLE PART AILLEURS.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LE CHOIX D'ARNO, 25/09/2026 : UN SEUL ÉTAT, COMMUN À L'ÉQUIPE, celui de Gmail. Deux notions coexistaient depuis
 * le matin — le libellé `UNREAD` de Gmail (lot 5-FIDÈLE, menu « ⋮ » d'un message) et un état personnel en base
 * (lot 5-BOITE, `gestion_message_lu`). Deux « non lu » côte à côte dans le même menu auraient été impossibles à
 * expliquer, et l'un des deux aurait fini par mentir.
 *
 * CE QUE ÇA VEUT DIRE À L'USAGE, ET IL FAUT LE SAVOIR :
 *   · lire un échange ICI le marque lu DANS Gmail, donc pour TOUTE l'équipe et sur tous les téléphones ;
 *   · à l'inverse, un collègue qui lit dans Gmail éteint le gras ici — c'est la même boîte, vue de deux endroits ;
 *   · sans connexion Google, il n'y a pas d'état à lire : rien n'est en gras, et l'écran le DIT plutôt que de
 *     laisser croire que tout est lu.
 *
 * 🔴 UNE SEULE QUESTION POSÉE À GMAIL, PAS TRENTE. Le lot 5-FIDÈLE lit l'état message par message : juste pour une
 * conversation ouverte, ruineux pour une liste. On retourne donc le problème — on demande CE QUI EST NON LU, puis on
 * rapproche. MESURÉ le 25/09/2026 sur la vraie boîte : 14 messages non lus en tout, la liste rendue en 259 ms.
 *
 * 🔴 LE RAPPROCHEMENT SE FAIT PAR `Message-ID`, ET C'EST UNE CONTRAINTE MESURÉE : seuls 51 de nos 56 793 messages
 * connaissent leur identifiant Gmail (la migration 242 ne le renseigne que sur ceux où l'on a agi). L'identifiant
 * Gmail ne peut donc pas servir de clé ; le `Message-ID` RFC, lui, existe des deux côtés depuis toujours.
 *
 * 🔴 TOUT EST BORNÉ. Un appel pour la liste, puis un par message non lu — donc quinze aujourd'hui. Si l'équipe
 * laissait des centaines de messages non lus, le plafond coupe et l'écran ANNONCE que le compte est partiel : un
 * compteur tronqué qui se tairait serait un compteur faux.
 *
 * 🔒 AUCUNE ÉCRITURE DANS CE FICHIER : il ne fait que LIRE Gmail et notre base. Le marquage vit dans `marquerFilGmail`,
 * plus bas, et passe par le seul geste que Gmail accepte — poser ou retirer le libellé `UNREAD` sur un FIL.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../db/client';
import { normaliserMessageId, type Resultat } from './google';

/** Combien de messages non lus on accepte de rapprocher. Au-delà, on le DIT plutôt que de faire attendre. */
export const PLAFOND_NON_LUS = 200;
/** Combien de lectures d'en-tête en parallèle. Gmail étrangle les rafales ; six est le compromis du module. */
const PARALLELE = 6;

export interface DepsLectureGmail {
  /** Le jeton de gestion@, ou `null` si la connexion n'est pas faite. Aucun état n'est alors lisible. */
  jeton(): Promise<string | null>;
  /** ① Les messages non lus de la boîte, en un appel. */
  lister(jeton: string, plafond: number): Promise<Resultat<{ messages: { id: string; threadId: string }[]; complet: boolean }>>;
  /** ② L'en-tête `Message-ID` d'un message Gmail — la seule clé commune aux deux boîtes. */
  entete(jeton: string, id: string): Promise<Resultat<{ id: string; threadId: string; messageIdRfc: string | null }>>;
}

/** Ce que la boîte a besoin de savoir. `complet: false` = le compte est partiel, et l'écran doit le dire. */
export interface NonLusGmail {
  /** Les échanges (chez NOUS) qui portent au moins un message non lu dans Gmail. */
  fils: Set<number>;
  /** Combien d'échanges au total — le compteur de la colonne de gauche. */
  total: number;
  complet: boolean;
  /** `false` quand la connexion Google n'est pas faite : l'écran n'affiche alors NI gras NI compteur. */
  disponible: boolean;
}

const VIDE: NonLusGmail = { fils: new Set(), total: 0, complet: true, disponible: false };

/**
 * LES ÉCHANGES NON LUS, vus de Gmail, traduits chez nous.
 *
 * ⚠️ L'ORDRE DES ÉTAPES COMPTE : ① la liste (un appel) ; ② les en-têtes, en parallèle borné ; ③ UNE seule requête en
 * base pour traduire tous les `Message-ID` d'un coup. Traduire un par un ferait quinze allers-retours à la base pour
 * une réponse que `= ANY(…)` donne en une fois.
 */
export async function nonLusGmail(deps: DepsLectureGmail, plafond = PLAFOND_NON_LUS): Promise<NonLusGmail> {
  const jeton = await deps.jeton();
  if (jeton === null) return VIDE; // pas de connexion Google : aucun état à lire, et l'écran le dira

  const liste = await deps.lister(jeton, plafond);
  if (!liste.ok) return VIDE;
  const messages = liste.valeur.messages.slice(0, plafond);
  if (messages.length === 0) {
    return { fils: new Set(), total: 0, complet: liste.valeur.complet, disponible: true };
  }

  // ② les en-têtes, par paquets : une rafale de deux cents appels simultanés se ferait étrangler par Gmail.
  const cles: string[] = [];
  for (let i = 0; i < messages.length; i += PARALLELE) {
    const paquet = messages.slice(i, i + PARALLELE);
    const lus = await Promise.all(paquet.map((m) => deps.entete(jeton, m.id)));
    for (const e of lus) {
      if (e.ok && e.valeur.messageIdRfc !== null) cles.push(e.valeur.messageIdRfc);
    }
  }
  if (cles.length === 0) {
    return { fils: new Set(), total: 0, complet: liste.valeur.complet && messages.length === liste.valeur.messages.length, disponible: true };
  }

  const fils = await filsDeMessageIds(cles);
  return {
    fils,
    total: fils.size,
    // Tronqué si Gmail en avait d'autres à donner, OU si le plafond a coupé la liste rendue.
    complet: liste.valeur.complet && messages.length === liste.valeur.messages.length,
    disponible: true,
  };
}

/**
 * NOS ÉCHANGES, à partir des `Message-ID` de Gmail. UNE requête, quel que soit le nombre de clés.
 *
 * ⚠️ `gestion_message.message_id` porte le `Message-ID` RFC AVEC ses chevrons selon les cas : on compare donc sur la
 * forme NORMALISÉE des deux côtés, jamais sur la chaîne brute — un chevron de différence ferait rater tout le
 * rapprochement, silencieusement.
 */
async function filsDeMessageIds(cles: readonly string[]): Promise<Set<number>> {
  const { rows } = await query<{ fil_id: string }>(
    `SELECT DISTINCT m.fil_id::text AS fil_id
       FROM gestion_message m
      WHERE m.exclu_le IS NULL
        AND btrim(m.message_id, '<>') = ANY($1::text[])`,
    [cles.map((c) => c.replace(/^<|>$/g, ''))],
  );
  return new Set(rows.map((r) => Number(r.fil_id)));
}

/** Ce qu'un marquage rapporte. Chaque refus se répare différemment : on les distingue. */
export type IssueMarquage =
  | { etat: 'ok'; lu: boolean }
  | { etat: 'sans_connexion' }
  | { etat: 'introuvable' }
  | { etat: 'refus'; motif: string };

export interface DepsMarquageGmail {
  jeton(): Promise<string | null>;
  /**
   * Les `Message-ID` par lesquels on peut entrer dans le fil Gmail, du plus prometteur au moins prometteur.
   *
   * 🔴 PLUSIEURS, ET PLUS SEULEMENT LE DERNIER REÇU — correction du 27/09/2026. L'ancre unique était le dernier
   * message REÇU : quand celui-là n'était pas retrouvable, l'échange entier était déclaré absent de Gmail, alors
   * qu'un autre de ses messages y menait très bien. Mesuré : **26 086 échanges sur 36 413** n'ont AUCUN message
   * reçu — ils n'avaient donc jamais d'ancre du tout, et leur lu/non lu était impossible depuis toujours.
   */
  ancres(filId: number): Promise<string[]>;
  /** Retrouve le message dans Gmail, et donc son FIL. */
  chercher(jeton: string, messageIdRfc: string): Promise<Resultat<{ id: string; threadId: string } | null>>;
  /** Pose ou retire `UNREAD` sur tout le fil, en un appel. */
  modifierFil(jeton: string, threadId: string, o: { ajouter?: string[]; retirer?: string[] }): Promise<Resultat<{ id: string }>>;
}

/**
 * MARQUE UN ÉCHANGE LU, OU NON LU, DANS GMAIL — donc pour toute l'équipe.
 *
 * 🔴 SUR LE FIL, ET NON MESSAGE PAR MESSAGE. Un échange de dix messages demanderait vingt appels (chercher + modifier,
 * pour chacun) ; le fil s'obtient à partir d'UN message et se modifie en UN appel. C'est aussi ce que fait Gmail
 * quand on clique sur « marquer comme non lu » depuis une liste : c'est la conversation qui change d'état.
 *
 * ⚠️ UN ÉCHANGE INTROUVABLE DANS GMAIL N'EST PAS UNE PANNE : il vient d'une autre boîte, ou il y a été effacé. On le
 * dit tel quel, comme le fait déjà `gmailAction` depuis le lot 5-FIDÈLE.
 */
export async function marquerFilGmail(
  deps: DepsMarquageGmail, filId: number, lu: boolean,
): Promise<IssueMarquage> {
  const jeton = await deps.jeton();
  if (jeton === null) return { etat: 'sans_connexion' };

  /**
   * 🔴 ON ESSAIE LES ANCRES DANS L'ORDRE, ET ON S'ARRÊTE À LA PREMIÈRE QUI MÈNE AU FIL. Un seul message retrouvé
   * suffit : Gmail rend son `threadId`, et c'est le fil entier qu'on modifie ensuite, en un appel.
   *
   * ⚠️ UN REFUS DE GMAIL ARRÊTE TOUT, une ABSENCE non. Les deux ne se réparent pas pareil : un refus (droit, quota,
   * panne) se répétera à l'identique sur les ancres suivantes et doit être dit tel quel ; une absence, elle, veut
   * seulement dire « pas celui-là », et l'ancre suivante a toutes ses chances.
   */
  for (const brute of await deps.ancres(filId)) {
    const ancre = normaliserMessageId(brute);
    if (ancre === null) continue;
    const trouve = await deps.chercher(jeton, ancre);
    if (!trouve.ok) return { etat: 'refus', motif: trouve.motif };
    if (trouve.valeur === null) continue;
    const r = await deps.modifierFil(jeton, trouve.valeur.threadId,
      lu ? { retirer: ['UNREAD'] } : { ajouter: ['UNREAD'] });
    return r.ok ? { etat: 'ok', lu } : { etat: 'refus', motif: r.motif };
  }
  return { etat: 'introuvable' };
}

/**
 * LES `Message-ID` D'UN ÉCHANGE, du plus prometteur au moins prometteur — autant de portes d'entrée vers son fil
 * Gmail.
 *
 * L'ORDRE N'EST PAS ARBITRAIRE :
 *   ① les messages dont on connaît DÉJÀ l'identifiant Gmail (`gmail_message_id`) : on sait qu'ils y sont ;
 *   ② puis les REÇUS, du plus récent au plus ancien — c'était l'unique ancre d'avant, et c'est souvent la bonne ;
 *   ③ puis les ENVOYÉS. Un message que NOUS avons envoyé est dans la boîte de gestion@ (libellé SENT) et mène au
 *      même fil : c'est ce qui rend le lu/non lu possible sur les 26 086 échanges qui n'ont aucun message reçu.
 *
 * ⚠️ BORNÉ À CINQ. Chaque ancre coûte une recherche Gmail ; au-delà de cinq, on paie un aller-retour par message
 * pour un échange que Gmail ne connaît visiblement pas. Cinq couvre tous les cas observés.
 */
export const ANCRES_MAX = 5;

export async function ancresDuFil(filId: number): Promise<string[]> {
  const { rows } = await query<{ message_id: string }>(
    `SELECT message_id FROM gestion_message
      WHERE fil_id = $1 AND message_id IS NOT NULL
      ORDER BY (gmail_message_id IS NOT NULL) DESC, (sens = 'recu') DESC, recu_le DESC, id DESC
      LIMIT ${ANCRES_MAX}`,
    [filId]);
  return rows.map((r) => r.message_id);
}
