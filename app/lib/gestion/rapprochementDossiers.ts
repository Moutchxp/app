/**
 * ══ 🔴🔴 RAPPROCHEMENT DES DOSSIERS CLIENTS — LES RÈGLES PURES (Arno, 18 et 19/10/2026) ═══════════════════════════════════
 *
 * La copie de « Documents clients scannés » est terminée (19/10/2026). Chaque dossier propriétaire COPIÉ est proposé pour
 * une fiche propriétaire de l'annuaire (niveaux SÛR / PROBABLE / AMBIGU / AUCUN) ; Arno décide à l'écran « Rapprochement
 * des dossiers clients » : Valider, Corriger (une autre fiche), Aucun rattachement.
 *
 * Décisions d'Arno du 18/10 appliquées ici, sans les redemander :
 *   · 4  « 1 actifs » → Actifs ; « 2 vendus » et « 3 perdus » → Inactifs ;
 *   · 5  un client WIPPIMMO sans dossier garde son dossier actuel ;
 *   · 6  les dossiers « vendu / perdu » mais en gestion : on n'y touche pas, on les montre ;
 *   · 7  plusieurs dossiers pour un propriétaire : tous rattachés ; le principal = celui des actifs, à défaut le plus récent ;
 *   · 9  contrôle à l'œil de 20 SÛRS « nom + locataire » tirés au hasard AVANT de valider les SÛRS en masse ;
 *   · 10 « _TEST CLAUDE » et « _TEST COPIE » à la corbeille (au lot suivant).
 *
 * 🔴 AUCUNE DÉCISION N'ÉCRIT DANS LE DRIVE NI DANS L'ANNUAIRE : elles sont enregistrées (datées, attribuées, jamais effacées)
 * et `planDuLotSuivant` dit seulement ce que le lot suivant fera. Rien ici ne s'exécute.
 */

export type Niveau = 'SUR' | 'PROBABLE' | 'AMBIGU' | 'AUCUN' | 'SANS_DOSSIER';
export type Geste = 'valider' | 'corriger' | 'aucun';
export const GESTES: readonly Geste[] = ['valider', 'corriger', 'aucun'];

/** Le nombre de SÛRS tirés au hasard pour le contrôle à l'œil (décision 9). */
export const TAILLE_CONTROLE = 20;

export interface FicheCourte { id: number; nom: string; dossierActuelId: string | null }

export interface Decision {
  id: number;
  geste: Geste;
  fiche: FicheCourte | null;
  enMasse: boolean;
  decideLe: string;
  decidePar: string;
}

export interface LigneRapprochement {
  id: number;
  sorte: 'dossier' | 'client_sans_dossier';
  copieDossierId: string | null;
  nomDossier: string | null;
  branche: string | null;
  nbFichiers: number | null;
  niveau: Niveau;
  raison: string;
  fiche: FicheCourte | null;
  candidats: FicheCourte[];
  controleOeil: boolean;
  venduEnGestion: boolean;
  groupePlusieurs: string | null;
  principal: boolean;
  dernierFichierLe: string | null;
  /** La décision qui fait foi (la plus récente), et combien ont été posées en tout. */
  decision: Decision | null;
  nbDecisions: number;
}

export type CleSection = 'controle' | 'vendus' | 'plusieurs' | 'probables' | 'ambigus' | 'sans_correspondant' | 'clients_sans_dossier' | 'surs';

export const SECTIONS: readonly { cle: CleSection; titre: string; aide: string }[] = [
  { cle: 'controle', titre: 'Contrôle à l’œil', aide: '20 rapprochements SÛRS « nom + locataire » tirés au hasard. Tous doivent être validés avant « Valider tous les SÛRS ».' },
  { cle: 'vendus', titre: 'Vendus / perdus mais en gestion', aide: 'Rangés en « vendus » ou « perdus », mais la fiche est en gestion : on n’y touche pas, on les montre.' },
  { cle: 'plusieurs', titre: 'Plusieurs dossiers pour un propriétaire', aide: 'Tous rattachés à la fiche ; le principal proposé est celui des actifs, à défaut le plus récent.' },
  { cle: 'probables', titre: 'Probables', aide: 'Même nom, sans second critère (ou des homonymes départagés par le prénom).' },
  { cle: 'ambigus', titre: 'Ambigus', aide: 'Plusieurs fiches possibles : choisir avec « Corriger ».' },
  { cle: 'sans_correspondant', titre: 'Dossiers sans correspondant', aide: 'Aucune fiche de ce nom dans l’annuaire.' },
  { cle: 'clients_sans_dossier', titre: 'Clients WIPPIMMO sans dossier', aide: 'Aucun dossier copié ne désigne ces fiches : elles gardent leur dossier actuel.' },
  { cle: 'surs', titre: 'Autres SÛRS', aide: 'Validés d’un coup par « Valider tous les SÛRS », ou un par un.' },
];

