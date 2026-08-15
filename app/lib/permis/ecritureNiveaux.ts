/**
 * N9-B — DÉPÔT D'ÉCRITURE des caractéristiques par corps dérivées du TABLEAU DE NIVEAUX (coupe), source STRUCTURÉE qui PRIME sur les
 * cotes isolées. IMPUR (base). Consomme une `DecisionNiveaux` (pure) et l'applique. Journal sous methode='enonce' — que le recompute
 * `permis:ecrire-champs` NE purge PAS (isolé). SUPERSÈDE le dépôt N8-B `ecritureLots` : mêmes champs, mais attribués PAR BÂTIMENT
 * depuis la table (là où le chaînage N8-B avait mis le R07 de 2D2 (82,93) sur 2D1). ⚠️ Ne PAS enchaîner `ecrire-lots` après :
 * les deux partagent methode='enonce', le dernier passage gagne.
 *
 * 🔒 RÈGLES : invariant « une saisie n'est jamais écrasée » réutilisé (`ecrireCorps` mode 'extraite'). Idempotent (purge 'enonce' +
 * réutilisation des corps par repère). Aucune valeur inventée : un corps sans table reste vide avec son motif. CORRECTION : quand la
 * nouvelle valeur diffère de celle déjà en base, la ligne de journal le DIT (ancienne → nouvelle). Le garde-corps (ajouré) n'est
 * jamais le sommet mais est journalisé écarté. Le sommet permis N8-B (89,46) devient sans objet (attribué) → effacé + journalisé.
 * Aucune migration : colonnes et methode existantes.
 */
import { query } from '../db/client';
import { lirePermisCaracteristiques, creerCorps, definirRepere, ecrireCorps, type ValeursCorps, type CorpsBatiment } from './caracteristiquesRepo';
import type { DecisionNiveaux, SourceRef } from './decisionNiveaux';

const MOTIF_SAISIE = 'une valeur saisie à la main occupe déjà le champ (non écrasée)';
export interface ResultatEcritureNiveaux {
  corps: { repere: string; corpsId: number; cree: boolean; ecrits: string[]; corrections: string[] }[];
  sommetPermisEfface: boolean;
}

type Role = 'retenue' | 'ecartee';
interface Ligne { corpsId: number | null; champ: string; valeur: number | null; unite: 'ngf' | null; role: Role; confiance: 'confirmee' | 'a_verifier' | null; reserve: string | null; motif: string | null; piece: string | null; page: number | null; extrait: string | null }

async function journaliser(dossierId: number, lignes: Ligne[]): Promise<void> {
  for (const l of lignes) {
    await query(
      `INSERT INTO permis_extraction_journal
         (dossier_id, corps_id, champ, valeur, unite, role, methode, confiance, reserve, motif, piece, page, extrait, extrait_le)
       VALUES ($1, $2, $3, $4, $5, $6, 'enonce', $7, $8, $9, $10, $11, $12, now())`,
      [dossierId, l.corpsId, l.champ, l.valeur, l.unite, l.role, l.confiance, l.reserve, l.motif, l.piece, l.page, l.extrait],
    );
  }
}

const s0 = (arr: SourceRef[]): SourceRef | null => arr[0] ?? null;
const extraitDe = (s: SourceRef | null, txt: string): string | null => (s ? `${txt} (${s.piece} p.${s.page})` : null);

