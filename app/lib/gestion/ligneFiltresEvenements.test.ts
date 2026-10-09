import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  appliquerFiltres, basculer, choisirTri, compteDe, ecrireLigne, lireLigne, ligneParDefaut, trierLigne,
  ETAT_PAR_DEFAUT, LIGNE_PAR_DEFAUT, MONGA_PAR_DEFAUT, type EtatLigne,
} from './ligneFiltresEvenements';
import { ecrireEtatUrl, ETAT_DEFAUT, lireEtatUrl, memeEtat } from './ecranUrl';
import type { CarteEvenement } from './fileRepo';

/**
 * ══ 🔴🔴 LOT RACCOURCI-EVENEMENTS-ACCUEIL-GESTION-ET-LIGNE-DE-FILTRES (09/10/2026) ═══════════════════════════════
 *
 * Trois demandes dans un lot, et ce fichier éprouve les règles PURES des trois :
 *   ① le raccourci « Événements » remplace « À rattacher » dans la colonne — vérifié dans
 *      `GestionVue.rattacher.test.ts`, avec les deux chemins qui restent vers la file ;
 *   ② la tuile « Gestion » ouvre l'écran partagé — vérifié plus bas, sur l'adresse que `menuAdmin` publie ;
 *   ③ la ligne de filtres et de tris — tout le reste de ce fichier.
 *
 * ⚠️ CHAQUE FILTRE EST UN ENSEMBLE D'IDENTIFIANTS VENU DU TABLEAU DE BORD, jamais un prédicat recopié : c'est
 * ce qui garantit que le compteur d'un bouton et la liste qu'il ouvre disent la même chose. Les cas ci-dessous
 * travaillent donc sur des ensembles connus, comme l'écran travaille sur ceux du serveur.
 */

const carte = (id: number, o: Partial<CarteEvenement> = {}): CarteEvenement => ({
  evenementId: id, reference: `GES-2026-${String(id).padStart(6, '0')}`, objet: `Dossier ${id}`,
  demandeur: null, adresseLibre: null, etat: 'en_cours',
  ouvertLe: '2026-10-01T08:00:00Z', dernierEchangeLe: null,
  nbFils: 1, nbMailsDeplaces: 0, attend: false,
  derniereEtape: null, derniereEtapeMonga: null,
  mongaMajLe: null, vuLe: null, mongaRefs: [],
  categorie: null, urgence: null,
  nbRecusNonLus: 0, nouveauteLe: null, bien: null, nbBiens: 0, ...o,
});

/** Cinq événements, et les ensembles que le tableau de bord rendrait pour eux. */
const CARTES = [carte(1), carte(2), carte(3), carte(4), carte(5)];
const IDS: Record<string, number[]> = {
  encours: [1, 2, 3], clos: [4, 5], tous: [1, 2, 3, 4, 5],
  'type:travaux': [1, 4], 'type:fuite_eau': [2], 'type:litige': [3],
  monga: [1], 'sans-monga': [2, 3, 4, 5],
  'devis-attente': [1, 2], 'sans-nouvelles': [2, 5], 'infos-manquantes': [3],
};

