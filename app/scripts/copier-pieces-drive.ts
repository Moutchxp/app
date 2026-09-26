/**
 * CLI `gestion:drive:copier-pieces` — MODULE « GESTION », LOT DRIVE-2.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'ELLE FAIT : copie les pièces jointes dans UN dossier d'arrivée — « 00 Arrivée des mails / AAAA / MM »,
 * d'après la date du mail — et MÉMORISE, pour chacune, une PROPOSITION de rangement.
 *
 * 🔴 DÉCISION D'ARNO DU 26/09 : LA COPIE NE RANGE PLUS. Les dossiers des biens et des propriétaires restent vides ;
 * le classement sera un geste séparé, plus tard, après analyse. Trois raisons : éprouver le tri avant de s'y fier,
 * préparer la déduplication avec « Documents clients scannés », et libérer au plus vite le stockage.
 *
 * 🔴 LA PROPOSITION S'APPUIE SUR LES ADRESSES DE TOUT L'ÉCHANGE (lot DRIVE-2-bis), pas seulement du mail qui porte
 * la pièce : une quittance envoyée par un syndic dans un fil où le locataire a écrit trois fois se rattache au bien
 * de ce locataire, alors que le mail du syndic, pris seul, ne dit rien.
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
import { trierPieces, type Decision } from '../lib/gestion/triPieces';
import { adressesMessagesDisponibles } from '../lib/gestion/schema';
import { adressesParFil } from '../lib/gestion/adressesRepo';
import {
  propositionCourte, proposerPourPiece, type Proposition,
} from '../lib/gestion/propositionTri';
import { ARRIVEE_NOM, CLE_ARRIVEE, dossierArrivee } from '../lib/gestion/arriveeDrive';
import {
  attenteApresEchec, conduiteAtenir, descriptionFichierDrive, dureeFr, ECHECS_CONSECUTIFS_MAX, ligneAvancement,
  motifArret, nomFichierDrive, PAUSE_COPIE_MS, tailleFr,
} from '../lib/gestion/copiePieces';
import {
  copierPiece, corbeillerFichier, depotsConnus, enregistrerCopie, octetsDeLaPiece, respirerCopie,
  type DepsCopie,
} from '../lib/gestion/copiePiecesReel';
import { creerDossier } from '../lib/gestion/driveEcriture';
import { enregistrerNoeud } from '../lib/gestion/driveArbreRepo';
import { dernieresPropositions, enregistrerProposition } from '../lib/gestion/propositionRepo';
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
  if (racine === undefined) {
    console.error(`\n${P} ❌ L’arborescence n’est pas construite. Lancez d’abord :`);
    console.error(`${P}    npm run gestion:drive:construire -- --appliquer\n`);
    process.exitCode = 1;
    return;
  }
  console.log(`${P} arborescence : ${noeuds.length} dossiers mémorisés`);

  if (!(await adressesMessagesDisponibles())) {
    console.error(`\n${P} ❌ La migration 256 n’est pas appliquée : la copie n’aurait nulle part où écrire la`);
    console.error(`${P}    PROPOSITION de rangement, qui est tout le travail que ce lot lui demande.`);
    console.error(`${P}    psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/256_gestion_arrivee_adresses.sql\n`);
    process.exitCode = 1;
    return;
  }

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

  // 🔴 TOUTES vont dans « 00 Arrivée des mails / AAAA / MM » : la répartition n'est plus par dossier de bien,
  //   mais par PÉRIODE. C'est la décision d'Arno : la copie dépose, elle ne range pas.
  const parPeriode = new Map<string, { n: number; octets: number }>();
  for (const d of aFaire) {
    const p = parPiece.get(d.pieceId);
    const per = (p?.date ?? '').slice(0, 7) || 'date inconnue';
    const e = parPeriode.get(per) ?? { n: 0, octets: 0 };
    parPeriode.set(per, { n: e.n + 1, octets: e.octets + (p?.taille ?? 0) });
  }
  console.log(`${P} destination : « ${ARRIVEE_NOM} / AAAA / MM » · ${parPeriode.size} périodes`);
  for (const [per, e] of [...parPeriode.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8)) {
    console.log(`${P}   ${String(e.n).padStart(5)} · ${tailleFr(e.octets).padStart(8)} · ${per}`);
  }

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
  /**
   * 🔴 UN JETON DEMANDÉ À CHAQUE PIÈCE, ET NON UNE FOIS POUR TOUTE LA PASSE.
   *
   * ═══ LE DÉFAUT, MESURÉ LE 26/09/2026 ════════════════════════════════════════════════════════════════════════
   * La passe n° 4 a démarré à 12:45:06, copié 2 199 pièces (1,2 Go) sans une seule erreur, réussi sa dernière à
   * 13:45:07 — soit UNE HEURE ET UNE SECONDE plus tard — puis échoué onze fois de suite et s'est arrêtée. Un jeton
   * d'accès Google vaut 3 600 secondes. Il était pris une seule fois, ici, et sa CHAÎNE était promenée jusqu'à la
   * dernière requête : passé la première heure, chaque envoi partait avec un jeton périmé.
   *
   * CE QUI RENDAIT LE DÉFAUT INVISIBLE : les passes n° 1 à 3 étaient bornées à 20 pièces et duraient moins d'une
   * minute. Le défaut ne pouvait apparaître qu'à la première passe faite pour durer — celle de la nuit, justement,
   * qui doit tourner seize heures. Elle serait morte seize fois.
   *
   * CE QUI LE PROUVE : les pièces sur lesquelles la passe n° 4 a échoué (2297 et suivantes) ont été copiées sans
   * difficulté par la passe n° 5 deux heures plus tard, avec un jeton neuf. Ce n'était donc ni une pièce fautive,
   * ni un quota, ni un droit refusé ; et le Mac n'a pas dormi (`caffeinate` a tenu 1 h 07 d'affilée).
   *
   * ⚠️ REDEMANDER NE COÛTE RIEN. `jetonPourSubject` garde le jeton en mémoire avec une marge de 60 secondes : sur
   * 24 000 pièces, elle ne signera une attestation et ne parlera à Google qu'une fois par heure. Les 23 999 autres
   * appels sont une lecture de cache.
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  const jetonFrais = async (): Promise<{ ok: true; jeton: string } | { ok: false; motif: string }> => {
    const j = await jetonPourSubject(o.compte, { fetch });
    return j.ok ? { ok: true, jeton: j.jeton } : { ok: false, motif: j.motif };
  };

  // Le premier appel sert aussi de contrôle : une délégation mal configurée doit arrêter la passe TOUT DE SUITE,
  //   avec son motif, plutôt qu'au bout de dix échecs.
  const jeton = await jetonFrais();
  if (!jeton.ok) {
    await clore(passeId, 'echec', jeton.motif, compteurs);
    console.error(`\n${P} ❌ ${jeton.motif}\n`);
    process.exitCode = 1;
    return;
  }

  // ── LE DOSSIER D'ARRIVÉE, et les adresses de TOUS les échanges concernés ────────────────────────────────────
  const deps: DepsCopie = { fetch };
  const racineArrivee = await assurerArrivee(racine, noeuds, parCle, jeton.jeton, deps);
  if (racineArrivee === null) {
    await clore(passeId, 'echec', `« ${ARRIVEE_NOM} » n’a pas pu être créé`, compteurs);
    process.exitCode = 1;
    return;
  }

  const filsConcernes = [...new Set(aFaire
    .map((d) => parPiece.get(d.pieceId)?.filId)
    .filter((x): x is number => typeof x === 'number'))];
  const adressesDesFils = await adressesParFil(filsConcernes);
  const precedentes = await dernieresPropositions(aFaire.map((d) => d.pieceId));
  console.log(`${P} adresses relevées pour ${adressesDesFils.size} échanges · `
    + `${precedentes.size} proposition(s) déjà connue(s)`);

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

    // ── LE JETON DE CETTE PIÈCE — lu au cache, renouvelé de lui-même une fois par heure (voir `jetonFrais`) ──
    const jt = await jetonFrais();
    if (!jt.ok) {
      compteurs.echecs += 1;
      echecsConsecutifs += 1;
      console.error(`${P}   ❌ pièce ${d.pieceId} : jeton Drive indisponible — ${jt.motif}`);
      if (echecsConsecutifs >= ECHECS_CONSECUTIFS_MAX) { arret = motifArret({ echecsConsecutifs, restantes: 0, limiteAtteinte: false }) ?? 'trop d’échecs'; break; }
      await respirerCopie(deps, attenteApresEchec(echecsConsecutifs));
      continue;
    }

    // ── Le dossier d'arrivée de CETTE période ──
    const arrivee = await dossierArrivee(
      p.date, racineArrivee, noeuds, parCle, jt.jeton, deps, () => { compteurs.dossiers += 1; });
    const dossier = arrivee.ok ? arrivee.dossier : null;
    if (dossier === null) {
      if (!arrivee.ok) console.error(`${P}   ❌ ${arrivee.motif}`);
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
        indexer(noeuds), jt.jeton, deps);
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

    // ── LA PROPOSITION, fondée sur les adresses de TOUT l'échange ──
    const proposition = proposerPourPiece({
      messageId: d.messageId,
      adressesEchange: p.filId === null ? [] : adressesDesFils.get(p.filId) ?? [],
      // Les RENFORTS (carte d'événement, adresse citée, nom dans l'objet) restent au moteur du lot DRIVE-1 ;
      // ils seront rebranchés au lot RATTACHEMENT-1, quand le classement deviendra un geste. Ici, la proposition
      // se fonde sur les ADRESSES, qui sont la clé la plus sûre — et la seule que ce lot ait outillée.
      renforts: null,
    });

    const nom = nomFichierDrive({ date: p.date, expediteur: p.expediteur, nomOrigine: p.nomFichier });
    const description = descriptionFichierDrive({
      pieceId: d.pieceId, messageId: d.messageId, objet: p.objet, date: p.date, expediteur: p.expediteur,
      regle: proposition.regle, confiance: proposition.confiance, motif: proposition.motif,
    });

    const r = await copierPiece(
      {
        parentDriveId: dossier.driveId, nom, description, typeMime: p.typeMime, octets, md5Attendu: md5,
        proprietes: proprietesPiece(d.pieceId, d.messageId, p, proposition),
      },
      indexer(noeuds), jt.jeton, deps);

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
    if (await enregistrerProposition(d.pieceId, proposition, precedentes.get(d.pieceId))) {
      compteurs.propositions += 1;
    }
    await enregistrerCopie({
      pieceId: d.pieceId, driveFileId: r.driveFileId, driveDossierId: dossier.driveId, dossierNom: dossier.nom,
      lien: r.lien, md5: r.md5, taille: r.taille, verifie: r.verification.ok,
      regle: proposition.regle, confiance: proposition.confiance, compte: o.compte,
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
const compteurs = {
  copiees: 0, octets: 0, echecs: 0, refaites: 0, dossiers: 0, sansContenu: 0, vues: 0, propositions: 0,
};

/**
 * LES `appProperties` DU FICHIER DRIVE — une sauvegarde de ce que la base sait, portée par le fichier lui-même.
 *
 * 🔴 LA BASE RESTE LA SOURCE DE VÉRITÉ. Ces propriétés servent le jour où l'on regarde un fichier dans Drive sans
 * avoir l'outil sous la main — ou, au pire, si la base disparaissait. Elles sont bornées par Drive (124 octets par
 * couple clé/valeur) : la liste complète des adresses reste en base, ici elle est tronquée proprement. PUR.
 */
