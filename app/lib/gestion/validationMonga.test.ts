import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══ 🔴🔴 LOT GESTION-VALIDATION-MONGA (Arno, 10/11/2026) — LE DÉPÔT ET LES MODULES PURS ════════════════════════════════════
 *
 * Base SIMULÉE : rien n'est écrit. On éprouve :
 *   ① toute étape (carré) créée par un mail Monga naît « à confirmer », y compris les formulations « jugées sûres » ; les
 *      repères (points) gardent leur certitude ; une étape à la main naît « fiable » (jamais à valider) ;
 *   ② refuser : retirée de la frise, gardée, et TRACÉE au journal (qui, quand, quel mail Monga) — valider aussi ;
 *   ③ « au moins une étape à valider » : une seule définition, qui ignore les repères ;
 *   ④ le filtre « Étapes à valider » de la famille « À surveiller » (un ajout, rien de retiré).
 */
const emis: { sql: string; params: unknown[] }[] = [];
let evenementsDeLaCarte: string[] = ['52'];
let ligneEtape: Record<string, unknown> | null = null;
vi.mock('../db/client', () => {
  const query = async (sql: string, params: unknown[] = []) => {
    emis.push({ sql, params });
    if (sql.includes('UPDATE gestion_monga_etape')) return { rows: [], rowCount: 1 };
    if (sql.includes('evenement_id::text FROM (')) return { rows: evenementsDeLaCarte.map((e) => ({ evenement_id: e })), rowCount: 1 };
    if (/SELECT type(, survenu_le::text)? FROM gestion_monga_etape/.test(sql)) {
      return { rows: [{ type: 'rdv_intervention', survenu_le: '2026-11-11 17:00:00+01' }], rowCount: 1 };
    }
    if (sql.includes('FROM gestion_monga_etape x LEFT JOIN gestion_message m')) return { rows: ligneEtape ? [ligneEtape] : [], rowCount: 1 };
    if (sql.includes('INSERT INTO gestion_monga_etape')) return { rows: [{ id: '1' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  return { query, withTransaction: async (fn: (q: typeof query) => unknown) => fn(query) };
});
vi.mock('./schema', async (orig) => ({ ...(await orig<object>()), correctionEtapeDisponible: async () => false }));

const { enregistrerEtapesDuMail, trancherEtape, motTranchage } = await import('./mongaEtapeRepo');
const { certitudeALaCreation, etapesDuMailMonga, REPERES } = await import('./mongaEtape');
const { sqlNbEtapesAValider, aValider, motEtapesAValider, CLE_FILTRE_ETAPES_A_VALIDER, MOT_FILTRE_ETAPES_A_VALIDER } = await import('./etapesAValider');
const { INTERRUPTEURS } = await import('./ligneFiltresEvenements');
const { tableauBordEvenements } = await import('./tableauBordEvenements');

const plat = (t: string) => t.replace(/\s+/g, ' ');
const journaux = () => emis.filter((e) => e.sql.includes('INSERT INTO gestion_journal'));
beforeEach(() => { emis.length = 0; evenementsDeLaCarte = ['52']; ligneEtape = null; });

const RDV = 'Nouveau commentaire concernant la mission MNG-25370. Bonjour, l’intervention avec notre artisan partenaire a été fixée le 11/11/2026 entre 17h00 et 18h00. Envoyé par Laura, le 09/11/2026';

describe('① toute étape (carré) créée par un mail Monga naît « à confirmer »', () => {
  it('une formulation « jugée sûre » (rendez-vous d’intervention) : lue fiable, POSÉE à confirmer', async () => {
    const lues = etapesDuMailMonga('MNG-25370 - Nouveau commentaire', RDV);
    expect(lues.map((e) => [e.type, e.certitude])).toEqual([['rdv_intervention', 'fiable']]);   // ce que dit le motif
    await enregistrerEtapesDuMail({ messageId: 61174, messageCle: null, reference: 'MNG-25370', objet: 'MNG-25370 - Nouveau commentaire', texte: RDV, recuLe: '2026-11-09T11:22:14Z' });
    const ins = emis.find((e) => e.sql.includes('INSERT INTO gestion_monga_etape'))!;
    expect(ins.params[1]).toBe('rdv_intervention');
    expect(ins.params[11]).toBe('a_confirmer');                                                  // ce qui est posé
  });

  it('prise de RDV, devis numéroté, rappel : tous les CARRÉS à confirmer ; les repères gardent leur certitude', () => {
    for (const t of ['rdv_intervention', 'prise_rdv', 'devis_recu', 'ouverture', 'cloture', 'rdv_eu_lieu', 'intervention'] as const) {
      expect(certitudeALaCreation({ type: t, certitude: 'fiable' })).toBe('a_confirmer');
    }
    for (const t of REPERES) expect(certitudeALaCreation({ type: t, certitude: 'fiable' })).toBe('fiable');
  });

  it('une étape posée à la main naît « fiable » : jamais à valider', async () => {
    const repo = (await import('node:fs')).readFileSync('app/lib/gestion/mongaEtapeRepo.ts', 'utf8');
    /* Le seul INSERT d'une étape manuelle (`insererEtapeManuelle`, appelé par ajouterEtapeManuelle et poserCarteDeBorne). */
    expect(repo).toContain("$8,'manuelle','fiable',$9");
    expect(repo).not.toMatch(/'manuelle',\s*'a_confirmer'/);
  });
});

describe('② refuser : retirée de la frise, gardée, et tracée au journal du module', () => {
  it('✗ : la ligne d’étape passe en retirée (pas d’effacement) ET une ligne de journal par événement : qui, quand, quel mail', async () => {
    ligneEtape = { type: 'rdv_intervention', reference: 'MNG-25370', message_id: '61174', objet: 'MNG-25370 - Nouveau commentaire' };
    evenementsDeLaCarte = ['52', '60'];
    expect(await trancherEtape(900, 'ecarter', 'a.jorel@sansvisavis.com')).toEqual({ fait: true, etatChange: false, ouvertApres: null });
    const maj = emis.find((e) => e.sql.includes('UPDATE gestion_monga_etape'))!;
    expect(plat(maj.sql)).toContain("certitude = 'ecartee', statut = 'retire', retire_le = now(), retire_par_libelle = $2");
    expect(emis.some((e) => /DELETE/i.test(e.sql))).toBe(false);
    const j = journaux();
    expect(j.map((x) => [x.params[0], x.params[1], x.params[2]])).toEqual([['evenement', 52, 'etape_refusee'], ['evenement', 60, 'etape_refusee']]);
    expect(j[0].params[6]).toBe('a.jorel@sansvisavis.com');                                       // qui (quand : horodatage par défaut)
    expect(String(j[0].params[5])).toContain('créée par le mail Monga 61174 « MNG-25370 - Nouveau commentaire »');
    expect(String(j[0].params[5])).toContain('refusée (effacée de la frise, conservée)');
  });

  it('✓ : validée, et tracée elle aussi', async () => {
    ligneEtape = { type: 'rdv_intervention', reference: 'MNG-25370', message_id: '61174', objet: null };
    await trancherEtape(900, 'confirmer', 'a.jorel@sansvisavis.com');
    expect(journaux().map((x) => x.params[2])).toEqual(['etape_validee']);
  });

  it('une Ouverture déduite par Monga (sans mail) le dit', () => {
    expect(motTranchage('ecarter', { id: 683, type: 'ouverture', reference: 'MNG-25370', messageId: null, objet: null }))
      .toBe('étape 683 (ouverture, MNG-25370) refusée (effacée de la frise, conservée) — sans mail d’origine (déduite par Monga)');
  });
});

describe('③ « au moins une étape à valider » : une seule définition', () => {
  it('vive, à confirmer, CARRÉ (les repères n’ont pas de boutons, ils n’allument rien), de l’événement ou de ses références', () => {
    const s = plat(sqlNbEtapesAValider('e'));
    expect(s).toContain("svv_v.statut = 'vif' AND svv_v.certitude = 'a_confirmer'");
    for (const t of REPERES) expect(s).toContain(`'${t}'`);
    expect(s).toContain('svv_v.type <> ALL (ARRAY[');
    expect(s).toContain('svv_v.evenement_id = e.id');
    expect(s).toContain('gestion_monga_lien');
  });
  it('l’encadré et sa phrase', () => {
    expect([aValider({ etapesAValider: 2 }), aValider({ etapesAValider: 1 }), aValider({ etapesAValider: 0 }), aValider({})]).toEqual([true, true, false, false]);
    expect(motEtapesAValider(1)).toBe('1 étape à valider');
    expect(motEtapesAValider(3)).toBe('3 étapes à valider');
  });
});

describe('④ le filtre « Étapes à valider », dans la famille « À surveiller »', () => {
  it('ajouté après les trois existants, qui restent', () => {
    expect(INTERRUPTEURS.map((i) => i.mot)).toEqual(['Devis en attente', 'Sans nouvelles > 15 j', 'Infos manquantes', MOT_FILTRE_ETAPES_A_VALIDER]);
  });
  it('il retient les événements qui ont au moins une étape à valider', () => {
    const f = (id: number, n?: number) => ({
      id, type: null, urgence: null, ouvert: true, ouvertureLe: null, clotureLe: null, premierDevisLe: null, acceptationLe: null,
      interventionLe: null, montantAttenteCents: 0, montantAccepteCents: 0, nbDevisEnAttente: 0, nbDevisAcceptes: 0,
      nbDevisRefuses: 0, nbReouvertures: 0, derniereActiviteLe: null, avecMonga: true, avecBien: true, nbEtapesAValider: n,
    });
    const tb = tableauBordEvenements([f(1, 2), f(2, 0), f(3), f(4, 1)], [], new Date('2026-11-10T09:00:00Z'));
    expect(tb.idsParFiltre[CLE_FILTRE_ETAPES_A_VALIDER]).toEqual([1, 4]);
  });
});
