import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));

import { adressesDe, estPartenaire, libelleExpediteur, lirePartenairesInternes } from './partenaires';
import { ATTEND, cteDernierHorsPartenaire, cteExterieur, ctesAttente } from './attente';

/**
 * LOT 4d — LA TROISIÈME CATÉGORIE D'EXPÉDITEUR.
 *
 * Le module ne connaissait que « nous » et « tout le reste ». Résultat mesuré en base le 23/09/2026 : 168 messages de
 * la comptabilité externalisée (ADHOC Gestion) comptaient comme des demandes de client, et 22 échanges de la file
 * annonçaient « attend une réponse » sur cette seule foi. Ce fichier tient la règle qui corrige ça.
 */
const COMPTA = { adresse: 'gestion.criterimmo@gmail.com', libelle: 'Comptabilité (ADHOC Gestion)' };

beforeEach(() => { queryMock.mockReset(); queryMock.mockResolvedValue({ rows: [] }); });

describe('lire la liste — et SURVIVRE à une migration pas encore appliquée', () => {
  it('rend les partenaires ACTIFS, adresses normalisées', async () => {
    queryMock.mockResolvedValue({ rows: [COMPTA] });
    expect(await lirePartenairesInternes()).toEqual([COMPTA]);
    expect((queryMock.mock.calls[0][0] as string).replace(/\s+/g, ' ')).toContain('WHERE actif');
  });

  /**
   * Les migrations sont LIVRÉES NON APPLIQUÉES : entre la livraison et l'application par Arno, la table n'existe pas.
   * L'écran doit alors fonctionner exactement comme avant, sans une seule erreur. Le repli n'est valable que parce
   * qu'on passe par `query()` (auto-commit) : dans une transaction, PostgreSQL l'abandonne à la première erreur et
   * le repli ne pourrait JAMAIS s'exécuter — piège déjà payé au lot 4a.
   */
  it('table absente (42P01) → liste VIDE, et le module retombe sur son comportement d’avant', async () => {
    queryMock.mockRejectedValue(Object.assign(new Error('relation … does not exist'), { code: '42P01' }));
    expect(await lirePartenairesInternes()).toEqual([]);
  });

  it('toute AUTRE panne remonte : on ne déguise pas une base morte en « aucun partenaire »', async () => {
    queryMock.mockRejectedValue(Object.assign(new Error('connexion refusée'), { code: '08006' }));
    await expect(lirePartenairesInternes()).rejects.toThrow('connexion refusée');
  });
});

describe('reconnaître un partenaire, et le NOMMER à l’écran', () => {
  it('reconnaît l’adresse quelle que soit la casse ou les espaces', () => {
    expect(estPartenaire([COMPTA], 'gestion.criterimmo@gmail.com')).toBe(true);
    expect(estPartenaire([COMPTA], '  GESTION.Criterimmo@Gmail.com ')).toBe(true);
    expect(estPartenaire([COMPTA], 'locataire@exemple.test')).toBe(false);
    expect(estPartenaire([COMPTA], null)).toBe(false);
    expect(estPartenaire([], 'gestion.criterimmo@gmail.com')).toBe(false);
  });

  it('son LIBELLÉ remplace le nom du mail — « Service Gestion » se confondait avec notre propre boîte', () => {
    expect(libelleExpediteur([COMPTA], 'gestion.criterimmo@gmail.com', 'Service Gestion'))
      .toBe('Comptabilité (ADHOC Gestion)');
  });

  it('pour tous les autres, RIEN ne change : le nom du mail, à défaut l’adresse', () => {
    expect(libelleExpediteur([COMPTA], 'locataire@exemple.test', 'Mme M.')).toBe('Mme M.');
    expect(libelleExpediteur([COMPTA], 'locataire@exemple.test', '   ')).toBe('locataire@exemple.test');
    expect(libelleExpediteur([], 'jb.pons@sansvisavis.com', 'Jean-Baptiste PONS')).toBe('Jean-Baptiste PONS');
  });

  it('les adresses seules, pour le paramètre lié', () => {
    expect(adressesDe([COMPTA])).toEqual(['gestion.criterimmo@gmail.com']);
    expect(adressesDe([])).toEqual([]);
  });
});

