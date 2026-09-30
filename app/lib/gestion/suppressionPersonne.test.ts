import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MOTIF_DERNIERE_CARTE, motVoirArchivees, nomAvecCivilite, personneVivanteAvec, phraseSuppression,
} from './personneVivante';

/**
 * ══ 🔴🔴 LOT SUPPRIMER-CARTE — SUPPRIMER UNE FICHE, SANS RIEN EFFACER ════════════════════════════════════════
 *
 * Arno : « la personne n'apparaît plus NULLE PART dans l'app […] Techniquement, c'est une suppression logique :
 * les mails, les rattachements et les historiques des biens restent intacts. Aucune ligne n'est effacée. »
 */
let migration287 = true;
const requetes: { sql: string; params: unknown[] }[] = [];
let ligne: Record<string, unknown> | undefined;
let orphelin: string | null;

vi.mock('../db/client', () => ({
  query: async (sql: string, params: unknown[] = []) => {
    requetes.push({ sql, params });
    // La requête du garde (« quel lot resterait sans propriétaire ? ») rend une clé, ou rien.
    if (/ses_lots/.test(sql)) return { rows: orphelin === null ? [] : [{ cle: orphelin }], rowCount: 0 };
    if (/^\s*SELECT/.test(sql)) return { rows: ligne === undefined ? [] : [ligne], rowCount: 0 };
    return { rows: [], rowCount: 1 };
  },
  withTransaction: async (f: (q: unknown) => unknown) => f(async (sql: string, params: unknown[] = []) => {
    requetes.push({ sql, params });
    if (/ses_lots/.test(sql)) return { rows: orphelin === null ? [] : [{ cle: orphelin }], rowCount: 0 };
    if (/^\s*SELECT/.test(sql)) return { rows: ligne === undefined ? [] : [ligne], rowCount: 0 };
    return { rows: [], rowCount: 1 };
  }),
}));
vi.mock('./schema', () => ({
  annuaireModifiableDisponible: async () => true,
  suppressionPersonneDisponible: async () => migration287,
}));

const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };

beforeEach(() => {
  requetes.length = 0;
  migration287 = true;
  ligne = { nom: 'M. DUPONT Jean', supprime_le: null };
  orphelin = null;
});

describe('🔴🔴 la suppression n’efface RIEN', () => {
  it('🔴 aucun DELETE : on MARQUE, et la ligne reste', async () => {
    const { supprimerPersonne } = await import('./annuaireEditionRepo');
    const r = await supprimerPersonne('proprietaire', 7, AUTEUR);
    expect(r.etat).toBe('ok');
    const ecritures = requetes.filter((q) => /UPDATE|DELETE|INSERT/i.test(q.sql));
    expect(ecritures.some((q) => /DELETE/i.test(q.sql))).toBe(false);
    expect(ecritures.some((q) => /supprime_le = now\(\)/.test(q.sql))).toBe(true);
  });

  /**
   * 🔴 QUI ET QUAND, comme Arno le demande. Un geste qui retire quelqu'un de partout sans dire qui l'a fait est
   * une décision sans auteur.
   */
  it('🔴 qui et quand sont enregistrés, et le journal aussi', async () => {
    const { supprimerPersonne } = await import('./annuaireEditionRepo');
    await supprimerPersonne('proprietaire', 7, AUTEUR);
    const maj = requetes.find((q) => /supprime_le = now\(\)/.test(q.sql));
    expect(maj?.params).toContain(2);
    expect(maj?.params).toContain('a.jorel@sansvisavis.com');
    const journal = requetes.find((q) => /INSERT INTO gestion_journal/.test(q.sql));
    expect(journal?.params).toContain('annuaire_supprime');
  });

  /**
   * 🔴 LA SUPPRESSION POSE AUSSI `archive_le`, et ce n'est pas décoratif : le garde « au moins un propriétaire »
   * ne connaît que cette colonne. Sans cela, supprimer les DEUX propriétaires d'un bien l'un après l'autre aurait
   * été possible — le second n'aurait pas vu que le premier était parti.
   */
  it('🔴 elle pose aussi `archive_le`, sans quoi le garde suivant serait aveugle', async () => {
    const { supprimerPersonne } = await import('./annuaireEditionRepo');
    await supprimerPersonne('proprietaire', 7, AUTEUR);
    const maj = requetes.find((q) => /supprime_le = now\(\)/.test(q.sql));
    expect(maj?.sql).toContain('archive_le = coalesce(archive_le, now())');
  });

  it('⚠️ supprimer deux fois n’écrit qu’une fois : deux clics ne font pas deux journaux', async () => {
    ligne = { nom: 'M. DUPONT Jean', supprime_le: '2026-09-30T10:00:00Z' };
    const { supprimerPersonne } = await import('./annuaireEditionRepo');
    const r = await supprimerPersonne('proprietaire', 7, AUTEUR);
    expect(r.etat).toBe('ok');
    expect(requetes.some((q) => /INSERT INTO gestion_journal/.test(q.sql))).toBe(false);
  });
});

