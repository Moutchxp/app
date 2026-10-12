/**
 * ══ 🔴🔴 LOT MARGES-MODALE-ET-LOCATAIRES-DE-L-EVENEMENT — LE OU LES LOCATAIRES CONCERNÉS PAR UN ÉVÉNEMENT ════════════
 *
 * DEMANDE D'ARNO (12/10/2026) : deux cas réels — une demande des locataires ACTUELS, ou un ANCIEN locataire sortant
 * qui ouvre un litige. Dans le formulaire d'événement, « Locataire(s) concerné(s) : <noms> — Modifier » ouvre un choix à
 * cases : les locataires actuels (vert, date d'entrée), les deux anciens locataires les plus récents (violet, dates
 * d'entrée et de sortie), et « Autre personne… » (l'annuaire, ou une saisie libre enregistrée sur l'événement SANS
 * créer de fiche). Par défaut : les locataires actuels, comme aujourd'hui — sans action, rien ne change. Le
 * propriétaire reste toujours rattaché.
 *
 * MODULE PUR (écran et serveur).
 */

/** La sorte d'une personne concernée : sa couleur en découle (vert, violet, gris). */
export type SorteConcerne = 'locataire' | 'ancien_locataire' | 'annuaire' | 'libre';

export interface Concerne {
  sorte: SorteConcerne;
  /** Le locataire de l'annuaire (actuel ou ancien). */
  locataireId: number | null;
  /** Une personne trouvée dans l'annuaire par « Autre personne… » : sa fiche (jamais créée ici). */
  sujet: 'proprietaire' | 'locataire' | null;
  sujetId: number | null;
  nom: string;
  email: string | null;
  telephone: string | null;
  entree: string | null;
  sortie: string | null;
}

/** Le nombre d'anciens locataires proposés : les PLUS RÉCENTS, deux au plus (Arno). */
export const ANCIENS_PROPOSES = 2;

export interface OccupationVue {
  locataireId: number; nom: string; entree: string | null; sortie: string | null;
}

/** Une occupation est-elle en cours aujourd'hui ? Pas de sortie, ou une sortie à venir. PUR. */
export function enPlace(o: Pick<OccupationVue, 'sortie'>, aujourdhui: string): boolean {
  return o.sortie === null || o.sortie.slice(0, 10) >= aujourdhui;
}

/**
 * LES CHOIX D'UN BIEN : les locataires actuels (date d'entrée), puis les deux anciens locataires les plus récents
 * (sortie la plus récente d'abord ; un locataire déjà en place n'y figure pas). PUR.
 */
export function optionsDuBien(occupations: readonly OccupationVue[], aujourdhui: string): { actuels: Concerne[]; anciens: Concerne[] } {
  const vers = (o: OccupationVue, sorte: SorteConcerne): Concerne => ({
    sorte, locataireId: o.locataireId, sujet: null, sujetId: null, nom: o.nom.trim(), email: null, telephone: null,
    entree: o.entree, sortie: o.sortie,
  });
  const actuels = occupations.filter((o) => enPlace(o, aujourdhui));
  const idsActuels = new Set(actuels.map((o) => o.locataireId));
  const vus = new Set<number>();
  const anciens = occupations.filter((o) => !enPlace(o, aujourdhui) && !idsActuels.has(o.locataireId))
    .sort((a, b) => (b.sortie ?? '').localeCompare(a.sortie ?? ''))
    .filter((o) => (vus.has(o.locataireId) ? false : (vus.add(o.locataireId), true)))
    .slice(0, ANCIENS_PROPOSES);
  return { actuels: actuels.map((o) => vers(o, 'locataire')), anciens: anciens.map((o) => vers(o, 'ancien_locataire')) };
}

/** Le choix par défaut : les locataires actuels, cochés — exactement le comportement d'avant. PUR. */
export function choixParDefaut(options: { actuels: readonly Concerne[] }): Concerne[] {
  return [...options.actuels];
}

