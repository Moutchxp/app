'use client';

import { useEffect, useState } from 'react';
/* 🔴 MODULES PURS UNIQUEMENT : ce composant vit dans le navigateur (incident du 24/09/2026, garde
   `clientBoundary.guard.test.ts`). `tableauBordEvenements` n'a ni base, ni réseau, ni React ; `frise` non plus. */
import {
  estTableauBord, ligneDeSynthese, motJours, MOT_SANS_DONNEES, SEUIL_SANS_NOUVELLES_JOURS,
  cleFiltreType, cleFiltreUrgence,
  type Delai, type Delais, type TableauBordEvenements as Donnees,
} from '../../../../lib/gestion/tableauBordEvenements';
import { motMontant } from '../../../../lib/gestion/frise';

/**
 * ══ 🔴🔴 LOT EVENEMENTS-TABLEAU-DE-BORD — LE PORTEFEUILLE EN CHIFFRES, EN HAUT DE L'ÉCRAN ═══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (09/10/2026) : « Un TABLEAU DE BORD du portefeuille d'événements […] : il se place TOUT EN HAUT
 * de l'écran, AU-DESSUS de la ligne de filtres, séparé visuellement. REPLIÉ (par défaut) : UNE seule ligne de
 * synthèse […]. DÉPLIÉ — indicateurs, chacun avec son effectif (n = …). »
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ══ 🔴🔴 CE QU'IL FAUT SAVOIR AVANT DE LIRE : LA « LIGNE DE FILTRES » N'EXISTE PAS ═════════════════════════════
 *
 * Arno situe ce tableau de bord « AU-DESSUS de la ligne de filtres (lot précédent) » et demande que chaque
 * chiffre « applique le filtre correspondant de la ligne de filtres ». CETTE LIGNE DE FILTRES N'EXISTE PAS dans
 * ce dépôt — vérifié : l'écran des événements ne porte que les deux boutons de TRI (« New » / « Urgent »), et le
 * commentaire de `GestionVue` l'écrit noir sur blanc (« La colonne des cartes n'a JAMAIS eu de recherche ni de
 * filtre […] — on n'en invente donc pas »). Aucun lot du journal n'en a posé.
 *
 * 🔴 CE QUE J'AI FAIT, PLUTÔT QUE DE LAISSER DES CHIFFRES QUI NE MÈNENT NULLE PART : les chiffres cliquables
 * posent le filtre dans l'ADRESSE (`&evf=`), la liste des cartes s'y restreint, et un bandeau nommé, juste
 * au-dessus d'elle, dit lequel est actif et le retire d'un clic. C'est le MINIMUM pour que « clic → filtre
 * appliqué » veuille dire quelque chose. Le jour où la ligne de filtres existera, elle lira la même clé — c'est
 * déjà ce que fait le bandeau.
 *
 * ══ 🔴 LE CHIFFRE ET SA LISTE NE PEUVENT PAS DIVERGER ═══════════════════════════════════════════════════════════
 *
 * Chaque chiffre cliquable affiche la TAILLE de l'ensemble que le serveur a retenu, et le clic ouvre CE MÊME
 * ensemble (`idsParFiltre`). Deux calculs auraient fini par différer d'un, et c'est le tableau de bord qu'on
 * aurait cru faux.
 *
 * ⚠️ IL NE SAIT QUE LIRE : une seule route, en GET, et aucun geste d'écriture nulle part dans ce fichier.
 */
/**
 * 🔴 UN CHIFFRE CLIQUABLE : il porte son nombre, son mot, et il BASCULE — recliquer le même retire le filtre.
 * Un filtre qui ne sait qu'entrer est un piège, c'est la leçon du lot FILTRE-NON-LUS-BLOQUANT.
 *
 * ⚠️ DÉCLARÉ AU NIVEAU DU MODULE, et non dans le rendu : un composant créé pendant le rendu est recréé à
 * chaque passe et perd son état. La règle du compilateur React l'interdit, et elle a raison.
 */
