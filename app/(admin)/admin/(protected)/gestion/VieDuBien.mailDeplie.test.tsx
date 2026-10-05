// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LigneVie } from './VieDuBien';
import { corpsLisible } from '../../../../lib/gestion/lisibilite';
import type { LigneHistorique } from '../../../../lib/gestion/historique';
/* 🔴🔴 LOT HISTORIQUE-BIEN-10, POINT 3 — le ton d'une adresse, celui de la légende du listing. */
import type { TonMail } from '../../../../lib/gestion/historiqueBien';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-4, POINTS 5 ET 6 — LE MAIL DÉPLIÉ ══════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEUX DEMANDES D'ARNO (05/10/2026) :
 *   ⑤ « Le mail déplié (triangle ▸) affiche l'INTÉGRALITÉ du nouveau message (aujourd'hui il est coupé : “Par
 *      ailleurs, avez-vou”), SANS l'historique cité en dessous. Réutilise la détection de citation déjà utilisée
 *      dans la Conversation, pas de second chemin. Si elle échoue sur un cas, affiche tout plutôt que de couper.
 *      Tests sur 5 mails réels (Gmail, Outlook, iPhone, transfert, réponse courte). »
 *   ⑥ « “Voir la conversation d'origine →” est placé EN BAS À DROITE du mail déplié. »
 *
 * ═══ 🔴 LA CAUSE DU POINT 5, MESURÉE AVANT D'ÊTRE CORRIGÉE ════════════════════════════════════════════════════════
 *
 * Ce n'était PAS la détection de citation : elle était déjà là, et c'était déjà celle de la Conversation
 * (`corpsLisible`). C'était la LONGUEUR du corps reçu. Le dépôt de l'historique n'envoie que les 240 premiers
 * caractères (`EXTRAIT_MAX`, `historiqueRepo.ts`), parce que cet extrait sert à reconnaître un mail dans une
 * frise de cent lignes. « Par ailleurs, avez-vou » EST le 240e caractère du message qu'Arno regardait : il n'y
 * avait aucune citation à écarter, elle commençait après la coupure.
 *
 * 🔴 LA LIGNE DÉPLIÉE CHARGE DONC LE CORPS ENTIER, par la porte qui existait déjà et que la Conversation emploie
 * pour la même raison (`chargerCorpsDuMessage`). Un fil de cent mails ne traverse pas le réseau pour qu'on en
 * lise un ; et replier puis rouvrir ne redemande rien.
 *
 * ═══ 🔴 CE QUE LES CINQ MAILS RÉELS ONT APPRIS (base du 05/10/2026) ═══════════════════════════════════════════════
 *
 * Les cinq formes demandées par Arno ont été tirées de la base, puis passées dans `corpsLisible`. Quatre
 * sortaient propres. DEUX (Gmail, transfert) laissaient traîner sous la signature deux lignes d'en-tête :
 *
 *     Philippe D…
 *     92800 Puteaux
 *     Le mar. 29 sept. 2026 à 16:36, Gestion CRITERIMMO <gestion@…> a      ← repli de Gmail à 72 colonnes
 *     écrit :                                                              ← la suite de la MÊME phrase
 *
 * Le motif d'attribution est ancré aux deux bouts (`^\s*Le\s.+a écrit\s*:\s*$`) : coupée en deux, la phrase ne
 * matchait plus. La coupure se faisait alors une ligne plus bas, sur le premier « > ».
 *
 * 🔴 ET CE N'ÉTAIT PAS COSMÉTIQUE. Quand la citation n'est PAS préfixée de « > » (très fréquent : Gmail en
 * « rich text » reconverti, iPhone), rien d'autre ne la signalait, et TOUT l'historique s'affichait comme si on
 * venait de l'écrire. Mesuré sur la base entière : **5 374 messages sur 11 253** portant une attribution l'ont
 * repliée en deux lignes (544 de plus sur « wrote : »). En rejouant les 55 883 corps avant/après : **7 033
 * raccourcis** (609 355 octets d'historique retirés, jusqu'à 7 063 octets pour un seul message), **zéro phrase
 * écrite perdue** — tout ce qui disparaît est un en-tête d'attribution —, et **18 corps RALLONGÉS**, qui sont la
 * prudence déjà écrite dans `separerCitation` : un mail qui n'est QUE de la citation s'affiche en entier.
 *
 * ⚠️ LA CORRECTION EST DANS `lisibilite.ts`, PAS ICI, et c'est le point : la détection reste UNIQUE, et la
 * Conversation en profite du même geste. Corriger le repli dans la ligne de courrier aurait fabriqué le second
 * chemin qu'Arno interdit.
 *
 * ⚠️ AUCUNE DONNÉE RÉELLE DANS CE FICHIER. Les cinq corps ci-dessous reprennent au caractère près la FORME des
 * mails mesurés — les replis, la ponctuation, les en-têtes — avec des noms et des adresses inventés. C'est la
 * forme qui est en cause, jamais l'identité des gens.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ══ LES CINQ FORMES, TELLES QU'ELLES ARRIVENT ══════════════════════════════════════════════════════════════════ */