/** La clé d'une personne concernée (pour cocher, comparer, dédoublonner). PUR. */
export function cleConcerne(c: Concerne): string {
  if (c.locataireId !== null && (c.sorte === 'locataire' || c.sorte === 'ancien_locataire')) return `loc:${c.locataireId}`;
  if (c.sujet !== null && c.sujetId !== null) return `${c.sujet}:${c.sujetId}`;
  return `libre:${c.nom.trim().toLowerCase()}|${(c.email ?? '').trim().toLowerCase()}|${(c.telephone ?? '').replace(/\D/g, '')}`;
}

/** Le choix diffère-t-il du choix par défaut ? (Seul un choix modifié s'enregistre.) PUR. */
export function choixModifie(choix: readonly Concerne[], parDefaut: readonly Concerne[]): boolean {
  const a = new Set(choix.map(cleConcerne));
  const b = new Set(parDefaut.map(cleConcerne));
  return a.size !== b.size || [...a].some((k) => !b.has(k));
}

/** « 28/09/2026 » depuis « 2026-09-28 ». PUR. */
export function jourFr(iso: string | null): string {
  if (iso === null) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m === null ? iso : `${m[3]}/${m[2]}/${m[1]}`;
}

/** Comment une personne concernée se dit dans la phrase de rattachement. PUR. */
export function motConcerne(c: Concerne): string {
  if (c.sorte === 'locataire') return `${c.nom} (locataire en place)`;
  if (c.sorte === 'ancien_locataire') return `${c.nom} (ancien locataire${c.sortie ? `, sorti le ${jourFr(c.sortie)}` : ''})`;
  return c.nom;
}

