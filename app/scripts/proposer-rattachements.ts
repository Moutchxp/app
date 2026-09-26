/**
 * CLI `gestion:rattachement:proposer` — MODULE « GESTION », LOT RATTACHEMENT-1.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒 EN SIMULATION PAR DÉFAUT. Sans `--appliquer`, elle calcule tout, rend ses chiffres, et n'écrit PAS UNE LIGNE.
 * C'est le rapport qu'on relit AVANT d'autoriser l'écriture, et c'est le MÊME moteur qui fournit les deux : sans
 * cela, le rapport annoncerait un classement et l'écriture en ferait un autre.
 *
 * 🔒 ELLE NE TOUCHE À AUCUN SERVICE EXTÉRIEUR. Ni Gmail, ni le Drive, ni MinIO : elle ne lit que
 * `gestion_message_adresse` (posée par le lot DRIVE-2-bis) et l'annuaire, et n'écrit que dans
 * `gestion_rattachement`, `gestion_rattachement_examen` et `gestion_journal`.
 *
 * 🔴 REPRENABLE ET IDEMPOTENTE. Le curseur est l'identifiant du FIL ; relancer après une coupure reprend au fil
 * suivant. Relancer une passe complète ne double rien — et surtout ne défait rien de ce qu'un humain a décidé :
 * un lien confirmé, rejeté ou retiré à la main est respecté, et le rapport DIT combien l'ont été.
 *
 * OPTIONS :
 *   --appliquer            écrit réellement (sans elle : simulation)
 *   --limite=N             s'arrête après N fils examinés — pour un essai borné
 *   --depuis=N             reprend après le fil N, au lieu du curseur calculé
 *   --recommencer          repart de zéro (curseur ignoré). N'EFFACE RIEN : tout est idempotent.
 *   --exemples=N           combien d'exemples de chaque catégorie afficher (défaut 10, 0 pour aucun)
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';
import { query, closePool } from '../lib/db/client';
import { rattachementsDisponibles, adressesMessagesDisponibles } from '../lib/gestion/schema';
import {
  chargerLibelles, chargerPaquet, curseurPasse, examinerPaquet, libelleCible, AUTEUR_MOTEUR,
  COMPTES_VIDES, PAQUET_FILS, type ComptesPasse, type LibellesCibles,
} from '../lib/gestion/rattachementRepo';
import { examinerMessage, type Issue } from '../lib/gestion/rattachement';
import { dureeFr } from '../lib/gestion/copiePieces';

const P = '[gestion:rattachement:proposer]';

export interface Options {
  appliquer: boolean;
  limite: number | null;
  depuis: number | null;
  recommencer: boolean;
  exemples: number;
}

/** Ce que la ligne de commande demande. PUR. */
export function lireOptions(argv: readonly string[]): Options {
  const nombre = (prefixe: string, defaut: number | null): number | null => {
    const a = argv.find((x) => x.startsWith(prefixe));
    if (a === undefined) return defaut;
    const n = Number(a.slice(prefixe.length));
    return Number.isInteger(n) && n >= 0 ? n : defaut;
  };
  return {
    // 🔴 `--appliquer` EXACTEMENT, et rien qui y ressemble : une faute de frappe ne doit pas déclencher l'écriture.
    appliquer: argv.includes('--appliquer'),
    limite: nombre('--limite=', null),
    depuis: nombre('--depuis=', null),
    recommencer: argv.includes('--recommencer'),
    exemples: nombre('--exemples=', 10) ?? 10,
  };
}

/** Un pourcentage lisible, sans division par zéro. PUR. */
export function partFr(n: number, total: number): string {
  if (total === 0) return '—';
  return `${((n / total) * 100).toFixed(1).replace('.', ',')} %`;
}

/** Une ligne d'avancement : elle doit tenir sur une ligne de terminal. PUR. */
export function ligneAvancement(c: ComptesPasse, fils: number, depuis: number): string {
  return `${P}   fil ${depuis} · ${c.filsVus}/${fils} fils · ${c.messagesVus} mails`
    + ` · ${c.automatiques} auto · ${c.aTrier} à trier · ${c.sansCandidat} sans candidat`;
}

