// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EncartRattachement } from './EncartRattachement';
import { BIEN_UNIQUEMENT, TITRE_ETAPE2 } from '../../../../lib/gestion/contactExterne';
import {
  AUCUN_BIEN_SUIVI, BULLE_ORIGINE_PREMIER, MOT_VALIDER_MODIFICATION,
} from '../../../../lib/gestion/porteeSuivi';

/**
 * ══ 🔴🔴 LOT UNE-SEULE-FENETRE-DE-RATTACHEMENT — L'ÉTAPE 1 EST DÉSORMAIS LA FENÊTRE COMMUNE ══════════════════════════
 *
 * « Rattacher à un logement » ouvre la fenêtre « Bien(s) rattaché(s) à ce mail » (celle de « Modifier le
 * rattachement ») ; sa validation est confiée à l'encart, qui garde TOUT son chemin : étape 2, marque « Interne »,
 * route du suivi. Ces épreuves rejouent le câblage d'avant sur la fenêtre commune : on coche le bien dans ses
 * propositions (elle ne pré-coche rien, règle d'Arno), on choisit la portée sur la glissière, on valide par son
 * bouton final. Les trois choix ronds d'avant sont remplacés par la glissière (⑦ ⑧).
 *
 * ══ 🔴🔴 LOT CONTACTS-EXTERNES — LE CÂBLAGE : ÉTAPE 1 → ÉTAPE 2 → ÉCRITURE ════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 C'EST LE TEST DE LA RÈGLE N° 1 — NE RIEN CASSER. Il prouve, sur le vrai encart monté, que :
 *
 *   ① expéditeur CONNU ⇒ la modale se ferme et le classement part, par la porte qui existait déjà
 *      (`POST /api/admin/gestion/suivi`) — aucune étape 2, aucun appel de plus ;
 *   ② expéditeur INCONNU ⇒ l'étape 2 s'ouvre, et RIEN n'est encore écrit ;
 *   ③ « ← Retour » rouvre l'étape 1 AVEC SES CASES COCHÉES, et n'écrit toujours rien ;
 *   ④ valider l'étape 2 ⇒ le contact est mémorisé, PUIS le classement part — bien ET personnes, dans le MÊME
 *      `classement` de la MÊME route. Jamais une seconde porte d'écriture ;
 *   ⑤ une lecture en échec NE BLOQUE RIEN : le bien se classe comme avant, et le compte rendu le dit.
 *
 * ⚠️ ON ÉPROUVE LE CHEMIN RÉEL, pas une propriété : le verdict « faut-il l'étape 2 ? » vient de la RÉPONSE du
 * serveur. C'est la leçon du correctif du 28/09/2026 (un test qui passait une propriété prouvait le composant et
 * pas le câblage, et l'application annonçait « migration à appliquer » sur une base à jour).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let appels: { url: string; methode: string; corps: Record<string, unknown> | null }[];
let gestes: string[];
/** Ce que la route de l'étape 2 répond. `null` = la lecture ÉCHOUE (cas ⑤). */
let etape2: Record<string, unknown> | null;
/** Ce que le moteur propose. Piloté par le test : un seul bien d'ordinaire, deux pour le scénario ③-bis. */
let propositions: Record<string, unknown>[];
/**
 * 🔴 CE QUE LA ROUTE DU SUIVI RÉPOND (migration 290). Par défaut une conversation JAMAIS classée — c'est l'état
 * du fil 193 d'Arno, et celui qui n'affiche aucun bloc. Les épreuves ⑦ la posent déjà classée.
 */
let suiviDuFil: {
  periodes: unknown[]; exceptions: unknown[]; mails: number[];
  /** 🔴 LOT SUIVI-CONVERSATION-NON-RATTACHEE — les deux faits de la règle ② d'Arno. */
  rattachee?: boolean; expediteurConnu?: boolean;
};

const LOT = '442';
const OCCUPANT = 'thai cecile#c.thai@orange.fr';

