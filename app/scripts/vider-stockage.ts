/**
 * CLI `gestion:drive:vider-stockage` — MODULE « GESTION », LOT DRIVE-3.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'ELLE FAIT : efface de MinIO le CONTENU des pièces jointes dont la copie Drive est PROUVÉE — et rien d'autre.
 * L'application continue de les servir, en lisant dans le Drive : même nom, même type, mêmes octets.
 *
 * ═══ 🔴 CE QUI EST EFFACÉ NE REVIENT PAS. LES SIX GARDE-FOUS ═════════════════════════════════════════════════════
 *   ① SIMULATION PAR DÉFAUT. Sans option, elle calcule tout, rend ses chiffres, et n'efface RIEN ;
 *   ② DEUX OPTIONS EXIGÉES pour écrire : `--appliquer` ET `--je-confirme-effacement`. La seconde doit être tapée en
 *      entier, et son nom dit ce qu'elle fait ;
 *   ③ REFUS SI UNE COPIE TOURNE. La copie écrit dans `gestion_piece_drive` au fil de l'eau : vider en même temps,
 *      c'est décider d'effacer sur la foi d'un état qui change sous nos pieds ;
 *   ④ RELECTURE DRIVE JUSTE AVANT CHAQUE EFFACEMENT — md5, taille, pas à la corbeille, parent toujours sous
 *      « Base de données locative ». « Vérifiée » date de la copie, parfois des heures avant ;
 *   ⑤ ON EFFACE, PUIS ON INSCRIT LA PREUVE. Une panne entre les deux laisse un trou qui se VOIT, jamais une base qui
 *      prétend que le contenu est parti alors qu'il est là ;
 *   ⑥ EN CAS DE DOUTE, ON N'EFFACE PAS, et le motif est compté.
 *
 * 🔒 LES MINIATURES NE SONT JAMAIS TOUCHÉES. Elles vivent sous `miniature_cle`, elles pèsent quelques kilooctets, et
 * c'est d'elles que dépend l'affichage des cartes de pièces jointes. Cette commande ne lit même pas cette colonne.
 *
 * 🔒🔒 AUCUNE ÉCRITURE DRIVE. Ni création, ni renommage, ni déplacement, ni corbeille, ni partage. Les seuls appels
 * Google sont des `GET` de MÉTADONNÉES sur des fichiers que le programme a lui-même créés dans
 * « 00 Arrivée des mails ». « Documents clients scannés » n'est jamais approché.
 *
 * OPTIONS :
 *   --limite=N                  s'arrête après N pièces effacées (défaut : 500 par passe)
 *   --depuis=N                  reprend après la pièce N
 *   --appliquer                 avec la confirmation ci-dessous, efface réellement
 *   --je-confirme-effacement    la seconde clé. Sans elle, rien n'est effacé, même avec --appliquer
 *   --exemples=N                combien d'exemples par catégorie afficher (défaut 10)
 *
 * EXEMPLES :
 *   npm run gestion:drive:vider-stockage
 *   npm run gestion:drive:vider-stockage -- --limite=50 --appliquer --je-confirme-effacement
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';
import { query, closePool } from '../lib/db/client';
import { supprimer } from '../lib/stockage';
import { jetonPourSubject } from '../lib/gestion/driveDelegue';
import { copiePiecesDisponible, vidageDisponible } from '../lib/gestion/schema';
import { lireArbre } from '../lib/gestion/driveArbreRepo';
import { ascensionVersRacine, indexer, type NoeudArbre } from '../lib/gestion/driveGardeFou';
import { relireFichier, type DepsCopie } from '../lib/gestion/copiePiecesReel';
import { dureeFr, tailleFr } from '../lib/gestion/copiePieces';
import {
  comptesVides, compter, effacementAutorise, resumeVidage, verdict, verdictBase,
  CONFIRMATION, LIBELLES_CONSERVATION, LOT_VIDAGE,
  type ComptesVidage, type MotifConservation, type PieceCandidate, type RelectureDrive, type Verdict,
} from '../lib/gestion/vidageStockage';
import {
  chargerCandidates, chiffresVidage, copieEnCours, journaliserPasseVidage, noterVidage,
} from '../lib/gestion/vidageRepo';

const P = '[gestion:drive:vider-stockage]';
export const COMPTE_DEFAUT = 'gestion@criterimmo.fr';

export interface OptionsVidage {
  compte: string;
  appliquer: boolean;
  limite: number;
  depuis: number;
  exemples: number;
}

/** Ce que la ligne de commande demande. PUR. */
export function lireOptions(argv: readonly string[]): OptionsVidage {
  const nombre = (prefixe: string, defaut: number): number => {
    const a = argv.find((x) => x.startsWith(prefixe));
    if (a === undefined) return defaut;
    const n = Number(a.slice(prefixe.length));
    return Number.isInteger(n) && n >= 0 ? n : defaut;
  };
  return {
    compte: argv.find((a) => a.startsWith('--compte='))?.slice('--compte='.length) ?? COMPTE_DEFAUT,
    // 🔴 LES DEUX OPTIONS, jamais une seule. `effacementAutorise` est la SEULE porte.
    appliquer: effacementAutorise(argv),
    limite: nombre('--limite=', LOT_VIDAGE),
    depuis: nombre('--depuis=', 0),
    exemples: nombre('--exemples=', 10),
  };
}

