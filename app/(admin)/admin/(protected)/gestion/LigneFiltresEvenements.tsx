'use client';

/* 🔴 MODULES PURS UNIQUEMENT : ce composant vit dans le navigateur (incident du 24/09/2026, garde
   `clientBoundary.guard.test.ts`). `ligneFiltresEvenements` n'a ni base, ni réseau, ni React. */
import {
  ETATS, MONGAS, INTERRUPTEURS, TRIS_LIGNE, compteDe, ligneParDefaut,
  type EtatLigne,
} from '../../../../lib/gestion/ligneFiltresEvenements';
import { cleFiltreType } from '../../../../lib/gestion/tableauBordEvenements';
import { TYPES_EVENEMENT } from '../../../../lib/gestion/evenementQualite';

/**
 * ══ 🔴🔴 LOT …-ET-LIGNE-DE-FILTRES, POINT 3 — LA LIGNE DE FILTRES ET DE TRIS ════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ARNO (09/10/2026) : « Placée SOUS le tableau de bord et AU-DESSUS des capsules, distincte du tableau de bord.
 * Elle REPREND la clé d'URL &evf= déjà posée par le tableau de bord […] et remplace le bandeau provisoire
 * “filtre actif ✕” par l'état visible des boutons. […] Format de bouton commun .gpil (32 px visibles). »
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ══ 🔴🔴 CE QUE CETTE LIGNE NE FAIT PAS : COMPTER ═══════════════════════════════════════════════════════════════
 *
 * Chaque bouton porte le nombre que LE TABLEAU DE BORD a compté, et applique l'ensemble d'identifiants que ce
 * même tableau de bord a rendu. Trois conséquences, et ce sont elles qui rendent la ligne fiable :
 *   ① le compteur d'un bouton est la TAILLE de ce qu'il affiche — ils ne peuvent pas se contredire ;
 *   ② un clic sur un chiffre du tableau de bord allume le bouton correspondant, parce que c'est la MÊME clé ;
 *   ③ la règle de chaque filtre est écrite une fois, en SQL, dans `tableauBordRepo`.
 *
 * ⚠️ « New » ET « Urgent » SONT RENDUS PAR L'APPELANT, en tête de la ligne : ce sont les deux tris existants
 * (`&tri=`), qu'Arno garde « comportement actuel ». Les réécrire ici en aurait fait une seconde version.
 *
 * ⚠️ AUCUNE ÉCRITURE : ce composant ne connaît ni `fetch`, ni route, ni base. Il remonte des clés.
 */
