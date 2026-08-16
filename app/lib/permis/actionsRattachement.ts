/**
 * FUS-3e — ACTIONS de décision d'un dossier de rattachement : VALIDER (avec injection des altitudes), REFUSER, RETOUR LiDAR.
 * IMPUR (base), atomique (withTransaction). Passe TOUJOURS par le module PUR `preseanceAltitude` (jamais de logique réécrite).
 * Chaque action écrit une ligne d'ÉVÉNEMENT append-only (qui, quand, quoi, avant, après). NE TOUCHE PAS au moteur de verdict SVAV
 * (celui-ci ne lit toujours PAS permis_polygone_altitude — injecter ne change pas encore le verdict).
 *
 * 🔴 PRÉSÉANCE INVERSÉE (déjà en place, cf. preseanceAltitude) : une altitude 'permis' DOIT pouvoir être écrasée par une mesure
 * LiDAR ultérieure. On NE protège PAS 'permis'. À l'injection, on REFIGE la LiDAR COURANTE (relue en base), PAS le snapshot
 * d'analyse (périmé si BD TOPO a été remesurée) — c'est ce qui rend le retour arrière fiable.
 */
import { withTransaction, type RequeteTx } from '../db/client';
import { appliquerPreseanceAltitude, type EtatAltitudePolygone } from './preseanceAltitude';
import { lireAffectation } from './affectationRepo';

export interface ResultatAction {
  ok: boolean;
  besoinConfirmation?: boolean;   // validation d'une cardinalité incohérente → un motif de confirmation est requis
  avertissement?: string;
  motif?: string;                 // motif d'échec, ou motif de confirmation retenu
  nbInjectes?: number;
  nbRestaures?: number;
}

/** État d'altitude courant d'un polygone (permis_polygone_altitude), ou état vide s'il n'existe pas encore. */
async function etatAltitude(q: RequeteTx, cleabs: string): Promise<EtatAltitudePolygone> {
  const { rows } = await q<{ altitude_ngf: string | number | null; altitude_origine: 'lidar' | 'permis' | null; altitude_lidar_refige: string | number | null }>(
    `SELECT altitude_ngf, altitude_origine, altitude_lidar_refige FROM permis_polygone_altitude WHERE cleabs = $1`, [cleabs]);
  const r = rows[0];
  if (!r) return { altitudeNgf: null, origine: null, altitudeLidarRefige: null };
  return {
    altitudeNgf: r.altitude_ngf == null ? null : Number(r.altitude_ngf),
    origine: r.altitude_origine,
    altitudeLidarRefige: r.altitude_lidar_refige == null ? null : Number(r.altitude_lidar_refige),
  };
}

/** 🔴 Altitude LiDAR COURANTE d'un polygone : relue en base (batiment.altitude_maximale_toit), PAS le snapshot d'analyse. */
async function lidarCourant(q: RequeteTx, cleabs: string): Promise<number | null> {
  const { rows } = await q<{ alt: string | number | null }>(
    `SELECT altitude_maximale_toit AS alt FROM batiment WHERE cleabs = $1 ORDER BY altitude_maximale_toit DESC NULLS LAST LIMIT 1`, [cleabs]);
  return rows[0]?.alt == null ? null : Number(rows[0].alt);
}

async function rattId(q: RequeteTx, dossierId: number): Promise<number | null> {
  const { rows } = await q<{ id: number }>(`SELECT id FROM permis_rattachement WHERE dossier_id = $1`, [dossierId]);
  return rows[0]?.id ?? null;
}

async function evenement(q: RequeteTx, rid: number, type: string, ancien: string | null, nouvel: string | null, details: unknown, par: string): Promise<void> {
  await q(`INSERT INTO permis_rattachement_evenement (rattachement_id, type, ancien_etat, nouvel_etat, details, par)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6)`, [rid, type, ancien, nouvel, JSON.stringify(details), par]);
}

const upsertAltitude = (q: RequeteTx, cleabs: string, e: EtatAltitudePolygone, dossierId: number, par: string) =>
  q(`INSERT INTO permis_polygone_altitude (cleabs, altitude_ngf, altitude_origine, altitude_lidar_refige, altitude_lidar_refige_le, dossier_id, maj_le, maj_par)
       VALUES ($1, $2, $3, $4, now(), $5, now(), $6)
       ON CONFLICT (cleabs) DO UPDATE SET altitude_ngf = EXCLUDED.altitude_ngf, altitude_origine = EXCLUDED.altitude_origine,
         altitude_lidar_refige = EXCLUDED.altitude_lidar_refige, altitude_lidar_refige_le = EXCLUDED.altitude_lidar_refige_le,
         dossier_id = EXCLUDED.dossier_id, maj_le = now(), maj_par = EXCLUDED.maj_par`,
    [cleabs, e.altitudeNgf, e.origine, e.altitudeLidarRefige, dossierId, par]);

/**
 * VALIDER : injecte l'altitude de sommet de chaque corps affecté dans permis_polygone_altitude (origine 'permis'), après avoir
 * REFIGÉ la LiDAR courante (retour arrière fiable), puis passe le dossier à « valide ». GARDE cardinalité : s'il reste des
 * polygones non affectés ou des corps sans polygone, exige un `confirmationMotif` (écrit au dossier via l'événement).
 */
