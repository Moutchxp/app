/**
 * CLI `gestion:miniatures:completer` — LOT MINIATURES-COMPLÈTES : FABRIQUER APRÈS COUP L'APERÇU DE CHAQUE PIÈCE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'ELLE RÉPARE. La vignette d'une pièce jointe était fabriquée PARESSEUSEMENT, au premier affichage. Au
 * 27/09/2026, sur 26 852 pièces, 32 seulement en avaient une — les autres n'avaient jamais été regardées. Pire : 4 058
 * pièces ont depuis été VIDÉES de MinIO vers le Drive (lot DRIVE-3), et leur contenu a quitté le stockage AVANT que
 * quiconque ouvre le message. Pour celles-là la fabrication paresseuse ne peut plus rien : la route lit une clé qui
 * n'existe plus, rend un 503, et l'écran retombe sur le carré gris du type. C'est le défaut signalé par Arno sur les
 * quatre PDF du fil 354.
 *
 * 🔒 CE QU'ELLE S'INTERDIT, et qui n'est négociable en aucun cas :
 *   · AUCUNE ÉCRITURE DRIVE. Pas un `files.create`, pas un `files.update`, pas un `files.delete`. Le Drive n'est lu
 *     que par `files.get` (métadonnées) puis `alt=media` (contenu) — deux verbes de LECTURE.
 *   · « DOCUMENTS CLIENTS SCANNÉS » N'EST JAMAIS APPROCHÉ. Les identifiants lus viennent TOUS de
 *     `gestion_piece_vidage`, donc de NOS propres copies ; et chacun est re-vérifié comme descendant de
 *     « Base de données locative » avant d'être lu, par le même garde-fou que l'audit de vidage.
 *   · AUCUN CONTENU COMPLET N'EST RECOPIÉ DANS MINIO. Les octets lus depuis le Drive vivent en mémoire le temps de
 *     fabriquer une vignette de quelques kilo-octets, et c'est CETTE vignette, et elle seule, qui est déposée.
 *   · LES MINIATURES NE SONT JAMAIS VIDÉES : elles vivent sous `gestion/miniatures/…`, un préfixe que
 *     `vidageStockage` ne regarde pas (il ne reçoit que `cle_stockage`).
 *
 * 🔴 SIMULATION PAR DÉFAUT. Sans `--appliquer`, rien n'est écrit : ni base, ni stockage. La commande lit, fabrique
 * réellement les vignettes (c'est la seule façon de savoir ce qui marchera) et dit ce qu'elle ferait.
 *
 * 🔴 REPRENABLE SANS RATTRAPAGE. Elle ne prend que les pièces `miniature_etat IS NULL`, et inscrit au fur et à mesure.
 * Une coupure en plein lot ne perd que le travail en cours ; la passe suivante repart d'elle-même là où il faut. Un
 * échec TRANSITOIRE (Drive injoignable, stockage coupé) n'est PAS inscrit, justement pour rester reprenable — voir
 * `echecDefinitif` dans `miniatureCompletion.ts`.
 *
 * ⚠️ WORD ET EXCEL RESTENT EN ICÔNE, et c'est dit. Les convertir demanderait LibreOffice, qui n'est pas installé sur
 * ce Mac (vérifié : ni `soffice`, ni `libreoffice`, ni `unoconv`, ni /Applications/LibreOffice.app). La commande le
 * CONSTATE au démarrage plutôt que de le supposer : le jour où un convertisseur sera là, le message changera tout
 * seul. `textutil`, présent sur macOS, ne rend que du texte ou du HTML — jamais l'image d'une page.
 *
 * USAGE :
 *   npm run gestion:miniatures:completer                                  # simulation, tout le stock
 *   npm run gestion:miniatures:completer -- --reception --jours=90        # simulation, Réception 90 jours
 *   npm run gestion:miniatures:completer -- --reception --jours=90 --appliquer
 *   npm run gestion:miniatures:completer -- --appliquer --plafond=5000    # tout le reste, par tranches
 *   npm run gestion:miniatures:completer -- --message=668 --appliquer     # un message précis
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { query, closePool } from '../lib/db/client';
import { jetonPourSubject } from '../lib/gestion/driveDelegue';
import { lireArbre } from '../lib/gestion/driveArbreRepo';
import { ascensionVersRacine, indexer, RACINE_NOM, type NoeudArbre } from '../lib/gestion/driveGardeFou';
import { genererMiniature } from '../lib/gestion/miniature';
import { memoriserEchecMiniature, memoriserMiniature } from '../lib/gestion/piecesRepo';
import { deposerMiniatureGestion, recuperer } from '../lib/stockage';
import {
  bilanVide, echecDefinitif, planifier, type Bilan, type PieceACompleter,
} from '../lib/gestion/miniatureCompletion';

const P = '[gestion:miniatures:completer]';
const COMPTE = 'gestion@criterimmo.fr';
/** Un jeton vaut une heure : on le renouvelle à mi-course, sinon une longue passe meurt en route (défaut du 26/09). */
const MARGE_JETON_MS = 30 * 60_000;
/** Taille d'un lot : ce qu'on lit en base d'un coup. Au-delà, on garde des milliers de lignes en mémoire pour rien. */
const LOT_DEFAUT = 500;
/**
 * COMBIEN DE PIÈCES DE FRONT.
 *
 * 🔴 SIX, PAS CINQUANTE. Ce sont des lectures de CONTENU sur le Drive (jusqu'à quelques Mo chacune) suivies d'un
 * décodage `sharp`/WebAssembly qui consomme du processeur. Trop de parallélisme fait deux dégâts à la fois : Google
 * répond 429 — qu'on prendrait pour des fichiers illisibles, donc pour de vraies anomalies — et la mémoire enfle de
 * tous les fichiers tenus en même temps. Six tient le débit sans rien de tout cela. Même raisonnement que les huit
 * lectures de métadonnées de `gestion:vidage:audit`, en plus prudent parce qu'ici on télécharge vraiment.
 */
