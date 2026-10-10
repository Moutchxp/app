import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apercuPropagation, choixDe, cleImmeuble, coproprietesRetirees, immeublesQuiRepondent, PERSONNALISE,
  syndicsQuiRepondent, validerSyndic, versFormulaire, versSaisie, type FicheSyndic, type ImmeubleConnu,
  type SyndicResume,
} from './syndics';

/**
 * LOT ANNUAIRE-SYNDICS-ET-ENTETE-BIEN, COMMIT 2 — l'annuaire des syndics : règles pures, dépôt (requêtes et
 * paramètres liés, base simulée), routes, migration 324, et garanties sur les écrans.
 */

const appels: Array<{ sql: string; params: unknown[] }> = [];
let reponses: Array<(sql: string) => { rows: unknown[] } | undefined> = [];
const repondre = (sql: string): { rows: unknown[] } => {
  for (const r of reponses) { const x = r(sql); if (x) return x; }
  return { rows: [] };
};
vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => { appels.push({ sql, params }); return repondre(sql); }),
  withTransaction: vi.fn(async (fn: (q: unknown) => Promise<unknown>) =>
    fn(async (sql: string, params: unknown[] = []) => { appels.push({ sql, params }); return repondre(sql); })),
}));

const norm = (s: string): string => s.replace(/\s+/g, ' ');
const auteur = { id: 7, libelle: 'arno' };