describe('les fragments SQL de l’attente', () => {
  it('une liste VIDE laisse passer tout le monde — c’est ce qui rend la 233 livrable non appliquée', () => {
    // `<> ALL('{}')` vaut VRAI pour n'importe quelle adresse : « hors partenaire » redevient « tous les messages ».
    expect(cteDernierHorsPartenaire('$1')).toContain("lower(btrim(m.de_adresse)) <> ALL ($1::text[])");
  });

  it('« extérieur » exclut à la fois NOUS et les partenaires — sinon la règle n’aurait aucun sens', () => {
    const sql = cteExterieur('$1', '$2').replace(/\s+/g, ' ');
    expect(sql).toContain('<> ALL ($1::text[])');
    expect(sql).toContain('<> lower(btrim($2))');
  });

  it('l’attente choisit sa source selon la présence d’un correspondant extérieur', () => {
    const sql = ATTEND.replace(/\s+/g, ' ');
    expect(sql).toContain('CASE WHEN ex.fil_id IS NOT NULL');
    expect(sql).toContain("THEN (h.sens = 'recu' AND NOT h.automatique)"); // cas ① : le partenaire est transparent
    expect(sql).toContain("ELSE (d.sens = 'recu' AND NOT d.automatique)"); // cas ② : il est un demandeur ordinaire
  });

  it('les trois CTE portent les noms que le contrat annonce', () => {
    const sql = ctesAttente('$1', '$2');
    for (const nom of ['dernier AS', 'dernier_hors AS', 'exterieur AS']) expect(sql).toContain(nom);
  });

  it('aucune adresse n’est COLLÉE dans le SQL : tout passe par des paramètres liés', () => {
    const sql = ctesAttente('$1', '$2');
    expect(sql).not.toContain('@');
  });
});

describe('la migration 233 dit ce qu’elle fait, et ce qu’elle NE fait pas', () => {
  const src = readFileSync('db/migrations/233_gestion_partenaire_interne.sql', 'utf8');
  /** Le CORPS DDL seul : les commentaires de ce fichier DISENT ce qu'il ne fait pas, une assertion globale mentirait. */
  const corps = src.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

  it('est ADDITIVE : une table nouvelle, aucune destruction', () => {
    expect(corps).toContain('CREATE TABLE IF NOT EXISTS gestion_partenaire_interne');
    for (const verbe of ['DROP TABLE', 'DROP COLUMN', 'DELETE FROM', 'TRUNCATE', 'ALTER COLUMN']) {
      expect(corps).not.toContain(verbe);
    }
  });

  it('ne réécrit AUCUN message : le `sens` stocké reste ce qu’il est, seul ce qu’on en déduit change', () => {
    expect(corps).not.toContain('UPDATE gestion_message');
    expect(corps).not.toContain('UPDATE gestion_fil');
  });

  it('sème la comptabilité externalisée, sans écraser un libellé corrigé à la main', () => {
    expect(corps).toContain("'gestion.criterimmo@gmail.com'");
    expect(corps).toContain("'Comptabilité (ADHOC Gestion)'");
    expect(corps).toContain('ON CONFLICT (adresse) DO NOTHING');
  });

  it('n’y met AUCUNE adresse de collègue — un collègue qui transfère pose une vraie demande', () => {
    // On lit les ADRESSES RÉELLEMENT SEMÉES (la 1re valeur de chaque VALUES), pas le texte alentour : la note de la
    //   graine CITE « gestion@criterimmo.fr » pour expliquer la mesure, et ce n'est pas une adresse insérée.
    const semees = [...corps.matchAll(/VALUES\s*\('([^']+)'/g)].map((m) => m[1]);
    expect(semees).toEqual(['gestion.criterimmo@gmail.com']);
    for (const a of semees) {
      expect(a.endsWith('@sansvisavis.com')).toBe(false);
      expect(a.endsWith('@criterimmo.fr')).toBe(false);
    }
  });

  it('impose des adresses normalisées : une casse divergente ferait échouer la reconnaissance EN SILENCE', () => {
    expect(corps).toContain('adresse = lower(btrim(adresse))');
  });

  it('laisse une trace au journal du module, avec l’avant et l’après', () => {
    expect(corps).toContain('INSERT INTO gestion_journal');
    expect(corps).toContain("'correspondant extérieur'");
    expect(corps).toContain("'partenaire interne'");
  });
});
