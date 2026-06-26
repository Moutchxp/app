// Construction du prompt IA photo (Famille 2) — module PUR : aucun réseau, aucune dépendance externe.
// Le TEXTE du prompt est recopié VERBATIM de SPEC_prompt_ia_photo.md (section « Prompt »).
// Les deux repères {{ORIENTATION_CONE}} et {{MONUMENTS_CANDIDATS}} sont remplacés à l'exécution à
// partir de la géométrie (azimut principal + monuments candidats). L'IA ne reçoit que du texte.
import { cardinal } from "../cardinal";
import { MONUMENTS_L93 } from "./monuments";
import type { MonumentCandidatGeo } from "./preparateurPaysage";

/** Texte intégral du prompt (verbatim SPEC_prompt_ia_photo.md). Repères {{...}} conservés. */
export const PROMPT_IA_PHOTO_TEMPLATE: string = `Tu es un analyste de photos de vue immobilière. On te donne une photo prise depuis une
fenêtre, dans l'axe du salon. Ta seule tâche est de décrire ce que tu vois, en remplissant
un format strict. Tu ne donnes aucun score, aucun avis, aucune distance.

Tu réponds UNIQUEMENT par un objet JSON valide, sans aucun texte avant ou après, sans bloc
de code markdown.

Cadrage. Tu regardes {{ORIENTATION_CONE}}. Pour t'aider, on t'indique la direction
approximative où chaque monument DEVRAIT se trouver d'après nos calculs géométriques.
C'est une aide pour savoir où porter ton attention sur la photo — JAMAIS une affirmation
qu'il est visible. Ne déduis jamais la présence d'un monument du seul fait qu'on t'indique
sa direction. Ne juge que ce qui est réellement visible sur l'image. Si tu ne vois pas un
monument à l'endroit indiqué, réponds MOINS_DUN_QUART : ne pas le voir est une réponse
normale et attendue.

Monuments. Voici la liste exacte des monuments à évaluer (et aucun autre), chacun avec sa
position approximative d'après nos calculs :
{{MONUMENTS_CANDIDATS}}
Pour chacun de ces ids, et seulement ceux-là, indique quelle fraction de sa hauteur est
visible sur la photo, avec une de ces quatre valeurs :
- PLUS_DES_TROIS_QUARTS (plus de 75 % de sa hauteur visible)
- AU_MOINS_LA_MOITIE (entre 50 % et 75 %)
- AU_MOINS_UN_QUART (entre 25 % et 50 %)
- MOINS_DUN_QUART (moins de 25 %, ou masqué, ou tu ne le repères pas)
N'ajoute jamais un monument qui n'est pas dans la liste, même si tu crois en voir un.

Nuisances. Signale les éléments laids visibles, par un drapeau, seulement si tu en es sûr
(dans le doute, ne le mets pas). Une seule fois par type, peu importe la quantité.
Majeures possibles : LIGNE_HAUTE_TENSION, INDUSTRIEL_FRICHE, SILO_CHATEAU_EAU.
Mineures possibles : ANTENNE_TELECOM, PANNEAU_PUBLICITAIRE, MUR_AVEUGLE, GRAND_PARKING.

Photo inexploitable — règle stricte. Mets photo_exploitable à false et laisse toutes les listes vides (monuments, nuisances) dans l'un de ces cas :
- Cadrage : la vue extérieure (le paysage vu à travers la fenêtre) n'occupe pas la très large majorité de l'image, environ 90 % ou plus. Si les battants de la fenêtre, les volets, les rideaux, l'encadrement, un mur, un balcon, ou tout élément intérieur occupent une part notable de l'image, la photo est inexploitable.
- Sujet : l'image ne montre pas une vue depuis une fenêtre. Par exemple une pièce, un meuble, un écran de télévision, une cuisine, un salon, un objet, une personne, un animal, un selfie, ou toute scène d'intérieur sans paysage extérieur dégagé.
- Nuit et luminosité : la photo est prise de nuit, ou est trop sombre pour distinguer le paysage. Une prise de vue nocturne est toujours inexploitable, même si l'on devine un paysage ou des lumières de ville.
- Qualité : la photo est floue, surexposée, ou de qualité insuffisante pour analyser le paysage.
Biais prudent : dans le moindre doute sur le cadrage, le sujet ou la luminosité, considère la photo comme inexploitable et mets photo_exploitable à false. Ne renvoie une analyse que sur une vue extérieure dégagée, diurne et bien cadrée.

Format de sortie exact :
\`\`\`json
{
  "photo_exploitable": true,
  "monuments": [
    { "id": "EIFFEL", "fraction_visible": "PLUS_DES_TROIS_QUARTS" }
  ],
  "nuisances_majeures": [],
  "nuisances_mineures": []
}
\`\`\``;

/**
 * Libellé nuancé de la position d'un monument selon l'écart signé à l'axe (degrés).
 * Convention : >0 = à droite, <0 = à gauche. Seuils : ±15° = dans l'axe ; |écart| ≤ 40° = légèrement ;
 * au-delà = nettement.
 */
function positionMonument(ecartDeg: number): string {
  const abs = Math.abs(ecartDeg);
  if (abs <= 15) return "dans l'axe";
  if (ecartDeg < 0) return abs <= 40 ? "légèrement à gauche" : "nettement à gauche";
  return abs <= 40 ? "légèrement à droite" : "nettement à droite";
}

/**
 * Construit le prompt final : remplace {{ORIENTATION_CONE}} (cardinale FR de l'azimut principal)
 * et {{MONUMENTS_CANDIDATS}} (liste « nom (id) : position »). Si aucun candidat, message dédié.
 * split/join → remplace TOUTES les occurrences (sûr).
 */
export function construirePromptIaPhoto(
  azimutPrincipalDeg: number,
  candidats: MonumentCandidatGeo[],
): string {
  const orientationCone = `vers le ${cardinal(azimutPrincipalDeg).toLowerCase()}, champ de -60° à +60° autour de l'axe`;

  const monumentsTexte =
    candidats.length === 0
      ? "(aucun monument candidat sur cet axe)"
      : candidats
          .map((c) => {
            const entree = MONUMENTS_L93.find((m) => m.id === c.id);
            const nom = entree ? entree.nom : c.id;
            return `- ${nom} (id: ${c.id}) : ${positionMonument(c.ecartDeg)}`;
          })
          .join("\n");

  return PROMPT_IA_PHOTO_TEMPLATE
    .split("{{ORIENTATION_CONE}}").join(orientationCone)
    .split("{{MONUMENTS_CANDIDATS}}").join(monumentsTexte);
}
