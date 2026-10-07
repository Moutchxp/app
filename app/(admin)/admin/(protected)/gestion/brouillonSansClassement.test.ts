// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { classementExigePour, MOTIF_NON_CLASSE, type GesteSurBrouillon }
  from '../../../../lib/gestion/classementAvantEnvoi';
import { MOTS_SUPPRIMER_BROUILLON } from '../../../../lib/gestion/brouillonEnAttente';

/**
 * ══ 🔴🔴 LOT BROUILLON-SANS-CLASSEMENT — ON SUPPRIME ET ON GARDE SANS CLASSER ═════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (07/10/2026) : depuis la recherche, il ouvre un brouillon, clique « Supprimer le brouillon », et
 * lit « Classez ce mail avant de l'envoyer : Rattacher ou Interne ». Le brouillon n'est pas supprimé.
 *
 * ═══ 🔴🔴 LA CAUSE, MESURÉE À L'ÉCRAN AVANT D'ÊTRE CORRIGÉE ════════════════════════════════════════════════════
 *
 * RIEN NE REFUSAIT LA SUPPRESSION : ni l'éditeur, ni la route (qui n'a jamais porté le moindre contrôle de
 * classement). CE QUI LA REFUSAIT, C'EST LA MISE EN PAGE, et elle le faisait de deux façons qui s'additionnent :
 *   ① la ligne rouge était rendue EN PERMANENCE dès qu'un brouillon n'était pas classé — donc déjà là AVANT le
 *      clic, et toujours là après. Elle répondait ainsi à TOUS les gestes, y compris ceux qu'elle ne commande pas ;
 *   ② elle est posée JUSTE SOUS la rangée des boutons (mesuré : bouton 1105-1149 px, ligne 1163-1181 px), là où
 *      l'œil revient après un clic — tandis que la confirmation « Supprimer définitivement ce brouillon ? »
 *      s'affichait 132 px AU-DESSUS du bouton (973-1033 px), de l'autre côté de toute la rangée, souvent hors
 *      de l'écran.
 * Le seul texte qui changeait près du doigt disait « classez ce mail ». Un écran qui répond à côté de la question
 * est lu comme un refus.
 *
 * ═══ CE QUE CE FICHIER ÉPROUVE ════════════════════════════════════════════════════════════════════════════════
 * Le VRAI éditeur, monté pour chaque type de brouillon, et les requêtes qu'il émet. Un test qui chercherait les
 * mots dans le source prouverait qu'ils sont écrits, pas qu'une suppression part.
 *
 * 🔒 AUCUN ENVOI, AUCUNE BASE, AUCUN BROUILLON RÉEL : `fetch` est simulé et compté.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test',
  delaiAnnulationS: 5,
  // 🔴 LE BLOC « Classer ce mail » EST RENDU : sans cette sonde, il n'existe pas, et rien n'exigerait de classer.
  classementDisponible: true, interneDisponible: true,
};

/**
 * 🔴🔴 LES CINQ TYPES DE BROUILLON, TOUS NON CLASSÉS (`cibles` vide, `interne` faux, `horsGestion` faux).
 *
 * Arno : « pour TOUS les brouillons (nouveau message, réponse dans une conversation, transfert, depuis la
 * recherche, la liste Brouillons, l'écran partagé ou une fiche) ». Les trois derniers ne sont pas des TYPES mais
 * des points d'entrée : ils montent tous ce même composant avec l'un de ces cinq brouillons — c'est ce que dit
 * l'inventaire du lot, et c'est pour cela qu'il n'y a qu'un endroit à corriger.
 */