/** ① GMAIL — attribution repliée sur deux lignes, puis citation en « > ». */
const GMAIL = `Bonjour le service gestion,

Personne ne m' a appelé à ce jour...

Nous prenons possession de notre appartement les 16-17-18 Octobre et + si
besoin.

Cordialement,

Paul Mercier
5, Rue des Lilas
92800 Puteaux


Le mar. 29 sept. 2026 à 16:36, Gestion EXEMPLE <gestion@exemple.test> a
écrit :

> Bonjour Monsieur et Madame Mercier,
>
> Afin d'éclaircir la situation, nous allons vous rappeler.
>
> Cordialement,
`;

/** ② OUTLOOK — la barre de soulignés, puis les en-têtes « From : / Sent : / To : ». */
const OUTLOOK = `Bonjour Monsieur Blanchard,

Suite au courrier recommandé électronique que je vous ai envoyé, veuillez trouver ci-jointe ma lettre contestant les frais de la mise en demeure.


Cordialement,

Claire Vasseur
________________________________
From: BLANCHARD Thierry <thierry.blanchard@exemple.test>
Sent: Monday, September 21, 2026 12:10
To: claire.vasseur@exemple.test <claire.vasseur@exemple.test>
Subject: Relance simple - lot 12


Bonjour Madame Vasseur,

Veuillez trouver en pièce jointe votre relance.
`;

/** ③ iPHONE — la signature du téléphone, puis l'attribution courte « Le 29 sept. 2026 à 14:13 … a écrit : ». */
const IPHONE = `Bonjour Monsieur,
J’ai bien reçu vos documents et vous en remercie.
Je vous rappelle toutefois que j’ai informé votre société en fin d’année
dernière du fait que la gestion de nos actifs est confiée à une autre
 structure, et qu'il faut la mettre en copie de tous vos mails.
Cordialement
D. Lemoine

Envoyé de mon iPhone

Le 29 sept. 2026 à 14:13, Daniel Royer <daniel.royer@exemple.test> a écrit :



Mesdames, Messieurs,

Vous trouverez ci-joint l'avis d'appel de provisions.
`;

/** ④ TRANSFERT — « ---------- Forwarded message --------- » au milieu d'une citation déjà citée. */
const TRANSFERT = `Bonjour,

Je vous transmets en pièce jointe l’affiche avec les coordonnées de cette
société. J’ai pris la photo dans l’ascenseur.

Bien cordialement,
Anna Delaunay



Le ven. 2 oct. 2026 à 17:24, Gestion EXEMPLE <gestion@exemple.test> a
écrit :

> Bonjour Madame,
>
> Auriez-vous les coordonnées de la société concernée ?
>
>>
>> ---------- Forwarded message ---------
>> De : Anna Delaunay <anna.delaunay@exemple.test>
>> Date: mer. 30 sept. 2026 à 15:03
>> Subject: Travaux du 5e étage
>> To: Jean Berger <jean.berger@exemple.test>
>>
>> Bonjour Jean,
>>
>> La semaine dernière, les travaux ont eu lieu.
`;