/** Un bien proposé par le moteur, coché d'avance : c'est l'état ordinaire d'un mail d'un locataire. */
const PROPOSE = {
  cle: LOT, libelle: '22 Bd Richard Wallace, PUTEAUX — lot 442',
  adresse: '22 Bd Richard Wallace', commune: 'PUTEAUX', typeBien: 'Type 2', nature: 'Appartement',
  caracteristiques: [], adresseComplete: '22 Bd Richard Wallace, 92800 PUTEAUX',
  parties: [], recommande: true, motif: 'locataire de ce bien', cas: 'a',
  certitude: 'quasi_certaine', replie: false, dejaRattache: false,
};

/** La réponse « l'étape 2 est demandée » — celle d'un avocat inconnu sur ce bien. */
const ETAPE2_DEMANDEE = {
  messageId: 900, filId: 101, dateMail: '2026-03-10',
  expediteur: 'avocat@cabinet.test', expediteurNom: 'Cabinet Martin',
  requise: true, motif: null,
  biens: [{
    cle: LOT, adresseComplete: '22 Bd Richard Wallace, 92800 PUTEAUX',
    nature: 'Appartement', typeBien: 'Type 2',
    personnes: [{
      sorte: 'locataire', cle: OCCUPANT, id: 12, nom: 'THAI Cécile', civilite: 'Mme',
      role: 'locataire_occupant', entree: '2024-02-01', sortie: null,
    }],
  }],
  contact: null, premierClassement: true, precoche: null, disponible: true,
  // 🔴 LOT URGENT-VERIF-SUIVI-ET-76-BIENS — la liste des types vient du serveur ; celle d'une base
  //   sans la migration 294 (les huit d'origine, et pas de « Personnaliser… »).
  typesProposes: ['avocat', 'garant', 'artisan', 'syndic', 'expert', 'assurance', 'notaire', 'autre'],
  typeLibre: false,
};

/** 🔴 LOT UNE-SEULE-FENETRE-DE-RATTACHEMENT — le bien déjà rattaché, tel que la fiche le rend (`monterAvecLien`). */
const BIEN_FICHE = {
  cle: LOT, lotId: 442, adresseComplete: '22 Bd Richard Wallace, 92800 PUTEAUX', numeroLot: '442',
  nature: 'Appartement', typeBien: 'Type 2', surfaceM2: null, statut: 'classe', dateMail: '2026-03-10', nbMails: 1,
  dossierDriveId: null, lienIds: [1], personnes: [],
};
const LIEN_CONFIRME = {
  id: 1, messageId: 900, pieceId: null, cible: { sorte: 'lot', cle: LOT, id: null },
  libelle: PROPOSE.libelle, origine: 'manuel', statut: 'confirme',
  bien: { adresse: '22 Bd Richard Wallace', commune: 'PUTEAUX', nature: 'Appartement', typeBien: 'Type 2', immeuble: null },
  confiance: null, regle: 'a', motif: null, adresses: [], parUnHumain: true,
  creeLe: null, creePar: null, statutLe: null, statutPar: null, categorie: null,
};
let liensDuFil: unknown[] = [];
const ficheDuFil = () => ({
  filId: 101, objet: 'Retenue sur dépôt de garantie', nbMailsDuFil: 2, horsGestion: false, messageRecentId: 900,
  enTete: { messageId: 900, de: 'avocat@cabinet.test', deNom: 'Cabinet Martin', recuLe: '2026-03-10T10:00:00Z',
    objet: 'Retenue sur dépôt de garantie' },
  disponible: true,
  biens: liensDuFil.length > 0 ? [BIEN_FICHE] : [],
});

