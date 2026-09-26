/**
 * CLI `gestion:drive:copie-etat` — MODULE « GESTION », LOT DRIVE-2 : OÙ EN EST LA COPIE ?
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 STRICTEMENT EN LECTURE. Elle ne copie rien, ne corrige rien, ne touche à aucun fichier. Elle est faite pour
 * être lancée pendant qu'une copie tourne, autant de fois qu'on veut, sans jamais la gêner.
 *
 * ⚠️ UNE SEULE EXCEPTION, EXPLICITE ET DEMANDÉE : `--debloquer` referme une passe restée ouverte par un processus
 * MORT (coupure de courant, `kill -9`). Elle ne touche qu'à la ligne de journal — aucun fichier Drive, aucune
 * pièce. Et elle REFUSE de le faire si le processus est encore vivant : un verrou qu'on peut lever sur une passe
 * active ne protège plus de rien.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { hostname } from 'node:os';
import { pathToFileURL } from 'node:url';
import { query, closePool } from '../lib/db/client';
import { copiePiecesDisponible } from '../lib/gestion/schema';
import { dureeFr, tailleFr } from '../lib/gestion/copiePieces';
import { motifCourtCopie } from '../lib/gestion/copieArretee';
import { motifsEchec } from '../lib/gestion/copieArreteeRepo';

const P = '[gestion:drive:copie-etat]';

/**
 * LOT COPIE-SURV — `processusVivant` a DÉMÉNAGÉ dans `copieArretee.ts`, le module pur, parce que le bandeau de
 * l'écran en a besoin aussi : l'importer depuis ce script-ci aurait tiré `chargerEnv` dans le graphe de la page.
 * Elle est RÉEXPORTÉE ici, à son ancienne adresse — le code et les tests qui la connaissaient là ne changent pas.
 */
export { processusVivant } from '../lib/gestion/copieArretee';
import { processusVivant } from '../lib/gestion/copieArretee';

