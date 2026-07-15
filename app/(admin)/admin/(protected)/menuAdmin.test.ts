import { describe, it, expect } from 'vitest';
import { liensVisibles, ordonner, validerOrdreModules, type LienMenu } from './menuAdmin';
import { permsToutes, permsAucune } from '../../../lib/admin/session';

describe('liensVisibles — filtrage du menu (M3-4 Lot C)', () => {
  it('administrateur → TOUS les modules + « Administratif », même si les perms sont toutes false', () => {
    const liens = liensVisibles('administrateur', permsAucune()); // perms ignorées pour un admin (rôle d'abord)
    const slugs = liens.map((l) => l.slug);
    expect(slugs).toContain('/admin/pilotage');
    expect(slugs).toContain('/admin/curation');
    expect(slugs).toContain('/admin/banc-test');
    expect(slugs).toContain('/admin/comptes'); // tuile Administratif
    expect(slugs).toContain('/admin/audit'); // tuile Audit (Lot 7), administrateur uniquement
    expect(liens).toHaveLength(8); // 6 modules + Administratif + Audit
  });

  it('collaborateur → uniquement ses permissions, JAMAIS « Administratif » ni « Audit »', () => {
    const liens = liensVisibles('collaborateur', { ...permsAucune(), curation: true, banc_test: true });
    const slugs = liens.map((l) => l.slug);
    expect(slugs).toEqual(['/admin/curation', '/admin/banc-test']);
    expect(slugs).not.toContain('/admin/comptes');
    expect(slugs).not.toContain('/admin/audit'); // Audit = rôle administrateur, jamais une permission
  });

  it('collaborateur sans aucune permission → menu vide (mais jamais Administratif)', () => {
    const liens = liensVisibles('collaborateur', permsAucune());
    expect(liens).toHaveLength(0);
  });

  it('collaborateur avec TOUTES les perms → 6 modules mais JAMAIS Administratif (rôle, pas permission)', () => {
    const slugs = liensVisibles('collaborateur', permsToutes()).map((l) => l.slug);
    expect(slugs).toHaveLength(6);
    expect(slugs).not.toContain('/admin/comptes');
    expect(slugs).not.toContain('/admin/audit');
  });

  it('chaque lien porte libellé + description (contrat unique menu latéral ET grille du dashboard)', () => {
    for (const l of liensVisibles('administrateur', permsToutes())) {
      expect(l.libelle.length).toBeGreaterThan(0);
      expect(l.desc.length).toBeGreaterThan(0);
    }
  });
});

const lien = (slug: string): LienMenu => ({ slug, libelle: slug, desc: '' });
const slugs = (l: LienMenu[]) => l.map((x) => x.slug);
const A = lien('/a');
const B = lien('/b');
const C = lien('/c');

describe('ordonner — fusion ordre stocké × liens autorisés (3 règles)', () => {
  it('(a) réordonne les slugs connus dans l’ordre stocké', () => {
    expect(slugs(ordonner([A, B, C], ['/c', '/a', '/b']))).toEqual(['/c', '/a', '/b']);
  });

  it('(b) un module absent du stockage est appendé À LA FIN, jamais masqué', () => {
    // `/c` n’est pas dans l’ordre stocké (module ajouté après) → doit rester visible, à la fin.
    expect(slugs(ordonner([A, B, C], ['/b', '/a']))).toEqual(['/b', '/a', '/c']);
  });

  it('(c) un slug stocké absent des liens est IGNORÉ (module supprimé / orphelin)', () => {
    expect(slugs(ordonner([A, B], ['/b', '/zzz', '/a']))).toEqual(['/b', '/a']);
  });

  it('null → liens inchangés (ordre par défaut)', () => {
    expect(slugs(ordonner([A, B, C], null))).toEqual(['/a', '/b', '/c']);
  });

  it('malformé (non-tableau : objet, chaîne, nombre, undefined) → liens inchangés', () => {
    expect(slugs(ordonner([A, B, C], { '/c': 1 }))).toEqual(['/a', '/b', '/c']);
    expect(slugs(ordonner([A, B, C], '/c'))).toEqual(['/a', '/b', '/c']);
    expect(slugs(ordonner([A, B, C], 42))).toEqual(['/a', '/b', '/c']);
    expect(slugs(ordonner([A, B, C], undefined))).toEqual(['/a', '/b', '/c']);
  });

  it('entrées non-string dans le tableau → ignorées, le reste ordonné', () => {
    expect(slugs(ordonner([A, B, C], ['/b', 42, null, '/a', { x: 1 }]))).toEqual(['/b', '/a', '/c']);
  });

  it('doublons dans l’ordre stocké → dédupliqués (un slug rendu une seule fois)', () => {
    expect(slugs(ordonner([A, B, C], ['/a', '/a', '/b', '/a']))).toEqual(['/a', '/b', '/c']);
  });

  it('tableau vide → liens inchangés (tous appendés par la règle b)', () => {
    expect(slugs(ordonner([A, B, C], []))).toEqual(['/a', '/b', '/c']);
  });
});