const FRONT = 6;
/** Au-delà, on ne télécharge même pas depuis le Drive : `genererMiniature` refuserait de toute façon ces octets. */
const TAILLE_MAX_DRIVE = 40 * 1024 * 1024;

interface Echec { pieceId: number; nom: string; motif: string; definitif: boolean }

interface LigneDB {
  id: string; nom_fichier: string; type_mime: string | null; cle_stockage: string | null;
  videe: boolean; drive_file_id: string | null; drive_md5: string | null; taille_octets: string | null;
}

function versPiece(r: LigneDB): PieceACompleter {
  return {
    pieceId: Number(r.id),
    nomFichier: r.nom_fichier,
    typeMime: r.type_mime,
    cleStockage: r.cle_stockage,
    videe: r.videe === true,
    driveFileId: r.drive_file_id,
    driveMd5: r.drive_md5,
  };
}

/** Un drapeau `--nom=valeur`, ou `null`. */
function option(nom: string): string | null {
  const a = process.argv.slice(2).find((x) => x.startsWith(`--${nom}=`));
  return a === undefined ? null : a.slice(nom.length + 3);
}
const drapeau = (nom: string): boolean => process.argv.slice(2).includes(`--${nom}`);

/**
 * LE PÉRIMÈTRE, construit en paramètres LIÉS — jamais par concaténation. Les bornes se COMBINENT : « Réception des
 * 90 derniers jours » est l'addition de deux restrictions, pas un mode à part.
 *
 * ⚠️ `rang0` EST LE NOMBRE DE PARAMÈTRES DÉJÀ POSÉS par l'appelant (ici le curseur et la limite). Les numéroter à
 * partir de `$1` a produit « bind message supplies 3 parameters, but prepared statement requires 2 » au premier
 * essai : le décalage d'un cran, piège déjà consigné dans `boiteRepo`. On le PASSE, on ne le devine pas.
 */
