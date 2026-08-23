/**
 * FRAÎCHEUR lot 3/3 — PRÉPARATION de la commande de réingestion (PUR, aucune exécution).
 *
 * DÉCISION TRANCHÉE : la tuile n'exécute RIEN. Elle prépare un bloc à COPIER que l'humain colle dans un vrai terminal.
 * Motif : une réingestion BD TOPO transfère des centaines de Mo et manipule des millions de lignes — lancée depuis un
 * onglet elle survit mal à sa fermeture et son échec devient invisible. Même patron que la carte CADA : l'interface
 * prépare, l'humain exécute. Ce module ne fait QUE composer une chaîne de caractères ; il n'importe ni `child_process`,
 * ni `exec`, ni `spawn`, et n'appelle aucun script d'ingestion (on les invoque par leur commande, on ne les touche pas).
 */

/** Bloc de commande prêt à coller + son cadre d'honnêteté (avertissement, caractère destructif). */
export interface PreparationCommande {
  /** Le bloc multi-lignes : `cd` absolu + chargement d'environnement + commande. */
  commande: string;
  /** Avertissement AVANT le bloc quand la commande est lourde ou remplace des données ; null sinon. */
  avertissement: string | null;
  /** Vrai si la commande DÉTRUIT/remplace des données existantes (TRUNCATE, DELETE large). Aucune ne le fait aujourd'hui. */
  destructif: boolean;
}

/** Rappel du terminal — affiché à côté de chaque bloc. */
export const TERMINAL_RAPPEL =
  'À coller dans l’application Terminal de macOS, dans une fenêtre NEUVE — pas l’onglet de l’agent, pas un onglet occupé par un serveur.';

/** Procédure de réingestion MANUELLE par source (les seules qui ont une commande). Sitadel = automatique → absente ici. */
interface Procedure {
  /** Construit la ligne de commande ; `edition` = millésime distant détecté (pour les commandes qui en ont besoin). */
  ligne(edition: string | null): string;
  avertissement: string | null;
  destructif: boolean;
}

const PROCEDURES: Readonly<Record<string, Procedure>> = {
  bdtopo_bati: {
    ligne: (e) => `npm run bdtopo:import -- --dep 75,77,78,92,93,94 --edition ${e ?? '<AAAA-MM-JJ>'}`,
    avertissement:
      'Lourd : plusieurs centaines de Mo téléchargées, des millions de lignes ; requiert curl, 7z et ogr2ogr. Cette commande ne fait que CHARGER l’édition dans une table neuve — le basculement (remplacement de « batiment ») et le rescellage du golden sont une étape SÉPARÉE. À lancer hors production.',
    destructif: false,
  },
  cadastre: {
    ligne: (e) => `npm run cadastre:ingest -- --dep 75,78,92,93 --millesime ${e ?? '<AAAA-MM-JJ>'}`,
    avertissement:
      '≈ 35 Mo par département. Idempotent : un (département, millésime) déjà chargé est ignoré ; les parcelles sont ajoutées, jamais supprimées.',
    destructif: false,
  },
  dila: {
    ligne: () => 'npm run dila:ingest',
    avertissement:
      'Télécharge le fichier national all_latest (~360 Mo), puis REMPLACE le millésime DILA en base (les autres millésimes ne sont pas touchés). Quelques minutes.',
    destructif: false,
  },
  prada: {
    ligne: () => 'npm run prada:ingest',
    avertissement: null, // léger : petit CSV, upsert non destructif
    destructif: false,
  },
} as const;

/** Vrai si la source possède une procédure de réingestion MANUELLE (donc une commande à préparer). */
export function aUneProcedure(cle: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROCEDURES, cle);
}

/**
 * Prépare le bloc copiable pour une source, ou null si elle n'a pas de procédure manuelle (LiDAR, adresse orpheline, BDNB,
 * Sitadel automatique). Le bloc contient TOUT pour que ça marche du premier coup : `cd` ABSOLU, chargement d'environnement,
 * commande. PUR : compose une chaîne, n'exécute rien.
 */
export function preparerCommande(cle: string, edition: string | null, cheminDepot: string): PreparationCommande | null {
  const proc = PROCEDURES[cle];
  if (!proc) return null;
  const commande = [
    `cd ${cheminDepot}`,
    'set -a && source .env && set +a',
    proc.ligne(edition),
  ].join('\n');
  return { commande, avertissement: proc.avertissement, destructif: proc.destructif };
}
