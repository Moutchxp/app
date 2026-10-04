import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ 🔴🔴 LOT FENETRES-INDEPENDANTES, POINT 1 — UNE FENÊTRE NE TOUCHE À AUCUNE AUTRE ═════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026), à appliquer à la lettre : « une conversation est découpée en fenêtres de
 * configuration, autant que l'on veut. Chaque fenêtre est TOTALEMENT indépendante des autres : ni la distribution
 * des mails aux biens, ni le statut (Classé / Interne / Hors gestion / À classer), ni les personnes d'une fenêtre
 * ne sont modifiés par la création ou la modification d'une autre fenêtre. Seule l'option “Toute la conversation”
 * est rétroactive (en épargnant les exceptions). »
 *
 * ═══ LE CAS QUI L'A FAIT ÉCRIRE, échange 36694 ══════════════════════════════════════════════════════════════════
 *
 *   · mail 1 (11:54, notre envoi) — « Interne », posé par l'envoi lui-même ;
 *   · mail 2 (11:55, reçu) — classé « ce mail et la conversation à venir » sur le lot 26 ;
 *   · RÉSULTAT : le mail 2 est « Classé », et le mail 1 est repassé « À classer ». Son statut a disparu.
 *
 * ═══ 🔴 CE QUE CE FICHIER TIENT, ET CE QU'IL NE TIENT PAS ENCORE ════════════════════════════════════════════════
 *
 * IL TIENT : aucune fenêtre ne RETIRE le statut d'un mail qu'elle ne couvre pas. C'est le défaut mesuré, et il est
 * fermé — la projection ne retire plus la marque « Interne » de l'échange parce qu'une fenêtre « biens » est
 * ouverte ailleurs.
 *
 * IL NE TIENT PAS ENCORE : « Interne du mail 1 au mail 4, puis plus ». La marque reste portée par l'ÉCHANGE
 * (`gestion_fil_interne.fil_id`) ; la borner demande une marque PAR MAIL, donc la migration 297 — livrée, NON
 * APPLIQUÉE, en attente de l'accord d'Arno. On ne feint pas de l'avoir : les épreuves disent ce qui est vrai.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const queryMock = vi.fn();
const qMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...a),
  withTransaction: async (f: (q: unknown) => Promise<unknown>) => f(qMock),
}));
vi.mock('./schema', () => ({
  periodesDisponibles: async () => true,
  rattachementsDisponibles: async () => true,
  interventionsDisponibles: async () => false,
  /* 🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 7 — la sonde de la migration 297. ⚠️ UNE FABRIQUE `vi.mock`
     QUI OUBLIE UN EXPORT NEUF FAIT TOMBER LE MODULE À L'APPEL, pas à l'import : le piège est déjà consigné
     plusieurs fois dans ce dépôt. Elle rend `false` : la table n'est alors nommée nulle part, et les
     épreuves de FORME du SQL écrites avant ce lot restent vraies à la lettre. */
  interneDuMessageDisponible: async () => false,
}));
const rattacher = vi.fn(async (_o: { messageId: number; cible: { cle: string } }) => ({ ok: true }));
const changerStatut = vi.fn(async (_o: { lienId: number; statut: string }) => ({ ok: true }));
vi.mock('./rattachementRepo', () => ({
  rattacher: (...a: unknown[]) => rattacher(...(a as [never])),
  changerStatut: (...a: unknown[]) => changerStatut(...(a as [never])),
}));
const marquerInterne = vi.fn(async (_o: { filIds: number[] }) => ({ ok: true, nb: 1 }));
const annulerInterne = vi.fn(async (_o: { filIds: number[] }) => ({ ok: true, nb: 1 }));
vi.mock('./interneRepo', () => ({
  marquerInterne: (...a: unknown[]) => marquerInterne(...(a as [never])),
  annulerInterne: (...a: unknown[]) => annulerInterne(...(a as [never])),
}));
const marquerHorsGestion = vi.fn(async (_o: { messageIds: number[] }) => ({ ok: true, nb: 1 }));
const annulerHorsGestion = vi.fn(async (_o: { messageIds: number[] }) => ({ ok: true, nb: 1 }));
vi.mock('./horsGestionRepo', () => ({
  marquerHorsGestion: (...a: unknown[]) => marquerHorsGestion(...(a as [never])),
  annulerHorsGestion: (...a: unknown[]) => annulerHorsGestion(...(a as [never])),
}));

import { projeterLeFil } from './periodeRepo';
import { capsuleDuMessage } from './statutClassement';

const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const LOT_26 = { cle: 'lot:26', libelle: 'Lot 26 — 7 avenue de l’Union' };
const LOT_A = { cle: 'lot:A', libelle: 'Lot A' };
const LOT_B = { cle: 'lot:B', libelle: 'Lot B' };

/** La conversation telle que la base la rendra : ses mails, ses fenêtres, ses liens déjà posés. */
const base = {
  mails: [] as number[],
  periodes: [] as { id: string; depuis: number; sorte: string; biens: { cle: string; libelle: string }[] | null }[],
  liens: [] as { id: string; message_id: string; cible_cle: string; par_le_suivi: boolean }[],
};