const TYPES: readonly { nom: string; b: BrouillonEcran }[] = [
  {
    nom: 'nouveau message',
    b: {
      id: 900, voie: 'nouveau', a: ['gabrielle@exemple.test'], cc: [], cci: [],
      objet: '_TEST sans classement', corps: 'Bonjour,\n\nService Gestion', citation: null,
      destinatairesApproximatifs: false, filId: null, repondALeMessageId: null,
    },
  },
  {
    nom: 'réponse dans une conversation',
    b: {
      id: 901, voie: 'repondre', a: ['gabrielle@exemple.test'], cc: [], cci: [],
      objet: 'Re: _TEST sans classement', corps: 'Bonjour,', citation: null,
      destinatairesApproximatifs: false, filId: 36575, repondALeMessageId: 57261,
    },
  },
  {
    nom: 'réponse à tous',
    b: {
      id: 902, voie: 'repondre_tous', a: ['gabrielle@exemple.test'], cc: ['autre@exemple.test'], cci: [],
      objet: 'Re: _TEST sans classement', corps: 'Bonjour,', citation: null,
      destinatairesApproximatifs: false, filId: 36575, repondALeMessageId: 57261,
    },
  },
  {
    nom: 'transfert',
    b: {
      id: 903, voie: 'transferer', a: ['gabrielle@exemple.test'], cc: [], cci: [],
      objet: 'Tr: _TEST sans classement', corps: 'Bonjour,', citation: null,
      destinatairesApproximatifs: false, filId: 36575, repondALeMessageId: 57261,
    },
  },
  {
    nom: 'transfert de pièce',
    b: {
      id: 904, voie: 'transferer_piece', a: ['gabrielle@exemple.test'], cc: [], cci: [],
      objet: 'Tr: _TEST pièce', corps: 'Bonjour,', citation: null,
      destinatairesApproximatifs: false, filId: 36575, repondALeMessageId: 57261,
    },
  },
];