export async function validerRattachement(dossierId: number, valPar: string, confirmationMotif?: string): Promise<ResultatAction> {
  const aff = await lireAffectation(dossierId);
  if (aff.colonneManquante) return { ok: false, motif: 'affectation indisponible : migration 117 non appliquée' };

  const nonAffectes = aff.polygones.filter((p) => p.cleabs && !aff.corps.some((c) => c.cleabsAffecte === p.cleabs));
  const corpsSansPoly = aff.corps.filter((c) => !c.cleabsAffecte);
  const incoherent = nonAffectes.length > 0 || corpsSansPoly.length > 0;
  const motifConf = confirmationMotif?.trim() || '';
  if (incoherent && !motifConf) {
    return { ok: false, besoinConfirmation: true, avertissement: `${nonAffectes.length} polygone(s) non affecté(s), ${corpsSansPoly.length} corps sans polygone : confirmez la validation avec un motif.` };
  }

  const aInjecter = aff.corps.filter((c) => c.cleabsAffecte && c.altitudeSommetNgf !== null)
    .map((c) => ({ corpsId: c.id, cleabs: c.cleabsAffecte as string, altitudePermis: c.altitudeSommetNgf as number }));

  return withTransaction(async (q) => {
    const rid = await rattId(q, dossierId);
    if (rid === null) return { ok: false, motif: 'aucun dossier de rattachement — lancez d’abord le suivi' };

    let nbInjectes = 0;
    for (const inj of aInjecter) {
      const avant = await etatAltitude(q, inj.cleabs);
      const lidar = await lidarCourant(q, inj.cleabs); // 🔴 relire la LiDAR COURANTE, pas le snapshot
      const res = appliquerPreseanceAltitude(avant, { type: 'injection_permis', altitudePermis: inj.altitudePermis, altitudeLidarActuelle: lidar });
      await upsertAltitude(q, inj.cleabs, res.etat, dossierId, valPar);
      await evenement(q, rid, 'ecrasement_altitude', null, null, {
        cleabs: inj.cleabs, corpsId: inj.corpsId,
        avant: { altitude: avant.altitudeNgf, origine: avant.origine },
        apres: { altitude: res.etat.altitudeNgf, origine: res.etat.origine },
        lidarRefige: res.etat.altitudeLidarRefige, trace: res.trace,
      }, valPar);
      nbInjectes++;
    }

    const { rows: before } = await q<{ etat: string }>(`SELECT etat FROM permis_rattachement WHERE id = $1`, [rid]);
    await q(`UPDATE permis_rattachement SET etat = 'valide', valide_par = $2, valide_le = now(), reevalue_le = now() WHERE id = $1`, [rid, valPar]);
    await evenement(q, rid, 'validation', before[0]?.etat ?? null, 'valide', {
      nbInjectes, confirmationMotif: motifConf || null,
      polygonesNonAffectes: nonAffectes.map((p) => p.repere), corpsSansPolygone: corpsSansPoly.map((c) => c.repere ?? String(c.id)),
    }, valPar);
    return { ok: true, nbInjectes, motif: motifConf || undefined };
  });
}

/** REFUSER : passe le dossier à « refuse » avec qui/quand et un MOTIF OBLIGATOIRE. Aucune altitude n'est touchée. */
export async function refuserRattachement(dossierId: number, refPar: string, motif: string): Promise<ResultatAction> {
  const m = (motif ?? '').trim();
  if (!m) return { ok: false, motif: 'un motif de refus est obligatoire' };
  return withTransaction(async (q) => {
    const rid = await rattId(q, dossierId);
    if (rid === null) return { ok: false, motif: 'aucun dossier de rattachement — lancez d’abord le suivi' };
    const { rows: before } = await q<{ etat: string }>(`SELECT etat FROM permis_rattachement WHERE id = $1`, [rid]);
    await q(`UPDATE permis_rattachement SET etat = 'refuse', refuse_par = $2, refuse_le = now(), refus_motif = $3, reevalue_le = now() WHERE id = $1`, [rid, refPar, m]);
    await evenement(q, rid, 'refus', before[0]?.etat ?? null, 'refuse', { motif: m }, refPar);
    return { ok: true };
  });
}

/**
 * RETOUR aux caractéristiques LiDAR d'origine : pour chaque polygone du dossier dont l'altitude est d'origine 'permis', restaure
 * la LiDAR refigée et remet altitude_origine = 'lidar'. Reste possible APRÈS une validation (filet en cas d'erreur d'affectation).
 * Via preseanceAltitude (retour_arriere). N'altère PAS l'état du dossier (seulement les altitudes) ; trace chaque restauration.
 */
export async function retourLidar(dossierId: number, par: string): Promise<ResultatAction> {
  return withTransaction(async (q) => {
    const rid = await rattId(q, dossierId);
    if (rid === null) return { ok: false, motif: 'aucun dossier de rattachement' };
    // Polygones affectés aux corps de CE permis, actuellement en origine 'permis'.
    const { rows } = await q<{ cleabs: string }>(
      `SELECT ppa.cleabs FROM permis_polygone_altitude ppa
        WHERE ppa.altitude_origine = 'permis'
          AND ppa.cleabs IN (SELECT cleabs_affecte FROM permis_corps_batiment WHERE dossier_id = $1 AND cleabs_affecte IS NOT NULL)`,
      [dossierId]);
    let nbRestaures = 0;
    for (const { cleabs } of rows) {
      const avant = await etatAltitude(q, cleabs);
      const res = appliquerPreseanceAltitude(avant, { type: 'retour_arriere' });
      if (res.effet === 'sans_effet') continue; // rien de refigé → on ne touche pas
      await upsertAltitude(q, cleabs, res.etat, dossierId, par);
      await evenement(q, rid, 'retour_altitude', null, null, {
        cleabs, avant: { altitude: avant.altitudeNgf, origine: avant.origine },
        apres: { altitude: res.etat.altitudeNgf, origine: res.etat.origine }, trace: res.trace,
      }, par);
      nbRestaures++;
    }
    return { ok: true, nbRestaures };
  });
}
