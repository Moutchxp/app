/**
 * CLI `gestion:drive:ranger-statuts` — LE RANGEMENT DES DOSSIERS DRIVE MAL PLACÉS SELON LE STATUT DU BIEN (Arno, 21/10/2026,
 * migrations 403 et 404).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Chaque bien a son dossier N5 dans l'arbre de son STATUT : en gestion → « Base de données locative › Actifs » ; ancienne
 * gestion → « … › Inactifs » ; location seule → « Base de données location seule ». Ce script compare le registre
 * (`gestion_drive_noeud`) aux statuts, et dit — ou fait — les déplacements des N5 existants mal placés.
 *
 * 🔴 À BLANC PAR DÉFAUT : il LIT la base (le registre et les statuts) et écrit son rapport ; AUCUNE requête au Drive, AUCUNE
 *    écriture en base. `--reel` seulement déplace (chaque N5 entier, par la fonction de l'application, avec ses garde-fous :
 *    les deux arbres seuls, les dossiers du registre seuls, « Documents clients scannés » jamais). Rejouable : un N5 déjà à sa
 *    place n'est pas touché. Les biens SANS dossier sont listés, jamais créés ici (« Créer le dossier » depuis la fiche).
 * 🔴 Le rapport va dans `.captures/ranger-dossiers-statut/` (jamais sur le Bureau).
 *
 * Usage :
 *   npm run gestion:drive:ranger-statuts                 (à blanc — rapport seulement)
 *   npm run gestion:drive:ranger-statuts -- --reel       (déplace pour de bon)
 *   … -- --rapport=/chemin/fichier-ou-dossier
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';
import { libellePlace, planRangement, type BienARanger, type LigneRangement } from '../lib/gestion/arbreStatutDrive';
import { LIBELLE_STATUT } from '../lib/gestion/statutBien';

const P = '[gestion:drive:ranger-statuts]';
const NOM_SCRIPT = 'ranger-dossiers-statut';

export interface IssueLigne { lotId: number; ok: boolean; motif: string | null }

/** Le texte du rapport. PUR. */
export function texteRapport(o: { reel: boolean; base: string; quand: Date; biens: readonly BienARanger[]; issues?: readonly IssueLigne[] }): string {
  const plan = planRangement(o.biens);
  const issues = new Map((o.issues ?? []).map((i) => [i.lotId, i]));
  const ligne = (d: LigneRangement): string => {
    const i = issues.get(d.lotId);
    const fait = !o.reel ? 'à déplacer' : i === undefined ? 'non tenté' : i.ok ? 'DÉPLACÉ' : `ÉCHEC : ${i.motif}`;
    return `  · bien ${d.lotId} — ${d.titre} — N5 ${d.n5DriveId} : « ${libellePlace(d.depuis)} » → « ${libellePlace(d.vers)} » — ${fait}`;
  };
  return [
    `RANGEMENT DES DOSSIERS DRIVE SELON LE STATUT DU BIEN — ${o.reel ? 'RÉEL' : 'À BLANC (aucune écriture, aucune requête au Drive)'}`,
    `base : ${o.base} · ${o.quand.toISOString()}`,
    '',
    `biens examinés : ${o.biens.length} · à leur place : ${plan.enPlace} · à déplacer : ${plan.deplacements.length} · sans dossier inscrit : ${plan.sansDossier.length}`,
    `par statut : ${(['en_gestion', 'location_seule', 'ancienne_gestion'] as const).map((s) => `${LIBELLE_STATUT[s]} ${o.biens.filter((b) => b.statut === s).length}`).join(' · ')}`,
    '',
    'DÉPLACEMENTS (N5 entier, jamais copié ni supprimé) :',
    ...(plan.deplacements.length === 0 ? ['  (aucun)'] : plan.deplacements.map(ligne)),
    '',
    'SANS DOSSIER INSCRIT (non créés par ce script — « Créer le dossier » depuis la fiche du bien) :',
    ...(plan.sansDossier.length === 0 ? ['  (aucun)'] : plan.sansDossier.map((b) => `  · bien ${b.lotId} — ${b.titre} — ${LIBELLE_STATUT[b.statut]}`)),
    '',
  ].join('\n');
}

export interface DepsRangement {
  biens: () => Promise<BienARanger[]>;
  deplacer: (lotId: number) => Promise<{ ok: true } | { ok: false; motif: string }>;
  base: string;
  maintenant?: () => Date;
}

/** LE RANGEMENT : à blanc, il ne fait QUE lire ; réel, il déplace chaque N5 mal placé, un par un. */
export async function ranger(reel: boolean, deps: DepsRangement): Promise<{ texte: string; issues: IssueLigne[] }> {
  const biens = await deps.biens();
  const issues: IssueLigne[] = [];
  if (reel) {
    for (const d of planRangement(biens).deplacements) {
      const r = await deps.deplacer(d.lotId).catch((e: unknown) => ({ ok: false as const, motif: (e as Error)?.message ?? 'erreur inattendue' }));
      issues.push({ lotId: d.lotId, ok: r.ok, motif: r.ok ? null : r.motif });
    }
  }
  return { texte: texteRapport({ reel, base: deps.base, quand: deps.maintenant?.() ?? new Date(), biens, issues }), issues };
}

async function principal(): Promise<void> {
  const argv = process.argv.slice(2);
  const reel = argv.includes('--reel');
  const { biensARanger, deplacerDossierDuBien } = await import('../lib/gestion/arbreStatutDriveRepo');
  const { closePool } = await import('../lib/db/client');
  const base = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '?';
  try {
    const { texte, issues } = await ranger(reel, {
      biens: biensARanger, base,
      deplacer: async (lotId) => { const r = await deplacerDossierDuBien(lotId, `script ${NOM_SCRIPT}`); return r.ok ? { ok: true } : { ok: false, motif: r.motif }; },
    });
    const chemin = cheminRapport({ nomScript: NOM_SCRIPT, demande: optionLigne(argv, 'rapport') });
    writeFileSync(chemin, texte, 'utf8');
    console.log(texte);
    console.log(`${P} rapport : ${chemin}`);
    if (issues.some((i) => !i.ok)) process.exitCode = 1;
  } finally {
    await closePool();
  }
}

if (estPointEntree(import.meta.url)) {
  principal().catch((e: unknown) => { console.error(P, e); process.exit(1); });
}
