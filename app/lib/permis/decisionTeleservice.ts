/**
 * CR-3 — DÉCISION PURE d'instruction des valeurs de la part GÉNÉRÉE par le téléservice (CR-1b) dans les champs de caractéristiques.
 * Aucune I/O. Mirroir de `reportDeclarations.ts` (LOT 70), méthode `teleservice` (precedenceMethodes.ts, sous 'plan', au-dessus de 'ia').
 *
 * DOCTRINE (identique au report 'recap', pièges du dépôt en plus) :
 * - N'écrit QUE dans un champ VIDE (ou déjà détenu par 'teleservice' → ré-écriture idempotente). Jamais par-dessus 'saisie' (invariant
 *   103) ni une méthode supérieure (cerfa/enonce/plan) — qui, si présentes, ont déjà rempli le champ (donc « vide seulement » suffit).
 * - PIÈGE 1 (divergence) : si le généré contredit la déclaration HUMAINE (R+N ≠ R+M), on N'ÉCRIT PAS (journalisé 'ecartee'). Cas 470.
 * - PIÈGE 2 (attribution) : niveaux = champs PAR bâtiment. Doctrine P4/P5 CLOSE : jamais d'attribution d'office → on n'écrit un corps
 *   QUE s'il y a EXACTEMENT UN bâtiment ; sinon 'ecartee' « attribution par bâtiment non résolue ».
 * - PIÈGE 3 (sémantique nb_etages) : `nb_etages` = N de R+N (RDC exclu — decisionNiveaux.ts:338/352). AUCUNE conversion : R+4 → 4.
 * - PIÈGE 4a (destination) : `permis_caracteristique.destinations` est un ARRAY sous CHECK fermé. Le généré donne du texte libre
 *   (« d'habitation »). Mapping EXPLICITE et testé « habitation → Logement » (label EXACT du CHECK) ; tout le reste → 'ecartee', JAMAIS
 *   une valeur hors CHECK.
 * - PIÈGE 4b (surface) : « Surface créée » (généré) ≠ surface de PLANCHER (mesures distinctes, cf. reportDeclarations.ts:35) → JAMAIS
 *   écrite dans surface_plancher_m2 ; toujours 'ecartee' avec le motif.
 */
import type { ValeursGenerees } from './descriptionScission';

export type ChampTeleservice = 'nb_etages' | 'nb_niveaux_sous_sol' | 'destinations' | 'surface_plancher_m2';
export type NiveauCible = 'permis' | 'corps';

/** État courant d'un champ cible : sa valeur, son origine (invariant), et le PROPRIÉTAIRE de précédence (méthode de la 'retenue'). */
export interface EtatCible { valeur: number | string[] | null; origine: 'saisie' | 'extraite' | null; proprietaire: string | null }

export interface DecisionTeleservice {
  champ: ChampTeleservice;
  niveau: NiveauCible;
  libelle: string;
  candidat: string;                       // valeur candidate LISIBLE (pour le rapport / l'audit)
  action: 'ecrire' | 'ecartee';
  valeurNombre?: number;                   // ce qui serait écrit (champs numériques)
  valeurTexte?: string[];                  // ce qui serait écrit (destinations)
  motif?: string;                          // si 'ecartee'
}

/** Un champ VIDE (ou détenu par 'teleservice') est écrivable ; 'saisie' jamais ; toute autre méthode occupe (vide seulement). */
function ecrivable(e: EtatCible): boolean {
  if (e.origine === 'saisie') return false;
  const vide = e.valeur === null || (Array.isArray(e.valeur) && e.valeur.length === 0);
  return vide || e.proprietaire === 'teleservice';
}

