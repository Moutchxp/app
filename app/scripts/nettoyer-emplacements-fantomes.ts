/**
 * ══ 🔴🔴 LOT DRIVE-NIVEAUX-DEPLACEMENT — LES ENTRÉES FANTÔMES DU REGISTRE DES DÉPÔTS ═════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « Si le registre ou l'index gardent l'ancien emplacement après un déplacement :
 * corrige, et nettoie les entrées fantômes existantes (simulation, nombre et exemples, puis application). Une
 * entrée fantôme = fileId dont les parents réels Drive ne correspondent plus, ou fichier à la corbeille ou
 * absent. »
 *
 * 🔒🔒 SANS `--appliquer`, CE SCRIPT N'ÉCRIT RIEN — ni en base, ni ailleurs. C'est le mode par défaut, et c'est
 * délibéré : le geste qu'Arno autorise est la correction, pas le comptage, et le comptage est précisément ce qui
 * lui permet de décider.
 *
 * 🔒🔒 IL N'ÉCRIT JAMAIS DANS LE DRIVE, ET IL NE SAIT PAS LE FAIRE : il n'émet que des `files.get`, et aucun
 * module d'écriture Drive n'est importé. Aucune ligne n'est SUPPRIMÉE de la base, jamais : une ligne de
 * `gestion_piece_drive` dit un fait daté (« nous avons déposé une copie ici, ce jour-là »), et ce fait reste vrai
 * après la disparition du fichier. On CORRIGE un parent, ou l'on DATE une disparition.
 *
 * ═══ 🔴 CE QUI EST MESURÉ, ET POURQUOI EN DEUX TEMPS ════════════════════════════════════════════════════════════
 *
 * ① LA PRÉSÉLECTION SE FAIT EN BASE, sans un appel Google : l'index des empreintes
 *    (`gestion_drive_empreinte`, 202 017 lignes au 03/10/2026) porte le parent réel de chaque fichier vu, et il
 *    est tenu à jour par `changes.list`. Comparer 26 555 lignes de registre à l'index coûte une requête.
 *    Appeler `files.get` sur 26 555 fichiers en coûterait 26 555.
 *
 * ② CHAQUE CANDIDAT EST ENSUITE VÉRIFIÉ CHEZ GOOGLE, un par un. L'index est un REFLET : conclure d'un reflet
 *    qu'il faut corriger la base serait corriger une base à partir d'une copie. C'est le Drive qui tranche, et
 *    c'est de LUI que vient le parent qu'on écrit.
 *
 * ⚠️ « ABSENT DE L'INDEX » N'EST PAS UNE DISPARITION. Un fichier rangé dans un coin du Drive qu'aucun balayage
 * n'a lu n'y est pas. Ces lignes sont donc VÉRIFIÉES comme les autres, et seules deux réponses de Google valent
 * disparition — 404 et 403 (`estDisparition`, module PUR). Un 429 ou un 503 ne conclut RIEN : marquer sur un 503
 * effacerait du registre une copie parfaitement vivante.
 *
 * USAGE :
 *   npx tsx --env-file=.env app/scripts/nettoyer-emplacements-fantomes.ts              # simule, n'écrit rien
 *   npx tsx --env-file=.env app/scripts/nettoyer-emplacements-fantomes.ts --max=50     # borne les `files.get`
 *   npx tsx --env-file=.env app/scripts/nettoyer-emplacements-fantomes.ts --appliquer
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { jetonPourSubject } from '../lib/gestion/driveDelegue';
import { query } from '../lib/db/client';
import { estDisparition, motifDisparition } from '../lib/gestion/copieDisparue';
import { deplacerCopieAuRegistre } from '../lib/gestion/driveRepo';
import { marquerCopieDisparue } from '../lib/gestion/nomUsageRepo';
import { noterFichiersDisparus, noterParentDeplace } from '../lib/gestion/empreinteDriveRepo';

/** 🔒 Le compte qui LIT, avec la délégation qui existe déjà — le même que le balayage de l'index. */
const SUJET = 'a.jorel@sansvisavis.com';
const API = 'https://www.googleapis.com/drive/v3';
/** 🔒 Les champs demandés, et pas un de plus. Aucun ne porte de contenu. */
const CHAMPS = 'id,name,parents,trashed';
/** Borne par défaut des `files.get` : au-delà, on veut un chiffre avant de continuer, pas un script qui s'emballe. */
const MAX_DEFAUT = 200;

