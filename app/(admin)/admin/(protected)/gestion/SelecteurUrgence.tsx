'use client';

/* 🔴 MODULE PUR UNIQUEMENT : ce composant vit dans le navigateur (incident du 24/09/2026, garde
   `clientBoundary.guard.test.ts`). `evenementQualite` n'a aucun import, aucune base, aucun React. */
import { NIVEAUX_URGENCE, urgenceValide } from '../../../../lib/gestion/evenementQualite';
/**
 * 🔴🔴 LOT HARMONIE-BOUTONS-ET-TROMBONE, POINT 2b — le format de pilule des filtres de la boîte, partagé.
 * ⚠️ LA FEUILLE VOYAGE AVEC CE COMPOSANT, comme la sienne : il est rendu dans `CarteVive` (feuille dans
 * `GestionVue`) ET dans le bloc « Événements » de la fiche du bien (feuille dans `EvenementsDuBien`). Il ne
 * peut donc dépendre d'aucune des deux — il injecte `CSS_BOUTON_PILULE` dans la sienne.
 */
import { BoutonPilule, CSS_BOUTON_PILULE } from './BoutonPilule';

/**
 * ══ 🔴🔴 LOT URGENCE-EVENEMENT, POINT 3 — CHANGER L'URGENCE EN COURS DE VIE ══════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (08/10/2026), mot pour mot :
 *   a. « Dans la carte d'événement DÉPLIÉE (un clic) : un sélecteur à trois boutons Normal / Intermédiaire /
 *      Urgent, chacun dans sa couleur, le niveau actuel mis en évidence. Le choix est enregistré tout de suite, et
 *      la couleur de la capsule change sans recharger. »
 *   b. « Dans la fiche du bien quand un événement est en cours : le même sélecteur, AU MÊME COMPOSANT, près de
 *      l'en-tête de l'événement. »
 *
 * ═══ 🔴🔴 « AU MÊME COMPOSANT » EST LA RAISON D'ÊTRE DE CE FICHIER ════════════════════════════════════════════════
 *
 * Il aurait été plus court d'écrire les trois boutons dans `CarteVive` et de les recopier dans `EvenementsDuBien`.
 * C'est exactement ce que le module a déjà payé deux fois : le « Modifier » de l'événement a fini PARTAGÉ
 * (`FormulaireCarte`, importé et non recopié) après avoir divergé, et la frise aussi. Une copie finit toujours par
 * proposer trois niveaux d'un côté et quatre de l'autre, ou par écrire par une porte que l'autre ignore.
 *
 * ═══ 🔴 IL N'ÉCRIT RIEN ET NE LIT RIEN ═══════════════════════════════════════════════════════════════════════════
 *
 * Il rend trois boutons et remonte le niveau choisi. C'est l'APPELANT qui écrit, par la route qu'il employait déjà
 * (`PATCH /api/admin/gestion/evenements/[id]`) — la carte par son `agir`, la fiche du bien par son `ecrire`. Même
 * garde serveur (`modifierEvenement`), même journal, même réversibilité. Aucune porte d'écriture neuve.
 *
 * ═══ 🔴 SA FEUILLE VOYAGE AVEC LUI, ET IL LE FAUT ════════════════════════════════════════════════════════════════
 *
 * La feuille de `CarteVive` vit dans `GestionVue` ; celle du bloc « Événements » dans `EvenementsDuBien`. Un
 * composant rendu dans les DEUX ne peut donc dépendre d'aucune des deux : il porte la sienne, comme
 * `FriseAvancement` — qui est dans le même cas, et qui a tranché pareil.
 *
 * ⚠️ PRÉFIXE `gurg-` ET NON `gst-` : deux composants ne partagent JAMAIS un préfixe de classe (leçon du lot
 * FRISES-REPARATION — il n'y a pas de portée en CSS).
 *
 * ⚠️ LE MOT EST TOUJOURS ÉCRIT DANS LE BOUTON, la couleur ne fait que l'appuyer. Règle de tout le module : jamais
 * une couleur seule pour porter une information.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function SelecteurUrgence({ urgence, occupe, onUrgence, compact = false }: {
  /** Le niveau enregistré, ou `null`/inconnu = aucun. Aucun bouton n'est alors mis en évidence. */
  urgence: string | null | undefined;
  /** Une écriture est en cours : les trois boutons sont désactivés, comme partout ailleurs dans le module. */
  occupe: boolean;
  /** Le niveau choisi. L'appelant écrit — ce composant ne touche jamais au réseau. */
  onUrgence: (cle: string) => void;
  /**
   * 🔴 LA FICHE DU BIEN EST PLUS SERRÉE que la vue de l'événement : le bloc « Événements » y vit dans une colonne,
   * sous l'en-tête. `compact` réduit le pas, jamais la cible tactile — les 44 px de l'exigence transverse §15 sont
   * tenus dans les deux cas.
   */
  compact?: boolean;
}) {
  const actuel = urgenceValide(urgence);
  return (
    <div className={`gurg${compact ? ' gurg--compact' : ''}`}>
      <style>{CSS_SELECTEUR_URGENCE}</style>
      {/* ⚠️ `aria-label` ET NON `aria-labelledby` : plusieurs cartes se dessinent dans la même liste, et un `id`
          recopié autant de fois serait un `id` en double — du HTML invalide, et un lecteur d'écran qui annonce la
          légende du premier sélecteur sur tous les autres. */}
      <span className="gurg-legende" aria-hidden="true">Urgence</span>
      <div className="gurg-voies" role="group" aria-label="Urgence de l’événement">
        {/**
          * ══ 🔴🔴 LOT HARMONIE-BOUTONS-ET-TROMBONE, POINT 2b — LE FORMAT DE « TOUS », L'EXCEPTION EN PLUS ═════
          *
          * ARNO : « boutons “Normal”, “Intermédiaire”, “Urgent” → même forme, hauteur, bordure, police et taille
          * que “Tous”. EXCEPTION volontaire : le bouton ACTIF garde sa couleur de sens (Normal = vert,
          * Intermédiaire = orange, Urgent = rouge — mêmes teintes que sur les cartes d'événement), en fond plein
          * avec texte blanc ; les inactifs sont blancs à bordure grise comme “À classer”. »
          *
          * 🔴 LA PILULE PORTE TOUT, SAUF LA COULEUR DE L'ACTIF : forme, hauteur, marges, bordure, police, taille,
          * graisse, inactif, survol, focus et désactivé viennent de `BoutonPilule`. Ce fichier n'ajoute que
          * `gurg-voie--<ton>`, qui ne peint QUE `.gpil--actif`. C'est la seule façon d'avoir une exception sans
          * rouvrir une seconde définition du bouton — celle qui diverge.
          *
          * 🔴 `aria-pressed` DIT LE NIVEAU ACTUEL AUTREMENT QUE PAR LA COULEUR, et c'est la condition pour que
          * « mis en évidence » existe aussi au lecteur d'écran. Il est porté par la pilule, pour les trois
          * groupes à la fois. Le bouton actif reste CLIQUABLE — rechoisir son niveau actuel ne doit pas être un
          * cul-de-sac silencieux, et l'appelant n'écrit rien quand rien ne change (`modifierEvenement` filtre les
          * champs qui ne bougent pas).
          *
          * ⚠️ AUCUNE ÉCRITURE NOUVELLE : c'est toujours `onUrgence` qui remonte, et l'appelant qui écrit.
          */}
        {NIVEAUX_URGENCE.map((n) => (
          <BoutonPilule
            key={n.cle} mot={n.mot}
            classeDeTon={`gurg-voie gurg-voie--${n.ton}`}
            actif={actuel === n.cle}
            occupe={occupe}
            onClick={() => onUrgence(n.cle)}
          />
        ))}
      </div>
      {/* ⚠️ L'ABSENCE EST DITE, et ce n'est pas du bruit : sans ce mot, trois boutons éteints se lisent comme un
          chargement en cours. Arno : « Événement sans niveau d'urgence enregistré : capsule grise neutre » — la
          capsule le montre, cette ligne l'explique à l'endroit où l'on peut y remédier. */}
      {actuel === null && <span className="gurg-absent">Aucun niveau enregistré</span>}
    </div>
  );
}

