import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BandeauSelection } from './TraceEmpriseRendu';
import type { SelectionInfo } from '../../../../lib/permis/plancheParcellesRepo';

/**
 * PL-C4 — bandeau « sélection validée » sous le curseur Rotation. Rendu PUR (node) + garde par lecture de source pour le câblage.
 */
const noop = () => {};
const rendre = (selection: SelectionInfo, confirme = false) =>
  renderToStaticMarkup(createElement(BandeauSelection, { selection, confirme, enCours: false, onDemander: noop, onConfirmer: noop, onAnnuler: noop }));

const AUTO: SelectionInfo = { active: false, idus: [], validePar: null, valideLe: null, acteurNom: null };

describe('BandeauSelection — état courant DIT, provenance honnête, retrait délibéré', () => {
  it('aucune sélection → « configuration automatique » (mention sobre, jamais un vide)', () => {
    const h = rendre(AUTO);
    expect(h).toContain('configuration automatique');
    expect(h).not.toContain('sélection validée');
  });
  it('sélection par un ADMIN identifiable → « sélection validée » + N parcelles + par NOM + date', () => {
    const h = rendre({ active: true, idus: ['A', 'B'], validePar: '2', valideLe: '2026-09-05T14:40:09+02:00', acteurNom: 'Arnaud Jorel' });
    expect(h).toContain('sélection validée');
    expect(h).toContain('2 parcelles');
    expect(h).toContain('Arnaud Jorel');
    expect(h).toContain('05/09/2026');
    expect(h).not.toContain('auteur non identifié');
  });
  it('sélection par un auteur NON identifiable (ex. harnais) → valeur BRUTE + « auteur non identifié », jamais « à la main »', () => {
    const h = rendre({ active: true, idus: ['A'], validePar: 'verif-lot101', valideLe: '2026-09-05T00:00:00+02:00', acteurNom: null });
    expect(h).toContain('verif-lot101');
    expect(h).toContain('auteur non identifié');
    expect(h).not.toContain('à la main');
  });
  it('confirmation du retrait → DIT ce qui se recalcule (empreinte + bâti + projection), geste à deux temps', () => {
    const h = rendre({ active: true, idus: ['A'], validePar: '2', valideLe: null, acteurNom: 'Arnaud Jorel' }, true);
    expect(h).toContain('RECALCULE'); expect(h).toContain('projection');
    expect(h).toContain('Confirmer le retour');
  });
});

describe('câblage du bandeau (lecture de source)', () => {
  const BLOC = readFileSync(fileURLToPath(new URL('./BlocTraceEmprise.tsx', import.meta.url)), 'utf8');
  const ROUTE = readFileSync(fileURLToPath(new URL('../../../../(admin)/api/admin/permis/emprise/route.ts', import.meta.url)), 'utf8');
  it('la route /emprise expose `selection` (lireSelectionInfo)', () => {
    expect(ROUTE).toContain('lireSelectionInfo'); expect(ROUTE).toMatch(/selection,?\s*(exclusionsBestOf|\})/);
  });
  it('BlocTraceEmprise place le bandeau après le curseur Rotation et retire via la route planche (POST retirer)', () => {
    expect(BLOC).toContain('<RotationSchema angle={angle} onAngle={setAngle} />\n            {bandeauSel}');
    expect(BLOC).toContain("fetch('/api/admin/permis/planche', { method: 'POST'");
    expect(BLOC).toContain("action: 'retirer'");
    expect(BLOC).toContain('setRechargeLocal((n) => n + 1)'); // le retrait recharge /emprise → empreinte/schéma/bandeau à jour
  });
});
