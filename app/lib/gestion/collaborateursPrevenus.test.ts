import { describe, expect, it } from 'vitest';
import {
  REGLAGE_COLLABORATEURS_PREVENUS, collaborateursDuReglage, decouperCollaborateurs, validerCollaborateurs, valeurEnregistree,
} from './collaborateursPrevenus';

/**
 * 🔴 Arno (18/11/2026) — le réglage « collaborateurs prévenus » : « Prévois un type, une validation (adresses e-mail valides, pas de
 * doublon) et un libellé lisible par un non-développeur » ; « si la liste est vide, la règle actuelle s'applique (repli sûr) ».
 */
const QUATRE = ['a.jorel@sansvisavis.com', 'jb.pons@sansvisavis.com', 'c.jullien@sansvisavis.com', 'gestion@criterimmo.fr'];

describe('🔴 le réglage « collaborateurs prévenus »', () => {
  it('la valeur par défaut d’Arno : les quatre adresses, avec gestion@criterimmo.fr et sans a.dasilva', () => {
    expect(REGLAGE_COLLABORATEURS_PREVENUS.defaut).toEqual(QUATRE);
    expect(REGLAGE_COLLABORATEURS_PREVENUS.defaut).not.toContain('a.dasilva@sansvisavis.com');
    expect(validerCollaborateurs(REGLAGE_COLLABORATEURS_PREVENUS.defaut)).toEqual({ ok: true, adresses: QUATRE });
  });
  it('décrit pour une future page de réglages : type, libellé lisible, aide, colonne, réglage vif', () => {
    expect(REGLAGE_COLLABORATEURS_PREVENUS).toMatchObject({
      type: 'liste_emails', statut: 'vive', table: 'gestion_config', colonne: 'collaborateurs_prevenus',
      libelle: 'Collaborateurs prévenus (mails internes de la Location)',
    });
    expect(REGLAGE_COLLABORATEURS_PREVENUS.aide).toContain('Laissée vide');
  });
  it('découpe virgules, points-virgules et retours à la ligne ; minuscules ; blancs retirés', () => {
    expect(decouperCollaborateurs(' A.Jorel@sansvisavis.com ;jb.pons@sansvisavis.com\n gestion@criterimmo.fr ,, '))
      .toEqual(['a.jorel@sansvisavis.com', 'jb.pons@sansvisavis.com', 'gestion@criterimmo.fr']);
  });
  it('refuse une adresse invalide ou en double (le motif nomme l’adresse) ; au-delà du maximum : refusé', () => {
    expect(validerCollaborateurs('a.jorel@sansvisavis.com, pas-une-adresse')).toEqual({ ok: false, motif: 'Adresse e-mail invalide : pas-une-adresse.' });
    expect(validerCollaborateurs('a.jorel@sansvisavis.com, A.JOREL@sansvisavis.com')).toEqual({ ok: false, motif: 'Adresse en double : a.jorel@sansvisavis.com.' });
    const trop = Array.from({ length: REGLAGE_COLLABORATEURS_PREVENUS.maximum + 1 }, (_, i) => `c${i}@exemple.fr`);
    expect(validerCollaborateurs(trop).ok).toBe(false);
  });
  it('🔴 repli sûr : vide, absent ou invalide → `null` (la règle des comptes) ; valide → la liste', () => {
    expect(collaborateursDuReglage(null)).toBeNull();
    expect(collaborateursDuReglage('   ')).toBeNull();
    expect(collaborateursDuReglage('a.jorel@sansvisavis.com, faux')).toBeNull();
    expect(collaborateursDuReglage('a.jorel@sansvisavis.com, a.jorel@sansvisavis.com')).toBeNull();
    expect(collaborateursDuReglage(valeurEnregistree(QUATRE))).toEqual(QUATRE);
  });
  it('la migration 493 pose exactement la valeur par défaut, sans écraser une valeur déjà réglée', async () => {
    const { readFileSync } = await import('node:fs');
    const sql = readFileSync('db/migrations/493_gestion_collaborateurs_prevenus.sql', 'utf8').replace(/\s+/g, ' ');
    expect(sql).toContain(`SET collaborateurs_prevenus = '${valeurEnregistree(QUATRE)}'`);
    expect(sql).toContain('WHERE id = 1 AND collaborateurs_prevenus IS NULL');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS collaborateurs_prevenus text');
  });
});
