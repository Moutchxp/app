import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ 🔴🔴 LOT FRISE-DATE-VIDE-PAR-DEFAUT (10/10/2026) ═══════════════════════════════════════════════════════════════
 *
 * ARNO :
 *   · « Pour TOUTES les cartes à date facultative […] à l'ouverture du bloc “Ajouter — …”, les champs Date ET
 *     Heure sont VIDES (plus de “date proposée” pré-remplie, y compris le libellé “— date proposée : JJ/MM/AAAA”
 *     du bloc “Ajouter une carte” s'il ne sert plus qu'à ça). »
 *   · « Ces cartes restent validables sans date, sans cercle rouge. »
 *   · « Une carte validée sans date n'affiche aucune date dans le carré (pas de date inventée) ; la ligne verte
 *     “créée le …” sous le carré reste inchangée. »
 *   · « Les cartes de rendez-vous gardent la règle de cc8ab57e (vides + cercle rouge + obligatoires). »
 *   · « En MODIFICATION d'une carte existante : le formulaire reste pré-rempli avec ses valeurs actuelles. »
 *   · « Cartes existantes : aucune date réécrite. »
 *
 * CE QUE CE FICHIER TIENT : ① le formulaire s'ouvre vide, pour toutes les cartes ; ② le refus ne frappe que le
 * rendez-vous ; ③ la date d'une carte non datée ne s'affiche nulle part ; ④ la route enregistre le drapeau, et
 * refuse un rendez-vous sans date même si l'écran est contourné ; ⑤ le dépôt écrit `jour_connu` à la bonne place.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/* ── Pilote de base : on capture ce qui part, on ne fabrique que ce que la route lit. ─────────────────────────── */
