/**
 * CLI `gestion:archiver-fins` — L'ARCHIVAGE AUTOMATIQUE DES FINS DE GESTION (Arno, 21/10/2026, migration 405).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Un bien en « Gestion terminée » (ancienne gestion pas encore archivée) est ARCHIVÉ à sa date de fin + le délai réglé dans
 * « Paramètres Location » (24 mois par défaut) — s'il y est TOUJOURS (son statut actuel est relu et verrouillé juste avant) :
 * il quitte la Gestion, son dossier N5 (et tout son contenu) passe dans « Base de données locative › Inactifs » (le propriétaire
 * entier si c'était son dernier bien actif). Un échec du Drive n'empêche pas l'archivage : la fiche dit « Dossier Drive à
 * déplacer ». IDEMPOTENT (un bien archivé ne l'est jamais deux fois), journalisé dans l'Historique de chaque bien.
 *
 * 🔴 À BLANC PAR DÉFAUT : il LIT et écrit son rapport (les biens qui SERAIENT archivés et les dossiers qui SERAIENT déplacés) ;
 *    aucune écriture en base, aucune requête au Drive. `--reel` seulement archive (minuteur quotidien `svav-archivage-fins`).
 * 🔴 Le rapport va dans `.captures/archiver-fins-gestion/` (jamais sur le Bureau).
 *
 * Usage :
 *   npm run gestion:archiver-fins                 (à blanc)
 *   npm run gestion:archiver-fins -- --reel       (archive pour de bon — la passe du minuteur)
 *   … -- --rapport=/chemin/fichier-ou-dossier · --date=AAAA-MM-JJ (simuler une autre date, à blanc seulement)
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';
import { dureeMois } from '../lib/gestion/finGestion';
import type { PasseArchivage } from '../lib/gestion/finGestionRepo';

const P = '[gestion:archiver-fins]';
const NOM_SCRIPT = 'archiver-fins-gestion';
const dateFr = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/');

/** Le texte du rapport. PUR. */
export function texteRapportArchivage(p: PasseArchivage, o: { base: string; disponible: boolean }): string {
  const dus = p.enCours.filter((b) => b.aArchiver);
  const fait = new Map(p.archives.map((a) => [a.lotId, a]));
  const ignore = new Map(p.ignores.map((i) => [i.lotId, i.motif]));
  const ligne = (b: PasseArchivage['enCours'][number]): string => {
    const issue = !p.reel ? 'serait archivé' : fait.has(b.lotId)
      ? `ARCHIVÉ${fait.get(b.lotId)!.drive === null ? '' : fait.get(b.lotId)!.drive!.ok ? ' · dossier déplacé dans « Inactifs »' : ` · DOSSIER DRIVE À DÉPLACER (${fait.get(b.lotId)!.drive!.motif})`}`
      : `non archivé : ${ignore.get(b.lotId) ?? '?'}`;
    return `  · bien ${b.lotId} — ${b.titre} — fin le ${dateFr(b.fin)}, échéance le ${dateFr(b.echeance)} — N5 ${b.n5 ?? '(aucun dossier inscrit)'} — ${issue}`;
  };
  return [
    `ARCHIVAGE DES FINS DE GESTION — ${p.reel ? 'RÉEL' : 'À BLANC (aucune écriture, aucune requête au Drive)'}`,
    `base : ${o.base} · date : ${dateFr(p.aujourdhui)} · délai : ${dureeMois(p.delai)}`,
    ...(o.disponible ? [] : ['⚠ migrations 403 à 405 non appliquées sur cette base : statuts DÉDUITS par la règle de reprise (date de fin réelle) ; rien ne peut être archivé tant qu’elles ne le sont pas.']),
    '',
    `en « Gestion terminée » : ${p.enCours.length} · à archiver à cette date : ${dus.length}${p.reel ? ` · archivés : ${p.archives.length} · non archivés : ${p.ignores.length}` : ''}`,
    '',
    `À ARCHIVER (dossier N5 → « Base de données locative › Inactifs », le propriétaire entier si c'était son dernier bien actif) :`,
    ...(dus.length === 0 ? ['  (aucun)'] : dus.map(ligne)),
    '',
    'PAS ENCORE À ÉCHÉANCE :',
    ...(p.enCours.filter((b) => !b.aArchiver).map((b) => `  · bien ${b.lotId} — ${b.titre} — fin le ${dateFr(b.fin)}, archivage le ${dateFr(b.echeance)}`)),
    ...(p.enCours.some((b) => !b.aArchiver) ? [] : ['  (aucun)']),
    '',
  ].join('\n');
}

async function principal(): Promise<void> {
  const argv = process.argv.slice(2);
  const reel = argv.includes('--reel');
  const date = optionLigne(argv, 'date');
  if (reel && date !== null) throw new Error('--date ne sert qu’à blanc : la passe réelle archive à la date du jour.');
  const maintenant = date !== null ? new Date(`${date}T12:00:00Z`) : new Date();
  const { finGestionDisponible, passerArchivage } = await import('../lib/gestion/finGestionRepo');
  const { arbreDisponible, deplacerDossierDuBien } = await import('../lib/gestion/arbreStatutDriveRepo');
  const { closePool } = await import('../lib/db/client');
  const base = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '?';
  try {
    const disponible = await finGestionDisponible();
    const avecDrive = disponible && await arbreDisponible();
    if (reel && !disponible) throw new Error('migration 405 absente : rien ne peut être archivé (lancer à blanc pour voir ce qui le serait).');
    const p = await passerArchivage({ reel, maintenant, auteur: { id: null, libelle: `minuteur ${NOM_SCRIPT}` },
      ...(avecDrive ? { deplacer: async (lotId: number) => { const r = await deplacerDossierDuBien(lotId, `minuteur ${NOM_SCRIPT}`); return r.ok ? { ok: true, motif: null } : { ok: false, motif: r.motif }; } } : {}) });
    const texte = texteRapportArchivage(p, { base, disponible });
    const chemin = cheminRapport({ nomScript: NOM_SCRIPT, demande: optionLigne(argv, 'rapport') });
    writeFileSync(chemin, texte, 'utf8');
    console.log(texte);
    console.log(`${P} rapport : ${chemin}`);
    if (p.archives.some((a) => a.drive !== null && !a.drive.ok)) process.exitCode = 2;
  } finally {
    await closePool();
  }
}

if (estPointEntree(import.meta.url)) {
  principal().catch((e: unknown) => { console.error(P, e); process.exit(1); });
}