/** La section d'une ligne : une seule, dans l'ordre de l'écran. PUR. */
export function sectionDe(l: Pick<LigneRapprochement, 'sorte' | 'niveau' | 'controleOeil' | 'venduEnGestion' | 'groupePlusieurs'>): CleSection {
  if (l.sorte === 'client_sans_dossier') return 'clients_sans_dossier';
  if (l.controleOeil) return 'controle';
  if (l.venduEnGestion) return 'vendus';
  if (l.groupePlusieurs !== null) return 'plusieurs';
  if (l.niveau === 'PROBABLE') return 'probables';
  if (l.niveau === 'AMBIGU') return 'ambigus';
  if (l.niveau === 'AUCUN') return 'sans_correspondant';
  return 'surs';
}

/** Les lignes rangées par section ; dans « plusieurs », chaque groupe se suit, principal en tête. PUR. */
export function sectionsDuRapprochement(lignes: readonly LigneRapprochement[]): Record<CleSection, LigneRapprochement[]> {
  const out = Object.fromEntries(SECTIONS.map((s) => [s.cle, [] as LigneRapprochement[]])) as Record<CleSection, LigneRapprochement[]>;
  for (const l of lignes) out[sectionDe(l)].push(l);
  const parNom = (a: LigneRapprochement, b: LigneRapprochement) => (a.nomDossier ?? a.fiche?.nom ?? '').localeCompare(b.nomDossier ?? b.fiche?.nom ?? '', 'fr') || a.id - b.id;
  for (const s of SECTIONS) out[s.cle].sort(parNom);
  out.plusieurs.sort((a, b) => (a.fiche?.nom ?? '').localeCompare(b.fiche?.nom ?? '', 'fr') || (a.groupePlusieurs ?? '').localeCompare(b.groupePlusieurs ?? '')
    || Number(b.principal) - Number(a.principal) || parNom(a, b));
  return out;
}

/** Où en est le contrôle à l'œil : il est complet quand les 20 sont VALIDÉS (une correction ou un refus le laisse incomplet). PUR. */
export function etatControle(lignes: readonly LigneRapprochement[]): { total: number; valides: number; complet: boolean } {
  const c = lignes.filter((l) => l.controleOeil);
  const valides = c.filter((l) => l.decision?.geste === 'valider').length;
  return { total: c.length, valides, complet: c.length === TAILLE_CONTROLE && valides === TAILLE_CONTROLE };
}

/**
 * Les SÛRS que « Valider tous les SÛRS » validerait : niveau SÛR, une fiche proposée, aucune décision encore, et pas un
 * « vendu / perdu mais en gestion » (décision 6 : on n'y touche pas). PUR.
 */
export function sursAValider(lignes: readonly LigneRapprochement[]): LigneRapprochement[] {
  return lignes.filter((l) => l.sorte === 'dossier' && l.niveau === 'SUR' && l.fiche !== null && l.decision === null && !l.venduEnGestion);
}

/** Le bouton global : actif seulement quand le contrôle à l'œil est complet ET qu'il reste des SÛRS à valider. PUR. */
export function peutValiderTousLesSurs(lignes: readonly LigneRapprochement[]): { ok: true; nombre: number } | { ok: false; motif: string } {
  const c = etatControle(lignes);
  if (!c.complet) return { ok: false, motif: `Le contrôle à l’œil n’est pas terminé : ${c.valides} validé(s) sur ${TAILLE_CONTROLE}.` };
  const n = sursAValider(lignes).length;
  if (n === 0) return { ok: false, motif: 'Aucun SÛR en attente de décision.' };
  return { ok: true, nombre: n };
}

/** La décision demandée est-elle recevable pour cette ligne ? PUR. */
export function verifierGeste(l: Pick<LigneRapprochement, 'sorte' | 'fiche'>, geste: Geste, ficheChoisie: number | null): string | null {
  if (l.sorte !== 'dossier') return 'Un client sans dossier garde son dossier actuel : rien à décider ici.';
  if (geste === 'valider' && l.fiche === null) return 'Aucune fiche n’est proposée : choisir une fiche avec « Corriger ».';
  if (geste === 'corriger' && (ficheChoisie === null || !Number.isInteger(ficheChoisie) || ficheChoisie <= 0)) return 'Choisir la fiche à rattacher.';
  return null;
}