/**
 * LES EXEMPLES, pris SUR LES MÊMES DONNÉES et par le MÊME moteur que le rapport.
 *
 * 🔒 AUCUNE ADRESSE E-MAIL, AUCUN NOM DE PERSONNE N'EST IMPRIMÉ. Le rapport sort dans un terminal, parfois dans un
 * fichier de journal : il ne porte que des identifiants, des clés de lot et le nom du BIEN (une adresse postale de
 * logement, pas une donnée de personne). Le domaine de l'adresse est gardé — il dit « un syndic », « un artisan » —
 * mais jamais la partie qui identifie quelqu'un.
 */
async function exemples(
  issue: Issue, combien: number, libelles: LibellesCibles,
): Promise<string[]> {
  if (combien === 0) return [];
  const { rows } = await query<{
    message_id: string; fil_id: string; recu_le: string; sens: string; nb: string; domaine: string | null;
  }>(
    `SELECT m.id AS message_id, m.fil_id, m.recu_le::text, m.sens,
            (SELECT count(*) FROM gestion_piece p WHERE p.message_id = m.id)::text AS nb,
            substring(m.de_adresse from '@(.*)$') AS domaine
       FROM gestion_rattachement_examen e JOIN gestion_message m ON m.id = e.message_id
      WHERE e.issue = $1 ORDER BY m.recu_le DESC LIMIT $2`, [issue, combien]);

  const out: string[] = [];
  for (const r of rows) {
    const { rows: liens } = await query<{ cible_sorte: string; cible_cle: string | null; cible_id: string | null }>(
      `SELECT cible_sorte, cible_cle, cible_id FROM gestion_rattachement
        WHERE message_id = $1 AND statut IN ('propose', 'confirme') ORDER BY id`, [Number(r.message_id)]);
    const cibles = liens.map((l) => libelleCible({
      sorte: l.cible_sorte as 'lot' | 'proprietaire' | 'evenement',
      cle: l.cible_cle, id: l.cible_id === null ? null : Number(l.cible_id),
    }, libelles));
    out.push(
      `mail ${String(r.message_id).padStart(6)} · fil ${String(r.fil_id).padStart(6)}`
      + ` · ${r.recu_le.slice(0, 10)} · ${r.sens === 'envoye' ? 'envoyé' : 'reçu'}`
      + ` · ${r.nb} pièce(s) · de @${r.domaine ?? '?'}`
      + (cibles.length === 0 ? ' → aucune cible' : ` → ${cibles.join(' | ')}`));
  }
  return out;
}

/**
 * LES EXEMPLES D'UNE SIMULATION : rien n'est en base, on les prend donc DANS LE CALCUL.
 *
 * 🔴 C'EST LE MÊME `examinerMessage` QUE LA PASSE RÉELLE. Un second chemin de calcul pour la démonstration n'aurait
 * aucune valeur de preuve — c'est la même règle qui fait que le rapport à blanc et l'écriture ne peuvent pas
 * diverger.
 *
 * 🔴 LES DEUX SOUS-CAS DE CHAQUE CATÉGORIE SONT REPRÉSENTÉS, et c'est le point de cette fonction. Prendre les dix
 * premiers venus donnait dix fois le même cas (mesuré : les dix « à trier » sortaient tous de la règle b) — donc une
 * démonstration qui cachait précisément l'arbitrage à plusieurs cibles, celui qu'on veut juger. On remplit donc des
 * seaux séparés, moitié-moitié, et chaque ligne DIT de quel sous-cas elle relève.
 *
 * ⚠️ ON PARCOURT DE LA FIN VERS LE DÉBUT : les mails les plus récents sont ceux qu'Arno reconnaît, donc les seuls
 * sur lesquels il puisse dire si le moteur a eu raison.
 */
type SousCas = 'a' | 'b' | 'inconnu' | 'sans_cible' | 'certain';

function sousCasDe(examen: ReturnType<typeof examinerMessage>): SousCas {
  if (examen.issue === 'automatique') return 'certain';
  if (examen.issue === 'a_trier') return examen.candidats[0]?.regle === 'a' ? 'a' : 'b';
  return examen.adressesUtiles === 0 ? 'inconnu' : 'sans_cible';
}

const MOT_SOUS_CAS: Record<SousCas, string> = {
  certain: '', a: '[règle a — plusieurs cibles]', b: '[règle b — l’échange]',
  inconnu: '[adresses inconnues]', sans_cible: '[reconnues, aucun lot à la date]',
};