describe('ordonner — GARDE DE SÉCURITÉ RÔLE (règle c) : un ordre stocké ne ressuscite JAMAIS un module non autorisé', () => {
  it('collaborateur : un ordre injectant « /admin/comptes » (admin-only) + « /admin/pilotage » (non permis) → ignorés', () => {
    const visibles = liensVisibles('collaborateur', { ...permsAucune(), curation: true }); // seulement /admin/curation
    expect(slugs(visibles)).toEqual(['/admin/curation']);
    const r = ordonner(visibles, ['/admin/comptes', '/admin/pilotage', '/admin/curation']);
    // Rendu STRICTEMENT borné par les liens autorisés — réordonné, jamais élargi.
    expect(slugs(r)).toEqual(['/admin/curation']);
  });

  it('administrateur : les 8 tuiles restent présentes, réordonnées selon un stockage PARTIEL', () => {
    const visibles = liensVisibles('administrateur', permsToutes()); // 8 tuiles
    expect(visibles).toHaveLength(8);
    const r = ordonner(visibles, ['/admin/curation', '/admin/audit']); // ordre partiel
    expect(slugs(r).slice(0, 2)).toEqual(['/admin/curation', '/admin/audit']);
    expect(r).toHaveLength(8); // aucune tuile perdue (règle b appende le reste)
    expect(new Set(slugs(r)).size).toBe(8); // aucun doublon
  });
});

describe('validerOrdreModules — filtre du corps AVANT écriture (jsonb accepte tout)', () => {
  it('tableau de slugs connus → renvoyé tel quel (normalisé)', () => {
    expect(validerOrdreModules(['/admin/curation', '/admin/pilotage', '/admin/audit'])).toEqual([
      '/admin/curation',
      '/admin/pilotage',
      '/admin/audit',
    ]);
  });

  it('doublons → DÉDUPLIQUÉS (ordre de 1re apparition préservé)', () => {
    expect(validerOrdreModules(['/admin/curation', '/admin/curation', '/admin/pilotage'])).toEqual([
      '/admin/curation',
      '/admin/pilotage',
    ]);
  });

  it('tableau vide → tableau vide (valide : aucun slug, la lecture appliquera l’ordre par défaut via ordonner)', () => {
    expect(validerOrdreModules([])).toEqual([]);
  });

  it.each([
    ['objet', { '/admin/curation': 1 }],
    ['chaîne', '/admin/curation'],
    ['nombre', 42],
    ['null', null],
    ['undefined', undefined],
    ['booléen', true],
  ])('%s → null (rejet, pas un tableau)', (_libelle, corps) => {
    expect(validerOrdreModules(corps)).toBeNull();
  });

  it('tableau d’objets → null (entrées non-string)', () => {
    expect(validerOrdreModules([{ slug: '/admin/curation' }])).toBeNull();
  });

  it('tableau contenant un slug INCONNU → null (rejet total, on n’écrit pas de déchet)', () => {
    expect(validerOrdreModules(['/admin/curation', '/admin/inexistant'])).toBeNull();
  });

  it('tableau contenant une entrée non-string (nombre) → null', () => {
    expect(validerOrdreModules(['/admin/curation', 42])).toBeNull();
  });

  it('tableau GÉANT (> borne) → null (garde anti-DoS)', () => {
    expect(validerOrdreModules(Array.from({ length: 65 }, () => '/admin/curation'))).toBeNull();
  });
});
