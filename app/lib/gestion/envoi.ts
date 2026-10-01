/**
 * LOT 5e — L'ENVOI, DE BOUT EN BOUT. IMPUR, mais TOUT est injecté : base, Gmail, horloge, aléa. Aucune connexion n'est
 * ouverte par ce fichier — c'est ce qui permet de l'éprouver entièrement sans qu'un seul mail parte.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 L'ORDRE DES GESTES EST LA FONCTIONNALITÉ. Il n'est pas négociable, et chaque inversion a une conséquence connue :
 *   ① on relit le DROIT (en base, pas dans le jeton) → un droit retiré coupe l'envoi au clic suivant ;
 *   ② on vérifie que le brouillon est ENVOYABLE → l'écran l'a déjà fait, le serveur est la seule autorité ;
 *   ③ on vérifie que la connexion Google EXISTE → sinon on le dit, et le brouillon est CONSERVÉ ;
 *   ④ on ÉCRIT la ligne d'envoi, AVANT l'appel réseau → si tout tombe ensuite, on sait qu'un mail est peut-être parti ;
 *      et c'est la BASE qui tranche le double-clic (clé unique) : une seconde demande retombe sur la première ;
 *   ⑤ on appelle Gmail ;
 *   ⑥ on FINALISE la ligne — parti, ou refusé avec son motif. Jamais laissée en silence.
 * Écrire la ligne APRÈS l'appel (④ après ⑤) perdrait la trace d'un envoi réussi dont la réponse n'est jamais revenue :
 * on renverrait alors le même mail, et le correspondant le recevrait deux fois.
 *
 * 🔴 CORRECTIF DU 24/09/2026 — UNE FOIS QUE GMAIL A ACCEPTÉ, PLUS RIEN NE PEUT FAIRE ÉCHOUER L'ENVOI.
 * Le 23/09 au soir, le premier vrai message d'Arno est PARTI — et l'écran lui a dit « Envoi impossible ». La cause :
 * l'écriture du journal, APRÈS l'envoi, a été refusée par la base ; l'exception a remonté jusqu'à la route, qui a
 * rendu un échec. Arno a donc cru devoir recommencer un geste déjà abouti.
 * Depuis, les trois gestes qui SUIVENT l'acceptation de Gmail (finaliser la ligne, marquer le brouillon, journaliser)
 * sont au mieux-effort : chacun est tenté, chacun est signalé s'il échoue — dans le journal DU SERVEUR —, et AUCUN ne
 * peut plus changer le verdict rendu à l'écran. Le seul fait qui décide de ce verdict est la réponse de Gmail : lui
 * seul sait si le message est parti. Tout le reste est de la comptabilité, et une comptabilité en retard ne rappelle
 * pas un mail déjà remis.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔒 AUCUN CORPS, AUCUNE ADRESSE, AUCUN JETON dans les journaux applicatifs : le registre `gestion_envoi` porte l'objet
 * et les destinataires — c'est le journal MÉTIER, celui qu'Arno a demandé —, et rien d'autre ne sort vers `console`.
 */
import type { Auteur, EnvoiEnBase } from './redactionRepo';
import {
  chainerReferences, construireRfc822, domaineDe, fabriquerMessageId,
  type PieceAEnvoyer, type ResultatEnvoi,
} from './envoiGmail';
import { pretAEnvoyer } from './redaction';
// 🔴 LOT CLASSER-AVANT-ENVOI — le garde « ce mail est-il classé ? », MODULE PUR partagé avec l'écran et la route.
import { refusSiNonClasse } from './classementAvantEnvoi';
// LOT ETOILE-ET-SIGNATURE — reconnaître NOS adresses d'images de signature dans le corps, et les remplacer par des `cid:`.
import { corpsPourEnvoi, rangSignature, type ImageSignature } from './signatureImages';
// 🔴 LOT MODALE-SUIVI-ET-DEFILEMENT (point 0) — les images du corps CITÉ partent avec leurs octets, elles aussi.
import { citeesParmi, corpsCitePourEnvoi, type ImageCitee } from './imagesCitees';
import { adressesDesImages } from './imagesMail';