const sansAccent = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[’']/g, "'").toLowerCase();

/**
 * Mapping EXPLICITE d'une destination générée vers un libellé EXACT du CHECK fermé de `destinations`. Conservateur : seul « habitation »
 * (→ « Logement ») est certain. Tout le reste → null (non mappable → jamais écrit, journalisé). Jamais une valeur hors CHECK.
 */
export function mapperDestinationTeleservice(brut: string | null): string | null {
  if (!brut) return null;
  const s = sansAccent(brut).replace(/^(a\s+destination\s+)?(d'|de\s+|du\s+|des\s+)?/, '').trim();
  if (/\bhabitation\b|\blogements?\b/.test(s)) return 'Logement'; // label EXACT du CHECK (migration 110)
  return null;
}

export interface EntreeDecision {
  valeurs: ValeursGenerees;
  divergenceEtages: boolean;   // divergenceNiveauxHorsSol(scission) != null (généré vs humain)
  nbCorps: number;
  etatEtages: EtatCible;       // nb_etages du corps UNIQUE (pertinent si nbCorps === 1)
  etatSousSol: EtatCible;      // nb_niveaux_sous_sol du corps UNIQUE
  etatDestinations: EtatCible; // destinations (niveau permis)
}

const MOTIF_ATTRIBUTION = 'attribution par bâtiment non résolue — valeur au niveau du permis, plusieurs bâtiments (doctrine P4/P5, jamais d’office)';
const MOTIF_OCCUPE = (m: string | null): string => `champ déjà renseigné par une méthode de rang supérieur (${m ?? 'inconnue'}) — jamais écrasé`;
const MOTIF_SAISIE = 'champ saisi à la main — jamais écrasé (invariant 103)';

/** Décide, champ par champ, ce que le téléservice écrirait / écarterait. PUR. */
export function decisionInstruireTeleservice(e: EntreeDecision): DecisionTeleservice[] {
  const out: DecisionTeleservice[] = [];
  const occupeMotif = (etat: EtatCible): string => (etat.origine === 'saisie' ? MOTIF_SAISIE : MOTIF_OCCUPE(etat.proprietaire));

  // 1. nb_etages (corps) — N de R+N, direct.
  if (e.valeurs.niveauxHorsSol != null) {
    const n = e.valeurs.niveauxHorsSol;
    const base = { champ: 'nb_etages' as const, niveau: 'corps' as const, libelle: 'Étages (R+N)', candidat: `R+${n} → ${n} étage(s)` };
    if (e.divergenceEtages) out.push({ ...base, action: 'ecartee', motif: 'divergence avec la déclaration du pétitionnaire (R+N différent) — non écrit, à corroborer' });
    else if (e.nbCorps !== 1) out.push({ ...base, action: 'ecartee', motif: MOTIF_ATTRIBUTION });
    else if (!ecrivable(e.etatEtages)) out.push({ ...base, action: 'ecartee', motif: occupeMotif(e.etatEtages) });
    else out.push({ ...base, action: 'ecrire', valeurNombre: n });
  }

  // 2. nb_niveaux_sous_sol (corps).
  if (e.valeurs.niveauxSousSol != null) {
    const n = e.valeurs.niveauxSousSol;
    const base = { champ: 'nb_niveaux_sous_sol' as const, niveau: 'corps' as const, libelle: 'Sous-sols', candidat: `${n} niveau(x) de sous-sol` };
    if (e.nbCorps !== 1) out.push({ ...base, action: 'ecartee', motif: MOTIF_ATTRIBUTION });
    else if (!ecrivable(e.etatSousSol)) out.push({ ...base, action: 'ecartee', motif: occupeMotif(e.etatSousSol) });
    else out.push({ ...base, action: 'ecrire', valeurNombre: n });
  }

  // 3. destinations (permis) — mapping explicite vers le CHECK, sinon écartée.
  if (e.valeurs.destination) {
    const mappee = mapperDestinationTeleservice(e.valeurs.destination);
    const base = { champ: 'destinations' as const, niveau: 'permis' as const, libelle: 'Destination', candidat: `« ${e.valeurs.destination} »${mappee ? ` → ${mappee}` : ''}` };
    if (mappee === null) out.push({ ...base, action: 'ecartee', motif: 'destination hors nomenclature réglementaire (CHECK fermé) — jamais forcée' });
    else if (!ecrivable(e.etatDestinations)) out.push({ ...base, action: 'ecartee', motif: occupeMotif(e.etatDestinations) });
    else out.push({ ...base, action: 'ecrire', valeurTexte: [mappee] });
  }

  // 4. surface_plancher_m2 — « Surface créée » ≠ surface de plancher : JAMAIS écrite.
  if (e.valeurs.surfaceCreeeM2 != null) {
    out.push({ champ: 'surface_plancher_m2', niveau: 'permis', libelle: 'Surface', candidat: `Surface créée ${e.valeurs.surfaceCreeeM2} m²`, action: 'ecartee',
      motif: '« Surface créée » (téléservice) ≠ surface de PLANCHER — mesures distinctes, jamais reportée (doctrine LOT 70)' });
  }

  return out;
}
