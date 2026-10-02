/**
 * ══ 🔴🔴 LOT SUIVI-DERNIER-CHOIX — « SEUL LE DERNIER CHOIX EXISTE », APPLIQUÉ À L'EXISTANT ════════════════════
 *
 * CONSTAT D'ARNO (02/10/2026), fil 546 / message 57242 : QUATRE repères empilés au même endroit — « À partir
 * d'ici : aucun bien » trois fois, puis « À partir d'ici : lot 365, lot 366 ». « Les décisions successives
 * s'accumulent : ça n'a aucun intérêt. »
 *
 *   npm run gestion:suivi:dernier-choix                → SIMULATION : elle compte et montre, elle n'écrit rien
 *   npm run gestion:suivi:dernier-choix -- --appliquer  → elle écrit
 *
 * ═══ CE QU'ELLE FAIT, ET DANS QUEL ORDRE ═══════════════════════════════════════════════════════════════════════
 *
 *   ① RÈGLE 1 — par point de départ, elle ne garde que la DERNIÈRE décision posée (période ou exception).
 *   ② RÈGLE 2 — parmi les survivantes, elle retire celles qui disent la même chose que ce qui était déjà en
 *      vigueur juste avant leur mail : elles ne changeaient rien, elles n'ont pas à laisser de repère.
 *   ③ Elle REPROJETTE chaque conversation touchée, parce qu'une décision retirée peut rendre des mails à la
 *      configuration précédente — et `gestion_rattachement` est la table que tout le reste de l'application lit.
 *
 * 🔴 LA DÉCISION EST AU MODULE PUR (`simplifierLeSuivi`), pas ici : ce fichier lit, affiche et écrit. C'est ce qui
 * permet d'éprouver les deux règles sur une table de cas, sans base.
 *
 * ═══ 🔴 CE QU'ELLE NE FAIT JAMAIS ══════════════════════════════════════════════════════════════════════════════
 *
 *   · elle ne SUPPRIME rien : une période est datée et signée (`remplacee_le`, `remplacee_par_libelle`), une
 *     exception est datée (`retiree_le`) et le journal porte la signature ;
 *   · elle ne touche pas un rattachement posé À LA MAIN (la reprojection ne retire que ce que le suivi a posé) ;
 *   · elle ne touche pas une conversation qu'elle ne simplifie pas ;
 *   · elle est REJOUABLE : une seconde passe ne trouve plus rien.
 */
import { query } from '../lib/db/client';
import { simplifierLeFil, suiviDuFil, mailsDuFil } from '../lib/gestion/periodeRepo';
import { motClassement, simplifierLeSuivi } from '../lib/gestion/periodesConversation';
import { periodesDisponibles, rattachementsDisponibles } from '../lib/gestion/schema';

const P = '  ';
const EXEMPLES = 10;
/** 🔴 LE FIL DU CONSTAT D'ARNO : il est montré D'OFFICE, qu'il sorte ou non dans les dix premiers. */
const FIL_DU_CONSTAT = 546;
const AUTEUR = { id: null, libelle: 'reprise « seul le dernier choix »' };

interface Vu {
  filId: number;
  pointsEmpiles: number;
  decisionsRedondantes: number;
  periodesRetirees: number[];
  exceptionsRetirees: number[];
  /** De quoi écrire l'exemple sans relire la base. */
  avant: string[];
  apres: string[];
}