describe('🔴🔴 ③ la ligne : lire et écrire l’état dans l’adresse', () => {
  /** 🔴 UNE ADRESSE NUE = LES DÉFAUTS : en cours, tous les Monga, aucun type, aucun interrupteur, aucun tri. */
  it('🔴 sans paramètre, tout est au défaut', () => {
    expect(lireLigne(null, null, null)).toEqual(LIGNE_PAR_DEFAUT);
    expect(ligneParDefaut(LIGNE_PAR_DEFAUT)).toBe(true);
  });

  /**
   * 🔴🔴 UN DÉFAUT NE S'ÉCRIT JAMAIS DANS L'ADRESSE — règle de tout le module. « En cours » est le défaut : il
   * n'apparaît donc pas, et c'est « Clôturés » ou « Tous » qui s'écrivent.
   */
  it('🔴🔴 seul ce qui s’écarte du défaut s’écrit', () => {
    expect(ecrireLigne(LIGNE_PAR_DEFAUT)).toBeNull();
    expect(ecrireLigne({ ...LIGNE_PAR_DEFAUT, etat: 'tous' })).toBe('tous');
    expect(ecrireLigne({ ...LIGNE_PAR_DEFAUT, monga: 'monga' })).toBe('monga');
    expect(ecrireLigne({
      ...LIGNE_PAR_DEFAUT, etat: 'clos', types: ['type:travaux', 'type:litige'],
      interrupteurs: ['devis-attente'],
    })).toBe('clos,type:travaux,type:litige,devis-attente');
  });

  /** 🔴 ALLER-RETOUR STABLE : lire ce qu'on vient d'écrire redonne le même état. */
  it('🔴 l’aller-retour ne dérive pas', () => {
    const e: EtatLigne = {
      etat: 'clos', monga: 'sans-monga', types: ['type:fuite_eau'],
      interrupteurs: ['sans-nouvelles', 'infos-manquantes'], tri: 'echange', sens: 'asc',
    };
    expect(lireLigne(ecrireLigne(e), e.tri, e.sens)).toEqual(e);
  });

  /** ⚠️ CE QU'ON NE RECONNAÎT PAS EST IGNORÉ, jamais une erreur : l'écran montre alors plus, jamais moins. */
  it('⚠️ une clé inconnue ne casse rien et ne filtre rien', () => {
    const e = lireLigne('nimportequoi,encours,reouverts', 'absurde', 'oblique');
    expect(e.etat).toBe('encours');
    expect(e.interrupteurs).toEqual([]);
    expect(e.tri).toBeNull();
    expect(e.sens).toBe('desc');
    expect(appliquerFiltres(CARTES, e, IDS).map((c) => c.evenementId)).toEqual([1, 2, 3]);
  });
});

describe('🔴🔴 ③ basculer un bouton : chaque groupe a sa règle', () => {
  /** 🔴 L'ÉTAT EST EXCLUSIF : choisir remplace, recliquer l'actif revient au défaut. */
  it('🔴🔴 l’état et Monga sont exclusifs, et se défont au second clic', () => {
    expect(basculer(LIGNE_PAR_DEFAUT, 'clos').etat).toBe('clos');
    expect(basculer({ ...LIGNE_PAR_DEFAUT, etat: 'clos' }, 'tous').etat).toBe('tous');
    expect(basculer({ ...LIGNE_PAR_DEFAUT, etat: 'clos' }, 'clos').etat).toBe(ETAT_PAR_DEFAUT);
    expect(basculer(LIGNE_PAR_DEFAUT, 'monga').monga).toBe('monga');
    expect(basculer({ ...LIGNE_PAR_DEFAUT, monga: 'monga' }, 'monga').monga).toBe(MONGA_PAR_DEFAUT);
  });

  /** 🔴 LES TYPES S'ADDITIONNENT (« choix multiples », Arno) et se retirent un par un. */
  it('🔴🔴 les types s’ajoutent et se retirent', () => {
    const a = basculer(LIGNE_PAR_DEFAUT, 'type:travaux');
    const b = basculer(a, 'type:litige');
    expect(b.types).toEqual(['type:travaux', 'type:litige']);
    expect(basculer(b, 'type:travaux').types).toEqual(['type:litige']);
  });

  /** 🔴 LES INTERRUPTEURS S'ALLUMENT ET S'ÉTEIGNENT, indépendamment les uns des autres. */
  it('🔴 les interrupteurs se combinent', () => {
    const a = basculer(basculer(LIGNE_PAR_DEFAUT, 'devis-attente'), 'sans-nouvelles');
    expect(a.interrupteurs).toEqual(['devis-attente', 'sans-nouvelles']);
    expect(basculer(a, 'devis-attente').interrupteurs).toEqual(['sans-nouvelles']);
  });

  /** ⚠️ UNE CLÉ INCONNUE NE FAIT RIEN, et surtout ne jette pas : le tableau de bord en nomme que la ligne ignore. */
  it('⚠️ une clé inconnue laisse l’état intact', () => {
    expect(basculer(LIGNE_PAR_DEFAUT, 'reouverts')).toEqual(LIGNE_PAR_DEFAUT);
  });
});

