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
  | 'devis_accepte'
  | 'rdv_intervention'
  | 'intervention'
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
  | 'autre';

/** Les étapes MAJEURES, celles qui font la colonne vertébrale de la frise. Ordre chronologique attendu. */
export const ETAPES_MAJEURES: readonly TypeEtape[] = [
  'ouverture', 'prise_rdv', 'rdv_eu_lieu', 'devis_recu', 'devis_accepte',
  'rdv_intervention', 'intervention', 'cloture',
];

/**
 * 🔴 LES ÉTAPES QU'ON ATTEND, et qui s'affichent EN POINTILLÉ tant qu'elles ne sont pas atteintes (Arno).
 *
 * ⚠️ `rdv_eu_lieu` N'EN FAIT PAS PARTIE, et c'est voulu : Monga ne l'envoie que dans 3 cas sur 35 références.
 * L'afficher en pointillé partout ferait croire à un trou dans le dossier là où il n'y a qu'un gabarit que Monga
 * n'émet pas toujours. On ne promet pas une étape qu'on ne sait pas attendre.
 */
export const ETAPES_ATTENDUES: readonly TypeEtape[] = [
  'ouverture', 'prise_rdv', 'devis_recu', 'devis_accepte', 'rdv_intervention', 'intervention', 'cloture',
];

/** Les repères discrets : un petit point sur la frise, le contenu au survol. Jamais une étape. */
export const REPERES: readonly TypeEtape[] =
  ['facture', 'rappel_devis', 'contact_injoignable', 'commentaire', 'note'];

export function estRepere(t: TypeEtape): boolean {
  return REPERES.includes(t);
}

/**
 * Les types proposés par « + Ajouter une étape » (Arno) : les étapes majeures, puis les quatre siennes.
 *
 * ⚠️ `commentaire` N'Y EST PAS : un commentaire est ce que MONGA dit, pas ce qu'on ajoute. Pour écrire quelque
 * chose soi-même il y a « Autre (libre) », qui porte son texte et s'affiche comme une étape assumée.
 */
export const TYPES_AJOUTABLES: readonly TypeEtape[] = [
  ...ETAPES_MAJEURES, 'facture', 'assurance', 'expertise', 'relance', 'autre',
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
export const TYPES_INFORMATION: readonly TypeEtape[] = ['note', 'facture', 'contact_injoignable', 'relance'];

/** Le rang d'affichage à date égale. Deux étapes du même jour se rangent dans l'ordre du dossier, pas au hasard. */
const RANG_ETAPE: Record<TypeEtape, number> = {
  ouverture: 0, prise_rdv: 1, rdv_eu_lieu: 2, devis_recu: 3, devis_accepte: 4,
  rdv_intervention: 5, intervention: 6, cloture: 7,
  facture: 8, rappel_devis: 9, contact_injoignable: 10, commentaire: 11,
  assurance: 12, expertise: 13, relance: 14, autre: 15, note: 16,
};

export function rangEtape(t: TypeEtape): number {
  return RANG_ETAPE[t] ?? 99;
}

/** Le mot lisible d'un type d'étape. Écrit UNE fois : deux listes finiraient par diverger. */
export function motEtape(t: TypeEtape): string {
  switch (t) {
    case 'ouverture': return 'Ouverture';
    case 'prise_rdv': return 'Prise de rendez-vous';
    case 'rdv_eu_lieu': return 'Rendez-vous effectué';
    case 'devis_recu': return 'Devis reçu';
    case 'devis_accepte': return 'Acceptation du devis';
    case 'rdv_intervention': return 'Rendez-vous d’intervention';
    case 'intervention': return 'Intervention';
    case 'cloture': return 'Clôture';
    case 'facture': return 'Facture';
    case 'rappel_devis': return 'Rappel de devis';
    case 'contact_injoignable': return 'Contact injoignable';
    case 'commentaire': return 'Commentaire Monga';
    case 'assurance': return 'Passage de l’assurance';
    case 'expertise': return 'Expertise';
    case 'relance': return 'Relance';
    case 'autre': return 'Autre';
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

/**
 * ══ 🔴 « INTERVENTION RÉALISÉE » OU « MISSION TERMINÉE » ⇒ ON **PROPOSE** DE CLÔTURER ════════════════════════════
 *
 * RÈGLE D'ARNO : « PROPOSITION de clôturer l'événement (jamais automatique) ». Pur : la fonction dit s'il y a
 * lieu de proposer, l'écran affiche, et c'est un humain qui clôture.
 *
 * ⚠️ RIEN N'EST PROPOSÉ SI L'ÉVÉNEMENT EST DÉJÀ TRAITÉ : une proposition qui porte sur ce qui est fait apprend à
 * ignorer les propositions.
 */
export function proposerCloture(
  etapes: readonly { type: TypeEtape; statut: string }[], evenementTraite: boolean,
): boolean {
  if (evenementTraite) return false;
  return etapes.some((e) => e.statut !== 'retire' && (e.type === 'intervention' || e.type === 'cloture'));
}
