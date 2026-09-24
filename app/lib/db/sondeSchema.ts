/**
 * SONDES DE SCHÉMA — LA MÉMOIRE QUI NE RETIENT QUE LE « OUI ». Module PUR : aucun import, aucune base.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 L'INCIDENT DU 24/09/2026, ET LA RÈGLE QUI EN DÉCOULE. Arno a appliqué les migrations 239 à 241 dans son Terminal,
 * rechargé la page — et l'écran continuait d'annoncer « mise à jour de la base à appliquer ». Aucune erreur, aucune
 * trace : simplement une fonctionnalité invisible.
 *
 * MESURÉ ce jour-là : les trois objets existaient bien en base (`to_regclass` les rendait tous les trois), et le
 * serveur de développement tournait depuis le 22/09 à 14 h 09 — soit deux jours AVANT que le fichier de migration
 * existe. La première interrogation de la sonde avait donc nécessairement eu lieu sur une base sans ces tables. Elle
 * avait répondu « absent », et cette réponse était mémorisée POUR LA VIE DU PROCESSUS.
 *
 * 🔴 UN RÉSULTAT NÉGATIF NE SE MÉMORISE JAMAIS. « La colonne n'existe pas » n'est pas une propriété du schéma : c'est
 * une propriété du schéma *à cet instant*, et une migration passe précisément pour la changer. Seul un « oui » est
 * définitif — une table ne disparaît pas sous nos pieds, et si elle disparaissait, le problème ne serait pas la sonde.
 *
 * ⚠️ MAIS ON NE RESONDE PAS À CHAQUE APPEL. Ces sondes sont sur des chemins très fréquentés (jusqu'à celui de
 * l'authentification) : une requête `information_schema` par affichage serait une dépense permanente pour une réponse
 * qui ne change qu'une fois tous les six mois. D'où une fenêtre de calme : après un « non », on attend quelques
 * secondes avant de redemander. Le pire cas devient « l'écran se met à jour dans les cinq secondes », au lieu de
 * « il faut redémarrer le serveur, et personne ne sait pourquoi ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Combien de temps on se tait après un « non ». Assez court pour qu'un rechargement de page suffise à voir le
 * changement ; assez long pour qu'un écran qui pose dix questions n'émette pas dix requêtes.
 */
export const DELAI_RESONDE_MS = 5_000;

export type Memoiser = (cle: string, calcul: () => Promise<boolean>) => Promise<boolean>;

export interface MemoireSonde {
  memoiser: Memoiser;
  /** Pour les tests : oublie tout, « oui » compris. N'a aucun effet en production, où rien ne l'appelle. */
  oublier: () => void;
}

/**
 * Fabrique une mémoire de sondes. L'horloge est INJECTABLE — sans quoi l'épreuve du délai dépendrait du temps qui
 * passe vraiment, et durerait cinq secondes pour vérifier cinq secondes.
 *
 * TROIS ÉTATS, et un seul est définitif :
 *   · « oui » retenu pour toujours ;
 *   · « non » retenu quelques secondes seulement, puis on redemande ;
 *   · une sonde EN COURS est partagée : dix appels simultanés ne font qu'une requête.
 */
export function creerMemoireSonde(maintenant: () => number = () => Date.now()): MemoireSonde {
  const oui = new Set<string>();
  const enCours = new Map<string, Promise<boolean>>();
  const dernierNon = new Map<string, number>();

  function memoiser(cle: string, calcul: () => Promise<boolean>): Promise<boolean> {
    // ① Un « oui » est définitif : une table ne se dé-crée pas.
    if (oui.has(cle)) return Promise.resolve(true);
    // ② Une sonde déjà lancée est partagée — dix questions en même temps, une seule requête.
    const dejaLa = enCours.get(cle);
    if (dejaLa) return dejaLa;
    // ③ On vient de répondre « non » : on se tait le temps de la fenêtre de calme, sans requête.
    const quand = dernierNon.get(cle);
    if (quand !== undefined && maintenant() - quand < DELAI_RESONDE_MS) return Promise.resolve(false);

    const promesse = calcul().then(
      (present) => {
        if (present) oui.add(cle); else dernierNon.set(cle, maintenant());
        enCours.delete(cle);
        return present;
      },
      (e: unknown) => {
        // Une sonde qui jette n'est pas une réponse : on la traite comme un « non », donc on redemandera.
        dernierNon.set(cle, maintenant());
        enCours.delete(cle);
        throw e;
      },
    );
    enCours.set(cle, promesse);
    return promesse;
  }

  return {
    memoiser,
    oublier: () => { oui.clear(); enCours.clear(); dernierNon.clear(); },
  };
}