/** Ce que l'envoi a besoin de savoir du message auquel on répond, pour rester dans le bon fil. */
export interface AncrageFil {
  /** Le `Message-ID` RFC du message d'origine. `null` = nouveau message, aucun ancrage. */
  messageIdRfc: string | null;
  /** Sa chaîne `References`, si on la connaît. */
  references: string | null;
  /** L'identifiant de fil côté Gmail, si on le connaît. Aide Gmail à ranger, sans remplacer les en-têtes. */
  threadId: string | null;
}

export interface DemandeEnvoi {
  cleIdempotence: string;
  brouillonId: number | null;
  filId: number | null;
  repondAMessageId: number | null;
  a: string[];
  cc: string[];
  cci: string[];
  objet: string;
  corps: string;
  /**
   * LOT 5-PJ-ENVOI — la voie du brouillon. Elle ne sert qu'à UNE chose ici : savoir s'il faut joindre l'original
   * complet (`transferer_piece`). Absente ⇒ comportement d'avant ce lot.
   */
  voie?: string | null;
  /**
   * LOT REDACTION-GMAIL — le corps en HTML, DÉJÀ ASSAINI PAR LA ROUTE. Présent ⇒ le message part en
   * `multipart/alternative` (texte + HTML) ; absent ou vide ⇒ texte seul, exactement comme avant ce lot.
   *
   * ⚠️ CE MODULE NE L'ASSAINIT PAS LUI-MÊME, et c'est délibéré : il est déjà responsable de l'ORDRE des gestes,
   * qui est sa vraie fonction. L'assainissement est fait par la route, en un seul endroit, avec un test dédié.
   */
  corpsHtml?: string | null;
  /**
   * LOT REDACTION-GMAIL — les cibles de « Classer ce mail ». Après un envoi RÉUSSI, chacune devient un
   * rattachement MANUEL confirmé du message envoyé. Vide ou absent ⇒ rien à classer.
   */
  cibles?: readonly { sorte: string; cle: string | null; id: number | null; libelle: string }[];
  /**
   * 🔴 LOT RATTACHER-EN-ECRIVANT — « Interne » a-t-il été coché dans la modale ? Vrai ⇒ l'intention est retenue
   * après l'envoi, et la relève pose la marque sur l'échange dès qu'il existe. Absent ⇒ rien, comme avant ce lot.
   */
  interne?: boolean;
  /**
   * 🔴 LOT CLASSER-AVANT-ENVOI — « HORS GESTION », HÉRITÉ d'une conversation déjà marquée ainsi. Comme
   * « Interne » ci-dessus : l'intention est retenue après l'envoi, et la relève pose la marque sur le message
   * dès qu'elle l'a capturé. Absent ⇒ rien.
   *
   * 🔴 IL COMPTE AUSSI POUR LE GARDE (étape ②bis) : c'est l'un des trois états qui font qu'un mail EST classé.
   */
  horsGestion?: boolean;
}

