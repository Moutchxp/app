/**
 * CLI `gestion:copie:epreuve` — MODULE « GESTION », LOT COPIE-SURV : L'ÉPREUVE SUR CLUSTER JETABLE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'AUCUN TEST UNITAIRE NE PEUT PROUVER. `npm test` éprouve `etatCopie` sur des objets en mémoire : c'est
 * nécessaire et insuffisant. Ce que PostgreSQL fait VRAIMENT — un trigger append-only qui refuse qu'on corrige un
 * motif d'échec, une contrainte qui rejette une étape inventée, une clé étrangère qui refuse une pièce qui n'existe
 * pas — ne se mesure que sur une vraie base.
 *
 * 🔴 ELLE REFUSE DE S'EXÉCUTER AILLEURS QUE SUR `gestion_jetable`. Elle écrit des passes et des échecs : lancée par
 * mégarde sur la base de travail, elle salirait le journal de la copie réelle. Le garde est la PREMIÈRE chose
 * qu'elle fait.
 *
 * 🔒 ELLE NE TOUCHE À AUCUN SERVICE EXTÉRIEUR : ni Drive, ni Gmail, ni MinIO. Elle n'écrit que dans deux tables de
 * la base jetable, et n'invente aucune donnée personnelle.
 *
 * COMMENT FABRIQUER LA BASE ET LANCER L'ÉPREUVE :
 *   psql -d postgres -c 'DROP DATABASE IF EXISTS gestion_jetable'
 *   psql -d postgres -c 'CREATE DATABASE gestion_jetable'
 *   pg_dump --schema-only --no-owner --no-privileges sansvisavis | psql -q -d gestion_jetable
 *   psql -v ON_ERROR_STOP=1 -d gestion_jetable -f db/migrations/259_gestion_copie_echec.sql
 *   DATABASE_URL=postgresql://localhost:5432/gestion_jetable npm run gestion:copie:epreuve
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { query, closePool } from '../lib/db/client';
import { oublierSchema } from '../lib/gestion/schema';
import { noterEchec } from '../lib/gestion/copieEchecRepo';
import { dernierePasseCopie, motifsEchec, oublierCacheCopie, piecesRestantes } from '../lib/gestion/copieArreteeRepo';
import { etatCopie, motifCourtCopie } from '../lib/gestion/copieArretee';

export const BASE_JETABLE = 'gestion_jetable';

let echecs = 0;
function verifier(quoi: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? '✅' : '❌'} ${quoi}${detail === '' ? '' : ` — ${detail}`}`);
  if (!ok) echecs += 1;
}

/** Est-ce que cette écriture est REFUSÉE par la base ? Rend le message, ou `null` si elle a passé. */
async function refusee(sql: string, params: unknown[] = []): Promise<string | null> {
  try { await query(sql, params); return null; } catch (e) { return (e as Error).message; }
}