const enumerer = (l: readonly string[]): string =>
  (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}`);

/** « Locataire(s) concerné(s) : X, Y » — la ligne sous la phrase. PUR. */
export function ligneConcernes(choix: readonly Concerne[]): string {
  return choix.length === 0 ? 'aucun (bien vacant ou choix vide)' : choix.map((c) => c.nom).join(', ');
}

/**
 * 🔴 LA PHRASE DE RATTACHEMENT, QUI SUIT LE CHOIX. PUR.
 * « Sera rattaché à 67 rue de Normandie, 92400 COURBEVOIE — lot 315, à son propriétaire et à M. X (ancien locataire,
 * sorti le 28/09/2026). » ; sans personne choisie : « …, à son propriétaire ; aucun locataire concerné (bien vacant). »
 * `choix` nul : les locataires ne sont pas connus (lecture en cours ou impossible) — la phrase d'avant, mot pour mot.
 */
export function phraseRattachement(libellesDesBiens: readonly string[], choix: readonly Concerne[] | null, vacant = false): string {
  if (libellesDesBiens.length === 0) return 'Aucun bien classé sur ce mail : la carte sera ouverte sans bien rattaché.';
  const biens = libellesDesBiens.join(', ');
  if (choix === null) return `Sera rattaché à ${biens}, à son propriétaire et à son locataire.`;
  if (choix.length === 0) {
    return `Sera rattaché à ${biens}, à son propriétaire ; aucun locataire concerné${vacant ? ' (bien vacant)' : ''}.`;
  }
  return `Sera rattaché à ${biens}, à son propriétaire et à ${enumerer(choix.map(motConcerne))}.`;
}

/** La couleur d'une personne concernée : vert (en place), violet (ancien), gris (autre personne). PUR. */
export function tonConcerne(s: SorteConcerne): 'vert' | 'violet' | 'gris' {
  return s === 'locataire' ? 'vert' : s === 'ancien_locataire' ? 'violet' : 'gris';
}

/** Relit, côté serveur, la liste envoyée par l'écran. Une ligne illisible est écartée ; 20 au plus. PUR. */
export function concernesDepuisJson(v: unknown): Concerne[] | null {
  if (!Array.isArray(v)) return null;
  const txt = (x: unknown, max: number): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim().slice(0, max) : null);
  const ent = (x: unknown): number | null => (typeof x === 'number' && Number.isSafeInteger(x) && x > 0 ? x : null);
  const jour = (x: unknown): string | null => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0, 10) : null);
  const out: Concerne[] = [];
  for (const brut of v.slice(0, 20)) {
    if (typeof brut !== 'object' || brut === null) continue;
    const b = brut as Record<string, unknown>;
    const sorte = b.sorte;
    if (sorte !== 'locataire' && sorte !== 'ancien_locataire' && sorte !== 'annuaire' && sorte !== 'libre') continue;
    const nom = txt(b.nom, 200);
    if (nom === null) continue;
    const c: Concerne = {
      sorte, nom, locataireId: ent(b.locataireId), sujet: b.sujet === 'proprietaire' || b.sujet === 'locataire' ? b.sujet : null,
      sujetId: ent(b.sujetId), email: txt(b.email, 200), telephone: txt(b.telephone, 40), entree: jour(b.entree), sortie: jour(b.sortie),
    };
    /* Un locataire (actuel ou ancien) désigne SA fiche ; une personne de l'annuaire aussi ; une partie libre n'en a pas. */
    if ((sorte === 'locataire' || sorte === 'ancien_locataire') && c.locataireId === null) continue;
    if (sorte === 'annuaire' && (c.sujet === null || c.sujetId === null)) continue;
    if (sorte === 'libre') { c.locataireId = null; c.sujet = null; c.sujetId = null; }
    out.push(c);
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT FENETRE-EVENEMENT-STRUCTUREE-ET-BLOC-PARTIES (Arno, 12/10/2026) — LE BLOC « PARTIES CONCERNÉES »
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   Les choix sont VISIBLES DIRECTEMENT (plus de petite fenêtre « Modifier ») : propriétaire (rouge, toujours concerné),
   locataires actuels (vert, cochés par défaut), anciens locataires (violet, les deux plus récents, décochés),
   « + Autre personne… » (gris). En pied de bloc, un récapitulatif qui remplace la phrase « Sera rattaché à … ». */

/** Le mot d'une liste de noms, avec son accord : « locataire Y », « locataires Y, Z ». PUR. */
function groupe(singulier: string, pluriel: string, noms: readonly string[]): string | null {
  return noms.length === 0 ? null : `${noms.length > 1 ? pluriel : singulier} ${noms.join(', ')}`;
}

/**
 * LE RÉCAPITULATIF, EN DIRECT : « Sera rattaché à : 25 rue Edith Cavell, 92400 COURBEVOIE — lot 219 · propriétaire X ·
 * locataires Y ». Propriétaire inconnu : « propriétaire » seul ; aucun locataire choisi : « aucun locataire ». PUR.
 */
export function recapRattachement(
  libellesDesBiens: readonly string[], proprietaires: readonly string[], choix: readonly Concerne[],
): string {
  const biens = libellesDesBiens.length === 0 ? 'aucun bien' : libellesDesBiens.join(', ');
  const morceaux = [
    proprietaires.length === 0 ? 'propriétaire' : groupe('propriétaire', 'propriétaires', proprietaires),
    groupe('locataire', 'locataires', choix.filter((c) => c.sorte === 'locataire').map((c) => c.nom)),
    groupe('ancien locataire', 'anciens locataires', choix.filter((c) => c.sorte === 'ancien_locataire').map((c) => c.nom)),
    groupe('autre personne', 'autres personnes', choix.filter((c) => c.sorte === 'annuaire' || c.sorte === 'libre').map((c) => c.nom)),
  ].filter((m): m is string => m !== null);
  if (!choix.some((c) => c.sorte === 'locataire' || c.sorte === 'ancien_locataire')) morceaux.splice(1, 0, 'aucun locataire');
  return `Sera rattaché à : ${[biens, ...morceaux].join(' · ')}`;
}

/** Ajouter ou retirer une personne du choix, sans doublon. PUR. */
export function basculerConcerne(choix: readonly Concerne[], c: Concerne): Concerne[] {
  const k = cleConcerne(c);
  return choix.some((x) => cleConcerne(x) === k) ? choix.filter((x) => cleConcerne(x) !== k) : [...choix, c];
}