export interface DepsEnvoiComplet {
  /** ① Le droit, RELU EN BASE. */
  peutEnvoyer(): Promise<boolean>;
  /** ③ Un jeton d'accès Google valide, ou `null` si la connexion n'est pas faite. */
  jetonAcces(): Promise<string | null>;
  /** Le nom affiché de l'expéditeur, et son adresse. */
  expediteur(): Promise<{ adresse: string; nom: string }>;
  /** Ce à quoi on répond. */
  ancrage(repondAMessageId: number | null): Promise<AncrageFil>;
  /** ④ Ouvre la ligne, et tranche le double-clic. */
  ouvrirEnvoi(e: Parameters<typeof import('./redactionRepo').ouvrirEnvoi>[0], auteur: Auteur): Promise<EnvoiEnBase>;
  /**
   * LOT 5-PJ-ENVOI — ④bis LES PIÈCES À JOINDRE, lues au dernier moment.
   *
   * 🔴 LUES ICI, ET PAS PLUS TÔT : entre l'ouverture du brouillon et le clic sur « Envoyer », une pièce a pu être
   * retirée. Les lire à l'envoi, c'est joindre ce que la personne voit à l'écran au moment où elle envoie.
   *
   * 🔴 ET APRÈS le verrou d'idempotence : un double-clic ne doit pas relire (ni re-télécharger depuis Gmail) les
   * pièces d'un envoi déjà parti.
   *
   * Injectée : `envoi.ts` ne sait ni lire le stockage, ni parler à Gmail. Absente ⇒ aucune pièce, comme avant.
   */
  pieces?(d: DemandeEnvoi): Promise<PieceAEnvoyer[]>;
  /**
   * ══ 🔴 LOT ETOILE-ET-SIGNATURE — LES IMAGES DE LA SIGNATURE, INCORPORÉES AU MESSAGE ═══════════════════════════
   *
   * Reçoit les RANGS que le corps HTML appelle (`…/signature/image?rang=N`), rend leurs octets. Ce qu'elle ne
   * rapporte pas voit son image retirée du corps : la signature part sans elle, JAMAIS avec un carré barré —
   * c'est la consigne d'Arno, et une image absente se remarque bien moins qu'une image cassée.
   *
   * 🔴 POURQUOI L'INCORPORATION PLUTÔT QU'UN LIEN. Une image distante dans un mail sortant ne s'affiche pas chez
   * les destinataires dont le client bloque les images distantes (le réglage par défaut d'Outlook), dit à son
   * hébergeur quand le mail a été ouvert, et meurt le jour où l'adresse change.
   *
   * Injectée : `envoi.ts` ne sait ni lire un réglage Gmail, ni aller chercher une image. Absente ⇒ le corps part
   * tel quel, exactement comme avant ce lot.
   */
  imagesSignature?(o: { rangs: readonly number[]; domaine: string; alea: string }): Promise<{
    images: readonly ImageSignature[]; echecs: readonly number[];
  }>;
  /**
   * ══ 🔴🔴 LOT MODALE-SUIVI-ET-DEFILEMENT (point 0) — LES IMAGES DU CORPS CITÉ ═══════════════════════════════════
   *
   * DÉCISION D'ARNO (02/10/2026) : « Les images citées dans une réponse ou un transfert partent avec leurs octets
   * intégrés (pièce en ligne cid:), jamais un lien vers nos routes internes. »
   *
   * 🔴 POURQUOI C'EST UNE SECONDE DÉPENDANCE ET NON LA PREMIÈRE. La signature est désignée par un RANG dans un
   * document que nous écrivons ; une image citée est désignée par une de NOS ROUTES, qui sait d'où viennent ses
   * octets — une pièce jointe, une image intégrée, une image distante. Deux questions différentes, deux lectures
   * différentes ; les confondre obligerait l'une des deux à deviner.
   *
   * Injectée : `envoi.ts` ne lit aucune base. Absente ⇒ le corps part tel quel, comme avant ce lot.
   */
  imagesCitees?(o: { adresses: readonly string[]; domaine: string; alea: string }): Promise<{
    images: readonly ImageCitee[]; echecs: readonly number[];
  }>;
  /** ⑤ Remet le message à Gmail. */
  envoyer(o: { accessToken: string; rfc822: string; cci: readonly string[]; threadId: string | null }): Promise<ResultatEnvoi>;
  /** ⑥ Finalise la ligne. */
  finaliser(id: number, maj: { etat: 'envoye' | 'echec'; gmailMessageId?: string | null; erreur?: string | null }): Promise<void>;
  /** Marque le brouillon envoyé (il quitte la liste sans être supprimé). */
  marquerBrouillonEnvoye(id: number): Promise<void>;
  /**
   * ══ LOT REDACTION-GMAIL — POSER LES RATTACHEMENTS DEMANDÉS PENDANT L'ÉCRITURE ═════════════════════════════════
   * Appelée APRÈS un envoi réussi, et au MIEUX-EFFORT comme tout ce qui suit l'acceptation de Gmail : une fois le
   * message parti, plus rien ne peut rendre un échec (règle du 24/09/2026). Un rattachement qui n'a pas pu
   * s'écrire se rattrape ; un mail renvoyé parce qu'on a cru qu'il n'était pas parti, non.
   *
   * ⚠️ ELLE A BESOIN DU MESSAGE EN BASE. Or il n'y est pas encore : c'est la relève qui le capturera. La mise en
   * œuvre l'attache donc à l'identifiant GMAIL de l'envoi, et la pose se fait quand le message est capturé.
   * Injectée : ce module ne sait pas écrire en base. Absente ⇒ rien n'est posé, comme avant ce lot.
   */
  classer?(o: {
    envoiId: number;
    gmailMessageId: string | null;
    cibles: readonly { sorte: string; cle: string | null; id: number | null; libelle: string }[];
    auteur: Auteur;
  }): Promise<void>;
  /**
   * 🔴 LOT RATTACHER-EN-ECRIVANT — « INTERNE » DEMANDÉ PENDANT L'ÉCRITURE D'UN MESSAGE **NEUF**.
   *
   * ⚠️ MÊME CONTRAINTE QUE `classer` CI-DESSUS, et même remède : « Interne » porte sur un ÉCHANGE, et un message
   * neuf n'en a pas encore — c'est la relève qui le crée en capturant le message. On retient donc l'intention sur
   * l'envoi, et un rattrapage la pose ensuite. Une RÉPONSE, elle, a déjà son échange : l'écran le marque
   * directement, sans passer par ici.
   *
   * ⚠️ AU MIEUX-EFFORT, APRÈS LE MESSAGE PARTI : rien ici ne peut rendre un échec. Absente ⇒ rien n'est retenu,
   * et l'écran dit de marquer la conversation depuis « Classer ».
   */
  marquerInterne?(o: { envoiId: number; auteur: Auteur }): Promise<void>;
  /**
   * 🔴 LOT CLASSER-AVANT-ENVOI — « HORS GESTION » HÉRITÉ, retenu sur l'envoi.
   *
   * ⚠️ MÊME CONTRAINTE, MÊME REMÈDE que `marquerInterne` — à une différence près : « hors gestion » porte sur un
   * MESSAGE (migration 266), pas sur l'échange. Le message envoyé n'existe pas encore en base au moment où l'on
   * envoie : c'est la relève qui le capturera. On retient donc l'intention, et le rattrapage la pose ensuite.
   *
   * ⚠️ AU MIEUX-EFFORT, APRÈS LE MESSAGE PARTI : rien ici ne peut rendre un échec. Absente ⇒ rien n'est retenu,
   * et le mail restera « à classer » dans le fil — ce qui se répare d'un geste, contrairement à un mail renvoyé.
   */
  marquerHorsGestion?(o: { envoiId: number; auteur: Auteur }): Promise<void>;
  /** Le journal MÉTIER : qui, à qui, quand, quel objet — et SUR QUOI la ligne se range (`envoiId`). */
  journaliser(l: {
    auteur: Auteur; objet: string; destinataires: string[]; issue: 'envoye' | 'echec'; envoiId: number;
    /** LOT 5-PJ-ENVOI — les NOMS des pièces parties avec le message. Vide = aucune. */
    pieces?: string[];
  }): Promise<void>;
  /**
   * SIGNALE un geste d'après-envoi qui a échoué — au journal DU SERVEUR, jamais à l'écran. Ne doit RIEN lever : c'est
   * le dernier filet, et un filet qui se déchire ne sert à rien.
   */
  incident(etape: EtapeApresEnvoi, e: unknown): void;
  maintenant(): Date;
  alea(): string;
}

