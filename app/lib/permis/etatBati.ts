/**
 * PROJ-3h — VOCABULAIRE D'ÉTAT BD TOPO (IGN), pur et partagé. MÊME nomenclature que le schéma d'origine du Rattachement (on NE
 * réinvente PAS le vocabulaire) : les états IGN sont « En service », « En construction », « En projet », « En ruine ». Un polygone
 * est « futur bâti » s'il est « En projet » OU « En construction » (ce que le permis va faire sortir de terre) ; « en projet »
 * stricto sensu = « En projet ».
 *
 * 🔴 Ces polygones sont des DONNÉES IGN. Ils ne doivent JAMAIS être confondus avec une emprise RECONSTITUÉE (tracé manuel) : une
 * reconstitution n'alimente ni le verdict, ni l'altitude, ni un certificat (garde PROJ). Ce module ne fait que QUALIFIER un état ;
 * aucun couplage moteur.
 */

/** « Futur bâti » = ce que le permis va faire sortir de terre (En projet OU En construction). MÊME logique que le Rattachement. PUR. */
export function estFuturBati(etat: string | null | undefined): boolean {
  return etat === 'En projet' || etat === 'En construction';
}

/** « En projet » stricto sensu (l'état IGN dédié au filtre demandé). PUR. */
export function estEnProjet(etat: string | null | undefined): boolean {
  return etat === 'En projet';
}
