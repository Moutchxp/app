/**
 * ══ 🔴🔴 LOT CORBEILLE-SANS-STATUT, POINT 2 — UN MAIL JETÉ SANS STATUT EST **INERTE**. MODULE PUR ════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (06/10/2026), mot pour mot : « On peut mettre un mail à la corbeille sans avoir choisi “Rattacher”
 * ou “Interne”. Aucune obligation, aucun blocage, aucun message demandant un statut. Si le mail n'a NI bien
 * rattaché NI marque Interne au moment de sa mise à la corbeille, il devient INERTE : il sort de “À classer” et de
 * “À rattacher” […], ses propositions de rattachement ne sont plus montrées, la passe automatique ne le rattache
 * plus et ne lui propose plus rien, et il n'apparaît dans aucun historique de bien. Ne supprime rien : les
 * propositions restent en base, simplement ignorées tant que le mail est à la corbeille. »
 *
 * ═══ 🔴🔴 CE QUE « INERTE » EST, EXACTEMENT — ET POURQUOI C'EST UN ÉTAT DÉRIVÉ ═════════════════════════════════
 *
 * Un mail est inerte quand les TROIS conditions tiennent EN MÊME TEMPS :
 *   ① il est à la corbeille (`gestion_message.corbeille_le`, l'état que GMAIL dit — lot BOITE-INTERNE-CORBEILLE) ;
 *   ② aucun lien CONFIRMÉ vers un bien (lot / propriétaire / locataire) ;
 *   ③ aucune marque « interne » en vigueur sur lui (sa propre marque, sinon celle de son échange).
 *
 * 🔴 AUCUNE COLONNE, AUCUNE MIGRATION, ET C'EST LE CŒUR DU LOT. « Inerte » n'est pas un état qu'on POSE : c'est un
 * état qu'on LIT, à chaque fois, des trois faits ci-dessus. Trois conséquences, toutes demandées par Arno :
 *   · RÉINTÉGRER suffit à le réveiller — la condition ① tombe, et tout revient, propositions comprises. Rien à
 *     défaire, rien à reconstruire ;
 *   · le remettre à la corbeille le rendort, « et ainsi de suite, sans limite » ;
 *   · RATTACHER un mail déjà jeté le réveille aussi, parce que ② tombe — et c'est juste : il a un statut.
 *
 * 🔴 ET RIEN N'EST SUPPRIMÉ. Les propositions restent en base, aux mêmes identifiants, avec leurs motifs : on
 * cesse de les LIRE, on ne les efface pas. C'est ce qui rend la réintégration exacte plutôt qu'approchée.
 *
 * ═══ ⚠️ CE QUE CE MODULE NE DÉCIDE PAS ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ IL NE BLOQUE RIEN, ET N'A RIEN À BLOQUER : « aucune obligation, aucun blocage, aucun message demandant un
 * statut » (Arno). La corbeille prend des identifiants et agit ; elle n'a jamais regardé le statut d'un mail, et
 * ce lot ne lui apprend pas à le faire. Ce module ne sert qu'à LIRE.
 *
 * ⚠️ UN MAIL JETÉ **AVEC** UN STATUT N'EST PAS INERTE, et son comportement ne change pas d'un cran : il garde ses
 * liens et sa marque, et il reste dans l'historique de son bien. C'est la demande d'Arno, et c'est aussi la seule
 * lecture juste — on ne retire pas d'un dossier un courrier qu'on a classé dedans.
 *
 * ⚠️ AUCUN IMPORT, AUCUNE BASE, AUCUN React : ce module DIT la règle ; les lectures l'appliquent.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce que la base sait d'un mail, pour trancher. Les trois faits, et rien d'autre. */
export interface SignauxInertie {
  /** ① Est-il à la corbeille ? */
  aLaCorbeille: boolean;
  /** ② Porte-t-il au moins un lien CONFIRMÉ vers un bien (lot, propriétaire ou locataire) ? */
  aUnBienRattache: boolean;
  /** ③ Est-il « interne » en vigueur ? (le verdict de `interneDuMail`, pas une table en particulier) */
  estInterne: boolean;
}

/**
 * CE MAIL EST-IL INERTE ? PUR.
 *
 * 🔴 LES TROIS CONDITIONS SE LISENT ENSEMBLE, et l'ordre n'a aucune importance — c'est une conjonction, pas une
 * cascade. Un mail en boîte n'est jamais inerte, quel que soit son statut ; un mail jeté qui porte un statut ne
 * l'est pas non plus.
 */
