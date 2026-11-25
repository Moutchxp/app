'use client';

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CSS_LOCATION_ECRANS } from './commun';
import { ChampNombre } from './ChampNombre';
import { FicheCopropriete } from '../gestion/FicheCopropriete';
import { brouillonReponseDeLaLigne, ModuleMailLigne, type MailVingt } from './MailVingtPourcent';
import { EchangesLigne } from './EchangesVingt';
import type { BrouillonEcran } from '../gestion/Redaction';
import {
  agoAConfirmer, agoOfficielleDuDossier, mentionMailsEchanges, texteConfirmationRestitution, TITRE_CONFIRMER_RESTITUTION, blocsOuvertsPourRecherche, type BlocRepliableVingt, capsulesAgo, datesManquantesVisibles, MENTION_AGO_A_CONFIRMER, categorieVingt, classerVingtPourcent, filtrerVingtPourcent, PLACEHOLDER_RECHERCHE_VINGT, rechercheActive, cleDeLaLigne, compteAReboursVingt, etiquetteAgo, MENTION_DATE_PROVISOIRE, montantFr, TITRE_RESTITUTIONS_FAITES, verifierRestitution, type RestitutionFaite, libelleExercice, nombreCoproprietesACompleter, TITRES_CATEGORIES, TITRE_VINGT_POURCENT,
  type CategorieVingt, type ContactsSortie, type GroupeManquant, type LigneDatesManquantes, type LigneVingtPourcent, type SuiviVingtLu,
} from '../../../../lib/location/vingtPourcent';

/**
 * ══ 🔴🔴 « 20 % À RESTITUER » (Arno, 23/11/2026) ═════════════════════════════════════════════════════════════════════════════════════════════════
 * En tête, la rubrique « DATES MANQUANTES » : les copropriétés d'au moins un locataire en attente, à qui il manque la dernière AGO et/ou la date
 * d'arrêté des comptes — ce qui manque, les locataires concernés, « Compléter la fiche Copropriété » (la fenêtre de la fiche, la même que dans
 * l'annuaire ; à sa fermeture la liste se relit : une copropriété complétée en sort). Puis les locataires sortis avec 20 % retenus : logement,
 * copropriété, date de sortie, exercice concerné, AGO qui compte (projetée / officielle, « incertaine » si besoin), limite de restitution,
 * alerte (toujours en mots). Tout est CALCULÉ à la lecture (`lireSuiviVingtPourcent`), rien n'est stocké par locataire. LECTURE SEULE.
 * 🔴🔴 Arno (24/11/2026) — CINQ CATÉGORIES EXCLUSIVES (`classerVingtPourcent`) : « Dates / copropriétés manquantes » (par copropriété, chaque locataire concerné
 * avec sa ligne complète dessous — rien n'est masqué), « Urgence », « AGO passée — restitution à faire », « AGO < 1 mois – À préparer », « AGO > 1 mois – En attente » ; chacune
 * repliable, avec son compteur, triée de la restitution la plus urgente à la plus lointaine.
 * Le même écran sert la Location (`/api/admin/location`) et la Gestion (`/api/admin/gestion/preavis`). Jetons --color-svv-* ; cibles ≥ 44 px.
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` (les types du dépôt seulement).
 */


const dateFr = (d: string): string => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
/** 🔴 Arno (24/11/2026) — les gestes (« Restitution faite », « Annuler ») passent par la route de la Location, depuis la Gestion comme depuis la Location
 *  (la route de la Gestion reste en lecture seule). */
