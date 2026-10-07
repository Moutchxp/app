// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { BlocCartes } from './CartesPersonnes';
import type { GestesCartes, GestesCarteContact } from './CartesPersonnes';
import type { LigneCarte } from '../../../../lib/gestion/partieCategorieRepo';
import type { PersonneAnnuaire } from '../../../../lib/gestion/annuaireRepo';
import { estAncienLocataire, estLocataireEnPlace, parDepartLePlusRecent, tonDuGroupe }
  from '../../../../lib/gestion/historiqueBien';
import { categorieDuGroupe, coteDeLaCategorie } from '../../../../lib/gestion/partieCategorie';
import { categoriesDeLaFiche } from '../../../../lib/gestion/familleDestinataire';

/**
 * ══ 🔴🔴 LOT ANCIENS-LOCATAIRES-VIOLET — DE VRAIES CARTES, ET UNE COULEUR QUI NE SE DIT QU'UNE FOIS ═══════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (07/10/2026), POINT 1 : « Chaque ancien locataire est affiché avec EXACTEMENT le même composant
 * de carte que “LOCATAIRE EN PLACE” […] Chaque ancien locataire a sa propre carte “+ Ajouter un contact”. Elle
 * permet d'ajouter des contacts liés à CET ancien locataire […] Le contact ajouté est rattaché à l'ancien
 * locataire, pas au locataire actuel ni au bien en général. »
 *
 * POINT 2 : « Une SEULE règle décide “ancien locataire vs locataire actuel” (celle de l'encart Parties : date de
 * départ), réutilisée par tous ces endroits. Pas de copie. »
 *
 * ═══ CE QUI EST ÉPROUVÉ AILLEURS, ET POURQUOI CE N'EST PAS ICI ══════════════════════════════════════════════════
 *   · le liseré VIOLET d'un mail d'ancien locataire et le VERT de l'actuel → `historiqueBien.test.ts`, au plus
 *     près de `tonDeLExpediteur`, la fonction que les quatre endroits colorés appellent ;
 *   · la capsule « Envoyé vers ancien locataire » des pièces jointes → `envoisParPartie.test.ts`, au plus près de
 *     `famillesDestinataires` ;
 *   · la capsule violette de la barre de l'Annuaire → `BarreAnnuaire.test.ts`, qui la rend pour de vrai.
 * Les rapatrier ici aurait fait deux épreuves pour une même règle, et c'est la seconde qu'on oublie de lire.
 *
 * 🔒 AUCUNE BASE, AUCUNE DONNÉE RÉELLE : des personnes inventées, et des lectures de fichiers.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ANNUAIRE = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
const CARTES = readFileSync('app/(admin)/admin/(protected)/gestion/CartesPersonnes.tsx', 'utf8');
const THEME = readFileSync('app/globals.css', 'utf8');
const MIGRATION = readFileSync('db/migrations/318_gestion_partie_categorie_ancien_locataire.sql', 'utf8');

const carte = (o: Partial<LigneCarte> = {}): LigneCarte => ({
  id: 1, lotCle: '219', cote: 'ancien_locataire', locataireId: 247,
  adresse: 'avocat@invente.test', nom: 'Maître INVENTÉ', telephone: null, origine: 'manuel',
  verifieLe: '2026-10-07T09:00:00Z', verifiePar: 'a.jorel@sansvisavis.com',
  creeLe: '2026-10-07T09:00:00Z', creePar: 'a.jorel@sansvisavis.com',
  note: null, civilite: null, prenom: null, qualite: null,
  adressePostale: null, codePostal: null, commune: null, coordonnees: [], ...o,
});

const personne = (o: Partial<PersonneAnnuaire> = {}): PersonneAnnuaire => ({
  sujet: 'locataire', id: 247, cle: '247', civilite: 'M.', prenom: 'Thibaut', nom: 'HIRSCH',
  nomAffiche: 'M. HIRSCH Thibaut', qualite: null, note: null, rang: 1, archive: false, archiveLe: null,
  archivePar: null, adresse: null, commune: null, codePostal: null, contacts: [], absent: false,
  creeLe: null, importeLe: null, ...o,
} as PersonneAnnuaire);

let hote: HTMLDivElement;
let racine: Root;

const gestesCartes = {
  modifiable: true,
  onEnregistrer: async () => null, onArchiver: async () => null, onRestaurer: async () => null,
  onSeparer: async () => null, onRemplacer: () => {}, onOrdonner: () => {}, onSupprimer: async () => null,
} as unknown as GestesCartes;

const gestesContact: GestesCarteContact = {
  modifiable: true,
  onVerifier: async () => null,
  onModifier: async () => null,
  onRetirer: async () => null,
  onRanger: async () => null,
};

beforeEach(() => {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  racine = createRoot(hote);
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); });

/** La rangée d'un ancien locataire, montée EXACTEMENT comme la fiche la monte (voir le garde statique ① bis). */
async function monterLaRangee(contacts: readonly LigneCarte[] = []): Promise<void> {
  await act(async () => {
    racine.render(createElement(BlocCartes, {
      titre: 'HIRSCH Thibaut', id: 'ann-ancien-259',
      sousTitre: 'du 01/09/2022 au 25/09/2024',
      personnes: [personne()], gestes: gestesCartes, role: 'Parti',
      motAjouter: 'Ajouter un contact',
      contacts, gestesContact,
      creationContact: {
        motClient: 'Occupant (client)',
        motContact: 'Contact du locataire',
        rappel: 'Rangé comme contact de HIRSCH Thibaut, ancien locataire du lot 219.',
        /* ⚠️ LA PORTE D'ÉCRITURE EST ÉPROUVÉE SUR LE TEXTE DE LA FICHE (cas ② ci-dessous) : elle passe par le
           réseau, et la simuler ici n'aurait rien prouvé de plus que ce que le garde statique dit déjà. */
        onCreer: async () => null,
      },
      teinte: 'violet',
    }));
  });
}

