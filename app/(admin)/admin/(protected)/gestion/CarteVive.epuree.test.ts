// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { CarteVive } from './CarteVive';
import type { CarteEvenement } from '../../../../lib/gestion/fileRepo';
/* 🔴🔴 LOT CAPSULE-TYPE-EVENEMENT — la SOURCE UNIQUE des types, et le calcul de leur ton. */
import { tonDuType, TYPES_EVENEMENT, type TypeEvenement } from '../../../../lib/gestion/evenementQualite';

/**
 * ══ 🔴🔴 LOT CARTE-EVENEMENT-EPUREE — CE QUE LA CARTE D'UN ÉVÉNEMENT MONTRE, ET CE QU'ELLE NE MONTRE PLUS ════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ACCORD D'ARNO (07/10/2026), sur la carte de l'événement « Re: NOTE INFORMATION RESIDENCE DE L'ORNE… »
 * (GES-2026-000001), écran partagé — et sur la MÊME carte en plein écran, puisque c'est le même composant :
 *
 *   ① la RÉFÉRENCE (« GES-2026-000001 ») et l'ÉTAT (« En cours ») quittent la carte. Ils restent ailleurs ;
 *   ② le TYPE (Travaux / Fuite d'eau / Administratif / Litige) prend leur place. Pas de type ⇒ rien ;
 *   ③ la capsule verte MONGA passe JUSTE SOUS la vignette de droite et dit la DERNIÈRE ÉTAPE MONGA ;
 *   ④ l'adresse sous le gros bouton rouge disparaît (doublon de la carte au-dessus) ;
 *   ⑤ « dernier échange il y a N jours » ne s'écrit plus qu'UNE fois ;
 *   ⑥ l'adresse perd le « lot N — » qui la précédait.
 *
 * 🔒 Aucun réseau : `fetch` est doublé. Aucune base. Et aucun mail ni événement RÉEL n'est touché — ce fichier
 * monte le composant sur des cartes fabriquées.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAINTENANT = new Date('2026-10-07T12:00:00Z');

/** La carte d'Arno, telle que la base la rend : ouverte le 23/09, dernier échange le 30/09, un bien, pas de type. */
const CARTE = (o: Partial<CarteEvenement> = {}): CarteEvenement => ({
  evenementId: 1, reference: 'GES-2026-000001',
  objet: 'Re: NOTE INFORMATION RESIDENCE DE L’ORNE - CHANGEMENT',
  demandeur: 'Sarah MEZIANE', adresseLibre: null, etat: 'en_cours',
  ouvertLe: '2026-09-23T20:23:23Z', dernierEchangeLe: '2026-09-30T10:00:00Z',
  nbFils: 1, nbMailsDeplaces: 0, attend: false,
  derniereEtape: {
    type: 'intervention', titre: null, survenuLe: '2026-10-13T00:00:00Z',
    heureConnue: false, source: 'manuelle', certitude: 'fiable',
  },
  derniereEtapeMonga: null,
  mongaMajLe: null, vuLe: null, mongaRefs: [],
  categorie: null,
  bien: {
    cle: '315', adresse: '67 rue de Normandie', commune: 'COURBEVOIE',
    proprietaire: null, locataire: null,
  },
  nbBiens: 1,
  ...o,
});

