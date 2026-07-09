// Politique de mot de passe admin (M3-4 Lot B). Module PARTAGÉ serveur ↔ client → PAS de `import 'server-only'`
// (le composant client de l'écran de changement doit pouvoir l'importer). N'exporte qu'une constante, aucun secret.
//
// CONSTANTE DE SÉCURITÉ, PAS une variable du moteur de score : elle n'a donc rien à faire dans `config_scoring`
// et n'est pas éditable au runtime (l'invariant « pilotage sans code » vise le scoring). Source UNIQUE : la route
// self-service (autoritative) ET l'écran (indice/validation native) l'importent d'ici — aucun `12` dispersé.
// Politique sobre : longueur ≥ 12, sans règle de composition (la longueur prime, cf. NIST) ; le refus « identique
// à l'ancien » est imposé côté route.
export const LONGUEUR_MIN_MOT_DE_PASSE = 12;
