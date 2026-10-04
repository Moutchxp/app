import { motClassement, type Classement, type Periode } from './periodesConversation';

/**
 * ══ 🔴🔴 LOT VISUALISER-MAIL-ET-REPERE-FENETRE, POINT 2 — OÙ SE POSE LE REPÈRE, ET CE QU'IL EXPLIQUE ═════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026), fil 3490 : « le repère “À partir d'ici : aucun bien · jeudi 1 octobre 2026 à 20:12
 * · a.jorel@…” n'est pas placé au bon endroit. »
 *
 * ═══ 🔴🔴 LE DIAGNOSTIC, MESURÉ EN BASE PUIS À L'ÉCRAN ═══════════════════════════════════════════════════════════
 *
 * ① EN BASE. Le fil 3490 porte six mails — 5495 (23/09 15:25), 5499 (23/09 15:55), 57122 (28/09), 57368 (01/10
 *    12:46), 57472 (03/10 14:31), 57473 (03/10 15:00) — et deux fenêtres vivantes :
 *      · la 23836, depuis le mail 5495, « 2 Square Henri Régnault — lot 484 » ;
 *      · la 23812, depuis le mail 57368, « aucun bien », posée le 01/10 à 20:12 par a.jorel@.
 *    La première ne produit AUCUN repère (elle commence au premier mail : « À partir d'ici » en tête de
 *    conversation ne sépare rien). La seconde est celle qu'Arno voit, et elle commence bien au mail **57368**.
 *
 * ② À L'ÉCRAN. Relevé dans le navigateur, la liste étant en « Plus récent d'abord » :
 *      03/10 15:00 · 03/10 14:31 · **[REPÈRE]** · 01/10 12:46 · 28/09 · 23/09 15:55 · 23/09 15:25
 *    Le repère est donc rendu JUSTE AU-DESSUS du mail 57368 — ce qui est exact dans l'ordre ancien → récent, et
 *    FAUX dans celui-ci : au-dessus veut dire « plus tard ». La ligne paraît appartenir au mail du 03/10 14:31,
 *    alors qu'elle ouvre celui du 01/10 qui est en dessous.
 *
 * 🔴 LA CAUSE EST D'UNE LIGNE : le repère était rendu AVANT son mail dans le DOM, quel que soit le tri. Le mail
 * visé, lui, a toujours été le bon — ce n'est ni un problème de date de geste, ni un problème de calcul.
 *
 * RÈGLE D'ARNO : « le repère est attaché au MAIL QUI OUVRE LA FENÊTRE. Il est placé du côté qui le précède
 * chronologiquement, quel que soit l'ordre d'affichage (au-dessus en ordre ancien → récent, en dessous en ordre
 * récent → ancien). »
 *
 * 🔒 CE MODULE EST PUR : il décide d'un CÔTÉ et compose des MOTS. Aucune règle de fenêtre n'est touchée — ni la
 * création, ni la fermeture, ni la règle du dernier choix. C'est de l'affichage, et rien d'autre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** L'ordre d'affichage du fil, tel que l'écran le tient. */
export type OrdreAffichage = 'recent' | 'ancien';

/**
 * ══ 🔴🔴 DE QUEL CÔTÉ DU MAIL LE REPÈRE SE POSE. PUR. ════════════════════════════════════════════════════════════
 *
 * « Du côté qui le précède chronologiquement » (Arno). En ordre ancien → récent, ce qui précède est AU-DESSUS ; en
 * ordre récent → ancien, c'est EN DESSOUS. C'est tout le correctif, et il tient dans cette fonction.
 *
 * ⚠️ ON NE PARLE PAS DE « avant / après le mail dans la liste » MAIS DE CHRONOLOGIE : les deux coïncidaient dans
 * un seul des deux tris, et c'est précisément ce qui a fait croire que le repère était bien placé.
 */
