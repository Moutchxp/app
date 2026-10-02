// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EncartRattachement } from './EncartRattachement';
import { BIEN_UNIQUEMENT, TITRE_ETAPE2, TITRE_SUIVI } from '../../../../lib/gestion/contactExterne';

/**
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

beforeEach(() => {
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
const boutons = (): HTMLButtonElement[] => [...container.querySelectorAll('button')];
const bouton = (mot: string): HTMLButtonElement | undefined =>
  boutons().find((b) => (b.textContent ?? '').includes(mot));
const cliquer = async (mot: string) => {
  const b = bouton(mot);
  if (b === undefined) throw new Error(`aucun bouton « ${mot} » — écran : ${texte().slice(0, 400)}`);
  await act(async () => { b.click(); });
  await calmer();
};
const caseDe = (nom: string): HTMLInputElement => {
  const label = [...container.querySelectorAll('label')].find((l) => (l.textContent ?? '').includes(nom));
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
/** La modale de l'étape 1 est-elle ouverte ? Son titre est le même depuis le lot RATTACHER-EN-ECRIVANT. */
const etape1Ouverte = (): boolean => texte().includes('Rattacher ce mail à…');
const etape2Ouverte = (): boolean => texte().includes(TITRE_ETAPE2);
const ecritures = () => appels.filter((a) => a.methode === 'POST' && a.url.includes('/gestion/suivi'));

