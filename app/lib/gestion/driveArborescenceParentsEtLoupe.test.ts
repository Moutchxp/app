import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  motEtape, occurrenceChoisie, parcoursDe, PARCOURS_VIDE, surlignageDe, type Occurrence,
} from './localisationDrive';
import { ancetresAffiches, NIVEAUX_PARENTS_AFFICHES } from './finderDrive';

/**
 * ══ 🔴🔴 LOT DRIVE-ARBORESCENCE-PARENTS-ET-LOUPE (09/10/2026) ═══════════════════════════════════════════════════
 *
 * DEUX DEMANDES D'ARNO, et la mesure a montré qu'elles n'en font qu'une :
 *   ① « l'arborescence affiche AUSSI les 2 niveaux parents au-dessus du dossier courant, dépliés, avec
 *      indentation […] le dossier courant surligné » ;
 *   ② « le bouton loupe doit de nouveau dessiner le parcours clic après clic jusqu'au document : des témoins
 *      numérotés (1, 2, 3…) devant chaque ligne à cliquer, du niveau affiché jusqu'au fichier ».
 *
 * ══ 🔴🔴 CE QUE LA MESURE A TROUVÉ (09/10/2026, fiche lot-299, pièce « Détail du mouvement VIR INST… ») ══════════
 *
 * La loupe appelle bien `/drive/localiser`, qui répond **2 occurrences**, toutes deux dans
 * « Drive › Base de données locative › 00 Arrivée des mails › 2026 › 07 ». Et l'écran n'affichait **AUCUN
 * repère** — `surlignage.reperes` VIDE —, parce que la fenêtre montrait le dossier du lot 432 et ses cinq
 * sous-dossiers, et que le chemin du document ne passe par AUCUN d'eux : il descend par « 00 Arrivée des mails »,
 * un FRÈRE de « 2 Biens immobiliers », deux niveaux plus haut.
 *
 * 🔴 C'EST LE CAS QUE LE PREMIER DES CAS CI-DESSOUS REJOUE, chiffres en main : sans parent affiché, aucun
 * itinéraire ne peut partir ; avec les deux parents, il part.
 */

/* ── Un faux Drive, aux noms inventés : rien d'un client, et la FORME exacte du cas mesuré. ───────────────────── */
const DOC: Occurrence = {
  id: 'f-doc',
  nom: 'un document.pdf',
  /* `chemin` est rangé du parent IMMÉDIAT vers la racine — c'est ce que rend la route. */
  chemin: [
    { id: 'd-07', nom: '07' },
    { id: 'd-2026', nom: '2026' },
    { id: 'd-arrivee', nom: '00 Arrivée des mails' },
    { id: 'd-base', nom: 'Base de données locative' },
    { id: 'd-racine', nom: 'GESTION LOCATIVE' },
  ],
  voie: 'registre',
};

/** Ce que la fenêtre affiche quand elle vient de s'ouvrir sur le dossier du bien, SANS les parents. */
const SANS_PARENTS = new Set(['d-lot432', 'd-locataires', 'd-travaux', 'd-assurances']);
/** La même, AVEC les deux niveaux parents affichés (point 1). */
const AVEC_PARENTS = new Set([...SANS_PARENTS, 'd-base', 'd-biens']);

describe('🔴🔴 ① les deux niveaux au-dessus du dossier affiché', () => {
  const CHEMIN = [
    { id: 'd-racine', nom: 'GESTION LOCATIVE' },
    { id: 'd-base', nom: 'Base de données locative' },
    { id: 'd-biens', nom: '2 Biens immobiliers' },
    { id: 'd-lot432', nom: '1bis Rue Inventée — lot 000' },
  ];

  it('🔴 les deux parents immédiats, du plus haut au plus proche', () => {
    expect(ancetresAffiches(CHEMIN)).toEqual([
      { id: 'd-base', nom: 'Base de données locative' },
      { id: 'd-biens', nom: '2 Biens immobiliers' },
    ]);
  });

  /** 🔴 LE DOSSIER COURANT N'EN EST PAS UN : il a sa propre ligne, surlignée, et ne doit pas paraître deux fois. */
  it('🔴 le dossier courant est écarté de la chaîne', () => {
    expect(ancetresAffiches(CHEMIN).some((a) => a.id === 'd-lot432')).toBe(false);
  });

  /** ⚠️ À LA RACINE, IL N'Y A RIEN AU-DESSUS : aucune bande, et la fenêtre est celle d'avant ce lot. */
  it('⚠️ rien à la racine, rien sur un seul cran', () => {
    expect(ancetresAffiches([])).toEqual([]);
    expect(ancetresAffiches([{ id: 'd-racine', nom: 'GESTION LOCATIVE' }])).toEqual([]);
  });

  /** 🔴 LE CHIFFRE EST NOMMÉ, et il se change d'un seul endroit (Arno écrit « 2 »). */
  it('🔴 deux, et c’est une constante', () => {
    expect(NIVEAUX_PARENTS_AFFICHES).toBe(2);
    expect(ancetresAffiches(CHEMIN, 1)).toEqual([{ id: 'd-biens', nom: '2 Biens immobiliers' }]);
    expect(ancetresAffiches(CHEMIN, 0)).toEqual([]);
  });
});

