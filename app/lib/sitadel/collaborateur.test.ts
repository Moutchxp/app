import { describe, it, expect } from 'vitest';
import { choisirCollaborateur, collaborateurEligible, problemesCollaborateur, resumeEligibilite, type Collaborateur } from './collaborateur';

const c = (over: Partial<Collaborateur> = {}): Collaborateur => ({ id: 1, nom: 'Dupont', prenom: 'Jean', fonction: 'chargé de recherche', email: 'jean.dupont@exemple.fr', actif: true, ...over });
const NOW = new Date('2026-08-01T12:00:00Z');

describe('S8a — problemesCollaborateur (réutilise la plausibilité de problemesIdentite)', () => {
  it('complet → aucun problème', () => { expect(problemesCollaborateur(c())).toEqual([]); });
  it('vide / trop court / gabarit / e-mail invalide → refusés ; CASSE acceptée (garde partagé, correctif S8a)', () => {
    expect(problemesCollaborateur(c({ nom: '' }))).toContain('nom : requis');
    expect(problemesCollaborateur(c({ prenom: 'JEAN' }))).toEqual([]);   // capitales OK (prénom réel)
    expect(problemesCollaborateur(c({ nom: 'DUPONT' }))).toEqual([]);    // nom en capitales OK
    expect(problemesCollaborateur(c({ prenom: 'PRENOM NOM' })).some((m) => m.includes('gabarit'))).toBe(true);
    expect(problemesCollaborateur(c({ email: 'pas-un-mail' }))).toContain('e-mail : format invalide');
  });

  it('fonction FACULTATIVE (correctif S8a) : vide → accepté et ÉLIGIBLE ; renseignée mais gabarit/court → refusée', () => {
    expect(problemesCollaborateur(c({ fonction: '' }))).toEqual([]);
    expect(collaborateurEligible(c({ fonction: '' }))).toBe(true);
    expect(problemesCollaborateur(c({ fonction: 'QUALITE' })).some((m) => m.includes('gabarit'))).toBe(true);
    expect(problemesCollaborateur(c({ fonction: 'X' }))).toContain('fonction : trop court pour être crédible');
  });

  it('nom, prénom, e-mail restent REQUIS ; e-mail sans domaine refusé', () => {
    expect(problemesCollaborateur(c({ nom: '' }))).toContain('nom : requis');
    expect(problemesCollaborateur(c({ prenom: '' }))).toContain('prénom : requis');
    expect(problemesCollaborateur(c({ email: '' }))).toContain('e-mail : requis');
    expect(problemesCollaborateur(c({ email: 'jean@' })).some((m) => m.includes('format invalide'))).toBe(true);
  });
});

