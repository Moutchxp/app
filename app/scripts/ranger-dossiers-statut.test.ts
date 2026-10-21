import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ranger, texteRapport } from './ranger-dossiers-statut';
import type { BienARanger } from '../lib/gestion/arbreStatutDrive';

/**
 * 🔴 Arno (21/10/2026, 403-404) — le script de rangement des dossiers Drive selon le statut : À BLANC par défaut (il ne fait que
 * lire), `--reel` déplace un par un, rejouable ; rapport dans `.captures/`, jamais sur le Bureau.
 */
const b = (lotId: number, statut: BienARanger['statut'], n5: BienARanger['n5']): BienARanger => ({ lotId, statut, n5, n5DriveId: n5 === null ? null : `N5-${lotId}`, titre: `${lotId} rue Fictive` });
const BIENS = [b(1, 'en_gestion', { arbre: 'locative', branche: 'Actifs' }), b(2, 'location_seule', { arbre: 'locative', branche: 'Actifs' }),
  b(3, 'ancienne_gestion', { arbre: 'locative', branche: 'Actifs' }), b(4, 'location_seule', null)];

describe('🔴 ranger-dossiers-statut', () => {
  it('À BLANC : aucun déplacement demandé ; le rapport dit tout (compte, déplacements à faire, biens sans dossier)', async () => {
    const demandes: number[] = [];
    const { texte, issues } = await ranger(false, { biens: async () => BIENS, base: 'svav_recette', maintenant: () => new Date('2026-10-21T20:00:00Z'),
      deplacer: async (id) => { demandes.push(id); return { ok: true }; } });
    expect(demandes).toEqual([]);
    expect(issues).toEqual([]);
    expect(texte).toContain('À BLANC (aucune écriture, aucune requête au Drive)');
    expect(texte).toContain('biens examinés : 4 · à leur place : 1 · à déplacer : 2 · sans dossier inscrit : 1');
    expect(texte).toContain('bien 2 — 2 rue Fictive — N5 N5-2 : « Base de données locative › Actifs » → « Base de données location seule » — à déplacer');
    expect(texte).toContain('bien 3 — 3 rue Fictive — N5 N5-3 : « Base de données locative › Actifs » → « Base de données locative › Inactifs » — à déplacer');
    expect(texte).toContain('bien 4 — 4 rue Fictive — Location seule');
  });

  it('RÉEL : un déplacement par N5 mal placé, l’issue de chacun au rapport ; les biens sans dossier ne sont jamais créés', async () => {
    const demandes: number[] = [];
    const { texte, issues } = await ranger(true, { biens: async () => BIENS, base: 'x',
      deplacer: async (id) => { demandes.push(id); return id === 3 ? { ok: false, motif: 'Google refuse' } : { ok: true }; } });
    expect(demandes).toEqual([2, 3]);
    expect(issues).toEqual([{ lotId: 2, ok: true, motif: null }, { lotId: 3, ok: false, motif: 'Google refuse' }]);
    expect(texte).toContain('— DÉPLACÉ');
    expect(texte).toContain('— ÉCHEC : Google refuse');
  });

  it('le rapport : `.captures/ranger-dossiers-statut/` par le chemin commun ; « --reel » seul déclenche l’écriture ; jamais le Bureau', () => {
    const src = readFileSync('app/scripts/ranger-dossiers-statut.ts', 'utf8');
    expect(src).toContain("const NOM_SCRIPT = 'ranger-dossiers-statut';");
    expect(src).toContain("cheminRapport({ nomScript: NOM_SCRIPT, demande: optionLigne(argv, 'rapport') })");
    expect(src).toContain("const reel = argv.includes('--reel');");
    expect(src).not.toMatch(/Desktop|Bureau\//);
    expect(texteRapport({ reel: false, base: 'b', quand: new Date(0), biens: [] })).toContain('biens examinés : 0');
  });
});