/** ⑤ RÉPONSE COURTE — une signature de quatre lignes, et tout le reste est de l'historique. */
const COURTE = `Service Gestion

2 rue des Acacias, 92800 Puteaux
06 00 00 00 00
01 00 00 00 00

Le samedi 3 octobre 2026 à 10:18, Gestion <gestion@exemple.test> a écrit :
> test Service Gestion 2 rue des Acacias Le vendredi 2 octobre 2026 à 16:02, scanner a écrit :
`;

describe('Point 5 — la citation est écartée sur les cinq formes réelles', () => {
  it('① Gmail : la signature finit le message, l’attribution repliée part avec l’historique', () => {
    const { visible, cite } = corpsLisible(GMAIL);
    // Tout le message neuf est là, y compris ce qui était au-delà du 240e caractère.
    expect(visible).toContain('Bonjour le service gestion');
    expect(visible).toContain('les 16-17-18 Octobre');
    expect(visible.trimEnd().endsWith('92800 Puteaux')).toBe(true);
    // 🔴 L'ATTRIBUTION REPLIÉE EN DEUX LIGNES NE RESTE PAS COLLÉE SOUS LA SIGNATURE.
    expect(visible).not.toContain('a\nécrit :');
    expect(visible).not.toContain('Le mar. 29 sept. 2026');
    expect(cite).not.toBeNull();
    expect(cite).toContain('Le mar. 29 sept. 2026');
    expect(cite).toContain('Afin d\'éclaircir la situation');
  });

  it('② Outlook : la barre de soulignés coupe, les en-têtes recopiés partent', () => {
    const { visible, cite } = corpsLisible(OUTLOOK);
    expect(visible).toContain('ma lettre contestant les frais');
    expect(visible.trimEnd().endsWith('Claire Vasseur')).toBe(true);
    expect(visible).not.toContain('From:');
    expect(visible).not.toContain('Subject:');
    expect(cite).toContain('Relance simple');
  });

  it('③ iPhone : la signature du téléphone reste, l’échange cité part', () => {
    const { visible, cite } = corpsLisible(IPHONE);
    expect(visible).toContain('J’ai bien reçu vos documents');
    expect(visible).toContain('Envoyé de mon iPhone');
    expect(visible).not.toContain('Mesdames, Messieurs');
    expect(cite).toContain('avis d\'appel de provisions');
  });

  it('④ transfert : la coupure se fait à la PREMIÈRE marque, le transfert imbriqué part avec', () => {
    const { visible, cite } = corpsLisible(TRANSFERT);
    expect(visible).toContain('l’affiche avec les coordonnées');
    expect(visible.trimEnd().endsWith('Anna Delaunay')).toBe(true);
    expect(visible).not.toContain('Forwarded message');
    expect(cite).toContain('Forwarded message');
    expect(cite).toContain('Travaux du 5e étage');
  });

  it('⑤ réponse courte : il reste une signature, et c’est bien ce qui a été écrit', () => {
    const { visible, cite } = corpsLisible(COURTE);
    expect(visible).toContain('Service Gestion');
    expect(visible).toContain('2 rue des Acacias');
    expect(visible).not.toContain('Le samedi 3 octobre 2026');
    expect(cite).toContain('Le samedi 3 octobre 2026');
  });

  it('🔴 LA PRUDENCE D’ARNO : un corps qui n’est QUE de la citation s’affiche en entier', () => {
    // « Si elle échoue sur un cas, affiche tout plutôt que de couper. »
    const r = corpsLisible('Le 3 octobre 2026, Gestion <gestion@exemple.test> a\nécrit :\n\n> Bonjour,\n');
    expect(r.visible).toContain('Bonjour,');
    expect(r.cite).toBeNull();
  });
});