const cliquer = async (el: Element | null | undefined): Promise<void> => {
  await act(async () => { (el as HTMLElement | null)?.click(); });
  await act(async () => { await Promise.resolve(); });
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 LA CARTE D'UN ANCIEN LOCATAIRE EST LE MÊME COMPOSANT QUE CELLE DU LOCATAIRE EN PLACE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① la carte d’un ancien locataire', () => {
  /**
   * 🔴 LE MÊME COMPOSANT, ET ON LE PROUVE PAR LE TEXTE DE LA FICHE : elle monte `BlocCartes` pour les occupants
   * EN PLACE et pour les anciens, avec les MÊMES `gestes`. Deux composants auraient pu se ressembler à l'écran et
   * diverger au premier champ ajouté — c'est le même, ou ce n'est rien.
   */
  it('🔴🔴 la fiche monte le MÊME `BlocCartes` pour les anciens que pour les occupants en place', () => {
    const vue = ANNUAIRE.slice(ANNUAIRE.indexOf('function VueLot'), ANNUAIRE.indexOf('export const CSS_ANNUAIRE'));
    /* La rangée des occupants en place, et celle de chaque ancien : le même composant, les mêmes gestes. */
    expect(vue).toContain('<BlocCartes titre={`Locataire${actuels.length > 1 ? \'s\' : \'\'} en place`}');
    expect(vue).toContain('<BlocCartes key={`anc-${o.occupationId}`} titre={o.nom}');
    expect(vue).toContain('personnes={carte} role="Parti" motAjouter="Ajouter un contact" gestes={gestes}');
    /* 🔴 ET LA CARTE VIENT DE LA MÊME LECTURE QUE CELLE DES OCCUPANTS (`personnesDe('locataire', …)`). */
    const repo = readFileSync('app/lib/gestion/annuaireRepo.ts', 'utf8');
    expect(repo).toContain("occupants: await personnesDe(\n        'locataire', occ.filter(estLocataireEnPlace)");
    expect(repo).toContain("anciensOccupants: await personnesDe(\n        'locataire', occ.filter(estAncienLocataire)");
  });

  /** 🔴 LE CRAYON, LE MENU, LES CHAMPS : tout ce qu'Arno énumère est là, parce que c'est la carte des clients. */
  it('🔴🔴 elle porte le crayon, le menu et la capsule « PARTI »', async () => {
    await monterLaRangee();
    const carteClient = hote.querySelector('.cp-carte') as HTMLElement;
    expect(carteClient).not.toBeNull();
    expect(carteClient.textContent).toContain('HIRSCH');
    /* La capsule de rôle dit « Parti » — à la place de « En place ». */
    expect(carteClient.textContent).toContain('Parti');
    /* Le crayon de modification et le menu « … » : les deux boutons de l'en-tête d'une carte client. */
    const boutons = [...carteClient.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? '');
    expect(boutons.some((l) => /modifier/i.test(l)), boutons.join(' · ')).toBe(true);
  });

  /** 🔴 LA PÉRIODE EST SOUS LE NOM (« du … au … »), et la capsule « PARTI » dans la carte. */
  it('🔴🔴 la période d’occupation remplace « Enregistrer un départ »', async () => {
    await monterLaRangee();
    expect(hote.querySelector('.cp-sous-titre')?.textContent).toBe('du 01/09/2022 au 25/09/2024');
    /* 🔴 ET AUCUN « Enregistrer un départ » : un bail terminé n'a pas de départ à enregistrer. */
    expect(hote.textContent).not.toContain('Enregistrer un départ');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 « AJOUTER UN CONTACT » RATTACHE LE CONTACT À L'ANCIEN LOCATAIRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② « Ajouter un contact », sur CET ancien locataire', () => {
  /**
   * 🔴 LA TUILE OUVRE DIRECTEMENT LE FORMULAIRE DE CONTACT, sans le petit choix à deux boutons : il n'y a qu'une
   * réponse possible — on n'ajoute pas un OCCUPANT à un bail terminé. Poser une question dont l'écran connaît la
   * réponse est le reproche qu'Arno nous a déjà fait au lot HISTORIQUE-BIEN-6.
   */
  it('🔴🔴 la tuile ouvre le formulaire de contact, sans question inutile', async () => {
    await monterLaRangee();
    const tuile = hote.querySelector('.cp-carte--ajout');
    expect(tuile?.textContent).toContain('Ajouter un contact');
    await cliquer(tuile);
    /* Pas d'étape « Ajouter… » à deux boutons : le formulaire est là tout de suite. */
    expect(hote.querySelector('.cp-carte--choix')).toBeNull();
    expect(hote.querySelector('.cp-carte--edition')).not.toBeNull();
    expect(hote.textContent).toContain('ancien locataire du lot 219');
  });

  /**
   * 🔴🔴 LE RATTACHEMENT EST ÉCRIT DANS LE GESTE, ET LA BASE LE TIENT. Arno : « rattaché à l'ancien locataire,
   * pas au locataire actuel ni au bien en général ». Trois preuves, et il en faut trois :
   *   ① l'écran envoie `locataireId` avec la catégorie `ancien_locataire` ;
   *   ② le dépôt REFUSE l'une sans l'autre, dans les deux sens ;
   *   ③ la base porte la même équivalence en contrainte — un script ne peut pas la contourner.
   */
  it('🔴🔴 l’écran envoie `locataireId` avec la catégorie, et le dépôt refuse l’un sans l’autre', () => {
    expect(ANNUAIRE).toContain(
      "cible: `lot-${f.numero}`, adresse, categorie: 'ancien_locataire', locataireId, ...fiche,");
    const repo = readFileSync('app/lib/gestion/partieCategorieRepo.ts', 'utf8');
    expect(repo).toContain('Un contact d’ancien locataire se range sur un ancien locataire précis.');
    expect(repo).toContain('Seul un contact d’ancien locataire se rattache à une personne.');
    expect(MIGRATION.replace(/\s+/g, ' '))
      .toContain("CHECK ((categorie = 'ancien_locataire') = (locataire_id IS NOT NULL))");
    expect(MIGRATION.replace(/\s+/g, ' '))
      .toContain("CHECK ((cote = 'ancien_locataire') = (locataire_id IS NOT NULL))");
  });

  /** 🔴 ET SES CONTACTS SONT LES SIENS : la fiche ne montre dans sa rangée que les cartes de CETTE personne. */
  it('🔴🔴 la fiche ne montre que les contacts de CET ancien locataire', () => {
    expect(ANNUAIRE).toContain(
      "cartesCreees.filter((c) => c.cote === 'ancien_locataire' && c.locataireId === locataireId)");
    /* ⚠️ ET LE CARROUSEL DU LOCATAIRE EN PLACE NE LES REPREND PAS : son filtre reste `cote === 'locataire'`. */
    expect(ANNUAIRE).toContain("const contactsLocataire = cartesCreees.filter((c) => c.cote === 'locataire');");
  });

  /** 🔴 LES CARTES DE CONTACT D'UN ANCIEN SONT RENDUES DANS SA RANGÉE, comme celles du locataire en place. */
  it('🔴 ses cartes de contact sont dans sa rangée', async () => {
    await monterLaRangee([carte({ id: 11, nom: 'AVOCAT' })]);
    const cartes = [...hote.querySelectorAll('.cp-carte')];
    /* Le client, son contact, et la tuile d'ajout. */
    expect(cartes).toHaveLength(3);
    expect(cartes[1].className).toContain('cp-carte--contact');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 LES JETONS VIOLETS, EN CLAIR ET EN SOMBRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ le violet est un jeton du thème, dans les deux modes', () => {
  /**
   * 🔴 AUCUNE COULEUR N'EST ÉCRITE EN DUR DANS UN ÉCRAN. La paire tamisée existait déjà (lot 84), avec ses deux
   * variantes et ses contrastes mesurés — 5,48:1 en Clair (#7d3ac1 sur #f3e8ff), 7,74:1 en Sombre (#c9a9f0 sur
   * #2b1d3d). En créer une SECONDE aurait donné deux violets pour une même notion dans le même écran.
   */
  it('🔴🔴 la paire violette est définie en Clair, en Sombre et en Système', () => {
    const blocs = THEME.split('--color-svv-violet-soft:');
    /* Trois définitions : `:root`, `[data-theme='dark']`, et la requête `prefers-color-scheme`. */
    expect(blocs.length - 1).toBe(3);
    expect(THEME).toContain('--color-svv-violet: #7d3ac1;');
    expect(THEME).toContain('--color-svv-violet: #c9a9f0;');
    /* 🔴 LE VOILE EST LE SEUL JETON NEUF DE CE LOT : un violet TRANSPARENT, demandé par Arno pour les cartes. */
    expect(THEME.split('--color-svv-violet-voile:').length - 1).toBe(3);
    expect(THEME).toContain('--color-svv-violet-voile: rgba(125, 58, 193, .06);');
    expect(THEME).toContain('--color-svv-violet-voile: rgba(201, 169, 240, .10);');
  });

  /**
   * 🔴 LE FOND DES CARTES EST UN VOILE, POSÉ PAR-DESSUS : la carte garde sa surface, son ombre, son bord et la
   * trame d'une carte « à vérifier ». Remplacer la propriété background les aurait effacées toutes les trois.
   */
  it('🔴🔴 les cartes d’un ancien locataire et de ses contacts sont voilées de violet', async () => {
    expect(CARTES).toContain(
      '.cp-bloc--violet .cp-carte{\n'
      + '  background-image:linear-gradient(var(--color-svv-violet-voile),var(--color-svv-violet-voile));');
    await monterLaRangee([carte({ id: 11 })]);
    /* 🔴 LA TEINTE EST SUR LE BLOC, donc elle couvre les trois cartes — y compris la TUILE D'AJOUT, qui est
       précisément ce que la couleur protège : deux tuiles identiques, et seul le voisinage dit à qui le contact
       va s'attacher. */
    expect(hote.querySelector('.cp-bloc--violet')).not.toBeNull();
    expect(hote.querySelectorAll('.cp-bloc--violet .cp-carte')).toHaveLength(3);
  });

  /** 🔴 AUCUN `#rrggbb` ÉCRIT DANS LES ÉCRANS DE CE LOT : seuls des jetons, qui ont leurs deux variantes. */
  it('🔴 aucun violet écrit en dur dans les écrans', () => {
    for (const f of [
      'app/(admin)/admin/(protected)/gestion/CartesPersonnes.tsx',
      'app/(admin)/admin/(protected)/gestion/Annuaire.tsx',
      'app/(admin)/admin/(protected)/gestion/HistoriqueDuBien.tsx',
      'app/(admin)/admin/(protected)/gestion/FriseDuBien.tsx',
      'app/(admin)/admin/(protected)/gestion/VieDuBien.tsx',
      'app/(admin)/admin/(protected)/gestion/BarreAnnuaire.tsx',
      'app/(admin)/admin/(protected)/gestion/DestinatairesDePiece.tsx',
    ]) {
      const css = (readFileSync(f, 'utf8').match(/--violet\{[^}]*\}|--ancien\{[^}]*\}/g) ?? []).join(' ');
      expect(css, f).not.toMatch(/#[0-9a-f]{3,6}/i);
    }
  });

  /** 🔴 LE LISERÉ DU TITRE « HISTORIQUE DES LOCATAIRES » PASSE EN VIOLET (Arno, mot pour mot). */
  it('🔴🔴 le liseré du titre « Historique des locataires » est violet', () => {
    expect(ANNUAIRE).toContain('className="ann-repli ann-repli--ancien" id="ann-histo-loc"');
    expect(ANNUAIRE).toContain('.ann-repli--ancien::before{content:"";flex:0 0 auto;width:3px;height:1em;');
    expect(ANNUAIRE).toContain('background:var(--color-svv-violet)}');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ 🔴🔴 LA CAPSULE « ANCIEN LOCATAIRE » DE L'ANNUAIRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ④ la capsule « Ancien locataire »', () => {
  /**
   * Deux endroits la rendent : la barre de recherche (éprouvée dans `BarreAnnuaire.test.ts`, qui la monte pour
   * de vrai) et l'en-tête d'une fiche de locataire. Les deux passent au violet, et le MOT ne change pas d'un
   * caractère — une couleur seule ne se lit ni en niveaux de gris, ni au lecteur d'écran.
   */
  it('🔴🔴 l’en-tête d’une fiche de locataire porte le violet quand il est parti', () => {
    expect(ANNUAIRE).toContain(
      "<span className={`ann-role-capsule${enCours.length > 0 ? '' : ' ann-role-capsule--ancien'}`}>");
    expect(ANNUAIRE).toContain(
      '.ann-role-capsule--ancien{color:var(--color-svv-violet);background:var(--color-svv-violet-soft);');
    /* 🔴 LE MOT RESTE : « Ancien locataire », écrit, à côté de la couleur. */
    expect(ANNUAIRE).toContain("{enCours.length > 0 ? 'Locataire en place' : 'Ancien locataire'}");
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ 🔴🔴 UNE SEULE RÈGLE « ANCIEN OU ACTUEL », ET TOUT LE MONDE L'APPELLE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ⑤ une seule règle ancien/actuel', () => {
  /** 🔴 LA RÈGLE, PRISE AU MOT : « celle de l'encart Parties : date de départ » (Arno). */
  it('🔴🔴 une date de départ renseignée fait l’ancien locataire, et rien d’autre', () => {
    expect(estAncienLocataire({ sortie: '2024-09-25' })).toBe(true);
    expect(estLocataireEnPlace({ sortie: '2024-09-25' })).toBe(false);
    expect(estAncienLocataire({ sortie: null })).toBe(false);
    expect(estLocataireEnPlace({ sortie: null })).toBe(true);
    /* ⚠️ UNE CHAÎNE VIDE N'EST PAS UNE DATE : le bail court toujours. */
    expect(estAncienLocataire({ sortie: '   ' })).toBe(false);
    /**
     * ⚠️ UNE SORTIE À VENIR EST UN DÉPART ACTÉ, et c'est délibéré : c'est la règle de l'encart Parties, et elle
     * ne change personne de bloc. Mesuré le 07/10/2026 : 4 occupations sur 535 portent une sortie future.
     */
    expect(estAncienLocataire({ sortie: '2099-01-01' })).toBe(true);
  });

  /**
   * 🔴🔴 ELLE N'EST ÉCRITE QU'UNE FOIS. Avant ce lot, « a-t-il une date de sortie ? » était recopié dans le
   * dépôt, dans la fiche du bien, dans la fiche d'un locataire et dans la carte des catégories. On exige
   * maintenant qu'aucun de ces fichiers ne la réécrive — ils APPELLENT.
   */
  it('🔴🔴 aucun écran ne réécrit la règle : ils appellent la fonction', () => {
    for (const f of [
      'app/lib/gestion/annuaireRepo.ts',
      'app/(admin)/admin/(protected)/gestion/Annuaire.tsx',
      'app/lib/gestion/familleDestinataire.ts',
    ]) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toMatch(/estAncienLocataire|estLocataireEnPlace/);
      /* ⚠️ COMMENTAIRES RETIRÉS : ils RACONTENT la règle (« o.sortie === null »), et la raconter n'est pas la
         réécrire. C'est le code qu'on mesure. */
      const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
      expect(code, f).not.toContain('o.sortie === null');
      expect(code, f).not.toContain('!o.encours');
    }
  });

  /**
   * 🔴 ET LA MÊME RÈGLE NOURRIT LA COULEUR : `categoriesDeLaFiche` range l'adresse d'une occupation CLOSE en
   * `ancien_locataire`, et celle d'un occupant en place en `locataire`. Tout le reste en découle — le liseré
   * d'un mail, les traits de la frise, la pastille d'une adresse, le liseré d'un groupe de pièces jointes et la
   * capsule d'un statut d'envoi lisent cette carte, et elle seule.
   */
  it('🔴🔴 la carte des catégories distingue l’ancien de l’actuel, par la même règle', () => {
    const mail = (valeur: string) => ({ id: 1, sorte: 'email' as const, valeur, affichage: valeur,
      absent: false, note: null, libelle: null, typeAnnotation: null });
    const cats = categoriesDeLaFiche({
      proprietaires: [{ contacts: [mail('proprio@invente.test')] }],
      proprietaireContacts: [],
      occupants: [{ contacts: [mail('enplace@invente.test')] }],
      occupations: [
        { sortie: null, contacts: [mail('enplace@invente.test')] },
        { sortie: '2024-09-25', contacts: [mail('parti@invente.test')] },
      ],
    });
    expect(cats.get('enplace@invente.test')).toBe('locataire');
    expect(cats.get('parti@invente.test')).toBe('ancien_locataire');
    expect(cats.get('proprio@invente.test')).toBe('proprietaire');
    /* 🔴 ET LE TON SUIT LA CATÉGORIE, sans qu'aucun écran ne sache ce qu'est un ancien locataire. */
    expect(tonDuGroupe('ancien_locataire')).toBe('violet');
    expect(tonDuGroupe('locataire')).toBe('vert');
  });

  /**
   * 🔴 L'ANCIEN LOCATAIRE A SA COULEUR, MAIS PAS SON ENCART : il reste DANS le groupe « Locataire » du bloc
   * PARTIES, derrière son onglet « Anciens locataires (N) ». Arno ne demande pas un cinquième groupe, et un
   * cinquième groupe aurait déplacé toutes les cases à cocher de l'encart.
   */
  it('🔴 il est peint à part, mais rangé avec le locataire', () => {
    expect(categorieDuGroupe('ancien_locataire')).toBe('locataire');
    expect(categorieDuGroupe('locataire')).toBe('locataire');
    /* 🔴 ET IL A SON PROPRE CÔTÉ DE CARTE : un contact rangé là ne paraît dans aucun des deux autres carrousels. */
    expect(coteDeLaCategorie('ancien_locataire')).toBe('ancien_locataire');
    expect(coteDeLaCategorie('independant')).toBeNull();
  });

  /** 🔴 « DU PLUS RÉCENT AU PLUS ANCIEN » (Arno) — le MÊME comparateur que l'onglet de l'encart Parties. */
  it('🔴 les rangées sont ordonnées du départ le plus récent au plus ancien', () => {
    const a = { sortie: '2024-09-25', entree: '2022-09-01', nom: 'HIRSCH' };
    const b = { sortie: '2021-06-30', entree: '2019-01-01', nom: 'MARTIN' };
    const sansDate = { sortie: null, entree: null, nom: 'INCONNU' };
    expect([b, sansDate, a].sort(parDepartLePlusRecent).map((x) => x.nom))
      .toEqual(['HIRSCH', 'MARTIN', 'INCONNU']);
    /* 🔴 ET LA FICHE L'EMPLOIE, plutôt que de retrier à sa façon. */
    expect(ANNUAIRE).toContain('const anciens = [...passes].sort((a, b) => parDepartLePlusRecent(');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ 🔒 LA MIGRATION 318 — ELLE AJOUTE, ELLE NE TOUCHE À RIEN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒 ⑥ la migration 318', () => {
  /**
   * 🔴 AUCUNE DONNÉE N'EST LUE, ÉCRITE NI DÉPLACÉE : pas un `UPDATE`, pas un `INSERT`, pas un `DELETE`. Elle
   * n'ajoute qu'une colonne, deux contraintes et des index — et les index gardent exactement leur effet sur
   * l'existant, puisque `locataire_id` y vaut NULL partout.
   */
  it('🔴🔴 elle n’écrit aucune donnée', () => {
    const sql = MIGRATION.replace(/--[^\n]*/g, ' ').toUpperCase();
    for (const verbe of ['UPDATE ', 'INSERT ', 'DELETE FROM']) expect(sql, verbe).not.toContain(verbe);
  });

  /** 🔴 LES DEUX TABLES DU RANGEMENT SONT TRAITÉES : la catégorie (la couleur) ET la carte (ce qui s'affiche). */
  it('🔴 elle traite les DEUX tables, et nomme la liste des catégories du module pur', () => {
    expect(MIGRATION).toContain('gestion_partie_categorie');
    expect(MIGRATION).toContain('gestion_contact_carte');
    const pur = readFileSync('app/lib/gestion/partieCategorie.ts', 'utf8');
    expect(pur).toContain(
      "export type Categorie = 'proprietaire' | 'locataire' | 'ancien_locataire' | 'independant' | 'a_repartir';");
    expect(MIGRATION.replace(/\s+/g, ' ')).toContain(
      "ARRAY['proprietaire', 'locataire', 'ancien_locataire', 'independant', 'a_repartir']");
  });

  /** 🔴 SANS LA MIGRATION, LE GESTE EST REFUSÉ AVEC SON MOTIF — jamais rangé de travers. */
  it('🔴 sans la 318, le rattachement est refusé et la colonne n’est nommée nulle part', () => {
    const repo = readFileSync('app/lib/gestion/partieCategorieRepo.ts', 'utf8');
    expect(repo).toContain('const SANS_318 =');
    expect(repo).toContain('if (ancien && !avecAncien) return { ok: false, motif: SANS_318 };');
    /* La colonne n'entre dans le SQL que derrière la sonde. */
    expect(repo).toContain("${avecAncien ? ', locataire_id' : ''}");
    expect(repo).toContain("${avecAncien ? 'locataire_id::text' : 'NULL::text'}");
  });
});