function Chiffre({ cle, mot, n, actif, onFiltre }: {
  cle: string; mot: string; n: number; actif: boolean; onFiltre: (cle: string | null) => void;
}) {
  return (
    <button type="button" className={`tbe-chiffre${actif ? ' tbe-chiffre--actif' : ''}`}
      aria-pressed={actif}
      title={actif ? 'Retirer ce filtre' : `N’afficher que ces événements (${n})`}
      onClick={() => onFiltre(actif ? null : cle)}>
      <span className="tbe-n">{n}</span>
      <span className="tbe-mot">{mot}</span>
    </button>
  );
}

/** Un délai : moyenne ET médiane, avec son effectif. Le tiret parlant quand il n'y a rien à dire. */
function LigneDelai({ mot, delai }: { mot: string; delai: Delai }) {
  return (
    <tr>
      <th scope="row">{mot}</th>
      <td>{delai.n === 0 ? MOT_SANS_DONNEES : motJours(delai.moyenneJours)}</td>
      <td>{delai.n === 0 ? '' : motJours(delai.medianeJours)}</td>
      {/* 🔴🔴 L'EFFECTIF, TOUJOURS : « pour qu'un chiffre bâti sur 2 événements ne passe pas pour une tendance »
          (Arno). Il est dans la même rangée que la moyenne, pas en note de bas de tableau. */}
      <td className="tbe-n-petit">n&nbsp;=&nbsp;{delai.n}</td>
    </tr>
  );
}

function TableDelais({ titre, delais }: { titre: string; delais: Delais }) {
  return (
    <table className="tbe-table">
      <caption>{titre}</caption>
      <thead>
        <tr><th scope="col">Depuis l’ouverture</th><th scope="col">Moyenne</th><th scope="col">Médiane</th>
          <th scope="col">Effectif</th></tr>
      </thead>
      <tbody>
        <LigneDelai mot="→ 1er devis" delai={delais.premierDevis} />
        <LigneDelai mot="→ acceptation du devis" delai={delais.acceptation} />
        <LigneDelai mot="→ intervention" delai={delais.intervention} />
        <LigneDelai mot="→ clôture" delai={delais.cloture} />
      </tbody>
    </table>
  );
}

