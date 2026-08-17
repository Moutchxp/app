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
import { journalActif, enregistrerLigneJournal, derniereLigne, dateModifBatiment } from './journalAltitude';
import { millesimeEditionCourante, MILLESIME_INCONNU } from './editionBdTopo';

export interface ResultatAction {
  ok: boolean;
  besoinConfirmation?: boolean;   // validation d'une cardinalité incohérente → un motif de confirmation est requis
  avertissement?: string;
  motif?: string;                 // motif d'échec, ou motif de confirmation retenu
  nbInjectes?: number;
  nbRestaures?: number;
  nbTraites?: number;             // import BD TOPO : nb de cleabs suivis parcourus
  nbEcrases?: number;             // import/mesure LiDAR : nb d'altitudes 'permis' écrasées → dossiers annulés par LiDAR
}

/** Provenance d'une mesure LiDAR — OBLIGATOIRE (pièce de preuve) : millésime d'édition + source. Refus si l'un manque. */
export interface ProvenanceMesure { millesime: string; source: string }

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
    const jActif = await journalActif(q); // registre disponible ? (migration 118 appliquée)
    // BDT-2 : millésime de l'édition BD TOPO courante pour la ligne de départ 'lidar' ; 'inconnu' tant que la 120 n'est pas stampée.
    const milEdition = jActif ? await millesimeEditionCourante(q) : MILLESIME_INCONNU;

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
      // REGISTRE append-only : la LiDAR qu'on écrase NE DOIT PAS être perdue.
      if (jActif) {
        // Ligne de DÉPART 'lidar' si le registre est encore vide pour ce cleabs (préserve la valeur écrasée, avec provenance).
        if (!(await derniereLigne(q, inj.cleabs))) {
          const dmod = await dateModifBatiment(q, inj.cleabs);
          await enregistrerLigneJournal(q, {
            cleabs: inj.cleabs, altitudeNgf: lidar, origine: 'lidar', cause: 'import',
            sourceType: 'bdtopo', sourceMillesime: milEdition, sourceDate: dmod, // BDT-2 : millésime stampé si édition courante, sinon 'inconnu' (jamais supposé)
            dossierId: null, altitudePrecedente: null, originePrecedente: null, par: valPar,
            note: milEdition === MILLESIME_INCONNU
              ? `ligne de départ : LiDAR capturée à la 1re injection (édition BD TOPO non étiquetée → millésime inconnu${dmod ? ` ; date_modification objet ${dmod}` : ` ; aucune date_modification objet`})`
              : `ligne de départ : LiDAR capturée à la 1re injection (édition BD TOPO ${milEdition}${dmod ? ` ; date_modification objet ${dmod}` : ``})`,
          });
        }
        await enregistrerLigneJournal(q, {
          cleabs: inj.cleabs, altitudeNgf: res.etat.altitudeNgf, origine: 'permis', cause: 'injection',
          sourceType: 'permis', sourceMillesime: null, sourceDate: null, dossierId,
          altitudePrecedente: avant.altitudeNgf, originePrecedente: avant.origine, par: valPar, note: res.trace,
        });
      }
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
    const jActif = await journalActif(q);
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
      if (jActif) {
        // La valeur restaurée est une LiDAR déjà tracée à l'import ; sa provenance vit dans la ligne 'import' du même cleabs.
        await enregistrerLigneJournal(q, {
          cleabs, altitudeNgf: res.etat.altitudeNgf, origine: 'lidar', cause: 'retour_arriere',
          sourceType: 'lidar_hd', sourceMillesime: null, sourceDate: null, dossierId,
          altitudePrecedente: avant.altitudeNgf, originePrecedente: avant.origine, par, note: res.trace,
        });
      }
      nbRestaures++;
    }
    return { ok: true, nbRestaures };
  });
}

/** Provenance présente et non vide ? Sinon un motif d'échec (millésime + source sont NON négociables — pièce de preuve). */
function validerProvenance(p: ProvenanceMesure | undefined): { ok: true; millesime: string; source: string } | ResultatAction {
  const millesime = (p?.millesime ?? '').trim();
  const source = (p?.source ?? '').trim();
  if (!millesime || !source) return { ok: false, motif: 'millésime ET source de la mesure sont obligatoires (pièce de preuve — provenance non négociable)' };
  return { ok: true, millesime, source };
}

/** dossier_id porté par la ligne d'altitude d'un cleabs (permis ayant injecté), pour l'annulation par LiDAR. */
async function dossierAltitude(q: RequeteTx, cleabs: string): Promise<number | null> {
  const { rows } = await q<{ dossier_id: number | null }>(`SELECT dossier_id FROM permis_polygone_altitude WHERE cleabs = $1`, [cleabs]);
  return rows[0]?.dossier_id ?? null;
}

/**
 * 🔴 CŒUR d'une mesure LiDAR postérieure (import d'édition OU écrasement manuel) sur UN cleabs. Passe par le module PUR
 * `preseanceAltitude` (mesure_lidar) : le LiDAR écrase TOUJOURS, y compris un 'permis' VALIDÉ → dossier `annule_par_lidar`.
 * Met à jour l'altitude effective SANS effacer le lien `dossier_id` (on garde trace du permis annulé), écrit une ligne de
 * REGISTRE (provenance obligatoire) et, si un 'permis' est écrasé, annule le dossier + événement. NE lit PAS le moteur SVAV.
 */
