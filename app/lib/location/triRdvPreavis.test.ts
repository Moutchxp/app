import { describe, expect, it } from 'vitest';
import { ALERTE_DU_RDV, alertesRdv, colonnesRdv, LIBELLE_ALERTE_RDV, LIBELLE_TRI_RDV, maintenantParis, MODE_TRI_RDV_DEFAUT, modeTriRdvSuivant, ordonnerParRdv, rdvDuStatut, type LigneRdv } from './triRdvPreavis';

/** 🔴🔴 Arno (15/11/2026) — le tri chronologique des rendez-vous de la liste des préavis. */
const MAINTENANT = '2026-11-15 18:00';
const pv = (statut: string, jour?: string, heure = '10:00') => ({ statut, rdv: jour ? { jour, heure } : null });
const L = (cle: string, l: LigneRdv) => ({ cle, ...l });

describe('le tri chronologique des rendez-vous', () => {
  it('le cycle : plus proches (défaut) → plus lointains → désactivé → plus proches ; les libellés', () => {
    expect(MODE_TRI_RDV_DEFAUT).toBe('proches');
    expect([modeTriRdvSuivant('proches'), modeTriRdvSuivant('lointains'), modeTriRdvSuivant('off')]).toEqual(['lointains', 'off', 'proches']);
    expect(Object.values(LIBELLE_TRI_RDV)).toEqual(['RDV : plus proches d’abord', 'RDV : plus lointains d’abord', 'Tri RDV désactivé']);
  });
  it('🔴🔴 (16/11/2026) le rendez-vous d’une ligne = celui de SON STATUT (« RDV pré-visite fixé » / « RDV état des lieux fixé ») ; pré-visite effectuée, refus, en préavis : aucun', () => {
    expect(rdvDuStatut({ previsite: pv('programmee', '2026-11-20') })).toEqual({ sorte: 'previsite', jour: '2026-11-20', heure: '10:00', quand: '2026-11-20 10:00' });
    expect(rdvDuStatut({ previsite: pv('effectuee', '2026-11-10'), edls: { jour: '2026-12-01', heure: '09:00:00' } })).toEqual({ sorte: 'edl', jour: '2026-12-01', heure: '09:00:00', quand: '2026-12-01 09:00' });
    expect(rdvDuStatut({ previsite: pv('refusee'), edls: { jour: '2026-12-01', heure: null } })!.quand).toBe('2026-12-01 00:00');
    expect(rdvDuStatut({ previsite: pv('effectuee', '2026-11-10') })).toBeNull(); // le cas MAGNANI : plus un rendez-vous fixé
    expect(rdvDuStatut({ previsite: pv('refusee', '2026-11-20') })).toBeNull();
    expect(rdvDuStatut({ previsite: pv('recu') })).toBeNull();
    expect(rdvDuStatut({ previsite: pv('alerte') })).toBeNull();
    expect(rdvDuStatut({ previsite: null, edls: null })).toBeNull();
  });
  it('🔴🔴 (16/11/2026) plus proches : les RDV fixés du plus ancien au plus lointain — un RDV DÉPASSÉ en tête — ; plus lointains : l’inverse ; SANS RDV (pré-visite effectuée comprise) par fin de préavis la plus proche ; aucune ligne perdue', () => {
    const lignes = [
      L('sans-recu', { previsite: pv('recu'), dateMax: '2026-12-20' }),
      L('magnani-effectuee', { previsite: pv('effectuee', '2026-11-14'), dateMax: '2026-12-05' }),
      L('edl-loin', { previsite: pv('effectuee', '2026-11-01'), edls: { jour: '2027-01-10', heure: '10:00' }, dateMax: '2027-01-10' }),
      L('refus', { previsite: pv('refusee'), dateMax: '2026-12-01' }),
      L('pv-proche', { previsite: pv('programmee', '2026-11-16'), dateMax: '2026-12-15' }),
      L('fayet-depassee', { previsite: pv('programmee', '2026-11-14'), dateMax: '2026-12-14' }),
      L('sans-date', { previsite: pv('recu') }),
    ];
    const p = ordonnerParRdv(lignes, 'proches');
    expect(p.avecRdv.map((x) => x.cle)).toEqual(['fayet-depassee', 'pv-proche', 'edl-loin']);
    expect(p.sansRdv.map((x) => x.cle)).toEqual(['refus', 'magnani-effectuee', 'sans-recu', 'sans-date']);
    const l = ordonnerParRdv(lignes, 'lointains');
    expect(l.avecRdv.map((x) => x.cle)).toEqual(['edl-loin', 'pv-proche', 'fayet-depassee']);
    expect(l.sansRdv.map((x) => x.cle)).toEqual(['refus', 'magnani-effectuee', 'sans-recu', 'sans-date']);
    for (const r of [p, l]) expect(new Set([...r.avecRdv, ...r.sansRdv].map((x) => x.cle))).toEqual(new Set(lignes.map((x) => x.cle)));
  });
  it('à égalité de date : l’ordre reçu', () => {
    const lignes = [L('a', { previsite: pv('programmee', '2026-11-20') }), L('b', { previsite: pv('programmee', '2026-11-20') }), L('c', { dateMax: '2026-12-01' }), L('d', { dateMax: '2026-12-01' })];
    expect(ordonnerParRdv(lignes, 'proches')).toEqual({ avecRdv: [lignes[0], lignes[1]], sansRdv: [lignes[2], lignes[3]] });
    expect(ordonnerParRdv(lignes, 'lointains').avecRdv).toEqual([lignes[0], lignes[1]]);
  });
  it('le moment présent, à Paris', () => {
    expect(maintenantParis(new Date('2026-11-15T17:05:00Z'))).toBe('2026-11-15 18:05');
  });
});

