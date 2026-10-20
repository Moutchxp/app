import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nomDossierBail, planBrancheBail, type EntreePlanBail } from './brancheBailDrive';

/** 🔴 Arno (20/10/2026) — la branche « BAIL » créée sur le Drive au nouveau locataire : noms, arborescence, parents, idempotence. */
describe('nomDossierBail — « BAIL » + les noms de famille des colocataires', () => {
  it('un colocataire : « BAIL MARTIN » (majuscules)', () => {
    expect(nomDossierBail(['Martin'], [], 2026)).toBe('BAIL MARTIN');
  });
  it('deux : dans l’ordre de saisie, séparés par « – »', () => {
    expect(nomDossierBail(['Youenou', 'Talhouarn'], [], 2026)).toBe('BAIL YOUENOU – TALHOUARN');
  });
  it('même nom déjà dans « 6 Locataires » : l’année d’entrée s’ajoute (comparaison sans casse ni accents)', () => {
    expect(nomDossierBail(['Martin'], ['Bail Martin', 'Bail 01/09/2022 – HIRSCH Thibaut'], 2026)).toBe('BAIL MARTIN 2026');
    expect(nomDossierBail(['Martin'], ['BAIL DUPONT'], 2026)).toBe('BAIL MARTIN');
  });
  it('un nom répété (deux fiches homonymes) ne s’écrit qu’une fois', () => {
    expect(nomDossierBail(['Martin', 'MARTIN'], [], 2026)).toBe('BAIL MARTIN');
  });
});

const BASE: EntreePlanBail = {
  bailId: 900, annee: 2026, entree: '2026-11-01', nomN7: 'BAIL MARTIN',
  proprietaire: { id: 5, nom: 'DUPONT Jean' }, bien: { teteId: 70, nom: 'Appartement T2 (lot 12)' }, adresse: { cle: 'a:5:A:abc', nom: '1 rue X, 75001 Paris' },
  n2: 'N2actifs', existants: new Map([['p:5:A', 'N3'], ['a:5:A:abc', 'N4'], ['b:70', 'N5'], ['r:70:6', 'N6']]),
};
const resume = (cs: { cle: string; niveau: number; nom: string; parent: { driveId: string } | { cle: string } }[]) =>
  cs.map((c) => `N${c.niveau} ${c.nom} ← ${'driveId' in c.parent ? c.parent.driveId : c.parent.cle}`);

describe('planBrancheBail — la branche du bail, selon le modèle', () => {
  it('« 6 Locataires » existe : N7 → N10, exactement le modèle (pièces, sous-pièces, année en cours)', () => {
    const p = planBrancheBail(BASE);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(resume(p.creations)).toEqual([
      'N7 BAIL MARTIN ← N6',
      'N8 1 Papiers d’identité ← bl:900',
      'N8 2 Profil financier ← bl:900',
      'N8 3 Garants ← bl:900',
      'N8 4 GLI ← bl:900',
      'N8 5 Assurances ← bl:900',
      'N9 Assurance habitation ← bl:900:5',
      'N10 2026 ← bl:900:5:s',
      'N8 6 Entretien ← bl:900',
      'N9 Chaudière ← bl:900:6',
      'N10 2026 ← bl:900:6:s',
    ]);
    expect(p.creations.every((c) => c.bailId === 900 && c.lotId === 70)).toBe(true);
  });

  it('IDEMPOTENCE : un dossier déjà enregistré n’est jamais recréé', () => {
    const tout = planBrancheBail(BASE);
    if (!tout.ok) throw new Error('plan');
    const existants = new Map([...BASE.existants, ...tout.creations.map((c) => [c.cle, `id-${c.cle}`] as [string, string])]);
    const p = planBrancheBail({ ...BASE, existants });
    expect(p.ok && p.creations).toEqual([]);
    // Une branche à moitié créée : seul le reste l'est.
    const moitie = new Map([...BASE.existants, ['bl:900', 'N7'], ['bl:900:1', 'P1']]);
    const q = planBrancheBail({ ...BASE, existants: moitie });
    expect(q.ok && q.creations.map((c) => c.cle)).not.toContain('bl:900');
    expect(q.ok && q.creations[0].parent).toEqual({ driveId: 'N7' });
  });

  it('PARENTS MANQUANTS : le bien sans dossier → N5, ses rubriques, « 1 Propriétaire » › PNO/Taxe foncière › année, « 6 Locataires », puis le bail', () => {
    const p = planBrancheBail({ ...BASE, existants: new Map([['p:5:A', 'N3'], ['a:5:A:abc', 'N4']]) });
    if (!p.ok) throw new Error('plan');
    const r = resume(p.creations);
    expect(r.slice(0, 13)).toEqual([
      'N5 Appartement T2 (lot 12) ← N4',
      'N6 0 En attente ← b:70', 'N6 1 Propriétaire ← b:70',
      'N7 PNO ← r:70:1', 'N8 2026 ← pr:70:0', 'N7 Taxe foncière ← r:70:1', 'N8 2026 ← pr:70:1',
      'N6 2 Diagnostics ← b:70', 'N6 3 Photos ← b:70', 'N6 4 Syndic ← b:70', 'N6 5 Travaux ← b:70', 'N6 6 Locataires ← b:70',
      'N7 BAIL MARTIN ← r:70:6',
    ]);
  });

  it('propriétaire sans dossier : N3 sous « Actifs », puis N4 ; sans « Actifs » connu, refus clair', () => {
    const p = planBrancheBail({ ...BASE, existants: new Map() });
    expect(p.ok && resume(p.creations).slice(0, 3)).toEqual(['N3 DUPONT Jean ← N2actifs', 'N4 1 rue X, 75001 Paris ← p:5:A', 'N5 Appartement T2 (lot 12) ← a:5:A:abc']);
    expect(planBrancheBail({ ...BASE, existants: new Map(), n2: null })).toMatchObject({ ok: false });
  });
});

describe('garde-fous statiques du module Drive du bail', () => {
  const repo = readFileSync('app/lib/location/brancheBailDriveRepo.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')).join('\n');
  it('aucune suppression, corbeille, déplacement, copie, ni lecture de contenu', () => {
    expect(repo).not.toMatch(/method:\s*'DELETE'|trashed:\s*true|addParents|removeParents|\/copy|alt=media|emptyTrash/);
  });
  it('une seule création (POST) ; le renommage passe par le module commun ; la règle « Documents clients scannés » est consultée', () => {
    expect(repo.match(/method:\s*'POST'/g)).toHaveLength(1);
    expect(repo).not.toMatch(/method:\s*'PATCH'/);
    expect(repo).toContain('renommerFichierDrive(');
    expect(repo).toContain('peutCreerDossier(parentId, indexerMaillons(chaine))');
  });
});
