'use client';

/* 🔴 MODULE PUR UNIQUEMENT : ce composant vit dans le navigateur (incident du 24/09/2026, garde
   `clientBoundary.guard.test.ts`). `evenementQualite` n'a aucun import, aucune base, aucun React. */
import { NIVEAUX_URGENCE, urgenceValide } from '../../../../lib/gestion/evenementQualite';

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
        {NIVEAUX_URGENCE.map((n) => (
          <button
            key={n.cle} type="button"
            className={`gurg-voie gurg-voie--${n.ton}${actuel === n.cle ? ' gurg-voie--active' : ''}`}
            /**
             * 🔴 `aria-pressed` DIT LE NIVEAU ACTUEL AUTREMENT QUE PAR LA COULEUR, et c'est la condition pour que
             * « mis en évidence » existe aussi au lecteur d'écran. Le bouton actif reste CLIQUABLE — contrairement
             * au bloc d'état voisin, qui se désactive : rechoisir son niveau actuel ne doit pas être un cul-de-sac
             * silencieux, et l'appelant n'écrit de toute façon rien quand rien ne change (`modifierEvenement`
             * filtre les champs qui ne bougent pas).
             */
            aria-pressed={actuel === n.cle}
            disabled={occupe}
            onClick={() => onUrgence(n.cle)}
          >
            {n.mot}
          </button>
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
.gurg{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:6px 0;min-width:0}
.gurg--compact{margin:6px 0 0;gap:.35rem}
.gurg-legende{font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted)}
/* ⚠️ ELLES SE REPLIENT AU LIEU DE DEBORDER : exigence transverse mobile (§15). */
.gurg-voies{display:flex;flex-wrap:wrap;gap:4px;min-width:0}
/* ⚠️ 44 px DE CIBLE TACTILE, compact ou non : c'est l'exigence transverse, pas une marge de confort. */
.gurg-voie{min-height:44px;padding:4px 12px;font:inherit;font-size:.78rem;font-weight:700;cursor:pointer;
  border-radius:999px;border:1px solid var(--color-svv-line);
  background:var(--color-svv-bg);color:var(--color-svv-muted)}
.gurg--compact .gurg-voie{padding:4px 10px;font-size:.74rem}
.gurg-voie:hover:not(:disabled){border-color:var(--color-svv-line-strong)}
.gurg-voie:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.gurg-voie:disabled{cursor:default;opacity:.6}
/* ══ LES TROIS TONS TAMISES — fond pale + texte fonce, memes familles que les capsules de role de l'Annuaire ══
   Chacun est une PAIRE DE JETONS du theme, qui porte sa variante Sombre : le selecteur suit donc les trois themes
   sans qu'une seule couleur soit ecrite ici. Les tons viennent de NIVEAUX_URGENCE, la feuille ne fait que les offrir.
   🔴 LE NIVEAU ACTUEL EST LE SEUL PEINT. Peindre les trois en permanence aurait fait trois pastilles de couleur
   cote a cote, ou plus rien ne ressort — c'est-a-dire exactement l'inverse de « le niveau actuel mis en evidence ».
   La couleur de chaque bouton se montre quand meme AU SURVOL et AU FOCUS, pour qu'on sache ou l'on va. */
.gurg-voie--active{border-color:transparent;font-weight:700}
.gurg-voie--vert.gurg-voie--active,.gurg-voie--vert:hover:not(:disabled),.gurg-voie--vert:focus-visible{
  background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.gurg-voie--orange.gurg-voie--active,.gurg-voie--orange:hover:not(:disabled),.gurg-voie--orange:focus-visible{
  background:var(--color-svv-orange-soft);color:var(--color-svv-orange)}
.gurg-voie--rouge.gurg-voie--active,.gurg-voie--rouge:hover:not(:disabled),.gurg-voie--rouge:focus-visible{
  background:var(--color-svv-red-soft);color:var(--color-svv-red-dark)}
.gurg-absent{font-size:.74rem;color:var(--color-svv-muted)}
`;
