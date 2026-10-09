/**
 * MODULE « GESTION » — LOT 4d-C : RENDRE UN MAIL LISIBLE À L'ÉCRAN. Fonctions PURES.
 *
 * 🔴 RIEN N'EST TOUCHÉ EN BASE. Tout ce qui suit est de l'AFFICHAGE : le corps capturé reste intact, les pièces
 * restent toutes enregistrées. Un mail illisible à l'écran reste un mail complet dans la base — c'est la règle du
 * module (on ne supprime jamais) appliquée à la présentation.
 *
 * Trois gênes, mesurées à l'usage par Arno sur la vraie boîte :
 *   ① les références techniques d'images ([cid:…], [https://…googleusercontent.com/…]) polluent chaque signature ;
 *   ② le TEXTE CITÉ répète tout l'historique sous chaque réponse — on relit six fois la même chose ;
 *   ③ les images de signature (image001.png, logos) se mêlent aux vraies pièces jointes et les noient.
 */

/** Ce qu'on affiche d'un corps de mail : la partie neuve, et l'historique qu'on replie derrière un bouton. */
export interface CorpsLisible {
  /** Ce que la personne a VRAIMENT écrit cette fois-ci. */
  visible: string;
  /** L'historique cité, ou `null` s'il n'y en a pas. Jamais supprimé : replié. */
  cite: string | null;
}

/** Références techniques d'images, telles qu'elles apparaissent dans le texte brut d'un mail. */
const REFS_IMAGES: RegExp[] = [
  /\[cid:[^\]]*\]/gi,                                    // [cid:image001.png@01DA…]
  /\[image:[^\]]*\]/gi,                                  // [image: logo.png]
  /\[https?:\/\/[^\]]*\]/gi,                             // [https://…googleusercontent.com/…]
  /<https?:\/\/[^>\s]*(?:googleusercontent|gstatic)[^>\s]*>/gi,
];

/**
 * ① Retire les RÉFÉRENCES d'images, pas les liens utiles. Un lien entre crochets dans un mail est presque toujours
 * une image inline recrachée par le convertisseur texte ; un lien qu'on veut lire, lui, est écrit en clair.
 * Les crochets vidés ne laissent pas de trous : les espaces qui se retrouvent doublés sont resserrés.
 */
export function masquerReferencesImages(texte: string, marqueur = ''): string {
  let out = texte;
  for (const motif of REFS_IMAGES) out = out.replace(motif, marqueur);
  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[ \t]+$/gm, '');
}

/**
 * Les marques d'un HISTORIQUE CITÉ. Volontairement peu nombreuses et très sûres : mieux vaut laisser passer une
 * citation que replier par erreur ce que quelqu'un vient d'écrire.
 */
