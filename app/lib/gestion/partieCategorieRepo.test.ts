import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/** Le code sans ses commentaires — un encadré doit pouvoir nommer ce qu'il interdit. */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-1 — LE DÉPÔT DES CATÉGORIES ET DES CARTES, ET SES GARDES ════════════════════════════
 *
 * Ce fichier garde quatre choses :
 *   ① SANS LA MIGRATION 304, AUCUNE TABLE NEUVE N'EST NOMMÉE. Nommer une table absente ne casse pas la fonction
 *      nouvelle : elle casse TOUT l'écran (leçon de la migration 251, repayée au lot 4a) ;
 *   ② RIEN N'EST JAMAIS SUPPRIMÉ : aucun `DELETE`, aucun `TRUNCATE`, nulle part — ni ici, ni dans la reprise ;
 *   ③ TOUT GESTE EXIGE UN AUTEUR HUMAIN NOMMÉ, « automatique » refusé nommément ;
 *   ④ 🔒 LA PORTÉE EST DÉDUITE, PAS DEMANDÉE : un indépendant part toujours SANS bien — le garde de
 *      l'automatisation, tenu dans la donnée écrite et pas seulement dans un commentaire.
 */

const queryMock = vi.fn();
const txMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...a),
  // ⚠️ `withTransaction` est joué tel quel : on veut VOIR les deux instructions qu'il enveloppe.
  withTransaction: (fn: (q: unknown) => Promise<unknown>) => fn((...a: unknown[]) => txMock(...a)),
}));
let migration304 = true;
let migration306 = true;
vi.mock('./schema', () => ({
  partieCategorieDisponible: async () => migration304,
  contactCarteDisponible: async () => migration304,
  /* 🔴🔴 LOT HISTORIQUE-BIEN-7 — la colonne `note` de la 305. La doublure suit le même interrupteur : les cas
     « sans la migration » éprouvent donc aussi une carte SANS note, ce qui est le cas réel d'avant la 305. */
  noteContactCarteDisponible: async () => migration304,
  /* 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — les sept colonnes de la 306 ont leur PROPRE interrupteur, et il le
     fallait : la 304 et la 306 sont deux migrations indépendantes, et l'état réel d'une base qui porte la 304
     SANS la 306 est exactement celui de la veille de ce lot. Un seul interrupteur n'aurait jamais éprouvé ce
     cas-là — celui où l'écran demande une fiche que la base ne sait pas encore garder. */
  ficheContactCarteDisponible: async () => migration304 && migration306,
}));

import {
  auteurHumainPartieCategorie, lireCartesDuBien, lireCategoriesDuBien, marquerCarteVerifiee,
  marquerCategorieVerifiee, modifierCarte, poserCarteAlaMain, poserCategorieAlaMain, retirerCarte,
} from './partieCategorieRepo';

const AUTEUR = { id: 7, libelle: 'a.jorel@sansvisavis.com' };
const sqls = (): string[] => [...queryMock.mock.calls, ...txMock.mock.calls]
  .map((c) => String(c[0]).replace(/\s+/g, ' '));
const params = (): unknown[][] => [...queryMock.mock.calls, ...txMock.mock.calls]
  .map((c) => (Array.isArray(c[1]) ? (c[1] as unknown[]) : []));