describe('S8a/S8b — tourniquet (déterministe, AUCUN aléatoire ; 2 critères)', () => {
  const A = c({ id: 1 }), B = c({ id: 2, email: 'b@x.fr' }), C = c({ id: 3, email: 'c@x.fr' });
  const vide = new Map<number, string | null>();
  const sansCharge = new Map<number, number>();

  it('jamais-écrit passe devant ; à égalité (critère 1 + charge nulle), id croissant', () => {
    const r = choisirCollaborateur('92050', [A, B, C], vide, sansCharge, NOW);
    expect(r.collaborateurId).toBe(1);
    expect(r.raison).toContain("n'a jamais écrit");
  });

  it('la dernière demande la plus ANCIENNE gagne (critère 1)', () => {
    const d = new Map<number, string | null>([[1, '2026-07-30'], [2, '2026-07-01'], [3, '2026-07-20']]);
    const r = choisirCollaborateur('92050', [A, B, C], d, sansCharge, NOW);
    expect(r.collaborateurId).toBe(2);
    expect(r.raison).toMatch(/il y a \d+ jour/);
  });

  it('jamais-écrit devant un ayant écrit récemment (critère 1 prime)', () => {
    const d = new Map<number, string | null>([[1, '2026-07-30']]); // B/C jamais
    expect(choisirCollaborateur('92050', [A, B, C], d, sansCharge, NOW).collaborateurId).toBe(2);
  });

  it('deux exécutions identiques → même résultat (déterminisme) ; date égale + charge nulle → id croissant', () => {
    const d = new Map<number, string | null>([[1, '2026-07-10'], [2, '2026-07-10']]);
    expect(choisirCollaborateur('92050', [A, B], d, sansCharge, NOW)).toEqual(choisirCollaborateur('92050', [A, B], d, sansCharge, NOW));
    expect(choisirCollaborateur('92050', [A, B], d, sansCharge, NOW).collaborateurId).toBe(1);
  });

  it('un collaborateur DÉSACTIVÉ n’est jamais choisi', () => {
    expect(choisirCollaborateur('92050', [c({ id: 1, actif: false }), B], vide, sansCharge, NOW).collaborateurId).toBe(2);
  });

  it('identité incomplète → non éligible', () => {
    expect(collaborateurEligible(c({ email: 'x' }))).toBe(false);
    expect(choisirCollaborateur('92050', [c({ id: 1, nom: '' }), B], vide, sansCharge, NOW).collaborateurId).toBe(2);
  });

  it('aucun éligible → null + raison (jamais d’exception)', () => {
    const r = choisirCollaborateur('92050', [c({ actif: false })], vide, sansCharge, NOW);
    expect(r.collaborateurId).toBeNull();
    expect(r.raison).toContain('aucun collaborateur éligible');
  });

  it('3 collaborateurs, 6 demandes à la MÊME commune → séquence EXACTE A,B,C,A,B,C (critère 1)', () => {
    const dern = new Map<number, string | null>();
    const charge = new Map<number, number>();
    const seq: (number | null)[] = [];
    let t = Date.parse('2026-08-01T12:00:00Z');
    for (let i = 0; i < 6; i++) {
      const { collaborateurId } = choisirCollaborateur('92050', [A, B, C], dern, charge, new Date(t));
      seq.push(collaborateurId);
      if (collaborateurId !== null) { dern.set(collaborateurId, new Date(t).toISOString()); charge.set(collaborateurId, (charge.get(collaborateurId) ?? 0) + 1); }
      t += 60_000;
    }
    expect(seq).toEqual([1, 2, 3, 1, 2, 3]);
  });

  // ── S8b : le test qui manquait — équilibrage GLOBAL sur des communes toutes DIFFÉRENTES ──
  it('3 collaborateurs, 6 lots sur 6 communes DIFFÉRENTES → séquence A,B,C,A,B,C (critère 2, charge globale)', () => {
    const communes = ['91001', '92002', '93003', '94004', '78005', '95006'];
    const charge = new Map<number, number>();
    const seq: (number | null)[] = [];
    let t = Date.parse('2026-08-01T12:00:00Z');
    for (const insee of communes) {
      const { collaborateurId, raison } = choisirCollaborateur(insee, [A, B, C], new Map(), charge, new Date(t));
      seq.push(collaborateurId);
      if (seq.length === 2) expect(raison).toContain('porte le moins de demandes au total'); // la charge a bien tranché
      if (collaborateurId !== null) charge.set(collaborateurId, (charge.get(collaborateurId) ?? 0) + 1);
      t += 60_000;
    }
    expect(seq).toEqual([1, 2, 3, 1, 2, 3]);
  });

  it('critère 1 PRIME sur la charge : A a déjà servi la commune, les autres neuves → A n’y revient pas même s’il est le moins chargé', () => {
    const charge = new Map<number, number>([[1, 0], [2, 5], [3, 5]]); // A le moins chargé globalement
    const dern = new Map<number, string | null>([[1, '2026-07-01']]); // mais A seul a déjà écrit à 92050
    const r = choisirCollaborateur('92050', [A, B, C], dern, charge, NOW);
    expect(r.collaborateurId).toBe(2); // B (jamais écrit) passe devant A ; entre B et C (charge 5=5) → id → B
    expect(r.raison).toContain("n'a jamais écrit");
  });

  it('déterminisme S8b : ordre d’entrée inversé → même résultat (le moins chargé gagne)', () => {
    const charge = new Map<number, number>([[1, 3], [2, 1], [3, 2]]);
    const r1 = choisirCollaborateur('92050', [A, B, C], new Map(), charge, NOW);
    const r2 = choisirCollaborateur('92050', [C, B, A], new Map(), charge, NOW); // entrée inversée
    expect(r1).toEqual(r2);
    expect(r1.collaborateurId).toBe(2); // B le moins chargé (1)
  });
});

describe('S8a — resumeEligibilite', () => {
  it('compte les éligibles et nomme les inaptes actifs (un désactivé n’est pas « inapte »)', () => {
    const r = resumeEligibilite([c({ id: 1 }), c({ id: 2, nom: '', email: 'b@x.fr' }), c({ id: 3, actif: false, email: 'c@x.fr' })]);
    expect(r.nbEligibles).toBe(1);
    expect(r.nbTotal).toBe(3);
    expect(r.inaptes.map((x) => x.id)).toEqual([2]);
  });
});