/** Applique la décision « tableaux de niveaux ». `majPar` identifie l'auteur. */
export async function ecrireNiveaux(dossierId: number, decision: DecisionNiveaux, majPar: string): Promise<ResultatEcritureNiveaux> {
  await query(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1 AND methode = 'enonce'`, [dossierId]); // recompute idempotent (ciblé)
  const { corps, global } = await lirePermisCaracteristiques(dossierId);
  const parRepere = new Map<string, number>(corps.filter((c) => c.repere).map((c) => [c.repere as string, c.id]));
  const libres = corps.filter((c) => c.repere === null).map((c) => c.id);
  const ancien = new Map<number, CorpsBatiment>(corps.map((c) => [c.id, c]));

  const lignes: Ligne[] = [];
  const resCorps: ResultatEcritureNiveaux['corps'] = [];

  for (const c of decision.corps) {
    let corpsId: number, cree = false;
    if (parRepere.has(c.repere)) corpsId = parRepere.get(c.repere)!;
    else if (libres.length) { corpsId = libres.shift()!; await definirRepere(corpsId, c.repere, majPar); parRepere.set(c.repere, corpsId); }
    else { corpsId = await creerCorps(dossierId, c.repere, majPar); cree = true; parRepere.set(c.repere, corpsId); }
    const avant = ancien.get(corpsId) ?? null;
    const corrections: string[] = [];

    const valeurs: ValeursCorps = {};
    if (c.nbEtages) (valeurs as Record<string, number>).nbEtages = c.nbEtages.valeur;
    if (c.nbSousSol) (valeurs as Record<string, number>).nbNiveauxSousSol = c.nbSousSol.valeur;
    if (c.plancher) (valeurs as Record<string, number>).altitudeDernierPlancherNgf = c.plancher.valeur;
    if (c.sommet) (valeurs as Record<string, number>).altitudeSommetNgf = c.sommet.valeur;
    const res = await ecrireCorps(corpsId, valeurs, 'extraite', majPar);
    const ecrit = (cle: string) => (res.ecrits as string[]).includes(cle);

    // nb_etages (+ tension éventuelle en réserve)
    if (c.nbEtages) lignes.push(ecrit('nbEtages')
      ? { corpsId, champ: 'nb_etages', valeur: c.nbEtages.valeur, unite: null, role: 'retenue', confiance: c.nbEtages.confiance, reserve: c.nbEtages.tension, motif: null, piece: s0(c.nbEtages.sources)?.piece ?? null, page: s0(c.nbEtages.sources)?.page ?? null, extrait: extraitDe(s0(c.nbEtages.sources), `${c.nbEtages.valeur} niveaux R0n dans la table BAT ${c.repere}`) }
      : { corpsId, champ: 'nb_etages', valeur: null, unite: null, role: 'ecartee', confiance: null, reserve: null, motif: MOTIF_SAISIE, piece: null, page: null, extrait: null });

    // nb_niveaux_sous_sol
    if (c.nbSousSol) lignes.push(ecrit('nbNiveauxSousSol')
      ? { corpsId, champ: 'nb_niveaux_sous_sol', valeur: c.nbSousSol.valeur, unite: null, role: 'retenue', confiance: c.nbSousSol.confiance, reserve: 'partage commun/séparé non déterminé', motif: null, piece: s0(c.nbSousSol.sources)?.piece ?? null, page: s0(c.nbSousSol.sources)?.page ?? null, extrait: extraitDe(s0(c.nbSousSol.sources), `SS dans la table BAT ${c.repere}`) }
      : { corpsId, champ: 'nb_niveaux_sous_sol', valeur: null, unite: null, role: 'ecartee', confiance: null, reserve: null, motif: MOTIF_SAISIE, piece: null, page: null, extrait: null });

    // altitude_dernier_plancher_ngf — CORRECTION explicite si la valeur en base diffère
    if (c.plancher) {
      const avantV = avant?.altitudeDernierPlancherNgf ?? null;
      const corrige = avantV !== null && Math.abs(avantV - c.plancher.valeur) > 1e-9;
      if (corrige) corrections.push(`plancher ${avantV} → ${c.plancher.valeur} (l'ancienne valeur était le ${c.plancher.label} d'un AUTRE corps ; attribution par bâtiment via la table)`);
      lignes.push(ecrit('altitudeDernierPlancherNgf')
        ? { corpsId, champ: 'altitude_dernier_plancher_ngf', valeur: c.plancher.valeur, unite: 'ngf', role: 'retenue', confiance: c.plancher.confiance, reserve: corrige ? `corrige ${avantV} (était le R07 d'un autre corps)` : null, motif: null, piece: s0(c.plancher.sources)?.piece ?? null, page: s0(c.plancher.sources)?.page ?? null, extrait: extraitDe(s0(c.plancher.sources), `${c.plancher.label} = ${c.plancher.valeur} (table BAT ${c.repere})`) }
        : { corpsId, champ: 'altitude_dernier_plancher_ngf', valeur: null, unite: null, role: 'ecartee', confiance: null, reserve: null, motif: MOTIF_SAISIE, piece: null, page: null, extrait: null });
    }

    // altitude_sommet_ngf — acrotère ou toiture (jamais garde-corps)
    if (c.sommet) {
      const avantV = avant?.altitudeSommetNgf ?? null;
      const corrige = avantV !== null && Math.abs(avantV - c.sommet.valeur) > 1e-9;
      if (corrige) corrections.push(`sommet ${avantV} → ${c.sommet.valeur} (${c.sommet.label})`);
      lignes.push(ecrit('altitudeSommetNgf')
        ? { corpsId, champ: 'altitude_sommet_ngf', valeur: c.sommet.valeur, unite: 'ngf', role: 'retenue', confiance: c.sommet.confiance, reserve: `${c.sommet.label}${c.sommet.note ? ` — ${c.sommet.note}` : ''}`, motif: null, piece: s0(c.sommet.sources)?.piece ?? null, page: s0(c.sommet.sources)?.page ?? null, extrait: extraitDe(s0(c.sommet.sources), `${c.sommet.label} = ${c.sommet.valeur} (BAT ${c.repere})`) }
        : { corpsId, champ: 'altitude_sommet_ngf', valeur: null, unite: null, role: 'ecartee', confiance: null, reserve: null, motif: MOTIF_SAISIE, piece: null, page: null, extrait: null });
    }
    // garde-corps : jamais retenu comme sommet (ajouré : ni mesuré au LiDAR ni masquant) → journalisé écarté avec son étiquette
    for (const g of c.gardeCorps) lignes.push({ corpsId, champ: 'altitude_sommet_ngf', valeur: g.cote, unite: 'ngf', role: 'ecartee', confiance: null, reserve: null, motif: `garde-corps à lisse (ajouré : ni mesuré par le MNS LiDAR ni masquant) — jamais retenu comme sommet`, piece: g.pieces[0] ?? null, page: null, extrait: `garde-corps = ${g.cote}` });

    resCorps.push({ repere: c.repere, corpsId, cree, ecrits: res.ecrits, corrections });
  }

  // Niveau PERMIS : le sommet 89,46 de N8-B est désormais ATTRIBUÉ (garde-corps de 2D1) → sans objet. On EFFACE (invariant : jamais
  // une saisie) et on journalise la réattribution, pour ne pas laisser une valeur ni une réserve devenues fausses.
  let sommetPermisEfface = false;
  const gca = decision.gardeCorpsAttribue;
  if (gca && global && global.altitudeSommetNgf !== null) {
    if (global.altitudeSommetNgfOrigine === 'saisie') {
      lignes.push({ corpsId: null, champ: 'altitude_sommet_ngf', valeur: null, unite: null, role: 'ecartee', confiance: null, reserve: null, motif: MOTIF_SAISIE, piece: null, page: null, extrait: null });
    } else {
      await query(`UPDATE permis_caracteristique SET altitude_sommet_ngf = NULL, altitude_sommet_ngf_origine = NULL, maj_le = now(), maj_par = $2 WHERE dossier_id = $1`, [dossierId, majPar]);
      lignes.push({ corpsId: null, champ: 'altitude_sommet_ngf', valeur: null, unite: null, role: 'ecartee', confiance: null, reserve: null,
        motif: `effacé : ${gca.cote} est le garde-corps à lisse de ${gca.repere}, désormais ATTRIBUÉ (donc plus « non rattachable ») ; garde-corps ajouré, jamais un sommet — le sommet vit maintenant par corps`, piece: null, page: null, extrait: null });
      sommetPermisEfface = true;
    }
  }

  await journaliser(dossierId, lignes);
  return { corps: resCorps, sommetPermisEfface };
}
