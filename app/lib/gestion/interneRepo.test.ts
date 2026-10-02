import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ 🔴🔴 LOT RATTACHER-EN-ECRIVANT — « INTERNE » : LE DÉPÔT ET SES GARDES ═══════════════════════════════════════
 *
 * Ce fichier garde trois choses :
 *   ① « INTERNE » NE SE POSE JAMAIS TOUT SEUL. Ni par un programme, ni sans auteur nommé. Deux gardes pour la
 *      même règle — celui-ci et la contrainte de la migration 281 — parce qu'un garde applicatif se contourne au
 *      prochain script et une contrainte non ;
 *   ② SANS LA MIGRATION, LA TABLE N'EST NOMMÉE NULLE PART. Nommer une table absente ne casse pas la fonction
 *      nouvelle : elle casse TOUTE la boîte (leçon de la migration 251) ;
 *   ③ « PROPOSÉ EN PREMIER » SUIT LA RÈGLE D'ARNO, et notamment le piège de l'ensemble vide.
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
let migration281 = true;
vi.mock('./schema', () => ({ interneDisponible: async () => migration281 }));

import {
  DOMAINES_MAISON, annulerInterne, auteurHumainInterne, estAdresseMaison, lireInterne, marquerInterne,
  proposerInterneDabord, sqlColonneInterne, sqlJointureInterne,
} from './interneRepo';
// 🔴 LA LISTE CENTRALE, pour vérifier que `DOMAINES_MAISON` en EST le réexport et non une copie.
import { DOMAINES_INTERNES } from './adresseInterne';

const AUTEUR = { id: 7, libelle: 'a.jorel@sansvisavis.com' };
const sqls = () => queryMock.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' '));

beforeEach(() => { migration281 = true; queryMock.mockReset(); queryMock.mockResolvedValue({ rows: [] }); });

describe('① « Interne » ne se pose jamais tout seul', () => {
  it('🔴 un auteur ANONYME est refusé, et le refus est DIT', async () => {
    const r = await marquerInterne({ filIds: [1], auteur: { id: null, libelle: '' } });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motif).toContain('à la main');
    // …et rien n'a été écrit.
    expect(queryMock).not.toHaveBeenCalled();
  });

  /**
   * 🔴 LE MOT QUE LE MOTEUR DE RATTACHEMENT SIGNE EST REFUSÉ NOMMÉMENT. Sans cela, un script qui emprunterait
   * l'auteur du moteur poserait des marques que personne n'aurait décidées — et personne ne saurait lesquelles.
   */
  it('🔴 « automatique » est refusé nommément, quelle que soit la casse', () => {
    expect(auteurHumainInterne({ libelle: 'automatique' })).toBe(false);
    expect(auteurHumainInterne({ libelle: '  AUTOMATIQUE ' })).toBe(false);
    expect(auteurHumainInterne({ libelle: '' })).toBe(false);
    expect(auteurHumainInterne(null)).toBe(false);
    expect(auteurHumainInterne({ libelle: 'a.jorel@sansvisavis.com' })).toBe(true);
  });

  it('un geste sans échange désigné est refusé', async () => {
    expect((await marquerInterne({ filIds: [], auteur: AUTEUR })).ok).toBe(false);
  });

  /** 🔴 AUCUN `DELETE` : annuler écrit `retire_le`, la ligne RESTE, datée et signée. */
  it('🔴 annuler n’est JAMAIS un DELETE', async () => {
    await annulerInterne({ filIds: [12], auteur: AUTEUR, motif: 'essai' });
    const sql = sqls().join(' ');
    expect(sql).toContain('UPDATE gestion_fil_interne');
    expect(sql).toContain('retire_le = now()');
    expect(sql.toUpperCase()).not.toContain('DELETE');
  });

  /** ⚠️ L'INDEX D'UNICITÉ EST PARTIEL : reposer une marque sur un échange qui l'a déjà ne crée pas de doublon. */
  it('⚠️ reposer une marque déjà vivante ne crée pas de doublon', async () => {
    await marquerInterne({ filIds: [12], auteur: AUTEUR });
    expect(sqls().join(' ')).toContain('ON CONFLICT (fil_id) WHERE retire_le IS NULL DO NOTHING');
  });
});