const emis: { sql: string; params: unknown[] }[] = [];
vi.mock('../../../../lib/db/client', () => ({
  query: async (sql: string, params: unknown[] = []) => {
    emis.push({ sql, params });
    if (sql.includes('AS ouvert')) return { rows: [{ ouvert: true }], rowCount: 1 };
    if (sql.includes('INSERT INTO gestion_monga_etape')) return { rows: [{ id: '501' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  },
  withTransaction: async () => { throw new Error('non utilisé ici'); },
}));
vi.mock('../../../../lib/admin/garde', () => ({ exigerCompteActif: async () => null }));
vi.mock('../../../../lib/gestion/auteur', () => ({
  auteurDeLaRequete: async () => ({ id: null, libelle: 'Épreuve' }),
}));

import { POST } from '../../../api/admin/gestion/evenements/[id]/frise/route';
import { ajouterEtapeManuelle, modifierEtapeManuelle } from '../../../../lib/gestion/mongaEtapeRepo';
import {
  dateAffichee, estCarteRendezVous, MENTION_DATE_RDV, motDateEtape, refusDEnregistrement, valeursDeLaCarte,
  type EtapeAAfficher,
} from '../../../../lib/gestion/frise';
import { TYPES_INFORMATION, TYPES_RESERVOIR, type TypeEtape } from '../../../../lib/gestion/mongaEtape';

const ICI = 'app/(admin)/admin/(protected)/gestion/';
const FAV = readFileSync(`${ICI}FriseAvancement.tsx`, 'utf8');
const CARTE = readFileSync(`${ICI}CarteVive.tsx`, 'utf8');
const MIGRATION = readFileSync('db/migrations/323_gestion_etape_jour_connu.sql', 'utf8');

const carte = (p: Partial<EtapeAAfficher>): EtapeAAfficher => ({
  id: 9, reference: null, type: 'devis_recu', survenuLe: '2026-10-09T14:30', heureConnue: true,
  heureFin: null, numero: null, rang: null, montantCents: null, texte: null, auteur: null, source: 'manuelle',
  certitude: 'fiable', messageId: null, aEuUnMail: false, filId: null, creeParLibelle: null, rangDevis: null,
  ...p,
} as EtapeAAfficher);

beforeEach(() => { emis.length = 0; });

describe('🔴🔴 ① le formulaire s’ouvre VIDE, pour toutes les cartes', () => {
  /** 🔴 Chaque type du réservoir ET des informations : aucun ne pré-remplit ni Date ni Heure. */
  it('🔴🔴 Date et Heure vides à l’ouverture, quel que soit le type', () => {
    for (const t of [...TYPES_RESERVOIR, ...TYPES_INFORMATION]) {
      const v = valeursDeLaCarte(null, '2026-10-09', t);
      expect(v.jour, t).toBe('');
      expect(v.heure, t).toBe('');
    }
  });

  /** 🔴 « En MODIFICATION : pré-rempli avec ses valeurs actuelles » — une carte datée garde sa date… */
  it('🔴 modifier une carte datée pré-remplit sa date et son heure', () => {
    const v = valeursDeLaCarte(carte({}), '2026-12-25', 'devis_recu');
    expect(v.jour).toBe('2026-10-09');
    expect(v.heure).toBe('14:30');
  });

  /** 🔴🔴 …et une carte validée SANS date rouvre sans date : sa valeur actuelle, c'est « pas de date ». */
  it('🔴🔴 modifier une carte non datée la rouvre sans date — ni le jour de repli, ni l’heure', () => {
    const v = valeursDeLaCarte(carte({ jourConnu: false }), '2026-12-25', 'devis_recu');
    expect(v.jour).toBe('');
    expect(v.heure).toBe('');
  });

  /** ⚠️ Une carte d'AVANT ce lot n'a pas le drapeau : elle se lit datée, comme avant (« aucune date réécrite »). */
  it('⚠️ sans drapeau, la carte est datée — exactement comme avant ce lot', () => {
    expect(valeursDeLaCarte(carte({ jourConnu: undefined }), '2026-12-25', 'devis_recu').jour).toBe('2026-10-09');
  });

  /** 🔴 Le libellé « — date proposée » est retiré (accord d'Arno pour CET élément) — et sa classe avec lui. */
  it('🔴 le bloc « Ajouter une carte » n’annonce plus de date proposée', () => {
    expect(FAV).not.toContain('date proposée : ${');
    expect(FAV).not.toContain('className="fav-ajout-date"');
    expect(FAV).not.toContain('.fav-ajout-date{');
  });
});

describe('🔴 ② validable sans date — sauf un rendez-vous', () => {
  it('🔴 une carte ordinaire sans date n’est pas refusée, et n’a pas de cercle', () => {
    for (const t of ['devis_recu', 'facture', 'intervention', 'note'] as TypeEtape[]) {
      expect(estCarteRendezVous(t), t).toBe(false);
      expect(refusDEnregistrement({ jour: '', type: t, titre: '', montantLisible: true }), t).toBeNull();
    }
    expect(FAV).toContain("const dateManquante = estCarteRendezVous(type) && jour === '';");
  });

  it('🔴 un rendez-vous sans date reste refusé, avec ses mots', () => {
    expect(refusDEnregistrement({ jour: '', type: 'prise_rdv', titre: '', montantLisible: true }))
      .toBe(MENTION_DATE_RDV);
  });

  /** 🔴 Ce qui part au serveur dit si le jour a été SAISI ; le repli d'une modification est le jour de la carte. */
  it('🔴 le formulaire envoie `jourConnu`, et range une carte modifiée à SON jour', () => {
    expect(FAV).toContain("jourConnu: jour !== '',");
    expect(FAV).toContain('const jourRepli = modifie === null ? jourDefaut : (modifie.survenuLe.slice(0, 10) || jourDefaut);');
    expect(FAV).toContain('jourAEnregistrer(jour, jourRepli)');
    expect(FAV).not.toContain('jourAEnregistrer(jour, jourDefaut)');
  });
});

describe('🔴🔴 ③ une carte non datée n’affiche AUCUNE date', () => {
  it('🔴🔴 `dateAffichee` rend `null` — et la date ordinaire sinon', () => {
    expect(dateAffichee(carte({ jourConnu: false }))).toBeNull();
    expect(dateAffichee(carte({ jourConnu: true }))).toBe(motDateEtape(carte({})));
    expect(dateAffichee(carte({}))).toBe('09/10/2026 à 14:30');
  });

  /** 🔴 Le carré, le point et la bulle passent TOUS par `dateAffichee` : plus aucun `motDateEtape` dans l'écran. */
  it('🔴 le carré, le point et la bulle lisent la même règle', () => {
    expect(FAV).not.toMatch(/\{motDateEtape\(|\$\{motDateEtape\(/);
    expect(FAV).toContain('{dateAffichee(e) !== null && (');
    expect(FAV).toContain('{mot}{dateAffichee(e) !== null && <> · {dateAffichee(e)}</>} · {motSource(e)}');
    expect(FAV).toContain('title={dateAffichee(m) === null ? motEtape(m.type) : ');
  });

  /** ⚠️ « La ligne verte “créée le …” reste inchangée » : elle ne dépend pas de la date de la carte. */
  it('⚠️ la mention « créée le … » est intacte', () => {
    expect(FAV).toContain('mentionCreation');
  });

  /** 🔴 La miniature de l'événement résume la frise : même règle, rien à la place de la date. */
  it('🔴 la miniature de l’événement non plus', () => {
    expect(CARTE).toContain('const sansDate = etape !== null && etape.jourConnu === false;');
    expect(CARTE).toContain('{!sansDate && <span className="gst-mini-date">{date}</span>}');
  });
});

describe('🔴🔴 ④ la route enregistre le drapeau — et tient la règle du rendez-vous', () => {
  const poser = (corps: Record<string, unknown>) => POST(
    new Request('http://local/api/admin/gestion/evenements/7/frise', {
      method: 'POST', body: JSON.stringify(corps), headers: { 'Content-Type': 'application/json' },
    }),
    { params: Promise.resolve({ id: '7' }) },
  );
  const insertion = () => emis.find((e) => e.sql.includes('INSERT INTO gestion_monga_etape'));

  it('🔴🔴 un devis validé sans date part avec jour_connu = false, rangé au jour de repli', async () => {
    const r = await poser({ type: 'devis_recu', survenuLe: '2026-10-09', heureConnue: false, jourConnu: false });
    expect(r.status).toBe(200);
    const ins = insertion();
    expect(ins?.params[2]).toBe('2026-10-09');
    expect(ins?.params[10]).toBe(false);
  });

  it('⚠️ un appel qui ne dit rien du drapeau garde une date connue (défaut d’avant ce lot)', async () => {
    await poser({ type: 'devis_recu', survenuLe: '2026-10-09', heureConnue: false });
    expect(insertion()?.params[10]).toBe(true);
  });

  it('🔴 un rendez-vous sans date est refusé PAR LA ROUTE, et rien n’est écrit', async () => {
    const r = await poser({ type: 'prise_rdv', survenuLe: '2026-10-09', heureConnue: false, jourConnu: false });
    expect(r.status).toBe(400);
    expect((await r.json()).erreur).toBe(MENTION_DATE_RDV);
    expect(insertion()).toBeUndefined();
  });

  it('⚠️ une borne a toujours sa date, même si on prétend le contraire', async () => {
    await poser({ type: 'cloture', survenuLe: '2026-10-09', jourConnu: false });
    expect(insertion()?.params[10]).toBe(true);
  });
});

describe('🔴 ⑤ le dépôt écrit `jour_connu` à la bonne place', () => {
  /** ⚠️ `jour_connu` est le 11e paramètre : l'étape d'un « + » intercalaire glisse donc en $12. */
  it('🔴 l’ajout entre deux cartes garde sa place, et le drapeau la sienne', async () => {
    await ajouterEtapeManuelle({
      evenementId: 7, type: 'devis_recu', survenuLe: '2026-10-09', heureConnue: false, jourConnu: false,
      texte: null, montantCents: null, pieceNom: null, titre: null, parId: null, parLibelle: 'Épreuve',
      insererApres: 33,
    });
    const ins = emis.find((e) => e.sql.includes('INSERT INTO gestion_monga_etape'))!;
    const sql = ins.sql.replace(/\s+/g, ' ');
    expect(ins.params[10]).toBe(false);
    expect(ins.params[11]).toBe(33);
    expect(sql).toContain('WHERE id = $12 AND evenement_id = $1');
    expect(sql).toContain('pose_choisie, jour_connu)');
  });

  it('🔴 la modification réécrit le drapeau', async () => {
    await modifierEtapeManuelle({
      id: 9, type: 'devis_recu', survenuLe: '2026-10-09', heureConnue: false, jourConnu: false,
      texte: null, montantCents: null, titre: null, pieceNom: null, parLibelle: 'Épreuve',
    });
    const maj = emis.find((e) => e.sql.includes('UPDATE gestion_monga_etape'))!;
    expect(maj.sql.replace(/\s+/g, ' ')).toContain('jour_connu = $10');
    expect(maj.params[9]).toBe(false);
  });

  /** 🔴 « Cartes existantes : aucune date réécrite » — la migration n'a ni UPDATE ni défaut `false`. */
  it('🔴 la migration 323 ne réécrit aucune carte', () => {
    const code = MIGRATION.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(code).toContain('ADD COLUMN IF NOT EXISTS jour_connu boolean NOT NULL DEFAULT true');
    expect(code).not.toMatch(/\bUPDATE\b/i);
  });
});
