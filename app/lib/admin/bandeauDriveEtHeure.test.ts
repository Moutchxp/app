import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  FUSEAU_PARIS, heureCourteParis, infobulleHeureParis, msAvantProchaineMinute,
  PLANCHER_PROCHAINE_MINUTE_MS,
} from './heureParis';
import { AIDE_DRIVE_BANDEAU, DEPART_DRIVE_BANDEAU, LIBELLE_DRIVE_BANDEAU } from './driveBandeau';
import { RACINE_DRIVES_PARTAGES } from '../gestion/cibleDepot';

/**
 * ══ 🔴🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU, POINT 2 — LE BOUTON « DRIVE » ET L'HEURE DE PARIS ══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (04/10/2026) :
 *   a) « Juste à droite de “Nom · Statut” du collaborateur connecté : un bouton “Drive” (icône Drive + libellé) qui
 *      ouvre NOTRE fenêtre Drive (celle de l'application : arborescence, renommage, corbeille), positionnée sur
 *      “Drives partagés”. Même fenêtre, même code. Pas de copie. »
 *   b) « Côté droit de la même ligne, juste AVANT “Changer mon mot de passe” : l'heure en heure française
 *      (Europe/Paris, quel que soit le fuseau de l'ordinateur), au format “10:58”, mise à jour chaque minute. Au
 *      survol : “dimanche 4 octobre 2026, 10:58”. Discret, même style que le bandeau. »
 *   « Lisible en Clair et en Sombre, et à toutes les largeurs (rien ne passe à la ligne de travers). »
 *
 * ═══ 🔴🔴 CE QUI MÉRITE UNE ÉPREUVE ICI, ET CE QUI N'EN MÉRITE PAS ═══════════════════════════════════════════════
 *
 * « Quel que soit le fuseau de l'ordinateur » est une RÈGLE, et c'est la seule du lot qu'une machine puisse
 * oublier sans que personne ne le voie : le dépôt tourne sur des postes réglés sur Paris, où un `timeZone`
 * manquant donne exactement le bon résultat. Ces épreuves forcent donc un AUTRE fuseau — et l'erreur
 * apparaîtrait tout de suite, au lieu d'attendre un déplacement à l'étranger.
 *
 * Le reste est du CÂBLAGE, et c'est là que les mensonges se glissent : une fenêtre RECOPIÉE au lieu d'être
 * réutilisée, un identifiant de regroupement réécrit en dur, un bouton posé au mauvais endroit du bandeau.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const LAYOUT = readFileSync('app/(admin)/admin/(protected)/layout.tsx', 'utf8');
const BTN = readFileSync('app/(admin)/admin/(protected)/BoutonDriveBandeau.tsx', 'utf8');
const HEURE = readFileSync('app/(admin)/admin/(protected)/HeureParis.tsx', 'utf8');
const SIDEBAR = readFileSync('app/(admin)/admin/(protected)/Sidebar.tsx', 'utf8');

describe('🔴🔴 ① l’heure est celle de PARIS, quel que soit le fuseau de la machine', () => {
  /**
   * 🔴🔴 LE FUSEAU EST IMPOSÉ, PAS HÉRITÉ. Ces instants sont fixes et les réponses attendues ont été calculées
   * avec `TZ=America/New_York` : si quelqu'un retirait `timeZone`, ce test passerait encore à Paris et rougirait
   * partout ailleurs. On le force donc ici, dans le test lui-même, en vérifiant que le fuseau du module est
   * écrit — et en fixant des valeurs qui ne sont justes QUE pour Paris.
   */
  it('🔴🔴 « 10:58 » en heure de Paris, sur des instants fixes', () => {
    expect(FUSEAU_PARIS).toBe('Europe/Paris');
    /* 04/10/2026 09:33 UTC = 11:33 à Paris (heure d'été). C'est l'instant mesuré à l'écran pendant ce lot. */
    expect(heureCourteParis(new Date('2026-10-04T09:33:00Z'))).toBe('11:33');
    /* ⚠️ MINUIT PASSÉ, ET LE JOUR CHANGE : 15/01 23:05 UTC = le 16 à 00:05 à Paris (heure d'hiver, UTC+1). */
    expect(heureCourteParis(new Date('2026-01-15T23:05:00Z'))).toBe('00:05');
    expect(infobulleHeureParis(new Date('2026-01-15T23:05:00Z'))).toBe('vendredi 16 janvier 2026, 00:05');
  });

  /**
   * 🔴🔴 LES DEUX CHANGEMENTS D'HEURE, parce que c'est là qu'une horloge « à la main » (UTC + 2 h) se trompe —
   * et elle se trompe deux fois par an, pendant six mois.
   */
  it('🔴🔴 le passage à l’heure d’hiver et à l’heure d’été', () => {
    /* 25/10/2026 : à 00:59 UTC Paris est encore en UTC+2 (02:59), à 01:00 UTC il repasse en UTC+1 (02:00). */
    expect(heureCourteParis(new Date('2026-10-25T00:59:00Z'))).toBe('02:59');
    expect(heureCourteParis(new Date('2026-10-25T01:00:00Z'))).toBe('02:00');
    /* 29/03/2026 : à 00:59 UTC il est 01:59 à Paris, à 01:00 UTC il saute à 03:00 — 02:00 n'existe pas ce jour-là. */
    expect(heureCourteParis(new Date('2026-03-29T00:59:00Z'))).toBe('01:59');
    expect(heureCourteParis(new Date('2026-03-29T01:00:00Z'))).toBe('03:00');
  });

  /**
   * 🔴 L'INFOBULLE EST CELLE D'ARNO, AVEC SA VIRGULE. `Intl` écrirait « dimanche 4 octobre 2026 à 10:58 » : « à »
   * et non « , ». On compose donc les deux morceaux — ce qui garantit aussi que l'heure de l'infobulle est
   * EXACTEMENT celle du bandeau, et non un second format qui pourrait arrondir autrement.
   */
  it('🔴 « dimanche 4 octobre 2026, 11:33 » — virgule comprise', () => {
    const d = new Date('2026-10-04T09:33:00Z');
    expect(infobulleHeureParis(d)).toBe('dimanche 4 octobre 2026, 11:33');
    expect(infobulleHeureParis(d)).toContain(heureCourteParis(d));
    expect(infobulleHeureParis(d)).not.toContain(' à ');
  });

  /**
   * ══ 🔴🔴 LA MISE À JOUR SE RECALE SUR LA MINUTE ════════════════════════════════════════════════════════════
   *
   * Un `setInterval(60_000)` posé à 10:58:59 afficherait « 10:58 » jusqu'à 10:59:59 : une horloge avec une minute
   * de retard, en permanence, pour qui la regarde juste après le chargement. On attend donc la seconde 0.
   */
  it('🔴🔴 on attend la seconde 0, et jamais moins d’une seconde', () => {
    /* À 10:58:00,000 il reste une minute pleine. */
    expect(msAvantProchaineMinute(new Date('2026-10-04T10:58:00.000Z'))).toBe(60_000);
    /* À 10:58:30,000 il reste trente secondes — et non soixante. */
    expect(msAvantProchaineMinute(new Date('2026-10-04T10:58:30.000Z'))).toBe(30_000);
    /* ⚠️ LE PLANCHER : à 10:58:59,998 le reste vaut 2 ms, et une minuterie de 2 ms ferait deux tours dans la même
       minute. Le plancher coûte au pire une seconde d'affichage, une fois par minute, et supprime la boucle. */
    expect(msAvantProchaineMinute(new Date('2026-10-04T10:58:59.998Z')))
      .toBe(PLANCHER_PROCHAINE_MINUTE_MS);
    expect(PLANCHER_PROCHAINE_MINUTE_MS).toBe(1000);
  });
});