function perimetre(rang0 = 0): { where: string; params: unknown[]; dit: string[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const dit: string[] = [];
  const rang = (): number => rang0 + params.length;
  if (drapeau('reception')) {
    conditions.push(`m.sens = 'recu'`);
    dit.push('Réception (messages reçus)');
  }
  const jours = option('jours');
  if (jours !== null) {
    const n = Number(jours);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`--jours=${jours} : il faut un nombre de jours positif.`);
    params.push(n);
    conditions.push(`m.recu_le >= now() - ($${rang()}::int * interval '1 day')`);
    dit.push(`les ${n} derniers jours`);
  }
  const message = option('message');
  if (message !== null) {
    params.push(Number(message));
    conditions.push(`p.message_id = $${rang()}::bigint`);
    dit.push(`le message ${message}`);
  }
  const fil = option('fil');
  if (fil !== null) {
    params.push(Number(fil));
    conditions.push(`m.fil_id = $${rang()}::bigint`);
    dit.push(`l'échange ${fil}`);
  }
  return { where: conditions.length === 0 ? '' : `AND ${conditions.join(' AND ')}`, params, dit };
}

/**
 * LES PIÈCES À COMPLÉTER, par lots. `apresId` est le CURSEUR : on ne relit jamais ce qu'on vient de traiter.
 *
 * ⚠️ LE CURSEUR EST INDISPENSABLE EN SIMULATION. En application, `miniature_etat` cesse d'être NULL et la même
 * requête rend naturellement la suite ; en simulation rien n'est écrit, et sans curseur la commande relirait
 * éternellement le même premier lot.
 */
async function lireLot(apresId: number, limite: number): Promise<LigneDB[]> {
  // Deux paramètres sont déjà posés ci-dessous ($1 le curseur, $2 la limite) : le périmètre numérote à partir de $3.
  const { where, params } = perimetre(2);
  const { rows } = await query<LigneDB>(
    `SELECT p.id::text, p.nom_fichier, p.type_mime, p.cle_stockage, p.taille_octets::text,
            v.piece_id IS NOT NULL AS videe, v.drive_file_id, v.md5 AS drive_md5
       FROM gestion_piece p
       JOIN gestion_message m ON m.id = p.message_id
       LEFT JOIN gestion_piece_vidage v ON v.piece_id = p.id
      WHERE p.miniature_etat IS NULL
        AND p.id > $1::bigint
        ${where}
      ORDER BY p.id
      LIMIT $2`,
    [apresId, limite, ...params]);
  return rows;
}