describe('🔴 (15/11/2026) la colonne « rendez-vous » du listing et la mémoire du tri', async () => {
  const { colonneRdv, jourCourt, lireModeTriRdv, ecrireModeTriRdv, AUCUN_RDV_FIXE } = await import('./triRdvPreavis');
  it('« Pré-visite · dim. 15/11 · 00h16 », « État des lieux · mer. 18/11 · 11h30 » : le rendez-vous du statut ; 🔴 (16/11) passé sans l’étape faite : la mention rouge', () => {
    expect(jourCourt('2026-11-15')).toBe('dim. 15/11'); // le 15/11/2026 est un dimanche
    expect(colonneRdv({ previsite: { statut: 'programmee', rdv: { jour: '2026-11-15', heure: '00:16' } } }, '2026-11-14 12:00'))
      .toEqual({ sorte: 'previsite', quand: '2026-11-15 00:16', texte: 'Pré-visite · dim. 15/11 · 00h16', depassee: null });
    expect(colonneRdv({ previsite: { statut: 'effectuee', rdv: { jour: '2026-11-15', heure: '00:16' } }, edls: { jour: '2026-11-18', heure: '11:30:00' } }, MAINTENANT))
      .toEqual({ sorte: 'edl', quand: '2026-11-18 11:30', texte: 'État des lieux · mer. 18/11 · 11h30', depassee: null });
    // le cas FAYET : pré-visite du 14/11 sans compte rendu
    expect(colonneRdv({ previsite: { statut: 'programmee', rdv: { jour: '2026-11-14', heure: '23:49' } } }, MAINTENANT))
      .toEqual({ sorte: 'previsite', quand: '2026-11-14 23:49', texte: 'Pré-visite · sam. 14/11 · 23h49', depassee: 'date dépassée — compte rendu à faire' });
    expect(colonneRdv({ previsite: { statut: 'effectuee', rdv: { jour: '2026-11-01', heure: '10:00' } }, edls: { jour: '2026-11-12', heure: '09:00' } }, MAINTENANT))
      .toMatchObject({ sorte: 'edl', depassee: 'date dépassée — sortie à valider' });
  });
  it('pré-visite effectuée sans état des lieux : « Pré-visite effectuée le 15/11 » ; rien : « — Aucun RDV fixé » ; un refus n’a pas de rendez-vous', () => {
    expect(colonneRdv({ previsite: { statut: 'effectuee', rdv: { jour: '2026-11-15', heure: '00:16' } } }, MAINTENANT)).toEqual({ sorte: 'effectuee', texte: 'Pré-visite effectuée le 15/11' });
    expect(colonneRdv({ previsite: { statut: 'recu' } }, MAINTENANT)).toEqual({ sorte: 'aucun', texte: AUCUN_RDV_FIXE });
    expect(colonneRdv({ previsite: { statut: 'refusee', rdv: { jour: '2026-11-20', heure: '10:00' } } }, MAINTENANT).sorte).toBe('aucun');
  });
  it('la mémoire du tri RDV est VERSIONNÉE : sans préférence, ou un format ancien / invalide → « plus proches d’abord »', () => {
    expect(lireModeTriRdv(null)).toBe('proches');
    expect(lireModeTriRdv('off')).toBe('proches'); // l'ancien format (texte nu) ne survit pas
    expect(lireModeTriRdv('{"v":1,"mode":"off"}')).toBe('proches');
    expect(lireModeTriRdv('{"v":2,"mode":"n-importe"}')).toBe('proches');
    expect(lireModeTriRdv('pas du json')).toBe('proches');
    expect(lireModeTriRdv(ecrireModeTriRdv('lointains'))).toBe('lointains');
    expect(lireModeTriRdv(ecrireModeTriRdv('off'))).toBe('off');
  });
});

