/**
 * MODULE « GESTION » — LOT RATTACHEMENT-2 : L'HISTORIQUE D'UN LOGEMENT, D'UN PROPRIÉTAIRE, D'UN ÉVÉNEMENT. PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'IL RÉPOND : « montre-moi TOUT ce qui s'est dit à propos de ce logement ». C'est la question pour laquelle la
 * trace des adresses (lot DRIVE-2-bis) et les rattachements (lot RATTACHEMENT-1) ont été construits. Mails AVEC et
 * SANS pièce jointe : souvent la décision est dans le mail, et la pièce n'en est que la preuve.
 *
 * 🔴 CE FICHIER EST ATTEINT PAR LE NAVIGATEUR : il est importé par un composant `'use client'`. Il ne doit donc jamais
 * rien importer qui tire `pg` — sans quoi webpack refuse de construire et TOUTE l'application tombe, écran de connexion
 * compris (incident du 24/09/2026). Le garde `clientBoundary.guard.test.ts` le surveille.
 *
 * ⚠️ LECTURE TOLÉRANTE, ÉCRITURE STRICTE, comme `ecranUrl.ts` : une adresse venue d'un signet de six mois ne doit
 * JAMAIS faire écran blanc — une valeur inconnue retombe sur le défaut.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { Cible, CibleSorte } from './rattachement';
/* 🔴🔴 LOT HISTORIQUE-BIEN-10, POINT 3 — le nom ET l'adresse d'un destinataire, séparés (module pur). */
import type { PersonneDuMail } from './adressesMessage';

/** Combien de mails par page. La frise se lit, elle ne se déroule pas : 25 suffit, et le reste se charge à la demande. */
export const PAGE_HISTORIQUE = 25;