/** Les gestes qui suivent l'acceptation de Gmail. Nommés, parce qu'un incident doit dire LEQUEL a manqué. */
export type EtapeApresEnvoi = 'finaliser' | 'brouillon' | 'journal' | 'classement'
  // 🔴 LOT RATTACHER-EN-ECRIVANT — la demande « Interne » pour un message neuf : même filet que le classement.
  | 'interne'
  // 🔴 LOT CLASSER-AVANT-ENVOI — « hors gestion » hérité d'une conversation déjà marquée ainsi : même filet.
  | 'hors_gestion'
  // ⚠️ `signature` N'EST PAS UNE ÉTAPE D'APRÈS-ENVOI : elle vient AVANT. Elle est dans cette liste parce qu'elle
  //    emprunte le même filet (`incident`) — signaler sans jamais faire échouer — et qu'un second mécanisme pour
  //    dire la même chose serait un second endroit où regarder.
  | 'signature'
  // ⚠️ `images_citees` NON PLUS n'est pas une étape d'après-envoi : elle vient avant, et emprunte le même filet,
  //    pour la même raison que `signature` — un second mécanisme pour dire la même chose serait un second endroit
  //    où regarder le jour où une image manque.
  | 'images_citees';

export type IssueEnvoi =
  | { ok: true; envoi: EnvoiEnBase; deja: boolean }
  | { ok: false; motif: string; code: 'droit' | 'invalide' | 'sans_jeton' | 'refus_gmail' };