async function principal(): Promise<void> {
  const appliquer = drapeau('appliquer');
  const lot = Math.max(1, Math.min(2000, Number(option('lot') ?? LOT_DEFAUT)));
  const plafond = option('plafond') === null ? Infinity : Math.max(1, Number(option('plafond')));
  const { dit } = perimetre();

  console.log(`\n${P} ── ${appliquer ? '🟠 APPLICATION' : '🔵 SIMULATION (rien ne sera écrit)'} ──`);
  console.log(`${P} périmètre : ${dit.length === 0 ? 'toutes les pièces sans aperçu' : dit.join(' · ')}`);
  console.log(`${P} lots de ${lot}${plafond === Infinity ? '' : `, plafond ${plafond}`}, ${FRONT} de front\n`);

  // ⚠️ ON LE CONSTATE, ON NE LE SUPPOSE PAS : le jour où un convertisseur sera installé, ce message changera seul.
  const convertisseur = await bureautiqueDisponible();
  console.log(`${P} convertisseur bureautique (Word/Excel) : ${convertisseur ?? 'AUCUN'}`
    + `${convertisseur === null ? ' — ces pièces gardent leur icône, et c’est dit sur la carte.' : ''}`);

  /**
   * L'ARBORESCENCE DRIVE, lue UNE fois. C'est elle qui permet de prouver qu'un fichier est bien sous
   * « Base de données locative » avant d'en lire un seul octet. Sans elle, on ne lit RIEN du Drive — on ne se
   * contente pas d'un « probablement ».
   */
  const arbre = await lireArbre();
  const index = arbre.etat === 'ok' ? indexer([...arbre.data] as NoeudArbre[]) : null;
  if (index === null) {
    console.log(`${P} ⚠️  L’arborescence Drive n’est pas mémorisée : les pièces VIDÉES seront ignorées`
      + ` (impossible de prouver qu’un fichier est sous « ${RACINE_NOM} »). Les pièces encore dans MinIO, elles,`
      + ` sont traitées normalement.`);
  }

  let jeton = ''; let obtenuA = 0;
  const frais = async (): Promise<string> => {
    if (jeton !== '' && Date.now() - obtenuA < MARGE_JETON_MS) return jeton;
    const j = await jetonPourSubject(COMPTE, { fetch });
    if (!j.ok) throw new Error(`jeton Drive indisponible : ${j.motif}`);
    jeton = j.jeton; obtenuA = Date.now(); return jeton;
  };

  /**
   * LE CONTENU D'UNE COPIE DRIVE — EN LECTURE SEULE, ET SOUS GARDE.
   *
   * 🔴 DEUX APPELS, ET LE PREMIER EST LE GARDE-FOU. On lit d'abord les MÉTADONNÉES (parents, corbeille, empreinte),
   * on prouve la descendance de « Base de données locative » par `ascensionVersRacine`, on compare l'empreinte à
   * celle relevée au moment du vidage — et c'est SEULEMENT alors qu'on demande les octets. Télécharger d'abord et
   * vérifier ensuite reviendrait à lire un fichier qu'on n'avait pas le droit de lire.
   *
   * 🔴 L'EMPREINTE EST UNE GARDE, PAS UNE COQUETTERIE : elle dit que le fichier lu est bien CELUI QUE NOUS AVIONS
   * COPIÉ, et pas un autre document arrivé depuis sous le même identifiant réemployé.
   */
  const lireContenuDrive = async (p: PieceACompleter): Promise<{ ok: true; octets: Buffer } | { ok: false; motif: string; definitif: boolean }> => {
    if (index === null) return { ok: false, motif: 'arborescence Drive non mémorisée', definitif: false };
    const fid = p.driveFileId as string;
    const meta = await avecReessais(async () => fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fid)}`
      + '?fields=id,parents,trashed,md5Checksum,size&supportsAllDrives=true',
      { headers: { Authorization: `Bearer ${await frais()}` } }));
    if (!(meta instanceof Response)) return { ok: false, motif: `Drive injoignable : ${meta.erreur}`, definitif: false };
    if (!meta.ok) {
      // 404/403 : la copie n'est plus lisible. Ce n'est PAS le fichier qui est illisible — on n'inscrit pas d'échec.
      return { ok: false, motif: `copie Drive illisible (HTTP ${meta.status})`, definitif: false };
    }
    const b = await meta.json() as { parents?: string[]; trashed?: boolean; md5Checksum?: string; size?: string };
    if (b.trashed === true) return { ok: false, motif: 'copie Drive à la corbeille', definitif: false };
    if (!(b.parents ?? []).some((par) => ascensionVersRacine(par, index) !== null)) {
      return { ok: false, motif: `copie Drive hors de « ${RACINE_NOM} » — non lue`, definitif: false };
    }
    if (p.driveMd5 !== null && (b.md5Checksum ?? '').toLowerCase() !== p.driveMd5.toLowerCase()) {
      return { ok: false, motif: 'empreinte Drive différente de la preuve de vidage — non lue', definitif: false };
    }
    if (Number(b.size ?? 0) > TAILLE_MAX_DRIVE) {
      return { ok: false, motif: `pièce trop volumineuse pour une miniature (${Math.round(Number(b.size) / (1024 * 1024))} Mo)`, definitif: true };
    }
    const media = await avecReessais(async () => fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fid)}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${await frais()}` } }));
    if (!(media instanceof Response)) return { ok: false, motif: `Drive injoignable : ${media.erreur}`, definitif: false };
    if (!media.ok) return { ok: false, motif: `contenu Drive illisible (HTTP ${media.status})`, definitif: false };
    return { ok: true, octets: Buffer.from(await media.arrayBuffer()) };
  };

  const bilan: Bilan = bilanVide();
  const echecs: Echec[] = [];
  const t0 = Date.now();

  /** UNE pièce, de bout en bout. N'écrit qu'en mode `--appliquer` ; fabrique dans les deux cas. */
  const traiterUne = async (r: LigneDB): Promise<void> => {
    const p = versPiece(r);
    const plan = planifier(p);
    bilan.vues += 1;

    if (plan.faire === 'ignorer') {
      bilan.ignorees += 1;
      echecs.push({ pieceId: p.pieceId, nom: p.nomFichier, motif: plan.motif, definitif: false });
      return;
    }
    if (plan.faire === 'inscrire_echec') {
      bilan.echecsDefinitifs += 1;
      echecs.push({ pieceId: p.pieceId, nom: p.nomFichier, motif: plan.motif, definitif: true });
      if (appliquer) await memoriserEchecMiniature(p.pieceId, plan.motif);
      return;
    }

    // ── LES OCTETS ────────────────────────────────────────────────────────────────────────────────────────────
    let octets: Buffer;
    if (plan.source === 'minio') {
      try {
        octets = await recuperer(p.cleStockage as string);
      } catch (e) {
        /**
         * 🔴 UNE CLÉ ABSENTE DE MINIO N'EST PAS UN FICHIER ILLISIBLE. C'est très exactement le cas des pièces
         * vidées dont la preuve de vidage manquerait : on n'inscrit donc RIEN, et la passe suivante reprendra.
         */
        const motif = `contenu absent du stockage : ${e instanceof Error ? e.message : String(e)}`;
        bilan.echecsTransitoires += 1;
        echecs.push({ pieceId: p.pieceId, nom: p.nomFichier, motif, definitif: false });
        return;
      }
    } else {
      const lu = await lireContenuDrive(p);
      if (!lu.ok) {
        if (lu.definitif) { bilan.echecsDefinitifs += 1; if (appliquer) await memoriserEchecMiniature(p.pieceId, lu.motif); }
        else bilan.echecsTransitoires += 1;
        echecs.push({ pieceId: p.pieceId, nom: p.nomFichier, motif: lu.motif, definitif: lu.definitif });
        return;
      }
      octets = lu.octets;
    }

    // ── LA VIGNETTE ───────────────────────────────────────────────────────────────────────────────────────────
    const issue = await genererMiniature(octets, p.typeMime, p.nomFichier);
    if (!issue.ok) {
      const def = echecDefinitif(issue.motif);
      if (def) { bilan.echecsDefinitifs += 1; if (appliquer) await memoriserEchecMiniature(p.pieceId, issue.motif); }
      else bilan.echecsTransitoires += 1;
      echecs.push({ pieceId: p.pieceId, nom: p.nomFichier, motif: issue.motif, definitif: def });
      return;
    }
    if (appliquer) {
      // ⚠️ SEULE LA VIGNETTE EST DÉPOSÉE. Les octets d'origine ne sont JAMAIS réécrits dans MinIO — c'est la règle
      //   du lot, et c'est ce qui fait qu'une pièce vidée le reste.
      const depot = await deposerMiniatureGestion(issue.octets, p.pieceId);
      if (!depot.depose) {
        bilan.echecsTransitoires += 1;
        echecs.push({ pieceId: p.pieceId, nom: p.nomFichier, motif: `dépôt impossible : ${depot.motif}`, definitif: false });
        return;
      }
      await memoriserMiniature(p.pieceId, depot.cle);
    }
    bilan.faites += 1;
    if (plan.source === 'minio') bilan.depuisMinio += 1; else bilan.depuisDrive += 1;
  };

  // ── LA BOUCLE DE LOTS ────────────────────────────────────────────────────────────────────────────────────────
  let curseur = 0;
  for (;;) {
    if (bilan.vues >= plafond) { console.log(`${P} plafond de ${plafond} atteint — on s’arrête proprement.`); break; }
    const reste = plafond === Infinity ? lot : Math.min(lot, plafond - bilan.vues);
    const rows = await lireLot(curseur, reste);
    if (rows.length === 0) break;
    curseur = Number(rows[rows.length - 1].id);

    for (let i = 0; i < rows.length; i += FRONT) {
      await Promise.all(rows.slice(i, i + FRONT).map((r) => traiterUne(r)));
    }
    const s = Math.round((Date.now() - t0) / 1000);
    console.log(`${P} ${bilan.vues} vues · ${bilan.faites} faites`
      + ` (${bilan.depuisMinio} MinIO, ${bilan.depuisDrive} Drive)`
      + ` · ${bilan.echecsDefinitifs} sans aperçu · ${bilan.echecsTransitoires} à reprendre`
      + ` · ${bilan.ignorees} sans contenu · ${s} s`);
  }

  // ── LE COMPTE RENDU ──────────────────────────────────────────────────────────────────────────────────────────
  const secondes = Math.round((Date.now() - t0) / 1000);
  console.log(`\n${P} ══ ${appliquer ? 'FAIT' : 'SIMULÉ'} en ${secondes} s ══`);
  console.log(`${P}   pièces examinées ........ ${bilan.vues}`);
  console.log(`${P}   aperçus fabriqués ....... ${bilan.faites}  (MinIO ${bilan.depuisMinio} · Drive ${bilan.depuisDrive})`);
  console.log(`${P}   sans aperçu possible .... ${bilan.echecsDefinitifs}  (inscrit : on ne retentera pas)`);
  console.log(`${P}   à reprendre plus tard ... ${bilan.echecsTransitoires}  (rien inscrit : la prochaine passe les reprend)`);
  console.log(`${P}   sans contenu nulle part . ${bilan.ignorees}`);

  if (echecs.length > 0) {
    const parMotif = new Map<string, number>();
    for (const e of echecs) {
      // On regroupe sur le motif NU : un chemin ou une taille dans le texte ferait autant de motifs que d'échecs.
      const cle = e.motif.replace(/\d+/g, 'N').slice(0, 90);
      parMotif.set(cle, (parMotif.get(cle) ?? 0) + 1);
    }
    console.log(`\n${P} ── MOTIFS (${echecs.length}) ──`);
    for (const [motif, n] of [...parMotif].sort((a, b) => b[1] - a[1])) console.log(`${P}   ${String(n).padStart(5)} × ${motif}`);
    console.log(`\n${P} ── DIX PREMIÈRES PIÈCES CONCERNÉES ──`);
    for (const e of echecs.slice(0, 10)) {
      console.log(`${P}   #${e.pieceId} ${e.nom.slice(0, 44)} → ${e.motif}${e.definitif ? '' : ' (reprise possible)'}`);
    }
  }
  if (!appliquer) console.log(`\n${P} 🔵 SIMULATION : rien n’a été écrit. Ajouter --appliquer pour écrire.`);
  console.log('');
}