async function appliquerMesureLidar(q: RequeteTx, cleabs: string, altitudeLidar: number, prov: { millesime: string; source: string }, par: string, cause: 'import' | 'ecrasement_lidar', jActif: boolean): Promise<{ ecrasePermis: boolean }> {
  const avant = await etatAltitude(q, cleabs);
  const res = appliquerPreseanceAltitude(avant, { type: 'mesure_lidar', altitudeLidar });
  // MAJ de l'altitude effective → origine 'lidar', refige effacée. On NE clobber PAS dossier_id (traçabilité du permis annulé).
  await q(
    `INSERT INTO permis_polygone_altitude (cleabs, altitude_ngf, altitude_origine, altitude_lidar_refige, altitude_lidar_refige_le, maj_le, maj_par)
       VALUES ($1, $2, 'lidar', NULL, NULL, now(), $3)
     ON CONFLICT (cleabs) DO UPDATE SET altitude_ngf = EXCLUDED.altitude_ngf, altitude_origine = 'lidar',
       altitude_lidar_refige = NULL, altitude_lidar_refige_le = NULL, maj_le = now(), maj_par = EXCLUDED.maj_par`,
    [cleabs, res.etat.altitudeNgf, par]);
  const did = await dossierAltitude(q, cleabs);
  if (jActif) {
    await enregistrerLigneJournal(q, {
      cleabs, altitudeNgf: res.etat.altitudeNgf, origine: 'lidar', cause,
      sourceType: prov.source, sourceMillesime: prov.millesime, sourceDate: null, dossierId: did,
      altitudePrecedente: avant.altitudeNgf, originePrecedente: avant.origine, par, note: res.trace,
    });
  }
  if (res.ecrasePermis && did != null) {
    const rid = await rattId(q, did);
    if (rid != null) {
      const { rows: before } = await q<{ etat: string }>(`SELECT etat FROM permis_rattachement WHERE id = $1`, [rid]);
      await q(`UPDATE permis_rattachement SET etat = 'annule_par_lidar', reevalue_le = now() WHERE id = $1`, [rid]);
      await evenement(q, rid, 'annulation_lidar', before[0]?.etat ?? null, 'annule_par_lidar', {
        cleabs, altitudeLidar: res.etat.altitudeNgf, millesime: prov.millesime, source: prov.source, trace: res.trace,
      }, par);
    }
  }
  return { ecrasePermis: res.ecrasePermis };
}

/**
 * ÉCRASEMENT MANUEL par une mesure LiDAR sur un cleabs (altitude fournie). Provenance OBLIGATOIRE (millésime + source), sinon
 * refus. Le seul chemin « mesure LiDAR postérieure » aujourd'hui déclenchable à la main (pas de pipeline de réimport BD TOPO).
 */
export async function enregistrerMesureLidar(cleabs: string, altitudeLidar: number, prov: ProvenanceMesure, par: string): Promise<ResultatAction> {
  const g = validerProvenance(prov);
  if (!('millesime' in g)) return g;
  if (!cleabs?.trim()) return { ok: false, motif: 'cleabs obligatoire' };
  if (!Number.isFinite(altitudeLidar)) return { ok: false, motif: 'altitude LiDAR invalide' };
  return withTransaction(async (q) => {
    const jActif = await journalActif(q);
    const { ecrasePermis } = await appliquerMesureLidar(q, cleabs.trim(), altitudeLidar, g, par, 'ecrasement_lidar', jActif);
    return { ok: true, nbEcrases: ecrasePermis ? 1 : 0, motif: ecrasePermis ? 'altitude permis écrasée par la mesure LiDAR → dossier annulé par LiDAR' : undefined };
  });
}

/**
 * 🔴 POINT D'ENTRÉE de l'IMPORT BD TOPO — « le trou principal ». Le pipeline de réimport n'existe pas encore ; cette fonction est
 * ce qu'il appellera. PÉRIMÈTRE BORNÉ : uniquement les cleabs INTERSECTANT une empreinte de permis (jamais le bâti des 4 dép.).
 * Pour chaque cleabs suivi ayant une altitude de toit, applique la mesure (cause 'import') via la même préséance que ci-dessus.
 * Provenance OBLIGATOIRE. Les altitudes ABSENTES (NULL) sont IGNORÉES : « attribut absent » n'est pas « bâtiment rasé » — on
 * n'écrase pas une déclaration permis avec un vide.
 */
export async function importBdTopoSuivis(prov: ProvenanceMesure, par: string): Promise<ResultatAction> {
  const g = validerProvenance(prov);
  if (!('millesime' in g)) return g;
  return withTransaction(async (q) => {
    const jActif = await journalActif(q);
    const { rows } = await q<{ cleabs: string; alt: string | number | null }>(
      `SELECT DISTINCT b.cleabs, b.altitude_maximale_toit AS alt
         FROM batiment b
         JOIN permis_empreinte e ON e.geom IS NOT NULL AND ST_Intersects(ST_Force2D(b.geom), e.geom)
        WHERE b.cleabs IS NOT NULL`);
    let nbTraites = 0, nbEcrases = 0;
    for (const r of rows) {
      const alt = r.alt == null ? null : Number(r.alt);
      if (alt == null) continue; // altitude absente → on n'écrase pas une déclaration permis avec un vide
      const { ecrasePermis } = await appliquerMesureLidar(q, r.cleabs, alt, g, par, 'import', jActif);
      nbTraites++;
      if (ecrasePermis) nbEcrases++;
    }
    return { ok: true, nbTraites, nbEcrases };
  });
}