describe('🔴🔴 ③ appliquer les filtres : ET entre les groupes, OU dans les types', () => {
  const appliquer = (e: Partial<EtatLigne>) =>
    appliquerFiltres(CARTES, { ...LIGNE_PAR_DEFAUT, ...e }, IDS).map((c) => c.evenementId);

  /**
   * 🔴🔴 « EN COURS » EST LE DÉFAUT, ET IL FILTRE DÈS L'ARRIVÉE. C'est une demande explicite d'Arno (« État :
   * En cours par défaut »), et c'est pour cela que le bouton est allumé à l'écran : un filtre par défaut qui
   * ne se voit pas est un écran qui ment.
   */
  it('🔴🔴 par défaut, seuls les événements en cours sont montrés', () => {
    expect(appliquer({})).toEqual([1, 2, 3]);
    expect(appliquer({ etat: 'clos' })).toEqual([4, 5]);
    expect(appliquer({ etat: 'tous' })).toEqual([1, 2, 3, 4, 5]);
  });

  /** 🔴🔴 LES TYPES EN UNION : un événement passe s'il est d'AU MOINS un des types cochés. */
  it('🔴🔴 deux types cochés montrent les deux', () => {
    expect(appliquer({ etat: 'tous', types: ['type:travaux'] })).toEqual([1, 4]);
    expect(appliquer({ etat: 'tous', types: ['type:travaux', 'type:fuite_eau'] })).toEqual([1, 2, 4]);
  });

  /** 🔴🔴 LES GROUPES SE CROISENT (ET) : « en cours » ET « travaux » ne laisse que l'intersection. */
  it('🔴🔴 les groupes se croisent', () => {
    expect(appliquer({ types: ['type:travaux'] })).toEqual([1]);
    expect(appliquer({ etat: 'tous', monga: 'monga' })).toEqual([1]);
    expect(appliquer({ etat: 'tous', interrupteurs: ['devis-attente', 'sans-nouvelles'] })).toEqual([2]);
  });

  /**
   * ⚠️ TANT QUE LES ENSEMBLES NE SONT PAS ARRIVÉS, LA LISTE EST ENTIÈRE. `null` se lit « je ne sais pas
   * encore », jamais « rien ne correspond » : une liste vide pendant la lecture ferait croire à un filtre
   * qui n'a rien trouvé.
   */
  it('⚠️ sans les ensembles, rien n’est masqué', () => {
    expect(appliquerFiltres(CARTES, { ...LIGNE_PAR_DEFAUT, etat: 'clos' }, null).map((c) => c.evenementId))
      .toEqual([1, 2, 3, 4, 5]);
  });

  /** ⚠️ ET UNE CLÉ QUE LES ENSEMBLES NE CONNAISSENT PAS NE RESTREINT RIEN, plutôt que de tout masquer. */
  it('⚠️ une clé absente des ensembles ne masque rien', () => {
    expect(appliquer({ etat: 'tous', types: ['type:administratif'] })).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('🔴🔴 ③ les trois tris', () => {
  const A = carte(1, { ouvertLe: '2026-01-01T08:00:00Z', dernierEchangeLe: '2026-05-01T08:00:00Z', urgence: 'normale' });
  const B = carte(2, { ouvertLe: '2026-03-01T08:00:00Z', dernierEchangeLe: null, urgence: 'urgent' });
  const C = carte(3, { ouvertLe: '2026-02-01T08:00:00Z', dernierEchangeLe: '2026-06-01T08:00:00Z', urgence: 'haute' });
  const LOT = [A, B, C];
  const ids = (e: Partial<EtatLigne>) =>
    trierLigne(LOT, { ...LIGNE_PAR_DEFAUT, ...e }).map((c) => c.evenementId);

  /** 🔴 SANS TRI, L'ORDRE REÇU EST CONSERVÉ : c'est celui de « New » / « Urgent », qui fait foi par défaut. */
  it('🔴🔴 aucun tri ⇒ l’ordre de « New » / « Urgent » est intact', () => {
    expect(ids({})).toEqual([1, 2, 3]);
  });

  it('🔴 par date d’ouverture, et le re-clic inverse', () => {
    expect(ids({ tri: 'ouverture', sens: 'desc' })).toEqual([2, 3, 1]);
    expect(ids({ tri: 'ouverture', sens: 'asc' })).toEqual([1, 3, 2]);
  });

  it('🔴 par urgence : le plus pressant d’abord en décroissant', () => {
    expect(ids({ tri: 'urgence', sens: 'desc' })).toEqual([2, 3, 1]);
    expect(ids({ tri: 'urgence', sens: 'asc' })).toEqual([1, 3, 2]);
  });

  /**
   * ⚠️ UNE VALEUR ABSENTE PASSE TOUJOURS EN DERNIER, DANS LES DEUX SENS. Un dossier sans dernier échange
   * n'est ni le plus récent ni le plus ancien : il est hors de la question posée. Le mettre à une extrémité
   * en ferait une réponse — et, en ordre croissant, il occuperait la première place.
   */
  it('⚠️ un dossier sans dernier échange finit toujours en bas', () => {
    expect(ids({ tri: 'echange', sens: 'desc' })).toEqual([3, 1, 2]);
    expect(ids({ tri: 'echange', sens: 'asc' })).toEqual([1, 3, 2]);
  });

  /** 🔴 RECLIQUER LE TRI ACTIF INVERSE LE SENS ; en choisir un autre repart en décroissant (Arno). */
  it('🔴🔴 le re-clic inverse, un autre tri repart en décroissant', () => {
    const a = choisirTri(LIGNE_PAR_DEFAUT, 'ouverture');
    expect(a).toMatchObject({ tri: 'ouverture', sens: 'desc' });
    expect(choisirTri(a, 'ouverture')).toMatchObject({ tri: 'ouverture', sens: 'asc' });
    expect(choisirTri(choisirTri(a, 'ouverture'), 'urgence')).toMatchObject({ tri: 'urgence', sens: 'desc' });
  });

  /** 🔴 « RÉINITIALISER » N'EXISTE QUE S'IL Y A QUELQUE CHOSE À DÉFAIRE — un tri compte. */
  it('🔴 un tri suffit à sortir du défaut', () => {
    expect(ligneParDefaut(choisirTri(LIGNE_PAR_DEFAUT, 'urgence'))).toBe(false);
    expect(ligneParDefaut(basculer(LIGNE_PAR_DEFAUT, 'type:travaux'))).toBe(false);
  });
});

describe('🔴🔴 ③ les compteurs des boutons', () => {
  /** 🔴 LE COMPTEUR EST LA TAILLE DE L'ENSEMBLE que le bouton applique : ils ne peuvent pas se contredire. */
  it('🔴🔴 chaque bouton porte la taille de son ensemble', () => {
    expect(compteDe('encours', IDS)).toBe(3);
    expect(compteDe('type:travaux', IDS)).toBe(2);
    expect(compteDe('devis-attente', IDS)).toBe(2);
    expect(appliquerFiltres(CARTES, { ...LIGNE_PAR_DEFAUT, etat: 'tous', types: ['type:travaux'] }, IDS))
      .toHaveLength(compteDe('type:travaux', IDS) ?? -1);
  });

  /** ⚠️ `null` TANT QU'ON NE SAIT PAS, jamais `0` : un zéro se lirait « il n'y en a aucun ». */
  it('⚠️ sans les ensembles, le bouton n’affiche aucun nombre', () => {
    expect(compteDe('encours', null)).toBeNull();
    expect(compteDe('type:administratif', IDS)).toBeNull();
  });
});

describe('🔴🔴 ③ l’adresse : rechargement et « Précédent »', () => {
  /** 🔴 LES TROIS CLÉS NE VALENT QUE SUR L'ÉCRAN DES ÉVÉNEMENTS. Ailleurs, elles ne désignent rien. */
  it('🔴 `evf`, `tric` et `sens` ne se lisent que sur l’écran des événements', () => {
    const e = lireEtatUrl('?ecran=evenements&evf=clos,type:travaux&tric=urgence&sens=asc');
    expect(e.evf).toBe('clos,type:travaux');
    expect(e.tric).toBe('urgence');
    expect(e.sens).toBe('asc');
    for (const ec of ['boite', 'partage', 'annuaire']) {
      expect(lireEtatUrl(`?ecran=${ec}&evf=clos&tric=urgence`).evf, ec).toBeNull();
    }
  });

  /** 🔴 ALLER-RETOUR STABLE sur l'adresse complète. */
  it('🔴 l’aller-retour d’adresse ne dérive pas', () => {
    const a = '?ecran=evenements&evf=clos%2Ctype%3Atravaux&tric=urgence&sens=asc';
    expect(ecrireEtatUrl(lireEtatUrl(a))).toBe(a);
  });

  /**
   * 🔴🔴 CHANGER DE FILTRE OU DE TRI EMPILE UNE ENTRÉE D'HISTORIQUE, donc « Précédent » revient à la liste
   * d'avant. C'est le raisonnement du tri et du filtre des non-lus, appliqué ici : le filtre change CE QU'ON
   * REGARDE.
   */
  it('🔴🔴 « Précédent » revient aux filtres d’avant', () => {
    const base = { ...ETAT_DEFAUT, ecran: 'evenements' as const };
    expect(memeEtat(base, { ...base, evf: 'clos' })).toBe(false);
    expect(memeEtat(base, { ...base, tric: 'urgence' })).toBe(false);
    expect(memeEtat({ ...base, tric: 'urgence' }, { ...base, tric: 'urgence', sens: 'asc' })).toBe(false);
    expect(memeEtat(base, { ...base })).toBe(true);
  });
});

describe('🔴🔴 ② la tuile « Gestion » ouvre l’écran partagé', () => {
  /**
   * 🔴🔴 LA CAUSE, FIGÉE : la grille des tuiles lisait `tuile.slug` — la racine du module, qui rend
   * `ETAT_DEFAUT` (« la boîte, sur Réception »). La bonne destination existait pourtant depuis le lot
   * ACCUEIL-GESTION (`accueil`, `URL_ACCUEIL_GESTION`), et la barre latérale la lisait déjà. Deux portes, une
   * seule branchée.
   */
  it('🔴🔴 la grille lit `accueil`, et non la racine du module', () => {
    const GRILLE = readFileSync('app/(admin)/admin/(protected)/GrilleModules.tsx', 'utf8');
    expect(GRILLE).not.toContain('<Link href={tuile.slug}');
    /* 🔴 LES DEUX RENDUS (mobile et statique) : deux destinations feraient changer la cible après montage. */
    expect((GRILLE.match(/href=\{tuile\.accueil \?\? tuile\.slug\}/g) ?? [])).toHaveLength(2);
  });

  /** 🔴 ET LA DESTINATION EST BIEN L'ÉCRAN PARTAGÉ, pas une variante. */
  it('🔴🔴 l’accueil du module est l’écran partagé', async () => {
    const { URL_ACCUEIL_GESTION } = await import('./ecranUrl');
    expect(URL_ACCUEIL_GESTION).toBe('/admin/gestion?ecran=partage');
    expect(lireEtatUrl('?ecran=partage').ecran).toBe('partage');
  });

  /**
   * ⚠️ LES LIENS PROFONDS NE CHANGENT PAS (Arno) : `?etiquette=`, `?fiche=`, `?ecran=evenements` ouvrent
   * toujours leur écran, et l'adresse NUE reste la boîte — décision du 27/09, que ce lot ne touche pas.
   */
  it('⚠️ les liens profonds et l’adresse nue sont intacts', () => {
    expect(lireEtatUrl('').ecran).toBe('boite');
    expect(lireEtatUrl('?ecran=evenements').ecran).toBe('evenements');
    expect(lireEtatUrl('?etiquette=envoyes').etiquette.sorte).toBe('envoyes');
    expect(lireEtatUrl('?ecran=annuaire&fiche=bien-478').fiche).toEqual({ sorte: 'bien', id: 478 });
  });
});
