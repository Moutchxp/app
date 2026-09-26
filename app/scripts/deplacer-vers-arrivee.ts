/**
 * CLI `gestion:drive:deplacer-vers-arrivee` — MODULE « GESTION », LOT DRIVE-2-bis.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'ELLE FAIT : déplace vers « 00 Arrivée des mails / AAAA / MM » les pièces déjà copiées AILLEURS par les
 * essais du lot précédent (40 fichiers, dans des « En attente » de biens et dans « 00 Non rattachés »).
 * CHANGEMENT DE PARENT, pas de recopie : aucun octet ne repart sur le réseau.
 *
 * 🔴 POURQUOI CE GESTE EST ACCEPTABLE, alors que ce lot s'interdit de toucher à l'existant : les fichiers déplacés
 * ont TOUS été créés par ce programme et enregistrés en base — on relit leur ligne avant d'agir —, et le dossier
 * de départ comme celui d'arrivée sont dans la liste blanche. On ne déplace que ce qu'on a posé soi-même, à
 * l'intérieur de ce qu'on a construit soi-même. Le garde-fou vérifie les deux bouts.
 *
 * 🔴 VÉRIFIÉ APRÈS COUP : on relit le fichier chez Drive et on exige que son parent soit bien le nouveau dossier,
 * et que son empreinte n'ait pas bougé. Un déplacement annoncé mais non constaté ne compte pas.
 *
 * DEUX MODES : à blanc par défaut ; `--appliquer` pour déplacer.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';
import { query, closePool } from '../lib/db/client';
import { jetonPourSubject } from '../lib/gestion/driveDelegue';
import { adressesMessagesDisponibles, copiePiecesDisponible } from '../lib/gestion/schema';
import { indexer, type NoeudArbre } from '../lib/gestion/driveGardeFou';
import { lireArbre, enregistrerNoeud } from '../lib/gestion/driveArbreRepo';
import { creerDossier } from '../lib/gestion/driveEcriture';
import { deplacerFichier, relireFichier, type DepsCopie } from '../lib/gestion/copiePiecesReel';
import { ARRIVEE_NOM, CLE_ARRIVEE, dossierArrivee } from '../lib/gestion/arriveeDrive';
import { adressesParFil } from '../lib/gestion/adressesRepo';
import { proposerPourPiece, propositionCourte } from '../lib/gestion/propositionTri';
import { dernieresPropositions, enregistrerProposition } from '../lib/gestion/propositionRepo';
import { proprietesPiece } from './copier-pieces-drive';

const P = '[gestion:drive:deplacer-vers-arrivee]';

async function principal(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  const compte = process.argv.find((a) => a.startsWith('--compte='))?.slice('--compte='.length)
    ?? 'gestion@criterimmo.fr';
  console.log('');
  console.log(`${P} ${appliquer ? '── DÉPLACEMENT RÉEL ──' : '── À BLANC (rien n’est déplacé) ──'}`);

  if (!(await copiePiecesDisponible()) || !(await adressesMessagesDisponibles())) {
    console.error(`${P} ❌ Les migrations 255 et 256 doivent être appliquées.\n`);
    process.exitCode = 1;
    return;
  }

  const arbre = await lireArbre();
  if (arbre.etat !== 'ok') { console.error(`${P} ❌ migration 254 absente`); process.exitCode = 1; return; }
  const noeuds: NoeudArbre[] = [...arbre.data];
  const parCle = new Map<string, NoeudArbre>();
  const { rows: cles } = await query<{ sorte: string; cle: string; drive_id: string }>(
    'SELECT sorte, cle, drive_id FROM gestion_drive_arbre WHERE absent_le IS NULL');
  const idx = indexer(noeuds);
  for (const c of cles) {
    const n = idx.get(c.drive_id);
    if (n !== undefined) parCle.set(`${c.sorte}|${c.cle}`, n);
  }
  const racine = noeuds.find((n) => n.sorte === 'racine');
  if (racine === undefined) { console.error(`${P} ❌ racine absente`); process.exitCode = 1; return; }

  // ── LES FICHIERS À DÉPLACER : ceux que NOUS avons copiés, hors du dossier d'arrivée ──────────────────────────
  const { rows } = await query<{
    piece_id: string; drive_file_id: string; drive_dossier_id: string; message_id: string; fil_id: string | null;
    date: string; expediteur: string; dest_a: string | null; dest_cc: string | null;
  }>(
    `SELECT d.piece_id, d.drive_file_id, d.drive_dossier_id, m.id AS message_id, m.fil_id,
            m.recu_le::text AS date, m.de_adresse AS expediteur, m.dest_a::text, m.dest_cc::text
       FROM gestion_piece_drive d
       JOIN gestion_piece p ON p.id = d.piece_id
       JOIN gestion_message m ON m.id = p.message_id
      WHERE d.origine = 'copie' AND d.verifie_le IS NOT NULL
      ORDER BY d.piece_id`);

  const arriveeConnue = parCle.get(`arrivee|${CLE_ARRIVEE}`);
  const dansArrivee = new Set<string>();
  if (arriveeConnue !== undefined) {
    for (const n of noeuds) {
      // Les dossiers de période de l'arrivée : leur chemin commence par le nom du dossier d'arrivée.
      if (n.chemin.startsWith(`/${ARRIVEE_NOM}`)) dansArrivee.add(n.driveId);
    }
    dansArrivee.add(arriveeConnue.driveId);
  }
  const aDeplacer = rows.filter((r) => !dansArrivee.has(r.drive_dossier_id));

  console.log(`${P} ${rows.length} pièce(s) copiée(s) et vérifiée(s) · ${aDeplacer.length} hors du dossier d’arrivée`);
  if (aDeplacer.length === 0) { console.log(`${P} rien à déplacer.`); return; }

  const parDossier = new Map<string, number>();
  for (const r of aDeplacer) parDossier.set(r.drive_dossier_id, (parDossier.get(r.drive_dossier_id) ?? 0) + 1);
  for (const [id, n] of parDossier) {
    console.log(`${P}   ${String(n).padStart(3)} depuis ${idx.get(id)?.chemin ?? id}`);
  }

  if (!appliquer) {
    console.log('');
    console.log(`${P} Rien n’a été déplacé. Pour déplacer : relancer avec --appliquer.`);
    return;
  }

  const jeton = await jetonPourSubject(compte, { fetch });
  if (!jeton.ok) { console.error(`${P} ❌ ${jeton.motif}`); process.exitCode = 1; return; }
  const deps: DepsCopie = { fetch };

  // Le dossier d'arrivée doit exister avant d'y déplacer quoi que ce soit.
  let racineArrivee = parCle.get(`arrivee|${CLE_ARRIVEE}`);
  if (racineArrivee === undefined) {
    const r = await creerDossier({ parentDriveId: racine.driveId, nom: ARRIVEE_NOM }, indexer(noeuds), jeton.jeton, deps);
    if (!r.ok) { console.error(`${P} ❌ ${r.motif}`); process.exitCode = 1; return; }
    const chemin = `/${ARRIVEE_NOM}`;
    await enregistrerNoeud({
      driveId: r.id, parentDriveId: racine.driveId, sorte: 'arrivee', cle: CLE_ARRIVEE, nom: r.nom, chemin,
    });
    racineArrivee = { driveId: r.id, parentDriveId: racine.driveId, sorte: 'arrivee', nom: r.nom, chemin };
    noeuds.push(racineArrivee);
    parCle.set(`arrivee|${CLE_ARRIVEE}`, racineArrivee);
    console.log(`${P}   ✅ dossier d’arrivée créé : ${r.nom} [${r.id}]`);
  }

  const fils = [...new Set(aDeplacer.map((r) => (r.fil_id === null ? null : Number(r.fil_id)))
    .filter((x): x is number => x !== null))];
  const adressesDesFils = await adressesParFil(fils);
  const precedentes = await dernieresPropositions(aDeplacer.map((r) => Number(r.piece_id)));

  let faits = 0;
  let echecs = 0;
  let dossiers = 0;
  const liste = (brut: string | null): string[] => {
    if (brut === null || brut.trim() === '') return [];
    try { const j = JSON.parse(brut) as unknown; return Array.isArray(j) ? j.map(String) : []; } catch { return []; }
  };

  for (const r of aDeplacer) {
    const cible = await dossierArrivee(
      r.date, racineArrivee, noeuds, parCle, jeton.jeton, deps, () => { dossiers += 1; });
    if (!cible.ok) { echecs += 1; console.error(`${P}   ❌ pièce ${r.piece_id} — ${cible.motif}`); continue; }

    const pieceId = Number(r.piece_id);
    const proposition = proposerPourPiece({
      messageId: Number(r.message_id),
      adressesEchange: r.fil_id === null ? [] : adressesDesFils.get(Number(r.fil_id)) ?? [],
      renforts: null,
    });

    const avant = await relireFichier(r.drive_file_id, jeton.jeton, deps);
    const dep = await deplacerFichier({
      driveFileId: r.drive_file_id, deDriveId: r.drive_dossier_id, versDriveId: cible.dossier.driveId,
      proprietes: proprietesPiece(pieceId, Number(r.message_id), {
        expediteur: r.expediteur, destinataires: [...liste(r.dest_a), ...liste(r.dest_cc)],
      }, proposition),
    }, indexer(noeuds), jeton.jeton, deps);

    if (!dep.ok) {
      echecs += 1;
      console.error(`${P}   ${dep.refuse ? '🔴 REFUSÉ' : '❌'} pièce ${r.piece_id} — ${dep.motif}`);
      if (dep.refuse) break;   // un refus du garde-fou est une anomalie : on s'arrête
      continue;
    }

    // 🔴 VÉRIFICATION : le fichier est-il VRAIMENT là, et inchangé ?
    const apres = await relireFichier(r.drive_file_id, jeton.jeton, deps);
    const bonParent = apres.ok && apres.parents.includes(cible.dossier.driveId);
    const memeEmpreinte = apres.ok && avant.ok && apres.md5 === avant.md5 && apres.taille === avant.taille;
    if (!bonParent || !memeEmpreinte) {
      echecs += 1;
      console.error(`${P}   🔴 pièce ${r.piece_id} : déplacement NON VÉRIFIÉ `
        + `(parent ${bonParent ? 'ok' : 'inattendu'}, empreinte ${memeEmpreinte ? 'ok' : 'différente'})`);
      continue;
    }

    await query(
      'UPDATE gestion_piece_drive SET drive_dossier_id = $2, dossier_nom = $3 WHERE piece_id = $1 AND drive_file_id = $4',
      [pieceId, cible.dossier.driveId, cible.dossier.nom, r.drive_file_id]);
    if (await enregistrerProposition(pieceId, proposition, precedentes.get(pieceId))) {
      // rien à afficher : le compte suffit
    }
    faits += 1;
    console.log(`${P}   ✅ pièce ${String(r.piece_id).padStart(3)} → ${cible.dossier.chemin} · `
      + `proposition ${propositionCourte(proposition)}`);
  }

  await query(
    `INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_libelle)
     VALUES ('piece_drive', $1, 'deplacement', $2, 'déplacement automatique')`,
    [faits, `${faits} pièce(s) déplacée(s) vers « ${ARRIVEE_NOM} », ${echecs} échec(s)`]);

  console.log('');
  console.log(`${P} ── TERMINÉ ── ${faits} déplacée(s) et vérifiée(s) · ${echecs} échec(s) · ${dossiers} dossier(s) créé(s)`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void principal().then(closePool, async (e: unknown) => {
    console.error(e);
    process.exitCode = 1;
    await closePool();
  });
}