describe('🔴 (15/11/2026) la mission du rendez-vous : « confié à Prénom NOM » et son état', async () => {
  const { missionDeLigne, prenomNom, LIBELLE_ETAT_MISSION } = await import('./triRdvPreavis');
  it('les libellés ; le nom en « Prénom NOM »', () => {
    expect(LIBELLE_ETAT_MISSION).toEqual({ attente: 'En attente de confirmation', confirme: 'Confirmé', refuse: 'Refusé — à réattribuer' });
    expect(prenomNom('Claire Test')).toBe('Claire TEST');
    expect(prenomNom('Jean-Paul de la Tour')).toBe('Jean-Paul DE LA TOUR');
    expect(prenomNom('a.jorel@sansvisavis.com')).toBe('a.jorel@sansvisavis.com');
  });
  it('état des lieux : en attente, confirmé (accepté ou confié directement), refusé', () => {
    const e = (statut: string | null) => ({ edls: { jour: '2099-01-01', heure: '10:00', confieA: 'Claire Test', statut } });
    expect(missionDeLigne(e('en_attente'), 'edl')).toEqual({ qui: 'Claire TEST', etat: 'attente' });
    expect(missionDeLigne(e('acceptee'), 'edl')).toEqual({ qui: 'Claire TEST', etat: 'confirme' });
    expect(missionDeLigne(e(null), 'edl')).toEqual({ qui: 'Claire TEST', etat: 'confirme' });
    expect(missionDeLigne(e('refusee'), 'edl')).toEqual({ qui: 'Claire TEST', etat: 'refuse' });
    expect(missionDeLigne({ edls: null }, 'edl')).toBeNull();
  });
  it('pré-visite : un collègue qui accepte = confirmé ; tous refusent = refusé ; sinon en attente ; personne = rien', () => {
    const p = (...c: [string, string | null][]) => ({ previsite: { statut: 'programmee', collegues: c.map(([libelle, statut]) => ({ libelle, statut })) } });
    expect(missionDeLigne(p(['Claire Test', 'en_attente'], ['Arno Test', 'acceptee']), 'previsite')).toEqual({ qui: 'Arno TEST', etat: 'confirme' });
    expect(missionDeLigne(p(['Claire Test', 'refusee'], ['Arno Test', 'refusee']), 'previsite')).toEqual({ qui: 'Claire TEST', etat: 'refuse' });
    expect(missionDeLigne(p(['Claire Test', 'refusee'], ['Arno Test', 'en_attente']), 'previsite')).toEqual({ qui: 'Arno TEST', etat: 'attente' });
    expect(missionDeLigne({ previsite: { statut: 'programmee', collegues: [] } }, 'previsite')).toBeNull();
  });
});