beforeEach(() => {
  base.mails = []; base.periodes = []; base.liens = [];
  rattacher.mockClear(); changerStatut.mockClear();
  marquerInterne.mockClear(); annulerInterne.mockClear();
  marquerHorsGestion.mockClear(); annulerHorsGestion.mockClear();
  queryMock.mockReset();
  /* ⚠️ LE MÊME DOUBLE QUE `periodeRepo.test.ts`, dans la même forme : les colonnes `biens` arrivent en OBJETS
     (pg décode le `jsonb`), jamais en texte. Un double qui rendrait du JSON ferait échouer la projection sur un
     `.map` — et l'on chercherait le défaut dans le code plutôt que dans le double. */
  queryMock.mockImplementation(async (sql: string) => {
    const s = String(sql).replace(/\s+/g, ' ');
    if (s.includes('FROM gestion_message WHERE fil_id')) {
      return { rows: base.mails.map((id) => ({ id: String(id) })) };
    }
    if (s.includes('FROM gestion_fil_periode p')) {
      return {
        rows: base.periodes.map((p) => ({
          id: p.id, depuis_message_id: String(p.depuis), sorte: p.sorte,
          cree_par_libelle: AUTEUR.libelle, cree_le: '2026-10-03T09:00:00Z', biens: p.biens,
        })),
      };
    }
    if (s.includes('FROM gestion_message_exception e')) return { rows: [] };
    if (s.includes('SELECT id::text, message_id::text, cible_cle')) return { rows: base.liens };
    return { rows: [{ id: '990' }] };
  });
});

/** Le statut que l'écran affichera pour ce mail, d'après ses liens et les marques de son échange. */
const statut = (biens: string[], interne = false, horsGestion = false) =>
  capsuleDuMessage(
    biens.map((cle) => ({ cible: { sorte: 'lot', cle }, statut: 'confirme', origine: 'manuel', parUnHumain: true })),
    horsGestion, interne,
  );

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LE CAS D'ARNO, REJOUÉ
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① Interne au mail 1, puis biens à venir au mail 2', () => {
  it('🔴🔴 la fenêtre « biens » du mail 2 NE RETIRE PAS la marque « Interne »', async () => {
    base.mails = [1, 2];
    base.periodes = [{ id: 'p1', depuis: 2, sorte: 'biens', biens: [LOT_26] }];
    await projeterLeFil(36694, AUTEUR);
    expect(annulerInterne).not.toHaveBeenCalled();
  });

  /** 🔴 ET LE MAIL 1 N'EST TOUCHÉ PAR RIEN : il est antérieur à toute fenêtre. */
  it('🔴 aucun lien n’est posé ni retiré sur le mail 1', async () => {
    base.mails = [1, 2];
    base.periodes = [{ id: 'p1', depuis: 2, sorte: 'biens', biens: [LOT_26] }];
    await projeterLeFil(36694, AUTEUR);
    expect(rattacher).toHaveBeenCalledTimes(1);
    expect(rattacher).toHaveBeenCalledWith(expect.objectContaining({ messageId: 2 }));
    expect(changerStatut).not.toHaveBeenCalled();
    expect(annulerHorsGestion).not.toHaveBeenCalledWith(expect.objectContaining({ messageIds: [1] }));
  });

  /**
   * 🔴🔴 ET VOILÀ CE QUE L'ÉCRAN MONTRE ALORS, mail par mail — c'est la phrase d'Arno rendue en capsules :
   * « le mail 1 reste Interne, le mail 2 est Classé ».
   */
  it('🔴🔴 mail 1 « Interne », mail 2 « Classé »', () => {
    expect(statut([], true)).toBe('interne');
    expect(statut(['lot:26'], true)).toBe('classe');
  });
});