/** Ouvre la modale et valide le bien proposé (déjà coché par le moteur). */
const validerLeBien = async () => {
  await cliquer('Rattacher');
  expect(etape1Ouverte()).toBe(true);
  await cliquer('Valider —');
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
    expect(texte()).toContain('Valider — 1 bien(s)');
    expect(ecritures()).toHaveLength(0);
  });

  it('🔴🔴 ③-bis « ← Retour » NE RECOCHE PAS CE QU’ON AVAIT DÉCOCHÉ (défaut vu à l’écran)', async () => {
    /**
     * 🔴🔴 LE DÉFAUT EXACT, MESURÉ À L'ÉCRAN le 02/10/2026 sur le mail 57329 (GDS PROPRETÉ) : le moteur
     * proposait QUATRE biens, tous cochés d'avance. On les décochait, on en cochait un autre par la recherche,
     * on validait, puis on revenait — et la fenêtre affichait « 5 bien(s) coché(s) ». La PRÉ-COCHE du moteur
     * revenait par-dessus la sélection qu'on venait de quitter.
     *
     * 🔴 « Garde les cases cochées » (Arno) VEUT DIRE LES DEUX SENS : ce qui est coché reste coché, ET ce qui
     * est décoché reste décoché. D'où la propriété `selectionInitiale` de la modale.
     */
    // Deux propositions, toutes deux recommandées : c'est la situation qui a révélé le défaut.
    propositions = [PROPOSE, { ...PROPOSE, cle: '443', libelle: '8 rue des Pavillons, PUTEAUX — lot 443',
      adresse: '8 rue des Pavillons', adresseComplete: '8 rue des Pavillons, 92800 PUTEAUX' }];
    await monter();
    await cliquer('Rattacher');
    expect(texte()).toContain('2 bien(s) coché(s)');

    // On en DÉCOCHE un, et l'on valide avec l'autre.
    await act(async () => { caseDe('8 rue des Pavillons').click(); });
    await calmer();
    expect(texte()).toContain('1 bien(s) coché(s)');
    await cliquer('Valider — 1 bien(s)');
    expect(etape2Ouverte()).toBe(true);

    await cliquer('← Retour');
    // 🔴 UN SEUL BIEN COCHÉ, celui qu'on avait laissé. Le second est TOUJOURS AFFICHÉ, mais décoché.
    expect(texte()).toContain('1 bien(s) coché(s) sur 2 affiché(s)');
    expect(caseDe('8 rue des Pavillons').checked).toBe(false);
    expect(caseDuBien().checked).toBe(true);
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
    const radios = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    await act(async () => { radios[1].click(); });
    await act(async () => { caseDe('THAI Cécile').click(); });
    await calmer();
    await cliquer('Valider');
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

  it('🔴 l’étape 2 se ferme après la validation', async () => {
    await monter();
    await validerLeBien();
    await act(async () => { caseDe(BIEN_UNIQUEMENT).click(); });
    await calmer();
    await cliquer('Valider');
    expect(etape2Ouverte()).toBe(false);
    expect(etape1Ouverte()).toBe(false);
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
   🔴 ⑥ « VALIDER — AUCUN BIEN » NE POSE AUCUNE QUESTION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ⑥ « Valider — aucun bien » : aucune question, et pas même une requête', () => {
  beforeEach(() => { etape2 = { ...ETAPE2_DEMANDEE }; });

  it('🔴 décocher le bien proposé puis valider ne demande RIEN au serveur sur le contact', async () => {
    await monter();
    await cliquer('Rattacher');
    await act(async () => { caseDuBien().click(); });
    await calmer();
    expect(texte()).toContain('Valider — aucun bien');
    await cliquer('Valider — aucun bien');
    expect(etape2Ouverte()).toBe(false);
    // ⚠️ AUCUNE LECTURE DE L'ÉTAPE 2 : la question n'a pas de sens, et on ne la pose donc pas.
    expect(appels.filter((a) => a.url.includes('/gestion/contact-externe'))).toHaveLength(0);
    expect(ecritures()).toHaveLength(1);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ⑦ LA NON-RÉGRESSION DEMANDÉE PAR ARNO : LE BLOC À 3 CHOIX, POUR UN EXPÉDITEUR CONNU
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   RÈGLE D'ARNO, rappelée le 02/10/2026 : « pour tout expéditeur présent dans les fiches propriétaires ou
   locataires, la modale et le bloc à 3 choix fonctionnent EXACTEMENT comme avant CONTACTS-EXTERNES. L'étape 2 ne
   concerne QUE les expéditeurs inconnus. »

   🔴 CE QUE CES ÉPREUVES GARDENT, ET QU'AUCUNE AUTRE NE GARDAIT : l'aller-retour complet du bloc sur le chemin
   RÉEL — la modale montée, la route de l'étape 2 répondant « expéditeur connu », et le bloc qui apparaît au
   changement puis disparaît au retour à l'état de départ. Les trois conditions de `blocSuiviVisible` sont
   éprouvées à part (module pur) ; ici c'est le CÂBLAGE qui est sous surveillance.

   ⚠️ ELLES AURAIENT ATTRAPÉ UNE RÉGRESSION DU LOT CONTACTS-EXTERNES. Il n'y en a pas eu — le calcul et le rendu
   du bloc sont restés identiques au caractère près — mais rien ne le VÉRIFIAIT de bout en bout. */

describe('🔴🔴 ⑦ expéditeur connu : le bloc à 3 choix apparaît au changement, et disparaît au retour', () => {
  /** Une conversation DÉJÀ CLASSÉE, et un mail qui n'est pas le premier : les deux conditions d'Arno. */
  const dejaClassee = () => {
    etape2 = { ...ETAPE2_DEMANDEE, requise: false, motif: 'expediteur_connu', biens: [] };
    suiviDuFil = {
      periodes: [{ id: 1, depuisMessageId: 800, classement: { sorte: 'biens', biens: [{ cle: LOT, libelle: PROPOSE.libelle }] } }],
      exceptions: [],
      mails: [800, 900],
    };
  };

  it('🔴🔴 À L’OUVERTURE : pas de bloc — la sélection est celle qui est validée', async () => {
    dejaClassee();
    await monterAvecLien();
    await cliquer('Rattaché');
    expect(etape1Ouverte()).toBe(true);
    expect(texte()).not.toContain('Suivi dans la conversation');
  });

  it('🔴🔴 ON CHANGE UNE CASE : le bloc APPARAÎT, avec ses trois choix et son défaut', async () => {
    dejaClassee();
    await monterAvecLien();
    await cliquer('Rattaché');
    await act(async () => { caseDuBien().click(); });
    await calmer();
    expect(texte()).toContain('Suivi dans la conversation');
    expect(texte()).toContain('Ce mail uniquement');
    expect(texte()).toContain('Ce mail et la conversation à venir');
    expect(texte()).toContain('Toute la conversation');
    // 🔴 LE CHOIX COCHÉ D'AVANCE N'A PAS CHANGÉ : « Ce mail et la conversation à venir ».
    const radios = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios).toHaveLength(3);
    expect(radios[1].checked).toBe(true);
  });

  it('🔴🔴 ON REVIENT À L’ÉTAT DE DÉPART : le bloc DISPARAÎT', async () => {
    dejaClassee();
    await monterAvecLien();
    await cliquer('Rattaché');
    await act(async () => { caseDuBien().click(); });
    await calmer();
    expect(texte()).toContain('Suivi dans la conversation');
    await act(async () => { caseDuBien().click(); });
    await calmer();
    expect(texte()).not.toContain('Suivi dans la conversation');
  });

  it('🔴🔴 ET AUCUNE ÉTAPE 2 N’EST JAMAIS OUVERTE pour cet expéditeur', async () => {
    dejaClassee();
    await monterAvecLien();
    await cliquer('Rattaché');
    await act(async () => { caseDuBien().click(); });
    await calmer();
    await cliquer('Valider — aucun bien');
    expect(etape2Ouverte()).toBe(false);
    // Le classement part par la porte qui existait déjà, avec le choix du bloc à 3 choix.
    expect(ecritures()).toHaveLength(1);
    expect((ecritures()[0].corps as { choix: string }).choix).toBe('suite');
  });

  it('🔴 « Toute la conversation » exige toujours sa confirmation avant de valider', async () => {
    dejaClassee();
    await monterAvecLien();
    await cliquer('Rattaché');
    await act(async () => { caseDuBien().click(); });
    await calmer();
    const radios = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    await act(async () => { radios[2].click(); });
    await calmer();
    expect(texte()).toContain('Je confirme le reclassement de toute la conversation.');
    expect(bouton('Valider —')?.disabled).toBe(true);
    expect(ecritures()).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ⑧ LOT SUIVI-CONVERSATION-NON-RATTACHEE — LA SECONDE PORTE, SUR LE CHEMIN RÉEL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DÉCISION D'ARNO (02/10/2026) : « conversation JAMAIS rattachée (aucune période, aucune exception, aucun
   rattachement confirmé), expéditeur CONNU : le bloc à 3 choix est TOUJOURS affiché dès l'ouverture, quelle que
   soit la position du mail (1er compris), sans condition de changement. »

   ⚠️ C'EST LE SERVEUR QUI DÉCIDE, et ces épreuves le pilotent par sa RÉPONSE — jamais par une propriété du
   composant. C'est la leçon du correctif du 28/09/2026 : un test qui passe une propriété prouve le composant et
   pas le câblage. */

describe('🔴🔴 ⑧ conversation jamais rattachée : le bloc est là dès l’ouverture', () => {
  /** Jamais rattachée : aucune période, aucune exception, aucun rattachement validé. */
  const jamaisRattachee = (o: Partial<typeof suiviDuFil> = {}) => {
    etape2 = { ...ETAPE2_DEMANDEE, requise: false, motif: 'expediteur_connu', biens: [] };
    suiviDuFil = { periodes: [], exceptions: [], mails: [800, 900], rattachee: false, expediteurConnu: true, ...o };
  };

  it('🔴🔴 le bloc est visible SANS qu’on ait touché à une case', async () => {
    jamaisRattachee();
    await monter();
    await cliquer('Rattacher');
    expect(etape1Ouverte()).toBe(true);
    expect(texte()).toContain('Suivi dans la conversation');
    expect(texte()).toContain('Ce mail uniquement');
    expect(texte()).toContain('Toute la conversation');
  });

  it('🔴🔴 au PREMIER mail de la conversation aussi', async () => {
    // `mails[0] === messageId` : c'est bien le premier, et la règle ① l'aurait fait taire.
    jamaisRattachee({ mails: [900] });
    await monter();
    await cliquer('Rattacher');
    expect(texte()).toContain('Suivi dans la conversation');
  });

  it('🔴 « Ce mail et la conversation à venir » est coché d’avance', async () => {
    jamaisRattachee();
    await monter();
    await cliquer('Rattacher');
    const radios = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios).toHaveLength(3);
    expect(radios[1].checked).toBe(true);
  });

  it('🔴🔴 EXPÉDITEUR INCONNU : aucun bloc dans l’étape 1 — c’est l’étape 2 qui porte le suivi', async () => {
    jamaisRattachee({ expediteurConnu: false });
    etape2 = { ...ETAPE2_DEMANDEE };
    await monter();
    await cliquer('Rattacher');
    expect(texte()).not.toContain('Suivi dans la conversation');
    // Et au Valider, c'est bien l'étape 2 qui s'ouvre, avec SES deux choix.
    await cliquer('Valider —');
    expect(etape2Ouverte()).toBe(true);
    /**
     * ══ 🔴🔴 L'INVARIANT NE SE LIT PLUS AU TITRE — ET C'EST VOULU (lot BROUILLONS-APERCU-TYPES-LIBELLES) ══════
     *
     * Depuis qu'Arno a demandé l'uniformisation, les DEUX blocs s'appellent « Suivi dans la conversation » : le
     * titre ne départage donc plus rien. Ce qui les distingue n'a pas changé pour autant — le bloc de l'étape 1
     * offre TROIS choix, dont « Toute la conversation », celui de l'étape 2 en offre DEUX. C'est sur cela que
     * l'invariant se vérifie désormais, et c'est un meilleur contrôle : il porte sur ce que l'écran FAIT, pas
     * sur la façon dont il s'intitule.
     */
    expect(texte()).toContain(TITRE_SUIVI);
    expect(texte()).toContain('Ce mail et la conversation à venir');
    expect(texte()).toContain('Ce mail uniquement');
    // 🔴 LE TROISIÈME CHOIX N'EXISTE QUE DANS LA MODALE : s'il apparaît ici, les deux blocs sont montés ensemble.
    expect(texte()).not.toContain('Toute la conversation');
  });

  it('🔴🔴 un RATTACHEMENT VALIDÉ suffit à faire reprendre la règle ①, même sans période', async () => {
    /**
     * 🔴 LA LETTRE D'ARNO : « conversation DÉJÀ rattachée (au moins une période OU un rattachement validé) ».
     * Sans ce fait, une conversation portant des liens confirmés mais aucune période aurait montré le bloc en
     * permanence — alors qu'elle relève de la règle ①, inchangée.
     */
    jamaisRattachee({ rattachee: true });
    await monterAvecLien();
    await cliquer('Rattaché');
    expect(texte()).not.toContain('Suivi dans la conversation');
    // Et il réapparaît au changement, comme depuis le 01/10.
    await act(async () => { caseDuBien().click(); });
    await calmer();
    expect(texte()).toContain('Suivi dans la conversation');
  });

  it('🔴🔴 APRÈS VALIDATION, le mail suivant suit la règle ① (la conversation est devenue rattachée)', async () => {
    jamaisRattachee();
    await monter();
    await cliquer('Rattacher');
    expect(texte()).toContain('Suivi dans la conversation');
    await cliquer('Valider —');
    expect(ecritures()).toHaveLength(1);
    expect((ecritures()[0].corps as { choix: string }).choix).toBe('suite');

    /**
     * Le mail SUIVANT : la conversation porte désormais une période ET un rattachement validé. Le serveur le dit,
     * et le bloc se tait tant qu'on ne change rien — c'est exactement la règle ①.
     */
    suiviDuFil = {
      periodes: [{ id: 1, depuisMessageId: 900, classement: { sorte: 'biens', biens: [{ cle: LOT, libelle: PROPOSE.libelle }] } }],
      exceptions: [], mails: [800, 900], rattachee: true, expediteurConnu: true,
    };
    await monterAvecLien();
    await cliquer('Rattaché');
    expect(texte()).not.toContain('Suivi dans la conversation');
  });

  it('⚠️ une réponse d’API plus ancienne (sans les deux champs) rend le comportement d’AVANT', async () => {
    etape2 = { ...ETAPE2_DEMANDEE, requise: false, motif: 'expediteur_connu', biens: [] };
    suiviDuFil = { periodes: [], exceptions: [], mails: [800, 900] } as unknown as typeof suiviDuFil;
    await monter();
    await cliquer('Rattacher');
    expect(texte()).not.toContain('Suivi dans la conversation');
  });

  it('🔴 la route est bien interrogée AVEC le mail : sans lui elle ne peut pas répondre', async () => {
    jamaisRattachee();
    await monter();
    await cliquer('Rattacher');
    const lecture = appels.find((a) => a.url.includes('/gestion/suivi') && a.methode === 'GET');
    expect(lecture?.url).toContain('fil=101');
    expect(lecture?.url).toContain('message=900');
  });
});
