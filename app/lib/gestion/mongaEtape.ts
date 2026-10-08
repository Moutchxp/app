/**
 * ══ 🔴🔴 LOT MONGA-2, POINTS 1 ET 2 — LIRE L'ÉTAPE D'UN MAIL MONGA. MODULE PUR ════════════════════════════════════
 *
 * Aucune base, aucun réseau, aucun React. Il dit ce qu'un mail Monga RACONTE ; c'est le dépôt qui enregistre, et
 * l'écran qui affiche.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (06/10/2026) : « À l'arrivée de chaque mail Monga, son contenu est lu et l'étape est ENREGISTRÉE
 * dans une table propre aux étapes, rattachée à la RÉFÉRENCE MNG. Ensuite, le devenir du mail (boîte, corbeille,
 * inerte, supprimé, réintégré) ne change JAMAIS l'étape enregistrée. »
 *
 * ═══ 🔴🔴 CE QUE L'AUDIT DU 06/10/2026 A MESURÉ, ET QUI DICTE CHAQUE MOTIF D'ICI ════════════════════════════════
 *
 * Corpus relu EN ENTIER — 161 mails touchant Monga, dont 120 du domaine et **98 du gabarit `noreply@monga.io`**,
 * corbeille comprise (25 des 98 y sont déjà), sur 35 références, du 12/03 au 06/10/2026.
 *
 * 🔴🔴 LA DÉCOUVERTE QUI CHANGE TOUT : **L'ÉTAPE N'EST PAS DANS L'OBJET, ELLE EST DANS LE CORPS DU COMMENTAIRE.**
 * 53 des 98 mails ont pour objet « MNG-# - Nouveau commentaire » — un objet qui ne dit RIEN. C'est à l'intérieur
 * que Monga écrit le rendez-vous, le devis, la facture, le rapport. La lecture d'avant ce lot (`etapeMonga`, qui
 * ne regarde que l'objet) rangeait donc 55 mails sous « commentaire », et ne voyait AUCUNE de ces étapes.
 *
 * ⚠️ PREMIÈRE PASSE DE L'AUDIT : J'AVAIS MANQUÉ DEUX ÉTAPES, et c'est consigné ici parce que c'est le piège de ce
 * gabarit. En classant d'abord sur l'objet, « Votre devis N°DEV-… est désormais disponible » (9 mails, LE signal
 * de devis, avec son NUMÉRO) et « nous accusons bonne réception de votre demande » (l'ouverture) tombaient tous
 * deux dans « commentaire libre ». Il a fallu relire les 53 corps un par un pour les voir. Toute étape ajoutée
 * ici doit être cherchée dans le CORPS d'abord, dans l'objet ensuite.
 *
 * ═══ LES CHIFFRES, PAR MOTIF (sur les 98 mails gabarités) ═══════════════════════════════════════════════════════
 *
 *   FIABLE (gabarit figé, volume suffisant, extraction à 100 %) :
 *     · rendez-vous d'intervention … 15 mails · date + plage horaire … 15/15
 *     · prise de rendez-vous ……………  7 mails · date + plage horaire …  7/7
 *     · devis reçu …………………………………  9 mails · numéro DEV-………………………  9/9
 *     · rappel de devis ……………………… 21 mails · rang du rappel (1/2/3) … 21/21
 *   À CONFIRMER (gabarit figé mais 1 à 7 cas seulement — le volume ne permet pas de jurer) :
 *     · ouverture (accusé) 2 · rendez-vous eu lieu 3 · rapport de visite 3 · devis envoyé (objet) 1
 *     · intervention réalisée 2 · clôture 1 · facture 7 · contact injoignable 4
 *   NON DÉTECTABLE, mesuré et non supposé :
 *     · MONTANT du devis : **2 mails sur 120**, et ce sont deux phrases humaines. Le mail « Devis envoyé » dit
 *       seulement « le devis est disponible, vous pouvez le valider via le lien ». Le montant est DERRIÈRE le lien.
 *     · ARTISAN : **0** — toujours « notre artisan partenaire », jamais nommé (38 mentions vérifiées).
 *     · DEVIS ACCEPTÉ / REFUSÉ : **0 mail**. Monga ne notifie pas la validation : c'est nous qui validons chez eux.
 *
 * 🔴 DÉCISION D'ARNO (06/10/2026), après ce constat : « Devis automatique (numéro + date), montant complété à la
 * main ; “Acceptation du devis” en étape manuelle affichée en pointillé, validable en un clic. »
 *
 * ⚠️ DEUX MAILS SUR 98 N'ONT AUCUNE PARTIE TEXTE (HTML seul) : ils ne peuvent rien rendre, et c'est le plafond
 * assumé de ce module. On lit le TEXTE, pas le HTML — règle du dépôt depuis `monga.ts`, parce que le HTML de ces
 * mails est une maquette d'infolettre régénérée à chaque campagne.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * LES TYPES D'ÉTAPE. Les huit premiers sont les ÉTAPES MAJEURES de la frise, dans l'ordre où Arno les a données ;
 * viennent ensuite les repères (facture, rappel, commentaire) et les étapes purement manuelles.
 *
 * ⚠️ L'ORDRE DE CETTE LISTE EST L'ORDRE DE LA FRISE quand deux étapes portent la même date : voir `RANG_ETAPE`.
 */