export function LigneFiltresEvenements({ etat, ids, onBasculer, onTri, onReinitialiser, boutonsNewUrgent }: {
  etat: EtatLigne;
  /** Les ensembles du tableau de bord. `null` = pas encore lus : les boutons s'affichent alors sans nombre. */
  ids: Record<string, number[]> | null;
  onBasculer: (cle: string) => void;
  onTri: (cle: string) => void;
  onReinitialiser: () => void;
  /** Les deux boutons de tri existants (« New », « Urgent »), rendus par l'appelant et posés en tête. */
  boutonsNewUrgent: React.ReactNode;
}) {
  const bouton = (cle: string, mot: string, actif: boolean) => {
    const n = compteDe(cle, ids);
    return (
      <button key={cle} type="button" className={`gpil${actif ? ' gpil--actif' : ''}`}
        aria-pressed={actif}
        title={actif ? 'Retirer ce filtre' : `N’afficher que ces événements${n === null ? '' : ` (${n})`}`}
        onClick={() => onBasculer(cle)}>
        {mot}
        {/* 🔴 LE COMPTEUR EST SUR LE BOUTON (Arno), et il manque plutôt que de mentir : `null` = les ensembles
            ne sont pas encore arrivés, et un « 0 » se lirait « il n'y en a aucun ». */}
        {n !== null && <span className="lfe-n">{n}</span>}
      </button>
    );
  };

  /**
   * ══ 🔴🔴 LOT FILTRES-FAMILLES-ET-BOUTONS-ROUGES, POINT 1 — UNE FAMILLE EST UN GROUPE ENCADRÉ ═══════════════
   *
   * ARNO : « Chaque famille devient un GROUPE ENCADRÉ : un cadre léger (fond très légèrement teinté + bordure
   * fine, coins 8 px) qui contient son étiquette en petites capitales et ses boutons ; espacement net entre
   * deux groupes. […] Un groupe ne se coupe jamais en deux sur deux lignes. »
   *
   * 🔴 LE CADRE FAIT LE TRAVAIL QUE LE FILET NE FAISAIT PAS. Un trait vertical entre deux groupes disparaît
   * dès que la ligne se replie : à la deuxième ligne, il ne sépare plus rien, et les familles se confondent.
   * Un cadre, lui, accompagne son groupe où qu'il aille — c'est ce qui rend la règle « un groupe ne se coupe
   * jamais » tenable par construction plutôt que par surveillance.
   *
   * ⚠️ L'ÉTIQUETTE EST DANS LE CADRE, et « TYPE » en gagne une (elle manquait) : une famille sans nom oblige
   * à deviner ce que ses boutons ont en commun.
   */
  const famille = (nom: string, contenu: React.ReactNode, deplus = '') => (
    <div className={`lfe-fam${deplus}`} role="group" aria-label={nom}>
      <span className="lfe-mot">{nom}</span>
      <span className="lfe-boutons">{contenu}</span>
    </div>
  );

  return (
    <div className="lfe" role="group" aria-label="Filtrer et trier les événements">
      <style>{CSS_LIGNE_FILTRES}</style>

      {/* ① ET ② — LES DEUX TRIS EXISTANTS, EN TÊTE, INCHANGÉS. Arno les nomme « PRIORITÉ ». */}
      {famille('Priorité', boutonsNewUrgent)}

      {/* ⑥ L'ÉTAT — trois choix exclusifs, « En cours » allumé par défaut (et il se VOIT, voir le module pur). */}
      {famille('État', ETATS.map((e) => bouton(e.cle, e.mot, etat.etat === e.cle)))}

      {/* ③ LE TYPE — choix multiples, en union. Les quatre types de la base, dans leur ordre. */}
      {famille('Type',
        TYPES_EVENEMENT.map((t) => bouton(cleFiltreType(t.cle), t.mot, etat.types.includes(cleFiltreType(t.cle)))))}

      {/* ④ MONGA — trois choix exclusifs. */}
      {famille('Monga', MONGAS.map((m) => bouton(m.cle, m.mot, etat.monga === m.cle)))}

      {/* ⑤ ⑦ ⑧ LES INTERRUPTEURS — indépendants, combinables. */}
      {famille('À surveiller',
        INTERRUPTEURS.map((i) => bouton(i.cle, i.mot, etat.interrupteurs.includes(i.cle))))}

      {/**
        * ⑨ ⑩ ⑪ LES TRIS — un seul actif, la flèche dit le sens, recliquer l'inverse.
        * 🔴 « TRIER » EST VISUELLEMENT À PART (Arno) : `lfe-fam--tris` le pousse à droite et lui donne un fond
        * neutre. Ce n'est pas un filtre — il ne cache rien —, et le confondre avec les familles de gauche
        * ferait craindre qu'il masque des cartes.
        */}
      {famille('Trier', TRIS_LIGNE.map((t) => {
        const actif = etat.tri === t.cle;
        return (
          <button key={t.cle} type="button" className={`gpil${actif ? ' gpil--actif' : ''}`}
            aria-pressed={actif}
            title={actif
              ? `Inverser l’ordre (${etat.sens === 'desc' ? 'décroissant' : 'croissant'})`
              : `Trier par ${t.mot.toLowerCase()}`}
            onClick={() => onTri(t.cle)}>
            {t.mot}
            {/* 🔴 LA FLÈCHE N'EST RENDUE QUE SUR LE TRI ACTIF : trois flèches côte à côte feraient croire à
                trois tris simultanés, alors qu'« un seul actif à la fois » est la règle. */}
            {actif && <span className="lfe-fleche" aria-hidden="true">{etat.sens === 'desc' ? '↓' : '↑'}</span>}
          </button>
        );
      }), ' lfe-fam--tris')}

      {/**
        * ⚠️ « RÉINITIALISER » N'APPARAÎT QUE S'IL Y A QUELQUE CHOSE À DÉFAIRE (Arno : « quand un filtre ou tri
        * n'est pas par défaut »). Un bouton toujours présent et sans effet apprend à ne plus le regarder — et
        * c'est précisément celui dont on a besoin le jour où l'on ne comprend plus ce que l'écran montre.
        */}
      {!ligneParDefaut(etat) && (
        <button type="button" className="gpil lfe-reinit" onClick={onReinitialiser}
          title="Revenir aux filtres et au tri par défaut">
          Réinitialiser
        </button>
      )}
    </div>
  );
}