describe('🔴🔴 ② la même chose avec « Hors gestion »', () => {
  /**
   * 🔴 « HORS GESTION » PORTE DÉJÀ SUR LE MAIL (migration 266) : la projection ne touche QUE les mails qu'une
   * fenêtre couvre, et un mail antérieur est épargné. C'était déjà juste, et ce test le scelle.
   */
  it('🔴🔴 un mail antérieur à la fenêtre ne perd pas son « Hors gestion »', async () => {
    base.mails = [1, 2];
    base.periodes = [{ id: 'p1', depuis: 2, sorte: 'biens', biens: [LOT_26] }];
    await projeterLeFil(36694, AUTEUR);
    const touches = annulerHorsGestion.mock.calls
      .flatMap((c) => c[0].messageIds);
    expect(touches).not.toContain(1);
    expect(touches).toContain(2);
  });

  it('🔴 une fenêtre « hors gestion » marque ses mails, et eux seuls', async () => {
    base.mails = [1, 2, 3];
    base.periodes = [{ id: 'p1', depuis: 2, sorte: 'hors_gestion', biens: null }];
    await projeterLeFil(36694, AUTEUR);
    const marques = marquerHorsGestion.mock.calls
      .flatMap((c) => c[0].messageIds);
    expect(marques.sort()).toEqual([2, 3]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ QUATRE FENÊTRES SUCCESSIVES DE NATURES DIFFÉRENTES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ Interne → lot A → Hors gestion → lot B, chacune intacte', () => {
  const QUATRE = [
    { id: 'p1', depuis: 1, sorte: 'interne', biens: null },
    { id: 'p2', depuis: 2, sorte: 'biens', biens: [LOT_A] },
    { id: 'p3', depuis: 3, sorte: 'hors_gestion', biens: null },
    { id: 'p4', depuis: 4, sorte: 'biens', biens: [LOT_B] },
  ];

  it('🔴🔴 chaque mail reçoit le bien de SA fenêtre, et d’aucune autre', async () => {
    base.mails = [1, 2, 3, 4];
    base.periodes = QUATRE;
    await projeterLeFil(36694, AUTEUR);
    const poses = rattacher.mock.calls.map((c) => `${c[0].messageId}:${c[0].cible.cle}`);
    expect(poses.sort()).toEqual(['2:lot:A', '4:lot:B']);
  });

  it('🔴🔴 seul le mail de la fenêtre « hors gestion » est marqué', async () => {
    base.mails = [1, 2, 3, 4];
    base.periodes = QUATRE;
    await projeterLeFil(36694, AUTEUR);
    const marques = marquerHorsGestion.mock.calls
      .flatMap((c) => c[0].messageIds);
    expect(marques).toEqual([3]);
  });

  /**
   * 🔴🔴 ET LA FENÊTRE « INTERNE » DU MAIL 1 N'EST PAS DÉFAITE PAR LES TROIS SUIVANTES. Avant ce lot, la dernière
   * fenêtre décidait pour tout l'échange : « lot B » au mail 4 retirait « Interne » au mail 1.
   */
  it('🔴🔴 la fenêtre « Interne » du mail 1 n’est défaite par aucune des trois suivantes', async () => {
    base.mails = [1, 2, 3, 4];
    base.periodes = QUATRE;
    await projeterLeFil(36694, AUTEUR);
    expect(annulerInterne).not.toHaveBeenCalled();
  });

  /** ⚠️ ET L'ORDRE DES FENÊTRES NE CHANGE RIEN : une fenêtre « interne » posée en DERNIER pose bien la marque. */
  it('⚠️ une fenêtre « interne » en dernier pose la marque', async () => {
    base.mails = [1, 2];
    base.periodes = [
      { id: 'p1', depuis: 1, sorte: 'biens', biens: [LOT_A] },
      { id: 'p2', depuis: 2, sorte: 'interne', biens: null },
    ];
    await projeterLeFil(36694, AUTEUR);
    expect(marquerInterne).toHaveBeenCalledWith(expect.objectContaining({ filIds: [36694] }));
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ CE QUI RESTE RÉTROACTIF, ET C'EST VOULU
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ④ « Toute la conversation » reste le seul geste rétroactif', () => {
  /**
   * 🔴 ARNO : « Seule l'option “Toute la conversation” est rétroactive ». Elle s'écrit comme une fenêtre ouverte
   * au PREMIER mail : elle couvre donc tout, et c'est par là qu'elle agit — pas par une exception à la règle.
   */
  it('🔴 une fenêtre ouverte au premier mail couvre toute la conversation', async () => {
    base.mails = [1, 2, 3];
    base.periodes = [{ id: 'p1', depuis: 1, sorte: 'biens', biens: [LOT_26] }];
    await projeterLeFil(36694, AUTEUR);
    const poses = rattacher.mock.calls.map((c) => c[0].messageId);
    expect(poses.sort()).toEqual([1, 2, 3]);
  });

  /**
   * 🔴🔴 ET ELLE SEULE REMPLACE CE QU'UNE PERSONNE A POSÉ À LA MAIN. Une fenêtre ordinaire ne retire que les
   * liens qu'elle a elle-même posés — c'est le garde du lot PREUVE-SUIVI-CONVERSATION, et il ne bouge pas.
   */
  it('🔴🔴 un lien posé à la main survit à une fenêtre ordinaire', async () => {
    base.mails = [1];
    base.periodes = [{ id: 'p1', depuis: 1, sorte: 'biens', biens: [LOT_26] }];
    base.liens = [{ id: '900', message_id: '1', cible_cle: 'lot:999', par_le_suivi: false }];
    await projeterLeFil(36694, AUTEUR);
    expect(changerStatut).not.toHaveBeenCalled();
  });

  it('🔴 « Toute la conversation » le remplace, et c’est le seul geste qui l’autorise', async () => {
    base.mails = [1];
    base.periodes = [{ id: 'p1', depuis: 1, sorte: 'biens', biens: [LOT_26] }];
    base.liens = [{ id: '900', message_id: '1', cible_cle: 'lot:999', par_le_suivi: false }];
    await projeterLeFil(36694, AUTEUR, { remplacerLesLiensManuels: true });
    expect(changerStatut).toHaveBeenCalledWith(expect.objectContaining({ lienId: 900, statut: 'retire' }));
  });
});
