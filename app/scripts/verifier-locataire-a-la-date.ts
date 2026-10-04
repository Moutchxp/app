/**
 * ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 2 — LA VÉRIFICATION DES 89 CAS. LECTURE SEULE ══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (04/10/2026) : « la fenêtre et l'historique nomment le locataire en place à la date du MAIL
 * AFFICHÉ (enTete.recuLe) […] Vérifie le cas fil 36475 / message 57119. Relance l'audit : 0 couple faux. »
 *
 * ═══ 🔴🔴 POURQUOI CE SCRIPT ET PAS UNE RETOUCHE DU SCRIPT D'AUDIT ═══════════════════════════════════════════════
 *
 * L'audit mesurait l'écart en RÉÉCRIVANT la règle de la fenêtre en SQL (`dateFenetre` = la date du mail le plus
 * récent de l'échange portant ce lien). Corriger cette requête pour qu'elle lise la date du mail affiché donnerait
 * **0 par construction** : on aurait changé l'instrument, pas mesuré la correction. Ce serait une tautologie, et
 * elle passerait pour une preuve.
 *
 * 🔴 CE SCRIPT APPELLE DONC LA VRAIE FONCTION DE PRODUCTION — `ficheRattachementDuFil(filId, messageId)`, celle
 * que la route appelle — et compare ce qu'elle NOMME au locataire que la base dit en place à la date de CE mail.
 * Aucune ligne de la règle n'est réécrite ici ; le SQL de ce fichier ne sert qu'à DÉSIGNER les couples à éprouver
 * et à dire la vérité de l'occupation.
 *
 * ═══ 🔴 L'UNIVERS ÉPROUVÉ : TOUS LES COUPLES, ET VOICI POURQUOI ══════════════════════════════════════════════════
 *
 * ⚠️ MA PREMIÈRE VERSION BORNAIT L'ÉPREUVE AUX LOGEMENTS À PLUSIEURS OCCUPANTS, en me disant que l'occupant d'un
 * logement à occupation unique est le même à toute date. C'ÉTAIT FAUX, et la mesure l'a dit : 66 couples faux
 * dans cet univers restreint contre 89 trouvés par l'audit sur la base entière. Les 23 manquants sont sur des
 * logements à UNE SEULE occupation — un bail a une ENTRÉE et une SORTIE, et un mail peut tomber avant l'une ou
 * après l'autre : « vacant à cette date » puis « occupé » est déjà un changement d'occupant.
 *
 * 🔴 L'ÉPREUVE PORTE DONC SUR LES 11 706 COUPLES, sans restriction. C'est plus long (une fiche de fenêtre par
 * mail), et c'est le prix d'une preuve qui ne repose pas sur un raisonnement que je viens de voir céder.
 *
 * ═══ 🔒 LECTURE SEULE ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Aucun verbe d'écriture, aucun appel réseau, aucun fichier écrit. Un garde relit son propre source et refuse de
 * démarrer sinon — comme la photographie du point 1.
 *
 * USAGE :  npx tsx --env-file=.env app/scripts/verifier-locataire-a-la-date.ts
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs';
import { query } from '../lib/db/client';
import { ficheRattachementDuFil } from '../lib/gestion/ficheRattachementRepo';

const VERBES = ['INSERT ', 'UPDATE ', 'DELETE ', 'TRUNCATE', 'ALTER ', 'CREATE ', 'DROP ', 'COMMIT'];

/**
 * 🔒 LE GARDE INSPECTE LE CODE, PAS LA PROSE. Leçon du script d'audit, qui s'était dénoncé sur sa propre
 * documentation : celle qui NOMME les verbes interdits pour expliquer qu'elle les interdit.
 */