const APPLIQUER = process.argv.includes('--appliquer');
const MAX = Number((process.argv.find((a) => a.startsWith('--max=')) ?? '').slice(6)) || MAX_DEFAUT;

interface Candidat {
  id: number;
  pieceId: number;
  driveFileId: string;
  registreDossier: string;
  registreNom: string | null;
  /** Ce que l'index en dit. `null` = l'index ne connaît pas ce fichier. */
  indexParent: string | null;
  indexDisparu: boolean;
  dansLIndex: boolean;
}

/**
 * LA PRÉSÉLECTION, EN UNE REQUÊTE.
 *
 * ⚠️ LES LIGNES DÉJÀ MARQUÉES « DISPARUES » SONT HORS SUJET : elles ne sont plus lues par personne (le fragment
 * `copieVivanteAvec` les écarte partout), et les remettre en cause reviendrait à défaire un constat daté.
 */
async function candidats(): Promise<Candidat[]> {
  const { rows } = await query<{
    id: string; piece_id: string; drive_file_id: string; drive_dossier_id: string; dossier_nom: string | null;
    index_parent: string | null; index_disparu: boolean | null; dans_l_index: boolean;
  }>(
    `SELECT d.id::text, d.piece_id::text, d.drive_file_id, d.drive_dossier_id, d.dossier_nom,
            e.parent_id AS index_parent,
            (e.disparu_le IS NOT NULL) AS index_disparu,
            (e.drive_file_id IS NOT NULL) AS dans_l_index
       FROM gestion_piece_drive d
       LEFT JOIN gestion_drive_empreinte e ON e.drive_file_id = d.drive_file_id
      WHERE d.disparu_le IS NULL
        AND btrim(d.drive_file_id) <> ''
        AND (e.drive_file_id IS NULL
             OR e.disparu_le IS NOT NULL
             OR coalesce(e.parent_id, '') <> d.drive_dossier_id)
      ORDER BY d.id`);
  return rows.map((r) => ({
    id: Number(r.id), pieceId: Number(r.piece_id), driveFileId: r.drive_file_id,
    registreDossier: r.drive_dossier_id, registreNom: r.dossier_nom,
    indexParent: r.index_parent, indexDisparu: r.index_disparu === true, dansLIndex: r.dans_l_index,
  }));
}

/** Le nom d'un dossier, lu chez Google. On n'écrit pas un identifiant à la place d'un nom. */
const nomsDeDossier = new Map<string, string>();
async function nomDuDossier(h: HeadersInit, id: string): Promise<string | null> {
  if (id.trim() === '') return null;
  const deja = nomsDeDossier.get(id);
  if (deja !== undefined) return deja;
  const r = await fetch(`${API}/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,name`, { headers: h });
  if (!r.ok) return null;
  const j = (await r.json()) as { name?: string };
  const nom = (j.name ?? '').trim();
  if (nom !== '') nomsDeDossier.set(id, nom);
  return nom === '' ? null : nom;
}

type Verdict =
  | { sorte: 'corriger'; parentReel: string; parentNom: string | null }
  | { sorte: 'disparu'; motif: string }
  | { sorte: 'rien'; pourquoi: string };