export function proprietesPiece(
  pieceId: number, messageId: number,
  p: { expediteur: string; destinataires: readonly string[] },
  proposition: Proposition,
): Record<string, string> {
  return {
    piece_id: String(pieceId),
    message_id: String(messageId),
    expediteur: p.expediteur,
    destinataires: p.destinataires.join(' '),
    adresses_echange: proposition.adressesFondatrices.join(' '),
    proposition: propositionCourte(proposition),
  };
}

/**
 * S'ASSURE QUE « 00 Arrivée des mails » EXISTE, et le crée sinon — par le chemin gardé, comme tout le reste.
 *
 * ⚠️ IL NAÎT SOUS LA RACINE, à côté de « 00 Non rattachés » (qu'on laisse tel quel : il porte déjà les 16 pièces
 * de l'essai précédent, et on ne défait pas ce qu'on n'a pas demandé de défaire).
 */
async function assurerArrivee(
  racine: NoeudArbre, noeuds: NoeudArbre[], parCle: Map<string, NoeudArbre>,
  jeton: string, deps: DepsCopie,
): Promise<NoeudArbre | null> {
  const deja = parCle.get(`arrivee|${CLE_ARRIVEE}`);
  if (deja !== undefined) return deja;

  const r = await creerDossier({ parentDriveId: racine.driveId, nom: ARRIVEE_NOM }, indexer(noeuds), jeton, deps);
  if (!r.ok) {
    console.error(`${P} ${r.refuse ? '🔴 REFUSÉ' : '❌'} création de « ${ARRIVEE_NOM} » — ${r.motif}`);
    return null;
  }
  const chemin = `/${ARRIVEE_NOM}`;
  await enregistrerNoeud({
    driveId: r.id, parentDriveId: racine.driveId, sorte: 'arrivee', cle: CLE_ARRIVEE, nom: r.nom, chemin,
  });
  const n: NoeudArbre = { driveId: r.id, parentDriveId: racine.driveId, sorte: 'arrivee', nom: r.nom, chemin };
  noeuds.push(n);
  parCle.set(`arrivee|${CLE_ARRIVEE}`, n);
  console.log(`${P}   ✅ dossier d’arrivée créé : ${r.nom} [${r.id}]`);
  return n;
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