async function confirmes(): Promise<number> {
  const { rows } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM gestion_rattachement
      WHERE statut = 'confirme' AND cible_sorte = 'lot' AND piece_id IS NULL`);
  return rows[0]?.n ?? 0;
}

/**
 * CE QUE CHAQUE CONVERSATION DEVIENDRAIT. LECTURE SEULE.
 *
 * ⚠️ ON NE REGARDE QUE LES CONVERSATIONS QUI ONT AU MOINS UNE PÉRIODE OU UNE EXCEPTION VIVANTE : les autres n'ont
 * rien à désempiler, et il y en a des dizaines de milliers.
 */
async function aSimplifier(): Promise<Vu[]> {
  const { rows: fils } = await query<{ fil_id: string }>(
    `SELECT DISTINCT fil_id::text AS fil_id FROM gestion_fil_periode WHERE remplacee_le IS NULL
     UNION
     SELECT DISTINCT m.fil_id::text FROM gestion_message_exception e JOIN gestion_message m ON m.id = e.message_id
      WHERE e.retiree_le IS NULL`);

  const out: Vu[] = [];
  for (const f of fils) {
    const filId = Number(f.fil_id);
    const mails = await mailsDuFil(filId);
    if (mails.length === 0) continue;
    const { periodes, exceptions } = await suiviDuFil(filId);
    const quoi = simplifierLeSuivi({ mails, periodes, exceptions });
    if (quoi.periodesRetirees.length === 0 && quoi.exceptionsRetirees.length === 0) continue;

    const rang = new Map(mails.map((m, i) => [m, i + 1]));
    const retirees = new Set(quoi.periodesRetirees);
    const sansException = new Set(quoi.exceptionsRetirees);
    const ligne = (ou: number, quoiDit: string): string => `mail ${rang.get(ou) ?? '?'} → ${quoiDit}`;
    out.push({
      filId,
      pointsEmpiles: quoi.pointsEmpiles,
      decisionsRedondantes: quoi.decisionsRedondantes,
      periodesRetirees: quoi.periodesRetirees,
      exceptionsRetirees: quoi.exceptionsRetirees,
      avant: [
        ...periodes.map((p) => ligne(p.depuisMessageId, motClassement(p.classement))),
        ...exceptions.map((e) => ligne(e.messageId, `exception : ${motClassement(e.classement)}`)),
      ],
      apres: [
        ...periodes.filter((p) => !retirees.has(p.id))
          .map((p) => ligne(p.depuisMessageId, motClassement(p.classement))),
        ...exceptions.filter((e) => !sansException.has(e.messageId))
          .map((e) => ligne(e.messageId, `exception : ${motClassement(e.classement)}`)),
      ],
    });
  }
  return out;
}

function montrer(v: Vu): void {
  console.log(`${P}── fil ${v.filId} — ${v.pointsEmpiles} point(s) de départ empilé(s), `
    + `${v.decisionsRedondantes} décision(s) sans effet`);
  console.log(`${P}   AVANT (${v.avant.length}) : ${v.avant.join(' · ')}`);
  console.log(`${P}   APRÈS (${v.apres.length}) : ${v.apres.join(' · ') || '(plus aucune décision)'}`);
}

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  if (!(await periodesDisponibles()) || !(await rattachementsDisponibles())) {
    console.error('Migrations 257 / 290 absentes : rien à faire.');
    process.exit(1);
  }

  const avant = await confirmes();
  const liste = await aSimplifier();
  const periodes = liste.reduce((n, v) => n + v.periodesRetirees.length, 0);
  const exceptions = liste.reduce((n, v) => n + v.exceptionsRetirees.length, 0);

  console.log('\nAVANT');
  console.log(`${P}rattachements « lot » confirmés  ${avant}`);
  console.log(`${P}conversations à désempiler  ${liste.length}`);
  console.log(`${P}  dont points de départ portant PLUSIEURS décisions  `
    + `${liste.reduce((n, v) => n + v.pointsEmpiles, 0)}`);
  console.log(`${P}  dont décisions SANS EFFET (même configuration qu'avant)  `
    + `${liste.reduce((n, v) => n + v.decisionsRedondantes, 0)}`);
  console.log(`${P}décisions à retirer  ${periodes} période(s) + ${exceptions} exception(s)`);

  const duConstat = liste.filter((v) => v.filId === FIL_DU_CONSTAT);
  const autres = liste.filter((v) => v.filId !== FIL_DU_CONSTAT).slice(0, EXEMPLES - duConstat.length);
  console.log(`\n${duConstat.length + autres.length} EXEMPLE(S)`);
  for (const v of [...duConstat, ...autres]) montrer(v);
  if (duConstat.length === 0) {
    console.log(`${P}⚠️ le fil ${FIL_DU_CONSTAT} (constat d’Arno) n’est PAS dans la liste : plus rien à y désempiler.`);
  }

  if (!appliquer) {
    console.log('\n🔵 SIMULATION — rien n’a été écrit. Relancez avec --appliquer.');
    return;
  }

  console.log(`\n🔴 REPRISE de ${liste.length} conversation(s)…`);
  let faits = 0;
  let projetes = 0;
  for (const v of liste) {
    const issue = await simplifierLeFil({ filId: v.filId, auteur: AUTEUR, appliquer: true });
    if (issue.periodesRetirees.length + issue.exceptionsRetirees.length > 0) faits += 1;
    projetes += issue.projetes;
  }

  const apres = await confirmes();
  console.log('\nAPRÈS');
  console.log(`${P}rattachements « lot » confirmés  ${apres}`);
  console.log(`${P}conversations reprises  ${faits}`);
  console.log(`${P}gestes de reprojection  ${projetes}`);
  console.log(`${P}écart de rattachements confirmés  ${apres - avant}`);

  /**
   * 🔴 POURQUOI L'ÉCART EST NORMALEMENT NUL, et pourquoi il peut ne pas l'être.
   *
   * La règle 1 retire des doublons que `projeter` IGNORAIT déjà (à point de départ égal, la dernière période
   * l'emporte) ; la règle 2 retire des décisions qui disaient la même chose que la configuration en vigueur. Dans
   * les deux cas, la projection rend EXACTEMENT ce qu'elle rendait.
   *
   * 🔴🔴 LA SEULE SOURCE D'ÉCART : un mail portant À LA FOIS une exception et une période, dont la PÉRIODE est la
   * plus récente. `projeter` donne toujours la priorité à l'exception ; la règle 1 la retire au profit de la
   * période. Ce mail change alors de classement — c'est précisément ce qu'Arno demande (« exception puis “à
   * venir” sur le même mail → seul le dernier »).
   */
  const restant = await aSimplifier();
  console.log(`\n${restant.length === 0
    ? '✅ seconde passe : plus rien à désempiler — la reprise est stable et rejouable'
    : `🔴 seconde passe : ${restant.length} conversation(s) encore à désempiler — à comprendre`}`);
  if (restant.length !== 0) process.exit(1);
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
