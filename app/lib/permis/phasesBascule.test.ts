import { describe, it, expect } from 'vitest';
import { dateBasculeTheorique, deciderPhase, type EntreePhase } from './phasesBascule';

/**
 * PHASE-1 — fonction PURE `dateBasculeTheorique` : date d'accord + délai (jours) → date de bascule THÉORIQUE. Aucune base, aucune
 * décision de phase/verdict : juste l'arithmétique de dates. On éprouve le défaut 548, un délai personnalisé, une année bissextile,
 * et le cas « date d'accord absente ».
 */
describe('dateBasculeTheorique', () => {
  it('date d’accord + 548 jours (défaut) → date de bascule attendue', () => {
    expect(dateBasculeTheorique('2025-10-28', 548)).toBe('2027-04-29'); // dossier 531 (accord réel)
    expect(dateBasculeTheorique('2025-08-27', 548)).toBe('2027-02-26'); // dossier 11430 (accord réel)
  });

  it('délai PERSONNALISÉ respecté (jamais 548 en dur)', () => {
    expect(dateBasculeTheorique('2025-10-28', 0)).toBe('2025-10-28');   // délai 0 → même jour
    expect(dateBasculeTheorique('2025-01-31', 365)).toBe('2026-01-31'); // un an calendaire
  });

  it('année BISSEXTILE : le 29 février est compté (60 j depuis le 1er janvier)', () => {
    expect(dateBasculeTheorique('2024-01-01', 60)).toBe('2024-03-01'); // 2024 bissextile : Fév a 29 j → 60 j = 1er mars
    expect(dateBasculeTheorique('2023-01-01', 60)).toBe('2023-03-02'); // 2023 non bissextile : Fév a 28 j → 60 j = 2 mars
  });

  it('accepte un objet Date (composants UTC) autant qu’une chaîne ISO', () => {
    expect(dateBasculeTheorique(new Date(Date.UTC(2025, 9, 28)), 548)).toBe('2027-04-29'); // mois 9 = octobre
  });

  it('date d’accord ABSENTE → pas de bascule calculable (null explicite, jamais une date inventée)', () => {
    expect(dateBasculeTheorique(null, 548)).toBeNull();
    expect(dateBasculeTheorique(undefined, 548)).toBeNull();
    expect(dateBasculeTheorique('', 548)).toBeNull();
    expect(dateBasculeTheorique('pas-une-date', 548)).toBeNull();
  });

  it('délai invalide (non entier ou négatif) → null (garde : on ne suppose rien)', () => {
    expect(dateBasculeTheorique('2025-10-28', -1)).toBeNull();
    expect(dateBasculeTheorique('2025-10-28', 1.5)).toBeNull();
    expect(dateBasculeTheorique('2025-10-28', Number.NaN)).toBeNull();
  });
});

// ── PHASE-2 — moteur de décision de phase (faits synthétiques : aucun dossier réel n'est en phase 2/3) ────────────────────────
const entree = (over: Partial<EntreePhase> = {}): EntreePhase => ({
  dateAccord: '2025-10-28', delaiBasculeJours: 548, dureeMessageJours: 548,
  rattachementValide: false, basculeLe: null, aujourdhui: '2026-08-29', ...over,
});

describe('deciderPhase', () => {
  it('délai NON écoulé → phase 1 (verdict projeté proposé), même rattachement validé', () => {
    const d = deciderPhase(entree({ dateAccord: '2026-01-01', rattachementValide: true, aujourdhui: '2026-08-29' })); // 240 j < 548
    expect(d).toEqual({ phase: 1, doitEcrireBascule: false, dateBascule: null, afficherMessage: false, verdictProjetePropose: true });
  });

  it('délai écoulé mais rattachement NON validé → phase 1 (même dépassé de plusieurs années)', () => {
    const d = deciderPhase(entree({ dateAccord: '2020-01-01', rattachementValide: false, aujourdhui: '2026-08-29' }));
    expect(d.phase).toBe(1);
    expect(d.doitEcrireBascule).toBe(false);
    expect(d.verdictProjetePropose).toBe(true);
  });

  it('les DEUX réunies (délai écoulé + rattachement validé) et basculeLe vide → phase 2 + doitEcrireBascule (date = aujourd’hui)', () => {
    const d = deciderPhase(entree({ dateAccord: '2020-01-01', rattachementValide: true, basculeLe: null, aujourdhui: '2026-08-29' }));
    expect(d).toEqual({ phase: 2, doitEcrireBascule: true, dateBascule: '2026-08-29', afficherMessage: true, verdictProjetePropose: false });
  });

  it('validation AUTOMATIQUE non écartée : rattachementValide=true (quelle que soit son origine) suffit à basculer', () => {
    // le module ne connaît que le booléen ; qu'il vienne d'une validation humaine ou 'moteur:auto' ne change rien ici.
    const d = deciderPhase(entree({ dateAccord: '2020-01-01', rattachementValide: true, aujourdhui: '2026-08-29' }));
    expect(d.phase).toBe(2);
    expect(d.doitEcrireBascule).toBe(true);
  });

  it('basculeLe posée, message NON expiré → phase 2 AVEC message, jamais réécrire la bascule', () => {
    const d = deciderPhase(entree({ basculeLe: '2026-06-01', dureeMessageJours: 548, rattachementValide: true, aujourdhui: '2026-08-29' }));
    expect(d).toEqual({ phase: 2, doitEcrireBascule: false, dateBascule: null, afficherMessage: true, verdictProjetePropose: false });
  });

  it('basculeLe posée, message EXPIRÉ → phase 3 SANS message', () => {
    const d = deciderPhase(entree({ basculeLe: '2024-01-01', dureeMessageJours: 548, aujourdhui: '2026-08-29' })); // fin ≈ 2025-07 < aujourd’hui
    expect(d).toEqual({ phase: 3, doitEcrireBascule: false, dateBascule: null, afficherMessage: false, verdictProjetePropose: false });
  });

  it('fin de fenêtre du message : le jour exact bascule+durée → phase 3 (message éteint), la veille → phase 2', () => {
    expect(deciderPhase(entree({ basculeLe: '2025-01-01', dureeMessageJours: 365, aujourdhui: '2026-01-01' })).phase).toBe(3); // borne exclue
    expect(deciderPhase(entree({ basculeLe: '2025-01-01', dureeMessageJours: 365, aujourdhui: '2025-12-31' })).phase).toBe(2);
  });

  it('ANTI-RÉGRESSION : basculeLe posée mais rattachement redevenu INVALIDE → reste phase 2/3, JAMAIS phase 1', () => {
    const enCours = deciderPhase(entree({ basculeLe: '2026-06-01', dureeMessageJours: 548, rattachementValide: false, aujourdhui: '2026-08-29' }));
    expect(enCours.phase).toBe(2); // message encore actif
    const apres = deciderPhase(entree({ basculeLe: '2024-01-01', dureeMessageJours: 548, rattachementValide: false, aujourdhui: '2026-08-29' }));
    expect(apres.phase).toBe(3); // message expiré, mais jamais phase 1
    expect(enCours.doitEcrireBascule).toBe(false);
    expect(apres.doitEcrireBascule).toBe(false);
  });

  it('date d’accord ABSENTE et pas encore basculé → phase 1 explicite (bascule non calculable, jamais déclenchée)', () => {
    const d = deciderPhase(entree({ dateAccord: null, rattachementValide: true, basculeLe: null, aujourdhui: '2026-08-29' }));
    expect(d).toEqual({ phase: 1, doitEcrireBascule: false, dateBascule: null, afficherMessage: false, verdictProjetePropose: true });
  });
});
