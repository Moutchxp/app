/**
 * X4 — LECTURE agrégée pour l'onglet « Saisines CADA ». LECTURE SEULE : aucune écriture, aucune règle métier de verdict ici.
 * Réutilise `lireSaisinesEligibles` (saisineCadaRepo) pour les SAISISSABLES + INDÉTERMINÉES (fenêtre CADA + fraîcheur de la
 * relève, sources uniques du calcul), puis classe en TS les saisines déjà matérialisées (une seule requête sur demande_relance
 * type='saisine_cada') : LANCÉES/EN COURS ('envoyee' sans avis), REÇUES (avis_recu_le renseigné), ABANDONNÉES, et la file de
 * dépôt (brouillons — à saisir sur le formulaire quand aucune adresse CADA n'est configurée). Types partagés par la route
 * (serveur) et le rendu (via `import type`, erasés côté client). Lectures INJECTABLES → aggrégateur testable en Node.
 */
import { query } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { lireSaisinesEligibles, type SaisiesEligibles, type DemandeSaisissable } from './saisineCadaRepo';
import { statutSaisine } from './statutCascade'; // lot 5b (B) : libellé de statut lisible, cohérent avec « En cours »
import type { VoieCada } from './echeance';

/** Raison EN CLAIR d'une demande indéterminée : silence non vérifié (relève pas assez fraîche) → pas de saisine possible. */
export const RAISON_INDETERMINEE =
  'La relève des réponses n’est pas assez récente : on ne peut pas encore affirmer que la mairie n’a pas répondu, donc la saisine n’est pas ouverte. Relancer la relève (onglet Réponses) puis revenir.';

/** Une demande SAISISSABLE (fenêtre CADA ouverte + relève fraîche) : de quoi décider ET lancer en un clic. Dates en ISO. */
export interface SaisissableAffichee {
  demandeId: number;
  reference: string;
  communeNom: string | null;
  envoyeLe: string | null;
  refusTaciteLe: string | null;
  forclusionLe: string | null;
  joursAvantForclusion: number;
  voie: VoieCada;                       // T1 : voie d'entrée CADA (refus_expres | refus_tacite) — affichée distinctement
  dossiersDus: number;
  dossiersExclusRefusNonAcquis: number; // T1/Correction 3 : dossiers dus NON inclus au corps (refus pas encore acquis)
  statut: string;                       // lot 5b (B) : « Saisine à lancer »
  numeros: string[];                    // lot 5b (B) : num_dau des dossiers dus (permis)
}
/** Une demande INDÉTERMINÉE : mêmes faits + la RAISON en clair. Pas de bouton (silence non vérifié). */
export interface IndetermineeAffichee extends SaisissableAffichee {
  raison: string;
}
/** Une saisine LANCÉE/EN COURS : envoyée (e-mail ou dépôt manuel), en attente de l'avis de la CADA. */
export interface SaisineEnCours {
  saisineId: number;
  demandeId: number;
  reference: string;
  communeNom: string | null;
  envoyeeLe: string | null;
  statut: string;      // lot 5b (B) : « Saisine envoyée le … » (e-mail) | « Saisine déposée le … » (formulaire)
  numeros: string[];   // lot 5b (B)
}
/** Une saisine dont l'AVIS est revenu (avis_recu_le + sens). */
export interface SaisineRecue {
  saisineId: number;
  demandeId: number;
  reference: string;
  communeNom: string | null;
  envoyeeLe: string | null;
  avisRecuLe: string | null;
  avisSens: string | null;
  statut: string;      // lot 5b (B)
  numeros: string[];   // lot 5b (B)
}
/** Une saisine ABANDONNÉE (trace conservée, ne disparaît pas). */
export interface SaisineAbandonnee {
  saisineId: number;
  demandeId: number;
  reference: string;
  communeNom: string | null;
  genereeLe: string | null;
  statut: string;      // lot 5b (B) : « Saisine abandonnée »
  numeros: string[];   // lot 5b (B)
}
/** Une saisine en BROUILLON à finaliser : dépôt manuel sur le formulaire (aucune adresse CADA) ou envoi resté à faire.
 *  `corps` est fourni pour être COPIÉ tel quel dans le formulaire CADA (le texte stocké est la vérité, cf. X2/X3). */
export interface FileDepotSaisine {
  saisineId: number;
  demandeId: number;
  reference: string;
  communeNom: string | null;
  objet: string;
  corps: string;
  genereeLe: string | null;
  statut: string;      // lot 5b (B) : « Saisine à déposer sur le formulaire » | « Saisine préparée, non envoyée »
  numeros: string[];   // lot 5b (B)
}

export interface SaisinesData {
  cadaEmailVide: boolean;          // true → canal formulaire : la file de dépôt est le mode de saisie normal
  urlFormulaire: string;
  saisissables: SaisissableAffichee[];
  indeterminees: IndetermineeAffichee[];
  enCours: SaisineEnCours[];
  recues: SaisineRecue[];
  abandonnees: SaisineAbandonnee[];
  fileADeposer: FileDepotSaisine[];
}

/** Une ligne brute de demande_relance type='saisine_cada' (jointe à la demande + commune), AVANT classification TS. */
export interface LigneSaisineDB {
  saisine_id: number;
  demande_id: number;
  reference: string;
  commune_nom: string | null;
  statut: string;
  generee_le: string | null;
  envoyee_le: string | null;
  objet: string;
  corps: string;
  avis_recu_le: string | null;
  avis_sens: string | null;
  dus_nums: string[];         // lot 5b (B) : num_dau des dossiers dus
  canal: string | null;       // lot 5b (B) : canal de l'acheminement de l'envoi ('email' = e-mail ; null = dépôt formulaire)
}