export type TypeEtape =
  | 'ouverture'
  | 'prise_rdv'
  | 'rdv_eu_lieu'
  | 'devis_recu'
  /**
   * 🔴 LOT FRISE-CONSTRUCTIBLE — « Devis refusé », nommé par Arno dans le réservoir. AUCUN MOTIF DE LECTURE NE LE
   * PRODUIT, et c'est mesuré : l'audit du 06/10 a compté **0 mail** annonçant un refus — Monga ne notifie pas la
   * validation d'un devis, c'est nous qui validons chez eux. C'est donc une carte que seule une main pose, et
   * c'est précisément ce qui manquait pour écrire la suite réelle d'un dossier :
   * « rendez-vous → devis refusé → nouveau rendez-vous → nouveau devis » (l'exemple d'Arno).
   */
  | 'devis_refuse'
  | 'devis_accepte'
  | 'rdv_intervention'
  | 'intervention'
  /**
   * 🔴 LOT FRISE-CONSTRUCTIBLE — « Rapport ». Monga en envoie, mais sous deux gabarits déjà rangés ailleurs
   * (« rapport de visite » → `rdv_eu_lieu`, « rapport d'intervention » → `intervention`) : ces deux lectures ne
   * changent PAS. Ce type-ci est la carte qu'une main pose quand le rapport est le fait marquant.
   */
  | 'rapport'
  | 'cloture'
  /* ── repères, pas des étapes majeures ───────────────────────────────────────────────────────────────────── */
  | 'facture'
  | 'rappel_devis'
  | 'contact_injoignable'
  | 'commentaire'
  /**
   * 🔴 LOT FRISE-HORIZONTALE — la « simple information » posée à la main (Arno). Un REPÈRE, donc un POINT sur le
   * trait, jamais un carré. Distincte de `commentaire`, qui est ce que MONGA dit : confondre les deux brouillerait
   * l'origine d'une information qu'on relit justement pour savoir qui l'a dite.
   */
  | 'note'
  /* ── étapes que seul un humain pose (aucun mail ne les porte) ───────────────────────────────────────────── */
  | 'assurance'
  | 'expertise'
  | 'relance'
  /**
   * ══ 🔴🔴 LOT CLOTURE-REOUVERTURE — LA CARTE QUI ROUVRE UN DOSSIER CLOS ════════════════════════════════════
   *
   * ARNO (08/10/2026) : « Ajouter la carte “Réouverture” rouvre un événement clos : statut ouvert, nouvelle
   * période “Événement ouvert” qui commence à la date de la carte. […] C'est le SEUL moyen de rouvrir un
   * événement clos. »
   *
   * 🔴 UNE ÉTAPE, ET NON UN DRAPEAU. Elle se pose à une DATE, elle reste sur la frise, et c'est elle qui raconte
   * qu'un dossier qu'on croyait fini est reparti. Un simple retour à « en cours » aurait rouvert sans trace :
   * on ne saurait plus, six mois après, qu'il y a eu deux périodes.
   */
  | 'reouverture'
  | 'autre';

/** Les étapes MAJEURES, celles qui font la colonne vertébrale de la frise. Ordre chronologique attendu. */
export const ETAPES_MAJEURES: readonly TypeEtape[] = [
  'ouverture', 'prise_rdv', 'rdv_eu_lieu', 'devis_recu', 'devis_refuse', 'devis_accepte',
  'rdv_intervention', 'intervention', 'rapport', 'cloture',
  /* 🔴 LOT CLOTURE-REOUVERTURE — une réouverture est un fait majeur du dossier, pas un repère. */
  'reouverture',
];

/**
 * ══ 🔴🔴 LOT FRISE-CONSTRUCTIBLE — `ETAPES_ATTENDUES` A ÉTÉ SUPPRIMÉE, ET C'EST UN ACCORD EXPLICITE D'ARNO ══════
 *
 * Elle listait les étapes affichées EN POINTILLÉ tant qu'elles n'étaient pas atteintes. Arno (06/10/2026) :
 * « la frise d'avancement n'impose plus aucune suite d'étapes. Elle se CONSTRUIT avec les vraies étapes, dans
 * l'ordre réel […] ACCORD D'ARNO : les carrés “attendue” en pointillé sont supprimés. »
 *
 * 🔴 POURQUOI ILS ÉTAIENT FAUX, ET PAS SEULEMENT ENCOMBRANTS. Un pointillé PROMET une suite : ouverture, puis
 * devis, puis acceptation, puis intervention, puis clôture — une fois, dans cet ordre. Le dossier réel ne marche
 * pas ainsi : un devis se refuse, un rendez-vous se reprend, un second devis arrive. La frise promettait donc un
 * chemin qui n'existe pas, et n'avait aucune place pour celui qui existe.
 *
 * ⚠️ RIEN N'EST PERDU AVEC ELLE : chacun de ces types reste dans le RÉSERVOIR (`TYPES_RESERVOIR`), posable
 * autant de fois que nécessaire, à sa vraie date. On ne retire pas une possibilité, on retire une PROMESSE.
 */