export function TableauBordEvenements({ ouvert, onOuvrir, filtre, onFiltre, onDonnees }: {
  /** Déplié ? L'état vit dans l'adresse (`&tb=1`), pas ici : un rechargement le conserve. */
  ouvert: boolean;
  onOuvrir: (v: boolean) => void;
  /** La clé de filtre active, ou `null`. */
  filtre: string | null;
  /** Poser (ou retirer, avec `null`) le filtre d'un chiffre. */
  onFiltre: (cle: string | null) => void;
  /**
   * 🔴 LES ENSEMBLES REMONTENT À L'ÉCRAN, qui filtre la liste des cartes. Ils ne redescendent pas : c'est le
   * MÊME objet que celui dont les chiffres affichent la taille, donc la liste et le chiffre s'accordent par
   * construction. Et c'est pour cela que ce composant se monte et LIT même replié — sans quoi, un rechargement
   * sur `&evf=…` n'aurait aucun ensemble à appliquer.
   */
  onDonnees?: (d: Donnees) => void;
}) {
  const [etat, setEtat] = useState<{ v: 'charge' } | { v: 'ok'; d: Donnees } | { v: 'erreur'; m: string }>(
    { v: 'charge' });

  /**
   * ⚠️ UNE SEULE LECTURE, AU MONTAGE, ET PAS DE RAFRAÎCHISSEMENT AUTOMATIQUE. Un tableau de bord qui se relit
   * toutes les 30 secondes ferait danser des chiffres qu'on est en train de lire, et la route parcourt tous les
   * événements. Il se relit en rechargeant l'écran — ce qui est aussi ce qu'on fait après avoir agi.
   */
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/gestion/evenements/tableau-bord', { cache: 'no-store' });
        if (annule) return;
        if (!res.ok) { setEtat({ v: 'erreur', m: 'Tableau de bord indisponible.' }); return; }
        const brut: unknown = await res.json();
        /* 🔴 ON VÉRIFIE LA FORME AVANT DE LA LIRE : sans cela, une réponse inattendue fait tomber la PAGE
           ENTIÈRE pour un panneau de chiffres. Voir l'encadré de `estTableauBord`. */
        if (!estTableauBord(brut)) { setEtat({ v: 'erreur', m: 'Tableau de bord indisponible.' }); return; }
        setEtat({ v: 'ok', d: brut });
        onDonnees?.(brut);
      } catch {
        if (!annule) setEtat({ v: 'erreur', m: 'Tableau de bord indisponible.' });
      }
    })();
    return () => { annule = true; };
    /* ⚠️ `onDonnees` N'EST PAS DANS LES DÉPENDANCES, ET C'EST VOULU : le parent la recrée à chaque rendu, et
       l'y mettre relirait la route en boucle. On lit UNE fois, au montage — voir l'encadré ci-dessus. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const d = etat.v === 'ok' ? etat.d : null;

  /**
   * ⚠️ UNE FONCTION QUI REND DU BALISAGE, ET NON UN COMPOSANT DÉCLARÉ ICI : un composant créé pendant le
   * rendu perd son état à chaque passe, et la règle du compilateur React l'interdit (elle a rougi sur la
   * première écriture de ce fichier). `Chiffre` vit donc hors du composant, et cette fonction ne fait que
   * lui passer ce que seul cet écran connaît — l'état actif et le geste.
   */
  const chiffre = (cle: string, mot: string, n: number) => (
    <Chiffre key={cle} cle={cle} mot={mot} n={n} actif={filtre === cle} onFiltre={onFiltre} />
  );

  return (
    <section className="tbe" aria-labelledby="tbe-titre">
      <style>{CSS_TABLEAU_BORD}</style>
      {/**
        * 🔴 LA LIGNE REPLIÉE EST ELLE-MÊME LE BOUTON (Arno : « Clic sur la ligne ou ▾ »). Un seul bouton plutôt
        * qu'une ligne plus un chevron : deux cibles pour un geste, c'est une de trop, et le chevron seul ferait
        * une cible de 20 px dans une ligne de 400.
        */}
      <button type="button" className="tbe-ligne" aria-expanded={ouvert}
        onClick={() => onOuvrir(!ouvert)}>
        <span className="tbe-titre" id="tbe-titre">Tableau de bord</span>
        <span className="tbe-synthese">
          {etat.v === 'charge' ? 'Lecture des chiffres…'
            : etat.v === 'erreur' ? etat.m
              : ligneDeSynthese(etat.d)}
        </span>
        <span className="tbe-chevron" aria-hidden="true">{ouvert ? '▴' : '▾'}</span>
      </button>

      {ouvert && d !== null && (
        <div className="tbe-corps">
          {/* ══ a) VOLUMES ══════════════════════════════════════════════════════════════════════════════════ */}
          <section className="tbe-bloc" aria-labelledby="tbe-volumes">
            <h3 id="tbe-volumes">Volumes <span className="tbe-n-petit">n&nbsp;=&nbsp;{d.volumes.total}</span></h3>
            <div className="tbe-chiffres">
              {chiffre('encours', 'en cours', d.volumes.enCours)}
              {chiffre('clos', 'clôturés', d.volumes.clos)}
              {chiffre('tous', 'au total', d.volumes.total)}
            </div>
            <h4>Par type</h4>
            <div className="tbe-chiffres">
              {d.volumes.parType.map((t) => (
                chiffre(cleFiltreType(t.cle), t.mot, t.n)
              ))}
            </div>
            <h4>Par urgence</h4>
            {/* 🔴 LES TROIS TONS DE L'URGENCE, LES MÊMES QUE LES CAPSULES DES CARTES : le vert, l'orange et le
                rouge d'un bouton d'urgence actif. La couleur appuie le mot, qui reste écrit. */}
            <div className="tbe-chiffres tbe-chiffres--urgence">
              {d.volumes.parUrgence.map((u) => (
                <span key={u.cle} className={`tbe-ton tbe-ton--${u.cle}`}>
                  {chiffre(cleFiltreUrgence(u.cle), u.mot, u.n)}
                </span>
              ))}
            </div>
            <h4>Monga</h4>
            <div className="tbe-chiffres">
              {chiffre('monga', 'avec Monga', d.volumes.avecMonga)}
              {chiffre('sans-monga', 'sans Monga', d.volumes.sansMonga)}
            </div>
          </section>

          {/* ══ b) FLUX ════════════════════════════════════════════════════════════════════════════════════ */}
          <section className="tbe-bloc tbe-bloc--flux" aria-labelledby="tbe-flux">
            <h3 id="tbe-flux">Flux sur 12 mois</h3>
            {/**
              * 🔴🔴 UN GRAPHIQUE QUI SE LIT AUSSI SANS LE VOIR. Les barres sont des `div` dimensionnées en
              * pourcentage, et le tableau qui les porte reste un VRAI tableau pour un lecteur d'écran : chaque
              * mois est une rangée, avec ses deux nombres écrits. Un canevas aurait été muet.
              * ⚠️ `--h` EN POURCENTAGE DU PLUS GRAND MOIS : sans cette échelle, un mois à 1 et un mois à 12
              * auraient la même barre. Zéro reste visible (une barre de 2 px), sinon un mois vide se lit comme
              * un mois manquant.
              */}
            <div className="tbe-flux" role="img"
              aria-label={`Événements ouverts et clôturés par mois sur douze mois : ${
                d.flux.map((m) => `${m.mot}, ${m.ouverts} ouverts, ${m.clos} clôturés`).join(' ; ')}`}>
              {d.flux.map((m) => {
                const maxi = Math.max(1, ...d.flux.flatMap((x) => [x.ouverts, x.clos]));
                return (
                  <div key={m.mois} className="tbe-mois">
                    <div className="tbe-barres">
                      <div className="tbe-barre tbe-barre--ouverts"
                        style={{ height: `${Math.max(2, (m.ouverts / maxi) * 100)}%` }}
                        title={`${m.mot} : ${m.ouverts} ouverts`} />
                      <div className="tbe-barre tbe-barre--clos"
                        style={{ height: `${Math.max(2, (m.clos / maxi) * 100)}%` }}
                        title={`${m.mot} : ${m.clos} clôturés`} />
                    </div>
                    {/* 🔴 LE MOT COURT, et l'année seulement quand elle change : douze fois « oct. 2026 » sous
                        douze colonnes de 22 px se chevauchent (vu à l'écran). L'info-bulle des barres, elle,
                        porte le mois entier. */}
                    <span className="tbe-mois-mot">{m.motCourt}</span>
                  </div>
                );
              })}
            </div>
            <p className="tbe-legende">
              <span className="tbe-puce tbe-puce--ouverts" aria-hidden="true" /> ouverts
              <span className="tbe-puce tbe-puce--clos" aria-hidden="true" /> clôturés
            </p>
          </section>

          {/* ══ c) DÉLAIS ══════════════════════════════════════════════════════════════════════════════════ */}
          <section className="tbe-bloc" aria-labelledby="tbe-delais">
            <h3 id="tbe-delais">Délais</h3>
            <TableDelais titre="Tous les événements" delais={d.delais.global} />
            {d.delais.parType.map((t) => (
              <TableDelais key={t.cle} titre={t.mot} delais={t.delais} />
            ))}
          </section>

          {/* ══ d) ARGENT ══════════════════════════════════════════════════════════════════════════════════ */}
          <section className="tbe-bloc" aria-labelledby="tbe-argent">
            <h3 id="tbe-argent">Argent</h3>
            {/* ⚠️ LES MONTANTS SONT CEUX QUI ONT ÉTÉ SAISIS DANS LES CARTES, et la phrase le dit : un devis sans
                montant compte dans le NOMBRE et pour rien dans la SOMME. Sans cette mention, un total bas se
                lirait « peu de travaux » au lieu de « peu de montants renseignés ». */}
            <p className="tbe-note">Sur les montants saisis dans les cartes.</p>
            <div className="tbe-chiffres">
              {chiffre('devis-attente', 'événements avec un devis en attente', d.attention.devisEnAttente)}
              {chiffre('devis-acceptes', 'avec un devis accepté', d.idsParFiltre['devis-acceptes']?.length ?? 0)}
              {chiffre('devis-refuses', 'avec un devis refusé', d.idsParFiltre['devis-refuses']?.length ?? 0)}
            </div>
            <table className="tbe-table">
              <tbody>
                <tr>
                  <th scope="row">Devis en attente</th>
                  <td>{d.argent.attenteN === 0 ? MOT_SANS_DONNEES : motMontant(d.argent.attenteCents)}</td>
                  <td className="tbe-n-petit">n&nbsp;=&nbsp;{d.argent.attenteN} devis</td>
                </tr>
                <tr>
                  <th scope="row">Devis acceptés</th>
                  <td>{d.argent.accepteN === 0 ? MOT_SANS_DONNEES : motMontant(d.argent.accepteCents)}</td>
                  <td className="tbe-n-petit">n&nbsp;=&nbsp;{d.argent.accepteN} devis</td>
                </tr>
                <tr>
                  <th scope="row">Devis refusés</th>
                  <td>{d.argent.refusesN}</td>
                  <td className="tbe-n-petit">n&nbsp;=&nbsp;{d.argent.refusesN} devis</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* ══ e) POINTS D'ATTENTION ══════════════════════════════════════════════════════════════════════ */}
          <section className="tbe-bloc" aria-labelledby="tbe-attention">
            <h3 id="tbe-attention">Points d’attention</h3>
            <div className="tbe-chiffres">
              {chiffre('devis-attente', 'devis en attente', d.attention.devisEnAttente)}
              {chiffre('sans-nouvelles', `sans nouvelles > ${SEUIL_SANS_NOUVELLES_JOURS} j`, d.attention.sansNouvelles)}
              {chiffre('infos-manquantes', 'infos manquantes', d.attention.infosManquantes)}
              {chiffre('reouverts', 'rouverts', d.attention.reouvertures)}
            </div>
            {/* ⚠️ « INFOS MANQUANTES » EST DÉFINI, pas deviné : sans cette phrase, chacun compte autre chose. */}
            <p className="tbe-note">
              « Infos manquantes » : sans type, sans niveau d’urgence, ou sans bien rattaché.
            </p>
          </section>
        </div>
      )}
      {ouvert && etat.v === 'erreur' && <p className="tbe-note" role="alert">{etat.m}</p>}
    </section>
  );
}

