import { describe, it, expect } from 'vitest';
import { pointDeContact, type ProfilPoint } from './contact';

describe('pointDeContact', () => {
  it('1) toit plat au-dessus de la fenêtre → dContact = façade', () => {
    const profil: ProfilPoint[] = [
      { distM: 70, altM: 57.6 },
      { distM: 73, altM: 57.6 },
      { distM: 76, altM: 57.6 },
    ];
    const r = pointDeContact(70, profil, 51.95, 57.6);
    expect(r.obstrue).toBe(true);
    expect(r.dFranchissementM).toBe(70);
    expect(r.dContactM).toBe(70); // milieu (70, 70)
    expect(r.raison).toContain('façade');
  });

  it('2) toit en pente franchi à mi-pente → dContact = milieu(façade, franchissement)', () => {
    const profil: ProfilPoint[] = [
      { distM: 50, altM: 48 }, // égout sous fenêtre
      { distM: 55, altM: 52 }, // franchit 52 ici
      { distM: 60, altM: 56 }, // faîtage
    ];
    const r = pointDeContact(50, profil, 52, 56);
    expect(r.obstrue).toBe(true);
    expect(r.dFranchissementM).toBe(55);
    expect(r.dContactM).toBe(52.5); // (50 + 55) / 2
  });

  it('3) franchissement près du faîtage (seul un point haut ≥ fenêtre)', () => {
    const profil: ProfilPoint[] = [
      { distM: 50, altM: 48 },
      { distM: 55, altM: 50 },
      { distM: 60, altM: 56 }, // seul point ≥ 54
    ];
    const r = pointDeContact(50, profil, 54, 56);
    expect(r.obstrue).toBe(true);
    expect(r.dFranchissementM).toBe(60);
    expect(r.dContactM).toBe(55); // (50 + 60) / 2 ≈ milieu façade/faîtage
  });

  it('4) n\'obstrue pas (faîtage < fenêtre)', () => {
    const profil: ProfilPoint[] = [
      { distM: 50, altM: 49 },
      { distM: 55, altM: 50 },
    ];
    const r = pointDeContact(50, profil, 52, 50);
    expect(r.obstrue).toBe(false);
    expect(r.dFranchissementM).toBeNull();
    expect(r.dContactM).toBeNull();
    expect(r.raison).toContain("n'obstrue pas");
  });

  it('5) égout déjà au-dessus (1er point ≥ fenêtre) → dContact = façade', () => {
    const profil: ProfilPoint[] = [
      { distM: 50, altM: 53 }, // bord d'attaque déjà ≥ 52
      { distM: 55, altM: 55 },
    ];
    const r = pointDeContact(50, profil, 52, 56);
    expect(r.obstrue).toBe(true);
    expect(r.dFranchissementM).toBe(50);
    expect(r.dContactM).toBe(50);
    expect(r.raison).toContain('façade');
  });

  it('6) profil vide + faîtage ≥ fenêtre → repli façade (conservateur)', () => {
    const r = pointDeContact(50, [], 52, 56);
    expect(r.obstrue).toBe(true);
    expect(r.dFranchissementM).toBe(50);
    expect(r.dContactM).toBe(50);
    expect(r.raison).toContain('repli façade');
  });

  it('garde-fou : franchissement jamais en-deçà de la façade', () => {
    // un point qualifiant à distM 30 < dFacade 50 → ramené à 50
    const profil: ProfilPoint[] = [
      { distM: 48, altM: 40 },
      { distM: 30, altM: 60 }, // hors ordre / en-deçà façade
    ];
    // profil[0] (alt 40) < fenêtre, donc on cherche le 1er ≥ 52 = distM 30
    const r = pointDeContact(50, profil, 52, 60);
    expect(r.dFranchissementM).toBe(50); // max(50, 30)
    expect(r.dContactM).toBe(50);
  });
});