export const API_GESTES_VINGT = '/api/admin/location';
/** 🔴 (Arno, 24/11/2026, 23h53) « Le bouton « Restitution faite » devient « Faire restitution » partout ; la modale ne change pas. » */
export const LIBELLE_FAIRE_RESTITUTION = 'Faire restitution';
type Geste = (corps: Record<string, unknown>) => Promise<string | null>;
const geste: Geste = async (corps) => {
  try {
    const r = await fetch(API_GESTES_VINGT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const d = await r.json().catch(() => ({})) as { etat?: string; motif?: string };
    return d.etat === 'ok' ? null : d.motif ?? (r.status === 403 ? 'Accès refusé : droit « Location » nécessaire.' : 'Enregistrement impossible.');
  } catch { return 'Enregistrement impossible : le serveur n’a pas répondu.'; }
};

export { nombreCoproprietesACompleter, TITRE_VINGT_POURCENT };

/** Le modèle d'un mail parti : son libellé, ou « Message libre » (défini avec les échanges, qui l'affichent). PUR. */
export { libelleModeleVingt } from './EchangesVingt';

/** 🔴 (Arno, 25/11/2026) l'adresse de la ligne sur l'écran Gestion › « 20 % à restituer », module d'envoi déplié (le bouton de la Location y mène). */
export const lienMailGestion = (sortieId: number): string => `/admin/gestion?ecran=vingt_pourcent&vingtMail=${sortieId}`;
const lireMailInitial = (): number | null => {
  if (typeof window === 'undefined') return null;
  const n = Number(new URLSearchParams(window.location.search).get('vingtMail'));
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * `mail` (Arno, 25/11/2026, « Envoyer un mail ») : absent = l'écran de la Location (le bouton mène à la Gestion) ; `null` = la Gestion sans droit
 * d'envoi (bouton inactif, dit pourquoi) ; sinon le contexte du module d'envoi de la Gestion.
 */
export function EcranVingtPourcent({ api, retour, mail }: { api: string; retour?: ReactNode; mail?: MailVingt | null }) {
  // 🔴 (Arno, 25/11/2026) arrivé de la Location par « Envoyer un mail » : la ligne s'ouvre, sa catégorie aussi, module déplié (une fois)
  const [mailInitial] = useState<number | null>(() => (mail !== undefined ? lireMailInitial() : null));
  const [lu, setLu] = useState<{ etat: 'charge' } | { etat: 'erreur'; message: string } | { etat: 'ok'; data: SuiviVingtLu }>({ etat: 'charge' });
  const [version, setVersion] = useState(0);
  const [fiche, setFiche] = useState<{ immeuble: string | null; lotId: number } | null>(null);
  const [restituer, setRestituer] = useState<LigneVingtPourcent | null>(null);
  const [recherche, setRecherche] = useState('');
  const active = rechercheActive(recherche);
  // 🔴🔴 Arno (25/11/2026) — « par défaut toutes les lignes de chaque catégorie sont fermées » : tout replié à l'ouverture ; une recherche ouvre les
  //    catégories qui ont des résultats ; effacée, tout se replie (catégories ET lignes : `replis` les remonte fermées)
  const [ouverts, setOuverts] = useState<ReadonlySet<BlocRepliableVingt>>(new Set());
  const [replis, setReplis] = useState(0);
  const chercher = (q: string): void => {
    setRecherche(q);
    if (lu.etat === 'ok') setOuverts(new Set(blocsOuvertsPourRecherche(lu.data, q)));
    if (!rechercheActive(q)) setReplis((r) => r + 1);
  };
  const ouvert = (b: BlocRepliableVingt) => ({ ouvert: ouverts.has(b), onBasculer: (o: boolean) => setOuverts((s) => {
    if (s.has(b) === o) return s;
    const n = new Set(s); if (o) n.add(b); else n.delete(b); return n;
  }) });
  useEffect(() => {
    let vivant = true;
    fetch(`${api}?vingtPourcent=1&v=${version}`, { cache: 'no-store' })
      .then(async (r) => ({ statut: r.status, d: await r.json() as { etat?: string; data?: SuiviVingtLu; message?: string } }))
      .then(({ statut, d }) => {
        if (!vivant) return;
        if (d.etat === 'ok' && d.data) setLu({ etat: 'ok', data: d.data });
        else setLu({ etat: 'erreur', message: statut === 403 ? 'Accès refusé.' : d.message ?? 'Lecture impossible.' });
      })
      .catch(() => { if (vivant) setLu({ etat: 'erreur', message: 'Lecture impossible : le serveur n’a pas répondu.' }); });
    return () => { vivant = false; };
  }, [api, version]);
  useEffect(() => {
    if (mailInitial === null || lu.etat !== 'ok') return;
    const l = lu.data.lignes.find((x) => x.sortieId === mailInitial);
    if (l === undefined) return;
    const cat = categorieVingt(l, lu.data.aujourdhui);
    setOuverts((s) => (s.has(cat) ? s : new Set([...s, cat])));
    const t = setTimeout(() => document.querySelector(`[data-vgp-sortie="${mailInitial}"]`)?.scrollIntoView({ block: 'start' }), 50);
    return () => clearTimeout(t);
  }, [mailInitial, lu]);
  return (
    <div className="loc-page vgp" data-ecran-vingt-pourcent>
      <style>{CSS_LOCATION_ECRANS + CSS_VINGT_POURCENT}</style>
      {retour}
      <header className="svv-page-head">
        <div className="svv-page-head-ligne"><h1 className="svv-page-title">{TITRE_VINGT_POURCENT}</h1></div>
        <p className="svv-page-sub">Les locataires sortis avec 20 % du dépôt de garantie retenus : l’AGO qui arrête leurs comptes et la date limite de restitution (un mois après l’AGO).</p>
      </header>
      {lu.etat === 'charge' ? <p className="loc-muet" role="status">Lecture…</p>
        : lu.etat === 'erreur' ? <p className="cp-refus" role="alert">{lu.message}</p> : <GestesLigne.Provider value={{ onFiche: setFiche, mail, mailInitial }}>
          {/* 🔴🔴 Arno (24/11/2026, 23h53) — la recherche, sous le titre et au-dessus du listing : filtrage instantané, sur toutes les catégories */}
          <div className="vgp-recherche" role="search">
            <input type="search" value={recherche} onChange={(e) => chercher(e.target.value)} placeholder={PLACEHOLDER_RECHERCHE_VINGT}
              aria-label={PLACEHOLDER_RECHERCHE_VINGT} autoComplete="off" data-vgp-recherche />
            {active && <button type="button" className="vgp-recherche-effacer" onClick={() => chercher('')} aria-label="Effacer la recherche" data-vgp-recherche-effacer>×</button>}
          </div>
          {(() => {
            const vu = filtrerVingtPourcent(lu.data, recherche);
            const cl = classerVingtPourcent(vu);
            const rien = active && vu.lignes.length === 0 && vu.manquantes.length === 0 && (vu.faites ?? []).length === 0;
            return <>
              {rien && <p className="loc-muet vgp-aucun-resultat" role="status" data-vgp-aucun-resultat>Aucun résultat</p>}
              {/* 🔴 (Arno, 25/11/2026, 10h14) le bloc n'apparaît que s'il contient des locataires (et, en recherche, s'il y trouve quelque chose) */}
              {datesManquantesVisibles(vu) && <DatesManquantes key={`manquantes:${replis}`} {...ouvert('manquantes')} lignes={vu.manquantes} groupes={cl.manquantes} toutes={vu.lignes} aujourdhui={vu.aujourdhui} onCompleter={setFiche} onRestituer={setRestituer} />}
              {/* 🔴🔴 Arno (25/11/2026) — « Alerte restitution en retard » REMPLACE le bloc « Alerte du lundi », même place (2e), fond rouge : une catégorie
                  comme les autres (AGO officielle, date limite dépassée), ABSENTE SI VIDE (recherche comprise) ; le mode essai du mail est dans son bloc */}
              {cl.retard.length > 0 && <Categorie key={`retard:${replis}`} {...ouvert('retard')} cle="retard" lignes={cl.retard} aujourdhui={vu.aujourdhui} onRestituer={setRestituer}>
                <AlerteMail api={api} /></Categorie>}
              {(['urgence', 'ag_passee', 'a_preparer', 'en_attente'] as const).filter((k) => !(active && cl[k].length === 0))
                .map((k) => <Categorie key={`${k}:${replis}`} {...ouvert(k)} cle={k} lignes={cl[k]} aujourdhui={vu.aujourdhui} onRestituer={setRestituer} />)}
              {lu.data.lignes.length === 0 && <p className="loc-muet" data-vgp-aucun>Aucun locataire sorti avec 20 % retenus.</p>}
              {!(active && (vu.faites ?? []).length === 0) && <RestitutionsFaites key={`faites:${replis}`} {...ouvert('faites')} faites={vu.faites ?? []} onAnnule={() => setVersion((v) => v + 1)} />}
            </>;
          })()}
        </GestesLigne.Provider>}
      {restituer !== null && lu.etat === 'ok' && <FenetreRestitution l={restituer} aujourdhui={lu.data.aujourdhui}
        onFermer={(fait) => { setRestituer(null); if (fait) setVersion((v) => v + 1); }} />}
      {fiche !== null && <FicheCopropriete immeuble={fiche.immeuble} lotId={fiche.immeuble === null ? fiche.lotId : null}
        onFerme={() => { setFiche(null); setVersion((v) => v + 1); }} />}
    </div>
  );
}

/**
 * 🔴🔴 Arno (25/11/2026) — « une couleur de trame de fond par catégorie, du moins urgent en vert au plus urgent, l'Alerte du lundi en rouge, en passant
 * par l'orange » : la teinte de chaque bloc (jetons --color-svv-vgp-<teinte>-fond / -accent de globals.css ; -accent = liseré ET fond du titre).
 * « Dates / copropriétés manquantes » garde son allure actuelle (pas de teinte).
 */
// 🔴 (25/11/2026) le rouge de l'ancienne « Alerte du lundi » passe à « Alerte restitution en retard », à la même place
export const TEINTES_BLOCS_VINGT = {
  retard: 'alerte', urgence: 'urgence', ag_passee: 'agpassee', a_preparer: 'preparer', en_attente: 'attente', faites: 'faites',
} as const;
const teinte = (b: keyof typeof TEINTES_BLOCS_VINGT): string => ` vgp-teinte vgp-teinte--${TEINTES_BLOCS_VINGT[b]}`;

/** 🔴 Arno (25/11/2026) — l'état replié / ouvert d'un bloc, tenu par l'écran (fermé par défaut ; la recherche l'ouvre). */
type Repli = { ouvert: boolean; onBasculer: (ouvert: boolean) => void };

/** 🔴 Arno (24/11/2026) — une catégorie (b à e) : titre, compteur, repliable ; lignes par date limite croissante. */
function Categorie({ cle, lignes, aujourdhui, onRestituer, ouvert, onBasculer, children }: { cle: Exclude<CategorieVingt, 'manquantes'>; lignes: readonly LigneVingtPourcent[];
  aujourdhui: string; onRestituer: (l: LigneVingtPourcent) => void; children?: ReactNode } & Repli) {
  const rouge = (cle === 'urgence' || cle === 'retard') && lignes.length > 0;
  // 🔴 (Arno, 25/11/2026) « AGO passée » et « AGO < 1 mois – À préparer » : le compteur devient une pastille à fond VERT (grise à 0, comme les rouges)
  const vert = (cle === 'ag_passee' || cle === 'a_preparer') && lignes.length > 0;
  // 🔴🔴 Arno (25/11/2026) — « lorsque l'on clique sur l'un des deux cartouches AGO à droite de la ligne de catégorie, il ne doit s'afficher que les
  //    locataires concernés par ce statut, et pas l'autre ; lorsque l'on clique ailleurs sur la ligne, ne pas changer le comportement actuel ».
  //    Filtre PROPRE à la catégorie (état local : retiré au rechargement, et quand la recherche est effacée — la catégorie est alors remontée) ;
  //    il porte sur les lignes déjà filtrées par la recherche ; une date provisoire compte comme projetée ; le compteur et les capsules ne changent pas.
  const [filtre, setFiltre] = useState<'officielle' | 'projetee' | null>(null);
  // 🔴 (Arno, 25/11/2026) le compteur compte des LOCATAIRES (avant : des sorties) — le même total que les deux capsules
  const c = capsulesAgo(lignes);
  const actif = filtre !== null && c[filtre] > 0 ? filtre : null;
  const vues = actif === null ? lignes : lignes.filter((l) => (agoOfficielleDuDossier(l) ? 'officielle' : 'projetee') === actif);
  const capsule = (k: 'officielle' | 'projetee', ton: 'vert' | 'rouge', libelle: string) => {
    const n = c[k];
    // à 0 : grisée, NON cliquable (le clic ne fait rien, pas même ouvrir ou fermer la catégorie)
    if (n === 0) return <span className="vgp-capsule vgp-capsule--zero" data-vgp-capsule={k} data-vgp-capsule-nombre={0} onClick={(e) => e.preventDefault()}>{libelle} · 0</span>;
    const presse = actif === k;
    return (
      <button type="button" className={`vgp-capsule vgp-capsule--${ton}`} data-vgp-capsule={k} data-vgp-capsule-nombre={n} aria-pressed={presse}
        aria-label={`${libelle} · ${n} — ${presse ? 'filtre actif, cliquer pour tout afficher' : 'afficher seulement ces locataires'}`}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFiltre(presse ? null : k); if (!presse) onBasculer(true); }}>{libelle} · {n}</button>
    );
  };
  return (
    <section className={`vgp-bloc vgp-cat vgp-cat--${cle}${rouge ? ' vgp-cat--a-faire' : ''}${teinte(cle)}`} data-vgp-filtre={actif ?? ''} data-vgp-teinte={TEINTES_BLOCS_VINGT[cle]} aria-label={TITRES_CATEGORIES[cle]} data-vgp-categorie={cle} data-vgp-nombre={c.total}>
      <details open={ouvert} onToggle={(e) => onBasculer(e.currentTarget.open)} className="vgp-repli">
        {/* un clic ailleurs sur l'en-tête : le comportement d'avant (ouvrir / fermer, tout le contenu) — le filtre est retiré */}
        <summary className="vgp-titre" onClick={() => setFiltre(null)}>{TITRES_CATEGORIES[cle]} <span className={rouge ? 'vgp-pastille' : vert ? 'vgp-pastille vgp-pastille--vert' : 'loc-pastille'} data-vgp-compteur>{c.total}</span>
          {/* 🔴🔴 Arno (25/11/2026) — deux capsules empilées, visibles même repliée : verte « AGO officielle · N », rouge « AGO projetée · N » ; à 0, grisée */}
          <span className="vgp-capsules" data-vgp-capsules>
            {capsule('officielle', 'vert', 'AGO officielle')}
            {capsule('projetee', 'rouge', 'AGO projetée')}
          </span></summary>
        {actif !== null && <p className="vgp-filtre-actif" role="status" data-vgp-filtre-actif={actif}>
          Filtre actif : {actif === 'officielle' ? 'AGO officielle' : 'AGO projetée'} ({c[actif]} locataire{c[actif] > 1 ? 's' : ''}) — cliquez sur le titre pour tout afficher.</p>}
        {lignes.length === 0 ? <p className="loc-muet" data-vgp-categorie-vide>Aucun locataire.</p>
          : <ul className="vgp-liste">{vues.map((l) => <LigneLocataire key={l.sortieId} l={l} aujourdhui={aujourdhui} onRestituer={onRestituer} />)}</ul>}
        {children}
      </details>
    </section>
  );
}