function gardeLectureSeule(): void {
  const src = readFileSync(new URL(import.meta.url).pathname, 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
    .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
    .filter((l) => !l.includes('VERBES'))
    .join('\n')
    .toUpperCase();
  const fautifs = VERBES.filter((v) => code.includes(v));
  if (fautifs.length > 0) {
    throw new Error(`garde lecture seule : verbe d'écriture dans ce script — ${fautifs.join(', ')}`);
  }
}

interface Couple {
  fil_id: string; message_id: string; cible_cle: string; d_mail: string;
  /** LA VÉRITÉ : qui occupait ce logement à la date de CE mail. `null` = personne (vacant). */
  verite: string | null;
  /** Ce que l'ANCIEN code nommait : l'occupant à la date du mail le plus récent du fil portant ce lien. */
  ancien: string | null;
}

/** Les noms d'un bien dans la fenêtre, triés et joints — la forme comparable à `string_agg(DISTINCT …)`. */
function nommesParLaFenetre(
  biens: readonly { cle: string; personnes: readonly { role: string; nom: string }[] }[],
  cle: string,
): string | null {
  const bien = biens.find((b) => b.cle === cle);
  if (bien === undefined) return undefined as unknown as null; // le bien n'est pas dans la fenêtre : cas à part
  const noms = [...new Set(bien.personnes.filter((p) => p.role === 'locataire').map((p) => p.nom))].sort();
  return noms.length === 0 ? null : noms.join('+');
}

/** Même normalisation des deux côtés : `string_agg` ne garantit pas l'ordre, et un colocataire n'est pas un écart. */
function normaliser(v: string | null): string | null {
  if (v === null) return null;
  return v.split('+').map((s) => s.trim()).filter((s) => s !== '').sort().join('+');
}

async function principal(): Promise<void> {
  gardeLectureSeule();

  /**
   * ① LES COUPLES À ÉPROUVER, ET LES DEUX RÉPONSES DE RÉFÉRENCE.
   *
   * ⚠️ `string_agg(DISTINCT …)` DES DEUX CÔTÉS : un logement peut avoir plusieurs co-occupants à la même date, et
   * comparer un seul nom ferait voir un écart là où il n'y a qu'un colocataire de plus.
   */
  const { rows: couples } = await query<Couple>(
    `WITH liens AS (
       SELECT DISTINCT m.id AS message_id, m.fil_id, lo.id AS lot_id, r.cible_cle,
              (m.recu_le AT TIME ZONE 'UTC')::date AS d_mail
         FROM gestion_rattachement r
         JOIN gestion_message m ON m.id = r.message_id
         JOIN gestion_annuaire_lot lo ON lo.wippimmo_id = r.cible_cle
        WHERE r.statut = 'confirme' AND r.cible_sorte = 'lot' AND r.cible_cle IS NOT NULL
          AND r.piece_id IS NULL
     ),
     dateFenetre AS (SELECT fil_id, lot_id, max(d_mail) AS d_fen FROM liens GROUP BY fil_id, lot_id)
     SELECT l.fil_id::text, l.message_id::text, l.cible_cle, l.d_mail::text,
            (SELECT string_agg(DISTINCT lc.nom, '+') FROM gestion_annuaire_occupation o
               JOIN gestion_annuaire_locataire lc ON lc.id = o.locataire_id
              WHERE o.lot_id = l.lot_id AND (o.entree IS NULL OR o.entree <= l.d_mail)
                AND (o.sortie IS NULL OR o.sortie >= l.d_mail)) AS verite,
            (SELECT string_agg(DISTINCT lc.nom, '+') FROM gestion_annuaire_occupation o
               JOIN gestion_annuaire_locataire lc ON lc.id = o.locataire_id
              WHERE o.lot_id = l.lot_id AND (o.entree IS NULL OR o.entree <= f.d_fen)
                AND (o.sortie IS NULL OR o.sortie >= f.d_fen)) AS ancien
       FROM liens l JOIN dateFenetre f ON f.fil_id = l.fil_id AND f.lot_id = l.lot_id
      ORDER BY l.fil_id, l.message_id, l.cible_cle`);

  const avantFaux = couples.filter((c) => normaliser(c.verite) !== normaliser(c.ancien));
  process.stdout.write(`vérification « locataire à la date du mail »\n`);
  process.stdout.write(`  couples (mail, bien) éprouvés — TOUS ................. ${couples.length}\n`);
  process.stdout.write(`  dont faux AVANT la correction ......................... ${avantFaux.length}\n`);

  /**
   * ② LA FENÊTRE, VRAIMENT APPELÉE. Une fiche par couple (fil, mail) — la fenêtre fait exactement cet appel —
   * mise en cache par mail pour ne pas la recalculer une fois par bien d'un même mail.
   */
  const parMail = new Map<string, Awaited<ReturnType<typeof ficheRattachementDuFil>>>();
  const faux: string[] = [];
  const absents: string[] = [];
  let n = 0;
  for (const c of couples) {
    const k = `${c.fil_id}|${c.message_id}`;
    let fiche = parMail.get(k);
    if (fiche === undefined) {
      fiche = await ficheRattachementDuFil(Number(c.fil_id), Number(c.message_id));
      parMail.set(k, fiche);
    }
    const dit = nommesParLaFenetre(fiche.biens, c.cible_cle);
    if (dit === undefined) { absents.push(`fil ${c.fil_id} / message ${c.message_id} — bien ${c.cible_cle}`); continue; }
    if (normaliser(dit) !== normaliser(c.verite)) {
      faux.push(`fil ${c.fil_id} / message ${c.message_id} — bien ${c.cible_cle} — au ${c.d_mail} : `
        + `vérité « ${c.verite ?? 'vacant'} », la fenêtre nomme « ${dit ?? 'vacant'} »`);
    }
    n += 1;
  }

  process.stdout.write(`  fiches de fenêtre calculées .......................... ${parMail.size}\n`);
  process.stdout.write(`  couples comparés à la production ..................... ${n}\n`);
  process.stdout.write(`  🔴 couples FAUX après la correction .................. ${faux.length}\n`);
  if (absents.length > 0) {
    process.stdout.write(`  ⚠️ biens absents de la fenêtre (hors sujet) .......... ${absents.length}\n`);
    for (const a of absents.slice(0, 10)) process.stdout.write(`      · ${a}\n`);
  }
  for (const f of faux.slice(0, 30)) process.stdout.write(`      · ${f}\n`);

  /** ③ LE CAS NOMMÉ PAR ARNO, dit en clair — c'est celui qu'il ira regarder. */
  const arno = await ficheRattachementDuFil(36475, 57119);
  const bien = arno.biens.find((b) => b.cle === '315');
  process.stdout.write(`\ncas d'Arno — fil 36475 / message 57119\n`);
  process.stdout.write(`  en-tête de la fenêtre ................ ${arno.enTete?.recuLe ?? '(aucun)'}\n`);
  process.stdout.write(`  date qui décide du locataire ......... ${bien?.dateMail ?? '(aucune)'}\n`);
  process.stdout.write(`  locataire(s) nommé(s) ................ ${
    (bien?.personnes ?? []).filter((p) => p.role === 'locataire').map((p) => p.nom).join(', ') || 'vacant'}\n`);
  process.stdout.write(`  occupant(s) d'aujourd'hui ............ ${
    (bien?.occupantsAujourdhui ?? []).map((o) => o.nom).join(', ') || 'vacant'}\n`);

  process.exitCode = faux.length === 0 ? 0 : 1;
}

void principal().then(() => process.exit(process.exitCode ?? 0));