/**
 * ══ 🔴🔴 LE RÉSERVOIR — LES CARTES QU'UN CLIC SUR « + » PROPOSE ══════════════════════════════════════════════════
 *
 * Arno, point 2, mot pour mot : « un réservoir de carrés à contour ROUGE, un par type d'étape : Prise de
 * rendez-vous, Rendez-vous eu lieu, Devis reçu, Devis refusé, Acceptation du devis, Rendez-vous d'intervention,
 * Intervention, Rapport, Facture, Passage de l'assurance, Expertise, Relance, Clôture, plus un carré LIBRE
 * (titre à saisir). »
 *
 * 🔴 L'ORDRE EST LE SIEN, ET IL N'EST PAS CELUI DU DOSSIER. Il range par ce qu'on cherche des yeux, pas par
 * chronologie — et c'est un réservoir, pas une frise : rien n'y impose de suite. Le tri du dossier, lui, reste
 * `RANG_ETAPE`, et il ne sert qu'à départager deux étapes du MÊME JOUR.
 *
 * ⚠️ `ouverture` N'Y EST PAS : la frise porte toujours sa carte d'ouverture, en première position, et elle vient
 * de la date d'ouverture de l'ÉVÉNEMENT (point 1 d'Arno). L'offrir au réservoir aurait permis d'en poser une
 * seconde, et deux ouvertures sur une frise ne veulent rien dire.
 *
 * ⚠️ `commentaire` ET `rappel_devis` N'Y SONT PAS NON PLUS : ce sont les mots de MONGA. Pour écrire soi-même, il
 * y a la carte LIBRE (`autre`) et la « simple information » (`note`).
 */
export const TYPES_RESERVOIR: readonly TypeEtape[] = [
  'prise_rdv', 'rdv_eu_lieu', 'devis_recu', 'devis_refuse', 'devis_accepte',
  'rdv_intervention', 'intervention', 'rapport', 'facture',
  'assurance', 'expertise', 'cloture',
  /* 🔴 LE CARRÉ LIBRE : son titre se saisit, et c'est la seule carte dont le mot ne vient pas du type. */
  'autre',
  /**
   * ══ 🔴🔴 LOT CLOTURE-REOUVERTURE — « RÉOUVERTURE », EN DERNIER, JUSTE APRÈS « CARTE LIBRE » (Arno) ════════
   *
   * 🔴 ET « RELANCE » A QUITTÉ CETTE LISTE, sur demande expresse d'Arno : « Retire le bouton “Relance” de la
   * grille “Ajouter une carte”. » Ce n'est PAS un type supprimé — voir `TYPES_HERITES` juste en dessous : les
   * cartes Relance déjà posées s'affichent, se modifient et se retirent exactement comme avant.
   */
  'reouverture',
];

/**
 * ══ 🔴🔴 LOT CLOTURE-REOUVERTURE — CE QUI N'EST PLUS PROPOSÉ, MAIS RESTE VALIDE ═══════════════════════════════
 *
 * ARNO : « Les cartes “Relance” DÉJÀ posées sur des frises restent affichées telles quelles : aucune donnée
 * supprimée, aucune modifiée. »
 *
 * 🔴 RETIRER UN BOUTON N'EST PAS RETIRER UN TYPE, et c'est toute la raison de cette liste. Les deux routes de la
 * frise valident le type reçu contre `TYPES_AJOUTABLES` ; si `relance` en sortait, ROUVRIR une carte Relance
 * existante pour corriger sa date ou son texte serait refusé par le serveur — une carte qu'on peut lire et pas
 * réparer. Le bouton disparaît de la grille, le type reste accepté.
 *
 * ⚠️ ELLE N'EST PAS DANS LE RÉSERVOIR, donc l'écran ne la propose jamais : la grille lit `TYPES_RESERVOIR`, les
 * routes lisent `TYPES_AJOUTABLES`. Deux questions différentes, deux listes.
 */
export const TYPES_HERITES: readonly TypeEtape[] = ['relance'];

/** Les repères discrets : un petit point sur la frise, le contenu au survol. Jamais une étape. */
export const REPERES: readonly TypeEtape[] =
  ['facture', 'rappel_devis', 'contact_injoignable', 'commentaire', 'note'];

export function estRepere(t: TypeEtape): boolean {
  return REPERES.includes(t);
}

/**
 * Ce qu'une MAIN a le droit de poser en CARRÉ. C'est la liste que les routes vérifient — la garde de forme.
 *
 * 🔴 LOT FRISE-CONSTRUCTIBLE : c'est désormais `ouverture` + le RÉSERVOIR, et c'est un SUR-ENSEMBLE de ce que
 * cette constante valait avant (elle gagne `devis_refuse` et `rapport`, et ne perd rien). `ouverture` y reste
 * bien qu'absente du réservoir : des étapes d'ouverture manuelles existent déjà en base, et une route qui
 * cesserait de les accepter rendrait leur modification impossible.
 *
 * ⚠️ `commentaire` N'Y EST PAS : un commentaire est ce que MONGA dit, pas ce qu'on ajoute. Pour écrire quelque
 * chose soi-même il y a la carte LIBRE (`autre`), qui porte son titre et son texte.
 */
export const TYPES_AJOUTABLES: readonly TypeEtape[] = [
  'ouverture', ...TYPES_RESERVOIR, ...TYPES_HERITES,
];