/** 🔴 (Arno, 24/11/2026, 23h53) « Jamais d'information en doublon » : un texte déjà sur la ligne (forme normalisée : sans accents, majuscules ni ponctuation). PUR. */
const sansMarques = (x: string): string => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const dejaDit = (texte: string | null | undefined, sur: string | null | undefined): boolean =>
  texte != null && sur != null && sansMarques(texte) !== '' && sansMarques(sur).startsWith(sansMarques(texte));

/**
 * 🔴🔴 Arno (24/11/2026, 23h53) — « quand on déploie un bloc, voir toutes les coordonnées des locataires et des propriétaires réduites au strict
 * minimum : nom, prénom, e-mail, téléphone, ça doit rester compact ». Deux petites rubriques, une ligne par personne : « Prénom NOM · e-mail ·
 * téléphone » (« — » si absent ; e-mail et téléphone cliquables). Écran interne : rien n'est envoyé à qui que ce soit.
 */
function Coordonnees({ c, unSeulLocataire = false, action }: { c: ContactsSortie | undefined; unSeulLocataire?: boolean; action?: ReactNode }) {
  // 🔴 (Arno, 25/11/2026) « Envoyer un mail », aligné à droite sur la ligne « LOCATAIRE / PROPRIÉTAIRE »
  if (c === undefined) return action === undefined ? null : <div className="vgp-coords-ligne"><div className="vgp-coords" />{action}</div>;
  // 🔴 (Arno, 25/11/2026) « pas de doublon » : un bloc qui ne concerne qu'UN locataire → sa ligne dit seulement « e-mail · téléphone » (son nom est
  //    déjà sur la ligne repliée) ; plusieurs locataires → « Prénom NOM · e-mail · téléphone » ; les propriétaires, toujours avec leur nom
  const rubrique = (titre: string, cle: string, gens: ContactsSortie['locataires'], sansNom = false) => (
    <div className="vgp-coord" data-vgp-coordonnees={cle}>
      <p className="vgp-coord-titre">{titre}</p>
      {gens.length === 0 ? <p className="vgp-coord-ligne loc-muet">—</p> : gens.map((g, i) => (
        <p key={i} className="vgp-coord-ligne" data-vgp-personne>
          {!sansNom && <><span className="vgp-coord-nom">{g.nom}</span>{' · '}</>}
          {g.email !== null ? <a href={`mailto:${g.email}`} data-vgp-email>{g.email}</a> : <span className="loc-muet">—</span>}{' · '}
          {g.telephone !== null ? <a href={g.telephone.lien} data-vgp-telephone>{g.telephone.affiche}</a> : <span className="loc-muet">—</span>}
        </p>))}
    </div>
  );
  const coords = <div className="vgp-coords">{rubrique(c.locataires.length > 1 ? 'Locataires' : 'Locataire', 'locataires', c.locataires, unSeulLocataire && c.locataires.length === 1)}
    {rubrique(c.proprietaires.length > 1 ? 'Propriétaires' : 'Propriétaire', 'proprietaires', c.proprietaires)}</div>;
  return action === undefined ? coords : <div className="vgp-coords-ligne">{coords}{action}</div>;
}

/** 🔴 (Arno, 24/11/2026, 23h40) « Manque : dernière AGO et arrêté des comptes ». */
const MOT_MANQUE: Record<'derniere_ago' | 'arrete', string> = { derniere_ago: 'dernière AGO', arrete: 'arrêté des comptes' };

/**
 * La rubrique « Dates / copropriétés manquantes » : en tête de l'écran.
 * 🔴🔴 Arno (24/11/2026, 23h40) — « pourquoi ces blocs sont aussi grands avec des boutons en doublon : réduire sur 3 lignes le bloc principal,
 * déployable comme les autres ; tous les blocs principaux doivent avoir la même taille ». UN bloc de trois lignes par copropriété à compléter
 * (TOUTES celles de la pastille, même si leurs locataires ont une date provisoire) : l'immeuble, les locataires concernés, ce qui manque (orange) ;
 * à droite « Fiche copropriété » ; déplié : une ligne par locataire concerné (logement, sortie, catégorie où il apparaît), avec « Restitution faite ».
 */
function DatesManquantes({ lignes, groupes, toutes, aujourdhui, onCompleter, onRestituer, ouvert, onBasculer }: { lignes: readonly LigneDatesManquantes[]; groupes: readonly GroupeManquant[];
  toutes: readonly LigneVingtPourcent[]; aujourdhui: string; onCompleter: (l: LigneDatesManquantes) => void; onRestituer: (l: LigneVingtPourcent) => void } & Repli) {
  // une ligne classée ici dont la copropriété ne serait pas dans la liste lue garde son bloc (jamais une ligne perdue)
  const cartes = [...lignes, ...groupes.filter((g) => !lignes.some((m) => m.cle === g.copro.cle)).map((g) => g.copro)];
  const manquantes = [...lignes];
  // les locataires concernés de chaque copropriété (datés ou non), par date de sortie
  const concernesDe = new Map(cartes.map((m) => [m.cle, toutes.filter((l) => cleDeLaLigne(l, manquantes) === m.cle)
    .sort((a, b) => a.dateSortie.localeCompare(b.dateSortie) || a.sortieId - b.sortieId)]));
  // 🔴 Arno (24/11/2026) — les copropriétés dans l'ordre de leur locataire sorti le plus anciennement (tous ses locataires concernés) ; sans locataire : ensuite
  const premiere = (m: LigneDatesManquantes): string => concernesDe.get(m.cle)?.[0]?.dateSortie ?? '9999-12-31';
  const triees = cartes.sort((a, b) => premiere(a).localeCompare(premiere(b)) || a.libelle.localeCompare(b.libelle, 'fr'));
  // 🔴 (Arno, 24/11/2026, 23h20) le compteur : les COPROPRIÉTÉS à compléter (la pastille) ; leurs locataires datés sont classés ailleurs
  return (
    <section className={`vgp-bloc vgp-manquantes${lignes.length > 0 ? ' vgp-manquantes--a-faire' : ''}`} aria-label={TITRES_CATEGORIES.manquantes} data-vgp-manquantes={lignes.length} data-vgp-categorie="manquantes" data-vgp-nombre={lignes.length}>
      <details open={ouvert} onToggle={(e) => onBasculer(e.currentTarget.open)} className="vgp-repli">
      <summary className="vgp-titre">{TITRES_CATEGORIES.manquantes} <span className={lignes.length > 0 ? 'vgp-pastille' : 'loc-pastille'} data-vgp-compteur>{lignes.length}</span></summary>
      {cartes.length === 0 ? <p className="loc-muet" data-vgp-manquantes-aucune>Toutes les copropriétés concernées ont leur dernière AGO et leur date d’arrêté des comptes.</p> : <>
        <p className="loc-muet vgp-aide">Ces copropriétés ont au moins un locataire en attente de restitution des 20 % : complétez leur fiche pour un suivi complet et fiable.</p>
        {/* 🔴 (Arno, 24/11/2026, 23h53) « N copropriétés à compléter » retiré : la pastille de la rubrique le dit déjà */}
        <ul className="vgp-liste">
          {triees.map((m) => <BlocCoproACompleter key={m.cle} m={m} aujourdhui={aujourdhui} onCompleter={onCompleter} onRestituer={onRestituer} concernes={concernesDe.get(m.cle) ?? []} />)}
        </ul>
      </>}
      </details>
    </section>
  );
}

