import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ 🔴🔴 LOT COMPOSEUR-FENETRE-COMPLETE — LE RATTACHEMENT DU COMPOSEUR, DE L'ENVOI À SON APPLICATION ═════════════════
 * ① il voyage avec un envoi RÉUSSI, jamais avec un envoi refusé ; ② il est appliqué par la fonction de « Modifier le
 * rattachement » (`poserClassement`, injectée ici), une seule fois, et son issue est écrite. Base et Gmail simulés.
 * (Les écritures réelles, position par position, sont éprouvées sur une base d'essai : `composeurFenetreComplete.itest.ts`.)
 */
const requetes: { sql: string; params: unknown[] }[] = [];
let reponses: ((sql: string) => { rows: unknown[] } | undefined)[] = [];
vi.mock('../db/client', () => ({
  query: async (sql: string, params: unknown[] = []) => {
    requetes.push({ sql, params });
    for (const r of reponses) { const x = r(sql); if (x !== undefined) return x; }
    return { rows: [] };
  },
}));
vi.mock('./schema', async (orig) => ({ ...(await orig<typeof import('./schema')>()), envoiClassementDisponible: async () => true }));

const { envoyerMessage } = await import('./envoi');
const { appliquerClassementsEnAttente, biensDesCibles, enregistrerClassementEnvoi } = await import('./envoiClassementRepo');
type Deps = Parameters<typeof envoyerMessage>[2];

const AUTEUR = { id: 7, libelle: 'arno' };
function deps(gmailOk: boolean) {
  const classements: unknown[] = [];
  const d: Deps = {
    peutEnvoyer: async () => true, jetonAcces: async () => 'jeton',
    expediteur: async () => ({ adresse: 'gestion@exemple.test', nom: 'Gestion' }),
    ancrage: async () => ({ messageIdRfc: '<origine@exemple.test>', references: '<racine@exemple.test>', threadId: 'fil-9' }),
    ouvrirEnvoi: async () => ({ id: 55, etat: 'en_cours', messageIdRfc: '<x@exemple.test>', objet: 'Re: Fuite', a: [], cc: [], cci: [],
      auteurLibelle: 'arno', erreur: null, demandeLe: '2026-10-14T08:00:00Z', deja: false }),
    envoyer: async () => (gmailOk ? { ok: true, gmailMessageId: 'g-1' } : { ok: false, motif: 'adresse invalide' }),
    finaliser: async () => {}, marquerBrouillonEnvoye: async () => {}, journaliser: async () => {},
    classer: async (c: unknown) => { classements.push(c); },
    incident: () => {}, maintenant: () => new Date('2026-10-14T08:00:00Z'), alea: () => 'abc',
  } as unknown as Deps;
  return { d, classements };
}
const DEMANDE = {
  cleIdempotence: 'cle-composeur-1', brouillonId: null, filId: 77, repondAMessageId: 9123,
  a: ['locataire@exemple.test'], cc: [], cci: [], objet: 'Re: Fuite', corps: 'Bonjour',
};

beforeEach(() => { requetes.length = 0; reponses = []; });

describe('🔴 ① le rattachement voyage avec l’envoi réussi, et seulement lui', () => {
  it('après l’envoi réussi : les biens ET la portée, avec l’auteur', async () => {
    const { d, classements } = deps(true);
    const cibles = [{ sorte: 'lot', cle: '421', id: null, libelle: 'Marceau' }];
    const r = await envoyerMessage({ ...DEMANDE, cibles, rattachement: { position: 'one_shot', retires: ['L-176'] } } as never, AUTEUR, d);
    expect(r.ok).toBe(true);
    expect(classements).toEqual([expect.objectContaining({
      envoiId: 55, cibles, rattachement: { position: 'one_shot', retires: ['L-176'] }, auteur: AUTEUR,
    })]);
  });
  it('un mail marqué « Interne » dont on décoche le bien suivi : le retrait voyage aussi', async () => {
    const { d, classements } = deps(true);
    await envoyerMessage({ ...DEMANDE, interne: true, rattachement: { position: null, retires: ['L-176'] } } as never, AUTEUR, d);
    expect(classements).toEqual([expect.objectContaining({ cibles: [], rattachement: { position: null, retires: ['L-176'] } })]);
  });
  it('🔴 envoi refusé par Gmail : rien n’est retenu, donc rien ne sera appliqué', async () => {
    const { d, classements } = deps(false);
    const r = await envoyerMessage({ ...DEMANDE, rattachement: { position: 'suite', retires: [] },
      cibles: [{ sorte: 'lot', cle: '27', id: null, libelle: 'Union' }] } as never, AUTEUR, d);
    expect(r.ok).toBe(false);
    expect(classements).toEqual([]);
  });
  it('sans cible ni choix, la pose n’est même pas appelée (comme avant)', async () => {
    const { d, classements } = deps(true);
    await envoyerMessage({ ...DEMANDE, interne: true, rattachement: { position: null, retires: [] } } as never, AUTEUR, d);
    expect(classements).toEqual([]);
  });
});

describe('🔴 l’intention est retenue sur l’envoi', () => {
  it('les biens (cibles « lot ») sans doublon ; l’événement n’y est pas', () => {
    expect(biensDesCibles([
      { sorte: 'lot', cle: '27', id: 1, libelle: 'Union' }, { sorte: 'lot', cle: '27', id: 1, libelle: 'Union' },
      { sorte: 'evenement', cle: null, id: 3, libelle: 'GES-1' },
    ])).toEqual([{ cle: '27', libelle: 'Union' }]);
  });
  it('rien à retenir : `false`, et aucune requête (l’ancien chemin garde la main)', async () => {
    expect(await enregistrerClassementEnvoi({ envoiId: 55, cibles: [], rattachement: { position: null, retires: [] }, auteur: AUTEUR })).toBe(false);
    expect(await enregistrerClassementEnvoi({ envoiId: 55, cibles: [{ sorte: 'lot', cle: '27', id: null, libelle: 'U' }], rattachement: null, auteur: AUTEUR })).toBe(false);
    expect(requetes).toEqual([]);
  });
  it('retenu : une ligne liée, biens / retirés / position en paramètres', async () => {
    expect(await enregistrerClassementEnvoi({ envoiId: 55, cibles: [{ sorte: 'lot', cle: '27', id: null, libelle: 'U' }],
      rattachement: { position: 'suite', retires: ['L-1'] }, auteur: AUTEUR })).toBe(true);
    expect(requetes[0].sql.replace(/\s+/g, ' ')).toContain('INSERT INTO gestion_envoi_classement');
    expect(requetes[0].params).toEqual([55, JSON.stringify([{ cle: '27', libelle: 'U' }]), JSON.stringify(['L-1']), 'suite', 7, 'arno']);
  });
});

describe('🔴 ② appliquée par la fonction de « Modifier le rattachement », une seule fois', () => {
  const LIGNE = { id: '9', message_id: '9200', fil_id: '77', biens: [{ cle: 'L-2', libelle: 'B' }], retires: [], position: null, auteur_id: '7', auteur_libelle: 'arno' };
  const depsApp = () => {
    const poses: unknown[] = [];
    return {
      poses,
      d: {
        mailsDuFil: async () => [9100, 9200],
        suiviDuFil: async () => ({ exceptions: [], periodes: [{ id: 1, depuisMessageId: 9100, classement: { sorte: 'biens' as const, biens: [{ cle: 'L-1', libelle: 'A' }] } }] }),
        poserClassement: (async (o: unknown) => { poses.push(o); return { ok: true, projetes: 1, trace: null }; }) as never,
      },
    };
  };
  it('le mail capturé reçoit EXACTEMENT ce que la fenêtre écrirait (défaut : One shot, suivi de fond gardé)', async () => {
    reponses = [(sql) => (/WITH prets AS/.test(sql) ? { rows: [LIGNE] } : undefined),
      (sql) => (/SET applique_le = now\(\)/.test(sql) ? { rows: [{ id: '9' }] } : undefined)];
    const { d, poses } = depsApp();
    expect(await appliquerClassementsEnAttente(d)).toBe(1);
    expect(poses).toEqual([{
      filId: 77, messageId: 9200, choix: 'mail', auteur: { id: 7, libelle: 'arno' },
      classement: { sorte: 'biens', biens: [{ cle: 'L-1', libelle: 'A' }, { cle: 'L-2', libelle: 'B' }] },
    }]);
    const issue = requetes.find((r) => /SET issue/.test(r.sql));
    expect(issue?.params).toEqual([9, 'pose : mail']);
  });
  it('🔴 déjà réservée par une autre passe : rien n’est appliqué deux fois', async () => {
    reponses = [(sql) => (/WITH prets AS/.test(sql) ? { rows: [LIGNE] } : undefined)];
    const { d, poses } = depsApp();
    expect(await appliquerClassementsEnAttente(d)).toBe(0);
    expect(poses).toEqual([]);
  });
  it('« Origine » (aucun changement) : rien n’est écrit, et l’issue le dit', async () => {
    reponses = [(sql) => (/WITH prets AS/.test(sql) ? { rows: [{ ...LIGNE, biens: [{ cle: 'L-1', libelle: 'A' }] }] } : undefined),
      (sql) => (/SET applique_le = now\(\)/.test(sql) ? { rows: [{ id: '9' }] } : undefined)];
    const { d, poses } = depsApp();
    await appliquerClassementsEnAttente(d);
    expect(poses).toEqual([]);
    expect(requetes.find((r) => /SET issue/.test(r.sql))?.params).toEqual([9, 'origine : rien à écrire (origine)']);
  });
});
