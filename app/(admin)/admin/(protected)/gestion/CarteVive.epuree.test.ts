// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { CarteVive, FormulaireCarte } from './CarteVive';
import type { CarteEvenement } from '../../../../lib/gestion/fileRepo';
/* 🔴🔴 LOT CAPSULE-TYPE-EVENEMENT — la SOURCE UNIQUE des types, et le calcul de leur ton. */
import {
  tonDuType, TONS_TYPE_EVENEMENT, TYPES_EVENEMENT, type TypeEvenement,
} from '../../../../lib/gestion/evenementQualite';

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
  /* 🔴 LOT URGENCE-EVENEMENT — aucun niveau : la capsule est alors GRISE NEUTRE. */
  urgence: null,
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
/**
 * ══ 🔴🔴 LOT URGENCE-EVENEMENT — CE QUE LA CAPSULE MONTRE À L'ŒIL, SANS CE QU'ELLE DIT À L'OREILLE ═════════════
 *
 * La capsule porte désormais DEUX informations : le TYPE, écrit en toutes lettres, et le NIVEAU D'URGENCE, porté
 * par sa couleur — donc répété dans un `.gst-sr-only` pour qui ne voit pas la couleur (règle du module : jamais
 * une couleur seule). `textContent` les concatène, et les épreuves du TYPE deviendraient alors des épreuves de
 * la phrase entière.
 *
 * 🔴 ON RETIRE DONC LE TEXTE RÉSERVÉ AU LECTEUR D'ÉCRAN, sur une COPIE du nœud : ce que rend cette fonction est
 * exactement ce qu'Arno lit sur la capsule. Le texte caché, lui, est éprouvé à part — il porte sa propre règle.
 */