/**
 * ══ 🔴🔴 LE GARDE : UNE FICHE DOIT GARDER AU MOINS UN PROPRIÉTAIRE ═══════════════════════════════════════════
 *
 * Arno : « Contrôle aussi côté serveur, dans la transaction, avec test, y compris en appel direct. »
 */
describe('🔴🔴 la dernière carte ne se supprime pas', () => {
  it('🔴 le serveur REFUSE, avec le motif et le lot concerné', async () => {
    orphelin = 'LOT-421';
    const { supprimerPersonne } = await import('./annuaireEditionRepo');
    const r = await supprimerPersonne('proprietaire', 7, AUTEUR);
    expect(r.etat).toBe('refus');
    if (r.etat === 'refus') {
      expect(r.motif).toContain(MOTIF_DERNIERE_CARTE);
      expect(r.motif).toContain('LOT-421');
    }
  });

  it('🔴 et RIEN n’est écrit quand il refuse', async () => {
    orphelin = 'LOT-421';
    const { supprimerPersonne } = await import('./annuaireEditionRepo');
    await supprimerPersonne('proprietaire', 7, AUTEUR);
    expect(requetes.some((q) => /supprime_le = now\(\)/.test(q.sql))).toBe(false);
    expect(requetes.some((q) => /INSERT INTO gestion_journal/.test(q.sql))).toBe(false);
  });

  /**
   * 🔴 LE GARDE EST DANS LA TRANSACTION, APRÈS UN `FOR UPDATE`. Le bouton grisé protège de la maladresse ; il ne
   * protège de rien contre un appel direct, ni contre une fenêtre restée ouverte pendant qu'un collègue retire
   * l'autre propriétaire.
   */
  it('🔴 il verrouille la fiche AVANT de décider', async () => {
    const { supprimerPersonne } = await import('./annuaireEditionRepo');
    await supprimerPersonne('proprietaire', 7, AUTEUR);
    const lecture = requetes.find((q) => /FOR UPDATE/.test(q.sql));
    expect(lecture, 'la fiche doit être verrouillée').toBeDefined();
    const iVerrou = requetes.findIndex((q) => /FOR UPDATE/.test(q.sql));
    const iGarde = requetes.findIndex((q) => /ses_lots/.test(q.sql));
    expect(iGarde).toBeGreaterThan(iVerrou);
  });

  /** ⚠️ LA RÈGLE NE VAUT QUE POUR LES PROPRIÉTAIRES : un bien peut parfaitement être vacant. */
  it('⚠️ un occupant peut être supprimé même s’il est le dernier — un bien peut être vacant', async () => {
    orphelin = 'LOT-421';
    const { supprimerPersonne } = await import('./annuaireEditionRepo');
    ligne = { nom: 'Mme MARTIN', supprime_le: null };
    const r = await supprimerPersonne('locataire', 9, AUTEUR);
    expect(r.etat).toBe('ok');
  });
});

describe('⚠️ sans la migration 287', () => {
  it('🔴 la suppression n’est même pas tentée, et aucune colonne n’est nommée', async () => {
    migration287 = false;
    const { supprimerPersonne } = await import('./annuaireEditionRepo');
    const r = await supprimerPersonne('proprietaire', 7, AUTEUR);
    expect(r.etat).toBe('sans_schema');
    expect(requetes).toEqual([]);
  });

  it('🔴 et le fragment de lecture rend `true` : les requêtes sont celles d’avant ce lot', () => {
    expect(personneVivanteAvec(false, 'pr')).toBe('true');
    expect(personneVivanteAvec(true, 'pr')).toBe('pr.supprime_le IS NULL');
  });
});

