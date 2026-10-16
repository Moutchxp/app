/**
 * Filet de l'attente GPS de l'écran de localisation (lot CARTE-GRISE, 16/10/2026).
 *
 * La carte n'est montée qu'une fois un vrai centre connu (`carteCentrePret`) ; en attendant, un gabarit gris de même
 * taille la remplace. Elle dépendait d'une réponse du navigateur à `getCurrentPosition` — or Safari iOS peut ne JAMAIS
 * répondre (délai de 20 s non décompté tant que sa demande d'autorisation, reposée chaque jour, n'est pas tranchée) :
 * le carré gris restait alors indéfiniment (reproduit au banc : 0 tuile demandée après 30 s).
 *
 * Passé DELAI_MAX_ATTENTE_GPS_MS sans réponse, la carte s'affiche comme dans le cas « géolocalisation introuvable » :
 * sur le centre courant, avec un message qui invite à saisir l'adresse ou à déplacer la carte. Une réponse GPS tardive
 * recentre ensuite la carte (inchangé : seulement si l'internaute n'a pas déjà bougé).
 */
export const DELAI_MAX_ATTENTE_GPS_MS = 10_000;

export const MESSAGE_GPS_EN_ATTENTE =
  "Position GPS toujours en attente — saisissez votre adresse ci-dessus, ou déplacez la carte directement sur la fenêtre du logement.";

/** Un seul filet à la fois : réarmer annule le précédent (la demande GPS part deux fois : caméra, puis photo). */
export function creerFiletAttenteGps(surExpiration: () => void, delaiMs: number = DELAI_MAX_ATTENTE_GPS_MS) {
  let minuteur: ReturnType<typeof setTimeout> | null = null;
  const desarmer = () => {
    if (minuteur !== null) clearTimeout(minuteur);
    minuteur = null;
  };
  return {
    armer() {
      desarmer();
      minuteur = setTimeout(() => {
        minuteur = null;
        surExpiration();
      }, delaiMs);
    },
    desarmer,
    estArme: () => minuteur !== null,
  };
}