describe('② sans la migration 281, la table n’est NOMMÉE nulle part', () => {
  beforeEach(() => { migration281 = false; });

  it('🔴 la lecture rend une carte vide SANS émettre une requête', async () => {
    expect((await lireInterne([1, 2, 3])).size).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('🔴 le geste est refusé EN LE DISANT, et ne nomme pas la table', async () => {
    const r = await marquerInterne({ filIds: [1], auteur: AUTEUR });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motif).toContain('281');
    expect(queryMock).not.toHaveBeenCalled();
  });

  /**
   * 🔴 LA JOINTURE DES LISTES EST VIDE, ET LA COLONNE VAUT `NULL`. C'est ce qui rend la requête des listes mot
   * pour mot celle d'avant ce lot — et `NULL` se lit « on ne sait pas », jamais « faux », qui mentirait.
   */
  it('🔴 la jointure est vide et la colonne vaut NULL', () => {
    expect(sqlJointureInterne(false, 'p')).toBe('');
    expect(sqlColonneInterne(false)).toBe('NULL::boolean AS itn_marque');
    expect(sqlJointureInterne(false, 'p')).not.toContain('gestion_fil_interne');
  });

  it('avec la migration, la jointure porte sur l’ÉCHANGE et ne garde que les marques VIVANTES', () => {
    const j = sqlJointureInterne(true, 'p');
    expect(j).toContain('fi.fil_id = p.fil_id');
    expect(j).toContain('fi.retire_le IS NULL');
    // ⚠️ `true AS marque` : un marqueur non nul dit « la ligne est là » sans dépendre de ce qu'elle contient.
    expect(j).toContain('true AS marque');
  });
});

describe('③ « Interne » proposé en premier', () => {
  it('les deux domaines de la maison sont reconnus, quelle que soit la casse', () => {
    /**
     * ══ 🔴🔴 LOT CONTACTS-EXTERNES — CET ATTENDU A CHANGÉ, ET IL NE S'EST PAS AFFAIBLI ═══════════════════════
     *
     * Il recopiait les deux domaines (`['sansvisavis.com', 'criterimmo.fr']`). C'était la copie d'une copie :
     * `DOMAINES_MAISON` était lui-même une recopie de `adresseInterne.DOMAINES_INTERNES`, et c'est exactement
     * ce que le 02/10/2026 a fait payer — `gestion.criterimmo@gmail.com` vivait dans une TROISIÈME copie
     * (`documentsAutoRepo.NOS_ADRESSES`) que la liste centrale ignorait, et 940 mails de notre propre boîte
     * attendaient dans la file « À rattacher ».
     *
     * 🔴 `DOMAINES_MAISON` EST DÉSORMAIS LE RÉEXPORT DE LA LISTE CENTRALE. L'épreuve le VÉRIFIE (`toBe`, la même
     * référence) au lieu de recopier son contenu : un quatrième domaine ajouté un jour n'aura pas à être écrit
     * ici. C'est le même garde que `adresseInterne.test.ts` pose déjà sur `triPieces.DOMAINES_MAISON`.
     *
     * ⚠️ L'ORDRE N'A JAMAIS RIEN DÉCIDÉ : la reconnaissance se fait par appartenance, pas par rang.
     */
    expect(DOMAINES_MAISON).toBe(DOMAINES_INTERNES);
    expect([...DOMAINES_MAISON].sort()).toEqual(['criterimmo.fr', 'sansvisavis.com']);
    expect(estAdresseMaison('a.jorel@sansvisavis.com')).toBe(true);
    expect(estAdresseMaison('  Gestion@CRITERIMMO.FR ')).toBe(true);
    expect(estAdresseMaison('locataire@orange.fr')).toBe(false);
    expect(estAdresseMaison('sansvisavis.com')).toBe(false);   // pas d'arobase : pas une adresse
    // 🔴 DÉCISION D'ARNO (02/10/2026) : notre boîte Gmail de gestion est des nôtres, elle aussi.
    expect(estAdresseMaison('gestion.criterimmo@gmail.com')).toBe(true);
    expect(estAdresseMaison('  GESTION.CRITERIMMO@Gmail.COM ')).toBe(true);
    // ⚠️ ET `gmail.com` RESTE EXTÉRIEUR : c'est l'adresse ENTIÈRE qui est à nous, jamais le domaine.
    expect(estAdresseMaison('locataire@gmail.com')).toBe(false);
  });

  it('TOUS les destinataires de la maison ⇒ proposé en premier', () => {
    expect(proposerInterneDabord(['a.jorel@sansvisavis.com', 'gestion@criterimmo.fr'])).toBe(true);
  });

  it('🔴 UN SEUL destinataire hors maison suffit à ne plus le proposer en premier', () => {
    expect(proposerInterneDabord(['a.jorel@sansvisavis.com', 'locataire@orange.fr'])).toBe(false);
  });

  /**
   * ══ 🔴🔴 LE PIÈGE DE L'ENSEMBLE VIDE ═════════════════════════════════════════════════════════════════════════
   * `[].every(...)` rend `true`. Sans la garde explicite, « Interne » serait proposé en premier sur un message
   * neuf dont personne n'a encore saisi le destinataire. Ce piège est consigné dans ce dépôt (lot 71) ; il est
   * éprouvé ici parce qu'il ne se voit pas à la relecture.
   */
  it('🔴 AUCUN destinataire ⇒ PAS proposé en premier (piège de l’ensemble vide)', () => {
    expect(proposerInterneDabord([])).toBe(false);
    expect(proposerInterneDabord(['', '   '])).toBe(false);
  });
});

describe('④ la lecture d’une page', () => {
  it('UNE seule requête pour toute la page, jamais une par ligne', async () => {
    queryMock.mockResolvedValue({ rows: [{ fil_id: '7', pose_le: '2026-09-30', pose_par_libelle: 'Arnaud' }] });
    const m = await lireInterne([7, 8, 9]);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(m.get(7)?.posePar).toBe('Arnaud');
    // ⚠️ `pg` rend les `bigint` en CHAÎNE : la clé doit être un NOMBRE, sinon les comparaisons mentiraient.
    expect([...m.keys()]).toEqual([7]);
  });

  it('les identifiants sont nettoyés et BORNÉS', async () => {
    await lireInterne([1, 1, -5, 0, Number.NaN, 2]);
    expect(queryMock.mock.calls[0][1]).toEqual([[1, 2]]);
  });
});