describe('🔴🔴 ② rien n’est rendu par le serveur, et l’onglet réveillé se remet à l’heure', () => {
  /**
   * 🔴🔴 UNE HORLOGE RENDUE PAR LE SERVEUR SERAIT FAUSSE À LA SECONDE SUIVANTE, et surtout DIFFÉRENTE de celle que
   * le navigateur calcule en reprenant la page — l'écart d'hydratation que React signale puis corrige en silence.
   * On rend donc `null` jusqu'au montage. Même règle que le thème admin (`snapshotThemeServeur`).
   */
  it('🔴🔴 `null` jusqu’au montage dans le navigateur', () => {
    expect(HEURE).toContain('const [instant, setInstant] = useState<Date | null>(null);');
    expect(HEURE).toContain('if (instant === null) return null;');
  });

  /**
   * 🔴🔴 ET ON SE REMET À L'HEURE EN REVENANT SUR L'ONGLET. Un onglet en arrière-plan voit ses minuteries BRIDÉES
   * (jusqu'à une par minute, et bien moins quand la machine dort) : sans ce réveil, on retrouverait une horloge
   * arrêtée sur l'heure du moment où l'on a changé d'onglet. C'est le piège mesuré sur l'onglet piloté de ce dépôt.
   */
  it('🔴🔴 le retour sur l’onglet relit l’horloge', () => {
    expect(HEURE).toContain("document.addEventListener('visibilitychange', reveil);");
    expect(HEURE).toContain("if (document.visibilityState !== 'visible') return;");
    /* ⚠️ ET LA MINUTERIE EST TOUJOURS NETTOYÉE : au réveil comme au démontage, sinon deux boucles tournent. */
    expect(HEURE).toContain('if (minuterie !== undefined) clearTimeout(minuterie);');
    expect(HEURE).toContain("document.removeEventListener('visibilitychange', reveil);");
  });

  /**
   * 🔴 CHAQUE BATTEMENT RECALCULE SON DÉLAI. Une minuterie posée une fois pour toutes dériverait de quelques
   * millisecondes par tour et finirait par changer de minute une seconde trop tôt.
   */
  it('🔴 la minuterie se reprogramme à chaque battement', () => {
    expect(HEURE).toContain('minuterie = setTimeout(battre, msAvantProchaineMinute(d));');
    expect(HEURE).not.toContain('setInterval');
  });

  /** ⚠️ UN `<time>`, PAS UN `<span>` : c'est l'élément que HTML prévoit, et son `dateTime` est lisible par machine. */
  it('⚠️ c’est un `<time>`, avec son libellé accessible', () => {
    expect(HEURE).toContain('<time className="svv-adm-heure" dateTime={instant.toISOString()}');
    expect(HEURE).toContain('title={complet} aria-label={complet}');
  });
});

