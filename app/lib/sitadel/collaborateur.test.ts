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
    expect(problemesCollaborateur(c({ fonction: 'X' }))).toContain('fonction : trop court pour être crédible');
    expect(problemesCollaborateur(c({ email: 'pas-un-mail' }))).toContain('e-mail : format invalide');
  });
});

describe('S8a — tourniquet (déterministe, AUCUN aléatoire)', () => {
  const A = c({ id: 1 }), B = c({ id: 2, email: 'b@x.fr' }), C = c({ id: 3, email: 'c@x.fr' });
  const vide = new Map<number, string | null>();

  it('jamais-écrit passe devant ; à égalité, id croissant', () => {
    const r = choisirCollaborateur('92050', [A, B, C], vide, NOW);
    expect(r.collaborateurId).toBe(1);
    expect(r.raison).toContain("n'a jamais écrit");
  });

  it('la dernière demande la plus ANCIENNE gagne', () => {
    const d = new Map<number, string | null>([[1, '2026-07-30'], [2, '2026-07-01'], [3, '2026-07-20']]);
    const r = choisirCollaborateur('92050', [A, B, C], d, NOW);
    expect(r.collaborateurId).toBe(2);
    expect(r.raison).toMatch(/il y a \d+ jour/);
  });

  it('jamais-écrit devant un ayant écrit récemment', () => {
    const d = new Map<number, string | null>([[1, '2026-07-30']]); // B/C jamais
    expect(choisirCollaborateur('92050', [A, B, C], d, NOW).collaborateurId).toBe(2);
  });

  it('deux exécutions identiques → même résultat (déterminisme) ; date égale → id croissant', () => {
    const d = new Map<number, string | null>([[1, '2026-07-10'], [2, '2026-07-10']]);
    expect(choisirCollaborateur('92050', [A, B], d, NOW)).toEqual(choisirCollaborateur('92050', [A, B], d, NOW));
    expect(choisirCollaborateur('92050', [A, B], d, NOW).collaborateurId).toBe(1);
  });

  it('un collaborateur DÉSACTIVÉ n’est jamais choisi', () => {
    expect(choisirCollaborateur('92050', [c({ id: 1, actif: false }), B], vide, NOW).collaborateurId).toBe(2);
  });

  it('identité incomplète → non éligible', () => {
    expect(collaborateurEligible(c({ email: 'x' }))).toBe(false);
    expect(choisirCollaborateur('92050', [c({ id: 1, nom: '' }), B], vide, NOW).collaborateurId).toBe(2);
  });

  it('aucun éligible → null + raison (jamais d’exception)', () => {
    const r = choisirCollaborateur('92050', [c({ actif: false })], vide, NOW);
    expect(r.collaborateurId).toBeNull();
    expect(r.raison).toContain('aucun collaborateur éligible');
  });

  it('3 collaborateurs, 6 demandes à la même commune → séquence EXACTE A,B,C,A,B,C', () => {
    const dern = new Map<number, string | null>();
    const seq: (number | null)[] = [];
    let t = Date.parse('2026-08-01T12:00:00Z');
    for (let i = 0; i < 6; i++) {
      const { collaborateurId } = choisirCollaborateur('92050', [A, B, C], dern, new Date(t));
      seq.push(collaborateurId);
      if (collaborateurId !== null) dern.set(collaborateurId, new Date(t).toISOString());
      t += 60_000;
    }
    expect(seq).toEqual([1, 2, 3, 1, 2, 3]);
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
