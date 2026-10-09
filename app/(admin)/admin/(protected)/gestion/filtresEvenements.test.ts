// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { CarteVive } from './CarteVive';
import type { CarteEvenement } from '../../../../lib/gestion/fileRepo';
import { ecrireEtatUrl, ETAT_DEFAUT, lireEtatUrl, memeEtat } from '../../../../lib/gestion/ecranUrl';

/**
 * ══ 🔴🔴 LOT FILTRES-EVENEMENTS-NEW — LE CÂBLAGE : PASTILLE, ADRESSE, BOUTONS, DÉPÔT ════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Les deux ORDRES eux-mêmes sont éprouvés dans `triEvenements.test.ts`, sur le module pur. Ce fichier-ci éprouve
 * tout le reste : la pastille sur la carte, le paramètre d'adresse `&tri=`, les deux boutons dans les DEUX
 * en-têtes, et le calcul du statut « New » côté dépôt.
 *
 * ⚠️ IL LIT DU TEXTE DE SOURCE POUR `GestionVue`, et c'est assumé : cet écran monte tout le module (relève,
 * battement, six écrans) et ne se rend pas dans une épreuve de navigateur. La CARTE, elle, est montée pour de vrai.
 *
 * 🔒 Aucun réseau : `fetch` est doublé. Aucune base. Aucun mail ni événement RÉEL n'est touché.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
const REPO = readFileSync('app/lib/gestion/fileRepo.ts', 'utf8');
const GMAIL = readFileSync('app/lib/gestion/lectureGmail.ts', 'utf8');

const MAINTENANT = new Date('2026-10-08T12:00:00Z');

const CARTE = (o: Partial<CarteEvenement> = {}): CarteEvenement => ({
  evenementId: 3, reference: 'GES-2026-000003', objet: 'Fuite salle de bain',
  demandeur: null, adresseLibre: null, etat: 'en_cours',
  ouvertLe: '2026-10-01T08:00:00Z', dernierEchangeLe: '2026-10-06T08:00:00Z',
  nbFils: 1, nbMailsDeplaces: 0, attend: false,
  derniereEtape: null, derniereEtapeMonga: null,
  mongaMajLe: null, vuLe: null, mongaRefs: [],
  categorie: 'travaux', urgence: null,
  nbRecusNonLus: 0, nouveauteLe: null,
  bien: null, nbBiens: 0,
  ...o,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  global.fetch = vi.fn(async () => (
    { ok: true, status: 200, json: async () => ({}) } as unknown as Response
  )) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const monter = async (carte: CarteEvenement) => {
  await act(async () => {
    root.render(createElement(CarteVive, { carte, maintenant: MAINTENANT, onGeste: () => {} }));
  });
  await act(async () => { await Promise.resolve(); });
};

const pastille = (): HTMLElement | null => container.querySelector('.gst-neuf');

describe('🔴🔴 ① la pastille « New », près du titre', () => {
  /**
   * 🔴 LA PASTILLE SUIT LA DATE D'ACTIVITÉ, et non un compteur : c'est `estNouveau` (module pur) qui tranche, la
   * MÊME règle que les deux tris. Un second critère ici aurait fini par afficher une pastille sur une carte que
   * le tri ne range pas avec les « New ».
   */
  it('🔴🔴 elle est là quand l’événement est « New »', async () => {
    await monter(CARTE({ nbRecusNonLus: 1, nouveauteLe: '2026-10-08T09:00:00Z' }));
    expect(pastille()?.textContent).toContain('New');
  });

  /** 🔴🔴 « Le statut disparaît dès que tous ces mails ont été ouverts » (Arno). */
  it('🔴🔴 elle disparaît quand tout est lu', async () => {
    await monter(CARTE({ nbRecusNonLus: 0, nouveauteLe: null }));
    expect(pastille()).toBeNull();
  });

  /** 🔴 PRÈS DU TITRE (Arno), c'est-à-dire dans la colonne de texte — et non dans celle des capsules. */
  it('🔴 elle vit dans la colonne de texte, juste après l’objet', async () => {
    await monter(CARTE({ nbRecusNonLus: 1, nouveauteLe: '2026-10-08T09:00:00Z' }));
    const texte = container.querySelector('.gst-carte-texte');
    expect(texte?.querySelector('.gst-neuf')).not.toBeNull();
    /* 🔴 ET PAS DANS LA COLONNE DE DROITE, où vivent la vignette d'étape et les deux capsules. */
    expect(container.querySelector('.gst-carte-droite .gst-neuf')).toBeNull();
  });

  /**
   * ⚠️ LE MOT PORTE L'INFORMATION, LA COULEUR NE FAIT QUE L'APPUYER — et le NOMBRE, qui ne tient pas dans une
   * pastille « discrète », est dit dans la bulle et au lecteur d'écran.
   */
  it('⚠️ le nombre de mails est dit, sans alourdir la pastille', async () => {
    await monter(CARTE({ nbRecusNonLus: 3, nouveauteLe: '2026-10-08T09:00:00Z' }));
    expect(pastille()?.getAttribute('title')).toBe('3 mails reçus non lus sur cet événement');
    expect(pastille()?.textContent).toContain('3 mails reçus non lus');
    await monter(CARTE({ nbRecusNonLus: 1, nouveauteLe: '2026-10-08T09:00:00Z' }));
    expect(pastille()?.getAttribute('title')).toBe('Un mail reçu non lu sur cet événement');
  });

  /** 🔴 UNE PAIRE DE JETONS DU THÈME, définis en Clair ET en Sombre : la pastille suit les trois thèmes. */
  it('🔴 sa règle ne tire que des jetons, définis dans les trois thèmes', () => {
    const regle = VUE.match(/\.gst-neuf\{([^}]*)\}/);
    expect(regle).not.toBeNull();
    const corps = regle?.[1] ?? '';
    expect(corps).not.toMatch(/#[0-9a-f]{3,8}/i);
    const GLOBALS = readFileSync('app/globals.css', 'utf8');
    for (const jeton of (corps.match(/--color-svv-[a-z-]+/g) ?? [])) {
      expect((GLOBALS.match(new RegExp(`${jeton}:`, 'g')) ?? []).length, jeton).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('🔴🔴 ② le choix du tri voyage dans l’adresse', () => {
  /** 🔴 « New » est le défaut, et un défaut ne s'écrit jamais dans l'adresse. */
  it('🔴 « New » ne s’écrit pas ; « Urgent » s’écrit', () => {
    expect(ecrireEtatUrl({ ...ETAT_DEFAUT, ecran: 'partage', tri: null })).toBe('?ecran=partage');
    expect(ecrireEtatUrl({ ...ETAT_DEFAUT, ecran: 'partage', tri: 'urgent' }))
      .toBe('?ecran=partage&tri=urgent');
    expect(ecrireEtatUrl({ ...ETAT_DEFAUT, ecran: 'evenements', tri: 'urgent' }))
      .toBe('?ecran=evenements&tri=urgent');
  });

  /**
   * 🔴🔴 « LE CHOIX DU BOUTON EST CONSERVÉ ENTRE L'ÉCRAN PARTAGÉ ET LE PLEIN ÉCRAN » (Arno) : c'est exactement ce
   * que démontre ce cas — la même valeur se relit sur les deux écrans, et nulle part ailleurs.
   */
  it('🔴🔴 il se relit sur les DEUX écrans, et sur eux seuls', () => {
    expect(lireEtatUrl('?ecran=partage&tri=urgent').tri).toBe('urgent');
    expect(lireEtatUrl('?ecran=evenements&tri=urgent').tri).toBe('urgent');
    for (const e of ['boite', 'annuaire', 'a_trier', 'historique']) {
      expect(lireEtatUrl(`?ecran=${e}&tri=urgent`).tri, e).toBeNull();
    }
  });

  /** ⚠️ UNE VALEUR ABÎMÉE RETOMBE SUR LE DÉFAUT, jamais une erreur : l'adresse arrive de partout. */
  it.each(['', 'NEW', 'new', 'nimportequoi'])('⚠️ « %s » vaut le défaut', (v) => {
    expect(lireEtatUrl(`?ecran=partage&tri=${encodeURIComponent(v)}`).tri).toBeNull();
  });

  /** 🔴 ALLER-RETOUR STABLE : écrire ce qu'on vient de lire redonne la même adresse. */
  it('🔴 l’aller-retour ne dérive pas', () => {
    for (const a of ['?ecran=partage&tri=urgent', '?ecran=evenements&tri=urgent']) {
      expect(ecrireEtatUrl(lireEtatUrl(a))).toBe(a);
    }
  });

  /**
   * 🔴🔴 CHANGER DE TRI CHANGE D'ÉCRAN AU SENS DE `memeEtat`, et c'est voulu : le bouton réorganise la page, donc
   * « Précédent » doit revenir au tri d'avant.
   */
  it('🔴🔴 changer de tri empile une entrée d’historique', () => {
    const a = lireEtatUrl('?ecran=partage');
    expect(memeEtat(a, lireEtatUrl('?ecran=partage&tri=urgent'))).toBe(false);
    expect(memeEtat(a, lireEtatUrl('?ecran=partage'))).toBe(true);
  });
});

describe('🔴🔴 ③ les deux boutons, dans les DEUX en-têtes', () => {
  /**
   * 🔴🔴 ÉCRITS UNE SEULE FOIS, RENDUS DEUX FOIS. Arno : « DEUX BOUTONS DE TRI en haut de la colonne et de l'écran
   * Événements, à côté du compteur. » Deux blocs écrits à la main auraient fini par proposer trois tris d'un côté.
   */
  it('🔴🔴 le même bloc est rendu dans la colonne et en plein écran', () => {
    expect(VUE).toContain('const boutonsDeTri = (');
    /**
     * ⚠️ ON NOMME LES DEUX ENDROITS, au lieu de compter les occurrences du mot. Au lot
     * …-ET-LIGNE-DE-FILTRES, les deux boutons ont quitté le TITRE de la colonne des événements pour la
     * LIGNE DE FILTRES (Arno : « Les boutons New / Urgent de la colonne de gauche passent dans la ligne »),
     * et l'encadré qui l'explique CITE `{boutonsDeTri}` — un comptage en trouvait donc trois.
     * 🔒 LA PROPRIÉTÉ GARDÉE EST LA MÊME, et mieux dite : un seul bloc, rendu aux deux endroits qui le
     * montrent — la ligne de filtres du plein écran, et l'en-tête de l'écran partagé.
     */
    expect(VUE).toContain('boutonsNewUrgent={boutonsDeTri}');
    const partage = VUE.slice(VUE.indexOf('id="gst-titre-ev"'));
    expect(partage).toContain('{boutonsDeTri}');
  });

  /** 🔴 À CÔTÉ DU COMPTEUR (Arno), dans les deux titres. */
  it('🔴 ils sont posés juste après le compteur', () => {
    for (const titre of ['gst-titre-ev-plein', 'gst-titre-ev']) {
      const i = VUE.indexOf(titre);
      expect(i, titre).toBeGreaterThan(-1);
      const bloc = VUE.slice(i, i + 500);
      expect(bloc, titre).toContain('gst-compte');
      expect(bloc, titre).toContain('{boutonsDeTri}');
    }
  });

  /** 🔴 UN SEUL ACTIF À LA FOIS, et il le dit autrement que par la couleur. */
  it('🔴 un seul actif, et `aria-pressed` le dit', () => {
    /**
     * ⚠️ CE QUE CETTE ÉPREUVE EXIGEAIT AVANT, ET POURQUOI LE VERDICT A CHANGÉ : `aria-pressed={tri === t}` et
     * ``className={`gst-tri gst-tri--${t}${tri === t ? ' gst-tri--actif' : ''}`}``, c'est-à-dire un `button`
     * écrit à la main, avec son dessin à lui. Le lot HARMONIE-BOUTONS-ET-TROMBONE (point 2a) l'a remplacé par
     * `BoutonPilule`, le format commun aux quatre filtres de la boîte, à ces deux tris et aux trois niveaux
     * d'urgence — Arno : « Rends ce format commun […] pour que les trois groupes ne divergent plus ».
     *
     * 🔴 LA RÈGLE, ELLE, EST LA MÊME, ET ON L'ÉPROUVE DES DEUX CÔTÉS : un seul actif (`actif={tri === t}`,
     * vrai pour un seul `t`), et `aria-pressed` qui le dit — porté désormais par la pilule, où il est vérifié
     * pour les trois groupes à la fois plutôt que trois fois séparément.
     */
    expect(VUE).toContain('<BoutonPilule key={t} mot={motTri(t)} actif={tri === t}');
    const PILULE = readFileSync('app/(admin)/admin/(protected)/gestion/BoutonPilule.tsx', 'utf8');
    expect(PILULE).toContain('aria-pressed={actif}');
  });

  /**
   * 🔴🔴 UNE SEULE SOURCE DE CALCUL, PARTAGÉE PAR LES DEUX ÉCRANS (Arno) : le tri se fait UNE fois, en amont, et
   * `cartesDe` — qui rend les deux listes — part du même tableau.
   */
  it('🔴🔴 le tri se fait une fois, et les deux listes lisent le même tableau', () => {
    expect(VUE).toContain('const evenementsRanges = trierEvenements(d.evenements, tri);');
    /* ⚠️ `cartesDe` A GAGNÉ UN SECOND ARGUMENT (lot EVENEMENTS-TABLEAU-DE-BORD) : la liste à rendre, dont le
       DÉFAUT reste `evenementsRanges`. L'écran des événements lui passe la liste restreinte par un chiffre du
       tableau de bord ; l'écran partagé ne lui passe rien, et rend donc exactement ce qu'il rendait. Ce que ce
       cas tient — le tri se fait UNE fois, en amont, et une seule fonction rend les deux listes — est intact. */
    expect(VUE).toContain(
      'const cartesDe = (partage: boolean, liste: readonly CarteEvenement[] = evenementsRanges) => liste.map((e) => (');
    expect((VUE.match(/trierEvenements\(/g) ?? [])).toHaveLength(1);
  });

  /** 🔴 LE TRI VIENT DE L'ADRESSE, et le défaut du module pur — jamais d'un état de composant. */
  it('🔴 le tri courant est lu de l’adresse', () => {
    expect(VUE).toContain('const tri: TriEvenement = triValide(etatUrl.tri ?? undefined);');
  });

  /**
   * ⚠️ CHANGER DE TRI NE FERME RIEN D'AUTRE : on part de `etatUrl`, pas de `ETAT_DEFAUT`. Sans cela, le bouton
   * refermerait l'échange ouvert et l'étiquette choisie — on ne déplace qu'une chose à la fois.
   */
  it('⚠️ le bouton ne déplace que le tri', () => {
    expect(VUE).toContain("onClick={() => aller({ ...etatUrl, tri: t === 'new' ? null : t })}");
  });

  /**
   * ══ 🔴🔴 « LE CHOIX EST CONSERVÉ ENTRE L'ÉCRAN PARTAGÉ ET LE PLEIN ÉCRAN » (Arno) ═══════════════════════════
   *
   * 🔴 TROU TROUVÉ À L'ÉCRAN, PAS DANS LE CODE : le bouton « Plein écran » construisait son état à la main
   * (`{ ecran, etiquette, filOuvert }`) et laissait donc le tri derrière lui — on passait en plein écran et la
   * liste reprenait l'ordre par défaut, sans un mot. Depuis le lot CARTES-EVENEMENT-MEME-GESTE, ce bouton est la
   * SEULE transition entre les deux écrans : s'il perd le tri, la promesse d'Arno ne tient nulle part.
   */
  it('🔴🔴 le bouton « Plein écran » transporte le tri choisi', () => {
    expect(VUE).toContain(
      "onClick={() => aller({ ecran: 'evenements', etiquette, filOuvert: null, tri: etatUrl.tri })}");
  });

  /**
   * 🔴🔴 CE SONT DES TRIS : « aucune carte n'est masquée, le compteur reste le nombre total d'événements ».
   * Les deux listes restent donc branchées sur `d.evenementsTotal`.
   *
   * ⚠️ CE QUE CETTE ÉPREUVE INTERDISAIT AVANT, ET POURQUOI ELLE NE PEUT PLUS : elle écrivait
   * `expect(VUE).not.toContain('evenementsRanges.filter')` — aucun filtrage de la liste, nulle part. C'était
   * le bon garde tant que le TRI était la seule chose qui touchait aux cartes. Le lot
   * EVENEMENTS-TABLEAU-DE-BORD en ajoute un VRAI, demandé en toutes lettres par Arno (« Chaque chiffre […] est
   * CLIQUABLE et applique le filtre correspondant »), et la formulation d'alors l'interdirait.
   *
   * 🔒 LA PROPRIÉTÉ GARDÉE NE BOUGE PAS, ET ELLE EST MÊME PLUS PRÉCISE : ce que le TRI fait de la liste reste
   * un rangement complet (`trierEvenements(d.evenements, tri)` — tout entre, tout sort), et le seul filtrage
   * qui existe est celui du tableau de bord, qui porte son nom, se voit dans un bandeau et se retire d'un clic.
   * Un filtrage muet rouvrirait exactement le défaut que cette épreuve existe pour empêcher.
   */
  it('🔴🔴 le compteur reste le total, et le tri ne masque rien', () => {
    expect((VUE.match(/\{d\.evenementsTotal\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
    /* 🔴 LE TRI RANGE LA LISTE ENTIÈRE : aucune restriction sur ce chemin-là. */
    expect(VUE).toContain('const evenementsRanges = trierEvenements(d.evenements, tri);');
    /**
     * 🔴 ET LE SEUL FILTRAGE EST CELUI DE LA LIGNE DE FILTRES, nommé et réversible.
     * ⚠️ IL A CHANGÉ DE FORME au lot …-ET-LIGNE-DE-FILTRES : `evenementsRanges.filter(…)` écrit à la main est
     * devenu `appliquerFiltres`, le module PUR qui applique les ensembles du tableau de bord. Ce qu'on tient
     * ici est inchangé — le tri ne masque rien, et ce qui masque porte un nom et se défait.
     */
    expect(VUE).toContain('appliquerFiltres(evenementsRanges, ligne, idsParFiltre)');
    expect(VUE).toContain('onReinitialiser={() => allerLigne(LIGNE_PAR_DEFAUT)}');
  });
});

describe('🔴🔴 ④ le statut « New » vient du non-lu de la boîte, et de nulle part ailleurs', () => {
  /**
   * 🔴🔴 « Réutilise ce calcul, sans en créer un nouveau » (Arno). Le lu/non lu vit chez GMAIL depuis le lot
   * 5-BOITE-2 ; `nonLusGmail` est la seule fonction qui le lit, et c'est elle que l'écran appelle.
   */
  it('🔴🔴 l’écran appelle `nonLusGmail`, la même fonction que la boîte', () => {
    expect(REPO).toContain("await import('./lectureGmailReel')");
    expect(REPO).toContain('const nl = await nonLusGmail(depsNonLusGmail());');
    const BOITE = readFileSync('app/(admin)/api/admin/gestion/boite/route.ts', 'utf8');
    expect(BOITE).toContain('nonLusGmail(depsNonLusGmail())');
  });

  /**
   * 🔴 LE GRAIN DU MESSAGE EST RENDU PAR LA MÊME LECTURE, sans un appel Gmail de plus : c'est la même liste, la
   * même rafale d'en-têtes et la même requête en base, dont on ne jette plus l'identifiant du message.
   */
  it('🔴 `nonLusGmail` rend les messages en plus des fils, par la même requête', () => {
    expect(GMAIL).toContain('messages: Set<number>;');
    expect(GMAIL).toContain('async function nosMessagesDeMessageIds(');
    /* ⚠️ UNE SEULE REQUÊTE DANS CETTE FONCTION : deux auraient été deux vérités. (Le fichier en porte une
       seconde, sans rapport : les ancres du MARQUAGE, plus bas.) */
    const i = GMAIL.indexOf('async function nosMessagesDeMessageIds(');
    const fonction = GMAIL.slice(i, GMAIL.indexOf('\n}', i));
    expect((fonction.match(/await query</g) ?? [])).toHaveLength(1);
    expect(fonction).toContain('fils: new Set(rows.map((r) => Number(r.fil_id)))');
    expect(fonction).toContain('messages: new Set(rows.map((r) => Number(r.id)))');
  });

  /**
   * 🔴🔴 « AU MOINS UN MAIL REÇU (pas envoyé par nous) » : c'est `sens = 'recu'` qui le tient, et sans lui une
   * réponse de notre part rendrait le dossier neuf.
   */
  it('🔴🔴 seuls les mails REÇUS comptent, et seulement ceux qui ne sont pas exclus', () => {
    expect(REPO).toContain("AND mn.sens = 'recu'");
    expect(REPO).toContain('AND mn.exclu_le IS NULL');
    expect(REPO).toContain('AND mn.id = ANY(${param}::bigint[])');
  });

  /** 🔴 « Date de l’activité “New” = date du mail reçu non lu le plus RÉCENT » (Arno). */
  it('🔴 la date d’activité est celle du plus récent', () => {
    expect(REPO).toContain('max(mn.recu_le) AS le');
    expect(REPO).toContain('count(DISTINCT mn.id)::int AS nb');
  });

  /**
   * ⚠️ SANS CONNEXION GOOGLE, AUCUNE CARTE N'EST « NEW », et la jointure n'est même pas émise. Déclarer tout le
   * monde neuf parce qu'on ne sait pas lire l'état serait le contraire de la vérité.
   */
  it('⚠️ aucun non-lu à rapprocher : une constante, et aucune jointure', () => {
    expect(REPO).toContain("return `LEFT JOIN LATERAL (SELECT 0::int AS nb, NULL::timestamptz AS le) nl ON true`;");
    expect(REPO).toContain('return nl.disponible ? [...nl.messages] : [];');
  });

  /**
   * ⚠️ UN ÉCHEC DE GMAIL NE FAIT PAS TOMBER L'ÉCRAN : on rend « aucun non-lu ». Payer la page entière pour une
   * pastille serait un mauvais marché.
   */
  it('⚠️ Gmail injoignable : l’écran s’affiche quand même, sans pastille', () => {
    expect(REPO).toContain('[gestion/ecran] non-lus Gmail illisibles — aucune carte « New »');
  });

  /**
   * 🔴 LES MÊMES MAILS QUE PARTOUT AILLEURS : ceux que l'affectation ACTIVE rattache à l'événement, par leur
   * échange ou un par un. Un troisième rapprochement aurait compté d'autres mails que ceux que la carte affiche.
   */
  it('🔴 les mails de l’événement sont ceux de son affectation active', () => {
    expect(REPO).toContain('WHERE an.evenement_id = e.id AND an.actif');
    expect(REPO).toContain('ON (an.message_id IS NOT NULL AND mn.id = an.message_id)');
  });
});