/* ══ LE RENDU DE LA LIGNE ═══════════════════════════════════════════════════════════════════════════════════════ */

const MESSAGE = 4242;

/**
 * 🔴 LE MAIL D'ARNO, DANS SA FORME. Un message assez long pour que 240 caractères tombent EN PLEIN MILIEU — et
 * la phrase coupée est la sienne : « Par ailleurs, avez-vou ». Même forme Gmail que ① (attribution repliée).
 */
const MAIL_LONG = `Bonjour,

Nous avons bien reçu votre courrier du 28 septembre et nous vous en remercions.
La chaudière a été remplacée la semaine dernière, l'intervention s'est bien
passée et le locataire a confirmé que tout marche.

Par ailleurs, avez-vous reçu le devis du plombier pour la salle de bains ? Nous
aimerions le valider avant la fin du mois afin que les travaux puissent démarrer
en novembre.

Bien cordialement,

Paul Mercier
5, Rue des Lilas
92800 Puteaux


Le mar. 29 sept. 2026 à 16:36, Gestion EXEMPLE <gestion@exemple.test> a
écrit :

> Bonjour Monsieur Mercier,
>
> Nous revenons vers vous au sujet de la chaudière.
>
> Cordialement,
`;

/**
 * Ce que le dépôt de l'historique envoie : 240 caractères, coupés au milieu d'un mot (`EXTRAIT_MAX`).
 *
 * ⚠️ IL EST CALCULÉ ICI, PAS RECOPIÉ À LA MAIN : c'est la même coupure que le SQL, et le test se lit comme le
 * défaut — l'extrait s'arrête sur « Par ailleurs, avez-vou », exactement ce qu'Arno voyait à l'écran.
 */
const EXTRAIT = MAIL_LONG.slice(0, 240);

const LIGNE: LigneHistorique = {
  messageId: MESSAGE, filId: 77, messageIdRfc: null,
  recuLe: '2026-09-29T14:42:00.000Z', sens: 'recu',
  de: 'paul.mercier@exemple.test', deNom: 'Paul Mercier',
  destinataires: ['gestion@exemple.test'],
  /* 🔴🔴 LOT HISTORIQUE-BIEN-10, POINT 3 — les trois champs séparés : De / À / Cc, avec leurs noms. */
  a: [{ nom: 'Gestion', adresse: 'gestion@exemple.test' }], cc: [], cci: [],
  objet: 'Prise de possession',
  extrait: EXTRAIT, pieces: [],
  parCible: { sorte: 'lot', cle: 'LOT-47', id: null }, cibleLibelle: 'Lot 47',
  source: 'rattachement', evenements: [],
  statut: null, statutDetail: null,
};

let container: HTMLDivElement;
let root: Root;
/** Ce que la route `/messages/[id]/corps` répond. `null` = elle échoue. */
let reponse: { corps: string | null; html: string | null } | null;
/** Combien de fois le corps a été demandé : c'est ce nombre qui prouve qu'on ne redemande pas. */
let demandes: number;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  reponse = { corps: MAIL_LONG, html: null };
  demandes = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (!url.includes(`/messages/${MESSAGE}/corps`)) throw new Error(`url inattendue : ${url}`);
    demandes += 1;
    if (reponse === null) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => reponse };
  }));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

/** Monte la ligne, dépliée ou non, et laisse le chargement se faire. */
async function monter(ouvert: boolean, l: LigneHistorique = LIGNE): Promise<void> {
  await act(async () => {
    root.render(createElement(LigneVie, {
      l, maintenant: new Date('2026-10-05T12:00:00.000Z'), ouvert,
      onBasculer: () => {}, onOuvrirFil: () => {},
    }));
  });
  await act(async () => { await Promise.resolve(); });
}

const corps = (): string => container.querySelector('.vdb-corps')?.textContent ?? '';

