/**
 * CLI `gestion:classement:plan` — LOT CLASSEMENT-1 : LE PLAN DE CLASSEMENT, EN SIMULATION SEULE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒🔒 CETTE COMMANDE NE DÉPLACE RIEN, ET NE SAIT PAS LE FAIRE. Elle n'importe même pas `classementDrive.ts` — un test
 * le vérifie. Elle LIT la base et imprime ce qu'un classement ferait : combien de pièces, vers quels dossiers, avec
 * quelle règle et quelle certitude. Aucun appel Drive, aucun appel MinIO, aucune écriture.
 *
 * ⚠️ IL N'Y A PAS D'OPTION `--appliquer`, et c'est délibéré : tant qu'Arno n'a pas tranché les choix du rapport, la
 * seule chose honnête est de ne pas offrir le geste. Une option qu'on ajoute « pour plus tard » finit par être tapée.
 *
 * USAGE :
 *   npm run gestion:classement:plan                     # tout, seuil prudent
 *   npm run gestion:classement:plan -- --seuil=probable  # ce que donnerait un seuil plus souple
 *   npm run gestion:classement:plan -- --exemples=40 --limite=5000
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import {
  compterPlan, comptesClassementVides, cleDossier, libelleCible, planDeLaPiece, resumeClassement,
  RUBRIQUES, type Certitude, type ComptesClassement, type Plan,
} from '../lib/gestion/classement';
import {
  chargerAClasser, chiffresClassement, dossiersMemorises, doublonsProduction, LOT_CLASSEMENT,
} from '../lib/gestion/classementRepo';

const P = '[gestion:classement:plan]';

interface Options { seuil: Certitude; exemples: number; limite: number }

export function lireOptions(argv: readonly string[]): Options {
  const nombre = (prefixe: string, defaut: number): number => {
    const a = argv.find((x) => x.startsWith(prefixe));
    if (a === undefined) return defaut;
    const n = Number(a.slice(prefixe.length));
    return Number.isInteger(n) && n >= 0 ? n : defaut;
  };
  const brut = argv.find((a) => a.startsWith('--seuil='))?.slice('--seuil='.length) ?? '';
  // 🔴 LE DÉFAUT EST LE PLUS PRUDENT. Une valeur inconnue y retombe : on ne relâche jamais un seuil par accident.
  const seuil: Certitude = brut === 'probable' ? 'probable' : 'certaine';
  return { seuil, exemples: nombre('--exemples=', 20), limite: nombre('--limite=', 0) };
}

function pc(n: number, total: number): string {
  return total === 0 ? '0 %' : `${Math.round((n / total) * 100)} %`;
}

async function principal(): Promise<void> {
  const o = lireOptions(process.argv.slice(2));
  console.log(`\n${P} ── PLAN DE CLASSEMENT (SIMULATION — rien n’est déplacé) ──`);
  console.log(`${P} seuil de certitude pour accorder une rubrique : ${o.seuil}\n`);

  const chiffres = await chiffresClassement();
  console.log(`${P} pièces en base .................... ${chiffres.pieces}`);
  console.log(`${P}   dont copie Drive vérifiée ....... ${chiffres.piecesAvecCopie}`);
  console.log(`${P} mails avec rattachement confirmé .. ${chiffres.messagesConfirmes}`);
  console.log(`${P} mails avec proposition en attente .. ${chiffres.messagesProposes}`);
  console.log(`${P} production inventoriée ............ ${chiffres.productionFichiers} fichier(s), `
    + `${chiffres.productionAvecMd5} avec empreinte (relevé le ${chiffres.productionReleveLe ?? '—'})`);

  const dossiers = await dossiersMemorises();
  console.log(`${P} dossiers mémorisés ................ ${dossiers.size}\n`);

  const c: ComptesClassement = comptesClassementVides();
  const exemples: Plan[] = [];
  const exemplesParSorte = new Map<string, number>();
  /** Les empreintes des pièces effectivement classables, pour le rapprochement avec la production. */
  const md5Vus = new Map<string, number[]>();
  /** Les dossiers cibles qui n'existent pas encore, et combien de pièces chacun attend. */
  const manquants = new Map<string, number>();
  let depuis = 0;
  let vues = 0;

  for (;;) {
    if (o.limite > 0 && vues >= o.limite) break;
    const lot = await chargerAClasser(depuis, LOT_CLASSEMENT);
    if (lot.length === 0) break;
    depuis = lot[lot.length - 1].pieceId;

    for (const p of lot) {
      if (o.limite > 0 && vues >= o.limite) break;
      vues += 1;
      const plan = planDeLaPiece(p, o.seuil);
      compterPlan(c, plan);
      if (p.driveFileId === null) c.sansCopieDrive += 1;
      const cle = cleDossier(plan.cible);
      if (!dossiers.has(`${cle.sorte}|${cle.cle}`)) {
        c.cibleInconnue += 1;
        // 🔴 CE QU'IL FAUDRAIT CRÉER, nommé : c'est une ÉCRITURE Drive, donc une décision d'Arno.
        const n = manquants.get(`${cle.sorte}|${cle.cle}`) ?? 0;
        manquants.set(`${cle.sorte}|${cle.cle}`, n + 1);
      }
      if (p.md5 !== null) {
        const l = md5Vus.get(p.md5.toLowerCase()) ?? [];
        if (l.length < 4) l.push(p.pieceId);
        md5Vus.set(p.md5.toLowerCase(), l);
      }
      // Des exemples RÉPARTIS : quatre par sorte de destination, pas vingt fois la même.
      const n = exemplesParSorte.get(plan.cible.sorte) ?? 0;
      if (exemples.length < o.exemples && n < Math.max(1, Math.ceil(o.exemples / 4))) {
        exemples.push(plan);
        exemplesParSorte.set(plan.cible.sorte, n + 1);
      }
    }
  }

  console.log(`${P} ── RÉPARTITION ──`);
  for (const l of resumeClassement(c)) console.log(`${P} ${l}`);

  // ── LES DOUBLONS AVEC LA PRODUCTION ─────────────────────────────────────────────────────────────────────────
  const doublons = await doublonsProduction([...md5Vus.keys()]);
  let piecesEnDoublon = 0;
  for (const [md5, pieces] of md5Vus) if (doublons.has(md5)) piecesEnDoublon += pieces.length;
  if (manquants.size > 0) {
    console.log(`\n${P} ── 🔴 DOSSIERS CIBLES QUI N’EXISTENT PAS ENCORE (${manquants.size}) ──`);
    console.log(`${P} Les créer est une ÉCRITURE Drive : ce lot ne l’a pas faite. Décision d’Arno.`);
    for (const [cle, n] of [...manquants.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
      const [sorte, ...reste] = cle.split('|');
      console.log(`${P}   ${String(n).padStart(6)} pièce(s) attendent « ${sorte} » ${reste.join('/')}`);
    }
  }

  console.log(`\n${P} ── DOUBLONS AVEC « Documents clients scannés » (lecture en base, aucun appel Drive) ──`);
  console.log(`${P} empreintes de pièces distinctes ... ${md5Vus.size}`);
  console.log(`${P} empreintes DÉJÀ en production ..... ${doublons.size} (${pc(doublons.size, md5Vus.size)})`);
  console.log(`${P} pièces concernées ................. ${piecesEnDoublon}`);
  let montres = 0;
  for (const [md5, info] of doublons) {
    if (montres >= 10) break;
    montres += 1;
    const pieces = md5Vus.get(md5) ?? [];
    console.log(`${P}   pièce(s) ${pieces.join(', ')} → déjà en production `
      + `(${info.total} emplacement(s)) : ${info.chemins[0] ?? '(chemin inconnu)'}`);
    for (const ch of info.chemins.slice(1)) console.log(`${P}${' '.repeat(6)}aussi : ${ch}`);
  }

  // ── LES EXEMPLES DE PLAN ────────────────────────────────────────────────────────────────────────────────────
  console.log(`\n${P} ── ${exemples.length} EXEMPLES DE PLAN ──`);
  for (const e of exemples) {
    const cle = cleDossier(e.cible);
    const d = dossiers.get(`${cle.sorte}|${cle.cle}`);
    console.log(`${P}   pièce ${String(e.pieceId).padStart(6)} → ${libelleCible(e.cible)}`);
    console.log(`${P}${' '.repeat(6)}règle : ${e.regle} · certitude ${e.certitude}`);
    console.log(`${P}${' '.repeat(6)}dossier : ${d === undefined ? '⚠️ NON MÉMORISÉ — déplacement impossible' : d.chemin}`);
    if (e.raccourcisVers.length > 0) {
      console.log(`${P}${' '.repeat(6)}raccourci(s) à poser vers : ${e.raccourcisVers.join(', ')}`);
    }
  }

  console.log(`\n${P} 🔒 AUCUN FICHIER N’A ÉTÉ DÉPLACÉ, aucun raccourci créé, aucune écriture Drive.`);
  console.log(`${P}    Le déplacement réel n’a pas de commande : il attend les décisions du rapport de nuit.\n`);
}

void principal().then(closePool, async (e: unknown) => {
  console.error(e);
  process.exitCode = 1;
  await closePool();
});
