/**
 * CLI `gestion:drive:copier-pieces` — MODULE « GESTION », LOT DRIVE-2.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'ELLE FAIT : copie les pièces jointes vers « Base de données locative », à la destination décidée par le
 * moteur de tri du lot DRIVE-1 — LE MÊME CODE que le rapport à blanc, recalculé au moment de la copie. Une seule
 * source de vérité : si le rapport dit « ce fichier ira là », c'est là qu'il ira.
 *
 * 🔴 COPIE SEULEMENT. Aucun effacement sur MinIO : `supprimer` n'est même pas importé. Le vidage est le lot DRIVE-3.
 *
 * 🔴 RIEN N'EST ACQUIS SANS VÉRIFICATION. Après chaque envoi, on compare l'empreinte MD5 **et** la taille rendues
 * par Drive à celles de l'original. Une copie non vérifiée n'est PAS comptée comme faite : elle est enregistrée
 * sans date de vérification, et le passage suivant met le fichier douteux à la corbeille Drive puis recopie.
 *
 * 🔴 FAITE POUR TOURNER LA NUIT, SANS PERSONNE. Verrou en base (une seule passe à la fois), reprise après coupure
 * (ce qui est vérifié n'est jamais renvoyé), envoi reprenable par morceaux, attente croissante sur 403/429/5xx,
 * arrêt propre après 10 échecs d'affilée avec le motif en clair, et arrêt propre sur Ctrl-C ou `kill`.
 *
 * DEUX MODES :
 *   • DÉFAUT = À BLANC. Rien n'est copié : la commande dit ce qui partirait, où, combien et quel volume ;
 *   • --appliquer = copie réelle.
 *
 * OPTIONS :
 *   --limite=N        s'arrête après N pièces copiées (pour les essais)
 *   --compte=adresse  au nom de qui écrire (défaut : gestion@criterimmo.fr)
 *
 * EXEMPLES :
 *   npm run gestion:drive:copier-pieces
 *   npm run gestion:drive:copier-pieces -- --limite=20 --appliquer
 *   npm run gestion:drive:copier-pieces -- --appliquer
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { hostname } from 'node:os';
import { pathToFileURL } from 'node:url';
import { query, closePool } from '../lib/db/client';
import { jetonPourSubject } from '../lib/gestion/driveDelegue';
import { copiePiecesDisponible } from '../lib/gestion/schema';
import { indexer, type NoeudArbre } from '../lib/gestion/driveGardeFou';
import { lireArbre } from '../lib/gestion/driveArbreRepo';
import { cheminDestination, trierPieces, type Decision, type Destination } from '../lib/gestion/triPieces';
import {
  attenteApresEchec, conduiteAtenir, descriptionFichierDrive, dureeFr, ECHECS_CONSECUTIFS_MAX, ligneAvancement,
  motifArret, nomFichierDrive, PAUSE_COPIE_MS, tailleFr,
} from '../lib/gestion/copiePieces';
import {
  copierPiece, corbeillerFichier, depotsConnus, dossierPeriode, enregistrerCopie, octetsDeLaPiece, respirerCopie,
  type DepsCopie,
} from '../lib/gestion/copiePiecesReel';
import { chargerContexteTri, type PieceAvecTaille } from '../lib/gestion/triPiecesRepo';

const P = '[gestion:drive:copier-pieces]';
export const COMPTE_DEFAUT = 'gestion@criterimmo.fr';

export interface OptionsCopie {
  compte: string;
  appliquer: boolean;
  limite: number | null;
}

/** Ce que la ligne de commande demande. PUR. */
export function lireOptions(argv: readonly string[]): OptionsCopie {
  const c = argv.find((a) => a.startsWith('--compte='));
  const l = argv.find((a) => a.startsWith('--limite='));
  const n = l === undefined ? NaN : Number(l.slice('--limite='.length));
  return {
    compte: c === undefined ? COMPTE_DEFAUT : c.slice('--compte='.length),
    appliquer: argv.includes('--appliquer'),
    limite: Number.isInteger(n) && n > 0 ? n : null,
  };
}

