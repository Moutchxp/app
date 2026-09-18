/**
 * D2 — LES DEUX PROCESS de demande aux mairies (viviers séparés, un permis ne peut être dans les deux à la fois). MODULE PUR
 * (aucune I/O), source de vérité unique du partitionnement d'AFFICHAGE. 🔑 Le process est une notion d'AFFICHAGE EN AVAL : il ne
 * doit JAMAIS devenir un WHERE dans les requêtes de surveillance juridique (cf. surveillanceGardeProcess.test.ts).
 *
 * Rattachement au canal (recon axe B) : une DEMANDE suit `dest_canal` (figé à la création) ; une COMMUNE / un PERMIS suit
 * `mairie_contact.canal`. Deux valeurs seulement définissent un process ; tout le reste tombe dans le TROISIÈME groupe (Part 4).
 */

export type Process = 'formulaire' | 'email';

/** 'formulaire' = Téléservice (rail B) ; 'email' = E-mail (rail A). Le `titre` du sélecteur nomme désormais l'AXE de préparation
 *  commun aux deux rails (sélection auto/manuelle côté téléservice ; envoi auto/manuel de la 1re demande côté e-mail) — cf. le bloc
 *  auto/manuel sous le sélecteur. ⚠️ Cet axe est DISTINCT de l'automatisation des RELANCES (config `relance_auto_active`, onglet
 *  Réglages) : les deux ne s'influencent pas. `aide` conserve la NATURE du canal (téléservice = dépôt à la main ; e-mail = envoi). */
export const PROCESS_META: Record<Process, { titre: string; court: string; aide: string }> = {
  formulaire: { titre: 'Téléservice (sélection manuelle ou automatique)', court: 'Téléservice', aide: 'Communes à téléservice : dépôt à la main. La sélection des permis à demander peut être automatique (par critères) ou manuelle.' },
  email: { titre: 'E-mail (envoi manuel ou automatique)', court: 'E-mail', aide: 'Communes joignables par e-mail. La 1re demande d’information peut être préparée automatiquement (par critères) ou manuellement.' },
};

export const PROCESS_ORDRE: readonly Process[] = ['email', 'formulaire'];
export const PROCESS_DEFAUT: Process = 'email'; // défaut à l'ouverture (ne persiste pas entre sessions dans ce lot)

/**
 * Process d'un canal, ou `null` si le canal n'appartient à AUCUN des deux process (→ TROISIÈME groupe). 🔴 'courrier' (vestige)
 * et 'inconnu'/absent (commune sans adresse ni téléservice) ne sont JAMAIS un process : ils ne peuvent produire aucune demande.
 */
export function processDeCanal(canal: string | null | undefined): Process | null {
  if (canal === 'email') return 'email';
  if (canal === 'formulaire') return 'formulaire';
  return null; // 'courrier', 'inconnu', null → hors process
}

/** Une entité (demande via dest_canal, commune/permis via mairie_contact.canal) appartient-elle au process actif ? PURE. */
export function dansProcess(canal: string | null | undefined, process: Process): boolean {
  return processDeCanal(canal) === process;
}

/** Vrai si le canal est HORS des deux process (troisième groupe : courrier vestige, sans-adresse). PURE. */
export function horsProcess(canal: string | null | undefined): boolean {
  return processDeCanal(canal) === null;
}

/** Partitionne une liste (chaque élément portant un canal) par process + un seau `hors` pour le reste. PURE. */
export function partitionnerParProcess<T>(items: readonly T[], canalDe: (x: T) => string | null | undefined): { email: T[]; formulaire: T[]; hors: T[] } {
  const email: T[] = [], formulaire: T[] = [], hors: T[] = [];
  for (const x of items) {
    const p = processDeCanal(canalDe(x));
    if (p === 'email') email.push(x);
    else if (p === 'formulaire') formulaire.push(x);
    else hors.push(x);
  }
  return { email, formulaire, hors };
}