async function principal(): Promise<void> {
  const debloquer = process.argv.includes('--debloquer');

  if (!(await copiePiecesDisponible())) {
    console.error(`\n${P} La migration 255 n’est pas appliquée : il n’y a pas encore de copie à suivre.\n`);
    process.exitCode = 1;
    return;
  }

  // ── L'AVANCEMENT GLOBAL ─────────────────────────────────────────────────────────────────────────────────────
  const { rows: g } = await query<{
    total: string; stockees: string; sans_contenu: string; verifiees: string; douteuses: string;
    octets_total: string; octets_faits: string;
  }>(
    `SELECT (SELECT count(*) FROM gestion_piece)::text AS total,
            (SELECT count(*) FROM gestion_piece WHERE cle_stockage IS NOT NULL)::text AS stockees,
            (SELECT count(*) FROM gestion_piece WHERE cle_stockage IS NULL)::text AS sans_contenu,
            (SELECT count(DISTINCT piece_id) FROM gestion_piece_drive WHERE verifie_le IS NOT NULL)::text AS verifiees,
            (SELECT count(DISTINCT piece_id) FROM gestion_piece_drive WHERE verifie_le IS NULL)::text AS douteuses,
            (SELECT coalesce(sum(taille_octets), 0) FROM gestion_piece WHERE cle_stockage IS NOT NULL)::text AS octets_total,
            (SELECT coalesce(sum(p.taille_octets), 0) FROM gestion_piece p
              WHERE EXISTS (SELECT 1 FROM gestion_piece_drive d WHERE d.piece_id = p.id AND d.verifie_le IS NOT NULL))::text AS octets_faits`);
  const x = g[0];
  const stockees = Number(x.stockees);
  const verifiees = Number(x.verifiees);
  const pct = stockees === 0 ? 100 : Math.floor((verifiees / stockees) * 100);

  console.log('');
  console.log(`${P} ── AVANCEMENT ──`);
  console.log(`${P} ${verifiees} / ${stockees} pièces copiées et VÉRIFIÉES (${pct} %) · `
    + `${tailleFr(Number(x.octets_faits))} sur ${tailleFr(Number(x.octets_total))}`);
  console.log(`${P} reste ${stockees - verifiees} pièces · ${Number(x.douteuses)} copie(s) douteuse(s) à refaire`);
  console.log(`${P} ${Number(x.sans_contenu)} pièces sans contenu stocké : jamais copiées (rien à copier)`);

  // ── LES PASSES ──────────────────────────────────────────────────────────────────────────────────────────────
  const { rows: passes } = await query<{
    id: string; demarre: string; termine: string | null; mode: string; resultat: string; hote: string | null;
    pid: number | null; copiees: number; octets: string; echecs: number; refaites: number; dossiers: number;
    motif: string | null;
  }>(
    `SELECT id, demarre_le::text AS demarre, termine_le::text AS termine, mode, resultat, hote, pid,
            pieces_copiees AS copiees, octets_copies::text AS octets, echecs, pieces_refaites AS refaites,
            dossiers_crees AS dossiers, motif_arret AS motif
       FROM gestion_drive_copie_passe ORDER BY id DESC LIMIT 6`);

  console.log('');
  console.log(`${P} ── DERNIÈRES PASSES ──`);
  if (passes.length === 0) console.log(`${P} (aucune)`);
  for (const p of passes) {
    const duree = p.termine === null ? 'EN COURS' : dureeFr(new Date(p.termine).getTime() - new Date(p.demarre).getTime());
    console.log(`${P} #${p.id} ${p.mode} · ${p.demarre.slice(0, 19)} · ${duree} · ${p.resultat}`);
    console.log(`${P}     ${p.copiees} copiées (${tailleFr(Number(p.octets))}) · ${p.echecs} échec(s) · `
      + `${p.refaites} refaite(s) · ${p.dossiers} dossier(s) créé(s)`);
    if (p.motif !== null) console.log(`${P}     motif d’arrêt : ${p.motif}`);

    /**
     * 🔴 LOT COPIE-SURV — LES CINQ DERNIERS MOTIFS D'ÉCHEC, LUS EN BASE.
     *
     * Le 26/09/2026, les onze motifs qui expliquaient l'arrêt de la passe n° 4 n'existaient que dans le journal
     * texte, et la relance du soir (`>` au lieu de `>>`) l'a écrasé. Le diagnostic a dû se reconstituer par
     * déduction. Ils sont désormais en base — et cette commande les montre là où l'on regarde déjà.
     *
     * ⚠️ RIEN SANS LA MIGRATION 259 : `motifsEchec` rend une liste vide, et cette commande se comporte exactement
     * comme avant ce lot.
     */
    if (p.echecs > 0) {
      const motifs = await motifsEchec(Number(p.id));
      for (const m of motifs) {
        console.log(`${P}       ${m.survenuLe.slice(11, 19)} · ${motifCourtCopie(m)}`);
      }
      if (motifs.length === 0) {
        console.log(`${P}       (motifs non enregistrés : migration 259 non appliquée au moment de cette passe)`);
      }
    }
  }

  // ── LE VERROU ───────────────────────────────────────────────────────────────────────────────────────────────
  const ouverte = passes.find((p) => p.termine === null && p.mode === 'applique');
  console.log('');
  if (ouverte === undefined) {
    console.log(`${P} ── VERROU ── libre : une copie peut démarrer.`);
    if (debloquer) console.log(`${P}    (--debloquer sans objet : aucune passe n’est ouverte)`);
    return;
  }

  const vivant = processusVivant(ouverte.pid, ouverte.hote, hostname());
  console.log(`${P} ── VERROU ── passe #${ouverte.id} OUVERTE (${ouverte.hote ?? '?'} pid ${ouverte.pid ?? '?'})`);
  if (vivant === true) {
    console.log(`${P}    Le processus tourne ENCORE : la copie est en cours, tout va bien.`);
    console.log(`${P}    Pour l’arrêter proprement : kill ${ouverte.pid}`);
    if (debloquer) {
      console.log(`${P} 🔴 --debloquer REFUSÉ : le processus est vivant. Lever le verrou d’une copie active`);
      console.log(`${P}    permettrait à une seconde de démarrer, et les fichiers partiraient en double.`);
      process.exitCode = 1;
    }
    return;
  }
  if (vivant === false) {
    console.log(`${P} ⚠️ Le processus ${ouverte.pid} N’EXISTE PLUS : la passe est restée ouverte (coupure, kill -9).`);
  } else {
    console.log(`${P} ⚠️ La passe a démarré sur une AUTRE machine (${ouverte.hote ?? '?'}) : impossible de savoir d’ici`);
    console.log(`${P}    si elle tourne encore. Vérifiez là-bas avant de débloquer.`);
  }

  if (!debloquer) {
    console.log(`${P}    Pour libérer le verrou : npm run gestion:drive:copie-etat -- --debloquer`);
    return;
  }
  await query(
    `UPDATE gestion_drive_copie_passe
        SET termine_le = now(), resultat = 'arret',
            motif_arret = coalesce(motif_arret, '') || ' [verrou levé à la main : processus absent]'
      WHERE id = $1 AND termine_le IS NULL`, [ouverte.id]);
  console.log(`${P} ✅ Verrou libéré. La copie peut repartir — elle reprendra où elle s’était arrêtée.`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void principal().then(closePool, async (e: unknown) => {
    console.error(e);
    process.exitCode = 1;
    await closePool();
  });
}
