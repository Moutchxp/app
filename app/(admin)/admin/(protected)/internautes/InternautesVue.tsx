'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { libelleFinaliteAffichage } from '../../../../lib/internaute/libelleFinalite';
import { STATUTS_EXPORT, FINALITE_F1 } from '../../../../lib/internaute/extraction';
import { projetVersSaisieBanc, ecrireHandoffBanc } from '../../../../lib/internaute/pontProjetBanc';
import { formaterTelephone } from '../../../../lib/internaute/formatTelephone';
import { libelleScore } from '../../../../lib/libelles';
import { SCORE_LABEL_EXCEPTIONNELLE_MIN, SCORE_LABEL_EXCELLENTE_MIN } from '../../../../lib/svv/config';
import type { CleFinalite } from '../../../../lib/internaute/textesConsentement';

/**
 * Vue interactive du module « Internautes » (LOT 3). Client PUR : ne touche jamais la base ; consomme
 * `/api/admin/internautes*` (réservé administrateur, invariant d'intersection des statuts appliqué CÔTÉ SERVEUR — cette
 * vue ne fait que refléter). Charte : rouge/gris, AUCUN bleu, cibles ≥44px, focus rouge, prefers-reduced-motion.
 */

const CSS = `
.svv-int :is(button,input,select,a):focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.svv-int :is(button,input,select,a){min-height:44px}
/* Grille COMMUNE aux 2 rangées de filtres : mêmes colonnes → largeurs identiques + alignement vertical strict
   (Résidence sous Commune, Créé après sous Score min, …). Responsive : le nombre de colonnes se réduit par paliers,
   les 2 rangées se réagencent ENSEMBLE (jamais de largeurs ad hoc). Mise en page seule. */
.svv-int-filtres{grid-template-columns:repeat(5,minmax(0,1fr))}
@media (max-width:1000px){ .svv-int-filtres{grid-template-columns:repeat(3,minmax(0,1fr))} }
@media (max-width:640px){ .svv-int-filtres{grid-template-columns:repeat(2,minmax(0,1fr))} }
@media (max-width:420px){ .svv-int-filtres{grid-template-columns:1fr} }
@media (prefers-reduced-motion: reduce){ .svv-int *{transition:none!important;animation:none!important} }
`;

interface Ligne {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  telephone: string | null;
  cree_a: string;
  verdict: string | null;
  score: number | null;
  commune_insee: string | null;
  dernier_etage: boolean | null;
  residence_principale: boolean | null;
  consenti_le: string | null;
}

interface Detail {
  internaute: Record<string, unknown>;
  projets: Record<string, unknown>[];
  consentements: { finalite: string; libelle: string; etat: string | null; actif: boolean | null; depuis: string | null }[];
}