/** Un bloc de « Dates / copropriétés manquantes » : même taille que les lignes des autres catégories. */
function BlocCoproACompleter({ m, concernes, aujourdhui, onCompleter, onRestituer }: { m: LigneDatesManquantes; concernes: readonly LigneVingtPourcent[]; aujourdhui: string;
  onCompleter: (l: LigneDatesManquantes) => void; onRestituer: (l: LigneVingtPourcent) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const detailId = useId();
  const basculer = (): void => setOuvert((o) => !o);
  const noms = m.locataires.length > 0 ? m.locataires.join(', ') : concernes.flatMap((l) => l.locataires).join(', ');
  const sansCopro = m.coproprieteId === null;
  return (
    <li className="vgp-ligne vgp-ligne--manque" data-vgp-manque={m.cle} data-vgp-ouvert={ouvert ? '1' : '0'}>
      <div className="vgp-ligne-tete" onClick={basculer}>
        <button type="button" className="vgp-chevron" aria-expanded={ouvert} aria-controls={detailId} onClick={(e) => { e.stopPropagation(); basculer(); }}
          aria-label={ouvert ? 'Replier les locataires concernés' : 'Déplier les locataires concernés'} data-vgp-deplier>{ouvert ? '▾' : '▸'}</button>
        <div className="vgp-ligne-gauche">
          <p className="vgp-ligne-adresse vgp-une-ligne" title={m.libelle} data-vgp-adresse>{m.libelle}</p>
          <p className="vgp-nom vgp-une-ligne" title={noms} data-vgp-noms data-vgp-locataires={m.locataires.length}>{noms}</p>
          <p className="vgp-ligne-limite vgp-ligne-manque vgp-une-ligne" data-vgp-ce-qui-manque={sansCopro ? 'copropriete' : m.manque.join(',')}>
            {/* 🔴 Arno (23/11/2026) — un bien sans copropriété : « Bien sans copropriété » (compté dans la pastille) */}
            {sansCopro ? <><span className="vgp-sans-copro" data-vgp-bien-sans-copro>Bien sans copropriété</span> Aucune copropriété</>
              : `Manque : ${m.manque.map((x) => MOT_MANQUE[x]).join(' et ')}`}</p>
        </div>
        <div className="vgp-ligne-droite" onClick={(e) => e.stopPropagation()}>
          <span className="vgp-ligne-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn vgp-restituer" onClick={() => onCompleter(m)} data-vgp-completer={m.cle}>
              {sansCopro ? 'Créer la copropriété' : 'Fiche copropriété'}</button>
          </span>
        </div>
      </div>
      <div id={detailId} className="vgp-ligne-detail" hidden={!ouvert} data-vgp-detail>
        {concernes.length === 0 ? <p className="loc-muet">Aucun locataire en attente.</p> : (
          <ul className="vgp-liste vgp-concernes">{concernes.map((l) => {
            const cat = categorieVingt(l, aujourdhui);
            // 🔴 (Arno, 24/11/2026, 23h53) « il y a toujours des doublons » : ni le nom (déjà sur la 2e ligne du bloc, sauf s'ils sont plusieurs),
            //    ni l'adresse (déjà sur la 1re, sauf si le logement est à une autre adresse de la copropriété)
            const nom = concernes.length > 1 ? (l.locataires.length > 0 ? l.locataires.join(', ') : `Sortie n° ${l.sortieId}`) : null;
            const logement = dejaDit(m.libelle, l.logement) ? null : l.logement ?? `Bien ${l.lotId}`;
            return (
              <li key={l.sortieId} className="vgp-concerne" data-vgp-concerne={l.sortieId} data-vgp-concerne-categorie={cat}>
                <span className="vgp-concerne-texte">
                  {nom !== null && <><strong data-vgp-concerne-nom>{nom}</strong>{' — '}</>}
                  {logement !== null && <>{logement}{' — '}</>}
                  Sortie le {dateFr(l.dateSortie)}{' — '}
                  {cat === 'manquantes' ? <span className="loc-muet" data-vgp-statut-court>Sans date</span>
                    : <span className="vgp-incertaine" data-vgp-statut-court>Date provisoire → {TITRES_CATEGORIES[cat]}</span>}
                </span>
                <button type="button" className="svv-btn svv-btn-outline gst-btn vgp-restituer" onClick={() => onRestituer(l)} data-vgp-restituer-concerne={l.sortieId}>{LIBELLE_FAIRE_RESTITUTION}</button>
                <Coordonnees c={l.contacts} unSeulLocataire={concernes.reduce((n, x) => n + Math.max(1, x.locataires.length), 0) === 1} />
              </li>
            );
          })}</ul>
        )}
      </div>
    </li>
  );
}

/** 🔴 (Arno, 24/11/2026, 23h16) les gestes d'une ligne qui sortent de l'écran : ouvrir la fiche Copropriété (puis tout relire). */
const GestesLigne = createContext<{ onFiche: (c: { immeuble: string | null; lotId: number }) => void; mail?: MailVingt | null; mailInitial?: number | null }>({ onFiche: () => {} });

/** Ce qui manque à une ligne SANS date calculable (« Dates / copropriétés manquantes »), à la place de la date. PUR. */
export function manquesDeLaLigne(l: Pick<LigneVingtPourcent, 'copropriete' | 'suivi' | 'arrete'>): string[] {
  if (l.copropriete === null) return ['Aucune copropriété'];
  return [...(l.suivi.etat !== 'ok' ? ['Dernière AGO manquante'] : []), ...(l.arrete === null ? ['Arrêté des comptes manquant'] : [])];
}

/**
 * 🔴🔴 Arno (24/11/2026, 23h16) — « chaque bloc de locataire est trop important : le limiter à deux lignes qui se déploient à la demande. Jamais
 * d'information en doublon. » UNE ligne par sortie (colocataires ensemble) : à gauche l'adresse du bien puis le(s) nom(s) ; à droite l'AGO qui compte
 * (ou ce qui manque, en orange), « Fiche copropriété » (« Créer la copropriété » si aucune) et « Restitution faite ». Un clic sur la ligne (hors
 * boutons) déplie le détail : RIEN de ce qui est déjà sur la ligne.
 */
function LigneLocataire({ l, aujourdhui, onRestituer }: { l: LigneVingtPourcent; aujourdhui: string; onRestituer: (l: LigneVingtPourcent) => void }) {
  // 🔴 (Arno, 25/11/2026) une AGO PROJETÉE dont la date limite est passée : « AGO à confirmer — saisir la date officielle » (orange), à la place
  //    de la mention de date provisoire (une seule ligne réservée sous l'étiquette)
  const aConfirmer = agoAConfirmer(l, aujourdhui);
  const { onFiche, mail, mailInitial } = useContext(GestesLigne);
  const [ouvert, setOuvert] = useState(mailInitial === l.sortieId);
  // 🔴🔴 (Arno, 25/11/2026) « Envoyer un mail » : le module existant, déplié sous les coordonnées ; un nouveau clic (ou « Fermer ») le replie
  const [mailOuvert, setMailOuvert] = useState(mailInitial === l.sortieId && mail != null);
  const [fermetureMail, setFermetureMail] = useState(0);
  // 🔴🔴 (Arno, 25/11/2026) « Répondre » sur un mail des échanges : le module s'ouvre en réponse (même fil) ; `n` remonte l'éditeur à chaque réponse
  const [reponse, setReponse] = useState<{ b: BrouillonEcran; n: number } | null>(null);
  const [maintenant] = useState(() => new Date());
  const boutonMail = mail === undefined
    ? <a className="svv-btn svv-btn-outline gst-btn vgp-envoyer-mail" href={lienMailGestion(l.sortieId)} data-vgp-envoyer-mail={l.sortieId}
      title="Ouvre cette ligne sur l’écran Gestion › « 20 % à restituer », module d’envoi déplié">Envoyer un mail</a>
    : <button type="button" className="svv-btn svv-btn-outline gst-btn vgp-envoyer-mail" data-vgp-envoyer-mail={l.sortieId} aria-expanded={mailOuvert}
      disabled={mail === null} title={mail === null ? 'Envoi indisponible : droit d’envoi au nom de la Gestion ou mise à jour de la base manquant' : undefined}
      onClick={() => { if (mailOuvert) setFermetureMail((n) => n + 1); else { setReponse(null); setMailOuvert(true); } }}>Envoyer un mail</button>;
  const detailId = useId();
  const s = l.suivi;
  const alerte = s.etat === 'ok' ? s.alerte : 'sans';
  const basculer = (): void => setOuvert((o) => !o);
  const manques = s.etat === 'ok' ? [] : manquesDeLaLigne(l);
  const adresse = l.logement ?? `Bien ${l.lotId}`;
  const noms = l.locataires.length > 0 ? l.locataires.join(', ') : `Sortie n° ${l.sortieId}`;
  return (
    <li className={`vgp-ligne vgp-ligne--${alerte}`} data-vgp-sortie={l.sortieId} data-vgp-alerte={alerte} data-vgp-ouvert={ouvert ? '1' : '0'}>
      <div className="vgp-ligne-tete" onClick={basculer}>
        <button type="button" className="vgp-chevron" aria-expanded={ouvert} aria-controls={detailId} onClick={(e) => { e.stopPropagation(); basculer(); }}
          aria-label={ouvert ? 'Replier le détail' : 'Déplier le détail'} data-vgp-deplier>{ouvert ? '▾' : '▸'}</button>
        {/* 🔴 (Arno, 24/11/2026, 23h40) À GAUCHE, trois lignes : l'adresse, le(s) nom(s), la date limite et son compte à rebours */}
        <div className="vgp-ligne-gauche">
          <p className="vgp-ligne-adresse vgp-une-ligne" title={adresse} data-vgp-adresse>{adresse}</p>
          <p className="vgp-nom vgp-une-ligne" title={noms} data-vgp-noms>{noms}</p>
          {s.etat === 'ok' ? (() => {
            const c = compteAReboursVingt(s);
            // le compte à rebours ne se tronque JAMAIS : à l'ordinateur seule la date cède de la place ; au téléphone la ligne passe sur deux lignes réservées
            return <p className="vgp-ligne-limite" data-vgp-limite={s.limite}><span className="vgp-limite-texte vgp-une-ligne">Restitution au plus tard le {dateFr(s.limite)}</span>{' '}
              <span className={`vgp-rebours vgp-rebours--${c.ton}`} data-vgp-rebours={c.ton}>{c.texte}</span></p>;
          })() : <p className="vgp-ligne-limite vgp-ligne-manque vgp-une-ligne" data-vgp-manque-ligne={manques.join(',')}>{manques.join(' · ')}</p>}
        </div>
        {/* À DROITE : l'étiquette colorée de l'AG (et, dessous, la mention de date provisoire), puis les deux boutons */}
        <div className="vgp-ligne-droite" onClick={(e) => e.stopPropagation()}>
          <span className="vgp-ligne-ago">
            {s.etat === 'ok' && (() => { const e = etiquetteAgo(s.ago); return <span className={`vgp-etiquette vgp-etiquette--${e.ton}`} data-vgp-ago={`${s.ago.date}:${s.ago.statut}`}>{e.texte}</span>; })()}
            <span className="vgp-incertaine vgp-une-ligne" {...(aConfirmer ? { 'data-vgp-ago-a-confirmer': '' } : s.etat === 'ok' && s.incertaine ? { 'data-vgp-incertaine': '' } : { 'aria-hidden': true })}>
              {aConfirmer ? MENTION_AGO_A_CONFIRMER : s.etat === 'ok' && s.incertaine ? MENTION_DATE_PROVISOIRE : '\u00a0'}</span>
            {/* 🔴🔴 (Arno, 25/11/2026) « avant même d'ouvrir le bloc locataire, sous le cartouche de statut de l'AGO, on doit voir si ce bloc a fait usage
                de la boîte mail et combien de mails ont été échangés » (envoyés + reçus) ; rien s'il n'y en a aucun */}
            {mentionMailsEchanges(l.echanges) !== null && <span className="vgp-mails-echanges vgp-une-ligne" data-vgp-mails-echanges={l.echanges!.nombre}>{mentionMailsEchanges(l.echanges)}</span>}
          </span>
          <span className="vgp-ligne-actions">
          <span className="vgp-ligne-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn vgp-restituer" onClick={() => onFiche({ immeuble: l.immeuble ?? null, lotId: l.lotId })}
              data-vgp-fiche={l.sortieId}>{l.copropriete === null ? 'Créer la copropriété' : 'Fiche copropriété'}</button>
            {/* 🔴 Arno (24/11/2026) — « Restitution faite » : la fenêtre (inchangée) ; enregistrée, la ligne quitte la liste */}
            <button type="button" className="svv-btn svv-btn-outline gst-btn vgp-restituer" onClick={() => onRestituer(l)} data-vgp-restituer={l.sortieId}>{LIBELLE_FAIRE_RESTITUTION}</button>
          </span>
          </span>
        </div>
      </div>
      {/* le détail : RIEN de ce qui est déjà sur la ligne (ni la date limite, ni le compte à rebours, ni l'AG) */}
      <div id={detailId} className="vgp-ligne-detail" hidden={!ouvert} data-vgp-detail>
        <dl className="vgp-dl">
          {/* 🔴 (Arno, 24/11/2026, 23h53) jamais en doublon : la copropriété n'est dite que si elle n'est pas déjà l'adresse de la ligne */}
          {!(l.copropriete !== null && dejaDit(l.copropriete.libelle, adresse)) && (
            <div><dt>Copropriété</dt><dd data-vgp-copropriete>{l.copropriete === null ? 'Bien sans copropriété' : l.copropriete.libelle}{l.copropriete?.aRattacher ? ' (à rattacher à une copropriété)' : ''}</dd></div>)}
          <div><dt>Date de sortie</dt><dd>{dateFr(l.dateSortie)}</dd></div>
          <div><dt>Exercice concerné</dt><dd data-vgp-exercice>{libelleExercice(s.exercice)}</dd></div>
          {/* 🔴 (Arno, 25/11/2026, retrait accordé) plus de rubrique « Arrêté des comptes » : doublon de « Exercice clos le … » (qui dit aussi « date
              d'arrêté des comptes manquante » quand elle l'est) */}
          <div><dt>Dernière AGO</dt><dd data-vgp-derniere-ago>{l.derniereAgo ? dateFr(l.derniereAgo) : 'non renseignée'}</dd></div>
        </dl>
        <Coordonnees c={l.contacts} unSeulLocataire={l.locataires.length <= 1} action={boutonMail} />
        {/* 🔴🔴 (Arno, 25/11/2026) « Échanges (N) » : la conversation de la ligne, visible d'emblée, présentée comme dans la boîte Gestion ; la liste
            « Mails envoyés depuis cette page » y est fondue (chaque mail parti d'ici porte son modèle et son lien) ; le module d'écriture reste fermé */}
        {ouvert && <EchangesLigne l={l} maintenant={maintenant}
          onRepondre={mail != null ? (voie, m, filId, corps) => {
            setReponse((r) => ({ b: brouillonReponseDeLaLigne(l, mail.contexte, voie, m, filId, corps), n: (r?.n ?? 0) + 1 }));
            setMailOuvert(true);
          } : undefined} />}
        {mailOuvert && mail != null && <ModuleMailLigne key={reponse?.n ?? 0} l={l} mail={mail} fermeture={fermetureMail} reponse={reponse?.b ?? null}
          onFermer={() => { setMailOuvert(false); setFermetureMail(0); setReponse(null); }} />}
        {s.etat !== 'ok' && <p className="vgp-alerte vgp-alerte--sans" data-vgp-alerte-texte>Pas de date limite — {s.mention} : à compléter dans la fiche Copropriété.</p>}
      </div>
    </li>
  );
}

/** 🔴 Arno (24/11/2026) — la fenêtre « Restitution faite » : date, montant restitué, montant retenu au titre des charges (facultatif), commentaire. */
function FenetreRestitution({ l, aujourdhui, onFermer }: { l: LigneVingtPourcent; aujourdhui: string; onFermer: (fait: boolean) => void }) {
  const titreId = useId();
  const [date, setDate] = useState(aujourdhui);
  const [restitue, setRestitue] = useState('');
  const [retenu, setRetenu] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [refus, setRefus] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // 🔴🔴 Arno (25/11/2026) — « Enregistrer la restitution » (après les contrôles du formulaire) ouvre une CONFIRMATION par-dessus ; rien n'est écrit
  //    avant « Confirmer la restitution » ; « Revenir » la ferme, la saisie est gardée. Un seul enregistrement, même sur un double clic (`enCours`).
  const [aConfirmer, setAConfirmer] = useState<{ date: string; montantRestitue: number; montantRetenuCharges: number | null } | null>(null);
  const enCours = useRef(false);
  const confirmId = useId();
  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || envoi) return;
      if (aConfirmer !== null) setAConfirmer(null); else onFermer(false); // Échap : d'abord « Revenir »
    };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [envoi, onFermer, aConfirmer]);
  const enregistrer = (): void => {
    const v = verifierRestitution({ date, montantRestitue: restitue, montantRetenuCharges: retenu, commentaire }, { dateSortie: l.dateSortie, aujourdhui });
    if (!v.ok) { setRefus(v.motif); return; }
    setRefus(null);
    setAConfirmer({ date: v.valeur.date, montantRestitue: v.valeur.montantRestitue, montantRetenuCharges: v.valeur.montantRetenuCharges });
  };
  const confirmer = async (): Promise<void> => {
    if (enCours.current) return;
    enCours.current = true;
    setEnvoi(true); setRefus(null);
    const motif = await geste({ action: 'restitution-20-faite', sortieId: l.sortieId, date, montantRestitue: restitue, montantRetenuCharges: retenu, commentaire });
    setEnvoi(false);
    enCours.current = false;
    if (motif !== null) { setRefus(motif); setAConfirmer(null); return; }
    onFermer(true);
  };
  // « Prénom NOM » : les coordonnées du dossier quand elles sont lues, sinon le nom de la ligne
  const noms = (l.contacts?.locataires ?? []).length > 0 ? l.contacts!.locataires.map((p) => p.nom) : l.locataires;
  return (
    <div className="vgp-voile" data-fenetre-restitution={l.sortieId}>
      <div className="vgp-boite" role="dialog" aria-modal="true" aria-labelledby={titreId}>
        <h2 id={titreId} className="vgp-titre">Restitution faite — {l.locataires.length > 0 ? l.locataires.join(', ') : `Sortie n° ${l.sortieId}`}</h2>
        <p className="loc-muet vgp-aide">{l.logement ?? `Bien ${l.lotId}`} — sortie le {dateFr(l.dateSortie)}. Enregistrée, la restitution est journalisée dans le dossier du locataire
          et la ligne quitte la liste (elle reste dans « {TITRE_RESTITUTIONS_FAITES} », où elle peut être annulée).</p>
        <label className="vgp-champ"><span>Date de restitution *</span>
          <input type="date" value={date} max={aujourdhui} min={l.dateSortie} onChange={(e) => setDate(e.target.value)} disabled={envoi} data-restitution-date /></label>
        <label className="vgp-champ"><span>Montant restitué (€) *</span>
          <ChampNombre value={restitue} placeholder="ex. 312,50" onChange={(e) => setRestitue(e.target.value)} disabled={envoi} data-restitution-montant /></label>
        <label className="vgp-champ"><span>Montant retenu au titre des charges (€, facultatif)</span>
          <ChampNombre value={retenu} placeholder="ex. 40,00" onChange={(e) => setRetenu(e.target.value)} disabled={envoi} data-restitution-retenu /></label>
        <label className="vgp-champ"><span>Commentaire (facultatif)</span>
          <textarea value={commentaire} rows={3} onChange={(e) => setCommentaire(e.target.value)} disabled={envoi} data-restitution-commentaire /></label>
        {refus !== null && <p className="cp-refus" role="alert" data-restitution-refus>{refus}</p>}
        <div className="vgp-actions">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => onFermer(false)} disabled={envoi} data-restitution-annuler>Annuler</button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={enregistrer} disabled={envoi || aConfirmer !== null} data-restitution-enregistrer>
            Enregistrer la restitution</button>
        </div>
      </div>
      {aConfirmer !== null && (
        <div className="vgp-voile vgp-voile--confirmation" data-confirmation-restitution={l.sortieId}>
          <div className="vgp-boite vgp-boite--confirmation" role="alertdialog" aria-modal="true" aria-labelledby={confirmId}>
            <h2 id={confirmId} className="vgp-titre">{TITRE_CONFIRMER_RESTITUTION}</h2>
            {texteConfirmationRestitution({ noms, ...aConfirmer }).map((t, i) => <p key={i} className="vgp-aide" data-confirmation-texte>{t}</p>)}
            <div className="vgp-actions">
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setAConfirmer(null)} disabled={envoi} data-confirmation-revenir autoFocus>Revenir</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { void confirmer(); }} disabled={envoi} data-confirmation-confirmer>
                {envoi ? 'Enregistrement…' : TITRE_CONFIRMER_RESTITUTION}</button>
            </div>
          </div>
        </div>)}
    </div>
  );
}