describe('les règles pures', () => {
  it('la clé d\'un immeuble est sa forme normalisée (casse, accents, ponctuation)', () => {
    expect(cleImmeuble('12, Rue de l\'Église')).toBe(cleImmeuble('12 rue de l eglise'));
    expect(cleImmeuble(null)).toBe('');
  });

  it('le nom du cabinet est obligatoire', () => {
    expect(validerSyndic({ nom: '  ' })).toEqual({ ok: false, motif: 'Le nom du cabinet est obligatoire.' });
  });

  it('un contact a au moins un nom, un prénom ou un titre ; un contact vide est ignoré', () => {
    expect(validerSyndic({ nom: 'Cab', contacts: [{ coordonnees: [{ sorte: 'telephone', valeur: '01' }] }] }).ok).toBe(false);
    const v = validerSyndic({ nom: 'Cab', contacts: [{}, { titre: 'Service comptabilité' }] });
    expect(v.ok && v.syndic.contacts.length).toBe(1);
  });

  it('des coordonnées illimitées, vides ignorées, e-mail vérifié', () => {
    const v = validerSyndic({ nom: 'Cab', contacts: [{ nom: 'Durand', coordonnees: [
      { sorte: 'email', libelle: 'Ligne directe', valeur: 'a@b.fr' },
      { sorte: 'telephone', libelle: 'Portable', valeur: '06 00' },
      { sorte: 'telephone', libelle: '', valeur: '   ' },
    ] }] });
    expect(v.ok && v.syndic.contacts[0].coordonnees.map((k) => k.sorte)).toEqual(['email', 'telephone']);
    expect(validerSyndic({ nom: 'Cab', contacts: [{ nom: 'D', coordonnees: [{ sorte: 'email', valeur: 'pas-un-mail' }] }] }).ok).toBe(false);
  });

  it('les immeubles sont dédoublonnés par leur clé', () => {
    const v = validerSyndic({ nom: 'Cab', immeubles: ['12 rue X', '12 RUE X', '', '3 av Y'] });
    expect(v.ok && v.syndic.immeubles).toEqual(['12 rue X', '3 av Y']);
  });

  const connus: ImmeubleConnu[] = [
    { cle: cleImmeuble('12 rue X'), libelle: '12 rue X', syndic: null,
      lots: [{ id: 1, numero: '101', adresse: '12 rue X', commune: 'Paris' }, { id: 2, numero: '102', adresse: '12 rue X', commune: 'Paris' }] },
    { cle: cleImmeuble('3 av Y'), libelle: '3 av Y', syndic: { id: 9, nom: 'Autre' },
      lots: [{ id: 3, numero: '201', adresse: '3 av Y', commune: 'Lyon' }] },
  ];

  it('AVANT VALIDATION : la liste des biens qui recevront ce syndic, et les changements de syndic', () => {
    const a = apercuPropagation(['12 rue x', '3 av Y', 'immeuble inconnu'], connus, 5);
    expect(a.lots.map((l) => l.numero)).toEqual(['101', '102', '201']);
    expect(a.changements).toEqual([{ immeuble: '3 av Y', ancien: 'Autre' }]);
    expect(a.sansLot).toEqual(['immeuble inconnu']);
    // Le syndic qui gère déjà l'immeuble n'est pas un « changement ».
    expect(apercuPropagation(['3 av Y'], connus, 9).changements).toEqual([]);
  });

  it('auto-complétion sur les immeubles connus, recherche de syndic par nom / e-mail / domaine', () => {
    expect(immeublesQuiRepondent('rue x', connus).map((i) => i.libelle)).toEqual(['12 rue X']);
    expect(immeublesQuiRepondent('', connus)).toEqual([]);
    const s: SyndicResume[] = [
      { id: 1, nom: 'Citya', email: null, telephone: null, nbCoproprietes: 0, nbBiens: 0, cherchable: 'citya agence citya com' },
      { id: 2, nom: 'Foncia', email: null, telephone: null, nbCoproprietes: 0, nbBiens: 0, cherchable: 'foncia foncia fr' },
    ];
    expect(syndicsQuiRepondent('citya.com', s).map((x) => x.id)).toEqual([1]);
    expect(syndicsQuiRepondent('', s)).toHaveLength(2);
  });

  it('titres et libellés : prédéfinis, ou « Personnalisé » + champ libre ; aller-retour fiche → formulaire → saisie', () => {
    expect(choixDe('Responsable de copropriété', ['Responsable de copropriété'])).toEqual({ choix: 'Responsable de copropriété', libre: '' });
    expect(choixDe('Gardienne', ['Responsable de copropriété'])).toEqual({ choix: PERSONNALISE, libre: 'Gardienne' });
    const fiche: FicheSyndic = {
      id: 3, nom: 'Cab', adresse: null, telephone: '01', email: 'c@cab.fr', note: null,
      creeLe: '2026-10-10', creeParLibelle: 'arno', majLe: null, majParLibelle: null,
      contacts: [{ id: 4, titre: 'Gardienne', prenom: 'Léa', nom: null,
        coordonnees: [{ id: 5, sorte: 'telephone', libelle: 'Portable', valeur: '06' }] }],
      coproprietes: [{ id: 6, cle: 'x', libelle: '12 rue X', debut: '2026-10-10', lots: [] }], historique: [],
    };
    const s = versSaisie(versFormulaire(fiche));
    expect(s.contacts[0]).toMatchObject({ id: 4, titre: 'Gardienne', prenom: 'Léa' });
    expect(s.contacts[0].coordonnees[0]).toMatchObject({ id: 5, libelle: 'Portable', valeur: '06' });
    expect(s.immeubles).toEqual(['12 rue X']);
    expect(coproprietesRetirees(['12 rue X', '3 av Y'], ['12 RUE X'])).toEqual(['3 av Y']);
  });
});