/**
 * ══ 🔴 LES MOTS, ET CE QU'ILS PROMETTENT ═════════════════════════════════════════════════════════════════════
 */
describe('🔴 ce que l’écran dit', () => {
  it('🔴 la confirmation nomme la personne et les trois endroits d’où elle disparaît', () => {
    const p = phraseSuppression('Mme DUPONT Camille');
    expect(p).toContain('Mme DUPONT Camille');
    expect(p).toContain('de cette fiche, de l’annuaire et des propositions');
  });

  /**
   * ⚠️ ELLE NE PROMET PAS QUE « RIEN N'EST PERDU ». Ce serait vrai en base et faux à l'écran — donc trompeur au
   * moment précis où l'on décide.
   */
  it('⚠️ elle ne promet rien qu’elle ne tienne', () => {
    expect(phraseSuppression('X')).not.toContain('rien n’est perdu');
    expect(phraseSuppression('X')).not.toContain('restaur');
  });

  it('une personne sans nom lisible garde une phrase lisible', () => {
    expect(phraseSuppression('   ')).toContain('cette personne');
  });

  /**
   * 🔴🔴 « <CIVILITÉ NOM> » — Arno l'a écrit ainsi, et l'épreuve à l'écran a montré pourquoi : sur
   * proprietaire-146, la carte s'intitulait « Mme _TEST SUPPRESSION Claire » et la confirmation nommait
   * « _TEST SUPPRESSION Claire ». Confirmer la suppression d'un nom qu'on ne lit nulle part ailleurs fait douter
   * de la carte visée — et deux homonymes d'une même fiche ne se distinguent parfois QUE par la civilité.
   */
  it('🔴🔴 la civilité rejoint le nom, et rien ne traîne quand elle manque', () => {
    expect(nomAvecCivilite('Mme', 'DUPONT Camille')).toBe('Mme DUPONT Camille');
    // Une société n'a pas de civilité : pas d'espace en trop devant son nom.
    expect(nomAvecCivilite(null, 'SCI DU PONT')).toBe('SCI DU PONT');
    expect(nomAvecCivilite('  ', 'SCI DU PONT')).toBe('SCI DU PONT');
    expect(phraseSuppression(nomAvecCivilite('Mme', 'DUPONT Camille')))
      .toContain('Supprimer la fiche de Mme DUPONT Camille ?');
  });

  it('le mot du lien des archivées dit COMBIEN', () => {
    expect(motVoirArchivees(2)).toBe('Voir les archivées (2)');
  });

  /** 🔴 UNE SEULE ÉCRITURE DU MOTIF : l'infobulle de l'écran et le refus du serveur disent la MÊME phrase. */
  it('🔴 le motif du refus est écrit une seule fois, et les deux côtés le lisent', () => {
    expect(MOTIF_DERNIERE_CARTE).toBe('Une fiche doit garder au moins un propriétaire.');
    const ecran = readFileSync('app/(admin)/admin/(protected)/gestion/CartesPersonnes.tsx', 'utf8');
    expect(ecran).toContain('MOTIF_DERNIERE_CARTE');
    expect(readFileSync('app/lib/gestion/annuaireEditionRepo.ts', 'utf8')).toContain('MOTIF_DERNIERE_CARTE');
  });
});

/**
 * ══ 🔒 LA FRONTIÈRE CLIENT ════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 ATTRAPÉ PENDANT CE LOT : la première version mettait le fragment SQL et les mots dans le MÊME module, que
 * l'écran des cartes importe. Ce module tirait `./schema`, donc `../db/client`, donc `pg` — et
 * `clientBoundary.guard.test.ts` a rougi tout de suite. C'est l'incident du 24/09/2026, où webpack a refusé de
 * construire et où toute l'application est tombée, avec 8 800 tests au vert.
 */
describe('🔒 le module que lit l’écran ne tire pas la base', () => {
  it('🔴 `personneVivante.ts` n’importe NI la base NI la sonde de schéma', () => {
    const src = readFileSync('app/lib/gestion/personneVivante.ts', 'utf8');
    expect(src).not.toContain("from './schema'");
    expect(src).not.toContain("from '../db/client'");
  });

  it('⚠️ et le fragment qui sonde vit à part', () => {
    expect(readFileSync('app/lib/gestion/personneVivanteSql.ts', 'utf8')).toContain("from './schema'");
  });
});
