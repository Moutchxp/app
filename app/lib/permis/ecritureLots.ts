/**
 * N8-B — DÉPÔT D'ÉCRITURE des faits ÉNONCÉS par lot (voie b). IMPUR (base). Consomme une `DecisionLots` (pure) et l'applique :
 * renomme/crée les corps par lot, écrit ce que le document énonce, déplace le sommet au niveau PERMIS. Journal sous
 * methode='enonce' — que le recompute `permis:ecrire-champs` NE purge PAS (il ne touche que 'motifs'/'cerfa') → recompute inoffensif.
 *
 * 🔒 RÈGLES : l'invariant « une saisie n'est jamais écrasée » est celui du dépôt existant (`ecrireCorps`, mode 'extraite'),
 * RÉUTILISÉ. Idempotent : purge 'enonce' + réutilisation des corps par repère (renomme un corps anonyme, ne recrée pas). On
 * n'invente aucune valeur : un champ non écrit laisse une ligne 'ecartee' avec son motif.
 */
import { query } from '../db/client';
import { lirePermisCaracteristiques, creerCorps, definirRepere, ecrireCorps, type ValeursCorps } from './caracteristiquesRepo';
import type { DecisionLots } from './decisionLots';

const MOTIF_SAISIE = 'une valeur saisie à la main occupe déjà le champ (non écrasée)';
/**
 * N10-S — DOMAINE des champs que CE writer pose au journal (methode='enonce'). SOURCE UNIQUE : la purge idempotente s'y LIMITE. Sans
 * ce filtre, elle effacerait la trace 'enonce' d'un AUTRE writer partageant la méthode (la désignation, les lignes de niveaux). La
 * garde dans `journaliser` interdit d'écrire un champ hors de ce domaine — sinon la purge le laisserait fantôme. Ajouter un champ ⇒ ICI.
 */
const CHAMPS_ENONCE: readonly string[] = ['nb_etages', 'nb_niveaux_sous_sol', 'altitude_dernier_plancher_ngf', 'altitude_sommet_ngf'];
export interface ResultatEcritureLots { corps: { repere: string; corpsId: number; cree: boolean; ecrits: string[] }[]; sommetPermisEcrit: boolean }

type Role = 'retenue' | 'ecartee';
interface Ligne { corpsId: number | null; champ: string; valeur: number | null; unite: 'ngf' | null; role: Role; confiance: 'confirmee' | 'a_verifier' | null; reserve: string | null; motif: string | null; piece: string | null; page: number | null; extrait: string | null }

async function journaliser(dossierId: number, lignes: Ligne[]): Promise<void> {
  for (const l of lignes) {
    if (!CHAMPS_ENONCE.includes(l.champ)) throw new Error(`ecritureLots : champ '${l.champ}' hors du domaine 'enonce' déclaré (CHAMPS_ENONCE) — l'y ajouter, sinon la purge le laisse fantôme`);
    await query(
      `INSERT INTO permis_extraction_journal
         (dossier_id, corps_id, champ, valeur, unite, role, methode, confiance, reserve, motif, piece, page, extrait, extrait_le)
       VALUES ($1, $2, $3, $4, $5, $6, 'enonce', $7, $8, $9, $10, $11, $12, now())`,
      [dossierId, l.corpsId, l.champ, l.valeur, l.unite, l.role, l.confiance, l.reserve, l.motif, l.piece, l.page, l.extrait],
    );
  }
}