/** 🔴 Arno (24/11/2026) — « Restitutions faites (N) », repliée, en bas de page : l'historique, avec « Annuler » (journalisé) en cas d'erreur. */
function RestitutionsFaites({ faites, onAnnule, ouvert, onBasculer }: { faites: readonly RestitutionFaite[]; onAnnule: () => void } & Repli) {
  const [confirmer, setConfirmer] = useState<number | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [maintenantFaites] = useState(() => new Date());
  const annuler = async (id: number): Promise<void> => {
    setEnvoi(true); setRefus(null);
    const motif = await geste({ action: 'restitution-20-annuler', restitutionId: id });
    setEnvoi(false);
    if (motif !== null) { setRefus(motif); return; }
    setConfirmer(null); onAnnule();
  };
  return (
    <section className={`vgp-bloc vgp-faites${teinte('faites')}`} data-vgp-teinte={TEINTES_BLOCS_VINGT.faites} aria-label={TITRE_RESTITUTIONS_FAITES} data-vgp-faites={faites.length}>
      <details open={ouvert} onToggle={(e) => onBasculer(e.currentTarget.open)} className="vgp-repli">
        <summary className="vgp-titre">{TITRE_RESTITUTIONS_FAITES} ({faites.length})</summary>
        {faites.length === 0 ? <p className="loc-muet" data-vgp-faites-aucune>Aucune restitution enregistrée.</p> : (
          <ul className="vgp-liste">{faites.map((f) => (
            <li key={f.id} className="vgp-carte" data-vgp-faite={f.id}>
              <p className="vgp-nom">{f.locataires.length > 0 ? f.locataires.join(', ') : `Sortie n° ${f.sortieId}`}</p>
              {/* 🔴🔴 (Arno, 25/11/2026) « l'historique des mails doit suivre le locataire quelle que soit la catégorie » : les échanges de la SORTIE, ici aussi */}
              {mentionMailsEchanges(f.echanges) !== null && <p className="vgp-mails-echanges" data-vgp-mails-echanges={f.echanges!.nombre}>{mentionMailsEchanges(f.echanges)}</p>}
              <dl className="vgp-dl">
                <div><dt>Logement</dt><dd>{f.logement ?? '—'}</dd></div>
                <div><dt>Date de sortie</dt><dd>{dateFr(f.dateSortie)}</dd></div>
                <div><dt>Restituée le</dt><dd data-vgp-faite-date>{dateFr(f.date)}</dd></div>
                <div><dt>Montant restitué</dt><dd data-vgp-faite-montant>{montantFr(f.montantRestitue)}</dd></div>
                {f.montantRetenuCharges !== null && <div><dt>Retenu au titre des charges</dt><dd data-vgp-faite-retenu>{montantFr(f.montantRetenuCharges)}</dd></div>}
                {f.commentaire !== null && <div><dt>Commentaire</dt><dd>{f.commentaire}</dd></div>}
                <div><dt>Enregistrée par</dt><dd>{f.par}, le {dateFr(f.le.slice(0, 10))} à {f.le.slice(11, 16)}</dd></div>
              </dl>
              {/* la conversation, en lecture (la restitution est faite : pas de « Répondre » ici) ; lue seulement le bloc ouvert */}
              {ouvert && f.echanges !== undefined && <EchangesLigne l={f} maintenant={maintenantFaites} />}
              {confirmer === f.id ? (
                <div className="vgp-confirmer" role="group" aria-label="Confirmer l’annulation" data-vgp-confirmer-annulation={f.id}>
                  <p className="vgp-aide">Annuler cette restitution ? Elle reste dans l’historique du dossier, et le locataire revient dans la liste « 20 % à restituer ».</p>
                  <div className="vgp-actions">
                    <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setConfirmer(null)} disabled={envoi}>Non, garder</button>
                    <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { void annuler(f.id); }} disabled={envoi} data-vgp-annuler-oui={f.id}>Oui, annuler</button>
                  </div>
                  {refus !== null && <p className="cp-refus" role="alert">{refus}</p>}
                </div>
              ) : <button type="button" className="svv-btn svv-btn-outline gst-btn vgp-restituer" onClick={() => { setRefus(null); setConfirmer(f.id); }} data-vgp-annuler={f.id}>Annuler</button>}
            </li>))}</ul>
        )}
      </details>
    </section>
  );
}