let container: HTMLDivElement;
let root: Root;
/** Ce que la route du détail rend quand la carte est dépliée. Piloté par le test. */
let biensServis: { cle: string; adresse: string | null; commune: string | null }[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  biensServis = [{ cle: '315', adresse: '67 rue de Normandie', commune: 'COURBEVOIE' }];
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (/\/evenements\/\d+$/.test(u)) {
      return {
        ok: true, status: 200,
        json: async () => ({
          evenementId: 1, reference: 'GES-2026-000001', objet: 'Re: NOTE INFORMATION',
          demandeurNom: 'Sarah MEZIANE', demandeurEmail: null, adresseLibre: null, etat: 'en_cours',
          ouvertLe: '2026-09-23T20:23:23Z', ouvertPar: 'arno', traiteLe: null, traitePar: null,
          fils: [], mailsDeplaces: [], biens: biensServis,
        }),
      } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
const monter = async (carte: CarteEvenement, partage = false) => {
  await act(async () => {
    root.render(createElement(CarteVive, {
      carte, maintenant: MAINTENANT, partage, onGeste: () => {},
      ...(partage ? { onOuvrirBien: () => {} } : {}),
    } as never));
  });
  await calmer();
};
/** Le texte de la VIGNETTE (le titre repliable), c'est-à-dire la carte telle qu'on la voit fermée. */
const vignette = (): string => container.querySelector('.gst-carte-titre')?.textContent ?? '';
const deplier = async () => {
  const b = [...container.querySelectorAll('button')].find((x) => x.getAttribute('aria-expanded') !== null);
  await act(async () => { b?.click(); }); await calmer();
};

describe('🔴🔴 ① la carte ne porte plus la référence ni l’état', () => {
  it('🔴🔴 ni « GES-2026-000001 », ni « En cours »', async () => {
    await monter(CARTE());
    expect(container.querySelector('.gst-ref')).toBeNull();
    expect(vignette()).not.toContain('GES-2026-000001');
    expect(vignette()).not.toContain('En cours');
  });

  /** ⚠️ ET LES TROIS ÉTATS SONT PARTIS, pas seulement celui de la carte d'Arno. */
  it('⚠️ aucun des trois états ne s’écrit sur la carte', async () => {
    for (const etat of ['a_traiter', 'en_cours', 'traite'] as const) {
      await monter(CARTE({ etat }));
      for (const mot of ['À traiter', 'En cours', 'Traité']) expect(vignette(), etat).not.toContain(mot);
      act(() => { root.unmount(); });
      container.innerHTML = ''; root = createRoot(container);
    }
  });

  /**
   * ══ 🔴🔴 CE CAS A CHANGÉ DE VERDICT — LOT ACCUEIL-GESTION-ANNUAIRE, POINT 5 ═══════════════════════════════════
   *
   * IL EXIGEAIT QUE LE COMPTEUR « N échange » RESTE : c'était la demande du lot précédent, le même jour. Arno le
   * retire à son tour — « la ligne “Ouvert depuis N jours · dernier échange il y a N jours” reste ». C'est elle
   * qui dit l'activité du dossier, et le compteur la redisait d'une autre façon.
   */
  it('🔴🔴 le compteur « N échange » a quitté la carte', async () => {
    await monter(CARTE());
    /* ⚠️ ON CHERCHE UN NOMBRE SUIVI DE « échange », et non le mot seul : « dernier échange il y a 7 jours »
       contient le mot, et c'est précisément la ligne qu'Arno garde. */
    expect(vignette()).not.toMatch(/\d+\s+échanges?/);
    /* 🔴 ET CE QUI LE REMPLACE EST DÉJÀ LÀ : la ligne des deux anciennetés. */
    expect(vignette()).toContain('dernier échange il y a 7 jours');
  });
});

/**
 * ══ 🔴🔴 BLOC RÉÉCRIT LE 07/10/2026 — LOT CAPSULE-TYPE-EVENEMENT ════════════════════════════════════════════════
 *
 * IL S'INTITULAIT « ② le TYPE prend leur place » et exigeait DEUX choses que le nouveau lot renverse :
 *   · que le type s'écrive dans `.gst-carte-type`, c'est-à-dire DANS LA COLONNE DE TEXTE DE GAUCHE ;
 *   · que SANS type, RIEN ne s'affiche.
 *
 * ARNO (07/10/2026, 4e demande) : « une capsule qui affiche le type, placée JUSTE EN DESSOUS de la vignette
 * d'étape de droite […] Le type sort de la colonne de texte de gauche : le mot “Travaux” est DÉPLACÉ dans la
 * capsule, pas doublé. […] Événement SANS type : la capsule est quand même là, en gris neutre, avec “Type à
 * définir”. […] Cette règle remplace “pas de type → rien” du lot CARTE-EVENEMENT-EPUREE : Arno veut toujours
 * voir l'information. »
 *
 * 🔴 CE QUE L'ANCIENNE RÈGLE PROTÉGEAIT EST TENU, ET MIEUX : elle interdisait d'écrire « Non précisée » — un
 * libellé qui se lit comme un type alors qu'il n'y en a pas. C'est toujours interdit, et éprouvé ci-dessous ;
 * ce qui le remplace est « Type à définir », qui dit ce qu'il faut FAIRE au lieu de constater un vide.
 */
describe('🔴🔴 ② le TYPE est une CAPSULE, sous la vignette de droite', () => {
  it.each([
    ['travaux', 'Travaux'],
    ['fuite_eau', 'Fuite d’eau'],
    ['administratif', 'Administratif'],
    ['litige', 'Litige'],
  ])('🔴 « %s » s’affiche « %s » dans la capsule', async (categorie, mot) => {
    await monter(CARTE({ categorie }));
    expect(container.querySelector('.gst-type-capsule')?.textContent).toBe(mot);
    /* 🔴 ET IL A QUITTÉ LA COLONNE DE GAUCHE : plus de `.gst-carte-type`, nulle part. */
    expect(container.querySelector('.gst-carte-type')).toBeNull();
  });

  /**
   * 🔴🔴 PAS DE TYPE ⇒ LA CAPSULE EST LÀ QUAND MÊME, et elle dit quoi faire. C'est le cas de GES-2026-000001,
   * la seule carte réelle sans type au moment du lot.
   */
  it('🔴🔴 aucun type renseigné : « Type à définir », et pas « Non précisée »', async () => {
    await monter(CARTE({ categorie: null }));
    const c = container.querySelector('.gst-type-capsule');
    expect(c).not.toBeNull();
    expect(c?.textContent).toContain('Type à définir');
    expect(c?.className).toContain('gst-type-capsule--vide');
    /* 🔴 LE LIBELLÉ INTERDIT LE RESTE : « Non précisée » se lirait comme un type. */
    expect(vignette()).not.toContain('Non précisée');
  });

  /**
   * ⚠️ UNE VALEUR VIDE OU INCONNUE VAUT « PAS DE TYPE ». `motCategorie` rend « Non précisée » pour tout ce
   * qu'il ne reconnaît pas : l'afficher mettrait un type là où il n'y en a pas. C'est `categorieValide` — la
   * même fonction que les deux formulaires — qui tranche.
   */
  it.each(['', '   ', 'inconnu'])('⚠️ « %s » retombe sur « Type à définir »', async (categorie) => {
    await monter(CARTE({ categorie }));
    expect(container.querySelector('.gst-type-capsule')?.className).toContain('gst-type-capsule--vide');
    expect(vignette()).not.toContain('Non précisée');
  });

  /**
   * 🔴🔴 QUATRE TYPES, QUATRE TONS DISTINCTS (Arno). On lit la CLASSE rendue, c'est-à-dire ce que la feuille
   * appliquera — pas la fonction qui la calcule, éprouvée à part dans `typeEvenement.test.ts`.
   */
  it('🔴🔴 les quatre types portent quatre tons distincts', async () => {
    const tons: string[] = [];
    for (const cle of ['travaux', 'fuite_eau', 'administratif', 'litige']) {
      await monter(CARTE({ categorie: cle }));
      const classe = container.querySelector('.gst-type-capsule')?.className ?? '';
      tons.push(classe.split(/\s+/).find((c) => c.startsWith('gst-type-capsule--')) ?? '');
      act(() => { root.unmount(); });
      container.innerHTML = ''; root = createRoot(container);
    }
    expect(new Set(tons).size).toBe(4);
    expect(tons).not.toContain('');
    expect(tons).not.toContain('gst-type-capsule--vide');
  });
});

describe('🔴🔴 ③ la capsule MONGA, sous la vignette de droite', () => {
  const MONGA = CARTE({
    mongaRefs: ['MNG-23830'],
    derniereEtapeMonga: {
      type: 'devis_recu', titre: null, survenuLe: '2026-10-05T00:00:00Z',
      heureConnue: false, source: 'monga', certitude: 'fiable',
    },
  });

  it('🔴🔴 elle est là, et elle dit la dernière étape Monga', async () => {
    await monter(MONGA);
    const c = container.querySelector('.gst-monga-vignette');
    expect(c).not.toBeNull();
    expect(c?.textContent).toContain('MONGA');
    expect(c?.textContent).toContain('Devis reçu');
  });

  /**
   * 🔴🔴 « JUSTE EN DESSOUS DE LA VIGNETTE DE DROITE » (Arno) : la capsule et la miniature partagent la même
   * colonne, et la capsule vient APRÈS. Une capsule restée dans la ligne de gauche aurait l'air d'un mot de
   * plus sur une ligne déjà chargée.
   */
  /**
   * ⚠️ RANG MIS À JOUR LE 07/10/2026 — LOT CAPSULE-TYPE-EVENEMENT. La capsule Monga était la DEUXIÈME de la
   * colonne ; elle est maintenant la TROISIÈME, parce qu'Arno intercale le type : « l'ordre est : vignette
   * d'étape → capsule de type → capsule Monga. Toutes à la même largeur. » La règle — Monga vit dans la colonne
   * de droite, sous la vignette — n'a pas bougé d'un pouce.
   */
  it('🔴🔴 elle est dans la colonne de droite, après la miniature ET après le type', async () => {
    await monter(MONGA);
    const colonne = container.querySelector('.gst-carte-droite');
    expect(colonne).not.toBeNull();
    const enfants = [...(colonne?.children ?? [])].map((e) => e.className);
    expect(enfants[0]).toContain('gst-mini');
    expect(enfants[1]).toContain('gst-type-capsule');
    expect(enfants[2]).toContain('gst-monga-vignette');
    /* 🔴 ET LES TROIS ONT LA MÊME LARGEUR parce qu'AUCUNE ne la fixe : c'est la colonne qui les étire. */
    const feuille = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
    expect(feuille).toContain('.gst-carte-droite{flex:0 0 auto;display:flex;flex-direction:column;'
      + 'align-items:stretch;gap:3px;width:132px}');
    const capsule = feuille.slice(feuille.indexOf('.gst-type-capsule{'));
    expect(capsule.slice(0, capsule.indexOf('}'))).not.toContain('width:');
  });

  /** 🔴 PAS D'ÉVÉNEMENT MONGA ⇒ PAS DE CAPSULE (Arno). C'est le cas ordinaire, et celui de GES-2026-000001. */
  it('🔴🔴 aucune référence MNG : aucune capsule', async () => {
    await monter(CARTE());
    expect(container.querySelector('.gst-monga-vignette')).toBeNull();
  });

  /**
   * ⚠️ SUIVI PAR MONGA MAIS AUCUNE ÉTAPE VENUE DE MONGA : la capsule reste, et se contente de « MONGA » —
   * exactement ce qu'elle disait avant ce lot. On n'invente pas une étape qu'on n'a pas lue.
   */
  it('⚠️ référence MNG sans étape Monga : « MONGA » seul', async () => {
    await monter(CARTE({ mongaRefs: ['MNG-23830'], derniereEtapeMonga: null }));
    const c = container.querySelector('.gst-monga-vignette');
    expect(c?.textContent).toContain('MONGA');
    expect(c?.textContent).toContain('MNG-23830'); // le lecteur d'écran garde la référence
  });

  /**
   * 🔴 LA DERNIÈRE ÉTAPE **MONGA**, ET NON LA DERNIÈRE TOUT COURT. Un dossier dont la dernière carte a été posée
   * à la main n'en est pas moins suivi par Monga : la capsule annonce l'avancement CHEZ MONGA.
   */
  it('🔴 une étape manuelle plus récente ne change pas ce que la capsule annonce', async () => {
    await monter(CARTE({
      mongaRefs: ['MNG-23830'],
      derniereEtape: {
        type: 'intervention', titre: null, survenuLe: '2026-10-13T00:00:00Z',
        heureConnue: false, source: 'manuelle', certitude: 'fiable',
      },
      derniereEtapeMonga: {
        type: 'devis_recu', titre: null, survenuLe: '2026-10-05T00:00:00Z',
        heureConnue: false, source: 'monga', certitude: 'fiable',
      },
    }));
    expect(container.querySelector('.gst-monga-vignette')?.textContent).toContain('Devis reçu');
    /* ⚠️ Et la MINIATURE, elle, montre bien la dernière étape toutes sources confondues. */
    expect(container.querySelector('.gst-mini')?.textContent).toContain('Intervention');
  });
});

describe('🔴🔴 ④ plus d’adresse sous le gros bouton', () => {
  it('🔴🔴 le bouton reste, la ligne d’adresse a disparu', async () => {
    await monter(CARTE(), true);
    await deplier();
    const bouton = [...container.querySelectorAll('button')]
      .find((b) => (b.textContent ?? '').includes('Ouvrir la fiche du bien sur cet événement'));
    expect(bouton).not.toBeUndefined();
    /* 🔴 L'ADRESSE N'APPARAÎT PLUS QU'UNE FOIS SUR TOUTE LA CARTE : celle de la vignette. */
    const occurrences = (container.textContent ?? '').split('67 rue de Normandie').length - 1;
    expect(occurrences).toBe(1);
  });

  /**
   * ⚠️ LA NOTE DU CAS « PLUSIEURS BIENS » N'EST PAS CONCERNÉE : elle ne dit pas une adresse, elle dit combien
   * il y en a — et c'est ce qui explique que le bouton ouvre un choix plutôt qu'une fiche.
   */
  it('⚠️ plusieurs biens : la note qui les compte reste', async () => {
    biensServis = [
      { cle: '315', adresse: '67 rue de Normandie', commune: 'COURBEVOIE' },
      { cle: '421', adresse: '12 rue de Paris', commune: 'PUTEAUX' },
    ];
    await monter(CARTE({ nbBiens: 2 }), true);
    await deplier();
    expect(container.textContent).toContain('2 biens concernés');
  });
});

describe('🔴🔴 ⑤ « dernier échange » ne s’écrit plus qu’une fois', () => {
  it('🔴🔴 une seule occurrence, celle qui accompagne « Ouvert depuis »', async () => {
    await monter(CARTE());
    const texte = vignette();
    expect(texte.split('dernier échange').length - 1).toBe(1);
    /* 🔴 ET C'EST BIEN CELLE-LÀ QUI RESTE : la ligne complète, pas le bout isolé. */
    expect(texte).toContain('Ouvert depuis 13 jours');
    expect(texte).toContain('dernier échange il y a 7 jours');
  });

  /** ⚠️ SANS DATE DE DERNIER ÉCHANGE, la ligne ne dit que l'ouverture — et rien ne se répète. */
  it('⚠️ aucun échange daté : « Ouvert depuis » seul', async () => {
    await monter(CARTE({ dernierEchangeLe: null }));
    expect(vignette()).toContain('Ouvert depuis 13 jours');
    expect(vignette()).not.toContain('dernier échange');
  });
});

describe('🔴🔴 ⑥ l’adresse perd le « lot N — »', () => {
  it('🔴🔴 « 67 rue de Normandie, COURBEVOIE », sans le numéro de lot devant', async () => {
    await monter(CARTE());
    const ligne = container.querySelector('.gst-carte-ligne--adresse')?.textContent ?? '';
    expect(ligne).toContain('67 rue de Normandie, COURBEVOIE');
    expect(ligne).not.toContain('lot 315');
  });

  /**
   * ⚠️ LE LOT RESTE LE SEUL NOM D'UN BIEN SANS ADRESSE : sans lieu à écrire, « lot 315 » demeure. Le taire
   * ferait disparaître la ligne, et avec elle le seul moyen de savoir de quel bien on parle. Arno demande de ne
   * plus le mettre DEVANT une adresse, pas de le supprimer.
   */
  it('⚠️ un bien sans adresse garde « lot 315 »', async () => {
    await monter(CARTE({
      bien: { cle: '315', adresse: null, commune: null, proprietaire: null, locataire: null },
    }));
    expect(container.querySelector('.gst-carte-ligne--adresse')?.textContent).toContain('lot 315');
  });

  /** ⚠️ ET LE « (+ N autres biens) » N'EST PAS TOUCHÉ : il dit ce que la vignette tait. */
  it('⚠️ la mention des autres biens reste', async () => {
    await monter(CARTE({ nbBiens: 3 }));
    expect(container.querySelector('.gst-carte-ligne--adresse')?.textContent)
      .toContain('(+ 2 autres biens)');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT CAPSULE-TYPE-EVENEMENT — CE QUE LA CAPSULE FAIT, ET CE QU'ELLE DEVIENT QUAND LA SOURCE S'ÉTEND
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ⑦ « Type à définir » mène au choix du type', () => {
  const capsule = (): HTMLElement | null => container.querySelector('.gst-type-capsule');
  /** Le `<select>` du type, dans le formulaire « Modifier les informations de l'événement ». */
  const choixDuType = (): HTMLSelectElement | null => {
    const champ = [...container.querySelectorAll('label.gst-champ')]
      .find((l) => l.querySelector('.svv-label')?.textContent === 'Type');
    return champ?.querySelector('select') ?? null;
  };

  /** ⚠️ RIEN N'EST OUVERT AU DÉPART : la carte arrive repliée, comme toujours. */
  it('⚠️ au repos : la capsule est là, le dossier est replié', async () => {
    await monter(CARTE({ categorie: null }));
    expect(capsule()?.textContent).toContain('Type à définir');
    expect(choixDuType()).toBeNull();
  });

  /**
   * 🔴🔴 LE GESTE D'ARNO, EN ENTIER : un clic sur « Type à définir » déplie le dossier ET ouvre le formulaire
   * existant, qui porte le choix du type. Aucun écran nouveau — c'est le formulaire du bouton « Modifier les
   * informations de l'événement ».
   */
  it('🔴🔴 un clic sur la capsule ouvre le choix du type', async () => {
    await monter(CARTE({ categorie: null }));
    await act(async () => { (capsule() as HTMLElement).click(); });
    await calmer();
    const select = choixDuType();
    expect(select).not.toBeNull();
    /* 🔴 ET IL PROPOSE LES QUATRE TYPES, plus « Type à définir » pour n'en choisir aucun. */
    const mots = [...(select?.options ?? [])].map((o) => o.textContent);
    expect(mots).toEqual(['Type à définir', 'Travaux', 'Fuite d’eau', 'Administratif', 'Litige']);
    /* ⚠️ ET LA VALEUR COURANTE EST BIEN « AUCUN » : on ouvre sur l'état réel, pas sur une proposition. */
    expect(select?.value).toBe('');
  });

  /**
   * 🔴🔴 LE CLIC NE REFERME PAS UN DOSSIER DÉJÀ OUVERT, et c'est tout l'intérêt de l'interception en phase de
   * CAPTURE : la capsule vit dans le bouton de titre du repli, et sans elle le clic aurait basculé le repli —
   * on aurait fermé la carte au lieu d'ouvrir le choix.
   */
  it('🔴🔴 sur une carte déjà dépliée, le clic ouvre le choix sans la refermer', async () => {
    await monter(CARTE({ categorie: null }));
    await deplier();
    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
    await act(async () => { (capsule() as HTMLElement).click(); });
    await calmer();
    expect(container.querySelector('button[aria-expanded="true"]'), 'le dossier doit rester ouvert').not.toBeNull();
    expect(choixDuType()).not.toBeNull();
  });

  /**
   * ⚠️ UNE CAPSULE QUI PORTE DÉJÀ UN TYPE NE SE CLIQUE PAS : elle informe. Cliquer dessus bascule le repli comme
   * n'importe quel autre point de la vignette — c'est le geste ordinaire, et il ne faut pas le lui voler.
   */
  it('⚠️ une capsule avec un type garde le comportement ordinaire de la vignette', async () => {
    await monter(CARTE({ categorie: 'travaux' }));
    expect(capsule()?.className).not.toContain('gst-type-capsule--vide');
    await act(async () => { (capsule() as HTMLElement).click(); });
    await calmer();
    /* Le repli a basculé — et le formulaire ne s'est PAS ouvert tout seul. */
    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
    expect(choixDuType()).toBeNull();
  });
});

describe('🔴🔴 ⑧ un type ajouté à la SOURCE paraît partout, sans autre changement', () => {
  /**
   * ══ 🔴🔴 ON L'ÉPROUVE EN AJOUTANT VRAIMENT UN TYPE ════════════════════════════════════════════════════════════
   *
   * ARNO : « un type créé plus tard apparaît automatiquement partout (listes de choix, filtres, capsule) sans
   * toucher au code de chaque écran ». Une épreuve qui se contenterait de relire du code ne dirait pas cela : elle
   * dirait que le code a l'air bon. Ici, on POUSSE un cinquième type dans `TYPES_EVENEMENT`, on monte la carte, et
   * l'on regarde — la capsule, son ton, et la liste de choix.
   *
   * ⚠️ `readonly` EST UNE GARANTIE DE COMPILATION, PAS D'EXÉCUTION : le tableau est bien mutable à l'exécution,
   * et c'est ce qui rend cette épreuve possible. Le `finally` le remet dans son état, sans quoi tout le reste de
   * la suite verrait un cinquième type.
   */
  const NEUF = { cle: 'degat_eaux', mot: 'Dégât des eaux' };
  const avecLeType = async (faire: () => Promise<void>): Promise<void> => {
    (TYPES_EVENEMENT as TypeEvenement[]).push(NEUF);
    try { await faire(); } finally {
      const i = (TYPES_EVENEMENT as TypeEvenement[]).indexOf(NEUF);
      if (i >= 0) (TYPES_EVENEMENT as TypeEvenement[]).splice(i, 1);
    }
  };

  it('🔴🔴 il s’affiche dans la capsule, avec son mot et un ton de la palette', async () => {
    await avecLeType(async () => {
      await monter(CARTE({ categorie: 'degat_eaux' }));
      const c = container.querySelector('.gst-type-capsule');
      expect(c?.textContent).toBe('Dégât des eaux');
      /* 🔴 ET SON TON EST CELUI QUE LA SOURCE CALCULE : aucune couleur n'a été choisie à la main. */
      expect(c?.className).toContain(`gst-type-capsule--${tonDuType('degat_eaux')}`);
      expect(c?.className).not.toContain('gst-type-capsule--vide');
    });
  });

  it('🔴🔴 il entre dans la liste de choix du formulaire, sans toucher à l’écran', async () => {
    await avecLeType(async () => {
      await monter(CARTE({ categorie: null }));
      await act(async () => { (container.querySelector('.gst-type-capsule') as HTMLElement).click(); });
      await calmer();
      const champ = [...container.querySelectorAll('label.gst-champ')]
        .find((l) => l.querySelector('.svv-label')?.textContent === 'Type');
      const mots = [...(champ?.querySelector('select')?.options ?? [])].map((o) => o.textContent);
      expect(mots).toContain('Dégât des eaux');
      expect(mots).toHaveLength(6);
    });
  });

  /** ⚠️ ET LA SUITE RETROUVE SES QUATRE TYPES : l'épreuve ne laisse rien derrière elle. */
  it('⚠️ la source est rendue intacte après coup', () => {
    expect(TYPES_EVENEMENT.map((t) => t.cle)).toEqual(['travaux', 'fuite_eau', 'administratif', 'litige']);
  });
});