describe('Point 5 — la ligne dépliée affiche tout le message, et rien de l’historique', () => {
  it('🔴 LE DÉFAUT D’ARNO EST RÉPARÉ : le corps dépasse les 240 caractères de l’extrait', async () => {
    await monter(true);
    expect(demandes).toBe(1);
    // 🔴 LE SYMPTÔME, ÉCRIT NOIR SUR BLANC : l'extrait s'arrête en plein mot.
    expect(EXTRAIT.endsWith('Par ailleurs, avez-vou')).toBe(true);
    // Et la ligne dépliée, elle, affiche la suite ET la signature.
    expect(corps()).toContain('avez-vous reçu le devis du plombier');
    expect(corps()).toContain('92800 Puteaux');
    expect(corps().length).toBeGreaterThan(240);
  });

  it('l’historique cité n’est PAS affiché', async () => {
    await monter(true);
    expect(corps()).not.toContain('Nous revenons vers vous au sujet de la chaudière');
    expect(corps()).not.toContain('Le mar. 29 sept. 2026');
  });

  it('⚠️ LA LIGNE REPLIÉE NE DEMANDE RIEN : cent mails ne chargent pas cent corps', async () => {
    await monter(false);
    expect(demandes).toBe(0);
  });

  it('⚠️ ON NE CHARGE QU’UNE FOIS : replier puis rouvrir ne redemande pas', async () => {
    await monter(true);
    expect(demandes).toBe(1);
    await monter(false);
    await monter(true);
    expect(demandes).toBe(1);
    expect(corps()).toContain('92800 Puteaux');
  });

  it('⚠️ SI LA LECTURE ÉCHOUE, L’EXTRAIT RESTE : on n’efface pas ce qu’on avait', async () => {
    reponse = null;
    await monter(true);
    expect(demandes).toBe(1);
    expect(corps()).toContain('Par ailleurs, avez-vou');
  });

  it('⚠️ UN CORPS VIDE N’EFFACE PAS L’EXTRAIT (« rien à lire » ≠ « on n’a pas pu lire »)', async () => {
    reponse = { corps: '', html: null };
    await monter(true);
    expect(corps()).toContain('Par ailleurs, avez-vou');
  });

  it('un mail sans extrait ET sans corps n’affiche aucun paragraphe de corps', async () => {
    reponse = { corps: null, html: null };
    await monter(true, { ...LIGNE, extrait: null });
    expect(container.querySelector('.vdb-corps')).toBeNull();
  });
});

