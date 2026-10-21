import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { texteRapportArchivage } from './archiver-fins-gestion';
import type { PasseArchivage } from '../lib/gestion/finGestionRepo';

/** 🔴 Arno (21/10/2026, 405) — le script de l'archivage des fins de gestion : À BLANC par défaut, `--reel` pour le minuteur. */
const passe = (o: Partial<PasseArchivage>): PasseArchivage => ({ reel: false, aujourdhui: '2028-10-21', delai: 24, archives: [], ignores: [], enCours: [
  { lotId: 7, titre: '1 rue Fictive, PUTEAUX', fin: '2026-10-21', echeance: '2028-10-21', aArchiver: true, n5: 'N5-7' },
  { lotId: 8, titre: '2 rue Fictive, PUTEAUX', fin: '2027-06-01', echeance: '2029-06-01', aArchiver: false, n5: null }], ...o });

describe('🔴 archiver-fins-gestion', () => {
  it('À BLANC : la liste des biens qui SERAIENT archivés et de leurs dossiers ; ceux à venir et leur date', () => {
    const t = texteRapportArchivage(passe({}), { base: 'svav_recette', disponible: true });
    expect(t).toContain('À BLANC (aucune écriture, aucune requête au Drive)');
    expect(t).toContain('délai : 2 ans');
    expect(t).toContain('en « Gestion terminée » : 2 · à archiver à cette date : 1');
    expect(t).toContain('bien 7 — 1 rue Fictive, PUTEAUX — fin le 21/10/2026, échéance le 21/10/2028 — N5 N5-7 — serait archivé');
    expect(t).toContain('bien 8 — 2 rue Fictive, PUTEAUX — fin le 01/06/2027, archivage le 01/06/2029');
  });

  it('RÉEL : archivé, dossier déplacé ou « à déplacer » ; sans les migrations : dit, et rien n’est archivé', () => {
    const r = texteRapportArchivage(passe({ reel: true, archives: [{ lotId: 7, phrase: 'x', drive: { ok: false, motif: 'RECETTE' } }] }), { base: 'b', disponible: true });
    expect(r).toContain('ARCHIVÉ · DOSSIER DRIVE À DÉPLACER (RECETTE)');
    expect(texteRapportArchivage(passe({}), { base: 'b', disponible: false })).toContain('migrations 403 à 405 non appliquées');
  });

  it('à blanc par défaut ; `--reel` seul archive (et refuse sans la 405) ; rapport dans .captures ; minuteur quotidien en `--reel`', () => {
    const src = readFileSync('app/scripts/archiver-fins-gestion.ts', 'utf8');
    expect(src).toContain("const reel = argv.includes('--reel');");
    expect(src).toContain("cheminRapport({ nomScript: NOM_SCRIPT, demande: optionLigne(argv, 'rapport') })");
    expect(src).toContain('if (reel && !disponible) throw');
    const unite = readFileSync('deploy/systemd/svav-archivage-fins.service.in', 'utf8');
    expect(unite).toContain('app/scripts/archiver-fins-gestion.ts --reel');
    expect(readFileSync('deploy/systemd/svav-archivage-fins.timer', 'utf8')).toMatch(/OnCalendar=\*-\*-\* 05:15:00\nPersistent=true/);
  });
});