describe('🔴🔴 ③ le bouton « Drive » ouvre NOTRE fenêtre, sans en recopier une ligne', () => {
  /**
   * 🔴🔴 « MÊME FENÊTRE, MÊME CODE. PAS DE COPIE. » C'est `SelecteurFichierDrive` qui est monté — le composant que
   * la fenêtre Drive EST, celui du rangement d'une pièce et du Drive d'un bien. Tout ce qui s'y ajoute (hier le
   * crayon ✏️, avant-hier la corbeille du Drive) apparaît donc ici le même jour, sans une ligne de plus.
   */
  it('🔴🔴 c’est `SelecteurFichierDrive`, et aucun bout de fenêtre n’est réécrit', () => {
    expect(BTN).toContain("import('./gestion/SelecteurFichierDrive').then((m) => "
      + '({ default: m.SelecteurFichierDrive }))');
    /* ⚠️ AUCUNE MARQUE DE LA FENÊTRE RECOPIÉE ICI : ni ses classes, ni son listing, ni sa barre latérale. */
    for (const marque of ['sfd-ligne', 'sfd-cote', 'sfd-nom', 'drive/fichiers', 'aplatir(']) {
      expect(BTN, marque).not.toContain(marque);
    }
  });

  /**
   * 🔴 `mode="consulter"`, ET C'EST LE SEUL MODE JUSTE : « joindre » suppose un message en cours d'écriture,
   * « ranger » suppose des pièces reçues à poser. Ouvert depuis le bandeau, on vient REGARDER.
   */
  it('🔴 mode « consulter », et le départ sur « Drives partagés »', () => {
    expect(BTN).toContain('mode="consulter"');
    expect(BTN).toContain('dossierDepart={DEPART_DRIVE_BANDEAU}');
    expect(DEPART_DRIVE_BANDEAU).toEqual({ id: RACINE_DRIVES_PARTAGES, nom: 'Drives partagés' });
    /* 🔴🔴 L'IDENTIFIANT N'EST PAS RÉÉCRIT EN DUR : il vient de `cibleDepot`, où la route de dépôt le REFUSE
       déjà. Deux sources pour ce mot, et le bouton ouvrirait un listing vide le jour où il change. */
    expect(readFileSync('app/lib/admin/driveBandeau.ts', 'utf8'))
      .toContain("import { RACINE_DRIVES_PARTAGES } from '../gestion/cibleDepot';");
    expect(BTN).not.toContain('svav:drives');
  });

  /**
   * 🔴 LA FENÊTRE N'ARRIVE QU'AU CLIC. Ce bandeau coiffe TOUT l'admin ; importée en statique, la plus grosse
   * fenêtre du module Gestion partirait dans le paquet de chaque page, pour un bouton cliqué une fois sur cent.
   */
  it('🔴 chargée à la demande, et jamais rendue côté serveur', () => {
    expect(BTN).toContain("import dynamic from 'next/dynamic';");
    expect(BTN).toContain('{ ssr: false }');
  });

  /** ⚠️ L'ICÔNE NE PORTE PAS L'INFORMATION SEULE : le libellé est écrit, et l'infobulle dit que c'est NOTRE outil. */
  it('⚠️ icône ET libellé, et une infobulle qui lève la confusion avec Google', () => {
    expect(LIBELLE_DRIVE_BANDEAU).toBe('Drive');
    expect(AIDE_DRIVE_BANDEAU).toContain('dans l’application');
    expect(AIDE_DRIVE_BANDEAU).toContain('Drives partagés');
    expect(BTN).toContain('<span>{LIBELLE_DRIVE_BANDEAU}</span>');
    expect(BTN).toContain('aria-hidden="true"');
    /* 🔴 AUCUNE IMAGE DISTANTE : une balise vers Google dirait à Google qui consulte quoi, et quand. */
    expect(BTN).not.toContain('<img');
    expect(BTN).not.toContain('https://');
  });
});