describe('🔴🔴 Arno (28/11/2026, 00h45) — pas de doublon de mention sur une ligne à deux rendez-vous', async () => {
  const { mentionsCommunes } = await import('./triRdvPreavis');
  const M = (qui: string, etat: 'confirme' | 'attente' | 'refuse') => ({ qui, etat });
  it('même personne ET même statut : une mention ; personne ou statut différent : deux ; un seul rendez-vous ou une mission absente : deux', () => {
    expect(mentionsCommunes([M('Claire TEST', 'confirme'), M('Claire TEST', 'confirme')], [null, null]).mission).toBe(true);
    expect(mentionsCommunes([M('Claire TEST', 'confirme'), M('Arno TEST', 'confirme')], [null, null]).mission).toBe(false);
    expect(mentionsCommunes([M('Claire TEST', 'confirme'), M('Claire TEST', 'attente')], [null, null]).mission).toBe(false);
    expect(mentionsCommunes([M('Claire TEST', 'confirme'), null], [null, null]).mission).toBe(false);
    expect(mentionsCommunes([M('Claire TEST', 'confirme')], [null]).mission).toBe(false);
  });
  it('« Locataires : … » : une pastille seulement si le MÊME mot est présent sur les deux rendez-vous', () => {
    expect(mentionsCommunes([null, null], ['Locataires : Confirmé', 'Locataires : Confirmé']).locataires).toBe(true);
    expect(mentionsCommunes([null, null], ['Locataires : Confirmé', 'Locataires : En attente']).locataires).toBe(false);
    expect(mentionsCommunes([null, null], [null, 'Locataires : Confirmé']).locataires).toBe(false);
  });
});

/* ══ 🔴🔴 Arno (28/11/2026, 01h04) — les alertes sous leur rendez-vous : 0, 1 ou 2 alertes (donc 1 à 4 cartouches avec les statuts) ══ */
describe('🔴 01h04 — alertesRdv : « Compte rendu pré-visite à faire » et « Sortie à valider », la règle de la mention « date dépassée »', () => {
  const MAINT = '2026-11-28 01:10';
  const e = (jour: string, heure = '10:00') => ({ jour, heure });
  it('aucun rendez-vous, ou des rendez-vous à venir : aucune alerte', () => {
    expect(alertesRdv({ previsite: pv('recu') }, MAINT)).toEqual([]);
    expect(alertesRdv({ previsite: pv('alerte') }, MAINT)).toEqual([]);
    expect(alertesRdv({ previsite: pv('programmee', '2026-11-29') }, MAINT)).toEqual([]);
    expect(alertesRdv({ previsite: pv('programmee', '2026-11-29'), edls: e('2026-12-04') }, MAINT)).toEqual([]);
  });
  it('la pré-visite passée, compte rendu pas fait : « Compte rendu pré-visite à faire » ; fait (effectuée) ou refusée : plus rien', () => {
    expect(alertesRdv({ previsite: pv('programmee', '2026-11-13', '23:40') }, MAINT)).toEqual(['compte_rendu']);
    expect(alertesRdv({ previsite: pv('effectuee', '2026-11-13', '23:40') }, MAINT)).toEqual([]);
    expect(alertesRdv({ previsite: pv('refusee', '2026-11-13', '23:40') }, MAINT)).toEqual([]);
    expect(LIBELLE_ALERTE_RDV.compte_rendu).toBe('Compte rendu pré-visite à faire');
  });
  it('l’état des lieux passé, sortie pas validée : « Sortie à valider » ; sortie validée : plus rien', () => {
    expect(alertesRdv({ previsite: pv('effectuee', '2026-11-10'), edls: e('2026-11-18', '11:30') }, MAINT)).toEqual(['sortie']);
    expect(alertesRdv({ previsite: pv('effectuee', '2026-11-10'), edls: e('2026-11-18', '11:30'), sortieValidee: true }, MAINT)).toEqual([]);
    expect(LIBELLE_ALERTE_RDV.sortie).toBe('Sortie à valider');
  });
  it('les deux passés : les deux alertes, pré-visite d’abord ; seule la pré-visite passée : une seule', () => {
    expect(alertesRdv({ previsite: pv('programmee', '2026-11-16', '09:53'), edls: e('2026-11-20') }, MAINT)).toEqual(['compte_rendu', 'sortie']);
    expect(alertesRdv({ previsite: pv('programmee', '2026-11-16', '09:53'), edls: e('2026-12-04') }, MAINT)).toEqual(['compte_rendu']);
  });
  it('même seuil que la mention rouge « date dépassée — … » (une seule source : rdvsDeLigne + rdvDepasse)', () => {
    for (const l of [{ previsite: pv('programmee', '2026-11-28', '01:09') }, { previsite: pv('programmee', '2026-11-28', '01:10') }, { previsite: pv('programmee', '2026-11-28', '01:11') },
      { previsite: pv('effectuee', '2026-11-01'), edls: e('2026-11-28', '01:09') }, { previsite: pv('effectuee', '2026-11-01'), edls: e('2026-11-28', '01:11') }] as LigneRdv[]) {
      const mentions = colonnesRdv(l, MAINT).filter((c) => 'depassee' in c && c.depassee !== null).map((c) => ALERTE_DU_RDV[c.sorte as 'previsite' | 'edl']);
      expect(alertesRdv(l, MAINT)).toEqual(mentions);
    }
  });
});