const champ: CSSProperties = {
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid var(--color-svv-line)',
  background: '#fff',
  color: 'var(--color-svv-ink)',
  fontSize: '.85rem',
  width: '100%',
};
const btnRouge: CSSProperties = { padding: '0 14px', borderRadius: 10, border: 0, background: 'var(--color-svv-red)', color: '#fff', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' };
const btnOutline: CSSProperties = { padding: '0 14px', borderRadius: 10, border: '1px solid var(--color-svv-line)', background: '#fff', color: 'var(--color-svv-ink)', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' };

/** Référence géo d'une commune présente en base F1 (endpoint /communes, DYNAMIQUE). */
type CommuneRef = { insee: string; nom: string; dept: string; deptNom: string };

type Filtres = {
  communes: string[]; // ensemble d'INSEE sélectionnés (filtre géo AND `IN` ; vide = toutes)
  scoreMin: string;
  scoreMax: string;
  dernierEtage: '' | 'true' | 'false';
  residencePrincipale: '' | 'true' | 'false';
  verdict: string;
  creeApres: string;
  creeAvant: string;
  // NB : les STATUTS de consentement (F1/F2/F3, intersection) sont un ÉTAT SÉPARÉ (`statuts`), pas un filtre `Filtres`.
};

const FILTRES_VIDES: Filtres = { communes: [], scoreMin: '', scoreMax: '', dernierEtage: '', residencePrincipale: '', verdict: '', creeApres: '', creeAvant: '' };

function versParams(f: Filtres): URLSearchParams {
  const p = new URLSearchParams();
  if (f.communes.length) p.set('communes', f.communes.join(',')); // liste EXPLICITE d'INSEE (AND `IN`, jamais un préfixe)
  if (f.scoreMin.trim()) p.set('scoreMin', f.scoreMin.trim());
  if (f.scoreMax.trim()) p.set('scoreMax', f.scoreMax.trim());
  if (f.dernierEtage) p.set('dernierEtage', f.dernierEtage);
  if (f.residencePrincipale) p.set('residencePrincipale', f.residencePrincipale);
  if (f.verdict) p.set('verdict', f.verdict);
  if (f.creeApres) p.set('creeApres', f.creeApres);
  if (f.creeAvant) p.set('creeAvant', f.creeAvant);
  return p;
}

const TAILLE = 25;

/** Résumé lisible de la sélection géo pour le déclencheur (ex. « Hauts-de-Seine (toutes) » ou « 2 départements · 5 communes »). */
function resumeGeo(selection: string[], ref: CommuneRef[]): string {
  if (selection.length === 0) return 'Toutes les communes';
  const set = new Set(selection);
  const parDept = new Map<string, { nom: string; total: number; sel: number }>();
  for (const c of ref) {
    const e = parDept.get(c.dept) ?? { nom: c.deptNom, total: 0, sel: 0 };
    e.total += 1;
    if (set.has(c.insee)) e.sel += 1;
    parDept.set(c.dept, e);
  }
  const touches = [...parDept.values()].filter((d) => d.sel > 0);
  if (touches.length === 1) {
    const d = touches[0];
    return d.sel === d.total ? `${d.nom} (toutes)` : `${d.nom} · ${d.sel} commune${d.sel > 1 ? 's' : ''}`;
  }
  if (touches.length === 0) return `${selection.length} commune${selection.length > 1 ? 's' : ''}`;
  return `${touches.length} départements · ${selection.length} communes`;
}

const normGeo = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Sélecteur géographique département→commune (OVERLAY, PRÉSENTATION). `communes` = référentiel DYNAMIQUE fetché à
 * chaud (aucune liste en dur). Ne fait AUCUNE requête ; applique une sélection CLIENT via `onValider` (le filtre géo
 * F1-only est appliqué côté serveur, `construireFiltres`). Overlay `position:absolute` → aucun reflow des champs dessous.
 * 2 étages : départements présents → communes des dpts choisis. Défaut (aucune commune cochée) = toutes les communes
 * des dpts sélectionnés (liste EXPLICITE). Fermeture clic-extérieur/Échap ; Valider applique + referme.
 */
function SelecteurGeo({ communes, selection, onValider }: {
  communes: CommuneRef[];
  selection: string[];
  onValider: (communes: string[]) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etage, setEtage] = useState<1 | 2>(1);
  const [deptSel, setDeptSel] = useState<string[]>([]);
  const [commSel, setCommSel] = useState<string[]>([]);
  const [rDept, setRDept] = useState('');
  const [rComm, setRComm] = useState('');
  const boite = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ouvert) return;
    const onDown = (e: MouseEvent) => { if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [ouvert]);

  // Départements distincts, DÉRIVÉS du référentiel dynamique (jamais codés en dur).
  const depts = Array.from(new Map(communes.map((c) => [c.dept, c.deptNom])).entries())
    .map(([dept, deptNom]) => ({ dept, deptNom }))
    .sort((a, b) => normGeo(a.deptNom).localeCompare(normGeo(b.deptNom))); // tri par LIBELLÉ (insensible casse/accents)

  const ouvrir = () => {
    const set = new Set(selection);
    setDeptSel(Array.from(new Set(communes.filter((c) => set.has(c.insee)).map((c) => c.dept))));
    setCommSel([...selection]);
    setEtage(1);
    setRDept('');
    setRComm('');
    setOuvert(true);
  };
  const bascule = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const deptsAffiches = rDept.trim() === '' ? depts : depts.filter((d) => normGeo(d.deptNom).includes(normGeo(rDept)) || d.dept.includes(rDept.trim()));
  // Tri par NOM de commune (insensible casse/accents ; `nom` retombe déjà sur l'INSEE côté serveur). AFFICHAGE seul :
  // ne change pas l'ENSEMBLE retenu par défaut (« toutes les communes des dpts »), seulement l'ordre.
  const commDesDepts = communes.filter((c) => deptSel.includes(c.dept)).sort((a, b) => normGeo(a.nom).localeCompare(normGeo(b.nom)));
  const commAffichees = rComm.trim() === '' ? commDesDepts : commDesDepts.filter((c) => normGeo(c.nom).includes(normGeo(rComm)) || c.insee.includes(rComm.trim()));

  const valider = () => {
    const inseeDesDepts = commDesDepts.map((c) => c.insee);
    const setDepts = new Set(inseeDesDepts);
    const choisies = commSel.filter((i) => setDepts.has(i)); // restreint aux dpts encore sélectionnés
    // Défaut : aucune commune cochée → TOUTES les communes des dpts sélectionnés (liste EXPLICITE). Aucun dpt → aucun filtre.
    const final = deptSel.length === 0 ? [] : choisies.length > 0 ? choisies : inseeDesDepts;
    onValider(final);
    setOuvert(false);
  };

  const styleCase = (actif: boolean): CSSProperties => ({
    width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
    padding: '4px 8px', borderRadius: 8, cursor: 'pointer', fontSize: '.85rem', color: 'var(--color-svv-ink)',
    border: `1px solid ${actif ? 'var(--color-svv-red)' : 'transparent'}`, background: actif ? 'var(--color-svv-field)' : 'transparent',
  });
  const coche = (actif: boolean) => (
    <span aria-hidden style={{ flex: '0 0 auto', width: 16, height: 16, borderRadius: 4, border: `1px solid ${actif ? 'var(--color-svv-red)' : 'var(--color-svv-line)'}`, background: actif ? 'var(--color-svv-red)' : '#fff', color: '#fff', fontSize: 12, lineHeight: '14px', textAlign: 'center' }}>{actif ? '✓' : ''}</span>
  );

  return (
    <div ref={boite} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => (ouvert ? setOuvert(false) : ouvrir())}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        style={{ ...champ, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer', fontWeight: 600 }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resumeGeo(selection, communes)}</span>
        <span aria-hidden style={{ color: 'var(--color-svv-muted)' }}>{ouvert ? '▲' : '▼'}</span>
      </button>

      {ouvert && (
        <div
          role="dialog"
          aria-label="Sélection de la zone géographique"
          style={{
            position: 'absolute', zIndex: 40, top: 'calc(100% + 4px)', left: 0, minWidth: 260, width: 'max-content', maxWidth: 'min(360px, 90vw)',
            background: '#fff', border: '1px solid var(--color-svv-line)', borderRadius: 10, boxShadow: '0 6px 20px rgba(0,0,0,.18)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden', // la hauteur est gouvernée par la liste (≈5 lignes) + les sections fixes
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderBottom: '1px solid var(--color-svv-line)', fontSize: '.75rem', fontWeight: 700, color: 'var(--color-svv-muted)' }}>
            <span style={{ color: etage === 1 ? 'var(--color-svv-red)' : 'var(--color-svv-muted)' }}>1. Départements</span>
            <span aria-hidden>›</span>
            <span style={{ color: etage === 2 ? 'var(--color-svv-red)' : 'var(--color-svv-muted)' }}>2. Communes</span>
          </div>

          {etage === 1 ? (
            <>
              <div style={{ padding: 8, borderBottom: '1px solid var(--color-svv-line)' }}>
                <input type="search" value={rDept} onChange={(e) => setRDept(e.target.value)} placeholder="Rechercher un département…" aria-label="Rechercher un département" style={{ ...champ, width: '100%' }} />
              </div>
              <div role="listbox" aria-multiselectable="true" aria-label="Départements présents" style={{ maxHeight: 228, overflowY: 'auto', padding: 4 }}>
                {depts.length === 0 ? (
                  <span style={{ display: 'block', padding: '8px 6px', fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>Aucun département en base.</span>
                ) : deptsAffiches.length === 0 ? (
                  <span style={{ display: 'block', padding: '8px 6px', fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>Aucun département ne correspond.</span>
                ) : (
                  deptsAffiches.map((d) => {
                    const actif = deptSel.includes(d.dept);
                    return (
                      <button key={d.dept} type="button" role="option" aria-selected={actif} onClick={() => setDeptSel((s) => bascule(s, d.dept))} style={styleCase(actif)}>
                        {coche(actif)}<span>{d.deptNom} <span style={{ color: 'var(--color-svv-muted)' }}>({d.dept})</span></span>
                      </button>
                    );
                  })
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', padding: 8, borderTop: '1px solid var(--color-svv-line)' }}>
                <button type="button" onClick={() => setDeptSel([])} disabled={deptSel.length === 0} style={{ ...btnOutline, minHeight: 44, opacity: deptSel.length === 0 ? 0.5 : 1 }}>Aucun</button>
                <button type="button" onClick={() => setEtage(2)} disabled={deptSel.length === 0} style={{ ...btnRouge, minHeight: 44, opacity: deptSel.length === 0 ? 0.5 : 1 }}>Suivant : communes</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ padding: 8, borderBottom: '1px solid var(--color-svv-line)' }}>
                <input type="search" value={rComm} onChange={(e) => setRComm(e.target.value)} placeholder="Rechercher une commune…" aria-label="Rechercher une commune" style={{ ...champ, width: '100%' }} />
              </div>
              <p style={{ margin: 0, padding: '4px 10px', fontSize: '.72rem', color: 'var(--color-svv-muted)' }}>Aucune cochée → toutes les communes des départements choisis.</p>
              <div role="listbox" aria-multiselectable="true" aria-label="Communes des départements sélectionnés" style={{ maxHeight: 228, overflowY: 'auto', padding: 4 }}>
                {commAffichees.length === 0 ? (
                  <span style={{ display: 'block', padding: '8px 6px', fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>Aucune commune ne correspond.</span>
                ) : (
                  commAffichees.map((c) => {
                    const actif = commSel.includes(c.insee);
                    return (
                      <button key={c.insee} type="button" role="option" aria-selected={actif} onClick={() => setCommSel((s) => bascule(s, c.insee))} style={styleCase(actif)}>
                        {coche(actif)}<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nom} <span style={{ color: 'var(--color-svv-muted)' }}>({c.insee})</span></span>
                      </button>
                    );
                  })
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', padding: 8, borderTop: '1px solid var(--color-svv-line)' }}>
                <button type="button" onClick={() => setEtage(1)} style={{ ...btnOutline, minHeight: 44 }}>Retour</button>
                <button type="button" onClick={valider} style={{ ...btnRouge, minHeight: 44 }}>Valider</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function InternautesVue() {
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES);
  const [applique, setApplique] = useState<Filtres>(FILTRES_VIDES); // filtres réellement soumis
  // STATUTS de consentement cochés (multi-sélection ET). L'extraction renvoie l'INTERSECTION (tous cochés actifs).
  // Défaut = {F1} (vue « recontactables » au chargement). Appliqué immédiatement (re-fetch). Le serveur (`clauseStatuts`)
  // garantit l'étanchéité (EXISTS en AND, zéro OR) ET le fail-closed (sélection vide → 0 résultat, jamais toute la base).
  const [statuts, setStatuts] = useState<Set<CleFinalite>>(() => new Set([FINALITE_F1]));
  // MOTEUR DE RECHERCHE (LOT A-2). `statutsMiroir` = REFLET éditable de `statuts` (source de vérité), piloté À SENS
  // UNIQUE : la source ré-initialise le miroir (cf. toggleStatut), le miroir n'a AUCUNE remontée. La LISTE (vers le
  // bas) est pilotée par le miroir + `q` ; l'EXPORT (haut) reste piloté par la source `statuts`.
  const [statutsMiroir, setStatutsMiroir] = useState<Set<CleFinalite>>(() => new Set([FINALITE_F1]));
  const [q, setQ] = useState(''); //          saisie recherche nom/prénom (immédiate, liée à l'input)
  const [qDebounced, setQDebounced] = useState(''); // valeur débouncée (250 ms) réellement envoyée au serveur
  const [page, setPage] = useState(1);
  const [etat, setEtat] = useState<{ statut: 'chargement' } | { statut: 'aucun_statut' } | { statut: 'erreur'; code: number } | { statut: 'ok'; total: number; lignes: Ligne[] }>({ statut: 'chargement' });
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailChargement, setDetailChargement] = useState(false);
  // Actions cycle de vie (LOT 4) sur le dossier ouvert : rectification (édition A) et effacement (droit RGPD).
  const [detailId, setDetailId] = useState<string | null>(null);
  const [edition, setEdition] = useState(false);
  const [formEdit, setFormEdit] = useState({ prenom: '', nom: '', email: '', telephone: '' });
  const [confirmEffacement, setConfirmEffacement] = useState(false);
  const [actionEnCours, setActionEnCours] = useState(false);
  const [actionErreur, setActionErreur] = useState<string | null>(null);
  // Bornes de dates de la base (MIN/MAX cree_a, efface_a IS NULL — fournies par la route liste) pour « depuis toujours ».
  const [bornes, setBornes] = useState<{ min: string | null; max: string | null }>({ min: null, max: null });
  // Référence géo DYNAMIQUE (communes présentes chez les consentants F1) pour le sélecteur département→commune.
  // Fetchée UNE fois au montage depuis l'endpoint dédié (admin-only). Vide si aucune commune en base.
  const [communesRef, setCommunesRef] = useState<CommuneRef[]>([]);
  // Popover d'aide « i » (légende F1/F2/F3) : une seule ouverture à la fois, fermée au clic ailleurs / re-clic.
  const [infoOuvert, setInfoOuvert] = useState(false);
  // COMPTEUR LIVE : MÊMES critères que l'export CSV — SOURCE `statuts` + filtres secondaires, `q` ignoré. Suit `filtres`
  // ÉDITÉS (prévisualisation) → il COÏNCIDE avec « Exporter (CSV) » (qui lit `applique`) UNE FOIS « Filtrer » cliqué, pas
  // avant. `null` = indisponible (erreur réseau). Débouncé ; court-circuit à 0 si statuts vides (aucun appel serveur).
  const [compte, setCompte] = useState<number | null>(null);
  const [compteChargement, setCompteChargement] = useState(false);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/internautes/communes');
        if (annule || !res.ok) return;
        const data = await res.json();
        if (!annule && Array.isArray(data.communes)) setCommunesRef(data.communes as CommuneRef[]);
      } catch {
        /* best-effort : sans référentiel, le sélecteur géo affiche « aucun département » */
      }
    })();
    return () => { annule = true; };
  }, []);

  // DEBOUNCE 250 ms de la recherche `q` → `qDebounced` (valeur réellement envoyée). Reset page à 1 quand la recherche
  // effective change. `setState` dans le callback `setTimeout` (asynchrone) → pas de cascade synchrone d'effet.
  useEffect(() => {
    const t = setTimeout(() => { setQDebounced(q); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Fetch sur (filtres appliqués, page, STATUTS MIROIR, recherche débouncée). Patron admin : setState DANS l'IIFE async
  // + garde `annule` anti-course. Liste réservée administrateur côté serveur ; non-admin → 403 → état « erreur ».
  useEffect(() => {
    let annule = false;
    void (async () => {
      // GARDE-FOU CONFORT (le serveur reste l'autorité) : aucun statut MIROIR coché → on n'appelle PAS l'API (pas de
      // requête sans contrainte de finalité) et on affiche un message. Le serveur bloque aussi (fail-closed) si forgé.
      if (statutsMiroir.size === 0) {
        if (!annule) setEtat({ statut: 'aucun_statut' });
        return;
      }
      setEtat({ statut: 'chargement' });
      try {
        const p = versParams(applique);
        p.set('page', String(page));
        p.set('taille', String(TAILLE));
        p.set('statuts', [...statutsMiroir].join(',')); // intersection des statuts (miroir) ; étanchéité côté serveur
        const recherche = qDebounced.trim();
        if (recherche.length >= 2) p.set('q', recherche); // recherche serveur SEULEMENT à partir de 2 caractères
        const res = await fetch(`/api/admin/internautes?${p.toString()}`);
        if (annule) return;
        if (!res.ok) {
          setEtat({ statut: 'erreur', code: res.status });
          return;
        }
        const data = await res.json();
        if (annule) return;
        if (data.bornes && typeof data.bornes === 'object') setBornes({ min: data.bornes.min ?? null, max: data.bornes.max ?? null });
        setEtat({ statut: 'ok', total: Number(data.total) || 0, lignes: Array.isArray(data.lignes) ? data.lignes : [] });
      } catch {
        if (!annule) setEtat({ statut: 'erreur', code: 0 });
      }
    })();
    return () => {
      annule = true;
    };
  }, [applique, page, statutsMiroir, qDebounced]);

  // COMPTEUR LIVE : recompte à chaque changement de statuts SOURCE ou de filtres secondaires (live), débounce 300 ms.
  // OPTION 1 (Arno) : mêmes critères que l'export CSV — statuts SOURCE + `filtres` secondaires, `q` NON transmis (ignoré).
  // NB : le compteur suit `filtres` (live) et non `applique` → il ne coïncide avec « Exporter (CSV) » qu'après « Filtrer ».
  // FAIL-CLOSED : statuts vide → 0 SANS appel serveur (écho du court-circuit repo). TOUS les setState sont DIFFÉRÉS dans
  // le timer (jamais synchrones dans le corps de l'effet) ; garde `annule` anti-course. `versParams` n'ajoute jamais `q`.
  useEffect(() => {
    let annule = false;
    const t = setTimeout(async () => {
      if (statuts.size === 0) {
        if (!annule) { setCompte(0); setCompteChargement(false); }
        return;
      }
      if (!annule) setCompteChargement(true);
      try {
        const p = versParams(filtres);
        p.set('statuts', [...statuts].join(',')); // source ; le serveur re-normalise (ordre indifférent)
        const res = await fetch(`/api/admin/internautes/compte?${p.toString()}`);
        if (annule) return;
        if (!res.ok) { setCompte(null); return; }
        const data = await res.json();
        if (!annule) setCompte(Number(data.total) || 0);
      } catch {
        if (!annule) setCompte(null);
      } finally {
        if (!annule) setCompteChargement(false);
      }
    }, 300);
    return () => { annule = true; clearTimeout(t); };
  }, [filtres, statuts]);

  const filtrer = () => {
    setPage(1);
    setApplique(filtres);
  };
  const reinitialiser = () => {
    setFiltres(FILTRES_VIDES);
    setPage(1);
    setApplique(FILTRES_VIDES);
  };
  // Coche/décoche un statut du bloc SOURCE. SENS UNIQUE (source → miroir) : toute action sur la source RÉINITIALISE
  // le miroir SUR la nouvelle source ET vide la recherche → l'affichage revient « piloté par le haut ». On calcule
  // `next` UNE fois et on l'applique à la source ET au miroir (garantie qu'ils sont synchronisés après le toggle).
  const toggleStatut = (s: CleFinalite) => {
    const next = new Set(statuts);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setStatuts(next);
    setStatutsMiroir(new Set(next)); // re-sync du miroir sur la source
    setQ('');
    setQDebounced('');
    setPage(1);
  };
  // Coche/décoche un statut MIROIR (pilote la LISTE, vers le bas SEULEMENT — AUCUNE remontée vers `statuts`).
  const toggleMiroir = (s: CleFinalite) => {
    setStatutsMiroir((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
    setPage(1);
  };
  const aucunStatut = statuts.size === 0; // garde des boutons d'EXPORT (bloc source ; la LISTE, elle, teste `statutsMiroir`)
  // Statuts cochés SOURCE (ordre canonique) : param `statuts` de l'export + libellé. Le serveur re-normalise.
  const statutsCoches = STATUTS_EXPORT.filter((s) => statuts.has(s.statut));
  const codesCoches = statutsCoches.map((s) => s.code).join(' ∩ ');
  // Statuts MIROIR cochés (ordre canonique) : libellé du compteur de la liste (reflète la sélection réellement listée).
  const codesMiroir = STATUTS_EXPORT.filter((s) => statutsMiroir.has(s.statut)).map((s) => s.code).join(' ∩ ');
  // URL d'export CSV : les statuts cochés accompagnent les filtres (`f` = filtres appliqués OU FILTRES_VIDES pour « toute
  // la base »). Toujours borné par les statuts ; validé/normalisé côté serveur par `lireStatuts`.
  const hrefExport = (f: Filtres) => {
    const p = versParams(f);
    p.set('statuts', statutsCoches.map((s) => s.statut).join(','));
    return `/api/admin/internautes/export?${p.toString()}`;
  };

  const rechargerListe = () => setApplique((a) => ({ ...a })); // nouvelle référence → relance l'effet de fetch

  const ouvrirDetail = async (id: string) => {
    setDetailId(id);
    setEdition(false);
    setConfirmEffacement(false);
    setActionErreur(null);
    setDetailChargement(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/admin/internautes/${id}`);
      if (res.ok) {
        const d: Detail = await res.json();
        setDetail(d);
        setFormEdit({
          prenom: String(d.internaute.prenom ?? ''),
          nom: String(d.internaute.nom ?? ''),
          email: String(d.internaute.email ?? ''),
          telephone: String(d.internaute.telephone ?? ''),
        });
      }
    } finally {
      setDetailChargement(false);
    }
  };

  // Ferme le dossier ouvert (toggle « Voir » / bouton « Fermer ») et remet à zéro les sous-états d'action.
  const fermerDetail = () => {
    setDetailId(null);
    setDetail(null);
    setEdition(false);
    setConfirmEffacement(false);
    setActionErreur(null);
  };

  const soumettreRectification = async () => {
    if (!detailId) return;
    setActionEnCours(true);
    setActionErreur(null);
    try {
      const res = await fetch(`/api/admin/internautes/${detailId}/rectification`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prenom: formEdit.prenom.trim(),
          nom: formEdit.nom.trim(),
          email: formEdit.email.trim(),
          telephone: formEdit.telephone.trim() || null,
        }),
      });
      if (!res.ok) {
        setActionErreur(res.status === 409 ? 'Email déjà utilisé par un autre internaute.' : 'Rectification impossible.');
        return;
      }
      setEdition(false);
      rechargerListe();
      await ouvrirDetail(detailId);
    } finally {
      setActionEnCours(false);
    }
  };

  const soumettreEffacement = async () => {
    if (!detailId) return;
    setActionEnCours(true);
    setActionErreur(null);
    try {
      const res = await fetch(`/api/admin/internautes/${detailId}/effacement`, { method: 'POST' });
      if (!res.ok) {
        setActionErreur('Effacement impossible.');
        return;
      }
      setDetail(null);
      setDetailId(null); // referme COMPLÈTEMENT le dossier effacé (cohérent avec `fermerDetail`) → le cap de scroll (LOT A-2) se rétablit
      setConfirmEffacement(false);
      rechargerListe();
    } finally {
      setActionEnCours(false);
    }
  };

  const total = etat.statut === 'ok' ? etat.total : 0;
  const nbPages = Math.max(1, Math.ceil(total / TAILLE));

  // Dossier détail — rendu INLINE sous la ligne ouverte (une seule ouverte à la fois, `detailId`). Défini ici pour
  // rester lisible ; le .map insère `{detailId === l.id && detailPanel}` juste après la ligne concernée.
  // paddingTop resserré (14→8) + marge basse de la rangée « Fermer » réduite (8→2) : moins de vide au-dessus du nom,
  // sans retirer le bouton Fermer (cible tactile 44px conservée). Harmonise avec le panneau Vérification (padding 12).
  const detailPanel = (detailChargement || detail) ? (
    <div className="svv-card" style={{ border: '1px solid var(--color-svv-red)', marginTop: 8, paddingTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <button type="button" style={{ ...btnOutline, marginLeft: 'auto' }} onClick={fermerDetail}>Fermer</button>
      </div>
      {detailChargement && <div style={{ color: 'var(--color-svv-muted)' }}>Chargement…</div>}
      {detail && (
        <FicheDetail
          key={detailId ?? undefined} /* remonte à zéro les dépliages « Voir » (Set local) au changement d'internaute */
          detail={detail}
          actionsProjet={(p) => <BoutonTestProjet projet={p} />}
          actions={
            // Actions cycle de vie (LOT 4) — bloc HAUT uniquement (le bloc Vérification OMET cette prop → lecture seule).
            // Un profil déjà effacé n'a plus d'actions (la note d'effacement est portée par FicheDetail).
            detail.internaute.efface_a ? undefined : (
              <div style={{ borderTop: '1px solid var(--color-svv-line)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!edition && !confirmEffacement && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" style={btnOutline} onClick={() => { setEdition(true); setActionErreur(null); }}>Rectifier</button>
                    <button type="button" style={{ ...btnOutline, color: 'var(--color-svv-red)', borderColor: 'var(--color-svv-red)' }} onClick={() => { setConfirmEffacement(true); setActionErreur(null); }}>
                      Effacer (droit à l’effacement)
                    </button>
                  </div>
                )}
                {edition && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input style={champ} value={formEdit.prenom} onChange={(e) => setFormEdit({ ...formEdit, prenom: e.target.value })} placeholder="Prénom" />
                    <input style={champ} value={formEdit.nom} onChange={(e) => setFormEdit({ ...formEdit, nom: e.target.value })} placeholder="Nom" />
                    <input style={champ} value={formEdit.email} onChange={(e) => setFormEdit({ ...formEdit, email: e.target.value })} placeholder="Email" inputMode="email" />
                    <input style={champ} value={formEdit.telephone} onChange={(e) => setFormEdit({ ...formEdit, telephone: e.target.value })} placeholder="Téléphone (optionnel)" />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" style={btnRouge} disabled={actionEnCours} onClick={soumettreRectification}>Enregistrer</button>
                      <button type="button" style={btnOutline} disabled={actionEnCours} onClick={() => setEdition(false)}>Annuler</button>
                    </div>
                  </div>
                )}
                {confirmEffacement && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ color: 'var(--color-svv-ink)' }}>Anonymiser l’identité et supprimer les analyses ? La preuve de consentement est conservée. Action irréversible.</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" style={btnRouge} disabled={actionEnCours} onClick={soumettreEffacement}>Confirmer l’effacement</button>
                      <button type="button" style={btnOutline} disabled={actionEnCours} onClick={() => setConfirmEffacement(false)}>Annuler</button>
                    </div>
                  </div>
                )}
                {actionErreur && <span style={{ color: 'var(--color-svv-red)', fontSize: '.8rem' }}>{actionErreur}</span>}
              </div>
            )
          }
        />
      )}
    </div>
  ) : null;

  return (
    <div className="svv-int" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{CSS}</style>

      {/* SÉLECTION DES STATUTS (multi-sélection en ET) : l'admin coche F1/F2/F3 ; l'extraction renvoie l'INTERSECTION
          (tous les cochés actifs). Charte : rouge plein = coché, gris contour = décoché ; ≥44px ; focus rouge (.svv-int). */}
      <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--color-svv-field)' }}>
        <span style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--color-svv-muted)' }}>Statuts de consentement (intersection — tous les cochés)</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div role="group" aria-label="Statuts de consentement" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {STATUTS_EXPORT.map((s) => {
              const coche = statuts.has(s.statut);
              return (
                <button
                  key={s.statut}
                  type="button"
                  aria-pressed={coche}
                  onClick={() => toggleStatut(s.statut)}
                  style={{
                    minHeight: 44,
                    padding: '0 14px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '.85rem',
                    border: `1px solid ${coche ? 'var(--color-svv-red)' : 'var(--color-svv-line)'}`,
                    background: coche ? 'var(--color-svv-red)' : '#fff',
                    color: coche ? '#fff' : 'var(--color-svv-ink)',
                  }}
                >
                  {s.libelle}
                </button>
              );
            })}
          </div>
          {/* Picto info « i » DÉPLACÉ ici, à DROITE du toggle F3. Popover = légende multi-statuts. Ferme au clic ailleurs / re-clic. */}
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <button
              type="button"
              aria-label="Aide : signification de F1, F2 et F3"
              aria-expanded={infoOuvert}
              onClick={() => setInfoOuvert((o) => !o)}
              style={{
                minWidth: 44,
                width: 44,
                height: 44,
                borderRadius: 999,
                border: `1px solid ${infoOuvert ? 'var(--color-svv-red)' : 'var(--color-svv-line)'}`,
                background: '#fff',
                color: infoOuvert ? 'var(--color-svv-red)' : 'var(--color-svv-ink)',
                fontWeight: 800,
                fontStyle: 'italic',
                fontSize: '1rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              i
            </button>
            {infoOuvert && (
              <>
                {/* Voile plein écran transparent SOUS le popover : un clic « ailleurs » ferme (mobile + desktop). */}
                <div aria-hidden onClick={() => setInfoOuvert(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div
                  role="dialog"
                  aria-label="Légende F1 / F2 / F3"
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 8px)', // s'ouvre AU-DESSUS du « i » (pas de coupe vers le bas)
                    right: 0, //                   ancré à droite → s'étend vers la GAUCHE, jamais hors du bord droit
                    zIndex: 41,
                    width: 'max-content',
                    maxWidth: 'min(320px, calc(100vw - 32px))',
                    background: 'var(--color-svv-field)',
                    color: 'var(--color-svv-ink)',
                    border: '1px solid var(--color-svv-line)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    fontSize: '.78rem',
                    lineHeight: 1.4,
                    fontWeight: 500,
                    boxShadow: '0 4px 14px rgba(0,0,0,.14)',
                  }}
                >
                  <strong>F1</strong> recontact commercial interne (appel téléphonique), <strong>F2</strong> communications
                  par email, <strong>F3</strong> ciblage publicitaire tiers (retargeting).{' '}
                  Cochez un ou plusieurs statuts : l’extraction renvoie l’<strong>intersection</strong> (les internautes
                  ayant <strong>TOUS</strong> les statuts cochés actifs) — jamais un OR. Aucun statut coché → export bloqué.
                </div>
              </>
            )}
          </div>
        </div>
        {aucunStatut ? (
          <span role="alert" style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--color-svv-red)' }}>
            Cochez au moins un statut pour lister ou exporter.
          </span>
        ) : (
          <span style={{ fontSize: '.7rem', color: 'var(--color-svv-muted)' }}>
            L’extraction renvoie les internautes ayant TOUS les statuts cochés actifs (intersection ET).
          </span>
        )}
      </div>

      {/* FILTRES — grille COMMUNE (colonnes via .svv-int-filtres) : les 2 rangées partagent les mêmes colonnes,
          alignées verticalement, bas des contrôles alignés (align-items:end). */}
      <div className="svv-card svv-int-filtres" style={{ display: 'grid', gap: 10, alignItems: 'start', background: 'var(--color-svv-field)' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.75rem', fontWeight: 700, color: 'var(--color-svv-muted)' }}>
          Zone géographique
          {/* Sélecteur département→commune en OVERLAY (position:absolute) → aucun reflow des champs dessous. */}
          <SelecteurGeo communes={communesRef} selection={filtres.communes} onValider={(communes) => setFiltres((f) => ({ ...f, communes }))} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.75rem', fontWeight: 700, color: 'var(--color-svv-muted)' }}>
          Score min
          <input style={champ} value={filtres.scoreMin} onChange={(e) => setFiltres({ ...filtres, scoreMin: e.target.value })} inputMode="decimal" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.75rem', fontWeight: 700, color: 'var(--color-svv-muted)' }}>
          Score max
          <input style={champ} value={filtres.scoreMax} onChange={(e) => setFiltres({ ...filtres, scoreMax: e.target.value })} inputMode="decimal" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.75rem', fontWeight: 700, color: 'var(--color-svv-muted)' }}>
          Verdict
          <select style={champ} value={filtres.verdict} onChange={(e) => setFiltres({ ...filtres, verdict: e.target.value })}>
            <option value="">Indifférent</option>
            <option value="SANS_VIS_A_VIS">Sans vis-à-vis</option>
            <option value="VIS_A_VIS">Vis-à-vis</option>
            <option value="INDETERMINE">Indéterminé</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.75rem', fontWeight: 700, color: 'var(--color-svv-muted)' }}>
          Dernier étage
          <select style={champ} value={filtres.dernierEtage} onChange={(e) => setFiltres({ ...filtres, dernierEtage: e.target.value as Filtres['dernierEtage'] })}>
            <option value="">Indifférent</option>
            <option value="true">Oui</option>
            <option value="false">Non</option>
          </select>
        </label>
        {/* MISE EN PAGE (logique inchangée) : 2e rangée = cellules DIRECTES de la grille commune → mêmes colonnes,
            alignées verticalement (Résidence sous Commune, Créé après sous Score min, …). `align-items:start` du
            conteneur colle la rangée JUSTE sous la 1re (pas de blanc) ; Consentement F2/F3 = dernière colonne
            (au-dessus d'« Exporter toute la base »). */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.75rem', fontWeight: 700, color: 'var(--color-svv-muted)' }}>
          Résidence principale
          <select style={champ} value={filtres.residencePrincipale} onChange={(e) => setFiltres({ ...filtres, residencePrincipale: e.target.value as Filtres['residencePrincipale'] })}>
            <option value="">Indifférent</option>
            <option value="true">Oui</option>
            <option value="false">Non</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.75rem', fontWeight: 700, color: 'var(--color-svv-muted)' }}>
          Créé après
          <input type="date" style={champ} value={filtres.creeApres} onChange={(e) => setFiltres({ ...filtres, creeApres: e.target.value })} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.75rem', fontWeight: 700, color: 'var(--color-svv-muted)' }}>
          Créé avant
          <input type="date" style={champ} value={filtres.creeAvant} onChange={(e) => setFiltres({ ...filtres, creeAvant: e.target.value })} />
        </label>
        {/* « Depuis toujours » : remplit les 2 dates avec les bornes RÉELLES de la base (MIN/MAX cree_a, efface_a IS NULL).
            Spacer (hauteur d'un libellé) → le bouton s'aligne sur le bas des inputs date malgré l'absence de libellé. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span aria-hidden style={{ fontSize: '.75rem', fontWeight: 700, userSelect: 'none' }}>&nbsp;</span>
          <button
            type="button"
            style={{ ...btnOutline, minHeight: 44 }}
            disabled={!bornes.min || !bornes.max}
            title={bornes.min && bornes.max ? `Du ${bornes.min} au ${bornes.max}` : 'Base vide'}
            onClick={() => setFiltres({ ...filtres, creeApres: bornes.min ?? '', creeAvant: bornes.max ?? '' })}
          >
            Depuis toujours
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', gridColumn: '1 / -1', flexWrap: 'wrap' }}>
          <button type="button" style={btnRouge} onClick={filtrer}>Filtrer</button>
          <button type="button" style={btnOutline} onClick={reinitialiser}>Réinitialiser</button>
          {/* COMPTEUR LIVE (== export CSV) CENTRÉ : `margin:'0 auto'` absorbe l'espace libre des DEUX côtés → centré entre
              « Réinitialiser » (gauche) et les exports (droite). aria-live pour annoncer la mise à jour. Statuts vide →
              0 (fail-closed) ; sinon « Comptage… » pendant le fetch, puis le nombre (ou « — » si réseau indisponible). */}
          <div
            aria-live="polite"
            style={{ margin: '0 auto', display: 'inline-flex', alignItems: 'center', fontSize: '.85rem', fontWeight: 700, color: 'var(--color-svv-ink)' }}
          >
            {aucunStatut ? (
              <span style={{ color: 'var(--color-svv-muted)' }}>0 internaute extractible</span>
            ) : compteChargement ? (
              <span style={{ color: 'var(--color-svv-muted)' }}>Comptage…</span>
            ) : compte == null ? (
              <span style={{ color: 'var(--color-svv-muted)' }}>—</span>
            ) : (
              <span>{compte} internaute{compte > 1 ? 's' : ''} extractible{compte > 1 ? 's' : ''}</span>
            )}
          </div>
          {/* Exports DÉSACTIVÉS si aucun statut coché (garde CONFORT ; le serveur reste fail-closed via `lireStatuts`).
              « Exporter (CSV) » = statuts cochés + filtres appliqués ; « Exporter toute la base » = statuts SEULS (filtres
              vides) — mais TOUJOURS borné par les statuts. Le centrage du compteur (margin:auto) pousse déjà les exports
              à droite. Un `<a>` sans href n'est ni cliquable ni focusable → désactivation sûre. */}
          <a
            style={{ ...btnOutline, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', ...(aucunStatut ? { opacity: 0.5, pointerEvents: 'none' } : {}) }}
            aria-disabled={aucunStatut}
            href={aucunStatut ? undefined : hrefExport(applique)}
          >
            Exporter (CSV)
          </a>
          <a
            style={{ ...btnRouge, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', ...(aucunStatut ? { opacity: 0.5, pointerEvents: 'none' } : {}) }}
            aria-disabled={aucunStatut}
            href={aucunStatut ? undefined : hrefExport(FILTRES_VIDES)}
            title={aucunStatut ? 'Cochez au moins un statut' : `Exporter tous les consentants ${codesCoches} actifs, sans appliquer les filtres`}
          >
            Exporter toute la base
          </a>
        </div>
      </div>

      {/* MOTEUR DE RECHERCHE (LOT A-2) — boutons F MIROIR (reflet À SENS UNIQUE de la sélection source ; CLIQUABLES,
          pilotent la LISTE ci-dessous ; aucune remontée vers la source) + champ recherche nom/prénom (serveur,
          debounce 250 ms, ≥2 car, insensible aux accents). Charte : liseré ROUGE = actif / GRIS = inactif, fond blanc. */}
      <div style={{ border: '1px solid var(--color-svv-line)', borderRadius: 12, padding: 12, background: '#fff', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div role="group" aria-label="Statuts filtrant la liste (miroir)" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STATUTS_EXPORT.map((s) => {
            const actif = statutsMiroir.has(s.statut);
            return (
              <button
                key={s.statut}
                type="button"
                aria-pressed={actif}
                onClick={() => toggleMiroir(s.statut)}
                style={{
                  minHeight: 44,
                  padding: '0 14px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '.85rem',
                  border: `2px solid ${actif ? 'var(--color-svv-red)' : 'var(--color-svv-line)'}`, // liseré rouge (actif) / gris (inactif)
                  background: '#fff', //                                                             fond blanc, aucune trame
                  color: actif ? 'var(--color-svv-red)' : 'var(--color-svv-ink)',
                }}
              >
                {s.libelle}
              </button>
            );
          })}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher par nom ou prénom"
          aria-label="Rechercher par nom ou prénom"
          style={{ ...champ, minHeight: 44 }}
        />
      </div>

      {/* RÉSULTATS */}
      {etat.statut === 'aucun_statut' && (
        <div className="svv-card" style={{ textAlign: 'center', color: 'var(--color-svv-muted)' }}>
          Cochez au moins un statut de consentement (F1, F2 ou F3) pour lister ou exporter des profils.
        </div>
      )}
      {etat.statut === 'chargement' && <div className="svv-card" style={{ textAlign: 'center', color: 'var(--color-svv-muted)' }}>Chargement…</div>}
      {etat.statut === 'erreur' && (
        <div className="svv-card" style={{ textAlign: 'center', color: 'var(--color-svv-red)' }}>
          {etat.code === 403
            ? 'Accès refusé (réservé au rôle administrateur).'
            : 'Service indisponible. La base internaute n’est peut-être pas encore initialisée — appliquez les migrations 023 à 025.'}
        </div>
      )}
      {etat.statut === 'ok' && (
        <>
          <div style={{ fontSize: '.85rem', color: 'var(--color-svv-muted)' }}>
            {total} profil{total > 1 ? 's' : ''} — statuts {codesMiroir}{qDebounced.trim().length >= 2 ? ` · recherche « ${qDebounced.trim()} »` : ''}.
          </div>
          {etat.lignes.length === 0 ? (
            <div className="svv-card" style={{ textAlign: 'center', color: 'var(--color-svv-muted)' }}>Aucun profil pour ces critères.</div>
          ) : (
            // SCROLL (LOT A-2) : la liste plafonne à ~6 lignes visibles + scroll interne (le bloc ne grandit pas).
            // Cap levé quand un dossier est ouvert (`detailId`) pour ne pas comprimer la fiche détail dans le scroll.
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...(detailId ? {} : { maxHeight: 460, overflowY: 'auto' }) }}>
              {etat.lignes.map((l) => {
                const ouvert = detailId === l.id;
                return (
                  <div key={l.id}>
                    <div className="svv-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                      <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                        <div style={{ fontWeight: 800, color: 'var(--color-svv-ink)' }}>{[l.prenom, l.nom].filter(Boolean).join(' ') || '—'}</div>
                        <div style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)', wordBreak: 'break-word' }}>{l.email ?? '—'}{l.telephone ? ` · ${l.telephone}` : ''}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '.78rem', color: 'var(--color-svv-ink)' }}>
                        <span>{l.commune_insee ?? '—'}</span>
                        <span>{l.verdict === 'SANS_VIS_A_VIS' ? 'Sans V-à-V' : l.verdict === 'VIS_A_VIS' ? 'Vis-à-vis' : l.verdict === 'INDETERMINE' ? 'Indéterminé' : '—'}</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{l.score != null ? l.score.toFixed(1) : '—'}</span>
                      </div>
                      {/* Toggle 1 clic : ouvre la ligne fermée, ferme la ligne déjà ouverte. Ouvrir une AUTRE ligne remplace (une seule à la fois). */}
                      <button type="button" style={ouvert ? btnRouge : btnOutline} aria-expanded={ouvert} onClick={() => (ouvert ? fermerDetail() : ouvrirDetail(l.id))}>{ouvert ? 'Fermer' : 'Voir'}</button>
                    </div>
                    {ouvert && detailPanel}
                  </div>
                );
              })}
            </div>
          )}
          {/* Pagination */}
          {nbPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <button type="button" style={btnOutline} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Précédent</button>
              <span style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>Page {page} / {nbPages}</span>
              <button type="button" style={btnOutline} disabled={page >= nbPages} onClick={() => setPage((p) => Math.min(nbPages, p + 1))}>Suivant</button>
            </div>
          )}
        </>
      )}

      {/* Détail rendu inline sous la ligne ouverte (voir detailPanel + le .map ci-dessus). */}

      {/* ═══ PANNEAU DE VÉRIFICATION (contrôle technique, consultation SEULE) — SOUS le moteur d'extraction commercial. ═══ */}
      <PanneauVerification />
    </div>
  );
}

type LigneRecent = {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  cree_a: string;
  efface_a: string | null;
  f1_actif: boolean;
};

const dateFr = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString('fr-FR') : '—');

/** Date + heure en fuseau Europe/Paris, format « JJ/MM/AAAA à HHhMM ». */
const dateHeureFr = (v: unknown) => {
  if (!v) return '—';
  const d = new Date(String(v));
  const jour = d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  const heure = d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  return `${jour} à ${heure.replace(':', 'h')}`;
};

/** Verdict lisible (affichage). */
const verdictFr = (v: unknown) =>
  v === 'SANS_VIS_A_VIS' ? 'Sans vis-à-vis' : v === 'VIS_A_VIS' ? 'Vis-à-vis' : v === 'INDETERMINE' ? 'Indéterminé' : '—';

/** Libellés FR des clés du payload de projet (tunnel). Une clé inconnue est affichée telle quelle → rien n'est masqué. */
const LABEL_PAYLOAD: Record<string, string> = {
  typeBien: 'Type de bien',
  surface: 'Surface (m²)',
  nbPieces: 'Nombre de pièces',
  epoque: 'Époque de construction',
  balcon: 'Balcon',
  terrasse: 'Terrasse',
  jardin: 'Jardin',
  adresseResidence: 'Adresse de résidence principale',
};
const labelPayload = (k: string) => LABEL_PAYLOAD[k] ?? k;

/** Ligne label/valeur générique (lecture seule). Booléen → Oui/Non ; vide/nul → « — ». */
function Champ({ label, valeur }: { label: string; valeur: unknown }) {
  const txt =
    valeur === null || valeur === undefined || valeur === ''
      ? '—'
      : typeof valeur === 'boolean'
        ? valeur ? 'Oui' : 'Non'
        : String(valeur);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ color: 'var(--color-svv-muted)' }}>{label}</span>
      <span style={{ color: 'var(--color-svv-ink)', textAlign: 'right', wordBreak: 'break-word' }}>{txt}</span>
    </div>
  );
}

/**
 * Dépliage « Voir » d'une analyse : réaffiche l'INTÉGRALITÉ des données de `p` (bien + grandeurs de visée + résultat),
 * reconstituées depuis l'objet déjà chargé (AUCUNE requête). Rendu identique à l'ancien affichage (avant lignes
 * compactes du LOT B3) : groupes « Le bien » et « Verdict et score », labels FR, valeurs formatées, rien masqué.
 * Numeric pg (`score`/`azimut`/hauteurs) = chaîne → `Number()` à l'AFFICHAGE (valeur stockée brute inchangée) ;
 * lat/lon en précision complète (jamais arrondis). Fond distinct (`svv-field`) pour lire le panneau comme « déplié ».
 */
function DetailAnalyse({ p }: { p: Record<string, unknown> }) {
  const payload = (p.payload && typeof p.payload === 'object' ? p.payload : {}) as Record<string, unknown>;
  const rpOui = p.residence_principale === true;
  const adresseRp = payload.adresseResidence;
  const norm = p.adresse_normalisee == null ? '' : String(p.adresse_normalisee);
  const saisie = p.adresse_saisie == null ? '' : String(p.adresse_saisie);
  const saisieDifferente = saisie.trim() !== '' && saisie !== norm;
  const CLES_BIEN = new Set(['typeBien', 'surface', 'nbPieces', 'epoque', 'balcon', 'terrasse', 'jardin', 'adresseResidence']);
  const autres = Object.entries(payload).filter(([k]) => !CLES_BIEN.has(k));
  const groupe: CSSProperties = { fontWeight: 800, color: 'var(--color-svv-ink)', fontSize: '.78rem', marginTop: 8 };
  return (
    <div style={{ border: '1px solid var(--color-svv-line)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.85rem', background: 'var(--color-svv-field)' }}>
      <div style={{ fontSize: '.72rem', color: 'var(--color-svv-muted)' }}>Analyse du {dateHeureFr(p.cree_a)} (tunnel v{String(p.version_tunnel ?? '—')})</div>

      {/* GROUPE 1 — LE BIEN */}
      <div style={groupe}>Le bien</div>
      <Champ label="Adresse du bien" valeur={norm || '—'} />
      {saisieDifferente && <Champ label="Adresse saisie" valeur={saisie} />}
      <Champ label="Type de bien" valeur={payload.typeBien} />
      <Champ label="Surface (m²)" valeur={payload.surface} />
      <Champ label="Nombre de pièces" valeur={payload.nbPieces} />
      <Champ label="Étage" valeur={p.etage} />
      <Champ label="Dernier étage" valeur={p.dernier_etage} />
      <Champ label="Époque de construction" valeur={payload.epoque} />
      <Champ label="Balcon" valeur={payload.balcon} />
      <Champ label="Terrasse" valeur={payload.terrasse} />
      <Champ label="Jardin" valeur={payload.jardin} />
      <Champ label="Résidence principale" valeur={p.residence_principale} />
      {rpOui ? (
        <Champ label="Adresse de résidence" valeur="Le bien analysé est la résidence principale" />
      ) : adresseRp != null && String(adresseRp).trim() !== '' ? (
        <Champ label="Adresse de résidence principale" valeur={adresseRp} />
      ) : null}
      {autres.map(([k, v]) => (
        <Champ key={k} label={labelPayload(k)} valeur={v} />
      ))}

      {/* GROUPE 2 — VERDICT & SCORE (résultat + déterminants géométriques présents). */}
      <div style={groupe}>Verdict et score</div>
      <Champ label="Verdict" valeur={verdictFr(p.verdict)} />
      <Champ label="Score /100" valeur={p.score == null ? null : Number(p.score).toFixed(2)} />
      <Champ label="Point d’origine — latitude" valeur={p.lat} />
      <Champ label="Point d’origine — longitude" valeur={p.lon} />
      <Champ label="Commune (INSEE)" valeur={p.commune_insee} />
      {/* Grandeurs de visée (migration 026). Dossiers ANCIENS = colonnes NULL → « — ». numeric pg → Number() à l'affichage
          (valeur stockée brute inchangée) ; lat/lon en précision complète (jamais arrondis). */}
      <Champ label="Azimut de l’axe" valeur={p.azimut_deg == null ? null : `${Number(p.azimut_deg).toFixed(2)}°`} />
      <Champ label="Hauteur sous plafond" valeur={p.hauteur_sous_plafond_m == null ? null : `${Number(p.hauteur_sous_plafond_m).toFixed(2)} m`} />
      <Champ label="Hauteur de vision" valeur={p.hauteur_vision_m == null ? null : `${Number(p.hauteur_vision_m).toFixed(2)} m`} />
    </div>
  );
}

/**
 * Bouton « Tester dans le banc » (LOT B) rendu PAR ANALYSE. Transporte les grandeurs géométriques de CE projet
 * vers le Banc de test M5 SANS ressaisie et SANS jamais mettre la position dans l'URL : dépôt en sessionStorage
 * (clé dédiée) puis navigation. Désactivé proprement si l'analyse n'est pas rejouable (axe non capturé, dossier
 * pré-026) → `projetVersSaisieBanc` renvoie null, aucun appel banc, aucun 400.
 */
function BoutonTestProjet({ projet }: { projet: Record<string, unknown> }) {
  const saisie = projetVersSaisieBanc(projet);
  const rejouable = saisie !== null;
  return (
    <button
      type="button"
      disabled={!rejouable}
      aria-disabled={!rejouable}
      title={rejouable ? 'Rejouer cette analyse dans le banc de test (nouvel onglet)' : 'Analyse antérieure à la capture de l’axe (azimut non enregistré) — non rejouable'}
      onClick={() => {
        if (!saisie) return; // garde défensive (le bouton est déjà `disabled` dans ce cas)
        ecrireHandoffBanc(saisie); // transport hors URL (localStorage jetable) : aucune position en historique/logs
        window.open('/admin/banc-test', '_blank', 'noopener'); // NOUVEL onglet ; geste utilisateur → pas de blocage popup
      }}
      style={{ ...btnOutline, minHeight: 44, opacity: rejouable ? 1 : 0.5, cursor: rejouable ? 'pointer' : 'default' }}
    >
      Tester
    </button>
  );
}

/**
 * Fiche détail PARTAGÉE (UNIQUE) — utilisée aux DEUX endroits : bloc « moteur de recherche » et bloc « Vérification ».
 * Forme RICHE : en-tête « prénom (normal) NOM (gras) » + téléphone et email sur DEUX lignes ; analyses GROUPÉES
 * (Le bien / Verdict et score) avec labels FR et valeurs formatées. Union du contenu des 2 anciennes fiches :
 * « Source de collecte » (venait de la vérification) ET azimut/hauteurs (venaient du bloc haut) partout.
 * LECTURE SEULE par défaut : les actions de cycle de vie (Rectifier/Effacer) ne s'affichent QUE si la prop `actions`
 * est fournie (bloc haut). Le bloc Vérification l'OMET → aucune action destructive ne peut y fuiter (invariant RGPD).
 * `actionsProjet` (bouton « Test » par analyse, LOT B) est DISTINCTE : fournie aux DEUX endroits, jamais `actions`.
 */
function FicheDetail({ detail, actions, actionsProjet }: { detail: Detail; actions?: ReactNode; actionsProjet?: (projet: Record<string, unknown>) => ReactNode }) {
  // Dépliages « Voir » MULTIPLES (plusieurs analyses ouvertes simultanément) — clé = id d'analyse (repli sur l'index).
  // État LOCAL à la fiche : remonté à zéro quand FicheDetail remonte (changement d'internaute) → pas de fuite entre profils.
  const [analysesOuvertes, setAnalysesOuvertes] = useState<Set<string>>(() => new Set());
  const basculerAnalyse = (cle: string) =>
    setAnalysesOuvertes((prev) => {
      const next = new Set(prev);
      if (next.has(cle)) next.delete(cle);
      else next.add(cle);
      return next;
    });
  const i = detail.internaute;
  const prenom = i.prenom ? String(i.prenom) : '';
  const nom = i.nom ? String(i.nom) : '';
  const aIdentite = prenom.trim() !== '' || nom.trim() !== '';
  // Code couleur des coordonnées (migration 028) : complet = confirmé à l'Écran B (fiable) ; incomplet = Écran A seul.
  const parcoursComplet = i.parcours === 'complet';
  const couleurCoord = parcoursComplet ? 'var(--color-svv-green)' : 'var(--color-svv-red)';
  const sousTitre: CSSProperties = { fontWeight: 700, color: 'var(--color-svv-muted)', fontSize: '.75rem', textTransform: 'uppercase' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '.85rem' }}>
      {/* EN-TÊTE : prénom en NORMAL + NOM en GRAS (même ligne) ; téléphone puis email sur DEUX lignes séparées ;
          méta création + source de collecte. Plus d'intitulés « Prénom/Nom/Email/Téléphone » (portés par l'en-tête). */}
      <div>
        <div style={{ fontSize: '1.25rem', color: 'var(--color-svv-ink)', lineHeight: 1.15 }}>
          {aIdentite ? (
            <>
              {prenom && <span style={{ fontWeight: 400 }}>{prenom}</span>}
              {prenom && nom ? ' ' : ''}
              {nom && <span style={{ fontWeight: 800 }}>{nom}</span>}
            </>
          ) : (
            i.efface_a ? '(identité effacée)' : '—'
          )}
        </div>
        {/* Respiration : une ligne vide entre le nom/prénom et les contacts. */}
        <div aria-hidden style={{ height: 10 }} />
        {/* Contacts : label lisible + valeur. Téléphone REFORMATÉ national pour l'affichage (donnée stockée = E.164,
            inchangée). Police > .85rem d'origine pour la lisibilité, mais STRICTEMENT < 1.25rem du nom.
            CODE COULEUR PARCOURS (admin seulement) : VERT si `parcours='complet'` (validé à l'Écran B → coordonnées
            confirmées, fiables), ROUGE si 'incomplet' (Écran A seul → jamais confirmées, potentiellement fausses). */}
        <div style={{ fontSize: '.95rem', wordBreak: 'break-word' }} title={parcoursComplet ? 'Coordonnées confirmées à l’écran B (parcours complet)' : 'Coordonnées non confirmées — écran A seul (parcours incomplet)'}>
          <span style={{ fontWeight: 600, color: 'var(--color-svv-muted)' }}>Téléphone : </span>
          <span style={{ color: couleurCoord, fontWeight: 700 }}>{i.telephone ? formaterTelephone(String(i.telephone)) : '—'}</span>
        </div>
        <div style={{ fontSize: '.95rem', wordBreak: 'break-word' }} title={parcoursComplet ? 'Coordonnées confirmées à l’écran B (parcours complet)' : 'Coordonnées non confirmées — écran A seul (parcours incomplet)'}>
          <span style={{ fontWeight: 600, color: 'var(--color-svv-muted)' }}>Email : </span>
          <span style={{ color: couleurCoord, fontWeight: 700 }}>{i.email ? String(i.email) : '—'}</span>
        </div>
        <div style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)', marginTop: 6 }}>
          Créé le {dateHeureFr(i.cree_a)}{i.source_collecte ? ` · Source : ${String(i.source_collecte)}` : ''}
        </div>
      </div>

      {/* Consentements RGPD (3 finalités) — état coloré + date. */}
      <div>
        <div style={sousTitre}>Consentements</div>
        {detail.consentements.map((c) => (
          <div key={c.finalite} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ color: 'var(--color-svv-ink)' }}>{libelleFinaliteAffichage(c.finalite, c.libelle)}</span>
            <span style={{ color: c.actif ? 'var(--color-svv-green)' : 'var(--color-svv-muted)', fontWeight: 700 }}>
              {c.actif ? 'Actif' : c.etat ? c.etat : 'Aucun'}{c.depuis ? ` · ${dateFr(c.depuis)}` : ''}
            </span>
          </div>
        ))}
      </div>

      {/* Analyses — UNE LIGNE COMPACTE par analyse : verdict · note /100 (+ libellé produit) · date à heure · [Test à droite].
          Déjà triées récent→ancien PAR LA REQUÊTE (`ORDER BY cree_a DESC`, extractionRepo) → AUCUN re-tri front. Le détail
          verbeux (bien, adresse, grandeurs de visée) est masqué de l'AFFICHAGE ; les grandeurs restent dans `p` et
          alimentent le bouton Test (elles ne disparaissent pas des données). */}
      <div>
        <div style={sousTitre}>Analyse{detail.projets.length > 1 ? 's' : ''} ({detail.projets.length})</div>
        {/* Conteneur plafonné à ~5 lignes (hauteur ≈ 5 × 60px : bouton 44px + marges) : au-delà → scroll interne, le
            bloc ne grandit pas (jamais plus de 5 d'un coup). Approximation assumée (lignes de hauteur variable selon le
            wrapping mobile — une ligne repliée compte pour plus, donc ≤ 5 visibles). Pas de scroll animé imposé
            (la feuille de style admin respecte prefers-reduced-motion). */}
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 5 * 60, overflowY: 'auto' }}>
          {detail.projets.map((p, idx) => {
            const note = p.score == null ? null : Number(p.score); // numeric pg → chaîne → number (jamais la chaîne brute)
            // Libellé produit DÉRIVÉ du /100 : seuils CANONIQUES (config.SCORE_LABEL_*) + mapper partagé (libelleScore) —
            // jamais re-codés ici (cohérence stricte avec l'enum du moteur). < 60 → pas de libellé, note nue.
            const lib = note == null ? null : libelleScore(note >= SCORE_LABEL_EXCEPTIONNELLE_MIN ? 'EXCEPTIONNELLE' : note >= SCORE_LABEL_EXCELLENTE_MIN ? 'EXCELLENTE' : null);
            const cle = String(p.id ?? idx); // id d'analyse (stable) ; repli sur l'index
            const ouvert = analysesOuvertes.has(cle);
            return (
              // Analyse = ligne compacte + (si dépliée) son détail JUSTE SOUS, DANS le conteneur scrollable → le plafond
              // 5 lignes ne change pas, le scroll absorbe. Plusieurs analyses peuvent être dépliées simultanément.
              <div key={cle} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', border: '1px solid var(--color-svv-line)', borderRadius: 8, padding: '6px 10px' }}>
                  <span style={{ fontWeight: 700, color: 'var(--color-svv-ink)', fontSize: '.85rem' }}>{verdictFr(p.verdict)}</span>
                  <span aria-hidden style={{ color: 'var(--color-svv-line)' }}>·</span>
                  <span style={{ color: 'var(--color-svv-ink)', fontSize: '.85rem', fontVariantNumeric: 'tabular-nums' }}>
                    {note == null ? '—' : `${Math.round(note)}/100`}{lib ? ` · ${lib}` : ''}
                  </span>
                  <span aria-hidden style={{ color: 'var(--color-svv-line)' }}>·</span>
                  <span style={{ color: 'var(--color-svv-muted)', fontSize: '.78rem' }}>{dateHeureFr(p.cree_a)}</span>
                  {/* Actions À DROITE (marginLeft:auto) : « Voir » (déplie CETTE analyse) À GAUCHE de « Tester ». Le bouton
                      Test (`actionsProjet`) rejoue CETTE analyse (`p`) et n'est fourni QUE si `actionsProjet` est passée
                      (les 2 fiches la fournissent, jamais `actions` côté Vérification). « Voir » est toujours présent. */}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => basculerAnalyse(cle)}
                      aria-expanded={ouvert}
                      style={{ ...btnOutline, minHeight: 44 }}
                    >
                      {ouvert ? 'Masquer' : 'Voir'}
                    </button>
                    {actionsProjet ? actionsProjet(p) : null}
                  </div>
                </div>
                {ouvert ? <DetailAnalyse p={p} /> : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Profil effacé : note INFORMATIVE (pas une action) — affichée aux deux endroits. */}
      {i.efface_a ? (
        <div style={{ color: 'var(--color-svv-muted)', borderTop: '1px solid var(--color-svv-line)', paddingTop: 8 }}>
          Profil effacé le {new Date(String(i.efface_a)).toLocaleDateString('fr-FR')} — identité anonymisée, analyses supprimées ; la preuve de consentement est conservée.
        </div>
      ) : null}

      {/* Actions cycle de vie — UNIQUEMENT si `actions` fournie (bloc haut). Omise → lecture seule (Vérification). */}
      {actions}
    </div>
  );
}

/** Panneau de contrôle technique (consultation SEULE) : 10 derniers internautes, 2 modes, accordéon de détail complet. */
function PanneauVerification() {
  const [mode, setMode] = useState<'f1' | 'tous'>('tous'); // Correction 2 : « Toute la base » par défaut (outil de contrôle)
  const [liste, setListe] = useState<LigneRecent[] | 'chargement' | 'erreur'>('chargement');
  const [codeErr, setCodeErr] = useState(0);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailChargement, setDetailChargement] = useState(false);

  useEffect(() => {
    let annule = false;
    void (async () => {
      setListe('chargement');
      setOuvert(null);
      try {
        const res = await fetch(`/api/admin/internautes/recents?mode=${mode}`);
        if (annule) return;
        if (!res.ok) {
          setCodeErr(res.status);
          setListe('erreur');
          return;
        }
        const data = await res.json();
        if (annule) return;
        setListe(Array.isArray(data.lignes) ? data.lignes : []);
      } catch {
        if (!annule) {
          setCodeErr(0);
          setListe('erreur');
        }
      }
    })();
    return () => {
      annule = true;
    };
  }, [mode]);

  const basculer = async (id: string) => {
    if (ouvert === id) {
      setOuvert(null);
      return;
    }
    setOuvert(id);
    setDetail(null);
    setDetailChargement(true);
    try {
      const res = await fetch(`/api/admin/internautes/${id}`); // route LOT 3 : journalise déjà `acces_profil`
      if (res.ok) setDetail(await res.json());
    } finally {
      setDetailChargement(false);
    }
  };

  // « Toute la base » = bouton cerclé de ROUGE (contour secondaire) tant qu'inactif ; plein rouge quand actif.
  const styleTous: CSSProperties = mode === 'tous' ? btnRouge : { ...btnOutline, color: 'var(--color-svv-red)', borderColor: 'var(--color-svv-red)' };

  return (
    <div className="svv-card" style={{ marginTop: 18, borderTop: '3px solid var(--color-svv-red)', background: 'var(--color-svv-field)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--color-svv-ink)' }}>Vérification — 10 derniers internautes en base</h2>
        <p style={{ margin: '2px 0 0', fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>
          Contrôle technique (consultation seule) : vérifier que l’ingestion du tunnel fonctionne. Aucun export ni recontact ici.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={mode === 'f1' ? btnRouge : btnOutline} aria-pressed={mode === 'f1'} onClick={() => setMode('f1')}>Consentants F1</button>
        <button type="button" style={styleTous} aria-pressed={mode === 'tous'} onClick={() => setMode('tous')}>Toute la base</button>
      </div>

      {liste === 'chargement' && <div style={{ color: 'var(--color-svv-muted)' }}>Chargement…</div>}
      {liste === 'erreur' && (
        <div style={{ color: 'var(--color-svv-red)' }}>
          {codeErr === 403
            ? 'Accès refusé (réservé au rôle administrateur).'
            : 'Service indisponible. La base internaute n’est peut-être pas encore initialisée — appliquez les migrations 023 à 025.'}
        </div>
      )}
      {Array.isArray(liste) &&
        (liste.length === 0 ? (
          <div style={{ color: 'var(--color-svv-muted)' }}>Aucun internaute pour ce mode.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {liste.map((r) => (
              <div key={r.id} style={{ border: '1px solid var(--color-svv-line)', borderRadius: 10, overflow: 'hidden' }}>
                <button
                  type="button"
                  aria-expanded={ouvert === r.id}
                  onClick={() => basculer(r.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'none', border: 0, padding: '10px 12px', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontWeight: 800, color: 'var(--color-svv-ink)', flex: '1 1 160px', minWidth: 0 }}>
                    {[r.prenom, r.nom].filter(Boolean).join(' ') || (r.efface_a ? '(identité effacée)' : '—')}
                  </span>
                  <span style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)', wordBreak: 'break-word' }}>{r.email ?? '—'}</span>
                  <span style={{ fontSize: '.78rem', color: 'var(--color-svv-muted)' }}>{dateFr(r.cree_a)}</span>
                  <span style={{ fontSize: '.72rem', fontWeight: 700, color: r.f1_actif ? 'var(--color-svv-green)' : 'var(--color-svv-muted)' }}>{r.f1_actif ? 'F1 ✓' : 'F1 ✗'}</span>
                  {r.efface_a ? <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--color-svv-red)' }}>effacé</span> : null}
                  <span aria-hidden style={{ color: 'var(--color-svv-muted)' }}>{ouvert === r.id ? '▲' : '▼'}</span>
                </button>
                {ouvert === r.id && (
                  <div style={{ borderTop: '1px solid var(--color-svv-line)', padding: 12, background: 'var(--color-svv-field)' }}>
                    {detailChargement && <div style={{ color: 'var(--color-svv-muted)' }}>Chargement…</div>}
                    {/* Vérification = LECTURE SEULE : on fournit `actionsProjet` (bouton Test) mais JAMAIS `actions`
                        (Rectifier/Effacer) → aucune action destructive ne fuite dans le panneau de contrôle. */}
                    {detail && <FicheDetail key={ouvert ?? undefined} detail={detail} actionsProjet={(p) => <BoutonTestProjet projet={p} />} />}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