describe('Point 6 — « Voir la conversation d’origine → » est en bas à droite', () => {
  it('c’est le DERNIER élément du mail déplié', async () => {
    await monter(true);
    const detail = container.querySelector('.vdb-detail');
    expect(detail).not.toBeNull();
    const dernier = detail?.lastElementChild;
    expect(dernier?.className).toBe('vdb-sortie');
    expect(dernier?.textContent).toContain('Voir la conversation d’origine');
  });

  it('son enveloppe le pousse à droite', async () => {
    await monter(true);
    const sortie = container.querySelector('.vdb-sortie');
    expect(sortie).not.toBeNull();
    expect(sortie?.querySelector('button')).not.toBeNull();
  });

  it('🔴 LA RÈGLE EST ÉCRITE DANS LA FEUILLE, PAS DEVINÉE PAR LE RENDU', async () => {
    const { CSS_VIE_DU_BIEN } = await import('./VieDuBien');
    const regle = CSS_VIE_DU_BIEN.split('.vdb-sortie{')[1]?.split('}')[0] ?? '';
    expect(regle).toContain('justify-content:flex-end');
  });

  it('sans `onOuvrirFil` (la fiche d’un locataire n’en passe pas), aucune sortie n’est rendue', async () => {
    await act(async () => {
      root.render(createElement(LigneVie, {
        l: LIGNE, maintenant: new Date('2026-10-05T12:00:00.000Z'), ouvert: true, onBasculer: () => {},
      }));
    });
    expect(container.querySelector('.vdb-sortie')).toBeNull();
  });
});

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-10, POINT 3 — LE MAIL DÉPLIÉ MONTRE TOUTES SES ADRESSES ═════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : « Au-dessus de “À :”, une ligne “De : Nom <adresse>”. “À :” liste TOUS les
 * destinataires, à la suite sur la même ligne (retour à la ligne propre si c'est long). Ligne “Cc :” si des
 * personnes sont en copie. Cci seulement si on le connaît (nos envois). Chaque adresse porte la petite pastille
 * de couleur de sa catégorie (rouge propriétaire, vert locataire, bleu tiers, gris non affecté, rien pour
 * l'agence), avec une info-bulle sur la catégorie. »
 *
 * CE QUE CELA REMPLACE : une seule ligne « À : » qui mêlait le À ET le Cc, bornée à six, suivie de « et
 * d'autres ». On ne savait ni qui était en copie, ni combien manquaient, ni qui avait écrit.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴🔴 le mail déplié : De / À / Cc / Cci, et leurs pastilles', () => {
  const COMPLET: LigneHistorique = {
    ...LIGNE,
    de: 'proprio@fictif.test', deNom: 'M. ROI Nathan',
    a: [
      { nom: 'CRITERIMMO', adresse: 'gestion@criterimmo.fr' },
      { nom: 'MARTY Jean-François', adresse: 'locataire@fictif.test' },
    ],
    cc: [{ nom: null, adresse: 'assureur@fictif.test' }],
    cci: [{ nom: 'Jean-Baptiste PONS', adresse: 'jb.pons@sansvisavis.com' }],
  };

  /** Les catégories de CE bien, telles que le bloc les passe. */
  const TON = (adresse: string): TonMail | null => {
    if (adresse.endsWith('@criterimmo.fr') || adresse.endsWith('@sansvisavis.com')) return 'nous';
    if (adresse === 'proprio@fictif.test') return 'rouge';
    if (adresse === 'locataire@fictif.test') return 'vert';
    return 'gris';
  };

  /** ⚠️ ON RÉEMPLOIE LE BANC DU FICHIER (`root`, `container`) : il monte déjà la ligne avec son chargement de
      corps simulé, et en ouvrir un second aurait fait deux montages concurrents dans le même document. */
  async function deplier(l: LigneHistorique, tonDe?: (a: string) => TonMail | null) {
    await act(async () => {
      root.render(createElement(LigneVie, {
        l, maintenant: new Date('2026-10-05T12:00:00Z'), ouvert: true, onBasculer: () => {}, tonDe,
      }));
    });
  }

  const ligneDe = (mot: string): HTMLElement | undefined =>
    ([...container.querySelectorAll('.vdb-dest')] as HTMLElement[])
      .find((p) => (p.querySelector('.vdb-dest-mot')?.textContent ?? '').startsWith(mot));

  it('🔴🔴 LES QUATRE LIGNES, DANS L’ORDRE D’UN EN-TÊTE', async () => {
    await deplier(COMPLET, TON);
    const mots = [...container.querySelectorAll('.vdb-dest-mot')].map((m) => m.textContent);
    expect(mots).toEqual(['De :', 'À :', 'Cc :', 'Cci :']);
  });

  it('🔴🔴 « De » PORTE LE NOM **ET** L’ADRESSE', async () => {
    await deplier(COMPLET, TON);
    const de = ligneDe('De') as HTMLElement;
    expect(de.textContent).toContain('M. ROI Nathan');
    expect(de.textContent).toContain('<proprio@fictif.test>');
  });

  /** 🔴 TOUS les destinataires, et plus aucun « et d'autres » : la liste n'est plus bornée. */
  it('🔴🔴 « À » LISTE TOUS LES DESTINATAIRES, sans borne ni « et d’autres »', async () => {
    const beaucoup = Array.from({ length: 12 }, (_, i) => ({ nom: null, adresse: `d${i}@fictif.test` }));
    await deplier({ ...COMPLET, a: beaucoup }, TON);
    const a = ligneDe('À') as HTMLElement;
    expect(a.querySelectorAll('.vdb-qui')).toHaveLength(12);
    expect(a.textContent).not.toContain('et d’autres');
  });

  /**
   * 🔴🔴 LA PASTILLE DIT LA CATÉGORIE, ET SON MOT VIENT DE LA LÉGENDE — la même que sous le listing. Deux mots
   * pour une même couleur auraient fait croire à deux notions.
   */
  it('🔴🔴 CHAQUE ADRESSE PORTE SA PASTILLE, avec le mot de la légende en info-bulle', async () => {
    await deplier(COMPLET, TON);
    const de = ligneDe('De') as HTMLElement;
    expect(de.querySelector('.vdb-pastille--rouge')?.getAttribute('title')).toBe('propriétaire');
    const a = ligneDe('À') as HTMLElement;
    expect(a.querySelector('.vdb-pastille--vert')?.getAttribute('title')).toBe('locataire');
    const cc = ligneDe('Cc') as HTMLElement;
    expect(cc.querySelector('.vdb-pastille--gris')?.getAttribute('title')).toBe('non affecté');
  });

  /**
   * 🔴🔴 « RIEN POUR L'AGENCE » EST UNE RÈGLE, PAS UN OUBLI : nous ne sommes pas une partie du bien, et nous
   * peindre nous mettrait sur le même plan qu'un propriétaire. L'adresse, elle, reste écrite.
   */
  it('🔴🔴 NOS ADRESSES N’ONT AUCUNE PASTILLE — et restent pourtant lisibles', async () => {
    await deplier(COMPLET, TON);
    const a = ligneDe('À') as HTMLElement;
    const nous = [...a.querySelectorAll('.vdb-qui')]
      .find((q) => (q.textContent ?? '').includes('gestion@criterimmo.fr')) as HTMLElement;
    expect(nous).toBeDefined();
    expect(nous.querySelector('.vdb-pastille')).toBeNull();
    expect(nous.textContent).toContain('CRITERIMMO');
  });

  /** ⚠️ PAS DE LIGNE « Cci » QUAND ON NE LA CONNAÎT PAS : un mail reçu n'en dit rien, et l'écrire mentirait. */
  it('⚠️ AUCUNE LIGNE « Cc » NI « Cci » QUAND IL N’Y EN A PAS', async () => {
    await deplier({ ...COMPLET, cc: [], cci: [] }, TON);
    expect(ligneDe('Cc')).toBeUndefined();
    expect(ligneDe('Cci')).toBeUndefined();
    expect(ligneDe('À')).toBeDefined();
  });

  /**
   * ⚠️ SANS CATÉGORIES, AUCUNE PASTILLE — et les trois autres écrans qui montent cette ligne (dont la fiche
   * d'un locataire) ne bougent pas d'un pixel. Les adresses, elles, s'affichent quand même.
   */
  it('⚠️ SANS `tonDe`, LES ADRESSES RESTENT ET LES PASTILLES DISPARAISSENT', async () => {
    await deplier(COMPLET);
    expect(container.querySelectorAll('.vdb-pastille')).toHaveLength(0);
    expect((ligneDe('À') as HTMLElement).textContent).toContain('locataire@fictif.test');
  });

  /**
   * 🔴 LE REPLI DU DÉPÔT : un mail capturé avant les colonnes `jsonb` n'a que `destinataires`. Le taire aurait
   * fait disparaître des destinataires qu'on affichait hier.
   */
  it('🔴 UN MAIL D’AVANT LES CHAMPS SÉPARÉS GARDE SES DESTINATAIRES', async () => {
    await deplier({ ...COMPLET, a: [], cc: [], cci: [], destinataires: ['vieux@fictif.test'] }, TON);
    expect(container.textContent).toContain('vieux@fictif.test');
  });
});