let container: HTMLDivElement;
let root: Root;
let appels: { url: string; methode: string }[];
let ferme = 0;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = []; ferme = 0;
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, init?: { method?: string }) => {
    const url = String(entree);
    appels.push({ url, methode: (init?.method ?? 'GET').toUpperCase() });
    if (/\/classement$/.test(url)) {
      return new Response(JSON.stringify({ etat: 'ok', contexte: { disponible: true, interneDabord: false, biens: [] } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(
      JSON.stringify({ ok: true, gmail: 'sans_objet', message: 'Brouillon supprimé définitivement.', brouillon: { id: 4242 } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); }); };

let courant: BrouillonEcran;
const monter = async (depart: BrouillonEcran): Promise<void> => {
  courant = depart;
  const rendre = (): void => { root.render(createElement(Redaction, {
    dansFenetre: true, brouillon: courant, contexte: CONTEXTE,
    onChange: (b: BrouillonEcran) => { courant = b; rendre(); },
    onFerme: () => { ferme += 1; }, onEnvoye: () => {}, onGeste: () => {},
  } as never)); };
  await act(async () => { rendre(); });
  await calmer();
};

const parMot = (mot: string): HTMLButtonElement | undefined => [...container.querySelectorAll('button')]
  .find((b) => (b.textContent ?? '').trim() === mot) as HTMLButtonElement | undefined;
const boutonEnvoyer = (): HTMLButtonElement => [...container.querySelectorAll('button')]
  .find((b) => /^Envoyer/.test((b.textContent ?? '').trim())) as HTMLButtonElement;
/** Le bouton d'une confirmation, cherché DANS sa phrase : « Supprimer » est aussi le début de l'autre bouton. */
const dansLaConfirmation = (mot: string): HTMLButtonElement | undefined => {
  const p = container.querySelector('.red-supprime');
  return p === null ? undefined : [...p.querySelectorAll('button')]
    .find((b) => (b.textContent ?? '').trim() === mot) as HTMLButtonElement | undefined;
};
const cliquer = async (el: Element | undefined): Promise<void> => {
  await act(async () => { (el as HTMLElement | undefined)?.click(); });
  await calmer();
};
const suppressions = (): { url: string; methode: string }[] =>
  appels.filter((a) => a.methode === 'DELETE' && /\/gestion\/brouillons/.test(a.url));
const envois = (): number => appels.filter((a) => a.methode !== 'GET' && /\/gestion\/envois/.test(a.url)).length;

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 LA RÈGLE, À SA SOURCE : LE CLASSEMENT NE COMMANDE QUE « ENVOYER »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① une seule règle, dans le module pur', () => {
  it('🔴🔴 seul « envoyer » exige un classement', () => {
    expect(classementExigePour('envoyer')).toBe(true);
    for (const g of ['garder', 'corbeille', 'supprimer'] as GesteSurBrouillon[]) {
      expect(classementExigePour(g), g).toBe(false);
    }
  });

  /**
   * 🔴 ET C'EST LA SEULE ÉCRITURE : l'éditeur l'appelle, il ne la redit pas. Arno demande « une seule règle, pas
   * une rustine par écran » — et l'éditeur est le MÊME composant pour les sept points d'entrée.
   */
  it('🔴🔴 l’éditeur appelle la règle et ne la réécrit pas', () => {
    const red = readFileSync('app/(admin)/admin/(protected)/gestion/Redaction.tsx', 'utf8');
    for (const g of ['supprimer', 'corbeille', 'garder']) {
      expect(red, g).toContain(`classementExigePour('${g}')`);
    }
    /* 🔴 LES TROIS GESTES EFFACENT AUSSI L'AVERTISSEMENT : il ne répond qu'à « Envoyer ». */
    expect((red.match(/setEnvoiRefuse\(false\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
    /* 🔴 ET UN SEUL ENDROIT L'ALLUME : le clic sur « Envoyer ». */
    expect((red.match(/setEnvoiRefuse\(true\)/g) ?? []).length).toBe(1);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 SUPPRIMER UN BROUILLON NON CLASSÉ — POUR CHAQUE TYPE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② « Supprimer le brouillon » sans classement', () => {
  for (const { nom, b } of TYPES) {
    it(`🔴🔴 ${nom} : la confirmation s’affiche, puis le brouillon part`, async () => {
      await monter(b);
      /* 🔴 AVANT TOUT CLIC : aucune ligne rouge. C'est le défaut qu'Arno a constaté. */
      expect(container.querySelector('.red-non-classe')).toBeNull();

      await cliquer(parMot(MOTS_SUPPRIMER_BROUILLON.bouton));
      /* 🔴🔴 LA CONFIRMATION HABITUELLE, mot pour mot — et toujours aucune demande de classement. */
      expect(container.querySelector('.red-supprime')?.textContent)
        .toContain(MOTS_SUPPRIMER_BROUILLON.question);
      expect(container.querySelector('.red-non-classe')).toBeNull();
      expect(suppressions()).toHaveLength(0);

      await cliquer(dansLaConfirmation(MOTS_SUPPRIMER_BROUILLON.confirmer));
      /* 🔴🔴 LE GESTE PART, ET IL PART DÉFINITIF. */
      const dels = suppressions();
      expect(dels).toHaveLength(1);
      expect(dels[0].url).toContain(`id=${b.id}`);
      expect(dels[0].url).toContain('definitif=1');
      /* 🔴 ET L'ÉDITEUR SE FERME : le brouillon disparaît, comme au lot BROUILLON-ACCES-SUPPRESSION. */
      expect(ferme).toBe(1);
      expect(container.querySelector('.red-non-classe')).toBeNull();
    });
  }

  /**
   * 🔴 LA CORBEILLE DE LA BARRE D'OUTILS N'EXIGE RIEN NON PLUS. C'est l'autre geste qui jette, et il serait
   * absurde qu'il demande ce que son voisin ne demande pas.
   */
  it('🔴 la corbeille des outils jette aussi sans classement', async () => {
    await monter(TYPES[0].b);
    /* ⚠️ ON LA DÉSIGNE PAR SA CLASSE : son libellé change avec la migration 276 (« Mettre à la corbeille » ou
       « Supprimer le brouillon »), et c'est le BOUTON qu'on veut, pas l'un de ses deux mots. */
    const corbeille = container.querySelector('.red-outil--rouge') ?? undefined;
    await cliquer(corbeille);
    expect(container.querySelector('.red-supprime')).not.toBeNull();
    expect(container.querySelector('.red-non-classe')).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 « GARDER EN BROUILLON » SANS CLASSEMENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ « Garder en brouillon » sans classement', () => {
  for (const { nom, b } of TYPES) {
    it(`🔴 ${nom} : la fenêtre se ferme, sans rien demander`, async () => {
      await monter(b);
      const garder = parMot('Garder en brouillon');
      expect(garder?.disabled).toBe(false);
      await cliquer(garder);
      expect(ferme).toBe(1);
      expect(container.querySelector('.red-non-classe')).toBeNull();
      expect(envois()).toBe(0);
    });
  }
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ 🔴🔴 ENVOYER SANS CLASSEMENT — TOUJOURS REFUSÉ, ET L'ÉCRAN LE DIT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ④ « Envoyer » sans classement', () => {
  for (const { nom, b } of TYPES) {
    it(`🔴🔴 ${nom} : refusé, avec le message, et RIEN ne part`, async () => {
      await monter(b);
      await cliquer(boutonEnvoyer());
      expect(container.querySelector('.red-non-classe')?.textContent).toBe(MOTIF_NON_CLASSE);
      /* 🔴🔴 LA PROTECTION D'ARNO EST INTACTE : aucun compte à rebours, aucune requête d'envoi. */
      expect(container.querySelector('.red-rebours')).toBeNull();
      expect(envois()).toBe(0);
    });
  }

  /** 🔴 ET LE REFUS NE SURVIT PAS À UNE SUPPRESSION : on supprime, le message s'en va avec la fenêtre. */
  it('🔴🔴 le refus d’envoi n’est plus affiché quand on supprime ensuite', async () => {
    await monter(TYPES[0].b);
    await cliquer(boutonEnvoyer());
    expect(container.querySelector('.red-non-classe')).not.toBeNull();
    await cliquer(parMot(MOTS_SUPPRIMER_BROUILLON.bouton));
    /* 🔴 LE GESTE DE SUPPRESSION ÉTEINT L'AVERTISSEMENT DE L'ENVOI : il ne lui répond pas. */
    expect(container.querySelector('.red-non-classe')).toBeNull();
    expect(container.querySelector('.red-supprime')?.textContent)
      .toContain(MOTS_SUPPRIMER_BROUILLON.question);
  });

  /**
   * 🔴🔴 LA CONFIRMATION EST SOUS LA RANGÉE, PAS AU-DESSUS. C'est la seconde moitié de la cause : on cliquait, et
   * la réponse paraissait de l'autre côté des boutons. On éprouve l'ORDRE du document — jsdom ne fait pas de mise
   * en page, mais l'ordre, lui, est ce qui décide où la phrase se pose.
   */
  it('🔴🔴 la confirmation paraît APRÈS la rangée des boutons', async () => {
    await monter(TYPES[0].b);
    await cliquer(parMot(MOTS_SUPPRIMER_BROUILLON.bouton));
    const rangee = container.querySelector('.red-bas');
    const confirmation = container.querySelector('.red-supprime');
    expect(rangee).not.toBeNull();
    expect(confirmation).not.toBeNull();
    /* `DOCUMENT_POSITION_FOLLOWING` : la confirmation vient APRÈS la rangée dans le document. */
    const apres = (rangee as Node).compareDocumentPosition(confirmation as Node)
      & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(apres).toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ 🔒 CÔTÉ SERVEUR — LA SUPPRESSION N'EXIGE RIEN, L'ENVOI EXIGE TOUJOURS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒 ⑤ les deux routes', () => {
  /**
   * 🔴🔴 LA ROUTE DES BROUILLONS N'IMPORTE PAS LE GARDE DE CLASSEMENT, et c'est structurel plutôt que promis :
   * elle ne peut donc pas exiger un classement, même par erreur de câblage un jour.
   */
  it('🔴🔴 la route des brouillons n’a aucun contrôle de classement', () => {
    const route = readFileSync('app/(admin)/api/admin/gestion/brouillons/route.ts', 'utf8');
    expect(route).not.toContain('classementAvantEnvoi');
    expect(route).not.toContain('refusSiNonClasse');
    expect(route).not.toContain('classementFait');
    /* ⚠️ ET ELLE PORTE BIEN LA SUPPRESSION DÉFINITIVE : sans elle, ce cas ne protégerait rien. */
    expect(route).toContain("parametres.get('definitif') === '1'");
  });

  /**
   * 🔴🔴 L'ENVOI, LUI, L'EXIGE — AUX DEUX ENDROITS OÙ LA DÉCISION SE PREND : le moteur d'envoi et la route qui
   * met en file. « Le garde doit être là où la décision est prise » (encadré de la route), et il y est resté.
   */
  it('🔴🔴 l’envoi refuse toujours un mail non classé, des deux côtés', () => {
    const moteur = readFileSync('app/lib/gestion/envoi.ts', 'utf8');
    expect(moteur).toContain('const nonClasse = refusSiNonClasse(d);');
    expect(moteur).toContain("return { ok: false, code: 'invalide', motif: nonClasse };");
    const route = readFileSync('app/(admin)/api/admin/gestion/envois/route.ts', 'utf8');
    expect(route).toContain('const nonClasse = refusSiNonClasse(demande);');
    expect(route).toContain("{ status: 422 }");
  });
});