describe('🔴🔴 ② l’itinéraire numéroté jusqu’au document', () => {
  /**
   * 🔴🔴 LE DÉFAUT MESURÉ, REJOUÉ : sans parent affiché, le chemin du document ne croise aucune ligne, et il n'y
   * a RIEN à montrer — ni repère, ni itinéraire. C'est exactement ce qu'Arno avait sous les yeux.
   */
  it('🔴🔴 sans les parents, aucun itinéraire ne peut partir — et c’était le défaut', () => {
    expect(parcoursDe(DOC, SANS_PARENTS)).toEqual(PARCOURS_VIDE);
    /* ⚠️ ET LE REPÈRE NON PLUS : les deux lectures disent la même chose, c'est bien la MÊME cause. */
    expect(surlignageDe([DOC], SANS_PARENTS).reperes.size).toBe(0);
    expect(surlignageDe([DOC], SANS_PARENTS).nombre).toBe(1);
  });

  /**
   * 🔴🔴 AVEC LES DEUX PARENTS, L'ITINÉRAIRE PART — et c'est pourquoi les deux points de ce lot n'en font qu'un.
   * Le premier pas tombe sur « Base de données locative », la seule ligne affichée que le chemin traverse.
   */
  it('🔴🔴 avec les parents, le premier pas tombe sur le parent affiché', () => {
    const p = parcoursDe(DOC, AVEC_PARENTS);
    expect(p.rangs.get('d-base')).toBe(1);
    expect(p.pas).toBe(5);
    /* Les rangs couvrent la chaîne ENTIÈRE, même ce qui n'est pas encore à l'écran : le « 2 » restera le « 2 ». */
    expect(p.rangs.get('d-arrivee')).toBe(2);
    expect(p.rangs.get('d-2026')).toBe(3);
    expect(p.rangs.get('d-07')).toBe(4);
    expect(p.rangs.get('f-doc')).toBe(5);
    /* ⚠️ Le fichier n'est pas encore atteint à l'écran : il n'est pas la destination ATTEINTE. */
    expect(p.fichier).toBeNull();
  });

  /**
   * 🔴🔴 CLIC APRÈS CLIC : on ouvre un cran, le suivant paraît — et il porte DÉJÀ son numéro. L'itinéraire ne se
   * renumérote pas sous les yeux de celui qui le suit.
   */
  it('🔴🔴 on déplie, le pas suivant apparaît avec son numéro', () => {
    const apres = parcoursDe(DOC, new Set([...AVEC_PARENTS, 'd-arrivee']));
    expect(apres.rangs.get('d-base')).toBe(1);
    expect(apres.rangs.get('d-arrivee')).toBe(2);
  });

  /** 🔴 LE BOUT DU CHEMIN SE DIT : arrivé sur le fichier, c'est « le document est ici ». */
  it('🔴 arrivé au fichier, il est la destination', () => {
    const p = parcoursDe(DOC, new Set(['d-07', 'f-doc']));
    expect(p.rangs.get('d-07')).toBe(1);
    expect(p.rangs.get('f-doc')).toBe(2);
    expect(p.fichier).toBe('f-doc');
    expect(motEtape(2, 2, true)).toBe('Étape 2 sur 2 : le document est ici');
    expect(motEtape(1, 2, false)).toBe('Étape 1 sur 2 : ouvrez ce dossier pour continuer');
  });

  /**
   * 🔴 SI L'ON NAVIGUE PLUS BAS, LA NUMÉROTATION REPART DU NIVEAU AFFICHÉ — « du niveau affiché jusqu'au
   * fichier » (Arno). Ce n'est pas une incohérence : c'est la définition.
   */
  it('🔴 naviguer plus bas raccourcit l’itinéraire, il ne le décale pas', () => {
    const p = parcoursDe(DOC, new Set(['d-2026', 'd-07']));
    expect(p.rangs.get('d-2026')).toBe(1);
    expect(p.rangs.get('d-07')).toBe(2);
    expect(p.pas).toBe(3);
  });

  /** ⚠️ RIEN À DESSINER SANS OCCURRENCE : on ne commence pas un itinéraire qui ne mène nulle part. */
  it('⚠️ aucune occurrence, aucun itinéraire', () => {
    expect(parcoursDe(null, AVEC_PARENTS)).toEqual(PARCOURS_VIDE);
    expect(parcoursDe(undefined, AVEC_PARENTS)).toEqual(PARCOURS_VIDE);
  });

  /**
   * 🔴 UN SEUL ITINÉRAIRE À LA FOIS (voir l'encadré de `parcoursDe`) : deux « 1 » dans le même arbre ne se
   * suivraient pas. Arno : « afficher l'emplacement choisi dans le menu, ou le premier par défaut. »
   */
  it('🔴 l’emplacement choisi gagne, sinon le premier', () => {
    const autre: Occurrence = { ...DOC, id: 'f-autre', chemin: [{ id: 'd-ailleurs', nom: 'Ailleurs' }] };
    expect(occurrenceChoisie([DOC, autre])?.id).toBe('f-doc');
    expect(occurrenceChoisie([DOC, autre], 'f-autre')?.id).toBe('f-autre');
    /* ⚠️ UN CHOIX INTROUVABLE NE VIDE PAS L'ÉCRAN : on retombe sur le premier, jamais sur rien. */
    expect(occurrenceChoisie([DOC, autre], 'f-inconnu')?.id).toBe('f-doc');
    expect(occurrenceChoisie([], 'f-doc')).toBeNull();
  });

  /**
   * 🔴🔴 ET LE RESTE N'EST PAS RETIRÉ (Arno : « répare sans retirer le reste ») : les autres emplacements
   * gardent la pastille 🔎 du repère, avec son nombre, exactement comme avant ce lot.
   */
  it('🔴🔴 le repère d’avant continue de fonctionner, à côté de l’itinéraire', () => {
    const second: Occurrence = {
      id: 'f-copie', nom: 'un document.pdf', voie: 'empreinte',
      chemin: [{ id: 'd-copies', nom: 'Copies' }, { id: 'd-base', nom: 'Base de données locative' }],
    };
    const s = surlignageDe([DOC, second], AVEC_PARENTS);
    /* Les deux chemins passent par « Base de données locative », qui est la seule ligne affichée : un repère, « 2 ». */
    expect(s.reperes.get('d-base')).toBe(2);
    expect(s.nombre).toBe(2);
  });
});

