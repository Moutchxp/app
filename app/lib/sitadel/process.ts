/**
 * D2 — LES DEUX PROCESS de demande aux mairies (viviers séparés, un permis ne peut être dans les deux à la fois). MODULE PUR
 * (aucune I/O), source de vérité unique du partitionnement d'AFFICHAGE. 🔑 Le process est une notion d'AFFICHAGE EN AVAL : il ne
 * doit JAMAIS devenir un WHERE dans les requêtes de surveillance juridique (cf. surveillanceGardeProcess.test.ts).
 *
 * Rattachement au canal (recon axe B) : une DEMANDE suit `dest_canal` (figé à la création) ; une COMMUNE / un PERMIS suit
 * `mairie_contact.canal`. Deux valeurs seulement définissent un process ; tout le reste tombe dans le TROISIÈME groupe (Part 4).
 */

export type Process = 'formulaire' | 'email';

/** 'formulaire' = Téléservice (rail B) ; 'email' = E-mail (rail A). `titre` = NATURE DU CANAL (téléservice = dépôt à la main ; e-mail).
 *  Le sélecteur (`CommutateurProcess`) y AJOUTE, EN TEMPS RÉEL, le mode COURANT du bloc auto/manuel (téléservice → « sélection
 *  auto/manuelle » ; e-mail → « envoi auto/manuel »), via `libelleRailAvecMode`. ⚠️ Cet axe est DISTINCT de l'automatisation des
 *  RELANCES (config `relance_auto_active`) : les deux ne s'influencent pas. `court` (badges/renvois) inchangé. */
export const PROCESS_META: Record<Process, { titre: string; court: string; aide: string }> = {
  formulaire: { titre: 'Téléservice (dépôt à la main)', court: 'Téléservice', aide: 'Communes à téléservice : dépôt à la main. La sélection des permis à demander peut être automatique (par critères) ou manuelle.' },
  email: { titre: 'E-mail', court: 'E-mail', aide: 'Communes joignables par e-mail. La 1re demande d’information peut partir automatiquement (par critères) ou être envoyée à la main.' },
};

/** Mode de préparation courant d'un rail (miroir de la bascule auto/manuel du bloc « À demander »). Téléservice = sélection ; e-mail = envoi. */
export type ModeRail = 'auto' | 'manuel';

/** Libellé TEMPS RÉEL d'un rail dans le sélecteur : nature du canal (`titre`) + mode COURANT. `mode` absent → titre seul (repli sûr). PUR. */
export function libelleRailAvecMode(p: Process, mode: ModeRail | undefined): string {
  if (mode === undefined) return PROCESS_META[p].titre;
  const axe = p === 'formulaire' ? 'sélection' : 'envoi';
  const val = p === 'formulaire' ? (mode === 'auto' ? 'automatique' : 'manuelle') : (mode === 'auto' ? 'automatique' : 'manuel');
  return `${PROCESS_META[p].titre} — ${axe} ${val}`;
}

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
