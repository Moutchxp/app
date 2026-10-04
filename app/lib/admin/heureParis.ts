/**
 * ══ 🔴🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU, POINT 2b — L'HEURE DE PARIS, DANS LE BANDEAU ═══════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (04/10/2026) : « côté droit de la même ligne, juste AVANT “Changer mon mot de passe” : l'heure en
 * heure française (Europe/Paris, quel que soit le fuseau de l'ordinateur), au format “10:58”, mise à jour chaque
 * minute. Au survol : “dimanche 4 octobre 2026, 10:58”. Discret, même style que le bandeau. »
 *
 * ═══ 🔴🔴 POURQUOI UN MODULE PUR POUR DEUX LIGNES DE `Intl` ══════════════════════════════════════════════════════
 *
 * Parce que « quel que soit le fuseau de l'ordinateur » est une RÈGLE, et qu'une règle s'éprouve. Le dépôt tourne
 * sur des machines réglées sur Paris : un oubli de `timeZone` ne se verrait donc JAMAIS ici, et se verrait tout de
 * suite chez quelqu'un en déplacement. Les épreuves de ce module forcent un autre fuseau et vérifient que la
 * réponse ne bouge pas.
 *
 * 🔒 PUR : pas de React, pas d'horloge à lui. L'instant est TOUJOURS donné en paramètre — c'est ce qui permet de
 * l'éprouver sur des dates fixes, y compris aux deux changements d'heure.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** 🔴 LE FUSEAU, ÉCRIT UNE FOIS. Deux chaînes « Europe/Paris » dans deux fichiers, c'est une faute de frappe qui attend. */
export const FUSEAU_PARIS = 'Europe/Paris';

/**
 * L'HEURE COURTE : « 10:58 ». PUR.
 *
 * ⚠️ `hourCycle: 'h23'` EST OBLIGATOIRE, ET CE N'EST PAS UN DÉTAIL DE GOÛT. En français, `hour: '2-digit'` seul
 * rend « 00:30 » à minuit sur la plupart des moteurs, mais certains environnements (locale système exotique,
 * Node compilé avec un ICU réduit) basculent en cycle 12 heures et affichent « 12:30 AM ». Le cycle est donc
 * imposé, pas espéré.
 */
export function heureCourteParis(maintenant: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU_PARIS, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(maintenant);
}

/**
 * L'INFOBULLE : « dimanche 4 octobre 2026, 10:58 ». PUR.
 *
 * ⚠️ LA VIRGULE EST CELLE D'ARNO, et elle n'est pas celle d'`Intl`. Avec `dateStyle: 'full'` + `timeStyle:
 * 'short'`, le français rend « dimanche 4 octobre 2026 à 10:58 » — « à » et non « , ». On compose donc les deux
 * morceaux plutôt que d'accepter un séparateur qu'on n'a pas choisi. C'est aussi ce qui garantit que l'heure de
 * l'infobulle est EXACTEMENT celle du bandeau : le même `heureCourteParis`, pas un second format.
 */
export function infobulleHeureParis(maintenant: Date): string {
  const jour = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_PARIS, dateStyle: 'full' })
    .format(maintenant);
  return `${jour}, ${heureCourteParis(maintenant)}`;
}

/**
 * ══ 🔴🔴 COMBIEN DE TEMPS AVANT LA PROCHAINE MINUTE. PUR. ════════════════════════════════════════════════════════
 *
 * 🔴 POURQUOI PAS UN SIMPLE `setInterval(60_000)`. Un intervalle d'une minute posé à 10:58:59 affiche « 10:58 »
 * jusqu'à 10:59:59 : l'horloge a UNE MINUTE DE RETARD, en permanence, pour qui la regarde juste après. On se
 * recale donc sur la SECONDE 0 de la minute suivante, puis on avance de minute en minute.
 *
 * ⚠️ UN PLANCHER D'UNE SECONDE : à 10:58:59,998 le calcul rend 2 ms, et un `setTimeout` de 2 ms ferait tourner
 * la boucle deux fois dans la même minute. Le plancher coûte au pire une seconde de retard à l'affichage, une
 * fois par minute — invisible — et supprime la boucle serrée.
 */
export const PLANCHER_PROCHAINE_MINUTE_MS = 1000;

export function msAvantProchaineMinute(maintenant: Date): number {
  const reste = 60_000 - (maintenant.getTime() % 60_000);
  return Math.max(PLANCHER_PROCHAINE_MINUTE_MS, reste);
}