describe('🔴 l’écran emploie bien ces règles, et n’en réécrit aucune', () => {
  const SFD = readFileSync('app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx', 'utf8');

  it('🔴 la bande des parents vient du module pur', () => {
    expect(SFD).toContain('const ancetres = ancetresAffiches(chemin);');
    expect(SFD).toContain('<ol className="sfd-ancetres"');
    /* 🔴 LE DOSSIER COURANT EST SURLIGNÉ, et il n'est pas un bouton — on y est déjà. */
    expect(SFD).toContain('sfd-ancetre sfd-ancetre--courant');
  });

  /**
   * 🔴🔴 LES PARENTS ENTRENT DANS CE QUI EST « AFFICHÉ », et c'est la ligne qui répare la loupe : sans elle,
   * l'itinéraire du cas mesuré n'aurait toujours aucun premier pas.
   */
  it('🔴🔴 les parents comptent comme lignes affichées', () => {
    expect(SFD).toContain('for (const a of ancetres) affichees.add(a.id);');
  });

  it('🔴 le témoin est devant la ligne, le repère reste après le nom', () => {
    const colonne = SFD.slice(SFD.indexOf('<span className="sfd-col-nom">',
      SFD.indexOf('{parcours.rangs.has(f.id) && (')  - 2000));
    expect(colonne.indexOf('TemoinEtape')).toBeLessThan(colonne.indexOf('sfd-triangle'));
    expect(SFD).toContain('.sfd-etape{display:inline-flex;');
  });

  /** 🔒 LECTURE SEULE : l'itinéraire ne fait que lire. Aucune écriture n'a été ajoutée par ce lot. */
  it('🔒 rien de ce lot n’écrit dans le Drive', () => {
    const pur = readFileSync('app/lib/gestion/localisationDrive.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(pur).not.toMatch(/\bfetch\s*\(|files\.(create|update|copy|delete)/);
  });
});
