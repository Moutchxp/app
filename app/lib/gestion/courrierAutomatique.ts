/**
 * ══ 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 8 — « AFFICHER AUSSI LE COURRIER AUTOMATIQUE », AUX DEUX ÉCRANS ══
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (04/10/2026) : « ajoute le même interrupteur à l'écran partagé : même libellé, même place, MÊME
 * état partagé entre les deux écrans (activé d'un côté = activé de l'autre). L'ordre chronologique est strict sur
 * l'ensemble. La route /reception accepte le même paramètre que /boite, par le même code SQL : pas de second
 * chemin. »
 *
 * ═══ 🔴🔴 CE MODULE EST LA RÉPONSE À « PAS DE SECOND CHEMIN » ═════════════════════════════════════════════════════
 *
 * Il tient les TROIS choses que les deux écrans doivent partager, et il les tient SEUL :
 *   ① LE PRÉDICAT SQL qui écarte le courrier automatique. Une seule ligne, lue par `boiteRepo` (les échanges) et
 *      par `receptionRepo` (les mails reçus). Recopiée, elle aurait divergé au premier correctif — et c'est
 *      exactement ce qui vient d'arriver ailleurs dans ce lot, deux fois.
 *   ② LE LIBELLÉ DU BOUTON. Deux formulations feraient croire à deux gestes.
 *   ③ LA PHRASE qui dit COMBIEN est tu. Un outil qui cache sans le dire mente ; celui-ci dit le nombre et le
 *      ramène d'un clic — règle du module depuis le lot 4b.
 *
 * 🔒 MODULE PUR : pas une requête, pas un `fetch`, pas de React. Il est donc importable depuis un composant
 * `'use client'` COMME depuis un dépôt — ce qui est la condition pour que l'écran et le serveur disent le même
 * mot et appliquent le même filtre. (Incident du 24/09/2026 : un module impur importé par le navigateur a fait
 * tomber la construction de toute l'application.)
 *
 * ═══ 🔴🔴 CE QUE « COURRIER AUTOMATIQUE » VEUT DIRE, ET LA MESURE QUI LE DÉFINIT ═════════════════════════════════
 *
 * C'est `exclu_le IS NOT NULL` : un message tenu HORS DE LA FILE par une règle. Mesuré en base le 04/10/2026,
 * hors spam :
 *   · envoyés : 40 177 messages, dont **24 891 écartés** par une règle (62 %) ;
 *   · reçus   : 17 017 messages, dont **ZÉRO écarté**.
 *
 * 🔴 D'OÙ LA CONSÉQUENCE, ET IL FAUT L'ÉCRIRE ICI PLUTÔT QUE DE LA REDÉCOUVRIR : sur une liste de MAILS REÇUS,
 * l'interrupteur ne peut rien changer AUJOURD'HUI. Le câblage est complet — route, prédicat, compteur, bouton,
 * état partagé — et il reste muet tant qu'aucune règle n'écarte un message reçu. C'est l'arbitrage qu'Arno a
 * lui-même rendu au point 6 de ce lot : « zéro ⇒ ni la phrase, ni le bouton », pour que plus personne ne cherche
 * un changement impossible.
 *
 * ⚠️ NE PAS CONFONDRE AVEC L'ÉTIQUETTE « Courrier automatique », qui est une LISTE (les échanges dont aucun
 * message n'est lisible). L'étiquette prime alors sur l'interrupteur — sans quoi elle afficherait une liste vide.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * ① LE PRÉDICAT. PUR.
 *
 * 🔴 `inclure` VRAI ⇒ CHAÎNE VIDE, et la requête est alors mot pour mot celle d'avant tout filtre. C'est ce qui
 * permet aux épreuves qui figent la forme du SQL de rester justes dans les deux sens.
 *
 * ⚠️ L'ALIAS EST OBLIGATOIRE : le prédicat s'applique AUX DEUX ÉTAGES du parcours de la boîte (le message
 * candidat `m`, et le « y a-t-il plus récent ? » `m2`). Les dissocier ferait sortir un échange dont le dernier
 * message est écarté, avec l'avant-dernier comme aperçu — défaut déjà payé par ce dépôt.
 */