/** Trois tentatives au plus, jamais une boucle : une coupure réseau ne doit pas passer pour un fichier illisible. */
async function avecReessais(appel: () => Promise<Response>): Promise<Response | { erreur: string }> {
  let dernier = '';
  for (let essai = 1; essai <= 3; essai += 1) {
    try { return await appel(); } catch (e) {
      dernier = e instanceof Error ? e.message : String(e);
      if (essai < 3) await new Promise((r) => setTimeout(r, 1000 * essai));
    }
  }
  return { erreur: dernier };
}

/**
 * Y A-T-IL UN CONVERTISSEUR BUREAUTIQUE SUR CETTE MACHINE ? On le CONSTATE, on ne le suppose pas.
 *
 * ⚠️ `textutil` (présent sur tout macOS) n'en est PAS un : il convertit du texte en texte ou en HTML, jamais en
 * image d'une page. Le nommer ici ferait promettre un aperçu qui ne viendrait pas.
 */
async function bureautiqueDisponible(): Promise<string | null> {
  const { access } = await import('node:fs/promises');
  const { join } = await import('node:path');
  // On PARCOURT le PATH nous-mêmes plutôt que de lancer un shell : `execFile` avec `shell` concatène ses arguments
  //   sans les échapper, ce que Node signale lui-même comme une faiblesse (DEP0190). Ici, rien à échapper du tout.
  const chemins = (process.env.PATH ?? '').split(':').filter((d) => d !== '');
  for (const nom of ['soffice', 'libreoffice']) {
    for (const d of chemins) {
      try { await access(join(d, nom)); return join(d, nom); } catch { /* pas ici : on continue */ }
    }
  }
  const mac = '/Applications/LibreOffice.app/Contents/MacOS/soffice';
  try { await access(mac); return mac; } catch { return null; }
}

void principal()
  .catch((e) => { console.error(`${P} ❌`, e); process.exitCode = 1; })
  .finally(() => closePool());
