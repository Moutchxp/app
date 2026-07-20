import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CapsuleCompte } from './CapsuleCompte';

/**
 * CapsuleCompte (peaufinage) — rendu STATIQUE en Node (aucun DOM) pour prouver le MAPPING du statut :
 *  (a) titulaire d'un compte (a_un_compte=true) → libellé « Compte », couleurs VERTES SVAV ;
 *  (b) sans compte (false) → libellé « One-shot », couleur GRISE (muted), aucune couleur verte.
 */
const html = (aUnCompte: boolean) => renderToStaticMarkup(createElement(CapsuleCompte, { aUnCompte }));

describe('CapsuleCompte — capsule Compte / One-shot', () => {
  it('(a) a_un_compte=true → « Compte » en VERT', () => {
    const h = html(true);
    expect(h).toContain('Compte');
    expect(h).not.toContain('One-shot');
    expect(h).toContain('var(--color-svv-green-ink)'); // texte vert SVAV
    expect(h).toContain('var(--color-svv-green-soft)'); // fond vert doux
  });

  it('(b) a_un_compte=false → « One-shot » en GRIS', () => {
    const h = html(false);
    expect(h).toContain('One-shot');
    expect(h).toContain('var(--color-svv-muted)'); // texte gris SVAV
    expect(h).not.toContain('green'); // aucune teinte verte sur le one-shot
  });
});
