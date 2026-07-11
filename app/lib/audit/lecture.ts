import 'server-only';
import { lireGrandLivre } from '../analytics/lecture/requete';
import { expressionBucket, filtreFenetre, type Fenetre } from '../analytics/lecture/fenetre';

/**
 * M2 — LOT 7. Lecture d'AUDIT AGRÉGÉ (READ ONLY). Source : `analytics_admin_jour` — compteurs jour × événement
 * (`admin_connexion` / `admin_connexion_echec`) provisionnés au LOT 1, incrémentés par la route de connexion
 * (Lot 7). Ne lit JAMAIS `login_echec` (état de throttle par identifiant) : la vue d'audit est STRICTEMENT
 * agrégée.
 *
 * PÉRIMÈTRE RGPD (SPEC_M2 Q-C=1) : la sortie ne porte QUE des comptes par tranche de TEMPS (bucket) — AUCUN
 * identifiant, AUCUNE IP, AUCUN module, AUCUN détail par personne. Reconstruire un timeline individuel est
 * IMPOSSIBLE : la donnée source elle-même (`analytics_admin_jour`) n'a ni identifiant ni IP.
 *
 * GRAIN : jour/semaine/mois (comme la lecture Lot 4). Pas de grain « heure » : la source est au grain JOUR
 * (`jour_paris date`) — un grain sous-jour n'existe pas au repos (choix anti-timeline, cohérent SPEC_M2 §4).
 */

export interface PointAudit {
  bucket: string; // 'YYYY-MM-DD'
  succes: number; // admin_connexion
  echecs: number; // admin_connexion_echec
}
export interface Audit {
  fenetre: Fenetre;
  serie: PointAudit[];
  totaux: { succes: number; echecs: number };
  pics: { bucket: string; echecs: number }[]; // tranches anormales (échecs ≥ seuil) — agrégées, sans identité
  seuilPic: number; //                          seuil de détection appliqué (transparence)
}

/** Seuil de pic ADAPTATIF (pur, testé) : max(plancher absolu, médiane des échecs non nuls · facteur). */
export function seuilPic(echecs: number[], picMin: number, picFacteur: number): number {
  const nonNuls = echecs.filter((n) => n > 0).sort((a, b) => a - b);
  const mediane = nonNuls.length ? nonNuls[Math.floor((nonNuls.length - 1) / 2)] : 0;
  return Math.max(picMin, Math.round(mediane * picFacteur));
}

/** Tranches anormales : échecs > 0 ET ≥ seuil. Pur, testé. */
export function detecterPics(serie: PointAudit[], seuil: number): { bucket: string; echecs: number }[] {
  return serie.filter((p) => p.echecs > 0 && p.echecs >= seuil).map((p) => ({ bucket: p.bucket, echecs: p.echecs }));
}

/** Config de détection de pic (analytics_config, runtime), repli sûr. */
async function lireConfigPic(): Promise<{ picMin: number; picFacteur: number }> {
  try {
    const rows = await lireGrandLivre<{ cle: string; valeur: string }>(
      `SELECT cle, valeur FROM analytics_config WHERE cle IN ('audit_pic_min','audit_pic_facteur')`,
    );
    const m = new Map(rows.map((x) => [x.cle, Number(x.valeur)]));
    const val = (k: string, d: number) => {
      const v = m.get(k);
      return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d;
    };
    return { picMin: val('audit_pic_min', 20), picFacteur: val('audit_pic_facteur', 3) };
  } catch {
    return { picMin: 20, picFacteur: 3 };
  }
}

/**
 * Assemble l'audit AGRÉGÉ de la fenêtre : succès/échecs par bucket, totaux, pics. Lecture READ ONLY (via
 * `lireGrandLivre`). AUCUN champ par-personne ni IP — la source ne peut pas en porter.
 */
export async function audit(fenetre: Fenetre): Promise<Audit> {
  const { clause, params } = filtreFenetre(fenetre);
  const b = expressionBucket(fenetre.grain);
  const rows = await lireGrandLivre<{ bucket: string; nom: string; n: string }>(
    `SELECT ${b} AS bucket, nom, SUM(n)::bigint AS n FROM analytics_admin_jour
      WHERE nom IN ('admin_connexion', 'admin_connexion_echec') AND ${clause}
      GROUP BY bucket, nom`,
    params,
  );
  const parBucket = new Map<string, PointAudit>();
  const obtenir = (bk: string): PointAudit => {
    let p = parBucket.get(bk);
    if (!p) {
      p = { bucket: bk, succes: 0, echecs: 0 };
      parBucket.set(bk, p);
    }
    return p;
  };
  for (const r of rows) {
    const p = obtenir(r.bucket);
    const n = Number(r.n) || 0;
    if (r.nom === 'admin_connexion') p.succes = n;
    else if (r.nom === 'admin_connexion_echec') p.echecs = n;
  }
  const serie = [...parBucket.values()].sort((a, c) => a.bucket.localeCompare(c.bucket));
  const totaux = serie.reduce((t, p) => ({ succes: t.succes + p.succes, echecs: t.echecs + p.echecs }), { succes: 0, echecs: 0 });
  const cfg = await lireConfigPic();
  const seuil = seuilPic(serie.map((p) => p.echecs), cfg.picMin, cfg.picFacteur);
  return { fenetre, serie, totaux, pics: detecterPics(serie, seuil), seuilPic: seuil };
}
