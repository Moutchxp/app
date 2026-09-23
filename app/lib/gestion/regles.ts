/**
 * MODULE « GESTION » — LOT 3 : APPLICATION des règles d'exclusion. Module PUR (aucune I/O) : il reçoit les règles ACTIVES
 * et un message déjà lu, et dit laquelle — s'il y en a une — tient ce message hors de la file.
 *
 * 🔴 UNE RÈGLE NE SUPPRIME RIEN. Elle ne décide pas si le message est ENREGISTRÉ (il l'est toujours, sans exception) mais
 * seulement s'il apparaît dans la file de travail. Le message garde la référence de la règle et une COPIE FIGÉE de son
 * motif : éteindre la règle peut le faire revenir, et la trace reste lisible même si la règle est réécrite ensuite.
 */
import { domaineDe } from './sonde';
import { estAdresseSansReponse, normaliserObjet, signauxAutomatisme } from './typologie';

/** Une règle telle qu'elle vit en base (`gestion_regle_exclusion`), déjà filtrée sur `actif`. */
export interface RegleExclusion {
  id: number;
  type: 'gabarit_objet' | 'domaine_expediteur' | 'adresse_expediteur' | 'signal_entete';
  valeur: string;
  sens: 'recu' | 'envoye' | 'les_deux';
  motif: string;
}

/** Ce qu'une règle regarde d'un message. Rien d'autre n'entre dans la décision. */
export interface MessageJuge {
  sens: 'recu' | 'envoye';
  deAdresse: string;
  objet: string | null;
  entetes: Record<string, string>;
}

export interface Exclusion { regleId: number; motif: string }

/** La règle s'applique-t-elle à ce sens de message ? PUR. */
function concerne(regle: RegleExclusion, sens: 'recu' | 'envoye'): boolean {
  return regle.sens === 'les_deux' || regle.sens === sens;
}

/**
 * La règle reconnaît-elle ce message ? Comparaisons INSENSIBLES À LA CASSE partout — un gabarit d'objet, un domaine et un
 * nom d'en-tête ne se distinguent pas par leur casse, et exiger la casse exacte ferait passer une règle pour cassée.
 *
 * `signal_entete` accepte deux choses : le NOM d'un en-tête d'automatisme (`list-unsubscribe`…), reconnu par la même
 * fonction que la sonde — donc une seule définition de « en-tête d'automatisme » dans tout le module —, et la valeur
 * spéciale `adresse sans réponse`, qui regarde l'expéditeur. PUR.
 */
export function regleReconnait(regle: RegleExclusion, m: MessageJuge): boolean {
  const valeur = regle.valeur.trim().toLowerCase();
  if (valeur === '') return false;
  switch (regle.type) {
    case 'gabarit_objet':
      return normaliserObjet(m.objet).toLowerCase() === valeur;
    case 'domaine_expediteur':
      return domaineDe(m.deAdresse) === valeur;
    case 'adresse_expediteur':
      return m.deAdresse.trim().toLowerCase() === valeur;
    case 'signal_entete':
      if (valeur === 'adresse sans réponse') return estAdresseSansReponse(m.deAdresse);
      return signauxAutomatisme(m.entetes).includes(valeur);
  }
}

/**
 * La PREMIÈRE règle active qui reconnaît ce message, ou `null` s'il entre dans la file. L'ordre est celui que l'appelant
 * donne (par identifiant croissant, côté base) : DÉTERMINISTE, donc deux relèves du même message produisent la même
 * trace. Le motif est COPIÉ ici, à l'instant de l'exclusion — on ne gardera pas un pointeur vers un texte qui bouge. PUR.
 */
export function appliquerRegles(regles: readonly RegleExclusion[], m: MessageJuge): Exclusion | null {
  for (const r of regles) {
    if (concerne(r, m.sens) && regleReconnait(r, m)) return { regleId: r.id, motif: r.motif };
  }
  return null;
}