beforeEach(() => {
  liensDuFil = [];
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = []; gestes = []; propositions = [PROPOSE];
  suiviDuFil = { periodes: [], exceptions: [], mails: [900] };
  etape2 = { ...ETAPE2_DEMANDEE, requise: false, motif: 'expediteur_connu', biens: [] };

  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const methode = init?.method ?? 'GET';
    appels.push({
      url: u, methode, corps: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });
    // 🔴 LA ROUTE DE L'ÉTAPE 2 : c'est ELLE qui décide, et le test la pilote.
    if (u.includes('/gestion/contact-externe')) {
      if (methode === 'POST') return { ok: true, json: async () => ({ ok: true, id: 77 }) } as unknown as Response;
      return {
        ok: true,
        json: async () => (etape2 === null
          ? { etat: 'erreur', message: 'Lecture impossible.' }
          : { etat: 'ok', data: etape2 }),
      } as unknown as Response;
    }
    // 🔴 LA PORTE D'ÉCRITURE, CELLE QUI EXISTAIT DÉJÀ.
    if (u.includes('/gestion/suivi')) {
      if (methode === 'POST') {
        return { ok: true, json: async () => ({ ok: true, projetes: 1 }) } as unknown as Response;
      }
      // Les périodes de la conversation : c'est d'elles que dépend l'apparition du bloc à 3 choix.
      return {
        ok: true,
        json: async () => ({ etat: 'ok', ...suiviDuFil }),
      } as unknown as Response;
    }
    /* 🔴 LOT UNE-SEULE-FENETRE-DE-RATTACHEMENT — la fiche et les liens que lit la fenêtre commune. */
    if (u.includes('/rattachements?fiche=')) {
      return { ok: true, json: async () => ({ etat: 'ok', data: ficheDuFil() }) } as unknown as Response;
    }
    if (u.includes('/rattachements?fil=')) {
      return { ok: true, json: async () => ({ etat: 'ok', data: liensDuFil }) } as unknown as Response;
    }
    if (u.includes('/classement?message=')) {
      return {
        ok: true,
        json: async () => ({ etat: 'ok', contexte: { disponible: true, biens: propositions } }),
      } as unknown as Response;
    }
    if (u.includes('/affectation')) {
      return { ok: true, json: async () => ({ etat: 'ok', evenement: null, qualifie: true }) } as unknown as Response;
    }
    if (u.includes('lotCle=')) {
      return { ok: true, json: async () => ({ etat: 'ok', data: null }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({ etat: 'ok', data: [] }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };

const monter = async () => {
  await act(async () => {
    root.render(createElement(EncartRattachement, {
      messageId: 900, filId: 101, liens: [], interne: false, horsGestion: false,
      onChange: () => {}, onGeste: (m: string) => { gestes.push(m); },
    } as never));
  });
  await calmer();
};

/**
 * 🔴 LE MÊME ENCART, MAIS AVEC UN BIEN DÉJÀ RATTACHÉ. C'est lui la RÉFÉRENCE du bloc à 3 choix : sans lien
 * confirmé, la sélection ne peut pas « différer du rattachement validé ».
 */
const monterAvecLien = async () => {
  liensDuFil = [LIEN_CONFIRME];
  await act(async () => {
    root.render(createElement(EncartRattachement, {
      messageId: 900, filId: 101, interne: false, horsGestion: false,
      liens: [{
        id: 1, messageId: 900, pieceId: null, cible: { sorte: 'lot', cle: LOT, id: null },
        libelle: PROPOSE.libelle, origine: 'manuel', statut: 'confirme',
        bien: { adresse: '22 Bd Richard Wallace', commune: 'PUTEAUX', nature: 'Appartement', typeBien: 'Type 2', immeuble: null },
        confiance: null, regle: 'a', motif: null, adresses: [], parUnHumain: true,
        creeLe: null, creePar: null, statutLe: null, statutPar: null, categorie: null,
      }],
      onChange: () => {}, onGeste: (m: string) => { gestes.push(m); },
    } as never));
  });
  await calmer();
};

const texte = (): string => container.textContent ?? '';
/* ⚠️ La fenêtre commune reste montée (cachée) pendant l'étape 2 : on ne vise que ce qui est VISIBLE. */
const visible = (e: Element): boolean => e.closest('[hidden]') === null;
const boutons = (): HTMLButtonElement[] => [...container.querySelectorAll('button')].filter(visible);
const bouton = (mot: string): HTMLButtonElement | undefined =>
  boutons().find((b) => (b.textContent ?? '').includes(mot));
const cliquer = async (mot: string) => {
  const b = bouton(mot);
  if (b === undefined) throw new Error(`aucun bouton « ${mot} » — écran : ${texte().slice(0, 400)}`);
  await act(async () => { b.click(); });
  await calmer();
};
const caseDe = (nom: string): HTMLInputElement => {
  const label = [...container.querySelectorAll('label')].filter(visible).find((l) => (l.textContent ?? '').includes(nom));
  const c = label?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (c === null || c === undefined) throw new Error(`aucune case pour « ${nom} »`);
  return c;
};
/**
 * ⚠️ LA CASE DU BIEN SE CHERCHE PAR SON ADRESSE, PAS PAR SON LIBELLÉ FIGÉ. La modale affiche le TITRE recalculé
 * (« adresse — Nature · Type », lot MODALE-RATTACHER-PROPRE), d'où le numéro de lot a été retiré : chercher
 * « — lot 442 » ne trouverait rien. C'est précisément ce que ce lot-là a changé, et le test s'y conforme.
 */
const caseDuBien = (): HTMLInputElement => caseDe('22 Bd Richard Wallace');
/**
 * 🔴 LOT UNE-SEULE-FENETRE-DE-RATTACHEMENT — L'ÉTAPE 1 EST LA FENÊTRE COMMUNE, ouverte ET visible : pendant l'étape 2 elle
 * est CACHÉE (`hidden`), pas fermée — c'est ce qui garde ses cases pour « ← Retour ».
 */
const etape1Ouverte = (): boolean => {
  const t = container.querySelector('#rdf-titre');
  return t !== null && t.closest('[hidden]') === null;
};
const etape2Ouverte = (): boolean => texte().includes(TITRE_ETAPE2);
const ecritures = () => appels.filter((a) => a.methode === 'POST' && a.url.includes('/gestion/suivi'));
/** Une position de la glissière, par son libellé (boutons radio du groupe). */
const position = (mot: string): HTMLElement => {
  const r = [...container.querySelectorAll<HTMLElement>('[role="radio"]')].find((e) => (e.textContent ?? '').includes(mot));
  if (r === undefined) throw new Error(`aucune position « ${mot} »`);
  return r;
};
const positionChoisie = (): string =>
  container.querySelector('[role="radio"][aria-checked="true"]')?.textContent ?? '';

/** Ouvre la fenêtre commune, coche le bien proposé et valide par le bouton final. */
const validerLeBien = async () => {
  await cliquer('Rattacher');
  expect(etape1Ouverte()).toBe(true);
  await act(async () => { caseDuBien().click(); });
  await calmer();
  /* 🔴 LOT BOUTON-DE-VALIDATION-DU-PREMIER-RATTACHEMENT — au premier rattachement, le bouton dit la portée. */
  await cliquer('Valider le rattachement');
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ① EXPÉDITEUR CONNU — RIEN DE NOUVEAU, AU GESTE PRÈS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① expéditeur connu : le comportement actuel, sans une différence', () => {
  it('🔴🔴 aucune étape 2, et le classement part par la route du suivi', async () => {
    await monter();
    await validerLeBien();
    expect(etape2Ouverte()).toBe(false);
    expect(etape1Ouverte()).toBe(false);
    expect(ecritures()).toHaveLength(1);
    const corps = ecritures()[0].corps as { classement: Record<string, unknown> };
    expect(corps.classement.biens).toEqual([{ cle: LOT, libelle: PROPOSE.libelle }]);
    // 🔴🔴 ET AUCUN CHAMP `personnes` : le classement est BYTE-IDENTIQUE à celui d'avant ce lot.
    expect(Object.keys(corps.classement)).toEqual(['sorte', 'biens']);
  });

  it('🔴 le compte rendu est celui d’avant : aucune mention ajoutée', async () => {
    await monter();
    await validerLeBien();
    expect(gestes).toHaveLength(1);
    expect(gestes[0]).not.toContain('non vérifié');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ② EXPÉDITEUR INCONNU — L'ÉTAPE 2 S'OUVRE, ET RIEN N'EST ÉCRIT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② expéditeur inconnu : l’étape 2 s’ouvre, et rien n’est encore écrit', () => {
  beforeEach(() => { etape2 = { ...ETAPE2_DEMANDEE }; });

  it('🔴🔴 l’étape 2 remplace l’étape 1, et AUCUNE écriture n’a eu lieu', async () => {
    await monter();
    await validerLeBien();
    expect(etape2Ouverte()).toBe(true);
    expect(etape1Ouverte()).toBe(false);
    expect(ecritures()).toHaveLength(0);
    // Les personnes du bien sont là, avec le mot d'Arno.
    expect(texte()).toContain('THAI Cécile');
    expect(texte()).toContain('Locataire occupant');
  });

  it('🔴 la question est posée AVEC les biens cochés (c’est d’eux que dépend la réponse)', async () => {
    await monter();
    await validerLeBien();
    const lecture = appels.find((a) => a.url.includes('/gestion/contact-externe') && a.methode === 'GET');
    expect(lecture?.url).toContain(`biens=${LOT}`);
    expect(lecture?.url).toContain('message=900');
  });

  it('🔴🔴 ③ « ← Retour » rouvre l’étape 1 AVEC SA CASE COCHÉE, et n’écrit rien', async () => {
    await monter();
    await validerLeBien();
    await cliquer('← Retour');
    expect(etape2Ouverte()).toBe(false);
    expect(etape1Ouverte()).toBe(true);
    // 🔴 LA CASE DU BIEN EST TOUJOURS COCHÉE : c'est la demande d'Arno, mot pour mot.
    expect(caseDuBien().checked).toBe(true);
    expect(ecritures()).toHaveLength(0);
  });

  it('🔴🔴 ③-bis « ← Retour » NE RECOCHE PAS CE QU’ON AVAIT DÉCOCHÉ, et garde la portée choisie', async () => {
    /**
     * 🔴 « Garde les cases cochées » (Arno) VEUT DIRE LES DEUX SENS — défaut vu à l'écran le 02/10/2026 (mail 57329).
     * La fenêtre commune est CACHÉE pendant l'étape 2, pas démontée : tout revient tel quel, la glissière comprise.
     */
    propositions = [PROPOSE, { ...PROPOSE, cle: '443', libelle: '8 rue des Pavillons, PUTEAUX — lot 443',
      adresse: '8 rue des Pavillons', adresseComplete: '8 rue des Pavillons, 92800 PUTEAUX' }];
    await monter();
    await cliquer('Rattacher');
    await act(async () => { caseDuBien().click(); });
    await calmer();
    await act(async () => { position('One shot').click(); });
    await calmer();
    await cliquer('Valider le rattachement one shot');
    expect(etape2Ouverte()).toBe(true);

    await cliquer('← Retour');
    expect(caseDe('8 rue des Pavillons').checked).toBe(false);
    expect(caseDuBien().checked).toBe(true);
    expect(positionChoisie()).toContain('One shot');
  });

  it('🔴🔴 ④ valider l’étape 2 : le contact d’abord, le classement ENSUITE, par la MÊME route', async () => {
    await monter();
    await validerLeBien();
    await act(async () => { caseDe('THAI Cécile').click(); });
    await calmer();
    await cliquer('Valider');

    // ① LE CONTACT EXTERNE EST MÉMORISÉ, avec son adresse et le nom pré-rempli du mail.
    const contact = appels.find((a) => a.url.includes('/gestion/contact-externe') && a.methode === 'POST');
    expect(contact).toBeDefined();
    expect((contact?.corps as { email: string }).email).toBe('avocat@cabinet.test');

    // ② PUIS LE CLASSEMENT, par la porte existante, avec le bien ET la personne.
    expect(ecritures()).toHaveLength(1);
    const corps = ecritures()[0].corps as {
      classement: { biens: unknown[]; personnes: { sorte: string; cle: string; contactExterneId: number }[] };
      choix: string;
    };
    expect(corps.classement.biens).toEqual([{ cle: LOT, libelle: PROPOSE.libelle }]);
    expect(corps.classement.personnes).toEqual([
      { sorte: 'locataire', cle: OCCUPANT, libelle: 'THAI Cécile', contactExterneId: 77 },
    ]);
    // 🔴 « Suivi automatique » (le défaut) → le choix `suite` du mécanisme existant.
    expect(corps.choix).toBe('suite');
    // 🔴🔴 ET L'ORDRE EST CELUI-LÀ : le contact AVANT le classement, sans quoi le lien n'aurait pas son « via ».
    expect(appels.indexOf(contact as (typeof appels)[number]))
      .toBeLessThan(appels.indexOf(ecritures()[0]));
  });

  it('🔴 « Classement ponctuel » envoie le choix `mail` — une exception, rien d’hérité', async () => {
    await monter();
    await validerLeBien();
    const radios = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].filter(visible);
    await act(async () => { radios[1].click(); });
    await act(async () => { caseDe('THAI Cécile').click(); });
    await calmer();
    await cliquer('Valider');
    expect((ecritures()[0].corps as { choix: string }).choix).toBe('mail');
  });

  it('🔴🔴 la glissière TOUCHÉE l’emporte sur le choix de l’étape 2 (préséance d’avant : le bloc touché arbitre)', async () => {
    await monter();
    await cliquer('Rattacher');
    await act(async () => { caseDuBien().click(); });
    await calmer();
    await act(async () => { position('One shot').click(); });
    await calmer();
    await cliquer('Valider le rattachement one shot');
    await act(async () => { caseDe('THAI Cécile').click(); });
    await calmer();
    await cliquer('Valider');
    // L'étape 2 laissée sur « Suivi automatique » : c'est la glissière, touchée, qui décide.
    expect((ecritures()[0].corps as { choix: string }).choix).toBe('mail');
  });

  it('🔴 « Le bien uniquement » : le bien est classé, et AUCUNE personne n’est envoyée', async () => {
    await monter();
    await validerLeBien();
    await act(async () => { caseDe(BIEN_UNIQUEMENT).click(); });
    await calmer();
    await cliquer('Valider');
    const corps = ecritures()[0].corps as { classement: Record<string, unknown> };
    expect(corps.classement.biens).toHaveLength(1);
    // ⚠️ AUCUN CHAMP `personnes` DU TOUT : « aucune relation vers une personne » (Arno).
    expect(Object.keys(corps.classement)).toEqual(['sorte', 'biens']);
  });

  it('🔴 l’étape 2 se ferme après la validation, et la fenêtre commune avec elle', async () => {
    await monter();
    await validerLeBien();
    await act(async () => { caseDe(BIEN_UNIQUEMENT).click(); });
    await calmer();
    await cliquer('Valider');
    expect(etape2Ouverte()).toBe(false);
    expect(etape1Ouverte()).toBe(false);
    expect(container.querySelector('#rdf-titre')).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ⑤ UNE LECTURE EN ÉCHEC NE BLOQUE RIEN — ET LE DIT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ⑤ si la vérification échoue, le bien se classe quand même', () => {
  beforeEach(() => { etape2 = null; });

  it('🔴🔴 le classement part, et le compte rendu annonce l’expéditeur NON VÉRIFIÉ', async () => {
    await monter();
    await validerLeBien();
    expect(etape2Ouverte()).toBe(false);
    expect(ecritures()).toHaveLength(1);
    expect(gestes[0]).toContain('expéditeur non vérifié');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 ⑥ TOUT DÉCOCHER NE POSE AUCUNE QUESTION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ⑥ tout décocher : aucune question, et pas même une requête', () => {
  beforeEach(() => { etape2 = { ...ETAPE2_DEMANDEE }; });

  it('🔴 décocher le bien rattaché puis valider ne demande RIEN au serveur sur le contact', async () => {
    await monterAvecLien();
    await cliquer('Rattaché');
    await act(async () => { caseDuBien().click(); });
    await calmer();
    await cliquer(MOT_VALIDER_MODIFICATION);
    expect(etape2Ouverte()).toBe(false);
    // ⚠️ AUCUNE LECTURE DE L'ÉTAPE 2 : la question n'a pas de sens, et on ne la pose donc pas.
    expect(appels.filter((a) => a.url.includes('/gestion/contact-externe'))).toHaveLength(0);
    expect(ecritures()).toHaveLength(1);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ⑦ UN MAIL DÉJÀ CLASSÉ : LA GLISSIÈRE DU MODÈLE, À L'IDENTIQUE DE « MODIFIER LE RATTACHEMENT »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   Le bloc à trois choix d'avant est remplacé par la glissière (décision d'Arno, lot UNE-SEULE-FENETRE-DE-RATTACHEMENT) :
   à l'ouverture « Origine » (le suivi tel qu'il est), une case changée la place sur « One shot », « Toute la
   conversation » exige sa confirmation. Mêmes fenêtres d'écriture qu'avant. */

describe('🔴🔴 ⑦ mail déjà classé : la glissière, comme dans « Modifier le rattachement »', () => {
  const dejaClassee = () => {
    etape2 = { ...ETAPE2_DEMANDEE, requise: false, motif: 'expediteur_connu', biens: [] };
    suiviDuFil = {
      periodes: [{ id: 1, depuisMessageId: 800, classement: { sorte: 'biens', biens: [{ cle: LOT, libelle: PROPOSE.libelle }] } }],
      exceptions: [],
      mails: [800, 900],
    };
  };

  it('🔴🔴 À L’OUVERTURE : « Origine », les autres positions grisées, aucun ancien choix rond', async () => {
    dejaClassee();
    await monterAvecLien();
    await cliquer('Rattaché');
    expect(etape1Ouverte()).toBe(true);
    expect(positionChoisie()).toContain('Origine');
    expect(texte()).not.toContain('Suivi dans la conversation');
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(0);
  });

  it('🔴🔴 ON CHANGE UNE CASE : la glissière passe sur « One shot », et l’écriture est une exception (`mail`)', async () => {
    dejaClassee();
    await monterAvecLien();
    await cliquer('Rattaché');
    await act(async () => { caseDuBien().click(); });
    await calmer();
    expect(positionChoisie()).toContain('One shot');
    await cliquer(MOT_VALIDER_MODIFICATION);
    expect(etape2Ouverte()).toBe(false);
    expect(ecritures()).toHaveLength(1);
    expect((ecritures()[0].corps as { choix: string }).choix).toBe('mail');
  });

  it('🔴 « Ce mail + futurs échanges » écrit la période (`suite`)', async () => {
    dejaClassee();
    await monterAvecLien();
    await cliquer('Rattaché');
    await act(async () => { caseDuBien().click(); });
    await calmer();
    await act(async () => { position('Ce mail + futurs échanges').click(); });
    await calmer();
    await cliquer(MOT_VALIDER_MODIFICATION);
    expect((ecritures()[0].corps as { choix: string }).choix).toBe('suite');
  });

  it('🔴 « Toute la conversation » exige toujours sa confirmation avant de valider', async () => {
    dejaClassee();
    await monterAvecLien();
    await cliquer('Rattaché');
    await act(async () => { caseDuBien().click(); });
    await calmer();
    await act(async () => { position('Toute la conversation').click(); });
    await calmer();
    expect(texte()).toContain('Je confirme la mise à jour de toute la conversation.');
    expect(bouton(MOT_VALIDER_MODIFICATION)?.disabled).toBe(true);
    expect(ecritures()).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ⑧ UN MAIL JAMAIS CLASSÉ : LE PREMIER CLASSEMENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   DÉCISION D'ARNO (12/10/2026) : la glissière part TOUJOURS sur « Ce mail + futurs échanges », la règle du premier
   classement ; « Origine » y est visible mais grisée et non sélectionnable (lot PREMIER-RATTACHEMENT-SANS-ORIGINE). */

describe('🔴🔴 ⑧ mail jamais classé : « Ce mail + futurs échanges » d’avance', () => {
  const jamaisRattachee = (o: Partial<typeof suiviDuFil> = {}) => {
    etape2 = { ...ETAPE2_DEMANDEE, requise: false, motif: 'expediteur_connu', biens: [] };
    suiviDuFil = { periodes: [], exceptions: [], mails: [800, 900], rattachee: false, expediteurConnu: true, ...o };
  };

  it('🔴🔴 la glissière est sur « Ce mail + futurs échanges » dès l’ouverture, et le bloc dit « Aucun bien suivi »', async () => {
    jamaisRattachee();
    await monter();
    await cliquer('Rattacher');
    expect(etape1Ouverte()).toBe(true);
    expect(positionChoisie()).toContain('Ce mail + futurs échanges');
    expect(texte()).toContain(AUCUN_BIEN_SUIVI);
    // Les trois autres positions se choisissent d'emblée ; seule « Origine » est grisée.
    expect(container.querySelectorAll('.gpo-cran--grise')).toHaveLength(1);
  });

  it('🔴🔴 « Origine » est grisée, porte sa bulle, et ne se choisit ni à la souris ni au clavier', async () => {
    jamaisRattachee();
    await monter();
    await cliquer('Rattacher');
    const origine = position('Origine');
    expect(origine.getAttribute('aria-disabled')).toBe('true');
    expect(origine.getAttribute('title')).toBe(BULLE_ORIGINE_PREMIER);
    expect(origine.className).toContain('gpo-libelle--interdite');
    await act(async () => { origine.click(); });
    await calmer();
    expect(positionChoisie()).toContain('Ce mail + futurs échanges');
    // Clavier : depuis « One shot », la flèche gauche et « Début » ne vont pas sur Origine.
    await act(async () => { position('One shot').click(); });
    await calmer();
    const groupe = container.querySelector('[role="radiogroup"]') as HTMLElement;
    for (const key of ['ArrowLeft', 'Home']) {
      await act(async () => { groupe.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
      await calmer();
      expect(positionChoisie()).toContain('One shot');
    }
  });

  it('🔴🔴 ni « Valider le maintien du suivi actuel », ni sa mention, ni « Le mail reste à classer » au premier rattachement', async () => {
    jamaisRattachee();
    await monter();
    await cliquer('Rattacher');
    for (const coche of [false, true]) {
      if (coche) { await act(async () => { caseDuBien().click(); }); await calmer(); }
      expect(texte()).not.toContain('Valider le maintien du suivi actuel');
      expect(texte()).not.toContain('ne seront pas rattachés en position Origine');
      expect(texte()).not.toContain('reste à classer');
    }
  });

  it('🔴🔴 aucun bien coché hors « Origine » : bouton BLANC « Sélectionner minimum un bien », inactif, qui appelle l’œil', async () => {
    jamaisRattachee();
    await monter();
    await cliquer('Rattacher');
    const b = bouton('Sélectionner minimum un bien');
    expect(b?.className).toContain('rdf-valider-portee--vide');
    expect(b?.getAttribute('aria-disabled')).toBe('true');
    await cliquer('Sélectionner minimum un bien');
    expect(ecritures()).toHaveLength(0);
    expect(etape1Ouverte()).toBe(true);
    expect(container.querySelector('.rdf--appel')).not.toBeNull();
  });

  it('🔴🔴 le bouton suit en direct : un bien coché, puis chaque position', async () => {
    jamaisRattachee();
    await monter();
    await cliquer('Rattacher');
    await act(async () => { caseDuBien().click(); });
    await calmer();
    expect(bouton('Valider le rattachement de fond')?.className).toContain('svv-btn-primary');
    await act(async () => { position('One shot').click(); });
    await calmer();
    expect(bouton('Valider le rattachement one shot')).toBeDefined();
    await act(async () => { position('Toute la conversation').click(); });
    await calmer();
    expect(bouton('Valider le rattachement de toute la conversation')).toBeDefined();
    // Décocher : retour au bouton blanc.
    await act(async () => { caseDuBien().click(); });
    await calmer();
    expect(bouton('Sélectionner minimum un bien')).toBeDefined();
  });

  it('🔴🔴 au PREMIER mail de la conversation aussi', async () => {
    jamaisRattachee({ mails: [900] });
    await monter();
    await cliquer('Rattacher');
    expect(positionChoisie()).toContain('Ce mail + futurs échanges');
  });

  it('🔴🔴 valider sans toucher la glissière : la période (`suite`), comme le premier classement d’avant', async () => {
    jamaisRattachee();
    await monter();
    await validerLeBien();
    expect(ecritures()).toHaveLength(1);
    expect((ecritures()[0].corps as { choix: string }).choix).toBe('suite');
  });

  it('🔴 la route du suivi est bien interrogée AVEC le mail par l’encart (règle de l’étape 2)', async () => {
    jamaisRattachee();
    await monter();
    await cliquer('Rattacher');
    const lecture = appels.find((a) => a.url.includes('/gestion/suivi') && a.url.includes('message=') && a.methode === 'GET');
    expect(lecture?.url).toContain('fil=101');
    expect(lecture?.url).toContain('message=900');
  });
});