/* ⚠️ JETONS `--color-svv-*` UNIQUEMENT, et aucun accent grave : cette feuille vit dans un litteral gabarit. */
const CSS_SELECTEUR_URGENCE = `
${CSS_BOUTON_PILULE}
.gurg{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:6px 0;min-width:0}
.gurg--compact{margin:6px 0 0;gap:.35rem}
.gurg-legende{font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted)}
/* ⚠️ ELLES SE REPLIENT AU LIEU DE DEBORDER : exigence transverse mobile (§15). */
.gurg-voies{display:flex;flex-wrap:wrap;gap:4px;min-width:0}
/* ══ 🔴🔴 LOT HARMONIE-BOUTONS-ET-TROMBONE, POINT 2b — LE DESSIN VIENT DE .gpil, LA COULEUR RESTE ICI ═════════
   CE QUI ETAIT ECRIT ICI, ET QUI A DEMENAGE DANS BoutonPilule : .gurg-voie (44 px, 0.78rem, GRAS, texte
   estompe sur fond de page), son survol, son focus, son etat desactive, et la reduction de taille du mode
   compact (padding:4px 10px;font-size:.74rem). Arno demande « meme forme, hauteur, bordure, police et taille
   que “Tous” » : une taille reduite dans la fiche du bien aurait justement refait diverger le groupe.
   ⚠️ LE MODE COMPACT N'EST PAS SUPPRIME — il resserre toujours la rangee (.gurg--compact ci-dessus). Ce sont
   les BOUTONS qui cessent de retrecir, pas le bloc. La cible tactile de 44 px est tenue par .gpil.
   ══ CE QUI RESTE : LES TROIS TONS, ET SEULEMENT EUX ══════════════════════════════════════════════════════════
   ARNO : « le bouton ACTIF garde sa couleur de sens […] en fond plein avec texte blanc ; les inactifs sont
   blancs a bordure grise comme “A classer” ». Deux consequences, et chacune est voulue :
   🔴 LE FOND PLEIN REPREND LA TEINTE QUE LA CAPSULE DE LA CARTE EMPLOIE POUR SON TEXTE (green-ink, orange,
   red-dark — exactement les trois jetons de .gst-type-capsule--urg-*). La paire est INVERSEE, pas changee :
   la carte ecrit en vert sur vert pale, le bouton actif ecrit en blanc sur ce meme vert. Meme famille, meme
   lecture, et les cartes ne bougent pas d'un pixel.
   🔴 « TEXTE BLANC » S'ECRIT --color-svv-surface, JAMAIS un blanc en dur : en theme Sombre les trois jetons de
   teinte deviennent CLAIRS, et un blanc fige y serait illisible. Le jeton, lui, devient sombre en meme temps —
   c'est la meme ruse que .gpil--actif, et c'est pour cela qu'elle est reprise mot pour mot.
   ⚠️ LES INACTIFS NE SONT PLUS TEINTES AU SURVOL : ils prennent le survol de la pilule, comme « A classer ». La
   couleur de sens ne se montre donc plus qu'une fois le niveau choisi — c'est le prix du format commun, et il
   est dit ici pour qu'on sache qu'il a ete paye sciemment.
   ⚠️ LE MOT RESTE ECRIT DANS LE BOUTON : la couleur ne porte jamais seule l'information.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral de gabarit. */
.gurg-voie.gpil--actif{border-color:transparent;color:var(--color-svv-surface)}
.gurg-voie--vert.gpil--actif{background:var(--color-svv-green-ink)}
.gurg-voie--orange.gpil--actif{background:var(--color-svv-orange)}
.gurg-voie--rouge.gpil--actif{background:var(--color-svv-red-dark)}
.gurg-absent{font-size:.74rem;color:var(--color-svv-muted)}
`;