/**
 * LA FEUILLE — jetons `--color-svv-*` uniquement, donc les deux thèmes d'un coup.
 *
 * ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit DANS un litteral de gabarit (piege TS1005 du depot).
 */
const CSS_TABLEAU_BORD = `
.tbe{margin:0 0 12px;border:1px solid var(--color-svv-line-strong);border-radius:12px;
  background:var(--color-svv-surface)}
/* LA LIGNE REPLIEE : c'est elle, le bouton. 44 px de cible tactile (exigence transverse §15). */
.tbe-ligne{display:flex;align-items:center;gap:.6rem;width:100%;min-height:44px;padding:8px 12px;
  font:inherit;text-align:left;color:var(--color-svv-ink);background:transparent;border:0;border-radius:12px;
  cursor:pointer}
.tbe-ligne:hover{background:var(--color-svv-field)}
.tbe-ligne:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.tbe-titre{font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted);flex:0 0 auto}
.tbe-synthese{font-size:.82rem;font-weight:600;min-width:0;overflow-wrap:anywhere}
.tbe-chevron{margin-left:auto;flex:0 0 auto;color:var(--color-svv-muted)}
/* LE CORPS : des blocs qui se rangent en colonnes quand la place le permet, et s'empilent sinon (§15). */
.tbe-corps{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;
  padding:0 12px 12px;border-top:1px solid var(--color-svv-line)}
.tbe-bloc{min-width:0;padding-top:10px}
/* ⚠️ LE FLUX PREND DEUX COLONNES QUAND IL Y EN A PLUSIEURS : douze mois dans 260 px donnent 22 px par
   colonne, et les mots de l'axe s'y chevauchent (vu a l'ecran). Avec deux colonnes, chaque mois a sa place.
   Sur un ecran etroit, la grille n'a qu'une colonne et ce span de 2 ne s'applique pas — exactement ce qu'il
   faut, sinon le bloc deborderait.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral de gabarit. */
@media (min-width:860px){.tbe-bloc--flux{grid-column:span 2}}
.tbe-bloc h3{margin:0 0 6px;font-size:.78rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase;
  color:var(--color-svv-muted)}
.tbe-bloc h4{margin:10px 0 4px;font-size:.74rem;font-weight:700;color:var(--color-svv-muted)}
.tbe-note{margin:6px 0 0;font-size:.72rem;color:var(--color-svv-muted)}
.tbe-n-petit{font-size:.7rem;font-weight:400;color:var(--color-svv-muted);white-space:nowrap}
/* UN CHIFFRE CLIQUABLE — meme forme plate que les boutons-filtres du module (8 px, 32 px visibles). */
.tbe-chiffres{display:flex;flex-wrap:wrap;gap:12px 6px}
.tbe-chiffre{position:relative;display:inline-flex;align-items:baseline;gap:.35rem;min-height:32px;
  padding:.25rem .55rem;font:inherit;font-size:.78rem;color:var(--color-svv-ink);
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:8px;cursor:pointer}
/* La cible tactile de 44 px, invisible : meme moyen que .gpil (lot BOUTONS-PLATS-ET-SYMETRIE-PANNEAUX). */
.tbe-chiffre::after{content:"";position:absolute;left:0;right:0;top:50%;height:44px;transform:translateY(-50%)}
/* ══ 🔴🔴 LOT FILTRES-FAMILLES-ET-BOUTONS-ROUGES, POINTS 2 ET 3 — LE MEME TRAITEMENT QUE .gpil ═══════════════
   Ces chiffres sont le MEME FORMAT que les boutons-filtres (meme hauteur, meme rayon, meme actif), copie ici
   parce qu'ils portent en plus un nombre. Ils avaient donc le MEME defaut : le survol repeignait aussi
   l'actif en gris pale sous un texte blanc. Et ils prennent le MEME rouge de marque.
   ⚠️ LE JOUR OU CE BLOC ET .gpil DIVERGERONT, c'est ici qu'il faudra regarder : deux ecritures pour un meme
   dessin, c'est la dette que ce lot paie une seconde fois. Elles sont voisines et commentees pour cela. */
.tbe-chiffre:hover:not(:disabled):not(.tbe-chiffre--actif){background:var(--color-svv-field)}
.tbe-chiffre:not(:disabled):focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.tbe-chiffre--actif{color:var(--color-svv-surface);background:var(--color-svv-red);
  border-color:var(--color-svv-red)}
.tbe-chiffre--actif:hover:not(:disabled),
.tbe-chiffre--actif:not(:disabled):focus-visible{background:var(--color-svv-red-dark);
  border-color:var(--color-svv-red-dark);color:var(--color-svv-surface)}
.tbe-n{font-weight:700;font-size:.9rem}
.tbe-mot{color:inherit}
/* LES TROIS TONS DE L'URGENCE, les memes jetons que les capsules des cartes (.gst-type-capsule--urg-*). */
/* ⚠️ L'EXCEPTION DES TONS D'URGENCE VAUT ICI AUSSI (point 3 d'Arno) : ces trois-la gardent leur couleur de
   sens, y compris au survol — sans quoi « Normal » deviendrait rouge en le survolant, ce qui serait le
   contraire de ce que le bouton dit. La regle de survol generique ci-dessus est donc annulee pour eux. */
.tbe-ton--normale .tbe-chiffre--actif,
.tbe-ton--normale .tbe-chiffre--actif:hover:not(:disabled){background:var(--color-svv-green-ink);
  border-color:transparent}
.tbe-ton--haute .tbe-chiffre--actif,
.tbe-ton--haute .tbe-chiffre--actif:hover:not(:disabled){background:var(--color-svv-orange);
  border-color:transparent}
.tbe-ton--urgent .tbe-chiffre--actif,
.tbe-ton--urgent .tbe-chiffre--actif:hover:not(:disabled){background:var(--color-svv-red-dark);
  border-color:transparent}
.tbe-ton--normale .tbe-n{color:var(--color-svv-green-ink)}
.tbe-ton--haute .tbe-n{color:var(--color-svv-orange)}
.tbe-ton--urgent .tbe-n{color:var(--color-svv-red-dark)}
.tbe-ton--normale .tbe-chiffre--actif .tbe-n,
.tbe-ton--haute .tbe-chiffre--actif .tbe-n,
.tbe-ton--urgent .tbe-chiffre--actif .tbe-n{color:var(--color-svv-surface)}
/* LE FLUX : douze colonnes, deux barres par mois, et un axe de mots qui se lit en biais quand c'est etroit. */
/* ⚠️ 14 px DE MARGE DE CHAQUE COTE : le mot d'un mois est plus large que sa colonne (22 px) et deborde des
   deux cotes. Sans cette marge, « nov. 25 » de la premiere colonne est rogne en « ov. 25 » par le bord du
   cadre a defilement — vu a l'ecran. */
.tbe-flux{display:flex;align-items:flex-end;gap:3px;height:96px;margin-top:4px;
  padding:0 14px 2px;overflow-x:auto}
.tbe-mois{display:flex;flex-direction:column;align-items:center;gap:2px;flex:1 1 0;min-width:22px}
.tbe-barres{display:flex;align-items:flex-end;gap:2px;height:70px;width:100%;justify-content:center}
.tbe-barre{width:7px;border-radius:2px 2px 0 0}
.tbe-barre--ouverts{background:var(--color-svv-blue, var(--color-svv-ink))}
.tbe-barre--clos{background:var(--color-svv-green-ink)}
.tbe-mois-mot{font-size:.6rem;color:var(--color-svv-muted);white-space:nowrap}
.tbe-legende{display:flex;align-items:center;gap:.4rem;margin:4px 0 0;font-size:.72rem;
  color:var(--color-svv-muted)}
.tbe-puce{display:inline-block;width:9px;height:9px;border-radius:2px;margin-left:.5rem}
.tbe-puce--ouverts{background:var(--color-svv-blue, var(--color-svv-ink));margin-left:0}
.tbe-puce--clos{background:var(--color-svv-green-ink)}
/* LES TABLEAUX DE DELAIS : ils defilent pour eux-memes plutot que de deborder (exigence §15). */
.tbe-table{width:100%;border-collapse:collapse;font-size:.76rem;margin-top:6px}
.tbe-table caption{text-align:left;font-size:.72rem;font-weight:700;color:var(--color-svv-muted);
  padding-bottom:2px}
.tbe-table th,.tbe-table td{text-align:left;padding:3px 6px 3px 0;border-bottom:1px solid var(--color-svv-line);
  vertical-align:baseline}
.tbe-table thead th{font-size:.7rem;font-weight:700;color:var(--color-svv-muted)}
.tbe-table tbody th{font-weight:400;color:var(--color-svv-ink)}
@media (max-width:700px){
  .tbe-ligne{flex-wrap:wrap}
  .tbe-chevron{margin-left:auto}
}
`;