/**
 * LE DOSSIER D'ARRIVÉE d'une décision, dans l'arborescence mémorisée.
 *
 * 🔴 UN BIEN OU UN PROPRIÉTAIRE MÈNE À SON « En attente », jamais au dossier lui-même : aucun tri automatique ne
 * va dans « Travaux », « Assurances » ou « Litige » — ces trois-là demandent de lire le document.
 *
 * Rend `null` quand le dossier n'est pas (encore) mémorisé : l'appelant le CRÉE pour les périodes, et signale
 * l'anomalie pour un bien ou un propriétaire — un dossier manquant veut dire que l'arborescence est incomplète,
 * ce qui se répare en relançant `gestion:drive:construire`, pas en déposant ailleurs.
 */
export function cleDossier(d: Destination): { sorte: string; cle: string } | null {
  if (d.sorte === 'bien') return { sorte: 'en_attente', cle: `bien|${d.cle}` };
  if (d.sorte === 'proprietaire') return { sorte: 'en_attente', cle: `prop|${d.cle}` };
  return null;   // « 00 Non rattachés » : ses sous-dossiers AAAA/MM se créent à la demande
}

async function principal(): Promise<void> {
  const o = lireOptions(process.argv.slice(2));
  console.log('');
  console.log(`${P} ${o.appliquer ? '── COPIE RÉELLE ──' : '── À BLANC (aucune copie) ──'}`);
  console.log(`${P} compte : ${o.compte}${o.limite === null ? '' : ` · limite : ${o.limite} pièces`}`);

  if (!(await copiePiecesDisponible())) {
    console.error(`\n${P} ❌ La migration 255 n’est pas appliquée : sans elle, « copié » ne voudrait rien dire`);
    console.error(`${P}    (aucune colonne pour retenir la vérification, donc rien à refaire au passage suivant).`);
    console.error(`${P}    cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)`);
    console.error(`${P}    psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/255_gestion_copie_pieces.sql\n`);
    process.exitCode = 1;
    return;
  }

  // ── L'ARBORESCENCE ──────────────────────────────────────────────────────────────────────────────────────────
  const arbre = await lireArbre();
  if (arbre.etat !== 'ok') { console.error(`${P} ❌ migration 254 absente`); process.exitCode = 1; return; }
  const noeuds: NoeudArbre[] = [...arbre.data];
  const parCle = new Map<string, NoeudArbre>();
  const { rows: cles } = await query<{ sorte: string; cle: string; drive_id: string }>(
    'SELECT sorte, cle, drive_id FROM gestion_drive_arbre WHERE absent_le IS NULL');
  const index0 = indexer(noeuds);
  for (const c of cles) {
    const n = index0.get(c.drive_id);
    if (n !== undefined) parCle.set(`${c.sorte}|${c.cle}`, n);
  }
  const racine = noeuds.find((n) => n.sorte === 'racine');
  const nonRattaches = parCle.get('non_rattaches|non_rattaches');
  if (racine === undefined || nonRattaches === undefined) {
    console.error(`\n${P} ❌ L’arborescence n’est pas construite. Lancez d’abord :`);
    console.error(`${P}    npm run gestion:drive:construire -- --appliquer\n`);
    process.exitCode = 1;
    return;
  }
  console.log(`${P} arborescence : ${noeuds.length} dossiers mémorisés`);

  // ── LE TRI, PAR LE MÊME CODE QUE LE RAPPORT ─────────────────────────────────────────────────────────────────
  const ctx = await chargerContexteTri();
  const decisions = trierPieces(ctx.pieces, ctx.annuaire);
  const parPiece = new Map<number, PieceAvecTaille>(ctx.pieces.map((p) => [p.pieceId, p as PieceAvecTaille]));
  const connus = await depotsConnus();

  // ── CE QU'IL Y A À FAIRE ────────────────────────────────────────────────────────────────────────────────────
  const aFaire: Decision[] = [];
  let sansContenu = 0;
  let deja = 0;
  let aRefaire = 0;
  for (const d of decisions) {
    if (!d.stockee) { sansContenu += 1; continue; }
    const c = conduiteAtenir(connus.get(d.pieceId) ?? null);
    if (c.faire === 'passer') { deja += 1; continue; }
    if (c.faire === 'refaire') aRefaire += 1;
    aFaire.push(d);
  }
  const octetsAFaire = aFaire.reduce((n, d) => n + (parPiece.get(d.pieceId)?.taille ?? 0), 0);

  console.log('');
  console.log(`${P} ${decisions.length} pièces décidées · ${deja} déjà copiées et vérifiées · ${sansContenu} sans contenu stocké`);
  console.log(`${P} À COPIER : ${aFaire.length} pièces · ${tailleFr(octetsAFaire)}${aRefaire > 0 ? ` (dont ${aRefaire} copies douteuses à refaire)` : ''}`);

  const parDest = new Map<string, { n: number; octets: number }>();
  for (const d of aFaire) {
    const chemin = cheminDestination(d.destination, ctx.nomsBiens, ctx.nomsProprietaires);
    const e = parDest.get(chemin) ?? { n: 0, octets: 0 };
    parDest.set(chemin, { n: e.n + 1, octets: e.octets + (parPiece.get(d.pieceId)?.taille ?? 0) });
  }
  const top = [...parDest.entries()].sort((a, b) => b[1].n - a[1].n);
  console.log(`${P} réparties sur ${parDest.size} dossiers ; les 10 plus chargés :`);
  for (const [chemin, e] of top.slice(0, 10)) console.log(`${P}   ${String(e.n).padStart(5)} · ${tailleFr(e.octets).padStart(8)} · ${chemin}`);

  if (!o.appliquer) {
    console.log('');
    console.log(`${P} Rien n’a été copié. Pour copier : relancer avec --appliquer.`);
    return;
  }

  // ── LE VERROU ───────────────────────────────────────────────────────────────────────────────────────────────
  let passeId: number;
  try {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO gestion_drive_copie_passe (mode, hote, pid, limite) VALUES ('applique', $1, $2, $3) RETURNING id`,
      [hostname(), process.pid, o.limite]);
    passeId = Number(rows[0].id);
  } catch {
    const { rows } = await query<{ id: string; hote: string | null; pid: number | null; demarre: string }>(
      `SELECT id, hote, pid, demarre_le::text AS demarre FROM gestion_drive_copie_passe
        WHERE termine_le IS NULL AND mode = 'applique' ORDER BY id DESC LIMIT 1`);
    const v = rows[0];
    console.error(`\n${P} ❌ Une copie est DÉJÀ en cours (passe ${v?.id ?? '?'}, ${v?.hote ?? '?'} pid ${v?.pid ?? '?'},`);
    console.error(`${P}    démarrée le ${v?.demarre ?? '?'}). Deux copies en parallèle doubleraient les fichiers.`);
    console.error(`${P}    Si elle est morte sans se clore : npm run gestion:drive:copie-etat -- --debloquer\n`);
    process.exitCode = 1;
    return;
  }
  console.log(`${P} passe ${passeId} ouverte (verrou posé) · pid ${process.pid}`);

  // ── LE JETON ────────────────────────────────────────────────────────────────────────────────────────────────
  const jeton = await jetonPourSubject(o.compte, { fetch });
  if (!jeton.ok) {
    await clore(passeId, 'echec', jeton.motif, compteurs);
    console.error(`\n${P} ❌ ${jeton.motif}\n`);
    process.exitCode = 1;
    return;
  }

  const deps: DepsCopie = { fetch };
  const debut = Date.now();
  let echecsConsecutifs = 0;
  let octetsRestants = octetsAFaire;
  let arret: string | null = null;

  // ── ARRÊT PROPRE sur Ctrl-C ou `kill` : la passe se clôt, le verrou se libère. ───────────────────────────────
  let demandeArret = false;
  const surSignal = (sig: string): void => {
    if (demandeArret) return;
    demandeArret = true;
    console.log(`\n${P} ${sig} reçu — arrêt propre après la pièce en cours…`);
  };
  process.on('SIGINT', () => surSignal('SIGINT'));
  process.on('SIGTERM', () => surSignal('SIGTERM'));

  for (const d of aFaire) {
    if (demandeArret) { arret = 'arrêt demandé (SIGINT/SIGTERM)'; break; }
    if (o.limite !== null && compteurs.copiees >= o.limite) { arret = `limite de ${o.limite} pièces atteinte`; break; }

    const p = parPiece.get(d.pieceId);
    if (p === undefined || p.cleStockage === null) { compteurs.sansContenu += 1; continue; }

    // ── Le dossier d'arrivée ──
    const dossier = await resoudreDossier(d.destination, parCle, nonRattaches, noeuds, jeton.jeton, deps, compteurs);
    if (dossier === null) {
      compteurs.echecs += 1;
      echecsConsecutifs += 1;
      console.error(`${P}   ❌ pièce ${d.pieceId} : dossier d’arrivée introuvable (arborescence incomplète ?)`);
      if (echecsConsecutifs >= ECHECS_CONSECUTIFS_MAX) { arret = motifArret({ echecsConsecutifs, restantes: 0, limiteAtteinte: false }) ?? 'trop d’échecs'; break; }
      continue;
    }

    // ── La copie douteuse d'un passage précédent : à la corbeille avant de recopier ──
    const c = conduiteAtenir(connus.get(d.pieceId) ?? null);
    if (c.faire === 'refaire') {
      const ancien = connus.get(d.pieceId);
      const r = await corbeillerFichier(
        { driveFileId: c.corbeille, parentDriveId: ancien?.driveDossierId ?? dossier.driveId },
        indexer(noeuds), jeton.jeton, deps);
      if (!r.ok) console.error(`${P}   ⚠️ pièce ${d.pieceId} : ancienne copie non mise à la corbeille — ${r.motif}`);
      else compteurs.refaites += 1;
    }

    // ── Les octets, lus sur MinIO (jamais effacés) ──
    let octets: Buffer;
    let md5: string;
    try {
      const lu = await octetsDeLaPiece(p.cleStockage);
      octets = lu.octets;
      md5 = lu.md5;
    } catch (e) {
      compteurs.echecs += 1;
      echecsConsecutifs += 1;
      console.error(`${P}   ❌ pièce ${d.pieceId} : contenu illisible sur le stockage — ${(e as Error).message}`);
      if (echecsConsecutifs >= ECHECS_CONSECUTIFS_MAX) { arret = motifArret({ echecsConsecutifs, restantes: 0, limiteAtteinte: false }) ?? 'trop d’échecs'; break; }
      continue;
    }

    const nom = nomFichierDrive({ date: p.date, expediteur: p.expediteur, nomOrigine: p.nomFichier });
    const description = descriptionFichierDrive({
      pieceId: d.pieceId, messageId: d.messageId, objet: p.objet, date: p.date, expediteur: p.expediteur,
      regle: d.regle, confiance: d.confiance, motif: d.motif,
    });

    const r = await copierPiece(
      { parentDriveId: dossier.driveId, nom, description, typeMime: p.typeMime, octets, md5Attendu: md5 },
      indexer(noeuds), jeton.jeton, deps);

    if (!r.ok) {
      compteurs.echecs += 1;
      echecsConsecutifs += 1;
      console.error(`${P}   ${r.refuse ? '🔴 REFUSÉ PAR LE GARDE-FOU' : '❌'} pièce ${d.pieceId} — ${r.motif}`);
      if (r.refuse) { arret = 'le garde-fou a refusé une écriture : on s’arrête, c’est une anomalie'; break; }
      if (echecsConsecutifs >= ECHECS_CONSECUTIFS_MAX) { arret = motifArret({ echecsConsecutifs, restantes: 0, limiteAtteinte: false }) ?? 'trop d’échecs'; break; }
      await respirerCopie(deps, attenteApresEchec(echecsConsecutifs));
      continue;
    }

    echecsConsecutifs = 0;
    await enregistrerCopie({
      pieceId: d.pieceId, driveFileId: r.driveFileId, driveDossierId: dossier.driveId, dossierNom: dossier.nom,
      lien: r.lien, md5: r.md5, taille: r.taille, verifie: r.verification.ok,
      regle: d.regle, confiance: d.confiance, compte: o.compte,
    });
    if (r.verification.ok) {
      compteurs.copiees += 1;
      compteurs.octets += r.taille;
      octetsRestants -= p.taille;
    } else {
      compteurs.echecs += 1;
      console.error(`${P}   ⚠️ pièce ${d.pieceId} NON VÉRIFIÉE — ${r.verification.motif} (sera refaite au prochain passage)`);
    }

    if (compteurs.copiees % 25 === 0 || o.limite !== null) {
      console.log(`${P}   ${ligneAvancement({
        faites: compteurs.copiees, restantes: aFaire.length - compteurs.copiees,
        octetsFaits: compteurs.octets, octetsRestants: Math.max(0, octetsRestants),
        echecs: compteurs.echecs, ecouleMs: Date.now() - debut,
      })}`);
    }
    await respirerCopie(deps, PAUSE_COPIE_MS);
  }

  const ecoule = Date.now() - debut;
  await clore(passeId, arret === null ? 'ok' : 'arret', arret, compteurs);

  console.log('');
  console.log(`${P} ── TERMINÉ ── ${compteurs.copiees} pièce(s) copiée(s) et vérifiée(s) · ${tailleFr(compteurs.octets)}`);
  console.log(`${P}    ${compteurs.echecs} échec(s) · ${compteurs.refaites} copie(s) douteuse(s) refaite(s) · `
    + `${compteurs.dossiers} dossier(s) de période créé(s) · ${compteurs.sansContenu} sans contenu`);
  console.log(`${P}    durée ${dureeFr(ecoule)}${compteurs.octets > 0 ? ` · débit ${tailleFr(compteurs.octets / (ecoule / 1000))}/s` : ''}`);
  if (arret !== null) console.log(`${P}    motif d’arrêt : ${arret}`);
  const reste = aFaire.length - compteurs.copiees;
  if (reste > 0) console.log(`${P}    reste ${reste} pièce(s) : relancer la même commande, elle reprend où elle s’est arrêtée.`);
}

/** Les compteurs de la passe, partagés par la boucle et la clôture. */
const compteurs = { copiees: 0, octets: 0, echecs: 0, refaites: 0, dossiers: 0, sansContenu: 0, vues: 0 };

/**
 * LE DOSSIER D'ARRIVÉE, en créant « AAAA » puis « MM » sous « 00 Non rattachés » quand il le faut.
 *
 * ⚠️ CES DOSSIERS PASSENT PAR LE MÊME CHEMIN QUE TOUS LES AUTRES : garde-fou, création, enregistrement dans la
 * liste blanche. Sans l'enregistrement, le mois suivant ne pourrait rien y déposer.
 */
async function resoudreDossier(
  d: Destination, parCle: Map<string, NoeudArbre>, nonRattaches: NoeudArbre,
  noeuds: NoeudArbre[], jeton: string, deps: DepsCopie, c: typeof compteurs,
): Promise<NoeudArbre | null> {
  if (d.sorte !== 'non_rattache') {
    const cle = cleDossier(d);
    return cle === null ? null : parCle.get(`${cle.sorte}|${cle.cle}`) ?? null;
  }

  const creer = async (parent: NoeudArbre, nom: string, cle: string, chemin: string): Promise<NoeudArbre | null> => {
    const deja = parCle.get(`periode|${cle}`);
    if (deja !== undefined) return deja;
    const r = await dossierPeriode({ parentDriveId: parent.driveId, nom, cle, chemin }, noeuds, jeton, deps);
    if (!r.ok) { console.error(`${P}   ❌ dossier « ${nom} » non créé — ${r.motif}`); return null; }
    const n: NoeudArbre = { driveId: r.driveId, parentDriveId: parent.driveId, sorte: 'periode', nom, chemin };
    parCle.set(`periode|${cle}`, n);
    c.dossiers += 1;
    return n;
  };

  const annee = await creer(nonRattaches, d.annee, d.annee, `/00 Non rattachés/${d.annee}`);
  if (annee === null) return null;
  return creer(annee, d.mois, `${d.annee}|${d.mois}`, `/00 Non rattachés/${d.annee}/${d.mois}`);
}

/** Clôt la passe : compteurs, résultat, motif. Libère le verrou. */
async function clore(
  passeId: number, resultat: 'ok' | 'arret' | 'echec', motifArretTexte: string | null, c: typeof compteurs,
): Promise<void> {
  await query(
    `UPDATE gestion_drive_copie_passe
        SET termine_le = now(), resultat = $2, motif_arret = $3,
            pieces_copiees = $4, octets_copies = $5, echecs = $6, pieces_refaites = $7,
            dossiers_crees = $8, pieces_sans_contenu = $9
      WHERE id = $1`,
    [passeId, resultat, motifArretTexte, c.copiees, c.octets, c.echecs, c.refaites, c.dossiers, c.sansContenu]);
  await query(
    `INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_libelle)
     VALUES ('copie_piece', $1, 'passe', $2, 'copie automatique')`,
    [passeId, `${c.copiees} pièces copiées et vérifiées (${tailleFr(c.octets)}), ${c.echecs} échec(s)`
      + `${motifArretTexte === null ? '' : ` — ${motifArretTexte}`}`]);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void principal().then(closePool, async (e: unknown) => {
    console.error(e);
    process.exitCode = 1;
    await closePool();
  });
}