describe('🔴 01h07 — paireCommune : une paire (collaborateur + locataires) par rendez-vous ; une seule si tout est identique', async () => {
  const { paireCommune } = await import('./triRdvPreavis');
  const C = { qui: 'Arnaud JOREL', etat: 'confirme' as const };
  it('tout identique : une seule paire', () => {
    expect(paireCommune([C, { ...C }], ['Locataires : Confirmé', 'Locataires : Confirmé'])).toBe(true);
    expect(paireCommune([C, { ...C }], [null, null])).toBe(true);
    expect(paireCommune([null, null], ['Locataires : Confirmé', 'Locataires : Confirmé'])).toBe(true);
  });
  it('la mission identique mais pas les locataires (ou l’inverse) : une paire par rendez-vous', () => {
    expect(paireCommune([C, { ...C }], [null, 'Locataires : Confirmé'])).toBe(false);
    expect(paireCommune([C, { ...C }], ['Locataires : Confirmé', 'Locataires : En attente'])).toBe(false);
    expect(paireCommune([C, { ...C, etat: 'attente' }], ['Locataires : Confirmé', 'Locataires : Confirmé'])).toBe(false);
    expect(paireCommune([C, { qui: 'Claire TEST', etat: 'confirme' }], [null, null])).toBe(false);
  });
  it('rien à dire des deux côtés, ou un seul rendez-vous : pas de paire commune', () => {
    expect(paireCommune([null, null], [null, null])).toBe(false);
    expect(paireCommune([C], ['Locataires : Confirmé'])).toBe(false);
  });
});

describe('🔴 01h28 — grouperParRdv : « Sans rendez-vous fixé » d’abord, puis « Avec rendez-vous fixé » (le tri RDV dans le second)', async () => {
  const { grouperParRdv, TITRE_GROUPE_RDV } = await import('./triRdvPreavis');
  const LS = [
    L('proche', { previsite: pv('programmee', '2026-11-20') }),
    L('sans-tard', { previsite: pv('recu'), dateMax: '2027-01-15' }),
    L('loin', { previsite: pv('programmee', '2026-12-20') }),
    L('sans-tot', { previsite: pv('effectuee', '2026-11-01'), dateMax: '2026-12-01' }),
  ];
  it('les titres, l’ordre des groupes, l’ordre dans chacun', () => {
    expect(TITRE_GROUPE_RDV).toEqual({ sans: 'Sans rendez-vous fixé', avec: 'Avec rendez-vous fixé' });
    expect(grouperParRdv(LS, 'proches').map((g) => [g.groupe, g.lignes.map((x) => x.cle)])).toEqual([['sans', ['sans-tot', 'sans-tard']], ['avec', ['proche', 'loin']]]);
    expect(grouperParRdv(LS, 'lointains').map((g) => [g.groupe, g.lignes.map((x) => x.cle)])).toEqual([['sans', ['sans-tot', 'sans-tard']], ['avec', ['loin', 'proche']]]);
  });
  it('aucune ligne perdue ; un groupe peut être vide (son titre n’est pas affiché par l’écran)', () => {
    expect(grouperParRdv(LS, 'proches').flatMap((g) => g.lignes).length).toBe(4);
    expect(grouperParRdv([LS[0]], 'proches').map((g) => g.lignes.length)).toEqual([0, 1]);
  });
});

describe('🔴🔴 décision d’Arno (28/11/2026) — grouperParRdv, tri RDV désactivé : les deux groupes quand même, l’ordre reçu dans chacun', async () => {
  const { grouperParRdv } = await import('./triRdvPreavis');
  it('l’ordre reçu (celui du panneau), partagé en deux', () => {
    const LS = [L('a1', { previsite: pv('programmee', '2026-12-20') }), L('s1', { previsite: pv('recu') }), L('a2', { previsite: pv('programmee', '2026-11-20') }), L('s2', { previsite: pv('alerte') })];
    expect(grouperParRdv(LS, 'off').map((g) => [g.groupe, g.lignes.map((x) => x.cle)])).toEqual([['sans', ['s1', 's2']], ['avec', ['a1', 'a2']]]);
  });
});