/** Applique la décision. `majPar` identifie l'auteur. */
export async function ecrireLots(dossierId: number, decision: DecisionLots, majPar: string): Promise<ResultatEcritureLots> {
  // Recompute idempotent SCOPÉ à ce writer (N10-S) : ne touche jamais la trace 'enonce' de la désignation ni des niveaux.
  await query(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1 AND methode = 'enonce' AND champ = ANY($2::text[])`, [dossierId, CHAMPS_ENONCE]);
  const { corps } = await lirePermisCaracteristiques(dossierId);
  const parRepere = new Map<string, number>(corps.filter((c) => c.repere).map((c) => [c.repere as string, c.id]));
  const libres = corps.filter((c) => c.repere === null).map((c) => c.id); // corps anonymes à renommer avant d'en créer

  const lignes: Ligne[] = [];
  const resCorps: ResultatEcritureLots['corps'] = [];

  for (const lot of decision.lots) {
    let corpsId: number, cree = false;
    if (parRepere.has(lot.repere)) corpsId = parRepere.get(lot.repere)!;
    else if (libres.length) { corpsId = libres.shift()!; await definirRepere(corpsId, lot.repere, majPar); parRepere.set(lot.repere, corpsId); }
    else { corpsId = await creerCorps(dossierId, lot.repere, majPar); cree = true; parRepere.set(lot.repere, corpsId); }

    // Valeurs : sommet RETIRÉ du corps (→ niveau permis) ; nb_etages / sous-sol / plancher (lot le plus haut) posés.
    const valeurs: ValeursCorps = { altitudeSommetNgf: null };
    if (lot.nbEtages) (valeurs as Record<string, number>).nbEtages = lot.nbEtages.valeur;
    if (lot.nbSousSol) (valeurs as Record<string, number>).nbNiveauxSousSol = lot.nbSousSol.valeur;
    if (lot.plancher) (valeurs as Record<string, number>).altitudeDernierPlancherNgf = lot.plancher.valeur;
    const res = await ecrireCorps(corpsId, valeurs, 'extraite', majPar);
    const ecrit = (cle: string) => (res.ecrits as string[]).includes(cle);
    const s0 = (arr: { piece: string; page: number; extrait: string }[]) => arr[0] ?? null;

    if (lot.nbEtages) lignes.push(ecrit('nbEtages')
      ? { corpsId, champ: 'nb_etages', valeur: lot.nbEtages.valeur, unite: null, role: 'retenue', confiance: lot.nbEtages.confiance, reserve: null, motif: null, piece: s0(lot.nbEtages.sources)?.piece ?? null, page: s0(lot.nbEtages.sources)?.page ?? null, extrait: s0(lot.nbEtages.sources)?.extrait ?? null }
      : { corpsId, champ: 'nb_etages', valeur: null, unite: null, role: 'ecartee', confiance: null, reserve: null, motif: MOTIF_SAISIE, piece: null, page: null, extrait: null });
    if (lot.nbSousSol) lignes.push(ecrit('nbNiveauxSousSol')
      ? { corpsId, champ: 'nb_niveaux_sous_sol', valeur: 1, unite: null, role: 'retenue', confiance: lot.nbSousSol.confiance, reserve: lot.nbSousSol.note ?? null, motif: null, piece: s0(lot.nbSousSol.sources)?.piece ?? null, page: s0(lot.nbSousSol.sources)?.page ?? null, extrait: s0(lot.nbSousSol.sources)?.extrait ?? null }
      : { corpsId, champ: 'nb_niveaux_sous_sol', valeur: null, unite: null, role: 'ecartee', confiance: null, reserve: null, motif: MOTIF_SAISIE, piece: null, page: null, extrait: null });
    if (lot.plancher) lignes.push(ecrit('altitudeDernierPlancherNgf')
      ? { corpsId, champ: 'altitude_dernier_plancher_ngf', valeur: lot.plancher.valeur, unite: 'ngf', role: 'retenue', confiance: 'a_verifier', reserve: lot.plancher.motif, motif: null, piece: s0(lot.plancher.sources)?.piece ?? null, page: s0(lot.plancher.sources)?.page ?? null, extrait: s0(lot.plancher.sources)?.extrait ?? null }
      : { corpsId, champ: 'altitude_dernier_plancher_ngf', valeur: null, unite: null, role: 'ecartee', confiance: null, reserve: null, motif: MOTIF_SAISIE, piece: null, page: null, extrait: null });
    else if (lot.plancherMotif) lignes.push({ corpsId, champ: 'altitude_dernier_plancher_ngf', valeur: null, unite: null, role: 'ecartee', confiance: null, reserve: null, motif: lot.plancherMotif, piece: null, page: null, extrait: null });
    lignes.push({ corpsId, champ: 'altitude_sommet_ngf', valeur: null, unite: null, role: 'ecartee', confiance: null, reserve: null, motif: lot.sommetMotif, piece: null, page: null, extrait: null });

    resCorps.push({ repere: lot.repere, corpsId, cree, ecrits: res.ecrits });
  }

  // Sommet au niveau PERMIS (invariant : ne pas écraser une saisie).
  let sommetPermisEcrit = false;
  if (decision.sommetPermis) {
    const { rows } = await query<{ o: string | null }>(`SELECT altitude_sommet_ngf_origine AS o FROM permis_caracteristique WHERE dossier_id = $1`, [dossierId]);
    if ((rows[0]?.o ?? null) === 'saisie') {
      lignes.push({ corpsId: null, champ: 'altitude_sommet_ngf', valeur: null, unite: null, role: 'ecartee', confiance: null, reserve: null, motif: MOTIF_SAISIE, piece: null, page: null, extrait: null });
    } else {
      await query(
        `INSERT INTO permis_caracteristique (dossier_id, altitude_sommet_ngf, altitude_sommet_ngf_origine, maj_le, maj_par)
         VALUES ($1, $2, 'extraite', now(), $3)
         ON CONFLICT (dossier_id) DO UPDATE SET altitude_sommet_ngf = $2, altitude_sommet_ngf_origine = 'extraite', maj_le = now(), maj_par = $3`,
        [dossierId, decision.sommetPermis.valeur, majPar]);
      lignes.push({ corpsId: null, champ: 'altitude_sommet_ngf', valeur: decision.sommetPermis.valeur, unite: 'ngf', role: 'retenue', confiance: 'a_verifier', reserve: decision.sommetPermis.reserve, motif: null, piece: decision.sommetPermis.source.piece, page: decision.sommetPermis.source.page, extrait: decision.sommetPermis.source.extrait });
      sommetPermisEcrit = true;
    }
  }

  await journaliser(dossierId, lignes);
  return { corps: resCorps, sommetPermisEcrit };
}