export function sqlSansCourrierAutomatique(inclure: boolean, alias: string): string {
  return inclure ? '' : `AND ${alias}.exclu_le IS NULL`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② ET ③ LES MOTS — ÉCRITS UNE FOIS POUR LES DEUX ÉCRANS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Le mot du bouton. Il dit ce que le CLIC va faire, jamais l'état où l'on est. */
export function motBasculeAutomatique(inclus: boolean): string {
  return inclus ? 'Masquer le courrier automatique' : 'Afficher aussi le courrier automatique';
}

/**
 * L'unité comptée : l'écran des échanges compte des ÉCHANGES, la colonne de réception des MAILS. Le mot change,
 * la phrase non — et c'est pour cela que l'unité est un paramètre et non une seconde phrase.
 */
export type UniteAutomatique = 'echange' | 'mail';

/**
 * ③ LA PHRASE. PUR.
 *
 * ══ 🔴🔴 LOT RECEPTION-COURRIER-AUTO-CONTENU, POINT 2 — ELLE COMPTE DANS LES DEUX SENS ══════════════════════════
 *
 * DÉCISION D'ARNO (05/10/2026) : « OUI, le nombre affiché sous “À classer” compte dans les deux sens (ajouts et
 * retraits), avec une phrase vraie dans chaque cas (“le courrier automatique ajoute N conversations” / “retire N
 * conversations”). »
 *
 * ═══ 🔴 CE QUE L'ANCIENNE PHRASE DISAIT DE FAUX, ET SUR QUELLE LISTE ════════════════════════════════════════════
 *
 * Elle était écrite pour un seul sens — « N échanges ne contiennent que du courrier automatique et ne sont pas
 * affichés ici » — et le nombre venait d'un `Math.max(0, avec − sans)` qui écrasait le négatif. Or l'interrupteur
 * RETIRE des lignes sous certaines étiquettes : mesuré le 05/10/2026 sous « À classer », 10 348 → 10 098, soit
 * **250 conversations de moins**, et le bandeau annonçait… zéro. Un compteur qui ne sait compter que dans un sens
 * annonce « rien à ajouter » sur une liste qu'il change de 250 lignes.
 *
 * 🔴 POURQUOI L'INTERRUPTEUR PEUT RETIRER. Sous « À classer », le candidat de l'échange est son dernier message
 * LISIBLE ; en incluant le courrier automatique, le candidat devient le dernier message tout court — qui peut
 * sortir de la fenêtre d'activité, ou n'être plus « à classer ». La ligne quitte alors la liste. C'est la même
 * mécanique qui, sous « Envoyés », en AJOUTE 23 197.
 *
 * 🔴 `delta` EST DONC SIGNÉ, et la phrase DIT CE QUE L'INTERRUPTEUR FAIT, non ce qu'il cache : c'est vrai dans les
 * quatre cas (deux sens × lien allumé ou éteint), là où « ne sont pas affichés ici » était faux pour un retrait.
 *
 * ⚠️ `delta` EST CELUI DE **CETTE** LISTE, jamais le compte global. C'est le défaut du point 6 du lot
 * RENOMMER-PARTOUT-ET-FINITIONS : le bandeau annonçait « 22 096 échanges ne sont pas affichés ici » alors qu'ils
 * n'y seraient pas de toute façon.
 *
 * ⚠️ ZÉRO ⇒ CHAÎNE VIDE : il n'y a rien à dire, et les deux écrans n'affichent alors pas la phrase. Le LIEN, lui,
 * reste offert (lot RECEPTION-COURRIER-AUTO-LIEN) — un bouton absent avait fait croire à une régression.
 */
export function phraseCourrierAutomatique(delta: number, inclus: boolean, unite: UniteAutomatique): string {
  if (!Number.isFinite(delta) || delta === 0) return '';
  const n = Math.abs(Math.trunc(delta));
  const p = n > 1;
  const quoi = unite === 'mail' ? `${n} mail${p ? 's' : ''}` : `${n} conversation${p ? 's' : ''}`;
  /* 🔴 « ajoute … à » / « retire … de » : les deux prépositions d'Arno, et elles ne sont pas interchangeables. */
  const action = delta > 0 ? `ajoute ${quoi} à cette liste` : `retire ${quoi} de cette liste`;
  /**
   * 🔴 LIEN ALLUMÉ, LA PHRASE DIT CE QUI **EST** ; ÉTEINT, CE QUE LE CLIC FERAIT. La nuance porte toute
   * l'information utile : « est inclus : il retire 250 conversations » explique une liste plus courte que son
   * compteur d'hier, là où la même phrase sans « est inclus » ferait chercher les 250 à l'écran.
   */
  if (inclus) return `Le courrier automatique est inclus : il ${action}.`;
  return `Le courrier automatique ${action}. Rien n’est supprimé.`;
}