describe('le dépôt — une seule porte d\'écriture, rien n\'est effacé', () => {
  beforeEach(() => { appels.length = 0; reponses = []; });

  it('création : syndic, contact, coordonnée, copropriété déclarée et lien ouvert, avec l\'auteur de la session', async () => {
    const { enregistrerSyndic } = await import('./syndicRepo');
    reponses = [(sql) => (sql.includes('INSERT INTO gestion_syndic ') ? { rows: [{ id: '11' }] } : undefined),
      (sql) => (sql.includes('INSERT INTO gestion_syndic_contact') ? { rows: [{ id: '21' }] } : undefined)];
    const v = validerSyndic({ nom: 'Cabinet TEST', email: 'x@test.fr',
      contacts: [{ titre: 'Responsable de copropriété', nom: 'Durand', coordonnees: [{ sorte: 'email', libelle: 'Ligne directe', valeur: 'd@test.fr' }] }],
      immeubles: ['12 rue X'] });
    if (!v.ok) throw new Error(v.motif);
    expect(await enregistrerSyndic(null, v.syndic, auteur)).toEqual({ ok: true, id: 11 });
    const sqls = appels.map((a) => norm(a.sql));
    expect(appels.find((a) => a.sql.includes('INSERT INTO gestion_syndic '))?.params).toEqual(['Cabinet TEST', null, null, 'x@test.fr', null, 7, 'arno']);
    expect(sqls.some((s) => s.includes('INSERT INTO gestion_syndic_coordonnee'))).toBe(true);
    expect(appels.find((a) => a.sql.includes('INSERT INTO gestion_copropriete '))?.params).toEqual([cleImmeuble('12 rue X'), '12 rue X', 7, 'arno']);
    expect(sqls.some((s) => s.includes('ON CONFLICT (cle_immeuble) DO NOTHING'))).toBe(true);
    expect(appels.find((a) => a.sql.includes('INSERT INTO gestion_copropriete_syndic'))?.params).toEqual([cleImmeuble('12 rue X'), 11, 7, 'arno']);
  });

  it('un immeuble repris d\'un AUTRE syndic : son lien est FERMÉ (« changement de syndic »), jamais effacé', async () => {
    const { enregistrerSyndic } = await import('./syndicRepo');
    reponses = [
      (sql) => (sql.includes('FROM gestion_syndic WHERE id = $1 FOR UPDATE') ? { rows: [{ id: '11' }] } : undefined),
      (sql) => (sql.includes('FOR UPDATE OF cs') ? { rows: [
        { lien_id: '31', copro_id: '41', cle: cleImmeuble('3 av Y'), syndic_id: '99' },
        { lien_id: '32', copro_id: '42', cle: cleImmeuble('ancien immeuble'), syndic_id: '11' },
      ] } : undefined),
    ];
    const v = validerSyndic({ nom: 'Cabinet TEST', immeubles: ['3 av Y'] });
    if (!v.ok) throw new Error(v.motif);
    await enregistrerSyndic(11, v.syndic, auteur);
    const fermetures = appels.filter((a) => a.sql.includes('UPDATE gestion_copropriete_syndic SET fin = now()'));
    expect(fermetures.map((f) => [f.params[0], f.params[3]])).toEqual([['31', 'changement de syndic'], ['32', 'retrait']]);
    expect(appels.some((a) => /\bDELETE\b/i.test(a.sql))).toBe(false);
  });

  it('un syndic inexistant est refusé AVANT toute écriture', async () => {
    const { enregistrerSyndic } = await import('./syndicRepo');
    const v = validerSyndic({ nom: 'X' });
    if (!v.ok) throw new Error(v.motif);
    expect(await enregistrerSyndic(404, v.syndic, auteur)).toEqual({ ok: false, motif: 'Ce syndic n’existe pas.' });
    expect(appels.filter((a) => /^\s*(INSERT|UPDATE)/i.test(a.sql))).toEqual([]);
  });

  it('les lots d\'une copropriété se lisent par leur immeuble normalisé', async () => {
    const { immeublesConnus } = await import('./syndicRepo');
    reponses = [
      (sql) => (sql.includes('FROM gestion_annuaire_lot') ? { rows: [
        { id: '1', numero: '101', immeuble: '12 Rue X', adresse: '12 rue X', commune: 'Paris' },
        { id: '2', numero: '102', immeuble: '12 rue x', adresse: '12 rue X', commune: 'Paris' },
        { id: '3', numero: '103', immeuble: null, adresse: '5 rue Z', commune: 'Paris' },
      ] } : undefined),
      (sql) => (sql.includes('FROM gestion_copropriete c') ? { rows: [
        { cle: cleImmeuble('12 rue X'), libelle: '12 rue X', syndic_id: '11', syndic_nom: 'Cab' },
      ] } : undefined),
    ];
    const l = await immeublesConnus();
    expect(l).toHaveLength(1);
    expect(l[0].lots.map((x) => x.numero)).toEqual(['101', '102']);
    expect(l[0].syndic).toEqual({ id: 11, nom: 'Cab' });
  });

  it('le dépôt ne contient aucun DELETE', () => {
    expect(readFileSync(join(__dirname, 'syndicRepo.ts'), 'utf8')).not.toMatch(/DELETE FROM/i);
  });
});

