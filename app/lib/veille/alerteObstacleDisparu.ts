/**
 * ALERTE (démolitions) — LOGIQUE PURE : sélectionner les certificats dont le bâtiment-obstacle a RÉELLEMENT disparu, et composer
 * l'e-mail « à revérifier ». Aucune I/O.
 *
 * 🔴 CE QUE CETTE ALERTE EST — ET N'EST PAS : un simple signal « à revérifier ». Elle NE recertifie JAMAIS, ne recalcule aucun
 * certificat, ne modifie aucun verdict. Elle lit le bâti BD TOPO RÉEL, jamais l'emprise projetée. Vocabulaire « bâtiment », jamais
 * « corps ».
 *
 * « RÉELLEMENT VIDÉ » (critère, testé) : le cleabs de l'obstacle est ABSENT de l'édition courante (`present=false`) ET son
 * emplacement n'est plus couvert par du bâti (`couvert=false`). Une RE-NUMÉROTATION (cleabs changé mais emplacement toujours bâti,
 * `couvert=true`) ne trompe PAS le verdict → écartée. Un bâtiment toujours présent (`present=true`) → écarté.
 */

/** Un certificat candidat : son obstacle capturé + les deux faits mesurés en base + s'il a déjà été alerté. */
export interface CandidatObstacleDisparu {
  certificatId: number;
  numero: string;
  adresse: string | null;
  cleabs: string;
  present: boolean;   // le cleabs existe-t-il ENCORE dans bdtopo_batiment (édition courante) ?
  couvert: boolean;   // l'emplacement de l'obstacle est-il ENCORE couvert par du bâti ?
  dejaAlerte: boolean;
}

/** Un certificat à alerter (obstacle réellement disparu). */
export interface ObstacleDisparu { certificatId: number; numero: string; adresse: string | null; cleabs: string }

/**
 * Certificats à alerter : obstacle réellement vidé (`!present && !couvert`) ET jamais encore alerté. PUR. Tri stable par numéro
 * (lisibilité de l'e-mail ; jamais deux exécutions divergentes).
 */
export function disparitionsAAlerter(candidats: CandidatObstacleDisparu[]): ObstacleDisparu[] {
  return candidats
    .filter((c) => !c.present && !c.couvert && !c.dejaAlerte)
    .map(({ certificatId, numero, adresse, cleabs }) => ({ certificatId, numero, adresse, cleabs }))
    .sort((a, b) => a.numero.localeCompare(b.numero));
}

/** Une ligne de certificat lisible : « SAVV-… (adresse) — bâtiment BATIMENT… ». Adresse absente → sans parenthèse. */
function ligneCertificat(d: ObstacleDisparu): string {
  const adr = d.adresse ? ` (${d.adresse})` : '';
  return `• ${d.numero}${adr} — bâtiment ${d.cleabs}`;
}

/**
 * Compose l'e-mail (sujet + corps). Dit FRANCHEMENT ce que c'est (un signal « à revérifier »), ce que ce n'est PAS (une
 * recertification), et pourquoi c'est important (le prochain calcul certifierait à tort). PUR. `null` si aucune disparition.
 */
export function composerAlerteObstacleDisparu(disparus: ObstacleDisparu[]): { sujet: string; corps: string } | null {
  if (disparus.length === 0) return null;
  const n = disparus.length;
  const sujet = n === 1
    ? `À revérifier — un bâtiment qui fondait un certificat a disparu`
    : `À revérifier — ${n} certificats dont le bâtiment-obstacle a disparu`;
  const corps = [
    n === 1
      ? `Un bâtiment qui faisait obstacle pour un certificat a disparu des données BD TOPO, et son emplacement n’est plus couvert par du bâti.`
      : `${n} certificats reposent sur un bâtiment qui a disparu des données BD TOPO, dont l’emplacement n’est plus couvert par du bâti.`,
    ``,
    `⚠️ Ce n’est PAS une recertification : aucun certificat n’a été recalculé ni modifié. C’est un signal « à revérifier » — si l’on relançait le calcul, l’obstacle ayant disparu, le verdict pourrait basculer vers « sans vis-à-vis ». À vous d’apprécier s’il faut réémettre.`,
    ``,
    n === 1 ? `Le certificat concerné :` : `Les certificats concernés :`,
    ...disparus.map(ligneCertificat),
    ``,
    `Une simple re-numérotation d’un bâtiment (l’emplacement reste bâti) n’est pas comptée ici : seuls les emplacements réellement vidés déclenchent ce rappel. Un seul rappel par certificat et par disparition.`,
  ].join('\n');
  return { sujet, corps };
}