/**
 * ══ 🔴🔴 LOT FRISE-HORIZONTALE — CE QU'ON PEUT POSER EN « SIMPLE INFORMATION » ══════════════════════════════════
 *
 * Arno : « le choix “Étape” ou “Simple information”. Une étape s'affiche en carré, une information en point. »
 *
 * ⚠️ `commentaire` N'Y EST TOUJOURS PAS, et pour la raison d'avant : un commentaire est ce que MONGA dit. Une
 * information écrite par un collaborateur est une `note`, et elle le dit.
 *
 * ⚠️ `facture` EST DANS LES DEUX LISTES, et c'est voulu : une facture reçue est un repère (c'est ainsi que Monga
 * l'envoie), mais on peut vouloir la poser comme une étape du dossier. Les deux lectures sont légitimes.
 */
/*
 * 🔴 LOT CLOTURE-REOUVERTURE — « relance » A QUITTÉ CETTE LISTE AUSSI. Arno retire le bouton « Relance » de la
 * GRILLE, et la grille a deux faces : « Étape (carré) » lit `TYPES_RESERVOIR`, « Simple information (point) »
 * lit celle-ci. Le laisser ici aurait fait survivre le bouton derrière une bascule — c'est-à-dire ne pas l'avoir
 * retiré. Le TYPE, lui, reste valide (`TYPES_HERITES`) : les points « Relance » déjà posés sont intacts.
 */
export const TYPES_INFORMATION: readonly TypeEtape[] = ['note', 'facture', 'contact_injoignable'];

/**
 * Le rang d'affichage À DATE ÉGALE. Deux étapes du MÊME JOUR se rangent dans l'ordre du dossier, pas au hasard.
 *
 * 🔴🔴 CE N'EST PLUS UN ORDRE IMPOSÉ, ET LA NUANCE EST TOUT LE LOT FRISE-CONSTRUCTIBLE. Jusqu'ici ce rang servait
 * DEUX choses : départager deux étapes du même jour, et décider où glisser un carré « attendu » en pointillé.
 * La seconde a disparu avec les pointillés (accord d'Arno). Il ne reste que la première — un départage, sur une
 * seule journée, entre des étapes qui ont toutes réellement eu lieu. La frise, elle, est triée par DATE.
 */
const RANG_ETAPE: Record<TypeEtape, number> = {
  ouverture: 0, prise_rdv: 1, rdv_eu_lieu: 2, devis_recu: 3, devis_refuse: 4, devis_accepte: 5,
  rdv_intervention: 6, intervention: 7, rapport: 8, cloture: 9,
  facture: 10, rappel_devis: 11, contact_injoignable: 12, commentaire: 13,
  assurance: 14, expertise: 15, relance: 16, autre: 17, note: 18,
  /**
   * 🔴 LOT CLOTURE-REOUVERTURE — JUSTE APRÈS LA CLÔTURE (9), ET SANS RENUMÉROTER PERSONNE. Une réouverture qui
   * tombe le MÊME JOUR qu'une clôture se range après elle, ce qui est le seul ordre lisible. Un entier aurait
   * obligé à décaler les neuf rangs suivants, c'est-à-dire à changer l'ordre d'affichage de toutes les frises
   * existantes pour une carte qui n'y est pas encore.
   */
  reouverture: 9.5,
};

export function rangEtape(t: TypeEtape): number {
  return RANG_ETAPE[t] ?? 99;
}

/** Le mot lisible d'un type d'étape. Écrit UNE fois : deux listes finiraient par diverger. */
export function motEtape(t: TypeEtape): string {
  switch (t) {
    case 'ouverture': return 'Ouverture';
    case 'prise_rdv': return 'Prise de rendez-vous';
    /* ⚠️ « eu lieu », ET NON « effectué » : ce sont les mots d'Arno dans le réservoir du lot FRISE-CONSTRUCTIBLE,
       et une carte doit porter le nom sous lequel on la choisit. */
    case 'rdv_eu_lieu': return 'Rendez-vous eu lieu';
    case 'devis_recu': return 'Devis reçu';
    case 'devis_refuse': return 'Devis refusé';
    case 'devis_accepte': return 'Acceptation du devis';
    case 'rdv_intervention': return 'Rendez-vous d’intervention';
    case 'intervention': return 'Intervention';
    case 'rapport': return 'Rapport';
    case 'cloture': return 'Clôture';
    case 'facture': return 'Facture';
    case 'rappel_devis': return 'Rappel de devis';
    case 'contact_injoignable': return 'Contact injoignable';
    case 'commentaire': return 'Commentaire Monga';
    case 'assurance': return 'Passage de l’assurance';
    case 'expertise': return 'Expertise';
    case 'relance': return 'Relance';
    case 'reouverture': return 'Réouverture';
    /* 🔴 LA CARTE LIBRE. Son mot ne s'affiche que tant qu'aucun titre n'a été saisi — voir `motDeLaCase`. */
    case 'autre': return 'Carte libre';
    case 'note': return 'Note';
  }
}

/**
 * LA CERTITUDE D'UNE ÉTAPE LUE.
 *
 * `fiable` = gabarit figé ET volume mesuré suffisant → elle s'affiche telle quelle.
 * `a_confirmer` = gabarit figé mais 1 à 7 cas dans l'audit → elle s'affiche avec « à confirmer » et deux boutons.
 *
 * ⚠️ CE N'EST PAS UNE MESURE DE LA CONFIANCE DANS **CE** MAIL, mais dans **CE MOTIF**. Le gabarit « Mission
 * terminée » est parfaitement net ; c'est de ne l'avoir vu qu'UNE fois qu'on n'est pas sûr — une formulation
 * voisine pourrait exister et nous échapper. D'où le geste d'Arno : cinq confirmations sans écart, et il décide.
 */