/**
 * LE PARENT DU FICHIER EST-IL TOUJOURS SOUS « Base de données locative » ? PUR (l'arbre est fourni).
 *
 * 🔴 C'EST LE PREMIER GARDE-FOU DU LOT DRIVE-1, RÉUTILISÉ TEL QUEL — on remonte l'arbre mémorisé jusqu'à la racine.
 * Un chaînon absent, un cycle, un parent inconnu : `ascensionVersRacine` rend `null`, et on n'efface pas. Il n'est
 * pas question d'assouplir cette vérification pour contourner un refus : c'est elle qui garantit qu'on ne lit — et
 * qu'on ne juge — que nos propres copies.
 */
export function sousLaRacine(parents: readonly string[], noeuds: NoeudArbre[]): boolean {
  const index = indexer(noeuds);
  return parents.some((p) => ascensionVersRacine(p, index) !== null);
}

/** Un exemple, dit en une ligne. 🔒 Aucun nom de fichier réel : un nom de pièce porte souvent le nom d'une personne. */
export function ligneExemple(p: PieceCandidate, v: Verdict): string {
  const taille = p.tailleOctets === null ? '?' : tailleFr(p.tailleOctets);
  const quoi = v.effacable ? 'EFFAÇABLE' : LIBELLES_CONSERVATION[v.motif];
  return `pièce ${String(p.pieceId).padStart(6)} · ${taille.padStart(9)} · ${p.typeMime ?? 'type inconnu'} · ${quoi}`;
}

