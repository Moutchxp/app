/**
 * MODULE « GESTION » — LOT 5-DIRECT : LA RELÈVE CONTINUE. Décision PURE (aucune I/O ici), orchestration par injection.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI — LE COURRIER METTAIT 25 HEURES À APPARAÎTRE.
 *
 * MESURÉ sur la vraie base : entre l'heure d'un message et celle où nous l'avions capturé, la médiane était de
 * **1 500 minutes**. La cause n'était pas une lenteur mais une ABSENCE : la relève Gestion n'avait aucun déclencheur
 * automatique. Elle ne tournait qu'au clic sur « Relever maintenant » ou en lançant le CLI à la main.
 *
 * Ce module ne réinvente donc RIEN de la relève : il rappelle la MÊME passe (`relever`), avec le même verrou, le même
 * journal, la même idempotence UID + UIDVALIDITY, la même reprise après coupure. Il ajoute une seule chose : un tour
 * de boucle toutes les N secondes.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 CE QUI LA DISTINGUE DE LA BOUCLE DU RATTRAPAGE (`relever-gestion.ts`, option `--boucler`) : celle-là cherche à
 * ÉPUISER un retard et s'arrête quand il n'y a plus rien ou qu'elle fait du surplace. Celle-ci ne s'arrête JAMAIS : ne
 * rien trouver est son état NORMAL — c'est même ce qu'on espère. Confondre les deux ferait s'éteindre la relève au
 * premier tour à vide, et Arno retrouverait son retard de 25 heures sans que rien ne le signale.
 */

/** Issue d'une passe, réduite à ce dont la boucle a besoin pour décider. */
export interface IssuePasse {
  resultat: 'ok' | 'erreur' | 'occupe' | 'inactif';
  /** Messages capturés à cette passe. `null` quand la passe n'a pas eu lieu. */
  captures: number | null;
}

export interface ReglagesContinu {
  /** Intervalle ordinaire entre deux passes, en secondes (lu dans `gestion_config`). */
  intervalleS: number;
  /** Première attente après un échec, en secondes. Elle DOUBLE ensuite. */
  backoffBaseS: number;
  /** Plafond de l'attente après échecs répétés, en secondes. */
  backoffMaxS: number;
  /** Attente quand une autre passe tient le verrou : courte, on veut reprendre dès qu'il se libère. */
  attenteVerrouS: number;
}

export const REGLAGES_CONTINU_DEFAUT: Omit<ReglagesContinu, 'intervalleS'> = {
  backoffBaseS: 30,
  backoffMaxS: 900,
  attenteVerrouS: 10,
};

/** Ce que la boucle retient d'un tour à l'autre. */
export interface EtatContinu {
  echecsConsecutifs: number;
}

export interface Suite {
  /** Combien de secondes attendre avant le tour suivant. */
  attendreS: number;
  /** Ce qu'on écrit au journal — une ligne par tour, pour qu'un silence se distingue d'un arrêt. */
  motif: string;
}

/**
 * DÉCIDE de l'attente avant le tour suivant. **Elle ne rend jamais « arrêter »** — c'est le cœur du module : une relève
 * continue qui s'arrête toute seule est pire qu'une relève absente, parce que personne ne s'en aperçoit.
 *
 * Quatre situations, et chacune a sa raison :
 *   · `ok`      → intervalle ordinaire. Zéro message capturé est un SUCCÈS, pas un problème ;
 *   · `occupe`  → une autre passe (ou le rapatriement) tient le verrou : on attend peu et on repasse. On ne force
 *                 JAMAIS une seconde capture en parallèle — deux passes sur la même boîte se marcheraient dessus ;
 *   · `erreur`  → attente CROISSANTE. Un serveur qui refuse ne rendra pas la main plus vite parce qu'on insiste, et
 *                 marteler une boîte qui refuse est le meilleur moyen de se faire fermer la porte plus longtemps ;
 *   · `inactif` → aucun compte configuré. On repasse à l'intervalle ordinaire : le jour où un compte est réglé, la
 *                 relève repart sans qu'on ait rien à redémarrer.
 * PUR.
 */
export function suiteDuTour(issue: IssuePasse, etat: EtatContinu, r: ReglagesContinu): Suite {
  if (issue.resultat === 'erreur') {
    const echecs = etat.echecsConsecutifs + 1;
    const attendreS = Math.min(r.backoffBaseS * 2 ** Math.max(0, echecs - 1), r.backoffMaxS);
    return { attendreS, motif: `échec ${echecs} — nouvelle tentative dans ${attendreS} s` };
  }
  if (issue.resultat === 'occupe') {
    return { attendreS: r.attenteVerrouS, motif: `une autre passe tient le verrou — on repasse dans ${r.attenteVerrouS} s` };
  }
  if (issue.resultat === 'inactif') {
    return { attendreS: r.intervalleS, motif: `aucun compte IMAP configuré — on repasse dans ${r.intervalleS} s` };
  }
  const n = issue.captures ?? 0;
  return {
    attendreS: r.intervalleS,
    motif: n === 0
      ? `rien de nouveau — prochaine relève dans ${r.intervalleS} s`
      : `${n} message(s) capturé(s) — prochaine relève dans ${r.intervalleS} s`,
  };
}

/** État après un tour. Un succès REMET À ZÉRO le compteur d'échecs : seuls les échecs d'affilée allongent l'attente. PUR. */
export function etatApres(issue: IssuePasse, etat: EtatContinu): EtatContinu {
  return { echecsConsecutifs: issue.resultat === 'erreur' ? etat.echecsConsecutifs + 1 : 0 };
}

/** Dépendances de la boucle, injectées → elle se teste sans réseau, sans base et sans attendre. */
export interface DepsContinu {
  /** UNE passe de relève — la vraie, celle du bouton et du CLI. */
  relever(): Promise<IssuePasse>;
  /** Intervalle lu dans `gestion_config`, RELU à chaque tour : changer le réglage n'exige aucun redémarrage. */
  intervalle(): Promise<number>;
  attendre(secondes: number): Promise<void>;
  journal(ligne: string): void;
  /** Rend `false` pour arrêter la boucle. Sert à l'arrêt propre (SIGTERM) et aux tests. */
  continuer(): boolean;
  maintenant(): Date;
}

/**
 * LA BOUCLE. Elle tourne jusqu'à ce qu'on lui demande de s'arrêter — jamais de sa propre initiative.
 *
 * L'intervalle est RELU à chaque tour : `UPDATE gestion_config SET releve_continue_secondes = 30` est pris en compte au
 * tour suivant, sans rien redémarrer. Et si la base ne répond pas, `chargerConfigGestion` se replie sur son défaut :
 * une base momentanément absente ne doit pas arrêter la relève.
 */
export async function boucleContinue(deps: DepsContinu, reglages = REGLAGES_CONTINU_DEFAUT): Promise<number> {
  let etat: EtatContinu = { echecsConsecutifs: 0 };
  let tours = 0;

  while (deps.continuer()) {
    const intervalleS = await deps.intervalle();
    const issue = await deps.relever();
    tours += 1;

    const suite = suiteDuTour(issue, etat, { ...reglages, intervalleS });
    etat = etatApres(issue, etat);
    // Une ligne par tour, horodatée : c'est ce qui permet de dire « elle tourne et ne trouve rien » plutôt que de
    //   devoir deviner entre « elle tourne » et « elle est morte ».
    deps.journal(`[${deps.maintenant().toISOString()}] ${suite.motif}`);

    if (!deps.continuer()) break;
    await deps.attendre(suite.attendreS);
  }
  return tours;
}
