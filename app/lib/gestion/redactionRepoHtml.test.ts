import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 🔴 LOT EDITEUR-PJ — LE BROUILLON GARDE ENFIN SA MISE EN FORME.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT, TROUVÉ EN VÉRIFIANT L'ENVOI SUR LA BASE RÉELLE le 28/09/2026. La colonne `gestion_brouillon.corps_html`
 * existait depuis la migration 265 — et RIEN NE L'ÉCRIVAIT. On enregistrait la version texte seule. Un brouillon
 * rouvert revenait donc en texte brut : gras, couleurs, listes et retraits perdus, sans le moindre message.
 *
 * C'est le même genre de défaut que ceux du reste de ce lot, décalé d'un cran : la mise en forme était juste à
 * l'écran, juste dans le mail envoyé (qui lit l'écran, pas la base), et perdue ENTRE LES DEUX. Invisible tant qu'on
 * n'avait pas rouvert un brouillon.
 *
 * Ce qui est tenu ici :
 *   ① 🔴 le HTML est ÉCRIT quand la colonne existe ;
 *   ② 🔴🔴 SANS LA MIGRATION 265, LA COLONNE N'EST NOMMÉE NULLE PART — sinon l'enregistrement ENTIER échouerait,
 *      et l'on perdrait le texte pour avoir voulu garder sa mise en forme ;
 *   ③ le HTML est RÉASSAINI côté serveur : l'écran nettoie pour qu'on voie ce qu'on écrit, le serveur nettoie
 *      parce que lui seul ne peut pas être contourné ;
 *   ④ un corps vide n'écrit pas une chaîne vide mais `null` — « pas de mise en forme » se dit en une seule façon.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...a),
  withTransaction: vi.fn(),
}));
const migration265 = vi.fn(async () => true);
// 🔴 LOT CLASSER-DEUX-BOUTONS — `brouillonClassementDisponible` (migration 285) entre dans la MÊME sonde-écran.
//   Ce fichier n'éprouve QUE le HTML : on la met à FAUX, pour que le SQL qu'il inspecte soit celui d'avant ce
//   lot. Sa propre épreuve vit dans `redactionRepoClassement.test.ts`.
vi.mock('./schema', () => ({
  brouillonHtmlDisponible: () => migration265(),
  brouillonClassementDisponible: async () => false,
  // 🔴 LOT CLASSER-AVANT-ENVOI — idem pour la migration 289 : ce fichier n'éprouve QUE le HTML.
  brouillonHorsGestionDisponible: async () => false,
  corbeilleBrouillonDisponible: async () => true,
}));

import { enregistrerBrouillon } from './redactionRepo';

const AUTEUR = { id: 7, libelle: 'a.jorel' };
const BASE = {
  filId: null, repondAMessageId: null, voie: 'nouveau' as const,
  a: ['x@y.fr'], cc: [], cci: [], objet: 'Objet', corps: 'texte', citation: null,
};

const sql = () => String(queryMock.mock.calls[0]?.[0] ?? '').replace(/\s+/g, ' ');
const params = () => (queryMock.mock.calls[0]?.[1] ?? []) as unknown[];

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({
    rows: [{
      id: 1, fil_id: null, repond_a_message_id: null, voie: 'nouveau',
      dest_a: ['x@y.fr'], dest_cc: [], dest_cci: [], objet: 'Objet', corps: 'texte',
      corps_html: '<p>x</p>', citation: null, auteur_libelle: 'a.jorel', maj_le: '2026-09-28T18:00:00Z',
    }],
  });
  migration265.mockResolvedValue(true);
});

describe('🔴 ① le HTML est enregistré', () => {
  it('la colonne est écrite à la CRÉATION', async () => {
    await enregistrerBrouillon({ ...BASE, corpsHtml: '<p><b>gras</b></p>' }, AUTEUR);
    expect(sql()).toContain('corps_html');
    expect(params()).toContain('<p><b>gras</b></p>');
  });

  it('…et à la MISE À JOUR : c’est elle qui joue à chaque accalmie de frappe', async () => {
    await enregistrerBrouillon({ ...BASE, id: 12, corpsHtml: '<p><b>gras</b></p>' }, AUTEUR);
    const s = sql();
    expect(s).toContain('UPDATE gestion_brouillon');
    expect(s).toContain('corps_html = $11');
    expect(params()[10]).toBe('<p><b>gras</b></p>');
  });

  it('la valeur relue revient dans le brouillon rendu — sans quoi l’écran ne la reverrait jamais', async () => {
    const b = await enregistrerBrouillon({ ...BASE, corpsHtml: '<p>x</p>' }, AUTEUR);
    expect(b.corpsHtml).toBe('<p>x</p>');
  });
});

describe('🔴🔴 ② sans la migration 265, la colonne n’est nommée NULLE PART', () => {
  it('🔴 aucune requête ne porte `corps_html` — le texte, lui, est sauvé comme avant', async () => {
    migration265.mockResolvedValue(false);
    await enregistrerBrouillon({ ...BASE, corpsHtml: '<p>x</p>' }, AUTEUR);
    const s = sql();
    expect(s).toContain('INSERT INTO gestion_brouillon');
    expect(s).not.toContain(', corps_html');
    expect(s).toContain('NULL::text AS corps_html'); // rendu, mais jamais LU de la base
    expect(params()).not.toContain('<p>x</p>');
  });

  it('…et la mise à jour non plus', async () => {
    migration265.mockResolvedValue(false);
    await enregistrerBrouillon({ ...BASE, id: 12, corpsHtml: '<p>x</p>' }, AUTEUR);
    expect(sql()).not.toContain('corps_html =');
    expect(params()).toHaveLength(10); // l'identifiant + les 9 valeurs d'avant, rien de plus
  });
});

describe('🔴 ③ le HTML est réassaini par le serveur', () => {
  it('🔴 un script glissé dans le corps ne s’enregistre pas', async () => {
    await enregistrerBrouillon({ ...BASE, corpsHtml: '<p>bonjour<script>alert(1)</script></p>' }, AUTEUR);
    const ecrit = String(params().find((p) => typeof p === 'string' && p.includes('bonjour')));
    expect(ecrit).toContain('bonjour');
    expect(ecrit).not.toContain('script');
    expect(ecrit).not.toContain('alert');
  });

  it('un gestionnaire d’événement tombe aussi', async () => {
    await enregistrerBrouillon({ ...BASE, corpsHtml: '<p onclick="voler()">x</p>' }, AUTEUR);
    const ecrit = String(params().find((p) => typeof p === 'string' && p.includes('<p')));
    expect(ecrit).not.toContain('onclick');
  });

  it('la mise en forme légitime, elle, passe intacte', async () => {
    await enregistrerBrouillon({ ...BASE, corpsHtml: '<p><span style="color: #a30402;">x</span></p>' }, AUTEUR);
    const ecrit = String(params().find((p) => typeof p === 'string' && p.includes('span')));
    expect(ecrit).toContain('color: #a30402');
  });
});

describe('④ « pas de mise en forme » se dit d’une seule façon', () => {
  it('un corps HTML absent ou vide donne `null`, jamais une chaîne vide', async () => {
    await enregistrerBrouillon({ ...BASE, corpsHtml: '   ' }, AUTEUR);
    expect(params().at(-1)).toBeNull();
    queryMock.mockClear();
    await enregistrerBrouillon({ ...BASE }, AUTEUR);
    expect(params().at(-1)).toBeNull();
  });
});