export function mailInerte(s: SignauxInertie): boolean {
  return s.aLaCorbeille && !s.aUnBienRattache && !s.estInterne;
}

/**
 * ══ 🔴🔴 LA MÊME RÈGLE, EN SQL, ÉCRITE UNE SEULE FOIS ═══════════════════════════════════════════════════════════
 *
 * 🔴 POURQUOI ELLE VIT ICI, À CÔTÉ DE SA VERSION PURE. Trois lectures doivent l'appliquer — la file « À rattacher »,
 * ses totaux, et les chiffres de la colonne de gauche. Écrite trois fois, elle aurait divergé au premier
 * ajustement, et c'est la lecture qu'on regarde le moins qui aurait gardé l'ancienne version. Une épreuve compare
 * d'ailleurs les deux formes sur les huit cas possibles.
 *
 * 🔴 ELLE REND LA FORME **NÉGATIVE** (« ce mail n'est PAS inerte »), parce que c'est ainsi qu'elle s'emploie :
 * `WHERE … AND <clause>`. La forme positive obligerait chaque appelant à écrire le `NOT`, et il suffit d'un oubli.
 *
 * ⚠️ CHAQUE MIGRATION ABSENTE RETIRE SA CONDITION, ET NE FAIT PAS ÉCHOUER LA LECTURE. C'est la règle du dépôt
 * (leçon du lot 4a) : nommer une table absente ferait tomber TOUTE la file, pas seulement ce filtre. Sans la
 * corbeille (275), rien n'est inerte — ce qui est la vérité d'une base qui ne connaît pas la corbeille.
 *
 * ⚠️ LES ALIAS SONT SUFFIXÉS `_in` : ces sous-requêtes s'insèrent dans des requêtes qui emploient déjà `r0`, `i0`,
 * `m2`… et une collision d'alias est silencieuse — elle ne lève pas, elle répond faux.
 */
export function sqlPasInerte(alias: string, sondes: {
  corbeille: boolean; rattachements: boolean; interne: boolean; interneParMail: boolean;
}): string {
  if (!sondes.corbeille) return '';
  const bien = sondes.rattachements ? `
        AND NOT EXISTS (SELECT 1 FROM gestion_rattachement r_in
                         WHERE r_in.message_id = ${alias}.id AND r_in.statut = 'confirme'
                           AND r_in.cible_sorte IN ('lot', 'proprietaire', 'locataire'))` : '';
  /**
   * 🔴 LA MARQUE DU MAIL L'EMPORTE SUR CELLE DE L'ÉCHANGE, et une marque RETIRÉE sur ce mail compte comme une
   * décision — c'est la règle de `interneDuMail`, et elle n'est pas réécrite ici, elle est traduite. Un mail dont
   * on a RETIRÉ la marque n'est pas interne, même si son échange l'est : quelqu'un s'est prononcé sur lui.
   */
  const interneParMail = sondes.interneParMail ? `
             WHEN EXISTS (SELECT 1 FROM gestion_message_interne mi_in
                           WHERE mi_in.message_id = ${alias}.id AND mi_in.retire_le IS NULL) THEN true
             WHEN EXISTS (SELECT 1 FROM gestion_message_interne mi_in
                           WHERE mi_in.message_id = ${alias}.id) THEN false` : '';
  const interneDuFil = sondes.interne ? `
             WHEN EXISTS (SELECT 1 FROM gestion_fil_interne fi_in
                           WHERE fi_in.fil_id = ${alias}.fil_id AND fi_in.retire_le IS NULL) THEN true` : '';
  const interne = interneParMail === '' && interneDuFil === '' ? '' : `
        AND NOT (CASE${interneParMail}${interneDuFil}
             ELSE false END)`;
  return `AND NOT (${alias}.corbeille_le IS NOT NULL${bien}${interne})`;
}

/**
 * Ce qu'on DIT d'un mail inerte, là où il faut l'expliquer. `null` = il n'y a rien à dire.
 *
 * ⚠️ IL N'Y A PAS DE MESSAGE AU MOMENT DE JETER — Arno l'interdit en toutes lettres. Cette phrase sert là où un
 * mail inerte est quand même VISIBLE : dans la Corbeille, où l'on peut vouloir comprendre pourquoi il ne réclame
 * plus rien.
 */
export const MOT_MAIL_INERTE =
  'À la corbeille sans statut : il ne demande plus de classement. Le réintégrer le remet « À classer ».';