async function principal(): Promise<void> {
  const o = lireOptions(process.argv.slice(2));
  const argv = process.argv.slice(2);
  console.log('');
  console.log(`${P} ${o.appliquer ? '── EFFACEMENT RÉEL ──' : '── SIMULATION (aucun octet effacé) ──'}`);

  // ── LES REFUS QUI ARRÊTENT TOUT DE SUITE ────────────────────────────────────────────────────────────────────
  if (argv.includes('--appliquer') && !argv.includes(CONFIRMATION)) {
    console.error(`${P} ❌ « --appliquer » NE SUFFIT PAS. Un objet effacé ne revient pas : la confirmation doit être`);
    console.error(`${P}    tapée en entier. Ajoutez ${CONFIRMATION}\n`);
    process.exitCode = 1;
    return;
  }
  if (!(await copiePiecesDisponible())) {
    console.error(`${P} ❌ La migration 255 n’est pas appliquée : sans « vérifiée », rien ne peut être prouvé.\n`);
    process.exitCode = 1;
    return;
  }
  const avecVidage = await vidageDisponible();
  if (o.appliquer && !avecVidage) {
    console.error(`${P} ❌ La migration 260 n’est pas appliquée : il n’y aurait nulle part où inscrire la PREUVE de`);
    console.error(`${P}    ce qu’on efface — et un effacement sans preuve est un effacement indéfendable.`);
    console.error(`${P}    psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/260_gestion_piece_vidage.sql\n`);
    process.exitCode = 1;
    return;
  }
  if (!avecVidage) {
    console.log(`${P} ⚠️ Migration 260 NON appliquée — la simulation fonctionne quand même (elle ne fait que lire).`);
  }

  /**
   * 🔴 LA COPIE EN COURS BLOQUE L'EFFACEMENT, PAS LA SIMULATION.
   *
   * L'écriture est refusée : la copie écrit dans `gestion_piece_drive` au fil de l'eau, et effacer sur la foi d'un
   * état qui change sous nos pieds est la seule erreur qu'on ne pourrait pas défaire.
   *
   * La SIMULATION, elle, ne fait que lire — la refuser aussi priverait de la seule façon de savoir ce qu'il y aura à
   * faire. Mais ses chiffres sont alors un MINORANT, et elle le DIT : chaque pièce que la copie vérifie pendant ce
   * temps devient effaçable après coup.
   */
  const copie = await copieEnCours();
  if (copie.enCours && o.appliquer) {
    console.error(`${P} ❌ UNE PASSE DE COPIE EST EN COURS${copie.passeId === null ? '' : ` (n° ${copie.passeId})`}.`);
    console.error(`${P}    Le vidage ne tourne pas en même temps : la copie écrit au fil de l’eau, et effacer sur la`);
    console.error(`${P}    foi d’un état qui change est la seule erreur qu’on ne pourrait pas défaire.`);
    console.error(`${P}    Attendez sa fin : npm run gestion:drive:copie-etat\n`);
    process.exitCode = 1;
    return;
  }
  if (copie.enCours) {
    console.log(`${P} ⚠️ UNE COPIE TOURNE (n° ${copie.passeId ?? '?'}) : ces chiffres sont un MINORANT. Chaque pièce`);
    console.log(`${P}    qu’elle vérifie d’ici sa fin s’ajoutera aux effaçables. L’effacement, lui, est refusé.`);
  }

  // ── L'ARBRE, POUR LE GARDE-FOU ① ────────────────────────────────────────────────────────────────────────────
  const arbre = await lireArbre();
  if (arbre.etat !== 'ok') {
    console.error(`${P} ❌ L’arborescence Drive n’est pas mémorisée (migration 254) : impossible de vérifier qu’un`);
    console.error(`${P}    fichier est bien sous « Base de données locative ». On n’efface pas dans le doute.\n`);
    process.exitCode = 1;
    return;
  }
  const noeuds: NoeudArbre[] = [...arbre.data];
  console.log(`${P} arborescence : ${noeuds.length} dossiers mémorisés`);

  const jeton = await jetonPourSubject(o.compte, { fetch });
  if (!jeton.ok) { console.error(`${P} ❌ ${jeton.motif}\n`); process.exitCode = 1; return; }
  const deps: DepsCopie = { fetch };
  /** Un jeton frais à chaque relecture : un parcours long meurt sinon au bout d'une heure (défaut du 26/09). */
  const jetonFrais = async (): Promise<string | null> => {
    const j = await jetonPourSubject(o.compte, { fetch });
    return j.ok ? j.jeton : null;
  };

  const { rows: tot } = await query<{ n: string; o: string }>(
    `SELECT count(*)::text AS n, coalesce(sum(taille_octets), 0)::text AS o
       FROM gestion_piece WHERE cle_stockage IS NOT NULL`);
  console.log(`${P} pièces avec contenu : ${tot[0].n} · ${tailleFr(Number(tot[0].o))}`);

  const debut = Date.now();
  const c: ComptesVidage = comptesVides();
  const exemples = new Map<string, string[]>();
  const ajouterExemple = (cle: string, ligne: string): void => {
    const l = exemples.get(cle) ?? [];
    if (l.length < o.exemples) { l.push(ligne); exemples.set(cle, l); }
  };

  let depuis = o.depuis;
  let arret: string | null = null;

  for (;;) {
    if (c.effacables >= o.limite && o.limite > 0) { arret = `limite de ${o.limite} pièces atteinte`; break; }
    const lot = await chargerCandidates(depuis, 500);
    if (lot.length === 0) break;
    depuis = lot[lot.length - 1].pieceId;

    for (const p of lot) {
      // ── ① CE QUE LA BASE SUFFIT À TRANCHER, sans déranger Google ──
      const base = verdictBase(p);
      if (base !== null) {
        compter(c, base);
        ajouterExemple(base.effacable ? 'effacable' : base.motif, ligneExemple(p, base));
        continue;
      }

      // ── ② LA RELECTURE DRIVE, JUSTE AVANT ──
      const jt = await jetonFrais();
      if (jt === null) {
        const v: Verdict = { effacable: false, motif: 'drive_illisible' };
        compter(c, v);
        ajouterExemple('drive_illisible', ligneExemple(p, v));
        continue;
      }
      c.relecturesDrive += 1;
      const relu = await relireFichier(p.driveFileId as string, jt, deps);
      const r: RelectureDrive = relu.ok
        ? {
          ok: true, md5: relu.md5, taille: relu.taille,
          // 🔴 UNE LISTE DE PARENTS VIDE N'EST PAS UN DÉPLACEMENT : c'est Drive qui n'a pas répondu à la question.
          sansParent: relu.parents.length === 0,
          sousLaRacine: sousLaRacine(relu.parents, noeuds),
        }
        : { ok: false, motif: relu.motif };

      const v = verdict(p, r);
      compter(c, v);
      ajouterExemple(v.effacable ? 'effacable' : v.motif, ligneExemple(p, v));
      if (!v.effacable) continue;

      // ── ③ L'EFFACEMENT, PUIS LA PREUVE ──
      if (!o.appliquer) continue;
      try {
        await supprimer(v.cleStockage);
      } catch (e) {
        console.error(`${P}   ❌ pièce ${p.pieceId} : effacement refusé par le stockage — ${(e as Error).message}`);
        continue;
      }
      const inscrit = await noterVidage({
        pieceId: p.pieceId, cleStockage: v.cleStockage, md5: v.md5, taille: v.taille,
        driveFileId: v.driveFileId, driveMd5: r.md5 as string, driveTaille: r.taille as number,
        verifieLe: p.verifieLe as string, auteur: 'vidage automatique',
      });
      c.effacees += 1;
      c.octetsEffaces += v.taille;
      if (!inscrit) {
        console.error(`${P}   ⚠️ pièce ${p.pieceId} : octets effacés mais preuve DÉJÀ inscrite — à vérifier.`);
      }
      if (c.effacees % 50 === 0) {
        console.log(`${P}   ${c.effacees} vidées · ${tailleFr(c.octetsEffaces)} libérés · pièce ${p.pieceId}`);
      }
    }
  }

  // ── LE RAPPORT ────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log(`${P} ── ${o.appliquer ? 'VIDAGE' : 'SIMULATION'} ── ${dureeFr(Date.now() - debut)}`);
  for (const l of resumeVidage(c, o.appliquer)) console.log(`${P} ${l}`);
  if (!o.appliquer) console.log(`${P} volume libérable ........... ${tailleFr(c.octetsEffacables)}`);
  else console.log(`${P} volume libéré .............. ${tailleFr(c.octetsEffaces)}`);
  if (arret !== null) console.log(`${P} motif d’arrêt : ${arret}`);

  if (o.exemples > 0) {
    for (const [cle, lignes] of [...exemples.entries()].sort()) {
      const titre = cle === 'effacable'
        ? 'EFFAÇABLES'
        : `CONSERVÉES — ${LIBELLES_CONSERVATION[cle as MotifConservation]}`;
      console.log('');
      console.log(`${P} ${titre} (${lignes.length} exemple(s))`);
      for (const l of lignes) console.log(`${P}   ${l}`);
    }
  }

  const etat = await chiffresVidage();
  if (etat !== null) {
    console.log('');
    console.log(`${P} état d’ensemble : ${etat.videes} pièce(s) vidée(s) · ${tailleFr(etat.octetsLiberes)} libérés`);
  }

  if (!o.appliquer) {
    console.log('');
    console.log(`${P} 🔒 AUCUN OCTET N’A ÉTÉ EFFACÉ, ni sur MinIO, ni dans le Drive. Pour effacer réellement :`);
    console.log(`${P}    npm run gestion:drive:vider-stockage -- --appliquer ${CONFIRMATION}`);
  } else {
    await journaliserPasseVidage(c.effacees,
      `${c.effacees} pièce(s) vidée(s) (${tailleFr(c.octetsEffaces)}) · ${c.relecturesDrive} relecture(s) Drive`
      + `${arret === null ? '' : ` · ${arret}`}`);
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