describe('la migration 324 — ajout uniquement', () => {
  const sql = readFileSync(join(__dirname, '../../../db/migrations/324_gestion_annuaire_syndics.sql'), 'utf8');
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  it('cinq tables, aucune suppression ni renommage', () => {
    for (const t of ['gestion_syndic ', 'gestion_copropriete ', 'gestion_copropriete_syndic ', 'gestion_syndic_contact ', 'gestion_syndic_coordonnee ']) {
      expect(code).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    }
    expect(code).not.toMatch(/\bDROP\b|\bRENAME\b|ALTER TABLE/i);
  });
  it('un seul syndic EN COURS par immeuble ; l\'historique se ferme par « fin »', () => {
    expect(norm(code)).toContain('CREATE UNIQUE INDEX IF NOT EXISTS gestion_copropriete_syndic_en_cours ON gestion_copropriete_syndic (copropriete_id) WHERE fin IS NULL');
  });
});

describe('les écrans', () => {
  const g = join(__dirname, '../../(admin)/admin/(protected)/gestion');
  const lire = (f: string): string => readFileSync(join(g, f), 'utf8');

  it('le bouton : « Coordonnées syndic » sur fond rose transparent, sinon « Créer le syndic » sur fond blanc, pleine largeur', () => {
    const src = lire('BoutonSyndic.tsx');
    expect(src).toContain("'Coordonnées syndic' : 'Créer le syndic'");
    expect(src).toContain('ann-carte-bouton ann-carte-bouton--large bsy');
    expect(src).toContain('color-mix(in srgb, var(--color-svv-rose) 14%, transparent)');
    expect(src).toContain('.ann-carte-bouton.bsy{background:var(--color-svv-surface)}');
  });

  it('dans la carte du bien, À LA PLACE de la ligne SURFACE (entre le cartouche et les faits)', () => {
    const src = lire('Annuaire.tsx');
    const carte = src.slice(src.indexOf('function CarteBien'), src.indexOf('function VueProprietaire'));
    const i = carte.indexOf('<BoutonSyndic immeuble={b.immeuble} />');
    expect(i).toBeGreaterThan(carte.indexOf('<CartoucheEvenement'));
    expect(i).toBeLessThan(carte.indexOf('className="ann-carte-faits"'));
    expect(src).toContain('<BoutonSyndic immeuble={f.immeuble} />');
    expect(src).toContain('{o.lotId !== null && <BoutonSyndic immeuble={o.immeuble} />}');
  });

  it('l\'entrée « Syndics » est SOUS « Événements », et « Annuaire » garde sa place après', () => {
    const src = lire('PleinEcranBoite.tsx');
    const ev = src.indexOf('<span className="cm-texte">Événements</span>');
    const sy = src.indexOf('<span className="cm-texte">Syndics</span>');
    const an = src.indexOf('<span className="cm-texte">Annuaire</span>');
    expect(ev).toBeGreaterThan(-1);
    expect(sy).toBeGreaterThan(ev);
    expect(an).toBeGreaterThan(sy);
  });

  it('la fiche montre la liste des biens AVANT d\'enregistrer, et la modale se rend dans la racine du thème', () => {
    const src = lire('FicheSyndic.tsx');
    expect(src).toContain('Biens qui recevront ce syndic');
    expect(src).toContain('Confirmer et enregistrer');
    expect(src).toContain('Rattacher cet immeuble à ce syndic');
    expect(src).toContain('Créer un nouveau syndic');
    expect(src).toContain('Retirer ? Le lien passe en historique.');
    expect(lire('BoutonSyndic.tsx')).toContain("document.querySelector('.svv-adm-root') ?? document.body");
  });
});
