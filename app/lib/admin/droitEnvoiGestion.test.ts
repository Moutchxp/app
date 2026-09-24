import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * LOT 5-DROITS — LE DROIT D'ENVOYER AU NOM DE gestion@criterimmo.fr.
 *
 * Tout ce fichier tourne autour d'UNE idée : « à décider » n'est pas « oui ». Un droit qui fait partir du courrier au
 * nom de l'agence ne doit jamais s'ouvrir par défaut — ni par oubli, ni parce qu'une migration vient de passer, ni
 * parce qu'un formulaire a été rejoué sans la réponse. Et il ne doit pas non plus se refermer en silence : « à décider »
 * se DIT à l'écran, en toutes lettres.
 *
 * On teste le COMPORTEMENT (paramètres liés, colonnes nommées ou non), jamais la forme exacte du SQL.
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  withTransaction: (fn: (q: (...a: unknown[]) => unknown) => unknown) => fn((...a: unknown[]) => queryMock(...a)),
}));
vi.mock('./motDePasse', () => ({ hacher: (clair: string) => Promise.resolve(`HASH:${clair}`) }));

import { capaciteEnvoiGestion, etatEnvoiGestion, modifierPermissions, type CompteDB } from './comptes';
import { oublierSchemaDroits } from './schemaDroits';

const PERMS_VIDE = { pilotage: false, cartes_annee: false, statistiques: false, internautes: false, curation: false, banc_test: false, permis: false, gestion: false };

const compte = (o: Partial<CompteDB> = {}): CompteDB => ({
  id: 42, identifiant: 'lea@x.fr', prenom: 'Léa', nom: 'M', mot_de_passe: 'HASH:x',
  role: 'collaborateur', actif: true,
  perm_pilotage: false, perm_cartes_annee: false, perm_statistiques: false, perm_internautes: false,
  perm_curation: false, perm_banc_test: false, perm_permis: false, perm_permis_modif: false,
  perm_gestion: false, perm_gestion_envoi: null,
  doit_changer_mot_de_passe: false, derniere_connexion_a: null, cree_a: '2026-01-01T00:00:00.000Z',
  ...o,
});

/** Fait répondre la sonde de schéma, puis la requête métier. */
function schemaAvecEnvoi(present: boolean) {
  oublierSchemaDroits();
  queryMock.mockReset();
  queryMock.mockImplementation(async (sql: string) => {
    if (String(sql).includes('information_schema.columns')) return { rows: [{ n: present ? 1 : 0 }] };
    return { rows: [{ id: 42 }] };
  });
}
/** L'appel métier (celui qui touche admin_utilisateur), en ignorant la sonde. */
const appelMetier = () => {
  const c = queryMock.mock.calls.find((x) => String(x[0]).includes('admin_utilisateur') && !String(x[0]).includes('information_schema'));
  return { sql: String(c?.[0] ?? '').replace(/\s+/g, ' '), params: (c?.[1] ?? []) as unknown[] };
};

beforeEach(() => { queryMock.mockReset(); oublierSchemaDroits(); });

describe('l’état affichable — « à décider » est un état à part entière', () => {
  it('accès Gestion + aucune réponse → « à décider »', () => {
    expect(etatEnvoiGestion(compte({ perm_gestion: true, perm_gestion_envoi: null }))).toBe('a_decider');
  });

  it('accès Gestion + oui / non → « oui » / « non »', () => {
    expect(etatEnvoiGestion(compte({ perm_gestion: true, perm_gestion_envoi: true }))).toBe('oui');
    expect(etatEnvoiGestion(compte({ perm_gestion: true, perm_gestion_envoi: false }))).toBe('non');
  });

  it('SANS accès Gestion → « sans objet » : la question ne se pose pas, ce n’est pas un refus', () => {
    expect(etatEnvoiGestion(compte({ perm_gestion: false, perm_gestion_envoi: null }))).toBe('sans_objet');
    expect(etatEnvoiGestion(compte({ perm_gestion: false, perm_gestion_envoi: true }))).toBe('sans_objet');
  });

  it('administrateur → « oui », sans qu’aucune case n’ait à être cochée', () => {
    expect(etatEnvoiGestion(compte({ role: 'administrateur', perm_gestion: false, perm_gestion_envoi: null }))).toBe('oui');
  });
});

describe('🔴 la capacité EFFECTIVE — « à décider » vaut NON', () => {
  it('sans réponse, on n’envoie PAS', () => {
    expect(capaciteEnvoiGestion(compte({ perm_gestion: true, perm_gestion_envoi: null }))).toBe(false);
  });

  it('réponse « non », on n’envoie pas non plus', () => {
    expect(capaciteEnvoiGestion(compte({ perm_gestion: true, perm_gestion_envoi: false }))).toBe(false);
  });

  it('réponse « oui » ET accès à la tuile → on envoie', () => {
    expect(capaciteEnvoiGestion(compte({ perm_gestion: true, perm_gestion_envoi: true }))).toBe(true);
  });

  it('SUBORDINATION : un « oui » sans accès à la tuile ne vaut RIEN', () => {
    expect(capaciteEnvoiGestion(compte({ perm_gestion: false, perm_gestion_envoi: true }))).toBe(false);
  });

  it('administrateur → toujours oui (droits implicites)', () => {
    expect(capaciteEnvoiGestion(compte({ role: 'administrateur', perm_gestion: false, perm_gestion_envoi: null }))).toBe(true);
  });
});

