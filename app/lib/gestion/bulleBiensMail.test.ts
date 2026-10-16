import { describe, it, expect } from 'vitest';
import { ligneDeLaBulle, placerBulleBiens, typeDuBien, MARGE_BULLE, TYPE_NON_RENSEIGNE } from './bulleBiensMail';
import { morceauxDefinition } from './porteeSuivi';

const bien = (o: Partial<Parameters<typeof ligneDeLaBulle>[0]> = {}) => ({
  cle: '219', adresse: '25 rue Edith Cavell', codePostal: '92400', commune: 'COURBEVOIE',
  nature: 'Appartement meublé', typeBien: 'Type 2', proprietaire: 'JULLIEN - GARRIDO Cédric', ...o,
});

describe('🔴 une ligne par bien : adresse — type — lot N …… propriétaire', () => {
  it('le cas d’Arno', () => {
    expect(ligneDeLaBulle(bien())).toEqual({
      bien: '25 rue Edith Cavell, 92400 COURBEVOIE — Appartement meublé · Type 2 — lot 219',
      proprietaire: 'JULLIEN - GARRIDO Cédric',
    });
  });
  it('type inconnu : « type non renseigné », jamais inventé (« À renseigner » compris)', () => {
    expect(typeDuBien({ nature: null, typeBien: '  ' })).toBe(TYPE_NON_RENSEIGNE);
    expect(typeDuBien({ nature: 'A renseigner', typeBien: null })).toBe(TYPE_NON_RENSEIGNE);
    expect(typeDuBien({ nature: 'Parking', typeBien: null })).toBe('Parking');
    /* Constaté à l'écran (lot 316) : nature et typologie identiques ne se répètent pas. */
    expect(typeDuBien({ nature: 'Garage', typeBien: 'Garage' })).toBe('Garage');
    expect(ligneDeLaBulle(bien({ nature: null, typeBien: null })).bien).toContain('— type non renseigné — lot 219');
  });
  it('propriétaire absent : dit, pas laissé vide', () => {
    expect(ligneDeLaBulle(bien({ proprietaire: null })).proprietaire).toBe('propriétaire inconnu');
  });
});

describe('🔴 la bulle reste entière dans l’écran', () => {
  const fenetre = { largeur: 1440, hauteur: 900 };
  it('dessous, bord droit sur celui du texte', () => {
    const p = placerBulleBiens({ declencheur: { gauche: 1300, haut: 200, largeur: 90, hauteur: 14 }, bulle: { largeur: 600, hauteur: 80 }, fenetre });
    expect(p).toMatchObject({ cote: 'dessous', gauche: 1390 - 600, haut: 220 });
  });
  it('près du bord droit : ramenée dans l’écran, marge gardée', () => {
    const p = placerBulleBiens({ declencheur: { gauche: 1400, haut: 200, largeur: 90, hauteur: 14 }, bulle: { largeur: 600, hauteur: 80 }, fenetre });
    expect(p.gauche + 600).toBeLessThanOrEqual(1440 - MARGE_BULLE);
  });
  it('près du bord gauche et bulle plus large que l’écran : bornée à la marge', () => {
    const p = placerBulleBiens({ declencheur: { gauche: 10, haut: 200, largeur: 90, hauteur: 14 }, bulle: { largeur: 2000, hauteur: 80 }, fenetre });
    expect(p.gauche).toBe(MARGE_BULLE);
  });
  it('en bas de l’écran : au-dessus', () => {
    const p = placerBulleBiens({ declencheur: { gauche: 700, haut: 860, largeur: 90, hauteur: 14 }, bulle: { largeur: 400, hauteur: 120 }, fenetre });
    expect(p.cote).toBe('dessus');
    expect(p.haut + 120).toBeLessThanOrEqual(860);
  });
});

describe('🔴 la position ③ : « suivi de fond » en gras', () => {
  it('trois morceaux, le gras au milieu ; le compteur intact', () => {
    const m = morceauxDefinition('suite', 2);
    expect(m.map((x) => x.fort)).toEqual([false, true, false]);
    expect(m[1].texte).toBe('suivi de fond');
    expect(m.map((x) => x.texte).join('')).toBe('À partir de ce mail, et pour tous les prochains échanges de cette conversation, le suivi de fond rattachera les biens choisis ci-dessus. Les mails plus anciens ne changent pas — 2 biens rattachés.');
    expect(morceauxDefinition('origine', 0).every((x) => !x.fort)).toBe(true);
  });
});

/* ══ 🔴🔴 LOT GESTION-BULLES (Arno, 16/10/2026) — la bulle structurée ═════════════════════════════════════════════════ */
describe('🔴🔴 la bulle structurée : une ligne par bien, et le suivi de fond à part', async () => {
  const { ligneStructuree, piedException, bienCourtSansCodePostal } = await import('./bulleBiensMail');
  const B = { cle: '21', adresse: '54 Avenue Puvis De Chavannes', codePostal: '92400', commune: 'COURBEVOIE', nature: 'Appartement meublé', typeBien: 'Type 1', proprietaire: 'COSYNS Pierre' };
  it('adresse et commune (sans code postal) ; « lot N · type » ; le type omis s’il est inconnu', () => {
    expect(ligneStructuree(B)).toEqual({ adresse: '54 Avenue Puvis De Chavannes, COURBEVOIE', lot: 'lot 21 · Appartement meublé · Type 1', proprietaire: 'COSYNS Pierre' });
    expect(ligneStructuree({ ...B, nature: null, typeBien: 'A renseigner', proprietaire: null })).toEqual({ adresse: '54 Avenue Puvis De Chavannes, COURBEVOIE', lot: 'lot 21', proprietaire: null });
  });
  it('la dernière ligne de l’exception dit le suivi de fond, en forme courte', () => {
    expect(piedException(['54 Avenue Puvis De Chavannes, 92400 COURBEVOIE — lot 36', '8 rue X, 92800 PUTEAUX — Parking — lot 9']))
      .toBe('Différent du suivi de la conversation : 54 Avenue Puvis De Chavannes, COURBEVOIE (lot 36) ; 8 rue X, PUTEAUX (lot 9)');
    expect(piedException('interne')).toBe('Différent du suivi de la conversation : Interne');
    expect(piedException(null)).toBe('Différent du suivi de la conversation : aucun suivi');
    expect(piedException([])).toBe('Différent du suivi de la conversation : aucun bien');
    expect(bienCourtSansCodePostal('Sans lot')).toBe('Sans lot');
  });
});