export type Certitude = 'fiable' | 'a_confirmer';

/** Le nombre de confirmations, sans un seul écart, à partir duquel on PROPOSE le passage en fiable (Arno). */
export const CONFIRMATIONS_POUR_PROPOSER = 5;

/**
 * 🔴 PROPOSER, JAMAIS APPLIQUER (Arno : « propose-moi (sans l'appliquer) »). Pur.
 *
 * ⚠️ UN SEUL ÉCART SUFFIT À REFUSER, quel que soit le nombre de confirmations : un motif qui s'est trompé une
 * fois n'est pas « fiable à 95 % », il est à surveiller. C'est la lecture littérale de « confirmée 5 fois SANS
 * être écartée », et c'est la direction sûre — se tromper ici fabriquerait des étapes fausses sans contrôle.
 */
export function proposerPassageEnFiable(c: { confirmees: number; ecartees: number }): boolean {
  return c.ecartees === 0 && c.confirmees >= CONFIRMATIONS_POUR_PROPOSER;
}

/** Ce qu'une étape lue dans un mail porte. */
export interface EtapeLue {
  type: TypeEtape;
  certitude: Certitude;
  /**
   * La date de l'étape ELLE-MÊME quand le mail la donne (le rendez-vous est fixé « le 09/10/2026 »), sinon
   * `null` — et c'est alors la date du mail qui fait foi, décidée par l'appelant qui la connaît.
   *
   * ⚠️ `AAAA-MM-JJ`, jamais un `Date` : ce module est pur et ne doit pas dépendre du fuseau de celui qui le lit.
   */
  jour: string | null;
  /** La plage horaire du rendez-vous, telle qu'écrite (« 10h30 » → `{ de: '10:30', a: '11:00' }`). */
  heure: { de: string; a: string | null } | null;
  /** Le numéro porté par l'étape : `DEV-20261002-19048`, `FACT-20260930-16424`. */
  numero: string | null;
  /** Le rang d'un rappel (« Rappel 2 » → 2). */
  rang: number | null;
  /** Le texte utile : le commentaire de Monga, ou la phrase du gabarit. Ce qui s'affiche au survol. */
  texte: string | null;
  /** Qui a écrit le commentaire chez Monga, quand le gabarit le dit (« Envoyé par Laura Dartiguemalle »). */
  auteur: string | null;
}

/**
 * ══ LE CORPS DU COMMENTAIRE ══════════════════════════════════════════════════════════════════════════════════════
 *
 * Structure mesurée, stable depuis mars 2026 :
 *     Un nouveau message vous a été envoyé concernant la mission MNG-22816.
 *     <LE COMMENTAIRE>
 *     Envoyé par Laura Dartiguemalle, le 06/10/2026 à 13:53
 *
 * ⚠️ ON S'ARRÊTE À LA PREMIÈRE OCCURRENCE de « Envoyé par » : un mail de relance empile deux blocs, et un
 * découpage glouton aurait collé la signature du premier dans le commentaire du second — ce qui faisait apparaître
 * DEUX dates dans un même commentaire (1 cas sur 22 mesuré à l'audit) et rendait la date du rendez-vous ambiguë.
 */
export function commentaireMonga(texte: string | null | undefined): string | null {
  const t = texte ?? '';
  const m = /concernant la mission MNG-?\d{4,6}\s*\.?\s*([\s\S]*?)\s*(?:Envoy[ée]e? par|Vers Mission)/i.exec(t);
  const brut = (m?.[1] ?? '').replace(/\s+/g, ' ').trim();
  return brut === '' ? null : brut;
}

/** L'auteur du commentaire, quand le gabarit le signe. */
export function auteurCommentaire(texte: string | null | undefined): string | null {
  const m = /Envoy[ée]e? par\s+([^,\n]{2,60}),\s*le\s/i.exec(texte ?? '');
  const nom = (m?.[1] ?? '').trim();
  return nom === '' ? null : nom;
}

/** `JJ/MM/AAAA` → `AAAA-MM-JJ`. `null` si la date n'est pas un jour plausible. PUR. */
export function jourISO(jjmmaaaa: string | null | undefined): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((jjmmaaaa ?? '').trim());
  if (m === null) return null;
  const [, j, mo, a] = m;
  const nj = Number(j);
  const nm = Number(mo);
  if (nm < 1 || nm > 12 || nj < 1 || nj > 31) return null;
  return `${a}-${mo}-${j}`;
}

/** `10h30` ou `10h` → `10:30` / `10:00`. PUR. */
function heureISO(brut: string): string {
  const m = /^(\d{1,2})h(\d{2})?$/i.exec(brut.trim());
  if (m === null) return brut;
  return `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`;
}

/**
 * ══ 🔴🔴 LIRE LES ÉTAPES D'UN MAIL MONGA. LA FONCTION CENTRALE DU LOT. PUR. ══════════════════════════════════════
 *
 * Rend un TABLEAU, et il le faut : un mail de relance porte à la fois son rappel (objet) et le commentaire qui
 * l'accompagne (corps). Rendre une seule étape aurait obligé à choisir laquelle perdre.
 *
 * 🔴 LE CORPS EST LU AVANT L'OBJET, pour la raison consignée dans l'encadré d'en-tête : l'objet « Nouveau
 * commentaire » ne dit rien, et c'est l'objet de 53 des 98 mails.
 *
 * ⚠️ L'ORDRE DES MOTIFS COMPTE. « l'intervention … a été fixée » et « le rendez-vous … a été fixé » ne diffèrent
 * que par un mot, et ce mot sépare deux étapes distinctes de la frise (le diagnostic et l'intervention). Le motif
 * de l'intervention passe donc en premier, et il est ancré sur « l'intervention » — pas sur « fixé ».
 */