async function exemplesSimules(combien: number, libelles: LibellesCibles): Promise<Record<Issue, string[]>> {
  const out: Record<Issue, string[]> = { automatique: [], a_trier: [], sans_candidat: [] };
  if (combien === 0) return out;

  const seaux: Record<SousCas, string[]> = { certain: [], a: [], b: [], inconnu: [], sans_cible: [] };
  const plafond = (s: SousCas): number => (s === 'certain' ? combien : Math.ceil(combien / 2));
  const plein = (): boolean => (['certain', 'a', 'b', 'inconnu', 'sans_cible'] as const)
    .every((s) => seaux[s].length >= plafond(s));

  const { rows: bornes } = await query<{ n: string | null }>('SELECT max(fil_id)::text AS n FROM gestion_message');
  let haut = Number(bornes[0]?.n ?? 0);
  const PAS = 400;

  while (haut > 0 && !plein()) {
    const paquet = await chargerPaquet(Math.max(haut - PAS, 0), PAS);
    if (paquet.fils.length === 0) break;
    // Les plus récents d'abord à l'intérieur du paquet aussi.
    for (const m of [...paquet.messages].reverse()) {
      const examen = examinerMessage({ messageId: m.id, adressesEchange: paquet.adresses.get(m.filId) ?? [] });
      const s = sousCasDe(examen);
      if (seaux[s].length >= plafond(s)) continue;
      const cibles = examen.certain !== null
        ? [libelleCible(examen.certain.cible, libelles)]
        : examen.candidats.map((c) => libelleCible(c.cible, libelles));
      seaux[s].push(
        `mail ${String(m.id).padStart(6)} · fil ${String(m.filId).padStart(6)}`
        + ` · ${examen.adressesUtiles} adresse(s) reconnue(s)`
        + (MOT_SOUS_CAS[s] === '' ? '' : ` ${MOT_SOUS_CAS[s]}`)
        + (cibles.length === 0 ? ` · ${examen.motif}` : ` → ${cibles.join(' | ')}`));
    }
    haut = Math.max(haut - PAS, 0);
  }

  out.automatique = seaux.certain;
  out.a_trier = [...seaux.a, ...seaux.b];
  out.sans_candidat = [...seaux.sans_cible, ...seaux.inconnu];
  return out;
}