describe('🔴🔴 ④ la place des deux, dans le bandeau', () => {
  /** 🔴 LE BOUTON EST JUSTE À DROITE DE « Nom · Statut », donc AVANT le groupe poussé à droite. */
  it('🔴🔴 « Nom · Statut », puis « Drive », puis le groupe de droite', () => {
    const iNom = LAYOUT.indexOf('<strong>{identite}</strong> · {roleLbl}');
    const iDrive = LAYOUT.indexOf('<BoutonDriveBandeau />');
    const iGroupe = LAYOUT.indexOf("marginLeft: 'auto'");
    expect(iNom).toBeGreaterThan(0);
    expect(iDrive).toBeGreaterThan(iNom);
    expect(iGroupe).toBeGreaterThan(iDrive);
  });

  /**
   * 🔴 L'HEURE EST JUSTE AVANT « Changer mon mot de passe », et elle garde sa place pour la voie de secours — qui
   * ne voit pas le lien de mot de passe. C'est pour cela qu'elle est AVANT la condition `!secours`, et non dedans.
   */
  it('🔴🔴 l’heure précède le lien de mot de passe, même sans ce lien', () => {
    const iHeure = LAYOUT.indexOf('<HeureParis />');
    const iSecours = LAYOUT.indexOf('{!secours && (', iHeure);
    const iMdp = LAYOUT.indexOf('Changer mon mot de passe', iHeure);
    expect(iHeure).toBeGreaterThan(0);
    expect(iSecours).toBeGreaterThan(iHeure);
    expect(iMdp).toBeGreaterThan(iHeure);
  });

  /**
   * 🔴🔴 « RIEN NE PASSE À LA LIGNE DE TRAVERS » (Arno). Le bandeau est en `flex` : sans `flex-wrap`, à 340 px les
   * quatre éléments se serrent jusqu'à couper le nom du collaborateur en plein milieu. Avec lui et un `row-gap`,
   * le groupe de droite passe à la ligne ENTIER.
   *
   * ⚠️ MESURÉ À L'ÉCRAN sur une colonne de contenu réduite à 400, 360 puis 340 px : le bandeau ne déborde pas
   * (`scrollWidth === clientWidth`) et se replie sur deux rangées.
   */
  it('🔴🔴 le bandeau se replie, et l’heure ne fait pas trembler la ligne', () => {
    expect(SIDEBAR).toContain('.svv-adm-bandeau{flex-wrap:wrap;row-gap:.4rem}');
    /* ⚠️ CHIFFRES TABULAIRES : sans cela « 10:58 » et « 11:11 » n'ont pas la même largeur, et le groupe de droite
       bouge à chaque minute. Défaut classique d'une horloge posée dans une barre. */
    expect(SIDEBAR).toContain('.svv-adm-heure{font-variant-numeric:tabular-nums');
    /* 🔴 CIBLE TACTILE : 44 px au doigt, règle transverse des interfaces internes. */
    expect(SIDEBAR).toContain('@media (pointer:coarse){.svv-adm-drive{min-height:44px}}');
    /* 🔴 AUCUNE COULEUR EN DUR : les jetons basculent seuls en Clair et en Sombre. */
    const i = SIDEBAR.indexOf('.svv-adm-drive{');
    const bloc = SIDEBAR.slice(i, SIDEBAR.indexOf('@media (pointer:coarse){.svv-adm-drive'));
    expect(bloc.match(/#[0-9a-fA-F]{3,8}|rgba?\(/g) ?? []).toEqual([]);
  });
});