/** CE QUE GOOGLE DIT DE CE FICHIER, et ce qu'on en conclut. Un seul `files.get` par candidat. */
async function verdict(h: HeadersInit, c: Candidat): Promise<Verdict> {
  const r = await fetch(
    `${API}/files/${encodeURIComponent(c.driveFileId)}?supportsAllDrives=true&fields=${CHAMPS}`, { headers: h });
  if (!r.ok) {
    /* 🔴 DEUX CODES SEULEMENT VALENT DISPARITION (module PUR `copieDisparue`). Un 429 ou un 503 ne conclut RIEN :
       Google est occupé, le fichier est probablement là, et marquer l'effacerait du registre pour de bon. */
    if (estDisparition(r.status)) return { sorte: 'disparu', motif: motifDisparition(r.status) };
    return { sorte: 'rien', pourquoi: `Google a répondu ${r.status} — on ne conclut rien` };
  }
  const j = (await r.json()) as { parents?: string[]; trashed?: boolean };
  if (j.trashed === true) return { sorte: 'disparu', motif: 'mis à la corbeille du Drive' };
  const parents = j.parents ?? [];
  if (parents.length === 0) return { sorte: 'rien', pourquoi: 'aucun parent rendu — on ne conclut rien' };
  if (parents.includes(c.registreDossier)) {
    return { sorte: 'rien', pourquoi: 'le registre dit vrai (c’est l’index qui était en retard)' };
  }
  const parentReel = parents[0];
  return { sorte: 'corriger', parentReel, parentNom: await nomDuDossier(h, parentReel) };
}

async function main(): Promise<void> {
  const j = await jetonPourSubject(SUJET);
  if (!j.ok) { console.error('🔴 jeton Drive indisponible :', j.motif); process.exit(1); }
  const h = { Authorization: `Bearer ${j.jeton}` };

  const { rows: vives } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM gestion_piece_drive WHERE disparu_le IS NULL AND btrim(drive_file_id) <> ''`);
  const liste = await candidats();
  console.log(`registre : ${vives[0]?.n ?? '?'} lignes vives`);
  console.log(`candidats (présélection en base) : ${liste.length}`);
  console.log(`  · parent divergent de l'index : ${liste.filter((c) => c.dansLIndex && !c.indexDisparu).length}`);
  console.log(`  · index dit « disparu »       : ${liste.filter((c) => c.indexDisparu).length}`);
  console.log(`  · absent de l'index           : ${liste.filter((c) => !c.dansLIndex).length}`);
  if (liste.length === 0) { console.log('\nRien à corriger.'); return; }

  const aVerifier = liste.slice(0, MAX);
  if (aVerifier.length < liste.length) {
    console.log(`\n⚠️ borne : ${aVerifier.length} candidats vérifiés sur ${liste.length} (--max=${MAX})`);
  }
  console.log(`\n${APPLIQUER ? '🔴 APPLICATION' : 'SIMULATION'} — ${aVerifier.length} vérification(s) chez Google\n`);

  let corriges = 0; let disparus = 0; let intacts = 0;
  for (const c of aVerifier) {
    const v = await verdict(h, c);
    const tete = `  ligne ${c.id} · pièce ${c.pieceId} · ${c.driveFileId}`;
    if (v.sorte === 'rien') { intacts += 1; console.log(`${tete} → INTACTE (${v.pourquoi})`); continue; }
    if (v.sorte === 'disparu') {
      disparus += 1;
      console.log(`${tete} → DISPARUE (${v.motif})`);
      if (APPLIQUER) {
        await marquerCopieDisparue(c.driveFileId, v.motif);
        await noterFichiersDisparus([c.driveFileId]);
      }
      continue;
    }
    corriges += 1;
    console.log(`${tete} → CORRIGER le parent`);
    console.log(`        registre : ${c.registreDossier} « ${c.registreNom ?? '?'} »`);
    console.log(`        réel     : ${v.parentReel} « ${v.parentNom ?? '?'} »`);
    if (APPLIQUER) {
      const n = await deplacerCopieAuRegistre(c.driveFileId, v.parentReel, v.parentNom);
      await noterParentDeplace(c.driveFileId, v.parentReel);
      console.log(`        ↳ ${n} ligne(s) de registre mise(s) à jour`);
    }
  }

  console.log(`\nBILAN : ${corriges} à corriger · ${disparus} disparue(s) · ${intacts} intacte(s)`);
  if (!APPLIQUER) console.log('Aucune écriture. Relancer avec --appliquer pour corriger.');
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