async function principal(): Promise<void> {
  const o = lireOptions(process.argv.slice(2));
  console.log('');
  console.log(`${P} ${o.appliquer ? '── PASSE RÉELLE ──' : '── SIMULATION (aucune écriture) ──'}`);

  if (!(await adressesMessagesDisponibles())) {
    console.error(`${P} ❌ La migration 256 n’est pas appliquée : sans la trace des adresses, il n’y a rien à lire.`);
    console.error(`${P}    psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/256_gestion_arrivee_adresses.sql\n`);
    process.exitCode = 1;
    return;
  }

  const schemaPret = await rattachementsDisponibles();
  if (o.appliquer && !schemaPret) {
    console.error(`${P} ❌ La migration 257 n’est pas appliquée : il n’y a nulle part où écrire les rattachements.`);
    console.error(`${P}    cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)`);
    console.error(`${P}    psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/257_gestion_rattachement.sql\n`);
    process.exitCode = 1;
    return;
  }
  if (!schemaPret) {
    console.log(`${P} ⚠️ Migration 257 NON appliquée — la simulation fonctionne quand même : elle ne lit que les`);
    console.log(`${P}    adresses de la 256 et l’annuaire de la 253, et n’écrit rien. Seul « --appliquer » l’exige.`);
  }

  const { rows: tot } = await query<{ fils: string; messages: string }>(
    'SELECT count(DISTINCT fil_id)::text AS fils, count(*)::text AS messages FROM gestion_message');
  const filsTotal = Number(tot[0].fils);
  console.log(`${P} à examiner : ${filsTotal} fils · ${tot[0].messages} mails`);

  const libelles = await chargerLibelles();
  console.log(`${P} annuaire : ${libelles.lots.size} lots · ${libelles.proprietaires.size} propriétaires`);

  const debut = Date.now();
  const c: ComptesPasse = { ...COMPTES_VIDES };

  let depuis = o.recommencer ? 0 : (o.depuis ?? (schemaPret ? await curseurPasse() : 0));
  if (depuis > 0) console.log(`${P} reprise après le fil ${depuis}`);

  for (;;) {
    if (o.limite !== null && c.filsVus >= o.limite) break;
    const reste = o.limite === null ? PAQUET_FILS : Math.min(PAQUET_FILS, o.limite - c.filsVus);
    const suivant = await examinerPaquet(depuis, reste, libelles, c, o.appliquer);
    if (suivant === null) break;
    depuis = suivant;
    if (c.filsVus % (PAQUET_FILS * 5) === 0) console.log(ligneAvancement(c, filsTotal, depuis));
  }

  // ── LE RAPPORT ────────────────────────────────────────────────────────────────────────────────────────────────
  const m = c.messagesVus;
  console.log('');
  console.log(`${P} ── ${o.appliquer ? 'PASSE' : 'SIMULATION'} ── ${dureeFr(Date.now() - debut)}`);
  console.log(`${P} fils examinés .............. ${c.filsVus}`);
  console.log(`${P} mails examinés ............. ${m}`);
  console.log(`${P} ① rattachés automatiquement  ${c.automatiques} (${partFr(c.automatiques, m)})`);
  console.log(`${P} ② à trier .................. ${c.aTrier} (${partFr(c.aTrier, m)})`);
  console.log(`${P}     · le mail désigne PLUSIEURS cibles (règle a) ... ${c.aTrierParLeMail}`);
  console.log(`${P}     · le mail ne dit rien, l’échange oui (règle b) . ${c.aTrierParLEchange}`);
  console.log(`${P} ③ sans aucun candidat ...... ${c.sansCandidat} (${partFr(c.sansCandidat, m)})`);
  console.log(`${P}     · aucune adresse connue de l’annuaire .......... ${c.sansCandidatInconnu}`);
  console.log(`${P}     · reconnues, mais AUCUN lot à la date du mail .. ${c.sansCandidatSansCible}`);
  console.log(`${P} liens vivants posés ........ ${c.liensEcrits}`);
  console.log(`${P} candidats proposés ......... ${c.candidatsEcrits}`);
  if (o.appliquer) {
    console.log(`${P} liens périmés retirés ...... ${c.liensRetires}`);
    console.log(`${P} 🔴 décisions humaines respectées : ${c.respectes} (ni écrasées, ni ressuscitées)`);
  }

  // ── LES EXEMPLES ──────────────────────────────────────────────────────────────────────────────────────────────
  if (o.exemples > 0) {
    const titres: Record<Issue, string> = {
      automatique: `① ${o.exemples} RATTACHÉS AUTOMATIQUEMENT`,
      a_trier: `② ${o.exemples} À TRIER`,
      sans_candidat: `③ ${o.exemples} SANS AUCUN CANDIDAT`,
    };
    const simules = o.appliquer ? null : await exemplesSimules(o.exemples, libelles);
    for (const issue of ['automatique', 'a_trier', 'sans_candidat'] as const) {
      const lignes = simules !== null ? simules[issue] : await exemples(issue, o.exemples, libelles);
      console.log('');
      console.log(`${P} ${titres[issue]}`);
      if (lignes.length === 0) console.log(`${P}   (aucun)`);
      for (const l of lignes) console.log(`${P}   ${l}`);
    }
  }

  if (!o.appliquer) {
    console.log('');
    console.log(`${P} 🔒 RIEN N’A ÉTÉ ÉCRIT. Pour écrire : npm run gestion:rattachement:proposer -- --appliquer`);
  } else {
    await query(
      `INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_libelle)
       VALUES ('rattachement', $1, 'passe', $2, $3)`,
      [c.messagesVus,
        `${c.messagesVus} mails examinés : ${c.automatiques} automatiques, ${c.aTrier} à trier, `
        + `${c.sansCandidat} sans candidat ; ${c.liensEcrits} liens, ${c.candidatsEcrits} candidats, `
        + `${c.respectes} décisions humaines respectées`,
        AUTEUR_MOTEUR.libelle]);
  }
  console.log('');
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void principal().then(closePool, async (e: unknown) => {
    console.error(e);
    process.exitCode = 1;
    await closePool();
  });
}
