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

  return (
    <div className="lfe" role="group" aria-label="Filtrer et trier les événements">
      <style>{CSS_LIGNE_FILTRES}</style>

      {/* ① ET ② — LES DEUX TRIS EXISTANTS, EN TÊTE, INCHANGÉS. */}
      <span className="lfe-groupe lfe-groupe--new">{boutonsNewUrgent}</span>

      {/* ⑥ L'ÉTAT — trois choix exclusifs, « En cours » allumé par défaut (et il se VOIT, voir le module pur). */}
      <span className="lfe-groupe" role="group" aria-label="État">
        {/* ⚠️ LE GROUPE EST NOMMÉ À L'ÉCRAN, et pas seulement pour le lecteur d'écran : « Tous » existe DEUX
            fois sur cette ligne (l'état et Monga), et vu à l'écran, deux boutons sombres portant le même mot
            ne disent pas à quoi ils répondent. Le mot du groupe lève l'ambiguïté en trois caractères. */}
        <span className="lfe-mot">État</span>
        {ETATS.map((e) => bouton(e.cle, e.mot, etat.etat === e.cle))}
      </span>

      {/* ③ LE TYPE — choix multiples, en union. Les quatre types de la base, dans leur ordre. */}
      <span className="lfe-groupe" role="group" aria-label="Type">
        {TYPES_EVENEMENT.map((t) => bouton(cleFiltreType(t.cle), t.mot, etat.types.includes(cleFiltreType(t.cle))))}
      </span>

      {/* ④ MONGA — trois choix exclusifs. */}
      <span className="lfe-groupe" role="group" aria-label="Monga">
        <span className="lfe-mot">Monga</span>
        {MONGAS.map((m) => bouton(m.cle, m.mot, etat.monga === m.cle))}
      </span>

      {/* ⑤ ⑦ ⑧ LES INTERRUPTEURS — indépendants, combinables. */}
      <span className="lfe-groupe" role="group" aria-label="Points d’attention">
        {INTERRUPTEURS.map((i) => bouton(i.cle, i.mot, etat.interrupteurs.includes(i.cle)))}
      </span>

      {/* ⑨ ⑩ ⑪ LES TRIS — un seul actif, la flèche dit le sens, recliquer l'inverse. */}
      <span className="lfe-groupe lfe-groupe--tris" role="group" aria-label="Trier">
        <span className="lfe-mot">Trier</span>
        {TRIS_LIGNE.map((t) => {
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
        })}
      </span>

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
   telephone, les groupes passent les uns sous les autres, dans leur ordre. */
.lfe{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;margin:0 0 12px;padding:8px 10px;
  border:1px solid var(--color-svv-line);border-radius:12px;background:var(--color-svv-surface)}
/* Chaque groupe reste SOLIDAIRE : ses boutons se replient ensemble, jamais coupes au milieu. */
.lfe-groupe{display:inline-flex;flex-wrap:wrap;align-items:center;gap:12px 4px;min-width:0}
/* ⚠️ UN FILET ENTRE LES GROUPES, et non une marge plus grande : a la deuxieme ligne, une marge ne separe plus
   rien, tandis que le filet suit chaque groupe. Il disparait sur le premier, qui n'a rien a sa gauche. */
.lfe-groupe + .lfe-groupe{padding-left:14px;border-left:1px solid var(--color-svv-line)}
.lfe-mot{font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted);margin-right:.2rem}
/* LE COMPTEUR SUR LE BOUTON : plus petit que le mot, et il herite de la couleur de l'etat actif. */
.lfe-n{margin-left:.35rem;font-size:.72rem;font-weight:700;opacity:.75}
.lfe-fleche{margin-left:.25rem;font-weight:700}
.lfe-reinit{margin-left:auto}
`;
