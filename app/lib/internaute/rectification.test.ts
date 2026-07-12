import { describe, it, expect } from 'vitest';
import { validerRectification } from './rectification';

describe('validerRectification — patch partiel de l’identité (bloc A)', () => {
  it('un seul champ valide → ok, uniquement ce champ (trimé)', () => {
    const r = validerRectification({ prenom: '  Ada  ' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.champs).toEqual({ prenom: 'Ada' });
  });

  it('plusieurs champs → tous repris', () => {
    const r = validerRectification({ nom: 'Lovelace', email: 'ada@example.com' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.champs).toEqual({ nom: 'Lovelace', email: 'ada@example.com' });
  });

  it('telephone null → efface le numéro (autorisé)', () => {
    const r = validerRectification({ telephone: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.champs).toEqual({ telephone: null });
  });

  it('aucun champ → erreur (rien à rectifier)', () => {
    const r = validerRectification({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs).toContain('aucun champ à rectifier');
  });

  it('email invalide → erreur', () => {
    const r = validerRectification({ email: 'pas-un-email' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs).toContain('email invalide');
  });

  it('prenom présent mais vide → erreur (pas d’effacement implicite d’un champ requis)', () => {
    const r = validerRectification({ prenom: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs).toContain('prenom invalide');
  });

  it('telephone chaîne vide → erreur (pour effacer, envoyer null explicitement)', () => {
    const r = validerRectification({ telephone: '' });
    expect(r.ok).toBe(false);
  });

  it('corps non-objet → erreur', () => {
    expect(validerRectification(null).ok).toBe(false);
    expect(validerRectification('x').ok).toBe(false);
    expect(validerRectification([]).ok).toBe(false);
  });

  it('ignore les clés non rectifiables (ex. id, efface_a) → seules les clés A valides sont reprises', () => {
    const r = validerRectification({ id: 'forge', efface_a: 'now', prenom: 'Grace' } as Record<string, unknown>);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.champs).toEqual({ prenom: 'Grace' });
  });
});