export function etapesDuMailMonga(
  objet: string | null | undefined, texte: string | null | undefined,
): EtapeLue[] {
  const o = (objet ?? '').trim();
  const com = commentaireMonga(texte);
  const auteur = auteurCommentaire(texte);
  const t = texte ?? '';
  const out: EtapeLue[] = [];
  const vide = {
    jour: null, heure: null, numero: null, rang: null, texte: null, auteur: null,
  } as const;

  /* ── ① LE CORPS DU COMMENTAIRE, D'ABORD ───────────────────────────────────────────────────────────────────── */
  if (com !== null) {
    /** La plage horaire d'un rendez-vous : « entre 10h30 et 11h00 », ou la variante « vers 10h00 » (1 cas mesuré). */
    const plage = (s: string): { de: string; a: string | null } | null => {
      const e = /entre\s+(\d{1,2}h\d{0,2})\s+et\s+(\d{1,2}h\d{0,2})/i.exec(s);
      if (e !== null) return { de: heureISO(e[1]), a: heureISO(e[2]) };
      const v = /vers\s+(\d{1,2}h\d{0,2})/i.exec(s);
      return v === null ? null : { de: heureISO(v[1]), a: null };
    };
    const jourDe = (s: string): string | null => jourISO(/(\d{2}\/\d{2}\/\d{4})/.exec(s)?.[1] ?? null);

    /* 🔴 L'INTERVENTION AVANT LE RENDEZ-VOUS : un seul mot les sépare. Voir l'avertissement ci-dessus. */
    if (/l[’']?intervention\s+avec\s+notre\s+artisan\s+partenaire\s+a\s+été\s+fix/i.test(com)) {
      out.push({
        type: 'rdv_intervention', certitude: 'fiable',
        jour: jourDe(com), heure: plage(com), numero: null, rang: null, texte: com, auteur,
      });
    } else if (/le\s+rendez-vous\s+avec\s+notre\s+artisan\s+partenaire\s+a\s+été\s+fix/i.test(com)) {
      out.push({
        type: 'prise_rdv', certitude: 'fiable',
        jour: jourDe(com), heure: plage(com), numero: null, rang: null, texte: com, auteur,
      });
    } else if (/accusons\s+bonne\s+réception\s+de\s+votre\s+demande/i.test(com)) {
      /* 🔴 L'OUVERTURE PAR ACCUSÉ DE RÉCEPTION (Arno) — à confirmer : 2 cas seulement dans l'audit. */
      out.push({ ...vide, type: 'ouverture', certitude: 'a_confirmer', texte: com, auteur });
    } else if (/le\s+rendez-vous\s+a\s+bien\s+eu\s+lieu/i.test(com)) {
      out.push({ ...vide, type: 'rdv_eu_lieu', certitude: 'a_confirmer', texte: com, auteur });
    } else if (/Votre\s+devis\s+N[°º]?\s*(DEV-\d{8}-\d+)/i.test(com)) {
      /* 🔴 LE SEUL SIGNAL DE DEVIS QUI PORTE SON NUMÉRO — 9 mails, 9 numéros. Le MONTANT n'y est jamais. */
      out.push({
        ...vide, type: 'devis_recu', certitude: 'fiable',
        numero: /Votre\s+devis\s+N[°º]?\s*(DEV-\d{8}-\d+)/i.exec(com)?.[1] ?? null,
        texte: com, auteur,
      });
    } else if (/rapport\s+d[’']?intervention\s+est\s+désormais\s+disponible/i.test(com)) {
      out.push({ ...vide, type: 'intervention', certitude: 'a_confirmer', texte: com, auteur });
    } else if (/rapport\s+de\s+visite\s+est\s+désormais\s+disponible/i.test(com)) {
      out.push({ ...vide, type: 'rdv_eu_lieu', certitude: 'a_confirmer', texte: com, auteur });
    } else if (/facture\s+d[’']?(acompte|intervention)/i.test(com)) {
      out.push({
        ...vide, type: 'facture', certitude: 'a_confirmer',
        numero: /(FACT-\d{8}-\d+)/i.exec(com)?.[1] ?? null, texte: com, auteur,
      });
    } else if (/pas\s+réussi\s+à\s+joindre\s+le\s+contact/i.test(com)) {
      out.push({ ...vide, type: 'contact_injoignable', certitude: 'a_confirmer', texte: com, auteur });
    } else {
      /**
       * 🔴 UN COMMENTAIRE QU'ON NE SAIT PAS LIRE RESTE UN COMMENTAIRE, et c'est un REPÈRE, pas une étape.
       * 19 mails sur 98 sont du texte humain libre (« Hello Anaïs… »). Les jeter perdrait l'historique ; en
       * faire des étapes encombrerait la frise de choses qui n'en sont pas.
       */
      out.push({ ...vide, type: 'commentaire', certitude: 'fiable', texte: com, auteur });
    }
  }

  /* ── ② L'OBJET, ENSUITE — il porte ce que le corps ne dit pas ──────────────────────────────────────────────── */
  const rappel = /Rappel\s+(\d)\s*:\s*Devis\s+en\s+att/i.exec(o);
  if (rappel !== null) {
    out.push({ ...vide, type: 'rappel_devis', certitude: 'fiable', rang: Number(rappel[1]), texte: o });
  } else if (/Mission\s+terminée/i.test(o) || /La\s+mission\s+est\s+terminée/i.test(t)) {
    out.push({ ...vide, type: 'cloture', certitude: 'a_confirmer', texte: o });
  } else if (/Devis\s+envoyé/i.test(o) && !out.some((e) => e.type === 'devis_recu')) {
    /* ⚠️ SEULEMENT SI LE CORPS N'A PAS DÉJÀ DONNÉ LE DEVIS AVEC SON NUMÉRO : sinon on compterait deux devis
       pour un seul, et le rang affiché sur la frise (« Devis 2 ») serait faux. */
    out.push({ ...vide, type: 'devis_recu', certitude: 'a_confirmer', texte: o });
  }

  return out;
}

/**
 * ══ 🔴🔴 L'OUVERTURE DE REPLI : LA DATE DU PREMIER MAIL DE LA RÉFÉRENCE ══════════════════════════════════════════
 *
 * DÉCISION D'ARNO (06/10/2026) : « L'ouverture prend l'accusé de réception s'il existe, sinon la date du premier
 * mail Monga de la référence, avec la mention “à confirmer”. »
 *
 * 🔴 POURQUOI UN REPLI PLUTÔT QU'UN TROU. L'audit a mesuré qu'aucun mail n'annonce l'ouverture : le premier mail
 * d'une référence est au hasard un commentaire (15 références), un « ticket » (10) ou un rappel (7). Sans repli,
 * la frise commencerait donc à « Prise de rendez-vous » dans 33 cas sur 35, comme si le dossier était né là.
 *
 * ⚠️ ET ELLE EST TOUJOURS « À CONFIRMER », même quand elle vient d'un accusé de réception : dans un cas c'est une
 * déduction (le premier mail n'est pas l'ouverture, il en est la trace la plus ancienne), dans l'autre le gabarit
 * n'a été vu que deux fois. Les deux méritent le même doute affiché.
 */
export function ouvertureDeRepli(premierMailLe: string): EtapeLue {
  return {
    type: 'ouverture', certitude: 'a_confirmer', jour: premierMailLe.slice(0, 10),
    heure: null, numero: null, rang: null,
    texte: 'Date du premier mail Monga de cette référence — aucun accusé de réception reçu.', auteur: null,
  };
}

/**
 * LE RANG D'UN DEVIS dans sa référence (« Devis 1 », « Devis 2 »…). PUR.
 *
 * 🔴 PAR ORDRE D'ARRIVÉE, et par numéro quand il existe. L'audit a mesuré qu'AUCUNE référence ne reçoit deux
 * devis de numéros différents par mail (une seule en a deux mails, avec le MÊME numéro : un envoi en double).
 * Les devis successifs existent pourtant — deux commentaires humains en parlent sur la référence 23987 — mais ils
 * arrivent en texte libre. Le rang doit donc tenir pour N devis, tout en sachant que l'automatique n'en trouvera
 * le plus souvent qu'un, et que les suivants seront posés à la main.
 *
 * ⚠️ LES DOUBLONS DE NUMÉRO NE COMPTENT PAS DEUX FOIS : c'est exactement le cas mesuré sur la référence 23449.
 */
export function rangsDesDevis(
  devis: readonly { id: number; numero: string | null; jour: string }[],
): Map<number, number> {
  const ordonne = [...devis].sort((a, b) => (a.jour === b.jour ? a.id - b.id : (a.jour < b.jour ? -1 : 1)));
  const out = new Map<number, number>();
  const vus = new Map<string, number>();
  let rang = 0;
  for (const d of ordonne) {
    const cle = d.numero;
    if (cle !== null && vus.has(cle)) { out.set(d.id, vus.get(cle) as number); continue; }
    rang += 1;
    if (cle !== null) vus.set(cle, rang);
    out.set(d.id, rang);
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT CLOTURE-REOUVERTURE — ON FERME ET ON ROUVRE PAR UNE CARTE, ET PAR RIEN D'AUTRE ══════════════════

   ═══ CE QUI A ÉTÉ RETIRÉ ICI, ET SUR ACCORD EXPRÈS D'ARNO ═══════════════════════════════════════════════════
   `proposerCloture(etapes, traite)` vivait à cette place. Elle disait « une intervention est signalée réalisée »,
   et la frise en faisait un lien « Clôturer cet événement ? » qui fermait le dossier EN UN CLIC.

   ARNO (08/10/2026) : « Retire la ligne ou le bouton qui permettait de fermer un événement en un seul clic
   (ailleurs que par la carte Clôture). » Elle part donc entière : la fonction, le champ que la route rendait,
   la ligne de la frise, la propriété `onProposerCloture` et le branchement de la fiche du bien.

   🔴 CE QU'ELLE PROTÉGEAIT N'EST PAS PERDU — c'est même renforcé. Elle refusait de fermer automatiquement
   (« PROPOSITION de clôturer, jamais automatique ») : fermer reste un geste humain, mais il passe désormais par
   une CARTE, qui porte une date et reste sur la frise. On ne perd pas un garde-fou, on gagne une trace.

   ═══ 🔴🔴 UNE CARTE, UN ÉTAT — ET UNE SEULE DÉCLARATION DE CE LIEN ══════════════════════════════════════════
   La règle est écrite ICI, dans le module pur, et lue des deux côtés : par l'écran (pour savoir s'il doit
   demander confirmation) et par la route (pour appliquer l'état). Deux écritures auraient fini par faire poser
   une carte sans fermer, ou fermer sans carte.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * L'ÉTAT que poser cette carte impose à l'événement, ou `null` si elle n'en change aucun. PUR.
 *
 * ⚠️ `'en_cours'` ET NON `'a_traiter'` POUR UNE RÉOUVERTURE : un dossier qu'on rouvre est un dossier qu'on
 * reprend, pas un dossier qu'on n'a jamais regardé. C'est aussi ce que la contrainte de la base attend d'un
 * événement sans date de traitement (`gestion_evenement_traite_chk`), et les deux valeurs la satisfont — le choix
 * est donc de sens, pas de contrainte.
 */
export function etatApresCarte(type: TypeEtape): 'traite' | 'en_cours' | null {
  if (type === 'cloture') return 'traite';
  if (type === 'reouverture') return 'en_cours';
  return null;
}

/**
 * LES CARTES QUE LA GRILLE PROPOSE, selon que l'événement est ouvert ou clos. PUR.
 *
 * ARNO : « La carte “Clôture” n'est proposée que si l'événement est ouvert. […] La carte “Réouverture” n'est
 * proposée que si l'événement est clos. »
 *
 * 🔴 LES DEUX NE SONT JAMAIS OFFERTES ENSEMBLE, et c'est ce qui rend la grille lisible : à tout instant, le
 * dossier a UN état, et la grille ne montre que le geste qui a un sens. Proposer les deux aurait obligé à
 * refuser l'une après coup, par un message.
 *
 * ⚠️ TOUTES LES AUTRES CARTES RESTENT, dans leur ordre : on ne filtre que ces deux-là.
 */
export function cartesDuReservoir(evenementOuvert: boolean): TypeEtape[] {
  /**
   * ══ 🔴🔴 LOT ETAT-PAR-LA-FRISE, POINT 4 — UN DOSSIER CLOS N'OFFRE QUE « RÉOUVERTURE » ══════════════════════
   *
   * ARNO (08/10/2026) : « Quand l'événement est clos, la grille “Ajouter une carte” ne propose QUE
   * “Réouverture” : aucune autre carte ne peut être posée après une Clôture. »
   *
   * 🔴 CE QUE CELA RÉPARE : la grille d'un dossier clos offrait encore douze cartes. Poser un « Devis reçu »
   * après la Clôture produisait une carte APRÈS la dernière borne — visible sur la frise, hors de toute
   * période, et donc invisible partout ailleurs. Pour reprendre un dossier, on le ROUVRE d'abord ; c'est un
   * geste daté, qui laisse une trace, et c'est exactement ce que la carte « Réouverture » est.
   *
   * ⚠️ AUCUN TYPE N'EST PERDU : rouvrir rend la grille entière, à l'instant même. On ne retire pas une
   * possibilité, on impose un ordre — celui que la frise raconte déjà.
   */
  if (!evenementOuvert) return ['reouverture'];
  return TYPES_RESERVOIR.filter((t) => t !== 'reouverture');
}

/**
 * CE QUE LA FACE « SIMPLE INFORMATION » DE LA GRILLE PROPOSE, selon l'état. PUR.
 *
 * 🔴 VIDE SUR UN DOSSIER CLOS, pour la raison du point 4 : « aucune autre carte ne peut être posée après une
 * Clôture » — et un point posé après la dernière borne serait aussi hors période qu'un carré.
 *
 * ⚠️ LA BASCULE « Étape / Simple information » N'EST PAS RETIRÉE DE L'ÉCRAN (garde-fou CLAUDE.md) : elle reste
 * rendue, son second bouton devient inactif, et la raison est écrite à côté.
 */
export function informationsDuReservoir(evenementOuvert: boolean): TypeEtape[] {
  return evenementOuvert ? [...TYPES_INFORMATION] : [];
}

/**
 * CE QU'ON DEMANDE AVANT DE POSER LA CARTE, ou `null` quand il n'y a rien à demander. PUR.
 *
 * 🔴 LES MOTS SONT CEUX D'ARNO, AU CARACTÈRE PRÈS. Une confirmation reformulée est une confirmation qu'on relit
 * de travers : elle doit dire la CONSÉQUENCE sur le bien, et non répéter le nom du bouton.
 */
export interface ConfirmationCarte {
  question: string;
  /** Le mot du bouton qui confirme. « Annuler » est l'autre, partout. */
  valider: string;
}

export function confirmationCarte(type: TypeEtape): ConfirmationCarte | null {
  if (type === 'cloture') {
    return {
      question: 'Clôturer cet événement ? Le bien n’aura plus d’événement ouvert.',
      valider: 'Clôturer',
    };
  }
  if (type === 'reouverture') {
    return {
      question: 'Rouvrir cet événement ? Le bien redeviendra un bien avec événement ouvert.',
      valider: 'Rouvrir',
    };
  }
  return null;
}