async function principal(): Promise<void> {
  const { rows: b } = await query<{ base: string }>('SELECT current_database() AS base');
  if (b[0].base !== BASE_JETABLE) {
    console.error(`\n❌ REFUS : cette épreuve écrit des passes de copie. Base visée « ${b[0].base} », attendue « ${BASE_JETABLE} ».`);
    console.error(`   Relancer avec DATABASE_URL=postgresql://localhost:5432/${BASE_JETABLE}\n`);
    process.exitCode = 1;
    return;
  }
  oublierSchema();
  oublierCacheCopie();
  console.log(`\n╔══ ÉPREUVE DES MOTIFS D'ÉCHEC DE COPIE sur « ${b[0].base} »\n`);

  const { rows: p } = await query<{ id: string }>(
    `INSERT INTO gestion_drive_copie_passe
       (mode, hote, pid, resultat, echecs, pieces_copiees, termine_le, motif_arret)
     VALUES ('applique', 'jetable', 1, 'arret', 11, 2199, now(), '10 échecs d’affilée') RETURNING id`);
  const passeId = Number(p[0].id);

  // ── ① L'ÉCRITURE ET LA RELECTURE ───────────────────────────────────────────────────────────────────────────
  console.log('① les motifs s’écrivent, et se relisent du plus récent au plus ancien');
  /**
   * ⚠️ UNE VRAIE PIÈCE. La clé étrangère refuse un identifiant inventé, et `noterEchec` avale ce refus en silence —
   * par conception, puisqu'un carnet de bord ne doit jamais arrêter la copie. Le test verrait alors zéro motif sans
   * savoir pourquoi : c'est exactement ce qui est arrivé en écrivant cette épreuve.
   */
  const { rows: pieces } = await query<{ id: string }>('SELECT id FROM gestion_piece ORDER BY id LIMIT 1');
  const vraiePiece = pieces.length === 0 ? null : Number(pieces[0].id);
  for (let i = 1; i <= 7; i += 1) {
    await noterEchec({
      passeId, pieceId: vraiePiece, etape: 'envoi', codeHttp: 401,
      motif: `La connexion Google a expiré (essai ${i}).`, rang: i,
    });
  }
  const cinq = await motifsEchec(passeId);
  verifier('cinq motifs au plus — trente noieraient le bandeau', cinq.length === 5, `${cinq.length}`);
  verifier('le plus RÉCENT en tête', cinq[0].motif.includes('essai 7'), cinq[0].motif);
  verifier('le code HTTP est gardé', cinq[0].codeHttp === 401);
  verifier('l’étape est gardée', cinq[0].etape === 'envoi');

  // ── ② APPEND-ONLY ──────────────────────────────────────────────────────────────────────────────────────────
  console.log('\n② 🔴 un motif d’échec est une pièce de preuve : il ne se corrige pas et ne s’efface pas');
  verifier('UPDATE refusé', (await refusee(`UPDATE gestion_drive_copie_echec SET motif = 'réécrit'`)) !== null);
  verifier('DELETE refusé', (await refusee('DELETE FROM gestion_drive_copie_echec')) !== null);
  verifier('TRUNCATE refusé', (await refusee('TRUNCATE gestion_drive_copie_echec')) !== null);

  // ── ③ CE QUE LA BASE REFUSE ────────────────────────────────────────────────────────────────────────────────
  console.log('\n③ ce que la base refuse d’écrire, quoi qu’en dise le code');
  verifier('une étape inventée', (await refusee(
    `INSERT INTO gestion_drive_copie_echec (passe_id, etape, motif) VALUES ($1, 'inventee', 'x')`, [passeId])) !== null);
  verifier('un motif vide', (await refusee(
    `INSERT INTO gestion_drive_copie_echec (passe_id, etape, motif) VALUES ($1, 'envoi', '   ')`, [passeId])) !== null);
  verifier('un code HTTP absurde', (await refusee(
    `INSERT INTO gestion_drive_copie_echec (passe_id, etape, motif, code_http) VALUES ($1,'envoi','x',999)`,
    [passeId])) !== null);
  verifier('une pièce INVENTÉE (la clé étrangère tient)', (await refusee(
    `INSERT INTO gestion_drive_copie_echec (passe_id, piece_id, etape, motif)
     VALUES ($1, 99999999, 'envoi', 'x')`, [passeId])) !== null);
  verifier('une pièce NULLE est ACCEPTÉE : un échec de jeton ne porte sur aucune pièce', (await refusee(
    `INSERT INTO gestion_drive_copie_echec (passe_id, etape, motif) VALUES ($1, 'jeton', 'indisponible')`,
    [passeId])) === null);

  // ── ④ LE BANDEAU LIT L'ÉTAT RÉEL ───────────────────────────────────────────────────────────────────────────
  console.log('\n④ le bandeau lit l’état réel, et dit le dernier motif connu');
  const derniere = await dernierePasseCopie();
  verifier('la dernière passe est lue', derniere !== null && derniere.echecs === 11, `${derniere?.echecs ?? '—'}`);
  const restantes = await piecesRestantes();
  const motifs = await motifsEchec(passeId);
  const e = etatCopie({ derniere, restantes: restantes === 0 ? 5 : restantes, motifs });
  verifier('🔴 ALERTE sur un arrêt subi', e.niveau === 'alerte', e.niveau);
  verifier('elle cite le motif d’arrêt de la passe', e.texte.includes('10 échecs'));
  /**
   * ⚠️ ON COMPARE AU MOTIF LE PLUS RÉCENT, PAS À UNE PHRASE ÉCRITE D'AVANCE. En écrivant cette épreuve, on avait
   * codé « expiré » en dur — mais l'étape ③ insère ensuite un échec de jeton, qui devient le plus récent. Le code
   * avait raison, l'attente était périmée. Un test qui suppose l'ordre de ses propres écritures se trompe tout seul.
   */
  verifier('elle cite le DERNIER motif connu, quel qu’il soit',
    motifs.length > 0 && e.texte.includes(motifCourtCopie(motifs[0])), motifCourtCopie(motifs[0] ?? {
      pieceId: null, etape: '—', codeHttp: null, motif: '—', survenuLe: '',
    }));
  verifier('elle donne la commande de reprise, en AJOUT', (e.aide ?? '').includes('>> ~/Desktop/copie-pieces.log'));

  // ── ⑤ LE BANDEAU SE TAIT QUAND IL LE DOIT ──────────────────────────────────────────────────────────────────
  console.log('\n⑤ 🔴 et il se TAIT quand il le doit');
  verifier('rien pendant une passe EN COURS',
    etatCopie({ derniere: { ...derniere!, termineLe: null }, restantes: 5, motifs }).niveau === 'muet');
  verifier('rien quand tout est copié', etatCopie({ derniere, restantes: 0, motifs }).niveau === 'muet');
  verifier('rien tant qu’on ne sait pas combien il reste',
    etatCopie({ derniere, restantes: null, motifs }).niveau === 'muet');
  verifier('ligne CALME sur un arrêt VOULU',
    etatCopie({
      derniere: { ...derniere!, echecs: 0, motifArret: 'limite de 20 pièces atteinte' },
      restantes: 5, motifs: [],
    }).niveau === 'calme');

  console.log('');
  if (echecs === 0) console.log('╚══ ✅ ÉPREUVE PASSÉE — la base tient tout ce que le code lui demande.\n');
  else { console.log(`╚══ ❌ ${echecs} ÉCHEC(S).\n`); process.exitCode = 1; }
}

void principal().then(closePool, async (e: unknown) => {
  console.error(e);
  process.exitCode = 1;
  await closePool();
});