const DEBUTS_DE_CITATION: RegExp[] = [
  /^\s*>/,                                                        // la citation classique
  /^\s*Le\s.+\s+a\s+écrit\s*:\s*$/i,                              // « Le 21 septembre 2026, Mme M. a écrit : »
  /^\s*On\s.+\s+wrote\s*:\s*$/i,
  /^\s*-{2,}\s*(Message d'origine|Original Message|Message transféré|Forwarded message)\s*-{2,}/i,
  /^\s*_{5,}\s*$/,                                                // la barre d'Outlook
  /^\s*De\s*:\s*\S/i,                                             // l'en-tête recopié par Outlook
  /^\s*From\s*:\s*\S/i,
];

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-4, POINT 5 — L'ATTRIBUTION QUE GMAIL COUPE EN DEUX ═══════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE LA MESURE DIT (base du 05/10/2026, sur les 11 253 messages portant une attribution) :
 *   · 5 374 — soit presque LA MOITIÉ — l'ont coupée en deux lignes, parce que Gmail replie son texte à 72
 *     colonnes sans se soucier de la phrase : « Le mar. 29 sept. 2026 à 16:36, Gestion <…> a » puis « écrit : ».
 *   · 544 font la même chose sur « wrote : ».
 *
 * 🔴 CONSÉQUENCE AVANT CE LOT : la coupure ne se faisait pas sur l'attribution (aucune ligne ne matchait), mais
 * une ligne plus bas, sur le premier « > ». L'historique partait donc bien — mais les DEUX LIGNES D'EN-TÊTE
 * restaient collées sous la signature, et on lisait « Philippe Douaud / 92800 Puteaux / Le mar. 29 sept. 2026 à
 * 16:36, Gestion CRITERIMMO <gestion@criterimmo.fr> a / écrit : ». Mesuré sur cinq mails réels.
 *
 * 🔴 LA RÈGLE NE CHANGE PAS, SON APPLICATION DEVIENT INSENSIBLE AU REPLI : les deux motifs d'attribution sont
 * essayés aussi sur la ligne RECOLLÉE avec la suivante, et avec les deux suivantes (une adresse longue peut
 * occuper un repli à elle seule). Ce ne sont pas de nouveaux motifs : ce sont les mêmes, sur un texte dont on a
 * défait le repli.
 *
 * ⚠️ POURQUOI SEULEMENT CES DEUX MOTIFS. Ils sont ANCRÉS AUX DEUX BOUTS (`^…$`) : le recollage ne peut donc
 * reconnaître qu'une phrase qui commence par « Le »/« On » ET se termine par « a écrit : »/« wrote : ». Les
 * autres motifs n'ont pas d'ancre finale (`De :`, la barre Outlook) — les recoller élargirait ce qu'ils
 * acceptent, et on se mettrait à replier du texte écrit. Un repli ne se défait que là où il est sans risque.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
const ATTRIBUTIONS_REPLIABLES: RegExp[] = [
  /^\s*Le\s.+\s+a\s+écrit\s*:\s*$/i,
  /^\s*On\s.+\s+wrote\s*:\s*$/i,
];
/** Nombre de lignes suivantes qu'on accepte de recoller pour reconnaître UNE attribution repliée. */
const REPLIS_RECOLLES = 2;

/** `true` si la ligne `i`, seule ou recollée avec la ou les suivantes, est un début de citation. */
function estDebutDeCitation(lignes: readonly string[], i: number): boolean {
  if (DEBUTS_DE_CITATION.some((m) => m.test(lignes[i]))) return true;
  let recollee = lignes[i];
  for (let j = 1; j <= REPLIS_RECOLLES && i + j < lignes.length; j += 1) {
    recollee = `${recollee.trimEnd()} ${lignes[i + j].trim()}`;
    if (ATTRIBUTIONS_REPLIABLES.some((m) => m.test(recollee))) return true;
  }
  return false;
}

/** Bornes de sûreté : au-delà, on n'analyse plus, on affiche. */
const MAX_LIGNES = 400;

/**
 * ② Sépare ce qui vient d'être écrit de l'HISTORIQUE CITÉ, qui sera replié à l'écran.
 *
 * La coupure se fait à la PREMIÈRE marque de citation, et tout ce qui suit part avec elle — c'est le comportement
 * d'un client de messagerie, et c'est ce qui évite de relire cinq fois le même échange en descendant une carte.
 *
 * DEUX PRUDENCES : on ne coupe jamais si la partie visible deviendrait vide (un mail qui n'est QU'une citation se
 * lit tel quel, sinon l'écran n'afficherait rien), et rien n'est jamais perdu — le cité est rendu, pas jeté.
 */
export function separerCitation(texte: string | null | undefined): CorpsLisible {
  const brut = (texte ?? '').replace(/\r\n/g, '\n');
  if (brut.trim() === '') return { visible: '', cite: null };

  const lignes = brut.split('\n');
  if (lignes.length > MAX_LIGNES) return { visible: brut.trim(), cite: null };

  const coupure = lignes.findIndex((_l, i) => estDebutDeCitation(lignes, i));
  if (coupure === -1) return { visible: brut.trim(), cite: null };

  const visible = lignes.slice(0, coupure).join('\n').trim();
  const cite = lignes.slice(coupure).join('\n').trim();
  // Un mail qui n'est QUE de la citation : on l'affiche en entier plutôt que de rendre un écran vide.
  if (visible === '') return { visible: brut.trim(), cite: null };
  return { visible, cite: cite === '' ? null : cite };
}

/** Le corps prêt à être affiché : références d'images masquées, puis citation mise de côté. */
export function corpsLisible(texte: string | null | undefined, marqueurImage = ''): CorpsLisible {
  const { visible, cite } = separerCitation(masquerReferencesImages(texte ?? '', marqueurImage));
  return { visible, cite };
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — LE TÉLÉPHONE QU'UNE SIGNATURE PORTE. PUR. ══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : la carte de contact qu'ouvre le « + » « est pré-remplie : nom, adresse,
 * téléphone trouvé en signature ».
 *
 * 🔴 POURQUOI ÇA VAUT LA PEINE, MESURÉ AVANT D'ÊTRE ÉCRIT. Sur les 485 cartes de contact actives du 05/10/2026,
 * **zéro** porte un téléphone : la colonne existe depuis la migration 304 et rien ne l'a jamais remplie. Or sur
 * les 183 adresses de ces cartes qui ont RÉELLEMENT écrit, **151 — 83 %** portent un numéro français dans le
 * corps de leurs mails. Le renseigner à la main 151 fois est exactement le travail qu'Arno veut éviter.
 *
 * 🔴 ON CHERCHE DANS LA **SIGNATURE**, ET NON DANS TOUT LE MAIL, et la nuance est le cœur de la fonction : un
 * numéro cité au milieu d'un message est celui d'un plombier, d'un locataire, d'une assurance — pas celui de
 * l'expéditeur. Le sien est en bas, sous son nom. On ne regarde donc que les DERNIÈRES lignes de la partie
 * VISIBLE (jamais la citation : le numéro y serait celui de quelqu'un d'autre, à coup sûr).
 *
 * 🔴 LE DERNIER TROUVÉ GAGNE. Une signature porte parfois deux numéros (fixe puis mobile, ou standard puis
 * direct) ; le plus bas est le plus personnel dans la très grande majorité des signatures françaises.
 *
 * ⚠️ `null` EST UNE RÉPONSE, PAS UN ÉCHEC : la plupart des mails n'ont pas de signature téléphonée, et le champ
 * reste alors vide pour qu'un humain le remplisse. Inventer un numéro serait bien pire que ne rien proposer.
 *
 * ⚠️ LE FORMAT EST CONSERVÉ TEL QUEL, espaces et points compris. Normaliser serait un second juge du format
 * d'un numéro, alors que `telephoneAffichage` tient déjà ce rôle dans ce dépôt pour l'affichage — et que la
 * carte, elle, stocke ce que l'humain valide.
 */

/** Combien de lignes de bas de message on considère comme la zone de signature. */
const LIGNES_DE_SIGNATURE = 12;

/**
 * Un numéro français : `+33` ou `0`, un chiffre de tête non nul, puis quatre paires. Les séparateurs admis sont
 * l'espace, le point et le tiret — les trois que les signatures emploient.
 *
 * ⚠️ ANCRÉ SUR UNE FRONTIÈRE NON NUMÉRIQUE DES DEUX CÔTÉS : sans cela, « 0123456789012 » (un numéro de dossier,
 * un SIRET) rendrait ses dix premiers chiffres comme un téléphone.
 *
 * ⚠️ `+33 (0) 1 …` EST ADMIS, et il l'est parce que la mesure l'a imposé : ce format est courant dans les
 * signatures professionnelles françaises, et la première version du motif le laissait passer — elle rendait
 * `null` sur une signature qui portait bel et bien un numéro. Le `(0)` est optionnel et ne vaut qu'après `+33`.
 */
const TELEPHONE_FR = /(?<![\d+])(?:\+33(?:\s?\(0\))?|0)\s?[1-9](?:[ .-]?\d{2}){4}(?!\d)/g;

export function telephoneEnSignature(texte: string | null | undefined): string | null {
  const { visible } = corpsLisible(texte ?? '');
  if (visible.trim() === '') return null;
  const lignes = visible.split('\n');
  const bas = lignes.slice(Math.max(0, lignes.length - LIGNES_DE_SIGNATURE)).join('\n');
  const trouves = bas.match(TELEPHONE_FR);
  if (trouves === null || trouves.length === 0) return null;
  return trouves[trouves.length - 1].trim();
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — L'ADRESSE POSTALE EN SIGNATURE ═════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : le formulaire du « + » est « pré-rempli depuis le pré-remplissage : nom et prénom
 * séparés si possible, e-mail, téléphone ET ADRESSE trouvés dans la signature ».
 *
 * 🔴 MESURÉ AVANT D'ÊTRE ÉCRIT, sur la vraie base le 05/10/2026 : sur les **187 adresses** qui portent une carte
 * de contact et qui ont RÉELLEMENT écrit, **65 (35 %)** laissent une adresse postale COMPLÈTE (voie + code postal
 * + commune) dans la zone de signature VISIBLE de l'un de leurs quatre derniers mails. C'est un tiers des fiches
 * dont trois champs se remplissent tout seuls.
 *
 * ═══ 🔴 LA VOIE EST EXIGÉE, ET C'EST LA MESURE QUI L'A TRANCHÉ ═══════════════════════════════════════════════════
 *
 * Ma première version acceptait « code postal + commune » seuls : **6 adresses** de plus, et je suis allé les
 * regarder une par une. Elles donnaient « 92270 Bois colombes Bonjour », « 92309 LEVALLOIS PERRET CEDEX
 * Significations », « 21078 DIJON Cedex » — des bouts d'en-tête de courrier recopiés, pas des adresses. Six
 * pré-remplissages faux contre six champs gagnés : on exige donc la voie, et sans elle on ne propose RIEN.
 *
 * 🔴 LA VOIE SE CHERCHE À DEUX ENDROITS, parce que les signatures françaises l'écrivent de deux façons :
 *   · sur la MÊME ligne, avant le code postal — « 2 rue Mars et Roty, 92800 Puteaux » ;
 *   · sur la ligne AU-DESSUS — « 11 BOULEVARD RICHARD WALLACE » puis « 92800 PUTEAUX ».
 * Les deux formes sont dans la base, et n'en lire qu'une aurait divisé la récolte par deux.
 *
 * ⚠️ LA CITATION EST ÉCARTÉE PAR `corpsLisible`, COMME POUR LE TÉLÉPHONE, et ici ce n'est pas un détail : les
 * premiers exemples que j'ai regardés en SQL brut étaient l'adresse du GESTIONNAIRE, recopiée dans le mail cité
 * par quelqu'un d'autre. Pré-remplir la fiche d'un contact avec l'adresse de son interlocuteur serait pire que
 * de la laisser vide.
 *
 * ⚠️ LE DERNIER TROUVÉ GAGNE, comme pour le téléphone : la signature est en bas, et ce qui est plus haut est du
 * texte de message.
 *
 * ⚠️ `null` EST UNE RÉPONSE, PAS UN ÉCHEC : deux tiers des contacts n'ont pas d'adresse trouvable, et les trois
 * champs restent alors vides — ils sont FACULTATIFS pour un contact (règle d'Arno). Inventer une adresse serait
 * bien pire que ne rien proposer.
 *
 * ⚠️ RIEN N'EST MIS EN FORME ICI : la commune garde sa casse, la voie ses abréviations. Le formulaire applique
 * `communeFormatee` et `codePostalFormate` sous les doigts, et deux mises en forme pour un champ auraient fini
 * par ne plus s'accorder. Cette fonction LIT, c'est tout. PUR.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface AdresseEnSignature {
  voie: string;
  codePostal: string;
  commune: string;
}

/**
 * Un code postal français suivi d'une commune : cinq chiffres isolés, puis un mot qui commence par une capitale.
 *
 * ⚠️ ANCRÉ SUR UNE FRONTIÈRE NON NUMÉRIQUE DES DEUX CÔTÉS, comme `TELEPHONE_FR` : sans cela, les cinq premiers
 * chiffres d'un numéro de dossier feraient un code postal.
 */
const CODE_POSTAL_ET_COMMUNE = /(?<!\d)(\d{5})(?!\d)[\s,]+(\p{Lu}[^\n]{0,60})/gu;

/** Les mots qui désignent une voie en France, quand le numéro de rue manque (« Place du Marché »). */
const MOT_DE_VOIE = new RegExp(
  '\\b(rue|avenue|av\\.|boulevard|bd|place|chemin|impasse|all[ée]e|route|quai|cours|square|villa|passage'
  + '|voie|r[ée]sidence|lieu-dit|zone|z\\.?a|z\\.?i)\\b', 'i');

/** Combien de lignes au-dessus du code postal on accepte de remonter pour trouver la voie. */
const LIGNES_AU_DESSUS = 3;

export function adresseEnSignature(texte: string | null | undefined): AdresseEnSignature | null {
  const { visible } = corpsLisible(texte ?? '');
  if (visible.trim() === '') return null;
  const toutes = visible.split('\n');
  const lignes = toutes.slice(Math.max(0, toutes.length - LIGNES_DE_SIGNATURE));

  const ressembleAUneVoie = (s: string): boolean => /^\d/.test(s) || MOT_DE_VOIE.test(s);
  /** On retire la ponctuation de liaison que les signatures mettent entre la voie et le code postal. */
  const propre = (s: string): string => s.replace(/^[\s,;:–—-]+/, '').replace(/[\s,;:–—-]+$/, '').trim();

  for (let i = lignes.length - 1; i >= 0; i -= 1) {
    const trouves = [...lignes[i].matchAll(CODE_POSTAL_ET_COMMUNE)];
    if (trouves.length === 0) continue;
    const d = trouves[trouves.length - 1];

    /* ① LA VOIE SUR LA MÊME LIGNE, avant le code postal — « 2 rue Mars et Roty, 92800 Puteaux ». */
    const avant = propre(lignes[i].slice(0, d.index ?? 0));
    let voie = ressembleAUneVoie(avant) ? avant : '';

    /* ② SINON LA LIGNE AU-DESSUS — « 11 BOULEVARD RICHARD WALLACE » puis « 92800 PUTEAUX ». On ne remonte
       qu'au-delà des lignes VIDES, et pas plus loin : au-dessus, c'est le nom, la fonction, le message. */
    if (voie === '') {
      for (let j = i - 1; j >= 0 && j >= i - LIGNES_AU_DESSUS; j -= 1) {
        const p = propre(lignes[j]);
        if (p === '') continue;
        if (ressembleAUneVoie(p)) voie = p;
        break;
      }
    }
    /* 🔴 SANS VOIE, ON NE PROPOSE RIEN : voir l'encadré — les six cas « code postal seul » de la base étaient
       tous des bouts d'en-tête de courrier, pas des adresses. */
    if (voie === '') continue;
    return { voie, codePostal: d[1], commune: propre(d[2]).slice(0, 80) };
  }
  return null;
}

/** Ce qu'il faut savoir d'une pièce pour décider si c'est une vraie pièce ou un bout de signature. */
export interface PieceATrier {
  nomFichier: string;
  typeMime: string | null;
  tailleOctets: number | null;
  /**
   * ══ 🔴🔴 LOT ETOILE-SIGNATURES-PIECES — « LES OCTETS SONT DÉJÀ DANS LE CORPS » ═════════════════════════════
   *
   * `gestion_piece.integree` (migration 296), calculée une fois au dépôt : l'empreinte de cette image figure
   * parmi celles des images `data:` du corps. C'est le critère EXACT d'Arno — « référencée par un cid: du
   * HTML » —, lu à travers ce que mailparser a déjà fait pour nous (voir `imageDansLeCorps.ts`).
   *
   * ⚠️ ABSENTE OU `null` ⇒ COMPORTEMENT D'AVANT CE LOT, À LA LETTRE. Sans la migration 296, sans la passe de
   * rattrapage, ou sur une pièce sans empreinte, on retombe sur la règle de nom/taille ci-dessous. Ne pas savoir
   * n'est pas une raison de retirer une pièce d'un compteur.
   */
  integree?: boolean | null;
  /**
   * ══ 🔴🔴 LOT IMAGES-INTEGREES-COMME-PIECES — LES DIMENSIONS, LE JOUR OÙ ON LES AURA ════════════════════════
   *
   * Arno : « une image intégrée compte comme pièce si elle fait au moins 30 Ko **OU** au moins 300 px sur son
   * plus petit côté ».
   *
   * ⚠️ AUCUNE COLONNE NE LES PORTE AUJOURD'HUI (`gestion_piece` n'a ni largeur ni hauteur), et les déduire
   * demanderait de relire 6 935 objets du stockage — c'est une migration et une passe, pas une ligne de règle.
   * Elles sont donc FACULTATIVES : absentes, seule la taille décide, et la règle est déjà écrite pour le jour
   * où elles arriveront. Le chiffre mesuré est dans le rapport du lot : sur 40 images intégrées de moins de
   * 30 Ko, **3** dépassent 300 px (≈ 520 sur les 6 935) — c'est ce que la moitié « dimensions » rattraperait.
   */
  largeurPx?: number | null;
  hauteurPx?: number | null;
}

/** Au-delà, une image n'est plus un logo de signature : c'est une photo qu'on a voulu envoyer. */
export const TAILLE_MAX_SIGNATURE = 10 * 1024;

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT IMAGES-INTEGREES-COMME-PIECES (09/10/2026) — CE QU'EST UNE IMAGE « SIGNIFICATIVE »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════

   CONSTAT D'ARNO, fil 36640 : une photo INTÉGRÉE au corps s'affiche dans le mail, mais n'apparaît ni dans le
   compteur « N pièces », ni dans la liste des pièces du message — on ne peut donc pas la ranger dans le Drive.

   🔴 CE N'ÉTAIT PAS UN DÉFAUT, C'ÉTAIT UNE RÈGLE — et c'est important pour comprendre la correction. Le lot
   ETOILE-SIGNATURES-PIECES (03/10/2026) écarte les images intégrées du compte, sur la demande d'Arno de ce
   jour-là : « les images intégrées au corps du mail ne sont PAS des pièces jointes ». La règle visait les
   logos de signature — et elle emportait les photos avec eux.

   🔴 LA NOUVELLE RÈGLE NE L'ANNULE PAS, ELLE LA BORNE : une image intégrée reste écartée, SAUF si elle est
   significative. « Les petites images sont exclues : logos, icônes de signature (adresse, téléphone…), pixels
   de suivi, émojis » (Arno) — ce sont exactement celles qui ne passent ni les 30 Ko ni les 300 px.

   ⚠️ ELLE NE S'APPLIQUE QU'AUX IMAGES INTÉGRÉES, et c'est délibéré. Mesuré sur la base le 09/10/2026 :
   **1 051** images NON intégrées de plus de 30 Ko portent un nom de signature (`image001.png`…) et sont
   écartées par la règle de NOM. Les faire réapparaître serait un changement qu'Arno n'a pas demandé, sur des
   pièces dont rien ne dit qu'elles sont dans le corps.
*/

/** Au moins 30 Ko : la borne d'Arno, en octets. */
export const TAILLE_IMAGE_SIGNIFICATIVE = 30 * 1024;
/** Ou au moins 300 px sur le PLUS PETIT côté — une image qu'on a voulu montrer, pas un picto. */
export const COTE_IMAGE_SIGNIFICATIF = 300;

/**
 * UNE IMAGE QU'ON A VOULU ENVOYER, par opposition à un ornement. PUR.
 *
 * ⚠️ « OU », PAS « ET » (Arno) : une capture de 827 × 414 qui pèse 28 Ko est significative, et une photo de
 * 200 Ko l'est aussi même si on ignore ses dimensions. Les deux critères se complètent, aucun ne commande.
 *
 * ⚠️ UNE TAILLE INCONNUE N'EST PAS UNE PETITE TAILLE : sans octets ni dimensions, on ne conclut RIEN ici, et
 * c'est la règle d'avant qui tranche. Ne pas savoir n'a jamais été une raison de retirer une pièce.
 */
export function estImageSignificative(p: PieceATrier): boolean {
  const octets = p.tailleOctets ?? 0;
  if (octets >= TAILLE_IMAGE_SIGNIFICATIVE) return true;
  const l = p.largeurPx ?? 0;
  const h = p.hauteurPx ?? 0;
  return l > 0 && h > 0 && Math.min(l, h) >= COTE_IMAGE_SIGNIFICATIF;
}

/**
 * ══ 🔴 LES TROIS MORCEAUX DE LA RÈGLE, ÉCRITS UNE SEULE FOIS ════════════════════════════════════════════════════
 *
 * Ils servent DEUX FOIS : à `estImageDeSignature` juste en dessous (en TypeScript, sur une pièce qu'on tient), et
 * à `sqlEstVraiePiece` (en SQL, pour filtrer une liste avant de la découper en pages). Les écrire deux fois
 * donnerait deux définitions de « pièce jointe » — et c'est exactement le défaut qu'Arno a signalé : la recherche
 * « Pièce jointe = Avec » comptait les logos de signature, l'écran ne les comptait pas, et la ligne trouvée
 * affichait un trombone GRIS (« les pièces sont ailleurs ») sur un mail censé en porter une.
 *
 * ⚠️ LES MOTIFS SONT DES CHAÎNES, PAS DES `RegExp` LITTÉRALES, et c'est ce qui rend les deux rendus possibles :
 * la même syntaxe se compile en `RegExp` ici et se colle dans un `~*` de PostgreSQL là-bas. On s'en tient donc au
 * sous-ensemble commun (classes, alternatives, ancres, `[\w.-]`) — aucune construction propre à JavaScript.
 */
const EXTENSIONS_IMAGE = '(png|jpe?g|gif|bmp|webp)';
const PREFIXES_DE_SIGNATURE = '(image|oledata|logo|signature|outlook-)';
/** Les noms que produisent Outlook et consorts pour les images intégrées. */
const NOMS_DE_SIGNATURE = new RegExp(`^${PREFIXES_DE_SIGNATURE}[\\w.-]*\\.${EXTENSIONS_IMAGE}$`, 'i');
const EXTENSION_IMAGE_FINALE = new RegExp(`\\.${EXTENSIONS_IMAGE}$`, 'i');

/**
 * ══ 🔴🔴 LA MÊME RÈGLE, EN SQL : « cette pièce est-elle une VRAIE pièce ? » ═══════════════════════════════════
 *
 * Rendue depuis les MÊMES motifs et la MÊME constante de taille que `estImageDeSignature`. Ce n'est pas une
 * seconde écriture « équivalente » : c'est le même texte, rendu dans l'autre langue. Changer un préfixe de
 * signature change les deux du même geste.
 *
 * 🔴 À QUOI ÇA SERT, ET POURQUOI ÇA NE POUVAIT PAS SE FAIRE EN TypeScript. La recherche pagine : elle lit
 * vingt-cinq lignes et s'arrête. Filtrer les fausses pièces APRÈS la lecture rendrait des pages de dix-neuf
 * lignes, et un total qui ne correspondrait à rien. La condition doit donc entrer dans le `WHERE`.
 *
 * ⚠️ LES JUMEAUX macOS (« ._bail.pdf ») SONT ÉCARTÉS ICI AUSSI — c'est une règle DIFFÉRENTE (ce ne sont pas des
 * pièces mal rangées, ce sont des doubles techniques), déjà écrite en SQL dans `piecesVraiesDesFils`. Les deux
 * conditions se posent ensemble, parce que « vraie pièce » veut dire les deux.
 *
 * ⚠️ `~*` (insensible à la casse) ET NON `~` : les mêmes noms arrivent en « IMAGE001.PNG » aussi souvent qu'en
 * minuscules, et le motif JavaScript porte déjà le drapeau `i`.
 */
export function sqlEstVraiePiece(alias = 'p', avecIntegree = false): string {
  const estImage = `(lower(coalesce(${alias}.type_mime, '')) LIKE 'image/%'`
    + ` OR ${alias}.nom_fichier ~* '\\.${EXTENSIONS_IMAGE}$')`;
  const nomDeSignature = `${alias}.nom_fichier ~* '^${PREFIXES_DE_SIGNATURE}[\\w.-]*\\.${EXTENSIONS_IMAGE}$'`;
  const tropPetite = `(${alias}.taille_octets IS NOT NULL AND ${alias}.taille_octets > 0`
    + ` AND ${alias}.taille_octets < ${TAILLE_MAX_SIGNATURE})`;
  /**
   * 🔴🔴 LOT ETOILE-SIGNATURES-PIECES — LA MÊME UNION QU'EN TypeScript, DANS LE MÊME ORDRE.
   *
   * ⚠️ `avecIntegree` EST UN DRAPEAU, PAS UNE SONDE : cette fonction est PURE (elle rend du texte), et une sonde
   * la rendrait asynchrone pour tous ses appelants. C'est l'appelant qui interroge le schéma et le dit ici —
   * exactement le patron de `sqlNomAffiche`.
   */
  /**
   * ══ 🔴🔴 LOT IMAGES-INTEGREES-COMME-PIECES — LA MÊME BORNE QU'EN TypeScript, DANS LE MÊME ORDRE ════════════
   *
   * Une image INTÉGRÉE est écartée SAUF si elle est significative ; une image NON intégrée garde, au caractère
   * près, la règle d'avant ce lot (nom de signature ou taille minuscule). Les deux branches sont écrites
   * séparément exprès : mêler les deux aurait fait réapparaître 1 051 pièces non intégrées que personne n'a
   * demandé de remettre.
   *
   * ⚠️ LES DIMENSIONS N'EXISTENT PAS EN BASE : seule la taille entre ici. Le jour où les colonnes arriveront,
   * c'est cette expression-ci et `estImageSignificative` qu'il faudra élargir — les deux, ensemble, parce que
   * l'écran et le SQL doivent toujours compter la même chose.
   */
  const significative = `${alias}.taille_octets >= ${TAILLE_IMAGE_SIGNIFICATIVE}`;
  const integreeEcartee = avecIntegree
    ? `(coalesce(${alias}.integree, false) AND NOT (${significative})) OR `
    : '';
  const pasIntegree = avecIntegree ? `NOT coalesce(${alias}.integree, false) AND ` : '';
  // Une pièce est VRAIE quand elle n'est pas un jumeau macOS, et qu'elle n'est pas une image de signature.
  return `${alias}.nom_fichier NOT LIKE '._%'`
    + ` AND NOT (${estImage} AND (${integreeEcartee}(${pasIntegree}(${nomDeSignature} OR ${tropPetite}))))`;
}

/**
 * ③ Une image INTÉGRÉE À LA SIGNATURE, par opposition à une vraie pièce jointe.
 *
 * Deux indices, et il faut être une IMAGE dans les deux cas : le nom fabriqué (image001.png, logo.gif…), ou une
 * taille si petite qu'aucune photo utile n'y tiendrait. Un PDF, un document, une photo de 300 ko restent des pièces,
 * quel que soit leur nom.
 *
 * ⚠️ TRIER N'EST PAS SUPPRIMER : ces images restent enregistrées, servies et consultables — simplement rangées à
 * part et repliées, pour que « 2 pièces jointes » ne veuille pas dire « deux logos ».
 */
export function estImageDeSignature(p: PieceATrier): boolean {
  const type = (p.typeMime ?? '').toLowerCase();
  const nom = (p.nomFichier ?? '').trim();
  const estImage = type.startsWith('image/') || EXTENSION_IMAGE_FINALE.test(nom);
  if (!estImage) return false;
  /**
   * ══ 🔴🔴 LOT ETOILE-SIGNATURES-PIECES — LE CRITÈRE EXACT PASSE EN PREMIER ═══════════════════════════════════
   *
   * « Ses octets sont déjà posés dans le corps » ne se devine pas : cela se vérifie, empreinte contre empreinte.
   * Quand on le sait, on n'a plus besoin de juger sur un nom ni sur une taille.
   *
   * 🔴 LES DEUX RÈGLES SE RÉUNISSENT, ELLES NE SE REMPLACENT PAS, et c'est un choix. Le recensement du
   * 03/10/2026 dit pourquoi : la règle exacte seule ÉCARTERAIT 2 345 images de plus (des pictos de 150 ko qu'on
   * comptait à tort), mais REMETTRAIT 871 au compte — des `wink.png` de 3 ko dont le corps ne porte pas les
   * octets, parce que le mail les désigne par une adresse distante. Les remettre serait une régression qu'Arno
   * n'a pas demandée. L'union n'écarte donc jamais moins qu'avant ce lot : aucune pièce ne RÉAPPARAÎT.
   */
  /**
   * 🔴🔴 LOT IMAGES-INTEGREES-COMME-PIECES — UNE IMAGE INTÉGRÉE **SIGNIFICATIVE** EST UNE PIÈCE.
   *
   * Et le `return` tranche ici, sans passer par la règle de NOM : sur les 5 020 images intégrées de plus de
   * 30 Ko de la base, **3 123 portent un nom de signature** (`image001.png` est le nom qu'Outlook donne à une
   * photo collée dans le corps). Les laisser tomber dans la règle suivante les aurait écartées de nouveau, et
   * la correction n'aurait rien corrigé.
   */
  if (p.integree === true) return !estImageSignificative(p);
  if (NOMS_DE_SIGNATURE.test(nom)) return true;
  return p.tailleOctets !== null && p.tailleOctets > 0 && p.tailleOctets < TAILLE_MAX_SIGNATURE;
}

/**
 * ══ 🔴🔴 LOT LECTURE-HTML-FIL-TROMBONE — CE QUE DIT LE TROMBONE D'UNE LIGNE DE LISTE. PUR. ════════════════════
 *
 * TROIS ÉTATS, DEMANDÉS PAR ARNO, et chacun répond à une question différente en parcourant la liste :
 *   · `ici`     — CE message-là porte une pièce. Le trombone est NOIR (blanc en thème Sombre) : on ouvre et on la
 *                 trouve. C'est le seul cas où l'on promet quelque chose.
 *   · `ailleurs`— la conversation en porte, mais pas le message affiché. Le trombone est GRIS : il invite à
 *                 chercher, il ne promet rien. C'est le défaut réparé — jusqu'ici le trombone comptait TOUT
 *                 l'échange, et l'on ouvrait un mail vide en croyant y trouver un bail.
 *   · `aucune`  — rien nulle part : pas de trombone du tout.
 *
 * ⚠️ LE NOMBRE AFFICHÉ EST CELUI DE L'ÉTAT. « 📎 2 » sur un trombone noir veut dire « deux pièces DANS CE
 * MESSAGE » ; sur un gris, « deux pièces AILLEURS ». Afficher le total dans les deux cas ferait lire « 2 » sur
 * une ligne dont le mail n'en porte qu'une.
 */
export type EtatTrombone =
  | { ou: 'ici'; nombre: number }
  | { ou: 'ailleurs'; nombre: number }
  | { ou: 'aucune' };

export function etatTrombone(piecesDuMessage: number, piecesAilleurs: number): EtatTrombone {
  if (piecesDuMessage > 0) return { ou: 'ici', nombre: piecesDuMessage };
  if (piecesAilleurs > 0) return { ou: 'ailleurs', nombre: piecesAilleurs };
  return { ou: 'aucune' };
}

/** L'infobulle du trombone, dans les mots d'Arno. PUR. */
export function motTrombone(e: EtatTrombone): string | null {
  if (e.ou === 'aucune') return null;
  const s = e.nombre > 1 ? 's' : '';
  return e.ou === 'ici'
    ? `Pièce${s} jointe${s} dans ce message`
    : `Pièce${s} jointe${s} ailleurs dans la conversation`;
}

/** Range les pièces d'un message en deux tas, dans leur ordre d'origine. PUR. */
export function trierPieces<T extends PieceATrier>(pieces: readonly T[]): { vraies: T[]; signatures: T[] } {
  const vraies: T[] = [];
  const signatures: T[] = [];
  for (const p of pieces) (estImageDeSignature(p) ? signatures : vraies).push(p);
  return { vraies, signatures };
}