export interface DepsSuiviSaisines {
  eligibles(): Promise<SaisiesEligibles>;
  lignes(): Promise<LigneSaisineDB[]>;
  cadaEmail(): Promise<string>;
  urlFormulaire(): Promise<string>;
}

const SQL_LIGNES =
  `SELECT dr.id::int AS saisine_id, dr.demande_id::int AS demande_id, d.reference, c.nom AS commune_nom,
          dr.statut, dr.generee_le::text AS generee_le, dr.envoyee_le::text AS envoyee_le, dr.objet, dr.corps,
          dr.avis_recu_le::text AS avis_recu_le, dr.avis_sens,
          -- lot 5b (B) : num_dau des dossiers dus + canal de l'acheminement de CETTE saisine ('email' vs dépôt formulaire = pas d'acheminement).
          coalesce((SELECT array_agg(s.num_dau ORDER BY s.num_dau) FROM demande_dossier dd JOIN sitadel_dossier s ON s.id = dd.dossier_id
                     WHERE dd.demande_id = d.id AND dd.actif AND dd.satisfait_le IS NULL), '{}') AS dus_nums,
          (SELECT a.canal FROM demande_acheminement a WHERE a.relance_id = dr.id AND a.statut = 'envoye' ORDER BY a.envoye_le DESC LIMIT 1) AS canal
     FROM demande_relance dr
     JOIN demande d ON d.id = dr.demande_id
     LEFT JOIN commune c ON c.code_insee = d.code_insee
    WHERE dr.type = 'saisine_cada'
    ORDER BY dr.generee_le DESC`;

export function depsReellesSuiviSaisines(): DepsSuiviSaisines {
  return {
    eligibles: () => lireSaisinesEligibles(),
    lignes: async () => (await query<LigneSaisineDB>(SQL_LIGNES)).rows,
    cadaEmail: async () => (await chargerConfigVeille()).cadaEmail,
    urlFormulaire: async () => (await chargerConfigVeille()).cadaUrlFormulaire,
  };
}

/** Date d'une valeur (Date issue du moteur) en ISO, ou null. Les colonnes SQL sont déjà des strings (::text). */
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
function versAffichee(d: DemandeSaisissable, cadaEmailVide: boolean): SaisissableAffichee {
  return {
    demandeId: d.demandeId, reference: d.reference, communeNom: d.communeNom,
    envoyeLe: iso(d.envoyeLe), refusTaciteLe: iso(d.refusTaciteLe), forclusionLe: iso(d.forclusionLe),
    joursAvantForclusion: d.joursAvantForclusion, voie: d.voie, dossiersDus: d.dossiersDus,
    dossiersExclusRefusNonAcquis: d.dossiersExclusRefusNonAcquis,
    statut: statutSaisine({ materialisee: false, cadaEmailVide }), numeros: d.numeros, // lot 5b (B) : « Saisine à lancer »
  };
}

/** Charge tout l'onglet « Saisines CADA » en une passe. LECTURE SEULE. La classification (statut/avis) est faite EN TS. */
export async function chargerSuiviSaisines(deps: DepsSuiviSaisines = depsReellesSuiviSaisines()): Promise<SaisinesData> {
  const [elig, lignes, cadaEmail, urlFormulaire] = await Promise.all([deps.eligibles(), deps.lignes(), deps.cadaEmail(), deps.urlFormulaire()]);
  const cadaEmailVide = cadaEmail.trim() === '';

  const enCours: SaisineEnCours[] = [];
  const recues: SaisineRecue[] = [];
  const abandonnees: SaisineAbandonnee[] = [];
  const fileADeposer: FileDepotSaisine[] = [];
  for (const l of lignes) {
    const socle = { saisineId: l.saisine_id, demandeId: l.demande_id, reference: l.reference, communeNom: l.commune_nom, numeros: l.dus_nums ?? [] };
    // lot 5b (B) — statut lisible dérivé (matérialisée) : e-mail parti vs dépôt formulaire (canal), brouillon selon adresse CADA.
    const statut = statutSaisine({ materialisee: true, statut: l.statut, canal: l.canal, envoyeeLe: l.envoyee_le, cadaEmailVide });
    if (l.statut === 'brouillon') {
      fileADeposer.push({ ...socle, objet: l.objet, corps: l.corps, genereeLe: l.generee_le, statut });
    } else if (l.statut === 'abandonnee') {
      abandonnees.push({ ...socle, genereeLe: l.generee_le, statut });
    } else if (l.statut === 'envoyee') {
      if (l.avis_recu_le !== null) recues.push({ ...socle, envoyeeLe: l.envoyee_le, avisRecuLe: l.avis_recu_le, avisSens: l.avis_sens, statut });
      else enCours.push({ ...socle, envoyeeLe: l.envoyee_le, statut });
    }
  }

  return {
    cadaEmailVide,
    urlFormulaire,
    saisissables: elig.saisissables.map((d) => versAffichee(d, cadaEmailVide)),
    indeterminees: elig.indeterminees.map((d) => ({ ...versAffichee(d, cadaEmailVide), raison: RAISON_INDETERMINEE })),
    enCours,
    recues,
    abandonnees,
    fileADeposer,
  };
}