describe('l’écriture du droit', () => {
  it('SCHÉMA À JOUR : la réponse est écrite comme paramètre LIÉ', async () => {
    schemaAvecEnvoi(true);
    await modifierPermissions(42, { ...PERMS_VIDE, gestion: true }, false, 7, true);
    const { sql, params } = appelMetier();
    expect(sql).toContain('perm_gestion_envoi = $13::boolean');
    expect(params[12]).toBe(true);
  });

  it('SCHÉMA ANCIEN (236 non appliquée) : la colonne n’est pas nommée, et le reste s’enregistre quand même', async () => {
    schemaAvecEnvoi(false);
    await modifierPermissions(42, { ...PERMS_VIDE, gestion: true }, false, 7, true);
    const { sql, params } = appelMetier();
    expect(sql).not.toContain('perm_gestion_envoi =');
    expect(sql).toContain('perm_gestion = $10');
    expect(params).toHaveLength(12); // les 12 paramètres d'avant, ni plus ni moins
  });

  it('🔴 RETIRER LA TUILE remet la question à « à décider » (NULL), JAMAIS à « non » (décision d)', async () => {
    schemaAvecEnvoi(true);
    // On retire Gestion alors que la personne avait répondu « oui » : la réponse ne doit pas devenir « non ».
    await modifierPermissions(42, { ...PERMS_VIDE, gestion: false }, false, 7, true);
    expect(appelMetier().params[12]).toBeNull();
  });

  it('…et c’est bien ce que dit le JOURNAL, qui porte l’état complet et son auteur', async () => {
    schemaAvecEnvoi(true);
    await modifierPermissions(42, { ...PERMS_VIDE, gestion: true }, false, 7, false);
    const { sql, params } = appelMetier();
    expect(sql).toContain('INSERT INTO admin_utilisateur_log');
    expect(params[10]).toBe(7); // l'auteur du changement
    expect(JSON.parse(String(params[11]))).toMatchObject({ gestion: true, perm_gestion_envoi: false });
  });

  it('un « oui » sans la tuile n’est jamais stocké tel quel', async () => {
    schemaAvecEnvoi(true);
    await modifierPermissions(42, { ...PERMS_VIDE, gestion: false }, false, 7, true);
    expect(JSON.parse(String(appelMetier().params[11]))).toMatchObject({ perm_gestion_envoi: null });
  });
});

describe('le REPLI de schéma — direction toujours la même : fermer, jamais ouvrir', () => {
  it('la lecture d’un compte rend NULL quand la migration manque → personne ne peut envoyer', async () => {
    schemaAvecEnvoi(false);
    const { trouverCompteParId } = await import('./comptes');
    queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('information_schema.columns')) return { rows: [{ n: 0 }] };
      return { rows: [compte({ perm_gestion: true })] };
    });
    await trouverCompteParId(42);
    const sql = queryMock.mock.calls.map((c) => String(c[0])).find((s) => s.includes('FROM admin_utilisateur')) ?? '';
    expect(sql).toContain('NULL::boolean AS perm_gestion_envoi');
  });

  it('migration appliquée → la vraie colonne est lue', async () => {
    schemaAvecEnvoi(true);
    const { trouverCompteParId } = await import('./comptes');
    queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('information_schema.columns')) return { rows: [{ n: 1 }] };
      return { rows: [compte()] };
    });
    await trouverCompteParId(42);
    const sql = queryMock.mock.calls.map((c) => String(c[0])).find((s) => s.includes('FROM admin_utilisateur')) ?? '';
    expect(sql).toContain(', perm_gestion_envoi');
    expect(sql).not.toContain('NULL::boolean');
  });

  it('base injoignable → la sonde répond « non » plutôt que de jeter (la connexion ne doit jamais casser)', async () => {
    oublierSchemaDroits();
    queryMock.mockReset();
    queryMock.mockRejectedValue(new Error('connexion refusée'));
    const { droitEnvoiGestionDisponible } = await import('./schemaDroits');
    await expect(droitEnvoiGestionDisponible()).resolves.toBe(false);
  });
});

describe('garanties STATIQUES', () => {
  it('la sonde est HORS transaction — un repli dans une transaction abortée ne peut pas s’exécuter', () => {
    const src = readFileSync('app/lib/admin/schemaDroits.ts', 'utf8');
    const code = src.split('\n').filter((l) => !/^\s*(\/\*|\*|\/\/)/.test(l)).join('\n');
    expect(code).not.toContain('withTransaction');
  });

  it('le garde d’envoi ne fait AUCUNE écriture (piège withTransaction : lire, refuser, puis écrire)', () => {
    const src = readFileSync('app/lib/admin/garde.ts', 'utf8');
    const bloc = src.slice(src.indexOf('export async function exigerCapaciteEnvoiGestion'));
    expect(/INSERT|UPDATE|DELETE|withTransaction/i.test(bloc)).toBe(false);
  });

  it('le garde exige `true` STRICT : un NULL (« à décider ») ne peut pas passer pour vrai', () => {
    const src = readFileSync('app/lib/admin/garde.ts', 'utf8');
    const bloc = src.slice(src.indexOf('export async function exigerCapaciteEnvoiGestion'));
    expect(bloc).toContain('compte.envoi === true');
  });
});