/**
 * 🔴 Arno (24/11/2026) — LE MODE ESSAI de l'alerte par mail : le mail tel qu'il partirait, lu (GET) — rien n'est envoyé, rien n'est écrit.
 * 🔴 (25/11/2026) plus un bloc à part : une rubrique DANS « Alerte restitution en retard ».
 */
function AlerteMail({ api }: { api: string }) {
  const [vu, setVu] = useState<{ etat: 'rien' } | { etat: 'charge' } | { etat: 'erreur'; message: string }
    | { etat: 'ok'; mail: { a: string[]; objet: string; texte: string; nombre: number } | null }>({ etat: 'rien' });
  const voir = async (): Promise<void> => {
    setVu({ etat: 'charge' });
    try {
      const r = await fetch(`${api}?alerteVingtEssai=1`, { cache: 'no-store' });
      const d = await r.json() as { etat?: string; data?: { mail?: { a: string[]; objet: string; texte: string; nombre: number } | null }; message?: string };
      setVu(d.etat === 'ok' ? { etat: 'ok', mail: d.data?.mail ?? null } : { etat: 'erreur', message: d.message ?? 'Lecture impossible.' });
    } catch { setVu({ etat: 'erreur', message: 'Lecture impossible : le serveur n’a pas répondu.' }); }
  };
  return (
    <div className="vgp-alerte-mail" data-vgp-alerte-mail>
        <p className="vgp-coord-titre">Alerte par mail</p>
        <p className="loc-muet vgp-aide">Tous les 2 jours, le matin à partir de 8 h (heure de Paris), s’il y a au moins un locataire en « Alerte restitution en retard », un mail
          récapitulatif part à l’adresse de la Gestion. Aucun mail si personne n’est en retard ; jamais deux fois le même jour.</p>
        <button type="button" className="svv-btn svv-btn-outline gst-btn vgp-restituer" onClick={() => { void voir(); }} disabled={vu.etat === 'charge'} data-vgp-alerte-essai>
          Voir le mail tel qu’il partirait (essai : rien n’est envoyé)</button>
        {vu.etat === 'charge' && <p className="loc-muet" role="status">Lecture…</p>}
        {vu.etat === 'erreur' && <p className="cp-refus" role="alert">{vu.message}</p>}
        {vu.etat === 'ok' && (vu.mail === null
          ? <p className="loc-muet" data-vgp-alerte-aucune>Aucun locataire en « Alerte restitution en retard » : aucun mail ne partirait.</p>
          : <div className="vgp-carte" data-vgp-alerte-apercu>
            <dl className="vgp-dl"><div><dt>À</dt><dd>{vu.mail.a.join(', ')}</dd></div><div><dt>Objet</dt><dd data-vgp-alerte-objet>{vu.mail.objet}</dd></div></dl>
            <pre className="vgp-texte" data-vgp-alerte-texte-mail>{vu.mail.texte}</pre>
          </div>)}
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cibles de 44 px ; une colonne au telephone. */
export const CSS_VINGT_POURCENT = `
.vgp{display:flex;flex-direction:column;gap:14px;min-width:0}
.vgp-bloc{display:flex;flex-direction:column;gap:10px;padding:14px;border:1px solid var(--color-svv-line);border-radius:16px;background:var(--color-svv-field);min-width:0}
.vgp-manquantes--a-faire,.vgp-cat--a-faire{border-color:var(--color-svv-red)}
/* 🔴 (Arno, 25/11/2026, 10h14) « pour les 2 blocs gris d'extrémité, agrandir légèrement l'espace avec les autres blocs en contact pour bien les
   dissocier du process coloré » : l'écart vaut le DOUBLE de celui des blocs colorés (14 px de gap + 14 px), à l'ordinateur comme au téléphone */
.vgp-bloc.vgp-manquantes{margin-bottom:14px}
.vgp-bloc.vgp-faites{margin-top:14px}
.vgp-repli{display:flex;flex-direction:column;gap:10px;min-width:0}
.vgp-repli > summary{cursor:pointer;min-height:44px;list-style:none}
.vgp-repli > summary::-webkit-details-marker{display:none}
.vgp-repli > summary::before{content:'▸';display:inline-block;width:1em;color:var(--color-svv-muted)}
.vgp-repli[open] > summary::before{content:'▾'}
.vgp-repli[open] > summary{margin-bottom:10px}
/* 🔴 (Arno, 25/11/2026) les trames par catégorie : fond = -fond ; liseré et fond du titre = -accent ; encre du thème (contraste vérifié en épreuve) */
.vgp-bloc.vgp-teinte{background:var(--vgp-fond);border:2px solid var(--vgp-accent);padding:0 14px 14px;overflow:hidden}
.vgp-bloc.vgp-teinte:has(> .vgp-repli:not([open])){padding-bottom:0}
/* replié, Chrome garde l'écart du flex avant le contenu caché : aucune bande de trame sous le titre */
.vgp-teinte > .vgp-repli:not([open]){gap:0}
.vgp-teinte > .vgp-repli > summary{margin-inline:-14px;padding:8px 14px;background:var(--vgp-accent);color:var(--color-svv-ink)}
.vgp-teinte > .vgp-repli > summary::before{color:var(--color-svv-ink)}
.vgp-teinte--alerte{--vgp-fond:var(--color-svv-vgp-alerte-fond);--vgp-accent:var(--color-svv-vgp-alerte-accent)}
.vgp-teinte--urgence{--vgp-fond:var(--color-svv-vgp-urgence-fond);--vgp-accent:var(--color-svv-vgp-urgence-accent)}
.vgp-teinte--agpassee{--vgp-fond:var(--color-svv-vgp-agpassee-fond);--vgp-accent:var(--color-svv-vgp-agpassee-accent)}
.vgp-teinte--preparer{--vgp-fond:var(--color-svv-vgp-preparer-fond);--vgp-accent:var(--color-svv-vgp-preparer-accent)}
.vgp-teinte--attente{--vgp-fond:var(--color-svv-vgp-attente-fond);--vgp-accent:var(--color-svv-vgp-attente-accent)}
.vgp-teinte--faites{--vgp-fond:var(--color-svv-vgp-faites-fond);--vgp-accent:var(--color-svv-vgp-faites-accent)}
.vgp-alerte-mail{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px dashed var(--vgp-accent);border-radius:12px;background:var(--color-svv-surface)}
.vgp-capsules{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:3px}
.vgp-capsule{display:inline-block;padding:1px 9px;border-radius:999px;font-size:.75rem;font-weight:800;line-height:1.35;white-space:nowrap;border:1px solid}
.vgp-capsule--vert{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);border-color:var(--color-svv-green)}
.vgp-capsule--rouge{background:var(--color-svv-red-soft);color:var(--color-svv-red-dark);border-color:var(--color-svv-red)}
.vgp-capsule--zero{background:var(--color-svv-field);color:var(--color-svv-muted);border-color:var(--color-svv-line-strong);cursor:default}
/* 🔴 (Arno, 25/11/2026) les capsules filtrent : boutons ; la capsule active a un contour plus marque (sans decaler la mise en page) */
button.vgp-capsule{font:inherit;font-size:.75rem;font-weight:800;line-height:1.35;cursor:pointer;margin:0}
button.vgp-capsule:focus-visible{outline:2px solid var(--color-svv-ink);outline-offset:2px}
button.vgp-capsule[aria-pressed="true"]{box-shadow:0 0 0 2px currentColor}
.vgp-filtre-actif{margin:0;font-size:.85rem;font-weight:700;color:var(--color-svv-ink)}
.vgp-sous-liste{margin-top:6px;padding-left:10px;border-left:3px solid var(--color-svv-line-strong)}
.vgp-dl dd.vgp-depasse{color:var(--color-svv-red);font-weight:800}
.vgp-titre{margin:0;font-size:1.05rem;font-weight:800;color:var(--color-svv-ink);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.vgp-pastille{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 7px;border-radius:999px;background:var(--color-svv-red);color:var(--color-svv-surface);font-size:.8rem;font-weight:800}
.vgp-pastille.vgp-pastille--vert{background:var(--color-svv-green-ink)}
.vgp-aide{margin:0;font-size:.9rem}
.vgp-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.vgp-carte{display:flex;flex-direction:column;gap:6px;padding:12px;border:1px solid var(--color-svv-line);border-radius:12px;background:var(--color-svv-surface);min-width:0;overflow-wrap:anywhere}
.vgp-carte--depassee{border-left:4px solid var(--color-svv-red)}
.vgp-carte--proche{border-left:4px solid var(--color-svv-urgence-orange)}
.vgp-nom{margin:0;font-weight:800;color:var(--color-svv-ink)}
.vgp-sans-copro{margin:0;align-self:flex-start;padding:2px 10px;border-radius:999px;font-size:.78rem;font-weight:800;text-transform:uppercase;letter-spacing:.02em;background:var(--color-svv-amber-soft);color:var(--color-svv-ink);border:1px solid var(--color-svv-urgence-orange)}
.vgp-manque,.vgp-locataires{margin:0;color:var(--color-svv-ink)}
.vgp-completer{align-self:flex-start;min-height:44px;width:auto}
.vgp-dl{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:6px 16px;margin:0}
.vgp-dl > div{display:flex;flex-direction:column;gap:1px;min-width:0}
.vgp-dl dt{font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--color-svv-muted)}
.vgp-dl dd{margin:0;color:var(--color-svv-ink)}
.vgp-projetee{font-style:italic;text-decoration:underline dashed;text-underline-offset:3px}
.vgp-officielle{font-weight:700}
.vgp-incertaine,.vgp-inconnue{color:var(--color-svv-urgence-orange);font-weight:700}
.vgp-alerte{margin:0;padding:8px 10px;border-radius:10px;font-weight:700;background:var(--color-svv-field);color:var(--color-svv-ink);border:1px solid var(--color-svv-line-strong)}
.vgp-alerte--depassee{background:var(--color-svv-red-soft);color:var(--color-svv-red-dark);border-color:var(--color-svv-red)}
.vgp-alerte--proche{background:var(--color-svv-amber-soft);border-color:var(--color-svv-urgence-orange)}
.vgp-alerte--sans{border-style:dashed;color:var(--color-svv-muted)}
.vgp-restituer{align-self:flex-start;min-height:44px;width:auto}
.vgp-recherche{position:relative;display:block;width:100%;min-width:0}
.vgp-recherche input{box-sizing:border-box;width:100%;min-height:44px;padding:8px 44px 8px 12px;border:1px solid var(--color-svv-line-strong);border-radius:10px;
  background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:.95rem}
.vgp-recherche input::-webkit-search-cancel-button{display:none}
.vgp-recherche-effacer{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:40px;height:40px;border:0;border-radius:8px;background:none;color:var(--color-svv-muted);font:inherit;font-size:1.3rem;cursor:pointer}
.vgp-aucun-resultat{margin:0;padding:12px 14px;border:1px dashed var(--color-svv-line-strong);border-radius:12px}
.vgp-ligne{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border:1px solid var(--color-svv-line);border-radius:12px;background:var(--color-svv-surface);min-width:0}
.vgp-ligne--depassee{border-left:4px solid var(--color-svv-red)}
.vgp-ligne--proche{border-left:4px solid var(--color-svv-urgence-orange)}
.vgp-ligne-tete{display:flex;align-items:center;gap:10px;cursor:pointer;min-width:0;height:92px;box-sizing:border-box}
.vgp-chevron{flex:0 0 auto;width:32px;min-height:44px;border:0;background:none;color:var(--color-svv-muted);font:inherit;font-size:1rem;cursor:pointer}
.vgp-ligne-gauche{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.vgp-une-ligne{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.vgp-ligne-adresse{margin:0;color:var(--color-svv-ink);font-size:.9rem}
.vgp-ligne-limite{margin:0;color:var(--color-svv-ink);font-size:.85rem;display:flex;align-items:baseline;gap:4px;min-width:0;white-space:nowrap}
.vgp-limite-texte{flex:0 1 auto}
.vgp-rebours{font-weight:800;flex:0 0 auto}
.vgp-rebours--gris{color:var(--color-svv-muted);font-weight:700}
.vgp-rebours--rouge{color:var(--color-svv-red)}
/* 🔴 (Arno, 25/11/2026) le compte à rebours « J-15 » (de l'AG à la date limite) passe en ROUGE ; « AG dans N jours » reste gris */
.vgp-rebours--normal{color:var(--color-svv-red)}
.vgp-ligne-droite{flex:0 0 auto;display:flex;align-items:center;gap:10px;justify-content:flex-end;cursor:default;max-width:60%}
.vgp-ligne-ago{display:flex;flex-direction:column;align-items:flex-end;gap:2px;min-width:0}
.vgp-etiquette{display:inline-block;padding:3px 10px;border-radius:999px;font-size:.82rem;font-weight:800;white-space:nowrap;border:1px solid}
.vgp-etiquette--rouge{background:var(--color-svv-red-soft);color:var(--color-svv-red-dark);border-color:var(--color-svv-red)}
.vgp-etiquette--vert{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);border-color:var(--color-svv-green)}
.vgp-ligne-ago .vgp-incertaine{font-size:.78rem;max-width:100%}
.vgp-ligne-manque{font-weight:700;color:var(--color-svv-urgence-orange-texte)}
.vgp-ligne-boutons{display:flex;gap:6px}
.vgp-ligne-actions{display:flex;flex-direction:column;align-items:flex-end;gap:2px;min-width:0}
.vgp-mails-echanges{font-size:.75rem;font-weight:700;color:var(--color-svv-muted);max-width:100%}
.vgp-ligne-boutons .gst-btn{margin:0;width:auto;min-height:44px;white-space:nowrap}
.vgp-ligne-detail{padding:8px 0 2px 42px;display:flex;flex-direction:column;gap:6px}
.vgp-ligne-detail[hidden]{display:none}
.vgp-ligne--manque{border-left:4px solid var(--color-svv-urgence-orange)}
.vgp-ligne-manque .vgp-sans-copro{margin-right:6px;padding:1px 8px}
.vgp-concernes{gap:6px}
.vgp-concerne{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px 10px;padding:6px 0;border-top:1px solid var(--color-svv-line);min-width:0}
.vgp-concerne .vgp-coords{flex:1 1 100%}
.vgp-coords-ligne{display:flex;align-items:flex-start;gap:10px 16px;min-width:0}
.vgp-coords-ligne > .vgp-coords{flex:1 1 auto}
.vgp-envoyer-mail{flex:0 0 auto;margin:0;width:auto;min-height:44px;white-space:nowrap;text-decoration:none;display:inline-flex;align-items:center}
.vgp-mail{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--color-svv-line-strong);border-radius:12px;background:var(--color-svv-surface);min-width:0}
.vgp-mail-modele{display:flex;flex-direction:column;gap:3px;font-size:.88rem;font-weight:700;min-width:0}
.vgp-mail-modele > :nth-child(2){max-width:520px;font-weight:400}
.vgp-mail-module{display:flex;flex-direction:column;gap:6px;min-width:0}
.vgp-coords{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:4px 16px;min-width:0}
.vgp-coord{display:flex;flex-direction:column;gap:1px;min-width:0}
.vgp-coord-titre{margin:0;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--color-svv-muted)}
.vgp-coord-ligne{margin:0;font-size:.85rem;color:var(--color-svv-ink);overflow-wrap:anywhere;line-height:1.35}
.vgp-coord-ligne a{color:var(--color-svv-ink);text-decoration:underline;text-underline-offset:2px}
.vgp-coord-nom{font-weight:700}
.vgp-concerne-texte{min-width:0;overflow-wrap:anywhere;font-size:.88rem;color:var(--color-svv-ink)}
.vgp-concerne .gst-btn{margin:0;width:auto;min-height:44px;white-space:nowrap}
.vgp-texte{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:.88rem;color:var(--color-svv-ink)}
.vgp-voile{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent)}
.vgp-boite{width:min(560px,100%);max-height:calc(100dvh - 24px);overflow:auto;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:16px;
  border:1px solid var(--color-svv-line);background:var(--color-svv-surface);color:var(--color-svv-ink)}
.vgp-voile.vgp-voile--confirmation{z-index:91}
.vgp-champ{display:flex;flex-direction:column;gap:3px;font-size:.88rem;font-weight:700;min-width:0}
.vgp-champ input,.vgp-champ textarea{min-height:44px;box-sizing:border-box;width:100%;padding:8px 10px;border:1px solid var(--color-svv-line-strong);border-radius:10px;
  background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-weight:400}
.vgp-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.vgp-actions .gst-btn{min-height:44px;width:auto;margin:0}
.vgp-confirmer{display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:10px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-field)}
/* 🔴 (Arno, 24/11/2026, 23h40) 390 px : les 3 lignes de gauche en haut, l'étiquette AG puis les boutons pleine largeur dessous ; la hauteur suit le
   contenu, mais chaque élément tient sur UNE ligne (et la place de la mention est gardée) : même hauteur entre blocs d'une même catégorie */
@media (max-width:640px){ .vgp-ligne-tete{flex-wrap:wrap;height:auto;align-items:flex-start} .vgp-ligne-gauche{flex:1 1 calc(100% - 42px)}
  .vgp-ligne-droite{flex:1 1 100%;max-width:none;justify-content:stretch;flex-direction:column;align-items:stretch;gap:6px}
  .vgp-ligne-gauche > .vgp-ligne-adresse,.vgp-ligne-gauche > .vgp-nom{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.3;min-height:2.6em}
  .vgp-ligne-gauche > .vgp-ligne-limite{flex-wrap:wrap;white-space:normal;line-height:1.3;height:2.6em;overflow:hidden;row-gap:0}
  .vgp-ligne-gauche > .vgp-ligne-limite .vgp-une-ligne,.vgp-ligne-gauche > .vgp-ligne-limite.vgp-une-ligne{white-space:normal;overflow:visible;text-overflow:clip}
  .vgp-ligne-limite .vgp-sans-copro{line-height:1.2;padding:0 8px}
  .vgp-ligne-ago{align-items:flex-start} .vgp-ligne-actions{align-items:stretch} .vgp-ligne-boutons{flex-direction:column} .vgp-ligne-boutons .gst-btn{width:100%} .vgp-ligne-detail{padding-left:0}
  .vgp-concerne{flex-direction:column;align-items:stretch} .vgp-concerne .gst-btn{width:100%}
  .vgp-coords-ligne{flex-direction:column;align-items:stretch} .vgp-envoyer-mail{width:100%;justify-content:center}
  .vgp-completer,.vgp-restituer{align-self:stretch;width:100%} .vgp-actions{flex-direction:column-reverse} .vgp-actions .gst-btn{width:100%} }
`;