beforeEach(() => {
  migration304 = true;
  migration306 = true;
  queryMock.mockReset(); txMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ id: '1' }] });
  txMock.mockResolvedValue({ rows: [{ id: '1' }] });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 SANS LA MIGRATION 304, AUCUNE TABLE NEUVE N'EST NOMMÉE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① sans la migration 304, le module est celui d’avant', () => {
  beforeEach(() => { migration304 = false; });

  /** 🔴 LES LECTURES RENDENT VIDE, SANS ÉMETTRE UNE SEULE REQUÊTE. */
  it('🔴 les lectures rendent vide et n’interrogent rien', async () => {
    expect(await lireCategoriesDuBien('155')).toEqual([]);
    expect(await lireCartesDuBien('155')).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
    expect(txMock).not.toHaveBeenCalled();
  });

  /** 🔴 LES ÉCRITURES REFUSENT, EN DISANT POURQUOI — jamais en silence, jamais en échouant au milieu. */
  it('🔴 les écritures refusent et nomment la migration', async () => {
    const gestes = [
      poserCategorieAlaMain({ adresse: 'x@fictif.fr', lotCle: '155', categorie: 'proprietaire', auteur: AUTEUR }),
      marquerCategorieVerifiee({ id: 3, auteur: AUTEUR }),
      poserCarteAlaMain({ lotCle: '155', cote: 'proprietaire', adresse: 'x@fictif.fr', auteur: AUTEUR }),
      retirerCarte({ id: 3, auteur: AUTEUR }),
      marquerCarteVerifiee({ id: 3, auteur: AUTEUR }),
    ];
    for (const g of gestes) {
      const r = await g;
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.motif).toContain('304');
    }
    expect(queryMock).not.toHaveBeenCalled();
    expect(txMock).not.toHaveBeenCalled();
  });

  /**
   * 🔴 LE NOMBRE SUIT LES FONCTIONS, ET IL EST COMPTÉ AU LIEU D'ÊTRE ÉCRIT — comme pour la 297. Figer un nombre
   * ferait rougir ce garde pour une bonne raison (une fonction de plus, qui sonde comme les autres) au lieu de la
   * seule qui l'intéresse : une fonction qui NE sonderait PAS.
   */
  it('🔴 chaque lecture et chaque écriture sonde la migration', () => {
    const depot = readFileSync('app/lib/gestion/partieCategorieRepo.ts', 'utf8');
    const fonctions = (depot.match(/^export async function /gm) ?? []).length;
    const sondes = (depot.match(/await (partieCategorieDisponible|contactCarteDisponible)\(\)/g) ?? []).length;
    expect(fonctions).toBeGreaterThan(0);
    expect(sondes).toBe(fonctions);
    expect(depot).toContain('migration 304');
  });

  /**
   * 🔴🔴 ET LA PREUVE PAR LA SOURCE : les deux tables neuves ne sont nommées QUE dans le dépôt et dans la reprise.
   * Aucun autre fichier de production ne les connaît — surtout pas la passe de rattachement (garde du lot), ni un
   * écran, ni un compteur de fiche.
   */
  it('🔴🔴 les deux tables neuves ne sont nommées que là où elles doivent l’être', () => {
    /**
     * LES TROIS SEULS ENDROITS LÉGITIMES, et il n'y en a pas un quatrième :
     *   · le DÉPÔT, qui est le seul à lire et à écrire ;
     *   · la REPRISE, qui est le seul à les remplir en masse ;
     *   · la SONDE (`schema.ts`), dont le métier est précisément de demander à la base si elles existent.
     * ⚠️ Pas de liste d'exemptions au-delà : une liste blanche qu'on allonge rend un garde inoffensif.
     */
    const AUTORISES = new Set([
      'app/lib/gestion/partieCategorieRepo.ts',
      'app/scripts/reprendre-categories-parties.ts',
      'app/lib/gestion/schema.ts',
    ]);
    const fichiers = ['app/lib', 'app/(admin)', 'app/scripts', 'app/api'].flatMap((racine) => {
      try {
        return (readdirSync(racine, { recursive: true }) as unknown as string[])
          .map((p) => `${racine}/${String(p).split(/[\\/]/).join('/')}`)
          .filter((p) => /\.tsx?$/.test(p) && !/\.(test|itest)\.tsx?$/.test(p));
      } catch { return []; }
    });
    const fautifs: string[] = [];
    for (const f of fichiers) {
      if (AUTORISES.has(f)) continue;
      let source: string;
      try { source = readFileSync(f, 'utf8'); } catch { continue; }
      /* 🔴 LES COMMENTAIRES SONT RETIRÉS D'ABORD : un encadré qui EXPLIQUE la règle doit pouvoir nommer la table
         en clair. Leçon écrite dans `uneSeuleRegleDuLienDeBien.guard.test.ts`, repayée ici. */
      if (/gestion_partie_categorie|gestion_contact_carte/.test(sansCommentaires(source))) fautifs.push(f);
    }
    expect(fautifs, 'Un fichier nomme une table de la 304 hors du dépôt, de la reprise et de la sonde').toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴 RIEN N'EST JAMAIS SUPPRIMÉ
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ② rien n’est jamais supprimé', () => {
  it('🔴 aucun DELETE ni TRUNCATE, ni dans le dépôt ni dans la reprise', () => {
    for (const f of ['app/lib/gestion/partieCategorieRepo.ts', 'app/scripts/reprendre-categories-parties.ts']) {
      const source = readFileSync(f, 'utf8');
      for (const mot of ['DELETE FROM', 'TRUNCATE', 'DROP TABLE']) {
        expect(source, `${f} contient ${mot}`).not.toContain(mot);
      }
    }
  });

  /** 🔴 RETIRER UNE CARTE ÉCRIT UNE DATE, UN AUTEUR ET UN MOTIF — la ligne reste. */
  it('🔴 retirer une carte est un UPDATE daté et signé', async () => {
    await retirerCarte({ id: 12, auteur: AUTEUR, motif: 'c’est un diagnostiqueur' });
    const sql = sqls().join(' ');
    expect(sql).toContain('UPDATE gestion_contact_carte');
    expect(sql).toContain('retire_le = now()');
    expect(sql).toContain('retire_par_libelle');
    expect(sql).toContain('retire_motif');
    expect(sql).not.toContain('DELETE');
    /* ⚠️ LES VALEURS SONT LIÉES, jamais interpolées : on asserte les PARAMÈTRES, pas la forme du SQL. */
    expect(params().flat()).toContain('c’est un diagnostiqueur');
  });

  /**
   * 🔴 POSER À LA MAIN RETIRE L'ANCIENNE AVANT D'ÉCRIRE LA NOUVELLE, et dans CET ordre : l'index d'unicité ne
   * tolère qu'une ligne vivante par (adresse, lot). L'inverse échouerait, et une suppression ferait perdre la trace.
   */
  it('🔴 poser une catégorie retire l’ancienne (UPDATE) puis insère, dans cet ordre', async () => {
    await poserCategorieAlaMain({
      adresse: 'm.carlus@cabinetjourdan.com', lotCle: '101', categorie: 'locataire', auteur: AUTEUR,
    });
    const liste = sqls();
    expect(liste.length).toBe(2);
    expect(liste[0]).toContain('UPDATE gestion_partie_categorie');
    expect(liste[0]).toContain('retire_le = now()');
    expect(liste[1]).toContain('INSERT INTO gestion_partie_categorie');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔒 TOUT GESTE EXIGE UN AUTEUR HUMAIN NOMMÉ
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒 ③ jamais anonyme, jamais « automatique »', () => {
  /**
   * 🔴 LE MOT QUE LA PASSE DE REPRISE SIGNE EST REFUSÉ NOMMÉMENT. Sans cela, un script qui emprunterait l'auteur
   * de la passe poserait des rangements MANUELS que personne n'aurait décidés — et le manuel étant ce qui prime
   * sur tout, personne ne pourrait plus les corriger par une reprise.
   */
  it('🔒 « automatique » est refusé, quelle que soit la casse', () => {
    expect(auteurHumainPartieCategorie({ libelle: 'automatique' })).toBe(false);
    expect(auteurHumainPartieCategorie({ libelle: '  AUTOMATIQUE ' })).toBe(false);
    expect(auteurHumainPartieCategorie({ libelle: '' })).toBe(false);
    expect(auteurHumainPartieCategorie(null)).toBe(false);
    expect(auteurHumainPartieCategorie(undefined)).toBe(false);
    expect(auteurHumainPartieCategorie({ libelle: 'a.jorel@sansvisavis.com' })).toBe(true);
  });

  it.each([
    ['poser une catégorie', () => poserCategorieAlaMain({
      adresse: 'x@fictif.fr', lotCle: '155', categorie: 'proprietaire', auteur: { id: null, libelle: '' },
    })],
    ['vérifier une catégorie', () => marquerCategorieVerifiee({ id: 3, auteur: { id: null, libelle: '' } })],
    ['poser une carte', () => poserCarteAlaMain({
      lotCle: '155', cote: 'proprietaire', adresse: 'x@fictif.fr', auteur: { id: null, libelle: 'automatique' },
    })],
    ['retirer une carte', () => retirerCarte({ id: 3, auteur: { id: null, libelle: '  ' } })],
    ['vérifier une carte', () => marquerCarteVerifiee({ id: 3, auteur: { id: null, libelle: 'AUTOMATIQUE' } })],
  ])('🔒 %s sans auteur humain est refusé, et rien n’est écrit', async (_nom, geste) => {
    const r = await geste();
    expect(r.ok).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
    expect(txMock).not.toHaveBeenCalled();
  });

  /**
   * 🔴 « VÉRIFIÉ » NE PEUT PAS ÊTRE AUTOMATIQUE, ET C'EST UNE PROMESSE D'ÉCRAN : la mention « à vérifier » dit
   * qu'un humain doit regarder. Une vérification posée par une passe la ferait disparaître sans que personne n'ait
   * rien vu. La base le refuse aussi (`_verifie_chk`) — deux gardes pour la même règle.
   */
  it('🔴 la contrainte de base refuse aussi une vérification automatique', () => {
    const migration = readFileSync('db/migrations/304_gestion_partie_categorie.sql', 'utf8');
    expect(migration).toContain('gestion_partie_categorie_verifie_chk');
    expect(migration).toContain('gestion_contact_carte_verifie_chk');
    expect(migration.replace(/\s+/g, ' ')).toContain(
      "lower(btrim(verifie_par_libelle)) <> 'automatique'");
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ 🔒🔒 LA PORTÉE EST DÉDUITE — UN INDÉPENDANT N'EST JAMAIS RATTACHÉ À UN BIEN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒🔒 ④ un indépendant part toujours SANS bien', () => {
  /**
   * 🔒🔒 LE GARDE DU LOT, VÉRIFIÉ SUR LA VALEUR ÉCRITE. Même si l'appelant passe un `lotCle` — par distraction, ou
   * parce qu'il range depuis la fiche d'un bien —, la ligne part avec `lot_cle = NULL`. C'est ce qui rend une
   * déduction de bien IMPOSSIBLE depuis cette adresse : il n'y a aucun bien à lire.
   */
  it('🔒🔒 ranger « independant » depuis la fiche d’un bien écrit quand même lot_cle = NULL', async () => {
    const r = await poserCategorieAlaMain({
      adresse: 'gdsproprete@gmail.com', lotCle: '101', categorie: 'independant', auteur: AUTEUR,
    });
    expect(r.ok).toBe(true);
    /* Le 2ᵉ paramètre de l'INSERT est le lot : il doit être `null`, et « 101 » ne doit apparaître nulle part. */
    const insert = [...queryMock.mock.calls, ...txMock.mock.calls]
      .find((c) => String(c[0]).includes('INSERT INTO gestion_partie_categorie'));
    expect(insert).toBeDefined();
    const lies = (insert?.[1] ?? []) as unknown[];
    expect(lies[0]).toBe('gdsproprete@gmail.com');
    expect(lies[1]).toBeNull();
    expect(lies).not.toContain('101');
  });

  /** 🔴 ET L'INVERSE EST REFUSÉ : un contact du propriétaire ou du locataire SANS bien ne voudrait rien dire. */
  it('🔴 un contact du propriétaire sans bien est refusé, et le refus est dit', async () => {
    const r = await poserCategorieAlaMain({
      adresse: 'x@fictif.fr', lotCle: null, categorie: 'proprietaire', auteur: AUTEUR,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motif).toContain('toujours sur un bien');
    expect(txMock).not.toHaveBeenCalled();
  });

  /** 🔒 LA BASE PORTE LE MÊME GARDE, dans les deux sens — un garde applicatif se contourne au prochain script. */
  it('🔒 la contrainte de base dit l’équivalence dans les deux sens', () => {
    const migration = readFileSync('db/migrations/304_gestion_partie_categorie.sql', 'utf8')
      .replace(/\s+/g, ' ');
    expect(migration).toContain("CHECK ((categorie = 'independant') = (lot_cle IS NULL))");
  });

  /** 🔒 ET AUCUNE CARTE N'EST POSSIBLE POUR UN INDÉPENDANT : la table n'a pas ce côté. */
  it('🔒 une carte « independant » est refusée avant toute requête', async () => {
    const r = await poserCarteAlaMain({
      lotCle: '155', cote: 'independant' as unknown as 'proprietaire', adresse: 'x@fictif.fr', auteur: AUTEUR,
    });
    expect(r.ok).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ CE QUE LES REQUÊTES PROMETTENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑤ les requêtes, par fragments sémantiques', () => {
  /**
   * 🔴 LA LECTURE D'UN BIEN RAMÈNE AUSSI LES LIGNES GLOBALES DES MÊMES ADRESSES. Sans elles, un prestataire rangé
   * `independant` une fois pour toutes réapparaîtrait « contact du propriétaire » sur chaque bien où une ligne par
   * défaut traîne — c'est précisément le cas `jcordel@mavimmo.fr` / lot 504.
   */
  it('🔴 lire un bien ramène les lignes du bien ET les globales de ses adresses', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await lireCategoriesDuBien('504');
    const sql = sqls()[0];
    expect(sql).toContain('c.lot_cle = $1');
    expect(sql).toContain('c.lot_cle IS NULL');
    expect(sql).toContain('retire_le IS NULL');
    expect(params()[0]).toEqual(['504']);
  });

  /**
   * 🔴 LA RÉSOLUTION EST FAITE PAR LE MODULE PUR, APRÈS LA LECTURE — jamais en SQL. Deux écritures de la règle
   * divergeraient, et l'écran et le serveur se contrediraient sur le même bien.
   */
  it('🔴 le manuel global l’emporte, et c’est le module pur qui le dit', async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          id: '1', adresse: 'jcordel@mavimmo.fr', lot_cle: '504', categorie: 'proprietaire', origine: 'defaut',
          verifie_le: null, verifie_par: null, pose_le: '2026-10-04T00:00:00Z', pose_par: 'automatique',
        },
        {
          id: '2', adresse: 'jcordel@mavimmo.fr', lot_cle: null, categorie: 'independant', origine: 'manuel',
          verifie_le: '2026-10-04T00:00:00Z', verifie_par: 'a.jorel@sansvisavis.com',
          pose_le: '2026-10-04T00:00:00Z', pose_par: 'a.jorel@sansvisavis.com',
        },
      ],
    });
    const lu = await lireCategoriesDuBien('504');
    expect(lu).toHaveLength(1);
    expect(lu[0].parBien?.categorie).toBe('proprietaire');
    expect(lu[0].globale?.categorie).toBe('independant');
    /* 🔒 ET LA RETENUE EST L'INDÉPENDANT MANUEL : l'erreur corrigée à la main ne revient pas. */
    expect(lu[0].retenue).toEqual({ categorie: 'independant', origine: 'manuel' });
  });

  /**
   * ⚠️ L'ADRESSE EST NORMALISÉE COMME PARTOUT AILLEURS (minuscules) : la base l'exige, et une majuscule créerait
   * une seconde catégorie vivante pour la même boîte, invisible de l'index d'unicité.
   */
  it('⚠️ l’adresse est mise en minuscules avant d’être écrite', async () => {
    await poserCategorieAlaMain({
      adresse: '  M.Carlus@CabinetJourdan.COM ', lotCle: '101', categorie: 'locataire', auteur: AUTEUR,
    });
    expect(params().flat()).toContain('m.carlus@cabinetjourdan.com');
    expect(params().flat()).not.toContain('  M.Carlus@CabinetJourdan.COM ');
  });

  /** ⚠️ UNE ADRESSE QUI N'EST PAS UNE ADRESSE EST REFUSÉE AVANT TOUTE REQUÊTE. */
  it('⚠️ une adresse illisible est refusée sans rien écrire', async () => {
    const r = await poserCategorieAlaMain({
      adresse: 'pas une adresse', lotCle: '101', categorie: 'locataire', auteur: AUTEUR,
    });
    expect(r.ok).toBe(false);
    expect(txMock).not.toHaveBeenCalled();
  });

  /**
   * 🔴 LE PRÉDICAT DE L'INDEX PARTIEL EST RÉPÉTÉ DANS CHAQUE `ON CONFLICT`. Sans lui, PostgreSQL rend « there is
   * no unique or exclusion constraint matching the ON CONFLICT specification » — erreur payée une fois le
   * 04/10/2026 sur `gestion_piece_drive`, et qui n'apparaît qu'à l'exécution.
   */
  it('🔴 chaque ON CONFLICT répète le prédicat « WHERE retire_le IS NULL »', () => {
    for (const f of ['app/lib/gestion/partieCategorieRepo.ts', 'app/scripts/reprendre-categories-parties.ts']) {
      const source = readFileSync(f, 'utf8').replace(/\s+/g, ' ');
      const conflits = source.match(/ON CONFLICT \([^)]*\)[^D]*/g) ?? [];
      expect(conflits.length, `${f} n’a aucun ON CONFLICT`).toBeGreaterThan(0);
      for (const c of conflits) expect(c, `${f} :: ${c}`).toContain('WHERE retire_le IS NULL');
    }
  });

  /**
   * 🔴🔴 LA REPRISE NE TOUCHE JAMAIS UNE LIGNE MANUELLE, et le `DO NOTHING` seul ne suffirait pas : il protège
   * (adresse, MÊME lot), pas une adresse rangée `independant` à la main que la règle voudrait reposer sur un bien.
   * D'où le `NOT EXISTS (… origine = 'manuel')` — on garde sa trace ici, parce que c'est la promesse d'Arno.
   */
  it('🔴🔴 la reprise écarte explicitement les rangements manuels', () => {
    const script = readFileSync('app/scripts/reprendre-categories-parties.ts', 'utf8').replace(/\s+/g, ' ');
    expect((script.match(/NOT EXISTS \( SELECT 1 FROM gestion_(partie_categorie|contact_carte) m/g) ?? []).length)
      .toBe(2);
    expect((script.match(/m\.origine = 'manuel'/g) ?? []).length).toBe(2);
  });

  /**
   * 🔴 ET ELLE NE PEUT PAS POSER DE « MANUEL » : la seule origine qu'elle écrit côté catégories est `defaut` ou
   * `propose` (lues du module pur), et côté cartes `auto`. Le mot `'manuel'` n'apparaît dans son SQL que pour
   * ÉCARTER les lignes manuelles — jamais pour en écrire.
   */
  it('🔴 la reprise n’écrit jamais origine = « manuel »', () => {
    const script = readFileSync('app/scripts/reprendre-categories-parties.ts', 'utf8');
    expect(script).not.toContain("origine, 'manuel'");
    expect(script).not.toContain("'manuel', $");
    expect(script).toContain("'auto'");
  });

  /** ⚠️ LES CARTES SONT RENDUES VÉRIFIÉES D'ABORD : ce sont les seules qui s’affichent hors du repli. */
  it('⚠️ les cartes vérifiées viennent en tête', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await lireCartesDuBien('155');
    expect(sqls()[0]).toContain('ORDER BY cote, (verifie_le IS NULL)');
  });
});

/**
 * ══ 🔴🔴 ⑥ LE GROUPE « INDÉPENDANT » DOIT POUVOIR SE REMPLIR — LE DÉFAUT QUI MANQUAIT D'UNE ÉPREUVE ═════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT, TROUVÉ À L'ÉCRAN LE 04/10/2026, ET POURQUOI RIEN NE L'AVAIT ATTRAPÉ.
 *
 * `lireCategoriesDuBien` définissait « les adresses qui touchent ce bien » comme **celles qui portent déjà une
 * ligne de catégorie sur ce bien**. Or la reprise donne à une adresse **soit** une ligne globale `independant`,
 * **soit** une ligne par bien — jamais les deux. Mesuré en base : **65 indépendants globaux**, et **0 adresse**
 * portant à la fois une ligne sur un lot et une ligne globale.
 *
 * 🔴 CONSÉQUENCE : aucun indépendant ne pouvait JAMAIS sortir de cette lecture. Le groupe « Indépendant » de la
 * fiche restait vide quoi qu'on range — et les 65 indépendants proposés par la reprise étaient invisibles.
 *
 * 🔴 ET LE PIRE : l'encadré de la fonction promettait le contraire — « elle rend aussi les adresses qui n'ont
 * QU'une ligne globale et aucune ligne sur ce bien ». La documentation disait l'intention, le SQL faisait autre
 * chose, et **aucune épreuve ne regardait**. C'est ce trou-là que ce groupe ferme.
 *
 * ⚠️ POURQUOI PAR FRAGMENTS SÉMANTIQUES ET NON PAR LA FORME DU SQL : règle du dépôt (`AGENTS.md`). On n'exige pas
 * une requête écrite d'une certaine façon ; on exige qu'elle pose la BONNE QUESTION — « cette adresse apparaît-elle
 * dans un mail rattaché à ce bien ? » — et qu'elle la pose avec le fragment unique du dépôt.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴🔴 ⑥ les indépendants GLOBAUX sortent bien de la lecture d’un bien', () => {
  const source = readFileSync('app/lib/gestion/partieCategorieRepo.ts', 'utf8');
  const lecture = source.slice(
    source.indexOf('export async function lireCategoriesDuBien'),
    source.indexOf('export async function lireCartesDuBien'));
  const sql = sansCommentaires(lecture).replace(/\s+/g, ' ');

  it('🔴🔴 « les adresses de ce bien » se lit dans le COURRIER, pas dans la table des catégories', () => {
    /* 🔴 LA DÉFINITION FAUTIVE, nommément interdite : la sous-requête ne doit pas se contenter de relire
       `gestion_partie_categorie` pour savoir qui touche ce bien — c'était tout le défaut. */
    expect(sql).toContain('FROM gestion_rattachement r');
    expect(sql).toContain('JOIN gestion_message_adresse a ON a.message_id = r.message_id');
  });

  it('🔴🔴 et elle le lit par le FRAGMENT UNIQUE du dépôt, jamais par une condition recopiée', () => {
    /**
     * 🔴 LA PREUVE EST EN DEUX MOITIÉS, et c'est la seule façon honnête de la tenir : le fragment est appelé, ET
     * aucune de ses conditions n'est réécrite à la main.
     *
     * ⚠️ ON NE PEUT PAS CHERCHER `r.statut = 'confirme'` DANS LA SOURCE, et j'y suis tombé en écrivant cette
     * épreuve : ces conditions n'existent nulle part dans le fichier — elles sont PRODUITES à l'exécution par
     * `${sqlLiensDuBien('r')}`. C'est justement ce qu'on veut, et c'est pourquoi la seconde moitié cherche leur
     * ABSENCE : une condition qu'on lirait en clair ici serait la preuve d'une copie.
     */
    expect(lecture).toContain("sqlLiensDuBien('r')");
    expect(sql).not.toContain("r.statut =");
    expect(sql).not.toContain("r.cible_sorte =");
    expect(sql).not.toContain('r.piece_id');
  });

  /**
   * ⚠️ ET L'UNION EST GARDÉE, elle aussi : une adresse rangée À LA MAIN sur ce bien doit rester lisible même si
   * son dernier mail a été détaché depuis. Sans l'union, un rangement humain disparaîtrait de l'écran au premier
   * détachement — et le choix manuel, qui prime sur tout, serait le plus fragile des trois.
   */
  it('⚠️ les lignes posées sur ce lot restent lues, même sans courrier', () => {
    expect(sql).toContain('UNION');
    expect(sql).toContain("FROM gestion_partie_categorie WHERE retire_le IS NULL AND lot_cle = $1");
  });

  /**
   * 🔴 LA LIGNE GLOBALE EST BIEN CELLE QU'ON VA CHERCHER : `lot_cle IS NULL` dans le filtre final. C'est elle qui
   * porte l'indépendant, et le `coalesce(lot_cle,'')` de l'index unique garantit qu'il n'y en a qu'une par adresse.
   */
  it('🔴 la ligne GLOBALE d’une adresse du bien est ramenée avec les lignes du bien', () => {
    expect(sql).toContain('c.lot_cle = $1 OR (c.lot_cle IS NULL AND c.adresse IN (SELECT adresse FROM adresses))');
  });

  /**
   * ⚠️ ET LA SONDE RESTE EN PREMIER : sans la migration 304, cette lecture ne nomme toujours aucune table neuve.
   * Le correctif a ajouté deux tables EXISTANTES à la requête — il ne doit pas avoir déplacé le garde.
   */
  it('⚠️ la sonde de la migration 304 passe toujours avant la requête', () => {
    const avant = lecture.slice(0, lecture.indexOf('query<'));
    expect(avant).toContain('await partieCategorieDisponible()');
    expect(avant).toContain('return [];');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ⑦ LOT HISTORIQUE-BIEN-8, POINT 3 — LA FICHE D'UN CONTACT (migration 306)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO : « Le formulaire du “+” doit être le MÊME que celui des clients […] Le même formulaire complet
   sert à “Modifier ce contact” (le crayon de la carte). »

   CE QUE CE GROUPE TIENT : que la fiche VOYAGE jusqu'à la base, que la POSE n'efface jamais, que le CRAYON écrase,
   et que SANS la 306 aucune des sept colonnes n'est nommée — l'écran se comportant alors comme au lot 7.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ⑦ la fiche d’un contact voyage jusqu’à la base', () => {
  const FICHE = {
    civilite: 'Mme', prenom: 'Fanny', qualite: 'syndic',
    adressePostale: '2 rue Mars et Roty', codePostal: '92800', commune: 'PUTEAUX',
    note: 'ne pas appeler avant 10 h',
    coordonnees: [
      { sorte: 'telephone' as const, libelle: 'Mobile', valeur: '06 11 22 33 44' },
      { sorte: 'email' as const, libelle: 'E-mail', valeur: 'f.rosky@fictif.test' },
    ],
  };

  it('🔴 LA LECTURE NOMME LES SEPT COLONNES, et relit le `jsonb` par le module pur', async () => {
    queryMock.mockResolvedValue({
      rows: [{
        id: '7', lot_cle: '155', cote: 'proprietaire', adresse: 'f.rosky@fictif.test', nom: 'ROSKY',
        telephone: '06 11 22 33 44', origine: 'manuel', verifie_le: null, verifie_par: null,
        cree_le: 'x', cree_par: 'y', note: null, civilite: 'Mme', prenom: 'Fanny', qualite: 'syndic',
        adresse_postale: '2 rue Mars et Roty', code_postal: '92800', commune: 'PUTEAUX',
        /* 🔴 UNE LIGNE ILLISIBLE EST IGNORÉE, JAMAIS DEVINÉE — règle du module pur, éprouvée chez lui. */
        coordonnees: [{ sorte: 'email', valeur: 'f.rosky@fictif.test', libelle: 'E-mail' }, { sorte: 'fax' }],
      }],
    });
    const [c] = await lireCartesDuBien('155');
    for (const col of ['civilite', 'prenom', 'qualite', 'adresse_postale', 'code_postal', 'commune',
      'coordonnees']) {
      expect(sqls()[0], col).toContain(col);
    }
    expect(c.civilite).toBe('Mme');
    expect(c.prenom).toBe('Fanny');
    expect(c.adressePostale).toBe('2 rue Mars et Roty');
    expect(c.coordonnees).toEqual([{ sorte: 'email', valeur: 'f.rosky@fictif.test', libelle: 'E-mail' }]);
  });

  /**
   * 🔴🔴 UNE POSE N'EFFACE JAMAIS, ET C'EST LA RÈGLE DE CETTE FONCTION DEPUIS LE LOT 2. Reposer une carte est le
   * geste de quelqu'un qui AJOUTE (un côté qui change, un champ qu'on complète). EFFACER est le geste du crayon.
   */
  /**
   * ⚠️ ON DÉSIGNE L'INSTRUCTION PAR CE QU'ELLE FAIT, ET NON PAR SON RANG. La pose en émet désormais jusqu'à
   * TROIS (chercher la proposition, la retirer, insérer) — voir l'encadré de `poserCarteAlaMain` —, et un rang
   * figé aurait rougi pour la bonne raison au lieu de la seule qui compte.
   */
  const sqlAvec = (mot: string): string => sqls().find((s) => s.includes(mot)) ?? '';

  it('🔴🔴 LA POSE ÉCRIT LA FICHE EN `coalesce` — elle complète, elle n’efface pas', async () => {
    await poserCarteAlaMain({
      lotCle: '155', cote: 'proprietaire', adresse: 'f.rosky@fictif.test', nom: 'ROSKY',
      fiche: FICHE, auteur: AUTEUR,
    });
    const sql = sqlAvec('INSERT INTO gestion_contact_carte');
    for (const col of ['civilite', 'prenom', 'qualite', 'adresse_postale', 'code_postal', 'commune',
      'coordonnees', 'note']) {
      expect(sql, col).toContain(`${col} = coalesce(EXCLUDED.${col}, gestion_contact_carte.${col})`);
    }
    expect(sql).toContain('$15::jsonb');
    const p = params()[sqls().indexOf(sql)];
    expect(p).toContain('Mme');
    expect(p).toContain(JSON.stringify(FICHE.coordonnees));
  });

  /**
   * ══ 🔴🔴 LE DÉFAUT TROUVÉ PAR L'ESSAI RÉEL — VALIDER UNE PROPOSITION ═════════════════════════════════════════
   *
   * Sur lot-290 / Jessica TADEU, le 05/10/2026, la base a REFUSÉ net le geste du « + » :
   *     new row for relation "gestion_contact_carte" violates check constraint
   *     "gestion_contact_carte_auteur_chk"
   * Le `ON CONFLICT DO UPDATE` posait `origine = 'manuel'` sur la PROPOSITION sans toucher son auteur, et la
   * ligne prétendait alors « créée à la main par automatique » — ce que la contrainte de la 304 interdit, à
   * raison.
   *
   * 🔴 CE CHEMIN EST NÉ AVEC LE POINT 1 DE CE LOT : jusqu'au lot 7, le « + » ne s'affichait que sur une capsule
   * SANS carte, et le `ON CONFLICT` ne rencontrait jamais de proposition. Valider une proposition est désormais
   * le cas ORDINAIRE — d'où ces deux cas, qui le tiennent.
   */
  it('🔴🔴 VALIDER UNE PROPOSITION LA RETIRE ET POSE UNE CARTE NEUVE — la trace reste', async () => {
    /* ① la proposition existe (origine « auto ») ; ② son retrait rend son identifiant ; ③ la carte neuve naît. */
    txMock.mockReset();
    txMock
      .mockResolvedValueOnce({ rows: [{ id: '480' }] })
      .mockResolvedValueOnce({ rows: [{ id: '480' }] })
      .mockResolvedValueOnce({ rows: [{ id: '1470' }] });

    const r = await poserCarteAlaMain({
      lotCle: '421', cote: 'proprietaire', adresse: 'j.tadeu@fictif.test', nom: 'TADEU',
      fiche: FICHE, auteur: AUTEUR,
    });
    expect(r.ok && r.id).toBe(1470);
    /* 🔴 LA PROPOSITION EST DANS `retires` : c'est par elle que « Annuler » la rouvrira, exactement. */
    expect(r.ok && r.retires).toEqual([480]);

    const tout = sqls();
    /* 🔴 ELLE EST CHERCHÉE `FOR UPDATE` : on lit avant d'écrire (piège `withTransaction` du dépôt). */
    expect(tout[0]).toContain("origine = 'auto'");
    expect(tout[0]).toContain('FOR UPDATE');
    /* 🔴 ET RETIRÉE AVEC SON MOTIF — jamais un DELETE : la trace de la passe automatique reste. */
    expect(tout[1]).toContain('SET retire_le = now()');
    expect(params()[1]).toContain('proposition validée à la main');
    expect(tout[2]).toContain('INSERT INTO gestion_contact_carte');
    /* ⚠️ LES TROIS INSTRUCTIONS SONT DANS LA MÊME TRANSACTION : sans elle, un échec de l'insertion laisserait le
       bien SANS proposition ET sans carte — on aurait détruit un pré-remplissage en croyant le valider. */
    expect(queryMock).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ UNE CARTE DÉJÀ MANUELLE EST COMPLÉTÉE SUR PLACE, et ce cas le tient : la retirer et la reposer lui
   * donnerait un nouvel identifiant à chaque clic, et « Annuler » retirerait alors une carte que le geste n'avait
   * pas créée — le garde du lot 3.
   */
  it('⚠️ UNE CARTE DÉJÀ MANUELLE N’EST NI RETIRÉE NI RECRÉÉE', async () => {
    txMock.mockReset();
    /* Aucune proposition : la recherche ne rend rien. */
    txMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: '1465' }] });
    const r = await poserCarteAlaMain({
      lotCle: '421', cote: 'proprietaire', adresse: 'a.bruneel@fictif.test', nom: 'BRUNEEL',
      auteur: AUTEUR,
    });
    expect(r.ok && r.retires).toEqual([]);
    expect(r.ok && r.id).toBe(1465);
    expect(sqls().some((s) => s.includes('SET retire_le = now()'))).toBe(false);
  });

  /**
   * 🔴🔴 LA COLONNE `telephone` EST **DÉRIVÉE** DE LA LISTE, et non une seconde vérité. Elle est lue ailleurs (le
   * report d'un changement de côté, la proposition automatique) : la laisser vide aurait fait perdre le numéro au
   * premier glissement d'un côté à l'autre — le défaut que ce report existe pour empêcher.
   */
  it('🔴🔴 LE TÉLÉPHONE DE LA COLONNE EST LE PREMIER DE LA LISTE', async () => {
    await poserCarteAlaMain({
      lotCle: '155', cote: 'proprietaire', adresse: 'f.rosky@fictif.test',
      telephone: '01 00 00 00 00', fiche: FICHE, auteur: AUTEUR,
    });
    /* La liste l'emporte sur le champ reçu : c'est elle qu'un humain vient de valider. */
    const p = params()[sqls().findIndex((s) => s.includes('INSERT INTO gestion_contact_carte'))];
    expect(p).toContain('06 11 22 33 44');
    expect(p).not.toContain('01 00 00 00 00');
  });

  /**
   * 🔴🔴 LE CRAYON ÉCRASE, ET C'EST TOUTE LA DIFFÉRENCE AVEC LA POSE. Écrire par-dessus un numéro faux doit
   * marcher, et vider un champ doit le vider : un `coalesce` ici rendrait une faute de frappe indélébile.
   */
  it('🔴🔴 LE CRAYON ÉCRIT PAR-DESSUS — aucun `coalesce`, et une liste vide VIDE la rubrique', async () => {
    await modifierCarte({ id: 7, nom: 'ROSKY', fiche: { ...FICHE, coordonnees: [] }, auteur: AUTEUR });
    const sql = sqls()[0];
    expect(sql).not.toContain('coalesce');
    for (const col of ['civilite', 'prenom', 'qualite', 'adresse_postale', 'code_postal', 'commune',
      'coordonnees']) {
      expect(sql, col).toContain(`${col} = $`);
    }
    expect(params()[0]).toContain('[]');
  });

  /**
   * 🔴🔴 SANS LA 306, AUCUNE DES SEPT COLONNES N'EST NOMMÉE — et le geste garde l'effet qu'il avait au lot 7.
   * Nommer une colonne absente ferait échouer le rangement ENTIER, et la catégorie, elle, vient d'être posée.
   * C'est la leçon de la migration 251, repayée au lot 4a.
   */
  it('🔴🔴 SANS LA 306, NI LA LECTURE NI LES ÉCRITURES NE NOMMENT CES COLONNES', async () => {
    migration306 = false;
    const COLONNES = ['civilite', 'prenom', 'qualite', 'adresse_postale', 'code_postal', 'commune',
      'coordonnees'];

    /* ① LA LECTURE : elle rend la carte NUE, et son SQL ne connaît aucune des sept colonnes. */
    queryMock.mockResolvedValue({
      rows: [{
        id: '7', lot_cle: '155', cote: 'proprietaire', adresse: 'f@x.test', nom: null, telephone: null,
        origine: 'auto', verifie_le: null, verifie_par: null, cree_le: 'x', cree_par: 'y', note: null,
        civilite: null, prenom: null, qualite: null, adresse_postale: null, code_postal: null,
        commune: null, coordonnees: null,
      }],
    });
    const [c] = await lireCartesDuBien('155');
    expect(c.civilite).toBeNull();
    expect(c.coordonnees).toEqual([]);
    /* 🔴 LA COLONNE N'EST PAS NOMMÉE : elle n'apparaît que comme ALIAS d'un `NULL`, ce que la base accepte
       toujours. C'est la forme exacte qui rend la lecture possible sur une base sans la 306. */
    for (const col of COLONNES.filter((x) => x !== 'coordonnees')) {
      expect(sqls()[0], col).toContain(`NULL::text AS ${col}`);
    }
    expect(sqls()[0]).toContain('NULL::jsonb AS coordonnees');

    /* ② LES ÉCRITURES : la fiche est DEMANDÉE, et pourtant aucune colonne n'est nommée — le geste garde
       exactement l'effet qu'il avait au lot 7, et il RÉUSSIT. C'est tout l'intérêt de la sonde : sans elle, le
       rangement entier aurait échoué alors que la catégorie, elle, vient d'être posée. */
    const pose = await poserCarteAlaMain({
      lotCle: '155', cote: 'proprietaire', adresse: 'f@x.test', fiche: FICHE, auteur: AUTEUR,
    });
    const crayon = await modifierCarte({ id: 7, nom: 'ROSKY', fiche: FICHE, auteur: AUTEUR });
    expect(pose.ok).toBe(true);
    expect(crayon.ok).toBe(true);

    /* ⚠️ ON NE REGARDE QUE LES ÉCRITURES (la lecture, elle, a ses alias) : aucune des sept colonnes n'y
       apparaît, ni dans la liste des colonnes, ni dans le `SET`, ni dans le `DO UPDATE`. */
    for (const sql of sqls().filter((s) => !s.startsWith('SELECT id::text, lot_cle'))) {
      for (const col of COLONNES) expect(sql, col).not.toContain(col);
    }
    /* ⚠️ MAIS LE NOM ET LE TÉLÉPHONE PASSENT TOUJOURS : ce sont les colonnes de la 304, et elles sont là. */
    const insert = sqls().find((s) => s.includes('INSERT INTO gestion_contact_carte')) ?? '';
    expect(insert).toContain('nom');
    expect(insert).toContain('telephone');
  });
});