export function coteDuRepere(ordre: OrdreAffichage): 'dessus' | 'dessous' {
  return ordre === 'ancien' ? 'dessus' : 'dessous';
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 CE QUE LA PASTILLE « i » EXPLIQUE : UN AVANT / APRÈS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Un état de classement, mis en mots pour la comparaison. */
export interface EtatClassement {
  /** « Classé », « Interne », « Hors gestion ». */
  statut: string;
  /** « 2 Square Henri Régnault — lot 484 », ou « aucun bien ». */
  biens: string;
  /** Les personnes nommées par le classement. Vide = aucune. */
  personnes: string;
}

export const AUCUN_BIEN = 'aucun bien';
export const AUCUNE_PERSONNE = 'aucune personne nommée';

/**
 * ══ 🔴 LE STATUT D'UN CLASSEMENT, EN UN MOT. PUR. ════════════════════════════════════════════════════════════════
 *
 * 🔴🔴 LOT REPERE-INTEGRE-ET-MODALE-AVANT-APRES — « À CLASSER » REJOINT LES TROIS AUTRES, et Arno les nomme tous
 * les quatre : « statut (Classé / Interne / Hors gestion / À classer) ».
 *
 * Une fenêtre « biens » SANS aucun bien ne classe rien : l'annoncer « Classé » était faux, et c'est précisément
 * le cas d'Arno sur le fil 3490 (la fenêtre du 01/10 à 20:12, « aucun bien »). C'est le même vocabulaire que la
 * capsule de la liste, où « À classer » veut déjà dire exactement cela.
 */
export const STATUT_CLASSE = 'Classé';
export const STATUT_A_CLASSER = 'À classer';
export const STATUT_INTERNE = 'Interne';
export const STATUT_HORS_GESTION = 'Hors gestion';

/**
 * ══ 🔴🔴 LA MARQUE « INTERNE » DE L'ÉCHANGE EST LE REPLI — DÉFAUT MESURÉ LE 04/10/2026 ═══════════════════════════
 *
 * CONSTAT D'ARNO : « dans la fenêtre ouverte par le ⓘ de la ligne rouge, le statut “après” s'affiche À CLASSER,
 * alors que les mails concernés affichent INTERNE dans la liste. »
 *
 * CE QUE LA BASE DIT, ET C'EST ELLE QUI TRANCHE (fil 3490) :
 *   · `gestion_fil_interne` — ligne 75 ACTIVE depuis le 04/10 à 01:28:30 : l'échange EST marqué interne ;
 *   · `gestion_fil_periode` — les CINQ fenêtres du fil sont de sorte « biens », aucune n'est « interne » ;
 *   · `gestion_message_interne` (migration 297, appliquée) — VIDE, et la table n'est NOMMÉE NULLE PART dans le
 *     code : la projection par mail n'a jamais été câblée. Ce n'est donc pas une source vivante.
 *
 * 🔴 LA LISTE A DONC RAISON, ET LA MODALE AVAIT TORT. La liste lit la marque d'échange (`capsuleStatut`, qui place
 * « interne » juste après les deux verts) ; la modale ne lisait QUE les fenêtres, et une fenêtre « biens » sans
 * bien se lit « À classer ». Elle omettait une source, et affirmait donc un statut qui n'était pas celui des mails.
 *
 * ⚠️ ET C'EST EXACTEMENT CE QUE LA MIGRATION 297 ANNONÇAIT : « elle ne touche pas `gestion_fil_interne`, qui reste
 * la marque de l'ÉCHANGE. Les deux cohabitent : la marque d'échange est le repli quand aucune fenêtre ne couvre
 * le mail. » Le repli était décrit, il n'était pas appliqué ici.
 *
 * 🔴 L'ORDRE EST CELUI DE LA CAPSULE DE LA LISTE, AU MOT PRÈS (`capsuleStatut`) : une fenêtre qui dit « interne »
 * ou « hors gestion » parle d'elle-même ; des biens valent « Classé » ; et c'est seulement quand il n'y a rien à
 * dire que la marque d'échange répond. Deux ordres différents auraient fait diverger la liste et la modale sur
 * un autre cas, un autre jour.
 *
 * ⚠️ LE PARAMÈTRE EST FACULTATIF ET VAUT `false` : tout le code écrit avant ce lot se comporte à l'identique.
 */
export function motStatutClassement(c: Classement, interneDeLEchange = false): string {
  if (c.sorte === 'interne') return STATUT_INTERNE;
  if (c.sorte === 'hors_gestion') return STATUT_HORS_GESTION;
  if (c.biens.length > 0) return STATUT_CLASSE;
  return interneDeLEchange ? STATUT_INTERNE : STATUT_A_CLASSER;
}

/**
 * ══ 🔴 LES PERSONNES, AVEC LEUR RÔLE. PUR. ═══════════════════════════════════════════════════════════════════════
 *
 * Arno : « personnes concernées (avec rôle) ». Un nom seul ne dit pas si l'on parle du bailleur ou de l'occupant,
 * et c'est exactement ce qu'on cherche en lisant un changement de suivi.
 */
export function motRolePersonne(sorte: 'proprietaire' | 'locataire'): string {
  return sorte === 'proprietaire' ? 'propriétaire' : 'locataire';
}

export function personnesAvecRole(c: Classement): string {
  const noms = (c.personnes ?? [])
    .map((p) => `${p.libelle.trim()} (${motRolePersonne(p.sorte)})`)
    .filter((l) => l.trim() !== '');
  return noms.length === 0 ? AUCUNE_PERSONNE : noms.join(', ');
}

/** Les BIENS d'un classement, écrits. PUR. */
export function motBiens(c: Classement): string {
  if (c.sorte !== 'biens') return '—';
  const noms = c.biens.map((b) => b.libelle.trim()).filter((l) => l !== '');
  return noms.length === 0 ? AUCUN_BIEN : noms.join(', ');
}

/** Les PERSONNES d'un classement, écrites. PUR. */
export function motPersonnes(c: Classement): string {
  const noms = (c.personnes ?? []).map((p) => p.libelle.trim()).filter((l) => l !== '');
  return noms.length === 0 ? AUCUNE_PERSONNE : noms.join(', ');
}

/**
 * 🔴🔴 LOT REPERE-INTEGRE-ET-MODALE-AVANT-APRES — LES PERSONNES PORTENT DÉSORMAIS LEUR RÔLE dans le comparatif
 * (`personnesAvecRole`), parce qu'Arno l'a demandé ligne à ligne : « personnes concernées (avec rôle) ».
 *
 * ⚠️ `motPersonnes` RESTE : c'est le nom seul, et le bloc « Suivi dans la conversation » l'écrit ainsi depuis
 * toujours. Deux lectures d'une même donnée, chacune pour un écran — pas une duplication à réduire.
 */
export function etatDuClassement(c: Classement, interneDeLEchange = false): EtatClassement {
  return {
    statut: motStatutClassement(c, interneDeLEchange),
    biens: motBiens(c),
    personnes: personnesAvecRole(c),
  };
}

/**
 * ══ 🔴 LE TYPE DE CHOIX QUI A PRODUIT CETTE FENÊTRE. PUR. ════════════════════════════════════════════════════════
 *
 * Les trois mots sont ceux du bloc « Suivi dans la conversation », repris à la lettre — on ne réinvente pas un
 * vocabulaire pour expliquer un geste que l'écran nomme déjà autrement.
 *
 * ⚠️ UNE FENÊTRE QUI COMMENCE AU PREMIER MAIL COUVRE TOUTE LA CONVERSATION, et c'est ce que le geste disait. Une
 * fenêtre qui commence plus loin ouvre « ce mail et la conversation à venir ». « Ce mail uniquement » ne produit
 * pas de fenêtre du tout — c'est une exception, et elle se marque sur le mail lui-même.
 */
export const CHOIX_CONVERSATION = 'toute la conversation';
export const CHOIX_SUITE = 'ce mail et la conversation à venir';
export const CHOIX_MAIL = 'ce mail uniquement';

export function motChoixFenetre(rangDuMail: number): string {
  return rangDuMail <= 0 ? CHOIX_CONVERSATION : CHOIX_SUITE;
}

export interface ComparatifRepere {
  /** `null` = rien avant : cette fenêtre est la première du fil. */
  avant: EtatClassement | null;
  apres: EtatClassement;
  choix: string;
  qui: string | null;
  quand: string | null;
}

/**
 * ══ 🔴🔴 L'AVANT / APRÈS D'UNE FENÊTRE. PUR. ═════════════════════════════════════════════════════════════════════
 *
 * « Elle explique le changement avec un comparatif AVANT / APRÈS : biens (adresse, lot), statut (Classé / Interne
 * / Hors gestion), personnes, type de choix, qui, quand » (Arno).
 *
 * 🔴 L'« AVANT » EST LA FENÊTRE QUI COUVRAIT LE MAIL PRÉCÉDENT, et non « la fenêtre créée juste avant dans le
 * temps ». C'est la seule lecture qui répond à la question posée : « qu'est-ce qui change À CET ENDROIT du fil ? ».
 * Deux fenêtres posées le même jour sur deux mails éloignés ne se succèdent pas pour autant.
 *
 * ⚠️ PLUSIEURS FENÊTRES PEUVENT COMMENCER AU MÊME MAIL (le fil 3490 en a eu trois sur le 57368) : on prend la
 * DERNIÈRE de celles qui commencent strictement avant, dans l'ordre des mails puis de la liste reçue — c'est
 * l'ordre dans lequel la projection les applique.
 */
export function comparatifRepere(o: {
  mails: readonly number[];
  periodes: readonly Periode[];
  periodeId: number;
  /**
   * 🔴 LA MARQUE « INTERNE » DE L'ÉCHANGE, qui sert de REPLI quand la fenêtre n'a rien à dire. Voir l'encadré de
   * `motStatutClassement` : sans elle, la modale annonçait « À classer » là où la liste affichait « Interne ».
   *
   * ⚠️ FACULTATIVE : les appelants d'avant ce lot se comportent à l'identique.
   */
  interneDeLEchange?: boolean;
}): ComparatifRepere | null {
  const rang = new Map(o.mails.map((m, i) => [m, i]));
  const moi = o.periodes.find((p) => p.id === o.periodeId);
  if (moi === undefined) return null;
  const monRang = rang.get(moi.depuisMessageId) ?? -1;

  /* 🔴 LA DERNIÈRE FENÊTRE QUI COMMENCE STRICTEMENT AVANT CE MAIL : c'est elle qui couvrait le mail d'avant. */
  const avant = o.periodes
    .filter((p) => p.id !== moi.id && (rang.get(p.depuisMessageId) ?? -1) >= 0
      && (rang.get(p.depuisMessageId) as number) < monRang)
    .sort((a, b) => (rang.get(a.depuisMessageId) as number) - (rang.get(b.depuisMessageId) as number))
    .at(-1) ?? null;

  return {
    /* 🔴 LA MARQUE D'ÉCHANGE S'APPLIQUE AUX DEUX CÔTÉS : elle ne commence pas à cette fenêtre, elle couvre tout
       l'échange. L'appliquer au seul « après » aurait fabriqué un changement qui n'a pas eu lieu. */
    avant: avant === null ? null : etatDuClassement(avant.classement, o.interneDeLEchange === true),
    apres: etatDuClassement(moi.classement, o.interneDeLEchange === true),
    choix: motChoixFenetre(monRang),
    qui: moi.parLibelle ?? null,
    quand: moi.le ?? null,
  };
}

/** La phrase du repère, celle qui s'affiche en rouge. PUR — c'est le texte d'avant ce lot, inchangé. */
export function phraseRepere(c: Classement): string {
  return `À partir d’ici : ${motClassement(c)}`;
}

/**
 * ══ 🔴🔴 LOT REPERE-INTEGRE-ET-MODALE-AVANT-APRES — LA PASTILLE OUVRE UNE MODALE, PLUS UNE BULLE ════════════════
 *
 * DÉCISION D'ARNO (03/10/2026) : « la pastille s'ouvre au CLIC (et à Entrée ou Espace au clavier), plus au
 * survol. Bulle “Voir le détail du changement” au survol seulement. »
 *
 * 🔴 POURQUOI LE CHANGEMENT EST JUSTE. Une bulle au survol se referme dès qu'on s'en éloigne : elle convient à un
 * descriptif qu'on consulte d'un coup d'œil, pas à un comparatif en deux colonnes qu'on LIT, qu'on compare ligne
 * à ligne, et dont on veut relire le pied. Le contenu a changé de nature ; le geste suit.
 */
export const AIDE_PASTILLE_REPERE = 'Voir le détail du changement';

/** Le titre de la modale. PUR. `null` = la date est inconnue, et on ne l'invente pas. */
export function titreModaleChangement(quandFr: string | null): string {
  return quandFr === null ? 'Changement de suivi' : `Changement de suivi — ${quandFr}`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LES LIGNES DU COMPARATIF — CE QUE LA MODALE MET EN REGARD
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Une ligne du tableau : le même intitulé, l'état d'avant, celui d'après, et s'ils diffèrent. */
export interface LigneComparatif {
  libelle: string;
  avant: string;
  apres: string;
  /** 🔴 C'EST ELLE QUI SE MET EN ÉVIDENCE. Vraie dès que les deux côtés ne disent pas la même chose. */
  modifie: boolean;
}

/** Ce qu'on écrit quand il n'y a rien avant : la fenêtre est la première de l'échange. */
export const RIEN_AVANT = '—';

/**
 * ══ 🔴🔴 LE COMPARATIF, LIGNE À LIGNE. PUR. ══════════════════════════════════════════════════════════════════════
 *
 * Arno : « DEUX colonnes, “Avant” à gauche, “Après” à droite, lignes ALIGNÉES pour comparer : statut, bien(s)
 * (adresse, type, lot), personnes concernées (avec rôle), choix de suivi ; les lignes qui DIFFÈRENT sont mises en
 * évidence. »
 *
 * 🔴 LES QUATRE LIGNES SONT TOUJOURS RENDUES, même identiques — c'est ce qui rend la comparaison lisible : on lit
 * une grille, pas une liste de différences. Ce sont les lignes MODIFIÉES qui se signalent, pas les autres qui
 * disparaissent.
 *
 * ⚠️ « CHOIX DE SUIVI » N'A PAS D'AVANT : c'est le geste qui a produit CETTE fenêtre, pas un état antérieur. On
 * écrit donc un tiret à gauche, et la ligne n'est jamais marquée « modifié » — elle ne compare rien.
 */
export function lignesComparatif(c: ComparatifRepere): LigneComparatif[] {
  const ligne = (libelle: string, avant: string | null, apres: string): LigneComparatif => ({
    libelle,
    avant: avant ?? RIEN_AVANT,
    apres,
    modifie: avant !== null && avant !== apres,
  });
  return [
    ligne('Statut', c.avant?.statut ?? null, c.apres.statut),
    ligne('Bien(s)', c.avant?.biens ?? null, c.apres.biens),
    ligne('Personnes concernées', c.avant?.personnes ?? null, c.apres.personnes),
    { libelle: 'Choix de suivi', avant: RIEN_AVANT, apres: c.choix, modifie: false },
  ];
}

/**
 * ══ 🔴 COMBIEN DE MAILS CETTE FENÊTRE COUVRE. PUR. ═══════════════════════════════════════════════════════════════
 *
 * Arno : « le nombre de mails couverts par la nouvelle fenêtre ».
 *
 * 🔴 ELLE COURT DE SON MAIL JUSQU'À LA FENÊTRE SUIVANTE, celle-ci exclue — c'est la définition même d'une période
 * (« à partir de ce mail, inclus »). Sans fenêtre suivante, elle va jusqu'au dernier mail de l'échange.
 *
 * ⚠️ ON COMPTE LES MAILS DE L'ÉCHANGE, pas les jours : c'est ce qu'on veut savoir en lisant « à partir d'ici ».
 */
export function nbMailsCouverts(o: {
  mails: readonly number[];
  periodes: readonly Periode[];
  periodeId: number;
}): number {
  const rang = new Map(o.mails.map((m, i) => [m, i]));
  const moi = o.periodes.find((p) => p.id === o.periodeId);
  if (moi === undefined) return 0;
  const debut = rang.get(moi.depuisMessageId);
  if (debut === undefined) return 0;
  const suivants = o.periodes
    .filter((p) => p.id !== moi.id)
    .map((p) => rang.get(p.depuisMessageId))
    .filter((r): r is number => r !== undefined && r > debut)
    .sort((a, b) => a - b);
  const fin = suivants[0] ?? o.mails.length;
  return Math.max(0, fin - debut);
}

/** Le mot du compte, au pluriel juste. PUR. */
export function motMailsCouverts(n: number): string {
  return n <= 1 ? '1 mail couvert par cette fenêtre' : `${n} mails couverts par cette fenêtre`;
}