/** La phrase montrée quand la connexion Google n'est pas faite. Une seule formulation, à l'écran comme dans la route. */
export const MENTION_SANS_JETON =
  'Envoi impossible : la connexion Google de gestion@ n’est pas encore faite — voir docs/GUIDE_CONNEXION_GOOGLE_GESTION.md';

export async function envoyerMessage(d: DemandeEnvoi, auteur: Auteur, deps: DepsEnvoiComplet): Promise<IssueEnvoi> {
  // ① LE DROIT, relu en base. Avant tout le reste : rien ne doit être écrit au nom de quelqu'un qui n'a pas le droit.
  if (!await deps.peutEnvoyer()) {
    return { ok: false, code: 'droit', motif: 'Vous n’avez pas le droit d’envoyer au nom de gestion@.' };
  }

  // ② LE BROUILLON EST-IL ENVOYABLE ? L'écran l'a déjà vérifié ; ici c'est l'autorité, pas une politesse.
  const pret = pretAEnvoyer(d);
  if (!pret.pret) return { ok: false, code: 'invalide', motif: pret.motif };

  /**
   * ══ 🔴🔴 ②bis LOT CLASSER-AVANT-ENVOI — LE MAIL EST-IL CLASSÉ ? ═══════════════════════════════════════════
   *
   * Demande d'Arno : « Ctrl/Cmd+Entrée et l'envoi programmé respectent la même règle, et LE SERVEUR LA VÉRIFIE
   * AUSSI (refus avec motif). »
   *
   * 🔴 ICI, ET PAS SEULEMENT À L'ÉCRAN. Le bouton grisé évite une erreur ; cette ligne-ci est la seule qu'un
   * navigateur ne puisse pas contourner — un onglet resté ouvert avant ce lot, une requête rejouée, un script.
   * C'est le même raisonnement que l'étape ② juste au-dessus, et il vaut exactement autant.
   *
   * 🔴 ET AVANT TOUTE ÉCRITURE : le refus est rendu avant d'ouvrir la ligne d'envoi (④), donc rien n'est écrit
   * pour un message qui ne partira pas. Piège du dépôt : `withTransaction` commite au retour normal.
   *
   * ⚠️ `code: 'invalide'`, comme le refus d'un brouillon incomplet : du point de vue de l'appelant, c'est la
   * même nature de refus — quelque chose manque, et c'est dit en toutes lettres.
   */
  const nonClasse = refusSiNonClasse(d);
  if (nonClasse !== null) return { ok: false, code: 'invalide', motif: nonClasse };

  // ③ LA CONNEXION GOOGLE. Sans elle on ne prétend rien : on le DIT, et le brouillon reste où il est.
  const jeton = await deps.jetonAcces();
  if (jeton === null) return { ok: false, code: 'sans_jeton', motif: MENTION_SANS_JETON };

  const de = await deps.expediteur();
  const ancrage = await deps.ancrage(d.repondAMessageId);
  const messageId = fabriquerMessageId(domaineDe(de.adresse), deps.alea(), deps.maintenant());
  const references = chainerReferences(ancrage.references, ancrage.messageIdRfc);

  // ④ LA LIGNE, AVANT L'APPEL. Et c'est la base qui tranche le double-clic.
  const envoi = await deps.ouvrirEnvoi({
    cleIdempotence: d.cleIdempotence, brouillonId: d.brouillonId, filId: d.filId,
    repondAMessageId: d.repondAMessageId, messageIdRfc: messageId,
    inReplyTo: ancrage.messageIdRfc, references,
    a: d.a, cc: d.cc, cci: d.cci, objet: d.objet,
  }, auteur);
  // 🔴 DOUBLE-CLIC : la ligne existait déjà. On ne renvoie RIEN — on rend l'issue du premier clic.
  if (envoi.deja) return { ok: true, envoi, deja: true };

  // Les gestes d'après-appel, AU MIEUX-EFFORT. Défini ici parce que la lecture des pièces peut déjà en avoir besoin.
  const auMieux = async (etape: EtapeApresEnvoi, f: () => Promise<void>): Promise<void> => {
    try { await f(); } catch (e) { try { deps.incident(etape, e); } catch { /* le filet ne se déchire pas */ } }
  };

  // ④bis LES PIÈCES, au dernier moment (voir `DepsEnvoiComplet.pieces`).
  //   ⚠️ UNE LECTURE QUI ÉCHOUE N'ENVOIE PAS UN MESSAGE AMPUTÉ : mieux vaut un refus clair qu'un transfert dont la
  //   pièce manque sans que personne ne s'en aperçoive avant le correspondant.
  let pieces: PieceAEnvoyer[] = [];
  if (deps.pieces) {
    try {
      pieces = await deps.pieces(d);
    } catch (e) {
      const motif = `Les pièces jointes n’ont pas pu être lues : ${e instanceof Error ? e.message : String(e)}`;
      await auMieux('finaliser', () => deps.finaliser(envoi.id, { etat: 'echec', erreur: motif }));
      return { ok: false, code: 'invalide', motif };
    }
  }

  /**
   * ══ 🔴 LOT ETOILE-ET-SIGNATURE — LA SIGNATURE PART AVEC SES IMAGES ═══════════════════════════════════════════
   *
   * Le corps porte NOS adresses de relais (`…/signature/image?rang=N`), posées à l'insertion dans l'éditeur et
   * conservées telles quelles par les réponses, les transferts et les brouillons rouverts. On les remplace ici,
   * au dernier moment, par des `cid:` — et les octets partent dans le message.
   *
   * 🔴 UN ÉCHEC N'EMPÊCHE PAS L'ENVOI. Ce n'est qu'une image : si on ne la rapporte pas, elle est retirée du
   * corps et le message part sans elle. Faire échouer un envoi de locataire pour un logo serait absurde — mais on
   * le DIT, dans le journal du serveur, parce qu'Arno a demandé à le savoir.
   */
  let corpsHtml = d.corpsHtml ?? null;
  let imagesIntegrees: readonly ImageSignature[] = [];
  const rangsSignature = corpsHtml === null ? []
    : adressesDesImages(corpsHtml).map(rangSignature).filter((r): r is number => r !== null);
  if (deps.imagesSignature && corpsHtml !== null && rangsSignature.length > 0) {
    try {
      const r = await deps.imagesSignature({ rangs: rangsSignature, domaine: domaineDe(de.adresse), alea: deps.alea() });
      /**
       * ⚠️ CHAQUE IMAGE PORTE SON RANG, et c'est `corpsPourEnvoi` qui les rapproche. La liste rendue peut être
       * TROUÉE (un rang non rapporté en est simplement absent) : la rapprocher par POSITION décalerait tout ce
       * qui suit le trou — le logo prendrait la place de l'icône de téléphone, et personne ne le verrait avant
       * qu'un destinataire le dise.
       */
      const remis = corpsPourEnvoi(corpsHtml, r.images);
      corpsHtml = remis.html;
      imagesIntegrees = r.images;
      if (remis.manquantes.length > 0 || r.echecs.length > 0) {
        deps.incident('signature', new Error(
          `image(s) de signature non rapportée(s) : rang ${[...new Set([...remis.manquantes, ...r.echecs])].join(', ')} `
          + '— le message part sans elles, jamais avec une image cassée'));
      }
    } catch (e) {
      // 🔴 MÊME EN CAS DE PANNE, LE MESSAGE PART. On retire alors les images plutôt que de laisser des liens morts.
      deps.incident('signature', e);
      corpsHtml = corpsPourEnvoi(corpsHtml, []).html;
      imagesIntegrees = [];
    }
  }

  /**
   * ══ 🔴🔴 LOT MODALE-SUIVI-ET-DEFILEMENT (point 0) — LES IMAGES CITÉES, INCORPORÉES ELLES AUSSI ════════════════
   *
   * Même mécanique que la signature, juste après elle, et dans cet ordre : la signature a déjà remplacé SES
   * adresses par des `cid:`, donc celles qui restent et qui sont NÔTRES sont bien celles du corps cité.
   *
   * 🔴 UN ÉCHEC N'EMPÊCHE PAS L'ENVOI, comme pour la signature : la balise est retirée et le message part sans
   * cette image. Une photo manquante se remarque moins qu'un carré barré, et beaucoup moins qu'un envoi refusé.
   */
  let imagesDuCorps: readonly ImageCitee[] = [];
  const adressesCitees = corpsHtml === null ? [] : adressesDesImages(corpsHtml);
  if (deps.imagesCitees && corpsHtml !== null && citeesParmi(adressesCitees).length > 0) {
    try {
      const r = await deps.imagesCitees({
        adresses: adressesCitees, domaine: domaineDe(de.adresse), alea: deps.alea(),
      });
      const remis = corpsCitePourEnvoi(corpsHtml, r.images);
      corpsHtml = remis.html;
      imagesDuCorps = r.images;
      if (remis.manquantes.length > 0 || r.echecs.length > 0) {
        deps.incident('images_citees', new Error(
          `image(s) citée(s) non rapportée(s) : indice ${[...new Set([...remis.manquantes, ...r.echecs])].join(', ')} `
          + '— le message part sans elles, jamais avec une image cassée'));
      }
    } catch (e) {
      deps.incident('images_citees', e);
      corpsHtml = corpsCitePourEnvoi(corpsHtml, []).html;
      imagesDuCorps = [];
    }
  }

  // ⑤ GMAIL.
  const rfc822 = construireRfc822({
    de: de.adresse, deNom: de.nom, a: d.a, cc: d.cc, cci: d.cci,
    objet: d.objet, corps: d.corps, corpsHtml, messageId,
    inReplyTo: ancrage.messageIdRfc, references, pieces,
    // ⚠️ LES DEUX LISTES PARTENT ENSEMBLE dans le même `multipart/related`. Leurs `cid` ne peuvent pas se
    //   heurter : la signature préfixe « sig », les images citées « cit » (voir `cidCite`).
    imagesIntegrees: [...imagesIntegrees, ...imagesDuCorps],
  }, deps.alea());
  const issue = await deps.envoyer({ accessToken: jeton, rfc822, cci: d.cci, threadId: ancrage.threadId });

  // ⑥ ON FINALISE, dans les deux cas. Une ligne laissée `en_cours` est un envoi dont personne ne saura jamais rien.
  //   🔴 AU MIEUX-EFFORT, DES DEUX CÔTÉS. Côté échec aussi : si le journal refuse l'écriture, c'est le motif RÉEL du
  //   refus de Gmail qu'Arno doit lire, pas l'incident de journal qui l'aurait recouvert.
  const destinataires = [...d.a, ...d.cc, ...d.cci];

  if (!issue.ok) {
    await auMieux('finaliser', () => deps.finaliser(envoi.id, { etat: 'echec', erreur: issue.motif }));
    await auMieux('journal', () => deps.journaliser({ auteur, objet: d.objet, destinataires, issue: 'echec', envoiId: envoi.id, pieces: pieces.map((p) => p.nom) }));
    return { ok: false, code: 'refus_gmail', motif: issue.motif };
  }

  // 🔴 À PARTIR D'ICI, LE MESSAGE EST PARTI. Rien de ce qui suit ne peut plus rendre un échec.
  await auMieux('finaliser', () => deps.finaliser(envoi.id, { etat: 'envoye', gmailMessageId: issue.gmailMessageId }));
  if (d.brouillonId !== null) await auMieux('brouillon', () => deps.marquerBrouillonEnvoye(d.brouillonId as number));
  await auMieux('journal', () => deps.journaliser({ auteur, objet: d.objet, destinataires, issue: 'envoye', envoiId: envoi.id, pieces: pieces.map((p) => p.nom) }));
  /**
   * LOT REDACTION-GMAIL — LE CLASSEMENT DEMANDÉ PENDANT L'ÉCRITURE, posé en dernier et AU MIEUX-EFFORT. Il vient
   * après le journal exprès : c'est la pièce la moins critique de la série, et la seule qu'on puisse refaire à la
   * main en deux clics si elle manque.
   */
  const cibles = d.cibles ?? [];
  if (deps.classer && cibles.length > 0) {
    await auMieux('classement', () => (deps.classer as NonNullable<DepsEnvoiComplet['classer']>)({
      envoiId: envoi.id, gmailMessageId: issue.gmailMessageId ?? null, cibles, auteur,
    }));
  }
  /**
   * 🔴 LOT RATTACHER-EN-ECRIVANT — LA DEMANDE « INTERNE », au même endroit et au même titre que le classement :
   * en dernier, au mieux-effort, et sans qu'elle puisse jamais rendre un échec.
   */
  if (deps.marquerInterne && d.interne === true) {
    await auMieux('interne', () => (deps.marquerInterne as NonNullable<DepsEnvoiComplet['marquerInterne']>)({
      envoiId: envoi.id, auteur,
    }));
  }
  /**
   * 🔴 LOT CLASSER-AVANT-ENVOI — « HORS GESTION » HÉRITÉ, retenu de la même façon et pour la même raison. Le
   * message envoyé n'existe pas encore en base : la relève le capturera, et le rattrapage posera la marque.
   */
  if (deps.marquerHorsGestion && d.horsGestion === true) {
    await auMieux('hors_gestion',
      () => (deps.marquerHorsGestion as NonNullable<DepsEnvoiComplet['marquerHorsGestion']>)({
        envoiId: envoi.id, auteur,
      }));
  }
  return { ok: true, envoi: { ...envoi, etat: 'envoye' }, deja: false };
}