/**
 * LA FEUILLE. Le format des boutons est `.gpil`, injecté par `GestionVue` — on ne le redéclare PAS ici (lot
 * HARMONIE-BOUTONS-ET-TROMBONE : une seule déclaration dans tout le dépôt).
 *
 * ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit DANS un litteral de gabarit (piege TS1005 du depot).
 */
const CSS_LIGNE_FILTRES = `
/* ⚠️ ELLE SE REPLIE, ELLE NE DEBORDE PAS : exigence transverse §15. Pas de defilement horizontal — sur un
   telephone, les familles passent les unes sous les autres, dans leur ordre.
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit DANS un litteral de gabarit (piege TS1005 du depot). */
.lfe{display:flex;flex-wrap:wrap;align-items:flex-start;gap:10px;margin:0 0 12px}
/* ══ 🔴🔴 UNE FAMILLE EST UN CADRE, ET LE CADRE NE SE COUPE JAMAIS ═════════════════════════════════════════
   Fond tres legerement teinte, bordure fine, coins 8 px : assez pour se voir, pas assez pour crier.
   🔴 C'EST LA BOITE QUI SE REPLIE, PAS SES BOUTONS : la famille est un element de la rangee exterieure, donc
   elle passe A LA LIGNE D'UN BLOC. Avant ce lot, les boutons etaient des freres directs de la rangee et
   pouvaient se separer au milieu d'un groupe — c'est exactement le defaut qu'Arno decrit.
   ⚠️ LES BOUTONS, EUX, PEUVENT SE REPLIER A L'INTERIEUR du cadre : sur un telephone, une famille de quatre
   boutons ne tient pas sur une ligne, et l'interdire la ferait deborder de l'ecran. */
.lfe-fam{display:flex;flex-wrap:wrap;align-items:center;gap:8px 6px;min-width:0;
  padding:6px 10px 7px;border:1px solid var(--color-svv-line);border-radius:8px;
  background:var(--color-svv-field)}
.lfe-boutons{display:inline-flex;flex-wrap:wrap;align-items:center;gap:12px 4px;min-width:0}
/* 🔴 « TRIER » EST A PART (Arno) : pousse a droite, et sur un fond neutre — ce n'est pas un filtre, il ne
   cache aucune carte, et le confondre avec les familles de gauche ferait craindre qu'il en masque. */
.lfe-fam--tris{margin-left:auto;background:var(--color-svv-surface);
  border-color:var(--color-svv-line-strong)}
.lfe-mot{font-size:.68rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:var(--color-svv-muted);white-space:nowrap}
/* LE COMPTEUR SUR LE BOUTON : plus petit que le mot, et il herite de la couleur de l'etat actif. */
.lfe-n{margin-left:.35rem;font-size:.72rem;font-weight:700;opacity:.75}
.lfe-fleche{margin-left:.25rem;font-weight:700}
/* ⚠️ « Reinitialiser » RESTE UN BOUTON NU, hors famille : il n'appartient a aucune, et l'encadrer en ferait
   une famille d'un seul element. Il se cale en bas de la rangee, a cote du cadre « TRIER ». */
.lfe-reinit{align-self:center}
`;
