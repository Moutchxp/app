import { describe, it, expect } from 'vitest';
import { liensVisibles } from './menuAdmin';
import { permsToutes, permsAucune } from '../../../lib/admin/session';

describe('liensVisibles — filtrage du menu (M3-4 Lot C)', () => {
  it('administrateur → TOUS les modules + « Administratif », même si les perms sont toutes false', () => {
    const liens = liensVisibles('administrateur', permsAucune()); // perms ignorées pour un admin (rôle d'abord)
    const slugs = liens.map((l) => l.slug);
    expect(slugs).toContain('/admin/pilotage');
    expect(slugs).toContain('/admin/curation');
    expect(slugs).toContain('/admin/banc-test');
    expect(slugs).toContain('/admin/comptes'); // tuile Administratif
    expect(liens).toHaveLength(7); // 6 modules + Administratif
  });

  it('collaborateur → uniquement ses permissions, JAMAIS « Administratif »', () => {
    const liens = liensVisibles('collaborateur', { ...permsAucune(), curation: true, banc_test: true });
    const slugs = liens.map((l) => l.slug);
    expect(slugs).toEqual(['/admin/curation', '/admin/banc-test']);
    expect(slugs).not.toContain('/admin/comptes');
  });

  it('collaborateur sans aucune permission → menu vide (mais jamais Administratif)', () => {
    const liens = liensVisibles('collaborateur', permsAucune());
    expect(liens).toHaveLength(0);
  });

  it('collaborateur avec TOUTES les perms → 6 modules mais JAMAIS Administratif (rôle, pas permission)', () => {
    const slugs = liensVisibles('collaborateur', permsToutes()).map((l) => l.slug);
    expect(slugs).toHaveLength(6);
    expect(slugs).not.toContain('/admin/comptes');
  });

  it('chaque lien porte libellé + description (contrat unique menu latéral ET grille du dashboard)', () => {
    for (const l of liensVisibles('administrateur', permsToutes())) {
      expect(l.libelle.length).toBeGreaterThan(0);
      expect(l.desc.length).toBeGreaterThan(0);
    }
  });
});
