import { describe, it, expect } from 'vitest';
import { construireFiltreSuivi, TYPES_PERMIS_FILTRE } from './filtreSuivi';

/**
 * FILTRE de la liste de suivi — module PUR. On teste le COMPORTEMENT (fragment sémantique + VALEURS LIÉES), jamais la forme exacte
 * d'un WHERE complet (règle projet). Un test par critère + une combinaison. Toute valeur d'utilisateur doit être un PARAMÈTRE LIÉ.
 */
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('construireFiltreSuivi — un critère à la fois (fragment + valeur liée)', () => {
  it('vide → inactif, aucun fragment, aucune valeur', () => {
    const r = construireFiltreSuivi({});
    expect(r.actif).toBe(false);
    expect(r.fragments).toEqual([]);
    expect(r.valeurs).toEqual([]);
  });

  it('n° de permis → ILIKE lié sur num_dau (jamais concaténé)', () => {
    const r = construireFiltreSuivi({ numDau: '0930012500081' });
    expect(r.actif).toBe(true);
    expect(norm(r.fragments.join(' '))).toContain('s.num_dau ILIKE');
    expect(r.fragments.join(' ')).toContain('$1'); // paramètre lié
    expect(r.valeurs).toEqual(['0930012500081']);
  });

  it('n° interne → égalité liée sur e.dossier_id (entier > 0)', () => {
    const r = construireFiltreSuivi({ dossierId: 7424 });
    expect(norm(r.fragments.join(' '))).toContain('e.dossier_id = $1');
    expect(r.valeurs).toEqual([7424]);
    // n° interne invalide (0 / non entier) → ignoré
    expect(construireFiltreSuivi({ dossierId: 0 }).actif).toBe(false);
    expect(construireFiltreSuivi({ dossierId: null }).actif).toBe(false);
  });

  it('commune → ILIKE lié sur c.nom', () => {
    const r = construireFiltreSuivi({ commune: 'Aubervilliers' });
    expect(norm(r.fragments.join(' '))).toContain('c.nom ILIKE');
    expect(r.valeurs).toEqual(['Aubervilliers']);
  });

  it('type → prédicat CONSTANT par clé de la liste fermée, AUCUNE valeur liée ; clé inconnue ignorée', () => {
    for (const t of TYPES_PERMIS_FILTRE) {
      const r = construireFiltreSuivi({ type: t.cle });
      expect(r.actif).toBe(true);
      expect(r.valeurs).toEqual([]); // le type ne lie aucune valeur (prédicat constant)
      expect(norm(r.fragments.join(' '))).toContain(t.cle === 'pd' ? "s.type = 'PD'" : "s.type = 'PC'");
    }
    expect(construireFiltreSuivi({ type: 'sql_injection' }).actif).toBe(false); // hors liste fermée → ignoré
  });

  it('date d’autorisation (bornes) → >= / <= liés sur date_reelle_autorisation ; date malformée ignorée', () => {
    const r = construireFiltreSuivi({ autorisationDe: '2026-01-01', autorisationA: '2026-09-01' });
    const f = norm(r.fragments.join(' '));
    expect(f).toContain('s.date_reelle_autorisation >= $1');
    expect(f).toContain('s.date_reelle_autorisation <= $2');
    expect(r.valeurs).toEqual(['2026-01-01', '2026-09-01']);
    expect(construireFiltreSuivi({ autorisationDe: '01/01/2026' }).actif).toBe(false); // format non AAAA-MM-JJ → ignoré
  });

  it('date d’ENTRÉE en suivi → COALESCE(detecte_le, maj_le) borné (même source que « suivi depuis »), borne haute inclusive', () => {
    const r = construireFiltreSuivi({ entreeDe: '2026-09-01', entreeA: '2026-09-06' });
    const f = norm(r.fragments.join(' '));
    expect(f).toContain('COALESCE(r.detecte_le, e.maj_le) >= $1');
    expect(f).toContain('COALESCE(r.detecte_le, e.maj_le) < ($2::date + 1)'); // < jour+1 = inclusif sur le dernier jour
    expect(r.valeurs).toEqual(['2026-09-01', '2026-09-06']);
  });
});

describe('construireFiltreSuivi — COMBINAISON de deux critères (placeholders séquentiels)', () => {
  it('n° de permis ET commune → deux fragments, $1 puis $2, valeurs dans l’ordre', () => {
    const r = construireFiltreSuivi({ numDau: '093', commune: 'Aubervilliers' });
    expect(r.fragments).toHaveLength(2);
    const f = norm(r.fragments.join(' AND '));
    expect(f).toContain('s.num_dau ILIKE');
    expect(f).toContain('$1');
    expect(f).toContain('c.nom ILIKE');
    expect(f).toContain('$2');
    expect(r.valeurs).toEqual(['093', 'Aubervilliers']); // ordre = ordre des $N
  });
});