/** Le dossier copié dans le Drive. PUR. */
export const lienDossierDrive = (id: string): string => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
/** La fiche propriétaire dans l'application (la fiche commune). PUR. */
export const lienFiche = (id: number): string => `/admin/location/proprietaire/${id}`;

/** La fiche retenue par la décision qui fait foi (Valider = la fiche proposée ; Corriger = la fiche choisie ; Aucun = aucune). PUR. */
export function ficheRetenue(l: LigneRapprochement): FicheCourte | null {
  if (l.decision === null || l.decision.geste === 'aucun') return null;
  return l.decision.fiche;
}

// ── LE PLAN DU LOT SUIVANT (rien n'est exécuté) ──────────────────────────────────────────────────────────────────────

export const DOSSIERS_TEST_A_LA_CORBEILLE = ['_TEST CLAUDE (les 8 dossiers « _TEST CLAUDE … à supprimer par Arno »)', '_TEST COPIE'] as const;

export interface PlanLotSuivant {
  /** Chaque dossier copié rejoint « Actifs » ou « Inactifs » selon sa branche (décision 4). */
  deplacements: { propositionId: number; copieDossierId: string; nomDossier: string; vers: 'Actifs' | 'Inactifs'; decide: boolean }[];
  /** La fiche pointe désormais sur son dossier copié (le principal si elle en a plusieurs). */
  repointages: { proprietaireId: number; nom: string; de: string | null; vers: string; propositionId: number }[];
  /** L'ancien dossier de la fiche repointée, sous le verrou de l'étape 1 bis §6 (jamais de suppression définitive). */
  corbeille: { proprietaireId: number; nom: string; ancienDossierId: string }[];
  /** Décision 6 : laissés tels quels. */
  laissesEnPlace: { propositionId: number; nomDossier: string }[];
  dossiersTest: readonly string[];
  nonDecides: number;
}

const BRANCHE_ACTIVE = '1 actifs';

/** Le plan, recalculé à partir des seules décisions enregistrées. PUR. */
export function planDuLotSuivant(lignes: readonly LigneRapprochement[]): PlanLotSuivant {
  const dossiers = lignes.filter((l) => l.sorte === 'dossier' && l.copieDossierId !== null);
  const plan: PlanLotSuivant = { deplacements: [], repointages: [], corbeille: [], laissesEnPlace: [], dossiersTest: DOSSIERS_TEST_A_LA_CORBEILLE, nonDecides: 0 };
  const parFiche = new Map<number, { fiche: FicheCourte; lignes: LigneRapprochement[] }>();
  for (const l of dossiers) {
    if (l.decision === null) plan.nonDecides += 1;
    if (l.venduEnGestion) { plan.laissesEnPlace.push({ propositionId: l.id, nomDossier: l.nomDossier ?? '' }); continue; }
    plan.deplacements.push({ propositionId: l.id, copieDossierId: l.copieDossierId as string, nomDossier: l.nomDossier ?? '',
      vers: l.branche === BRANCHE_ACTIVE ? 'Actifs' : 'Inactifs', decide: l.decision !== null });
    const f = ficheRetenue(l);
    if (f === null) continue;
    const g = parFiche.get(f.id) ?? { fiche: f, lignes: [] };
    g.lignes.push(l);
    parFiche.set(f.id, g);
  }
  for (const { fiche, lignes: ls } of parFiche.values()) {
    // Le principal : celui qu'on a proposé comme tel, à défaut celui des actifs, à défaut le plus récent.
    const principal = [...ls].sort((a, b) => Number(b.principal) - Number(a.principal)
      || Number(b.branche === BRANCHE_ACTIVE) - Number(a.branche === BRANCHE_ACTIVE)
      || (b.dernierFichierLe ?? '').localeCompare(a.dernierFichierLe ?? '') || a.id - b.id)[0];
    plan.repointages.push({ proprietaireId: fiche.id, nom: fiche.nom, de: fiche.dossierActuelId, vers: principal.copieDossierId as string, propositionId: principal.id });
    if (fiche.dossierActuelId !== null && fiche.dossierActuelId !== principal.copieDossierId) {
      plan.corbeille.push({ proprietaireId: fiche.id, nom: fiche.nom, ancienDossierId: fiche.dossierActuelId });
    }
  }
  plan.repointages.sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.proprietaireId - b.proprietaireId);
  plan.corbeille.sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.proprietaireId - b.proprietaireId);
  return plan;
}