const capsuleVisible = (): string => {
  const c = container.querySelector('.gst-type-capsule');
  if (c === null) return '';
  const copie = c.cloneNode(true) as Element;
  for (const sr of copie.querySelectorAll('.gst-sr-only')) sr.remove();
  return copie.textContent ?? '';
};
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
    /* 🔴 LOT URGENCE-EVENEMENT — ON LIT LE TEXTE VISIBLE : la capsule dit AUSSI le niveau d'urgence, mais au
       seul lecteur d'écran (la couleur le porte à l'œil). Voir l'encadré de `capsuleVisible`. */
    expect(capsuleVisible()).toBe(mot);
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
   * ══ 🔴🔴 ÉPREUVE RENVERSÉE LE 08/10/2026 — LOT URGENCE-EVENEMENT, POINT 1 ═══════════════════════════════════
   *
   * ELLE EXIGEAIT « QUATRE TYPES, QUATRE TONS DISTINCTS » : la couleur de la capsule venait de la CLÉ du type
   * (`tonDuType`), et c'était la demande du lot CAPSULE-TYPE-EVENEMENT, la veille.
   *
   * ARNO REVIENT DESSUS (08/10/2026) : « La couleur de fond de la capsule de type ne dépend plus du type : elle
   * traduit le degré d'urgence de l'événement. Le texte affiché reste le type. » Quatre types au MÊME niveau
   * d'urgence portent donc désormais la MÊME couleur — et c'est exactement ce que cette épreuve vérifie, à
   * l'envers de ce qu'elle exigeait.
   *
   * 🔴 CE QUE L'ANCIENNE RÈGLE PROTÉGEAIT N'EST PAS PERDU : elle voulait qu'on distingue les types d'un coup
   * d'œil. Le MOT du type est toujours écrit en toutes lettres dans la capsule (éprouvé juste au-dessus), et
   * c'est lui qui portait déjà l'information — la couleur n'était qu'un appui, et elle appuie maintenant autre
   * chose.
   */
  it('🔴🔴 la couleur ne dépend PLUS du type : quatre types, un seul ton', async () => {
    const tons: string[] = [];
    for (const cle of ['travaux', 'fuite_eau', 'administratif', 'litige']) {
      await monter(CARTE({ categorie: cle, urgence: 'haute' }));
      const classe = container.querySelector('.gst-type-capsule')?.className ?? '';
      tons.push(classe.split(/\s+/).find((c) => c.startsWith('gst-type-capsule--urg-')) ?? '');
      act(() => { root.unmount(); });
      container.innerHTML = ''; root = createRoot(container);
    }
    expect(new Set(tons).size).toBe(1);
    expect(tons[0]).toBe('gst-type-capsule--urg-orange');
    /* 🔴 ET AUCUN TON DE TYPE NE SURVIT SUR LA CAPSULE : les sept règles existent encore dans la feuille, sans
       porteur (c'est dit à leur place), mais plus personne ne les applique ici. */
    for (const ton of TONS_TYPE_EVENEMENT) {
      expect(container.querySelector(`.gst-type-capsule--${ton}`), ton).toBeNull();
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT URGENCE-EVENEMENT, POINT 1 — LA COULEUR DE LA CAPSULE DIT L'URGENCE ═══════════════════════════════

   DEMANDE D'ARNO (08/10/2026) : « Trois niveaux, en couleurs TAMISÉES : Normal → vert ; Intermédiaire → orange ;
   Urgent → rouge. Événement sans niveau d'urgence enregistré : capsule grise neutre. »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
describe('🔴🔴 ②bis la COULEUR de la capsule traduit le degré d’urgence', () => {
  it.each([
    ['normale', 'gst-type-capsule--urg-vert'],
    ['haute', 'gst-type-capsule--urg-orange'],
    ['urgent', 'gst-type-capsule--urg-rouge'],
  ])('🔴 « %s » peint la capsule en %s', async (urgence, classe) => {
    await monter(CARTE({ categorie: 'travaux', urgence }));
    expect(container.querySelector('.gst-type-capsule')?.className).toContain(classe);
    /* 🔴 LE TEXTE RESTE LE TYPE, et rien d'autre : c'est la lettre de la demande. */
    expect(capsuleVisible()).toBe('Travaux');
  });

  /**
   * 🔴🔴 AUCUN NIVEAU ⇒ GRIS NEUTRE, ET SURTOUT PAS VERT. Ne pas avoir choisi n'est pas avoir choisi « Normal » :
   * c'est le quatrième état, et le confondre avec le premier ferait passer pour « pas urgent » tout dossier que
   * personne n'a encore regardé. C'est le cas des 2 événements de la base au 08/10/2026.
   */
  it('🔴🔴 aucun niveau : gris neutre, jamais le vert de « Normal »', async () => {
    await monter(CARTE({ categorie: 'travaux', urgence: null }));
    const c = container.querySelector('.gst-type-capsule');
    expect(c?.className).toContain('gst-type-capsule--sans-urgence');
    expect(c?.className).not.toContain('gst-type-capsule--urg-');
  });

  /** ⚠️ UNE VALEUR HORS LISTE VAUT « AUCUN NIVEAU » — `critique` comprise, depuis la migration 319. */
  it.each(['', '   ', 'critique', 'inconnu'])('⚠️ « %s » retombe sur le gris neutre', async (urgence) => {
    await monter(CARTE({ categorie: 'travaux', urgence }));
    expect(container.querySelector('.gst-type-capsule')?.className)
      .toContain('gst-type-capsule--sans-urgence');
  });

  /**
   * 🔴🔴 LES DEUX AXES SONT INDÉPENDANTS, et c'est le cas qu'une classe unique aurait rendu impossible : un
   * dossier URGENT que personne n'a encore qualifié. Fond rouge, bord pointillé, et il se clique.
   */
  it('🔴🔴 « Type à définir » peut être ROUGE : les deux axes ne se mélangent pas', async () => {
    await monter(CARTE({ categorie: null, urgence: 'urgent' }));
    const c = container.querySelector('.gst-type-capsule');
    expect(c?.className).toContain('gst-type-capsule--urg-rouge');
    expect(c?.className).toContain('gst-type-capsule--vide');
    expect(capsuleVisible()).toContain('Type à définir');
  });

  /**
   * 🔴 LA COULEUR NE PORTE PAS L'INFORMATION SEULE : le niveau est dit au lecteur d'écran, et dans la bulle.
   * Sans cela, le degré d'urgence n'existerait ni en niveaux de gris ni pour un daltonien.
   */
  it('🔴 le niveau est ÉCRIT pour le lecteur d’écran, et dans la bulle', async () => {
    await monter(CARTE({ categorie: 'travaux', urgence: 'urgent' }));
    const c = container.querySelector('.gst-type-capsule');
    expect(c?.textContent).toContain('urgence : Urgent');
    expect(c?.getAttribute('title')).toContain('Urgence : Urgent');
  });

  it('🔴 et l’absence de niveau est ÉCRITE aussi', async () => {
    await monter(CARTE({ categorie: 'travaux', urgence: null }));
    const c = container.querySelector('.gst-type-capsule');
    expect(c?.textContent).toContain('aucun niveau d’urgence enregistré');
    expect(c?.getAttribute('title')).toContain('Aucun niveau d’urgence enregistré');
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
   * ══ 🔴🔴 ÉPREUVES AMENDÉES LE 08/10/2026 — LOT CARTES-EVENEMENT-MEME-GESTE ════════════════════════════════
   *
   * ELLES EXIGEAIENT qu'un clic sur « Type à définir » DÉPLIE le dossier ET y ouvre le formulaire du type. Le
   * formulaire a quitté la carte avec tous les blocs de détail (« tout ce qui s'y affichait en plus des infos
   * manquantes et du bouton rouge disparaît », Arno) : il ne vit plus que dans la fiche du bien.
   *
   * 🔴 CE QUE L'ANCIENNE RÈGLE PROTÉGEAIT TIENT TOUJOURS, et c'est la moitié qui compte : la capsule n'est pas un
   * cul-de-sac. Elle DÉPLIE la carte — donc elle montre le bouton rouge, qui mène à la fiche, où le type se
   * choisit. Et elle ne REFERME jamais un dossier déjà ouvert, ce qui reste tout l'intérêt de l'interception en
   * phase de CAPTURE : la capsule vit DANS le bouton de titre du repli.
   */
  it('🔴🔴 un clic sur la capsule déplie le dossier, et mène au bouton rouge', async () => {
    await monter(CARTE({ categorie: null }));
    await act(async () => { (capsule() as HTMLElement).click(); });
    await calmer();
    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
    /* 🔴 LE CORPS EST MONTÉ, c'est-à-dire que le dossier est bien ouvert sous la vignette.
       ⚠️ LE BOUTON ROUGE N'EST PAS ÉPROUVÉ ICI : ce fichier monte la carte SANS `onOuvrirBien`, et le composant
       écrit alors « L'ouverture de la fiche n'est pas disponible depuis cet écran » plutôt qu'un bouton qui ne
       mènerait nulle part. Le bouton lui-même est éprouvé dans `CarteVive.test.ts`. */
    expect(container.querySelector('.gst-corps')).not.toBeNull();
    /* 🔴 ET LE CHOIX DU TYPE N'EST PLUS DANS LA CARTE : il est sur la fiche du bien. */
    expect(choixDuType()).toBeNull();
  });

  it('🔴🔴 sur une carte déjà dépliée, le clic ne la referme pas', async () => {
    await monter(CARTE({ categorie: null }));
    await deplier();
    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
    await act(async () => { (capsule() as HTMLElement).click(); });
    await calmer();
    expect(container.querySelector('button[aria-expanded="true"]'), 'le dossier doit rester ouvert').not.toBeNull();
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
    /* Le repli a basculé, comme n'importe quel autre point de la vignette. */
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

  /**
   * ══ 🔴🔴 ÉPREUVE AMENDÉE LE 08/10/2026 — LOT URGENCE-EVENEMENT, POINT 1 ════════════════════════════════════
   *
   * ELLE EXIGEAIT, EN PLUS DU MOT, que le ton de la capsule soit celui que `tonDuType` calcule pour la clé neuve.
   * Ce n'est plus vrai, et c'est voulu : la couleur traduit désormais le degré d'URGENCE. Ce que l'épreuve
   * protégeait — « un type créé plus tard paraît partout sans toucher au code de chaque écran » — tient
   * intégralement, et c'est le MOT qui le démontre.
   */
  it('🔴🔴 il s’affiche dans la capsule, avec son mot, et la couleur reste celle de l’urgence', async () => {
    await avecLeType(async () => {
      await monter(CARTE({ categorie: 'degat_eaux', urgence: 'urgent' }));
      const c = container.querySelector('.gst-type-capsule');
      expect(capsuleVisible()).toBe('Dégât des eaux');
      expect(c?.className).not.toContain('gst-type-capsule--vide');
      /* 🔴 LA COULEUR VIENT DU NIVEAU, ET D'AUCUN CALCUL SUR LA CLÉ DU TYPE. */
      expect(c?.className).toContain('gst-type-capsule--urg-rouge');
      expect(c?.className).not.toContain(`gst-type-capsule--${tonDuType('degat_eaux')}`);
    });
  });

  /**
   * ══ 🔴🔴 ÉPREUVE AMENDÉE — LOT CARTES-EVENEMENT-MEME-GESTE ════════════════════════════════════════════════
   *
   * ELLE OUVRAIT LE FORMULAIRE DEPUIS LA CARTE, qui ne le porte plus. Le formulaire, lui, n'a pas bougé d'un
   * cran : il est toujours `FormulaireCarte`, exporté par `CarteVive` et rendu par la fiche du bien. On le monte
   * donc DIRECTEMENT — ce qui éprouve exactement la même promesse d'Arno (« un type créé plus tard apparaît
   * automatiquement dans les listes de choix »), par la porte qui existe.
   */
  it('🔴🔴 il entre dans la liste de choix du formulaire, sans toucher à l’écran', async () => {
    await avecLeType(async () => {
      await act(async () => {
        root.render(createElement(FormulaireCarte, {
          detail: {
            evenementId: 1, reference: 'GES-2026-000001', objet: 'x', demandeurNom: null,
            demandeurEmail: null, adresseLibre: null, etat: 'a_traiter' as const,
            categorie: null, urgence: null, ouvertLe: '2026-10-01T08:00:00Z', ouvertPar: null,
            traiteLe: null, traitePar: null, fils: [], mailsDeplaces: [],
          },
          occupe: false, onValider: () => {}, onAnnuler: () => {},
        }));
      });
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

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT EVENEMENTS-CARTES-PLEINES, POINT 2 — MÊME LARGEUR, CONTENU ENTIER
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   ARNO (07/10/2026) : « Toutes les cartes d'une même liste ont la même largeur : toute la largeur de leur colonne
   ou zone, quelle que soit la longueur de leur titre. Aujourd'hui la carte _TEST est plus étroite que l'autre. […]
   Plus aucun texte coupé par "…" dans la carte : le titre complet, la ligne "Propriétaire : … · Demandé par …"
   complète, l'adresse complète. […] La colonne de droite garde sa largeur fixe et reste alignée en haut à droite. »

   ⚠️ JSDOM NE FAIT PAS DE MISE EN PAGE : il ne mesure ni largeur ni retour à la ligne. Ce bloc éprouve donc ce
   qu'il PEUT éprouver — le balisage rendu et les RÈGLES qui le gouvernent —, et les largeurs réelles ont été
   MESURÉES dans le vrai navigateur, à l'écran partagé comme en plein écran. Les deux sont dans le commit.
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const VUE_FEUILLE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
/**
 * La règle d'un sélecteur, sans les commentaires : on éprouve des DÉCLARATIONS, pas des explications.
 *
 * ⚠️ ANCRÉE EN DÉBUT DE LIGNE, et il le faut : sans le `^`, chercher `.gst-liste{` tombe d'abord sur
 * `.gst-deux .gst-liste{gap:0}`, qui le CONTIENT — on aurait lu la règle de l'écran partagé en croyant lire
 * celle de la liste. Défaut rencontré en écrivant ce bloc.
 */
const regleDe = (selecteur: string): string =>
  VUE_FEUILLE.replace(/\/\*[\s\S]*?\*\//g, '')
    .match(new RegExp(`^${selecteur}\\{([^}]*)\\}`, 'm'))?.[1] ?? '';

describe('🔴🔴 ⑨ aucun texte n’est coupé dans la carte', () => {
  /** Un titre de 150 caractères, comme Arno le demande dans ses tests. */
  const TITRE_LONG = 'Re: NOTE INFORMATION RESIDENCE DE L’ORNE — CHANGEMENT DES CODES D’ENTREE DES 3 BATIMENTS '
    + 'ET REMPLACEMENT DES BOITES AUX LETTRES DU HALL B, INTERVENTION URGENTE DEMANDEE';

  it('🔴🔴 un titre de 150 caractères s’affiche en ENTIER, sans « … »', async () => {
    expect(TITRE_LONG.length).toBeGreaterThanOrEqual(150);
    await monter(CARTE({ objet: TITRE_LONG }));
    const titre = container.querySelector('.gst-objet');
    /* 🔴 LE TEXTE RENDU EST LE TITRE COMPLET : rien n'est tronqué à la source. */
    expect(titre?.textContent).toBe(TITRE_LONG);
    /* 🔴 ET AUCUNE RÈGLE NE LE COUPERA : la classe de coupure a disparu, et celle qui la remplace passe à la ligne. */
    expect(titre?.className).toContain('gst-objet--entier');
    expect(titre?.className).not.toContain('gst-objet--coupe');
    const regle = regleDe('\\.gst-objet--entier');
    expect(regle).toContain('white-space:normal');
    expect(regle).toContain('overflow-wrap:anywhere');
    expect(regle).not.toContain('text-overflow:ellipsis');
  });

  /**
   * 🔴🔴 LES LIGNES DU DOSSIER AUSSI : « Propriétaire : … · Demandé par … » et l'adresse. Elles se coupaient
   * (lot EVENEMENT-MINIMALISTE, « sur des lignes COURTES ») ; elles passent désormais à la ligne.
   */
  it('🔴🔴 la ligne des personnes et l’adresse sont entières', async () => {
    await monter(CARTE({
      demandeur: 'Madame Sarah MEZIANE-DELACROIX, syndic bénévole de la résidence',
      bien: {
        cle: '315', adresse: '67 rue de Normandie, bâtiment B, escalier 3, deuxième étage porte gauche',
        commune: 'COURBEVOIE', proprietaire: 'Mme ABDELLATIF Névine épouse JULLIEN - GARRIDO', locataire: null,
      },
    }));
    const lignes = [...container.querySelectorAll('.gst-carte-ligne')].map((e) => e.textContent ?? '');
    expect(lignes.some((l) => l.includes('Mme ABDELLATIF Névine épouse JULLIEN - GARRIDO'))).toBe(true);
    expect(lignes.some((l) => l.includes('Madame Sarah MEZIANE-DELACROIX, syndic bénévole de la résidence'))).toBe(true);
    expect(container.querySelector('.gst-carte-ligne--adresse')?.textContent)
      .toContain('bâtiment B, escalier 3, deuxième étage porte gauche');
    /* 🔴 ET LA RÈGLE NE LES COUPE PLUS, À AUCUNE LARGEUR. */
    const regle = regleDe('\\.gst-carte-ligne');
    expect(regle).toContain('white-space:normal');
    expect(regle).not.toContain('text-overflow:ellipsis');
  });

  /** ⚠️ AUCUN « … » N'EST AJOUTÉ PAR LE CODE NON PLUS : la carte ne tronque nulle part elle-même. */
  it('⚠️ le composant n’écrit aucune ellipse de son propre chef', async () => {
    await monter(CARTE({ objet: TITRE_LONG }));
    const vign = vignette();
    expect(vign).toContain(TITRE_LONG);
    expect(vign).not.toContain('…');
  });
});

describe('🔴🔴 ⑩ même largeur pour toutes les cartes, colonne de droite fixe', () => {
  /**
   * ══ 🔴🔴 CE QUI CLOCHAIT, MESURÉ LE 07/10/2026 DANS LE VRAI NAVIGATEUR ═══════════════════════════════════════
   *
   * Sur le plein écran Événements (liste de 1232 px), les deux cartes faisaient 961 px et 552 px — chacune à la
   * largeur de son titre. Deux règles se marchaient dessus : `.gst-cartes-larges` posait `display:grid` ET
   * `align-items:start`, tandis que `.gst-liste`, DÉCLARÉE PLUS BAS dans la même feuille, reposait
   * `display:flex`. La grille n'a donc jamais pris — depuis le jour où elle a été écrite — et il n'en restait
   * que son `align-items:start`, qui en colonne veut dire « chaque carte prend la largeur de son contenu ».
   */
  it('🔴🔴 la liste étire ses cartes, et plus rien ne reprend cet alignement', () => {
    expect(regleDe('\\.gst-liste')).toContain('align-items:stretch');
    /* 🔴 ET LA RÈGLE « deux de front » NE POSE PLUS D'ALIGNEMENT : c'est elle qui fuitait. */
    const larges = regleDe('\\.gst-cartes-larges');
    expect(larges).not.toContain('align-items');
    expect(larges).not.toContain('display:grid');
  });

  /**
   * 🔴 LA COLONNE DE DROITE GARDE SA LARGEUR FIXE ET RESTE EN HAUT (Arno). C'est elle qui rend la nouvelle règle
   * tenable : le titre peut grandir en hauteur sans jamais pousser la vignette, la capsule de type ni Monga.
   */
  it('🔴 la colonne de droite est fixe, et alignée en haut', async () => {
    await monter(CARTE({ mongaRefs: ['MNG-23830'] }));
    expect(container.querySelector('.gst-carte-droite')).not.toBeNull();
    expect(regleDe('\\.gst-carte-droite')).toContain('flex:0 0 auto');
    expect(regleDe('\\.gst-carte-droite')).toContain('width:132px');
    /* 🔴 EN HAUT : c'est la rangée du titre qui l'impose, et elle ne se replie pas. */
    const titre = regleDe('\\.gst-carte-titre--avec-etape');
    expect(titre).toContain('align-items:flex-start');
    expect(titre).toContain('flex-wrap:nowrap');
    /* 🔴 ET LE TEXTE EST CE QUI CÈDE : sans `min-width:0`, un enfant en flex refuse de passer sous la largeur de
       son contenu — et c'est la colonne de droite qui serait écrasée. */
    expect(regleDe('\\.gst-carte-texte')).toContain('flex:1 1 auto;min-width:0');
  });

  /**
   * ⚠️ MESURÉ DANS LE VRAI NAVIGATEUR APRÈS LE CORRECTIF (jsdom ne met pas en page) :
   *   · plein écran Événements, liste 1232 px → les DEUX cartes à 1232 px (contre 961 et 552 avant) ;
   *   · écran partagé, zone de 604 px → les deux cartes à 574 px, soit la zone moins son cadre ;
   *   · un titre de 168 caractères posé dans le DOM : 2 lignes, AUCUNE troncature, carte toujours à 1232 px,
   *     colonne de droite toujours à 132 px et toujours calée en haut (décalage 0).
   * Ce cas-ci fige la RÈGLE qui le produit ; les mesures vivent dans le message de commit.
   */
  it('⚠️ aucune carte ne se donne une largeur à elle', () => {
    const item = regleDe('\\.gst-item');
    expect(item).not.toMatch(/(^|;)width:/);
    expect(item).not.toContain('max-width');
    expect(item).not.toContain('align-self');
  });
});
