/**
 * CLI `gestion:non-remise:rattraper` — MODULE « GESTION », LOT ENVOI-DIAG : LIRE LES AVIS DÉJÀ EN BASE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'ELLE FAIT, ET POURQUOI IL FAUT LA LANCER UNE FOIS. La relève ne regarde que les sept derniers jours — c'est
 * ce qu'il faut pour le courant, et c'est borné. Mais 137 avis dorment en base depuis des mois, dont des échecs
 * définitifs que personne n'a jamais vus : des quittances refusées, des adresses qui n'existent plus. Cette commande
 * les lit tous, une fois, et rattache ceux qui citent un message que nous connaissons.
 *
 * 🔒 LECTURE SEULE PARTOUT SAUF `gestion_non_remise`. Elle ne touche ni Gmail, ni le Drive, ni MinIO : elle relit des
 * messages déjà capturés. Aucun mail n'est marqué lu, aucun libellé n'est posé, aucun message n'est envoyé.
 *
 * ⚠️ REJOUABLE SANS PRÉCAUTION. La clé unique sur `avis_message_id` fait qu'un avis déjà lu n'est pas relu : la
 * relancer ne produit ni doublon ni second comptage.
 *
 * USAGE :
 *   npm run gestion:non-remise:rattraper                 # toute l'histoire
 *   npm run gestion:non-remise:rattraper -- --jours=30   # seulement les 30 derniers jours
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { query, closePool } from '../lib/db/client';
import { nonRemiseDisponible, oublierSchema } from '../lib/gestion/schema';
import {
  chiffresNonRemise, COMPTES_AVIS_VIDES, lireAvisEnAttente, type ComptesAvis,
} from '../lib/gestion/nonRemiseRepo';

const P = '[gestion:non-remise:rattraper]';
/** Assez pour couvrir toute l'histoire de la boîte : la capture a commencé en 2024. */
const TOUTE_L_HISTOIRE_JOURS = 4000;
/** Par paquets : on veut pouvoir suivre l'avancement, et ne pas tenir 137 lignes en mémoire pour rien. */
const PAQUET = 200;

function jours(argv: readonly string[]): number {
  const brut = argv.find((a) => a.startsWith('--jours='))?.slice(8) ?? '';
  if (brut.trim() === '') return TOUTE_L_HISTOIRE_JOURS;
  const n = Number(brut);
  return Number.isInteger(n) && n > 0 ? n : TOUTE_L_HISTOIRE_JOURS;
}

async function principal(): Promise<void> {
  const j = jours(process.argv.slice(2));
  oublierSchema();

  if (!(await nonRemiseDisponible())) {
    console.error(`${P} ❌ La migration 261 n’est pas appliquée. À faire d’abord :`);
    console.error(`${P}    psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/261_gestion_non_remise.sql\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n${P} lecture des avis de non-remise sur ${j} jour(s) — aucun envoi, aucune écriture Gmail\n`);

  const c: ComptesAvis = { ...COMPTES_AVIS_VIDES };
  /**
   * ⚠️ ON BOUCLE JUSQU'À CE QU'UN PAQUET N'APPORTE PLUS RIEN. `lireAvisEnAttente` écarte de lui-même les avis déjà
   * inscrits, donc chaque tour avance — sauf si un paquet entier ne contient que des messages reconnus « pas un
   * avis » ou « bonne remise » : ceux-là ne reçoivent jamais de ligne, et le paquet suivant les ramènerait
   * indéfiniment. On s'arrête donc sur « rien d'inscrit », et on le dit.
   */
  for (let tour = 1; tour <= 200; tour += 1) {
    const avant = { ...c };
    await lireAvisEnAttente(j, PAQUET, c);
    const nouveaux = c.inscrits - avant.inscrits;
    const vus = c.examines - avant.examines;
    if (vus === 0) break;
    console.log(`${P} tour ${String(tour).padStart(3)} : ${vus} message(s) examiné(s), `
      + `${c.reconnus - avant.reconnus} avis reconnu(s), ${nouveaux} inscrit(s)`);
    if (nouveaux === 0) {
      console.log(`${P}           (ce paquet n’a rien apporté : ni avis nouveau, ni échec — on s’arrête ici)`);
      break;
    }
  }

  console.log(`\n${P} ── RÉSULTAT ──`);
  console.log(`${P} messages examinés ......... ${c.examines}`);
  console.log(`${P} reconnus comme avis ....... ${c.reconnus}`);
  console.log(`${P} inscrits .................. ${c.inscrits}`);
  console.log(`${P}   dont rattachés à leur message d’origine : ${c.rattaches}`);
  console.log(`${P}   dont sans message connu (envoi hors app) : ${c.orphelins}`);

  const t = await chiffresNonRemise();
  if (t !== null) {
    console.log(`\n${P} ── EN BASE, AU TOTAL ──`);
    console.log(`${P} avis lus .................. ${t.total}`);
    console.log(`${P}   échecs DÉFINITIFS ....... ${t.permanents}   (le message n’arrivera pas)`);
    console.log(`${P}   retards ................. ${t.temporaires}  (le serveur distant réessaie)`);
    console.log(`${P}   rattachés / orphelins ... ${t.rattaches} / ${t.orphelins}`);
  }

  // Les cinq derniers échecs définitifs rattachés : de quoi vérifier d'un coup d'œil que le rattachement est juste.
  const { rows } = await query<{ objet: string | null; destinataire: string | null; motif: string; le: string }>(
    `SELECT m.objet, n.destinataire, n.motif, to_char(n.constate_le, 'DD/MM/YYYY HH24:MI') AS le
       FROM gestion_non_remise n JOIN gestion_message m ON m.id = n.origine_message_id
      WHERE n.sorte = 'permanent'
      ORDER BY n.constate_le DESC LIMIT 5`);
  if (rows.length > 0) {
    console.log(`\n${P} ── DERNIERS ÉCHECS DÉFINITIFS RATTACHÉS ──`);
    for (const r of rows) {
      console.log(`${P}   ${r.le} · ${r.destinataire ?? '(destinataire inconnu)'} · ${r.motif}`);
      console.log(`${P}     objet du message : ${(r.objet ?? '(sans objet)').slice(0, 70)}`);
    }
  }
  console.log('');
}

void principal().then(closePool, async (e: unknown) => {
  console.error(e);
  process.exitCode = 1;
  await closePool();
});