/** Plafond de sûreté d'une page demandée par l'adresse. Au-delà, on borne — un `taille=100000` n'est pas une demande. */
export const PAGE_HISTORIQUE_MAX = 100;

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-11, POINT 5 — COMBIEN DE MAILS PORTEURS DE PIÈCES AU PLUS, POUR LE RÉSUMÉ ══════════
 *
 * Le résumé des pièces porte sur TOUTE la sélection, pas sur la page (règle d'Arno du 05/10/2026). Il lit donc
 * sa propre route, `/historique/pieces`, qui n'est pas paginée — et une lecture sans borne est une panne qui
 * attend.
 *
 * 🔴 LA BORNE EST MESURÉE, NON DEVINÉE — et mesurée SUR LA RÈGLE DE SÉLECTION, ce qui n'est pas un détail.
 * Recensement du 05/10/2026 sur les 338 biens qui portent du courrier, par `sqlLiensDuBien` (rattachement
 * confirmé, cible « lot », lien posé sur le mail) — c'est-à-dire exactement ce que la route lit :
 *
 *     pire cas  : **142 mails porteurs** (bien 421, celui de la demande) · le plus fourni en PIÈCES : 782 (282)
 *     médiane   : 14 pièces par bien
 *     au-delà de 300 pièces : 2 biens sur 338
 *
 * ⚠️ UNE PREMIÈRE MESURE, FAITE PAR LES CARTES DE CONTACT, ANNONÇAIT 2 735 MAILS PORTEURS SUR LE BIEN 281 : elle
 * était FAUSSE, et il faut dire pourquoi. Les cartes servent le FILTRE par parties ; elles ne font pas entrer un
 * mail dans un bien. Ce qui l'y fait entrer, c'est le rattachement — et par ce chemin-là, le bien 281 n'a rien
 * d'exceptionnel. Mesurer sur le mauvais axe surestimait le pire cas de vingt fois.
 *
 * ⚠️ 2 000 ET NON 142 : on ne cale pas une borne sur la mesure du jour (même règle qu'`INTERLOCUTEURS_MAX`
 * ci-dessous). Elle laisse quatorze fois le pire cas réel, et `tronque` reste écrit pour le jour où même cela ne
 * suffirait pas.
 *
 * ⚠️ ELLE VIT ICI, DANS LE MODULE PUR, PARCE QUE LA PHRASE AFFICHÉE LA NOMME (`motPorteeDuResume`) : le dépôt
 * borne sa requête avec ce nombre, l'écran l'écrit avec le même. Deux écritures auraient fini par se contredire
 * sous les yeux d'Arno.
 */
export const PORTEURS_DE_PIECES_MAX = 2000;

/**
 * Combien d'interlocuteurs au plus dans le filtre. Au-delà, l'écran DIT qu'il y en a d'autres.
 *
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-1 — RELEVÉ DE **60 À 120**, SUR UNE MESURE ════════════════════════════════════════
 *
 * MESURÉ EN BASE LE 04/10/2026, sur les rattachements confirmés de chaque logement : le bien le plus fourni —
 * le lot WIPPIMMO **155**, 130 mails — compte **76 adresses distinctes**. Les suivants en comptent 28, 22, 22,
 * 21… ; 76 est donc un cas réel, et nettement détaché.
 *
 * 🔴 CE QUE L'ANCIEN PLAFOND COÛTAIT, ET POURQUOI C'ÉTAIT GRAVE. À 60, la liste de CE bien-là perdait
 * **16 personnes**. Or `tronque` ne dit QUE « il y en a d'autres » : il ne les nomme pas et ne les rend pas
 * cochables. Le nouveau tableau de bord « PARTIES » coche des personnes pour filtrer le fil — une personne
 * absente de la liste est donc une personne qu'on ne peut PAS retrouver, sans qu'aucun écran ne dise laquelle.
 * C'est exactement la faute que le module s'interdit ailleurs (« la fenêtre de 30 jours DIT combien d'échanges
 * elle laisse de côté »).
 *
 * ⚠️ 120 ET NON 76 : on ne cale pas un plafond sur la mesure du jour. 120 laisse la place au double du cas réel
 * le plus fourni, et la mention `tronque` reste écrite pour le jour où même cela ne suffira pas.
 *
 * ⚠️ IL BORNE AUSSI `avec=` (voir `lireFiltres`) : cocher 76 personnes doit pouvoir s'écrire dans l'adresse,
 * sinon le filtre se tronquerait à la relecture — et l'écran montrerait un fil qui ne correspond plus aux cases.
 */
export const INTERLOCUTEURS_MAX = 120;

// ── LA CIBLE, DANS L'ADRESSE ────────────────────────────────────────────────────────────────────────────────────

/**
 * Comment une cible s'écrit dans l'adresse : `lot-282`, `proprio-339`, `carte-12`. Forme canonique, unique. PUR.
 *
 * ⚠️ LE SÉPARATEUR N'EST PAS UN DÉLIMITEUR DE CLÉ. Une clé WIPPIMMO peut contenir un tiret (les jeux d'épreuve en
 * portent : « J-1 »), donc la lecture coupe au PREMIER tiret et garde tout le reste. Couper au dernier, ou refuser les
 * clés non numériques, casserait silencieusement ces cibles-là.
 */
export function texteCible(c: Cible): string {
  /**
   * 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 3 — LA BRANCHE « locataire » EST EXPLICITE, et il le fallait : la
   * chaîne de conditions d'avant retombait sur « carte » pour TOUTE sorte qui n'était ni `lot` ni `proprietaire`.
   * Un locataire se serait écrit `carte-<clé>`, et l'adresse aurait désigné une carte inexistante.
   */
  const prefixe = c.sorte === 'lot' ? 'lot'
    : c.sorte === 'proprietaire' ? 'proprio'
      : c.sorte === 'locataire' ? 'locataire' : 'carte';
  return `${prefixe}-${c.sorte === 'evenement' ? String(c.id ?? 0) : c.cle ?? ''}`;
}

const PREFIXES: Record<string, CibleSorte> = {
  lot: 'lot', proprio: 'proprietaire', carte: 'evenement',
  // 🔴🔴 POINT 3 — l'historique par locataire. Voir `cibleLocataire` : une cible de LECTURE, jamais d'écriture.
  locataire: 'locataire',
};

/** La cible portée par une adresse. Valeur inconnue ⇒ `null`, jamais une erreur. PUR. */
export function cibleDepuisTexte(brut: string | null | undefined): Cible | null {
  const s = (brut ?? '').trim();
  const coupe = s.indexOf('-');
  if (coupe <= 0) return null;
  const sorte = PREFIXES[s.slice(0, coupe)];
  if (sorte === undefined) return null;
  const reste = s.slice(coupe + 1).trim();
  if (reste === '' || reste.length > 60) return null;

  if (sorte === 'evenement') {
    if (!/^[1-9]\d{0,15}$/.test(reste)) return null;
    const n = Number(reste);
    return Number.isSafeInteger(n) ? { sorte, cle: null, id: n } : null;
  }
  // Une clé WIPPIMMO : des lettres, des chiffres, et les quelques séparateurs qu'on y rencontre. Rien d'autre —
  //   on refuse plutôt que de laisser passer une chaîne arbitraire jusqu'à une requête.
  if (!/^[A-Za-z0-9_.:+-]+$/.test(reste)) return null;
  return { sorte, cle: reste, id: null };
}

// ── LES FILTRES ─────────────────────────────────────────────────────────────────────────────────────────────────

export type ChoixPieces = 'toutes' | 'avec' | 'sans';

export interface FiltresHistorique {
  /** Adresses cochées. Vide = tous les interlocuteurs. */
  interlocuteurs: string[];
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — LES EXPÉDITEURS ÉCARTÉS (« Notre agence » décochée) ════════════════
   *
   * DEMANDE D'ARNO (05/10/2026) : « Nouveau groupe “Notre agence” […] COCHÉES PAR DÉFAUT, décochables.
   * Agence décochée → les mails écrits par nous sont retirés du listing. »
   *
   * 🔴 C'EST UN FILTRE SUR L'EXPÉDITEUR, ET SUR LUI SEUL — pas sur « l'adresse apparaît dans le mail ». Nos
   * adresses sont des deux côtés de presque tous les mails du bien : les écarter dès qu'elles APPARAISSENT
   * aurait vidé le listing. Ce qu'Arno veut retirer, ce sont les mails que NOUS avons écrits.
   *
   * 🔴 ON NOMME CE QU'ON ÉCARTE, ET NON CE QU'ON GARDE, et c'est ce qui rend le défaut « tout coché » gratuit :
   * la liste est VIDE quand rien n'est décoché, donc l'adresse de la requête ne porte rien et le comportement
   * est exactement celui d'avant ce lot. Nommer les adresses gardées aurait obligé l'écran à les énumérer
   * toutes, et une adresse de l'agence apparue depuis serait née DÉCOCHÉE — l'inverse de la demande.
   *
   * ⚠️ IL S'APPLIQUE APRÈS `interlocuteurs`, ET LES DEUX SE COMPOSENT : cocher le locataire puis décocher
   * l'agence rend « les échanges du locataire, sauf ce que nous y avons écrit ». C'est la phrase d'Arno, mot
   * pour mot : « Les mails de l'agence n'apparaissent que s'ils font partie de ces échanges et que l'agence est
   * cochée. »
   */
  expediteursExclus: string[];
  /** Bornes de période, en `AAAA-MM-JJ`. `null` = pas de borne. */
  du: string | null;
  au: string | null;
  pieces: ChoixPieces;
  /**
   * 🔴 LOT FICHES-ANNUAIRE — ne garder que les mails dont l'ÉCHANGE porte un événement OUVERT. Éteint par défaut :
   * la « vie du bien » montre tout, et c'est un filtre qu'on allume pour trier, jamais un état de départ.
   */
  evenementOuvert: boolean;
  /** Recherche dans l'objet ET le texte du mail. Vide = pas de recherche. */
  texte: string;
  /**
   * POUR UN LOGEMENT : inclure aussi les mails rattachés à son PROPRIÉTAIRE. Éteint par défaut — un bailleur écrit
   * souvent pour ses comptes, sans rapport avec ce logement-là, et noyer la frise serait perdre le fil.
   */
  avecProprietaire: boolean;
  /**
   * POUR UN PROPRIÉTAIRE : inclure les mails de SES LOGEMENTS. ALLUMÉ par défaut — « l'historique d'un propriétaire »
   * sans ses logements ne montrerait que ses mails de gestion, c'est-à-dire presque rien de ce qui le concerne.
   */
  avecLogements: boolean;
  /** POUR UN PROPRIÉTAIRE : regrouper la frise par logement, d'un clic. Éteint par défaut : la frise est chronologique. */
  grouper: boolean;
  page: number;
  taille: number;
}

export const FILTRES_VIDES: FiltresHistorique = {
  interlocuteurs: [], expediteursExclus: [], du: null, au: null, pieces: 'toutes', texte: '',
  evenementOuvert: false,
  avecProprietaire: false, avecLogements: true, grouper: false,
  page: 0, taille: PAGE_HISTORIQUE,
};

/** Un jour `AAAA-MM-JJ`, ou `null`. On refuse plutôt que de deviner : « 03/07/2024 » n'est pas une date ISO. PUR. */
export function jourValide(brut: string | null | undefined): string | null {
  const s = (brut ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : s;
}

/**
 * Un entier positif ou nul, borné. Valeur absente ou absurde ⇒ le défaut. PUR.
 *
 * ⚠️ LE VIDE EST TRAITÉ AVANT LA CONVERSION, et ce n'est pas une précaution de style : `Number('')` vaut **0**, qui
 * est un entier positif parfaitement valide. Sans ce garde, `?taille=` (paramètre présent mais vide, ce qu'un
 * formulaire produit tout seul) rendrait une taille de zéro au lieu du défaut — et une page de zéro mail.
 */
export function entierBorne(brut: string | null | undefined, defaut: number, max: number): number {
  const s = (brut ?? '').trim();
  if (s === '') return defaut;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) return defaut;
  return Math.min(n, max);
}

/**
 * LES FILTRES PORTÉS PAR UNE ADRESSE (ou un corps de requête). Ne jette JAMAIS. PUR.
 *
 * ⚠️ LES INTERLOCUTEURS SONT NORMALISÉS ET DÉDOUBLONNÉS ICI : deux fois la même adresse dans l'adresse de la page ne
 * doit pas doubler les lignes de la frise, et une casse différente désigne la même personne.
 */
export function lireFiltres(p: URLSearchParams): FiltresHistorique {
  const brutPieces = p.get('pieces');
  return {
    interlocuteurs: [...new Set((p.get('avec') ?? '').split(',')
      .map((a) => a.trim().toLowerCase()).filter((a) => a !== ''))].slice(0, INTERLOCUTEURS_MAX),
    /* 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — bornée comme `avec`, et pour la même raison : un paramètre d'adresse
       vient du dehors, et une liste sans borne est une requête sans borne. */
    expediteursExclus: [...new Set((p.get('sauf') ?? '').split(',')
      .map((a) => a.trim().toLowerCase()).filter((a) => a !== ''))].slice(0, INTERLOCUTEURS_MAX),
    du: jourValide(p.get('du')),
    au: jourValide(p.get('au')),
    pieces: brutPieces === 'avec' || brutPieces === 'sans' ? brutPieces : 'toutes',
    evenementOuvert: p.get('evt') === 'ouvert',
    texte: (p.get('q') ?? '').trim().slice(0, 200),
    avecProprietaire: p.get('proprio') === '1',
    // ⚠️ ALLUMÉ SAUF SI ON DIT EXPLICITEMENT NON : l'absence du paramètre doit rendre le défaut, qui est « oui ».
    avecLogements: p.get('logements') !== '0',
    grouper: p.get('grouper') === '1',
    page: entierBorne(p.get('page'), 0, 10_000),
    taille: entierBorne(p.get('taille'), PAGE_HISTORIQUE, PAGE_HISTORIQUE_MAX) || PAGE_HISTORIQUE,
  };
}

/** Les filtres, réécrits en paramètres d'adresse. Rend la chaîne VIDE quand rien n'est filtré. PUR. */
export function ecrireFiltres(f: FiltresHistorique): string {
  const p = new URLSearchParams();
  if (f.interlocuteurs.length > 0) p.set('avec', f.interlocuteurs.join(','));
  if (f.expediteursExclus.length > 0) p.set('sauf', f.expediteursExclus.join(','));
  if (f.du !== null) p.set('du', f.du);
  if (f.au !== null) p.set('au', f.au);
  if (f.pieces !== 'toutes') p.set('pieces', f.pieces);
  if (f.evenementOuvert) p.set('evt', 'ouvert');
  if (f.texte.trim() !== '') p.set('q', f.texte.trim());
  if (f.avecProprietaire) p.set('proprio', '1');
  if (!f.avecLogements) p.set('logements', '0');
  if (f.grouper) p.set('grouper', '1');
  if (f.page > 0) p.set('page', String(f.page));
  if (f.taille !== PAGE_HISTORIQUE) p.set('taille', String(f.taille));
  const s = p.toString();
  return s === '' ? '' : `?${s}`;
}

/** Un filtre est-il actif ? Sert à proposer « tout afficher » seulement quand il y a quelque chose à défaire. PUR. */
export function filtreActif(f: FiltresHistorique): boolean {
  return f.interlocuteurs.length > 0 || f.expediteursExclus.length > 0 || f.du !== null || f.au !== null
    || f.pieces !== 'toutes' || f.texte.trim() !== '';
}

// ── CE QUE L'ÉCRAN AFFICHE ──────────────────────────────────────────────────────────────────────────────────────

export interface PieceHistorique {
  pieceId: number;
  nomFichier: string;
  typeMime: string | null;
  tailleOctets: number | null;
  disponible: boolean;
  motifNonStocke: string | null;
  /**
   * ══ 🔴 LOT HISTORIQUE-BIEN-1 — L'EMPREINTE DU CONTENU, POUR LE RÉSUMÉ DES PIÈCES ═════════════════════════════
   *
   * Le bloc « Historique » résume en miniatures toutes les pièces des mails affichés, par `dedoublonnerPieces`
   * (`piecesConversation.ts`). Cette fonction identifie une pièce par son EMPREINTE quand elle en a une, et
   * retombe sinon sur « nom + taille » — un rapprochement qu'elle marque alors comme PRÉSOMPTION.
   *
   * 🔴 SANS CE CHAMP, TOUT LE RÉSUMÉ PASSAIT PAR LA PRÉSOMPTION, et deux documents DIFFÉRENTS de même nom et de
   * même taille (deux « facture.pdf » de deux fournisseurs) auraient fondu en un — une pièce manquante, qui ne
   * se voit pas. L'empreinte existe déjà en base (`gestion_piece.empreinte_sha256`, renseignée pour toutes les
   * pièces qui ont des octets) : il n'y avait rien à calculer, seulement à la faire voyager.
   *
   * ⚠️ CHAMP **FACULTATIF**, comme `interventions` sur une ligne : une réponse d'API plus ancienne que ce lot ne
   * le porte pas, et tout ce qui construit une pièce d'historique ailleurs doit continuer de compiler. `null` et
   * `undefined` veulent dire la même chose — « pas d'empreinte connue », donc rapprochement par nom et taille.
   */
  empreinte?: string | null;
  /**
   * ══ 🔴 LOT HISTORIQUE-BIEN-14, POINT 3 — LE NOM SOUS LEQUEL LA PIÈCE EST ARRIVÉE ════════════════════════════
   *
   * `nomFichier` ci-dessus est le nom AFFICHÉ (le nom choisi s'il y en a un) ; celui-ci est le nom REÇU. La
   * visionneuse rétablie dans « Historique du bien » l'écrit au-dessus du document : « reçue sous : … ».
   *
   * ⚠️ FACULTATIF, comme `empreinte` juste au-dessus, et pour la même raison : tout ce qui construit une pièce
   * d'historique ailleurs doit continuer de compiler. Absent ⇒ le bandeau replie sur le nom affiché, ce qui est
   * exact tant que personne n'a renommé.
   */
  nomOrigine?: string;
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-11, POINT 5 — UN MAIL QUI PORTE DES PIÈCES, ET RIEN DE PLUS ═════════════════════════
 *
 * Ce que le RÉSUMÉ des pièces a besoin de savoir d'un mail : son identité, sa date, son expéditeur, son objet et
 * ses pièces. Pas son extrait, pas ses destinataires, pas ses événements, pas son statut, pas ses interventions.
 *
 * 🔴 C'EST CE QUI PERMET DE LIRE TOUTE LA SÉLECTION plutôt que la page. Arno : « le résumé contient les pièces de
 * TOUS les mails de la sélection, pas seulement des 100 chargés. » Faire voyager 326 `LigneHistorique` complètes
 * pour n'en garder que les pièces aurait été payer le prix fort pour un récapitulatif.
 *
 * ⚠️ IL SE SUPERPOSE À `MessagePorteur` (le module des pièces d'une conversation) : mêmes champs, même sens. On
 * ne le RÉEMPLOIE pas tel quel parce qu'il vit dans un module d'écran ; mais `messagesDuFil` et cette lecture-ci
 * rendent la même forme, et c'est voulu — le résumé ne sait pas d'où viennent ses messages.
 */
export interface MessagePorteurDePieces {
  messageId: number;
  recuLe: string;
  sens: 'recu' | 'envoye';
  de: string;
  deNom: string | null;
  objet: string | null;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-14, POINTS 1 ET 2 — LES DESTINATAIRES ENTRENT DANS CETTE LECTURE ════════════════
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * CONSTAT D'ARNO (05/10/2026, lot-146, propriétaire seul coché) : « au milieu des pièces de Blandine Piriou, le
   * résumé montre "RIB - Boursorama Thomas Derrien.pdf", reçu de DERRIEN Thomas, un ancien locataire. »
   *
   * 🔴 MESURÉ SUR LE MESSAGE 52187 : De `thomas.derrien@hec.edu` (ancien locataire), **À**
   * `blandine.piriou@gmail.com` (la propriétaire cochée), Cc l'autre ancienne locataire et deux adresses à nous.
   * Le mail entre donc dans la sélection par son DESTINATAIRE — et c'est juste pour le listing (il concerne la
   * propriétaire), mais faux pour le RÉSUMÉ DES PIÈCES : le document est celui d'un ancien locataire.
   *
   * Sans les destinataires, cette lecture ne pouvait pas faire la différence : elle ne portait que l'expéditeur.
   *
   * ⚠️ PAS `cci` : la copie cachée d'un mail REÇU est inconnue par construction, et sur nos envois elle ne
   * désigne personne « à qui » l'on a visiblement écrit. L'ajouter aurait fait entrer dans le résumé des pièces
   * dont la présence s'expliquerait par un en-tête que personne ne voit.
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  a: PersonneDuMail[];
  cc: PersonneDuMail[];
  pieces: PieceHistorique[];
}

export interface LigneHistorique {
  messageId: number;
  filId: number;
  /**
   * 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 5 — LE `Message-ID` RFC, pour retrouver le mail DANS GMAIL.
   *
   * Il ne sert qu'à une chose : construire « voir dans Gmail » sur les pièces que nous n'avons PAS conservées
   * (`lienGmail`). Rien d'autre à l'écran ne le lit.
   *
   * ⚠️ `null` ⇒ PAS DE LIEN, et la mention reste nue. On ne devine pas une adresse Gmail : un lien qui ouvre la
   * mauvaise boîte est pire qu'un constat.
   */
  messageIdRfc: string | null;
  recuLe: string;
  sens: 'recu' | 'envoye';
  de: string;
  deNom: string | null;
  /** Les destinataires, tels qu'affichables. Bornés côté dépôt. */
  destinataires: string[];
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-10, POINT 3 — LES TROIS CHAMPS, SÉPARÉS, AVEC LEURS NOMS ════════════════════════
   *
   * DEMANDE D'ARNO (05/10/2026) : « Au-dessus de “À :”, une ligne “De : Nom <adresse>”. “À :” liste TOUS les
   * destinataires, à la suite sur la même ligne. Ligne “Cc :” si des personnes sont en copie. Cci seulement si
   * on le connaît (nos envois). Chaque adresse porte la petite pastille de couleur de sa catégorie. »
   *
   * 🔴 `destinataires` NE SUFFISAIT PAS, ET IL RESTE : il mêle le À et le Cc en une seule liste de chaînes
   * « Nom <adresse> », bornée à sept. Trois écrans le lisent encore tel quel ; le retirer aurait été une
   * régression pour eux. On AJOUTE les trois listes, séparées et complètes.
   *
   * 🔴 L'ADRESSE EST GARDÉE À PART DU NOM parce que c'est elle qui porte la PASTILLE : la catégorie se lit sur
   * l'adresse normalisée, pas sur « Jean PONS ». Les recoller puis les redécouper à l'écran aurait perdu
   * l'adresse au premier nom qui contient un chevron.
   *
   * ⚠️ `cci` EST VIDE SAUF SUR NOS ENVOIS, et c'est un fait, pas une limite : on ne connaît la copie cachée d'un
   * mail REÇU que si l'on y était. Mesuré : 790 messages en portent une, et jamais plus de six adresses.
   */
  a: PersonneDuMail[];
  cc: PersonneDuMail[];
  cci: PersonneDuMail[];
  objet: string | null;
  extrait: string | null;
  pieces: PieceHistorique[];
  /** Par quelle cible ce mail entre dans l'historique — sert au regroupement par logement. */
  parCible: Cible;
  cibleLibelle: string;
  /**
   * D'OÙ VIENT LA LIGNE. `rattachement` = un lien posé (automatique ou manuel) ; `carte` = l'échange est affecté à
   * cette carte d'événement. Écrit, jamais devinable : les deux axes coexistent et ne disent pas la même chose.
   */
  source: 'rattachement' | 'carte';
  /**
   * ══ 🔴 LOT FICHES-ANNUAIRE — LES ÉVÉNEMENTS DE CE MAIL ══════════════════════════════════════════════════════
   *
   * Demande d'Arno pour la « vie du bien » : les mails « avec leurs pièces jointes […] et leurs événements »,
   * plus un filtre « avec événement ouvert ».
   *
   * ⚠️ UN ÉVÉNEMENT N'EST PAS POSÉ SUR UN MAIL, mais sur son ÉCHANGE (`gestion_affectation`). Deux mails du même
   * fil portent donc les mêmes — c'est exact, et c'est ce qu'on veut lire : « cet échange attend une réponse ».
   *
   * ⚠️ VIDE N'EST PAS UNE ABSENCE DE DONNÉE : c'est « aucun événement », qui est un fait. L'événement est
   * FACULTATIF dans ce module (cf. `INTRO_GESTION`), et la plupart des mails n'en ont pas.
   */
  evenements: EvenementDeLigne[];
  /**
   * ══ 🔴 LOT FICHES-ANNUAIRE — LA CAPSULE DE STATUT DU MAIL ═══════════════════════════════════════════════════
   *
   * Demande d'Arno pour la « vie du bien » : « dans le même format de ligne que la boîte (capsules, trombone
   * gris/noir, triangle ▶/▼) ». La capsule est calculée par `capsuleStatut`, LA MÊME fonction pure que la boîte —
   * en écrire une seconde ferait un jour deux verdicts pour un même mail.
   *
   * ⚠️ `null` QUAND LA MIGRATION 257 N'EST PAS LÀ : la table des rattachements n'est alors nommée nulle part, et
   * l'écran n'affiche simplement aucune capsule. C'est la règle du module — une sonde voyage avec sa donnée.
   */
  /**
   * ⚠️ LOT RATTACHER-EN-ECRIVANT — L'UNION EST RECOPIÉE ICI, et `interne` s'y ajoute. Ce module est PUR et
   * n'importe RIEN (c'est sa garantie) : il ne peut donc pas lire `CapsuleStatut` de `statutClassement`. Le
   * compilateur les tient accordées — c'est lui qui a signalé l'oubli quand « interne » est apparu.
   */
  statut: 'classe' | 'auto' | 'interne' | 'hors_gestion' | 'a_classer' | null;
  /** Le détail de la capsule (ce à quoi le mail est rattaché), tel que l'info-bulle l'affiche. */
  statutDetail: string | null;
  /**
   * ══ 🔴🔴 LOT CONTACTS-EXTERNES — LES PERSONNES QUE CE MAIL CONCERNE AUSSI, ET PAR QUI IL EST PASSÉ ══════════
   *
   * Demande d'Arno : « le mail apparaît dans “Vie du bien” ET dans l'historique de chaque carte ou fiche
   * concernée, avec le rôle instantané et le contact externe (“via Me Martin, avocat”) ».
   *
   * ⚠️ VIDE N'EST PAS UNE ABSENCE DE DONNÉE : c'est « aucun intermédiaire », qui est le cas de l'immense majorité
   * du courrier. La ligne n'affiche alors rien de plus, exactement comme avant ce lot.
   *
   * ⚠️ VIDE AUSSI SANS LA MIGRATION 293 : la sonde répond « non », le dépôt ne nomme aucune colonne nouvelle, et
   * la carte revient vide. Une sonde voyage avec sa donnée — règle du module.
   *
   * ⚠️ L'UNION DES RÔLES EST RECOPIÉE ICI, comme celle de `statut` juste au-dessus et pour la même raison : ce
   * module est PUR et n'importe RIEN. Le compilateur tient les deux accordées.
   *
   * ⚠️ CHAMP **FACULTATIF**, ET DÉLIBÉRÉMENT. Une réponse d'API plus ancienne que ce lot ne le porte pas, et tout
   * ce qui construit une ligne d'historique ailleurs dans le dépôt doit continuer de compiler sans une ligne de
   * différence. `undefined` et `[]` veulent dire la même chose : aucun intermédiaire.
   */
  interventions?: {
    sorte: 'proprietaire' | 'locataire';
    /** Le nom de la personne, tel qu'il était au moment du classement (libellé figé du lien). */
    libelle: string;
    role: 'proprietaire' | 'locataire_occupant' | 'locataire_sortant' | 'locataire_a_venir';
    /** « via Me Martin, avocat » — déjà composé par le dépôt, ou `null` si aucun contact n'est nommé. */
    via: string | null;
  }[];
}

/** Un événement tel qu'une ligne d'historique l'annonce. `ouvert` = non traité : c'est lui que le filtre garde. */
export interface EvenementDeLigne {
  id: number;
  reference: string;
  objet: string;
  etat: string;
  ouvert: boolean;
}

export interface Interlocuteur {
  adresse: string;
  /** Le nom d'affichage le plus fréquent pour cette adresse, ou `null` si elle n'en a jamais porté. */
  nom: string | null;
  nbMails: number;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-1 — LES DEUX COMPTEURS D'UNE PERSONNE ═══════════════════════════════════════════
   *
   * DEMANDE D'ARNO (04/10/2026) : chaque adresse du tableau « PARTIES » porte ses deux compteurs, « a écrit » et
   * « en copie / destinataire ». `nbMails` ne distinguait pas les deux : une adresse à 40 mails pouvait n'avoir
   * jamais écrit une ligne, et rien ne le disait.
   *
   * 🔴 UN MAIL NE COMPTE QU'UNE FOIS PAR ADRESSE, LA PRÉSENCE LA PLUS FORTE L'EMPORTANT (« a écrit » gagne sur
   * « destinataire/copie »). MESURÉ EN BASE LE 04/10/2026 : **248 couples (adresse, message)** portent les DEUX
   * rôles à la fois, sur **61 adresses distinctes** — un auto-envoi, une réponse à soi-même, un transfert. Sans
   * cette règle, ces 248 mails seraient comptés deux fois et la somme des deux compteurs dépasserait `nbMails`.
   *
   * ⚠️ ET LA SOMME PEUT ÊTRE **INFÉRIEURE** À `nbMails`, ce qui est exact et voulu : `aEcrit` lit le rôle
   * `expediteur`, `enCopie` les rôles `destinataire` et `copie` — restent `repondre_a` et `transfere`, qui ne
   * sont ni l'un ni l'autre. MESURÉ : **5 191 couples (adresse, message)** n'ont QUE ces rôles-là. Une adresse
   * qui n'apparaît que comme « répondre à » est bien dans l'échange sans y avoir écrit ni été écrite ; gonfler
   * l'un des deux compteurs pour faire tomber l'addition juste aurait menti sur son rôle.
   */
  aEcrit: number;
  /** Destinataire ou en copie, hors mails où cette adresse a AUSSI écrit (voir `aEcrit`). */
  enCopie: number;
  /** Une de NOS adresses ? On les montre — elles font partie de l'échange — mais on les distingue. */
  interne: boolean;
}

export interface EnteteHistorique {
  nbMails: number;
  nbPieces: number;
  premierLe: string | null;
  dernierLe: string | null;
}

/** L'en-tête, dit en une phrase. PUR. */
export function resumeEntete(e: EnteteHistorique): string {
  if (e.nbMails === 0) return 'Aucun échange rattaché pour l’instant.';
  const pieces = e.nbPieces === 0 ? 'aucune pièce jointe'
    : `${e.nbPieces} pièce${e.nbPieces > 1 ? 's' : ''} jointe${e.nbPieces > 1 ? 's' : ''}`;
  return `${e.nbMails} mail${e.nbMails > 1 ? 's' : ''} · ${pieces}`;
}

/**
 * LA FRISE, REGROUPÉE PAR CIBLE. PUR.
 *
 * ⚠️ L'ORDRE DES GROUPES SUIT LE PLUS RÉCENT DE CHACUN, pas l'ordre alphabétique : on cherche « où en est-on », donc
 * ce qui a bougé en dernier doit être en haut. À l'intérieur d'un groupe, l'ordre chronologique inverse est conservé.
 */
export function grouperParCible(lignes: readonly LigneHistorique[]): {
  cible: Cible; libelle: string; lignes: LigneHistorique[];
}[] {
  const groupes = new Map<string, { cible: Cible; libelle: string; lignes: LigneHistorique[] }>();
  for (const l of lignes) {
    const cle = texteCible(l.parCible);
    const g = groupes.get(cle) ?? { cible: l.parCible, libelle: l.cibleLibelle, lignes: [] };
    g.lignes.push(l);
    groupes.set(cle, g);
  }
  return [...groupes.values()].sort((a, b) => (b.lignes[0]?.recuLe ?? '').localeCompare(a.lignes[0]?.recuLe ?? ''));
}

/** Le libellé d'un interlocuteur : son nom quand il en a un, sinon son adresse. PUR. */
export function libelleInterlocuteur(i: Interlocuteur): string {
  return i.nom !== null && i.nom.trim() !== '' ? i.nom.trim() : i.adresse;
}
