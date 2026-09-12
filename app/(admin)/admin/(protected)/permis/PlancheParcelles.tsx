'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PlancheParcelles as PlancheData, PlancheParcelleMeta, CentreMode, SuggestionAdresse } from '../../../../lib/permis/plancheParcellesRepo';
import { descriptionActeurParcelle } from '../../../../lib/permis/acteurParcelle';
import { comparerParcelles, bilanComparatif, type RefParcelle, type LigneParcelleComparee } from '../../../../lib/permis/comparatifParcelles'; // PL-COMPARATIF — constat PUR déclaré ↔ sélectionné (aucune écriture)
import { etatPlancheTitre, type EtatTitreFamille } from '../../../../lib/permis/etatFamilleProjection'; // PL-ÉTAT — état de titre (validée / modifiée-non-validée / écart) remonté à la ligne de fonction, SANS déplier
import { LiseusePieces, type DonneesLiseuse } from './LiseusePieces'; // LOT 90 — liseuse LECTURE SEULE autonome, RÉUTILISÉE (jamais dupliquée) ; P3 — partage donnée /emprise

/**
 * PL-A/B/C — PLANCHE CADASTRALE. Parcelles du permis + voisines dans un rayon RÉGLABLE, schéma SVG maison (module pur, EPSG:2154).
 * Liseuse à gauche, planche à droite. PL-C : CLIC = BASCULEMENT (la parcelle s'allume en VERT / se désélectionne) — état LOCAL, un
 * clic n'écrit RIEN ; « Valider la sélection » écrit la superposition (recalcule empreinte+bâti+projection) ; « Revenir à la
 * configuration d'origine » retire la sélection (retour à l'automatique) ; « Réinitialiser » remet la composition au défaut
 * automatique (local). L'état courant est DIT (automatique, ou validé par QUI et QUAND — provenance honnête de PL-A/B). Mobile-first.
 */

const RAYON_MIN = 50, RAYON_MAX = 200, RAYON_PAS = 50;
const SEUIL_DENSE = 250;

/** IDU des parcelles du permis (ensemble automatique par défaut) présentes sur la planche. */
function origineIdus(data: PlancheData): string[] {
  return data.meta.filter((m) => m.retenue && m.idu).map((m) => m.idu as string);
}

// Style d'une parcelle SELON la composition locale : dans la composition = VERT (allumée) ; parcelle du permis retirée = contour
//   pointillé (on voit qu'on l'a désélectionnée) ; voisine non sélectionnée = contour neutre.
function styleParcelle(m: PlancheParcelleMeta, dans: boolean): { fill: string; stroke: string; fillOpacity: number; dash?: string; width: number } {
  if (dans) return { fill: 'var(--color-svv-green-ink)', stroke: 'var(--color-svv-green-ink)', fillOpacity: 0.4, width: 1.6 };
  if (m.retenue) return { fill: 'none', stroke: 'var(--color-svv-ink)', fillOpacity: 0, dash: '3 2', width: 1.1 }; // parcelle du permis DÉSÉLECTIONNÉE
  return { fill: 'var(--color-svv-muted)', stroke: 'var(--color-svv-muted)', fillOpacity: 0.06, width: 0.6 };        // voisine
}

function texteParcelle(m: PlancheParcelleMeta): string {
  const base = `Section ${m.section} n° ${m.numero}`;
  if (!m.retenue) return `${base} — voisine`;
  if (m.origine === 'saisie') {
    const d = descriptionActeurParcelle(m);
    return `${base} — ${d.aLaMain ? `à la main par ${d.qui}` : `corrigée par ${d.qui}`}${d.quand ? ` le ${d.quand}` : ''}`;
  }
  return `${base} — ${m.origine === 'extraite' ? 'des pièces' : 'rapprochement cadastral'}`;
}

const LEGENDE: { cle: string; couleur: string; texte: string }[] = [
  { cle: 'selectionnee', couleur: 'var(--color-svv-green-ink)', texte: 'sélectionnée (dans la composition)' },
  { cle: 'retiree', couleur: 'var(--color-svv-ink)', texte: 'parcelle du permis retirée' },
  { cle: 'voisine', couleur: 'var(--color-svv-muted)', texte: 'voisine (repère)' },
];

export function PlancheParcelles({ dossierId, onEmpreinteRecalculee, onEtatPlanche, donneesLiseuse = null }: {
  dossierId: number;
  onEmpreinteRecalculee?: () => void; // PL-H — appelé après un valider/retirer RÉUSSI (empreinte+bâti+projection recalculés serveur) → le
                                      //   parent rafraîchit le bloc « Bâtiments et projection » via le canal EXISTANT (vInstruction/rafraichir).
  onEtatPlanche?: (etat: EtatTitreFamille | null) => void; // PL-ÉTAT — REMONTE l'état LIVE de la planche (validée / modifiée-non-validée / écart) → la ligne
                                                            //   de fonction le dit SANS déplier. null tant que rien n'est chargé. Prime sur l'état sauvegardé côté parent.
  donneesLiseuse?: DonneesLiseuse | null; // P3 (perfo) — données /emprise déjà chargées par le bloc « Bâtiments et projection » : la liseuse
                                          //   de la planche les RÉUTILISE au lieu de refaire le GET /emprise (doublon supprimé). Null → elle charge elle-même.
}) {
  const [data, setData] = useState<PlancheData | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'erreur' | 'ok'>('chargement');
  const [rayon, setRayon] = useState(RAYON_MIN);
  const [mode, setMode] = useState<CentreMode>('empreinte');
  const [idu, setIdu] = useState<string | null>(null);
  const [survol, setSurvol] = useState<{ x: number; y: number; texte: string } | null>(null);
  const [composition, setComposition] = useState<Set<string>>(new Set()); // PL-C — sélection LOCALE (basculement) ; un clic n'écrit rien
  const [prevSelKey, setPrevSelKey] = useState<string | null>(null);      // clé de RÉINITIALISATION de la composition (reset PENDANT le rendu, pas dans un effet)
  const [enCours, setEnCours] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // AGENCEMENT (parité « Agrandir le schéma » de « Bâtiments et projection », BlocTraceEmprise:1853) — le plein écran est un MODAL
  //   (backdrop + carte centrée), PAS une colonne edge-to-edge. Son contenu partage le MÊME état de composant (composition / mode /
  //   rayon) : la sélection est donc PARTAGÉE entre la vue intégrée et le plein écran, une seule source de vérité, sans duplication.
  const [schemaPleinEcran, setSchemaPleinEcran] = useState(false);
  const [adresseSaisie, setAdresseSaisie] = useState('');           // PL-D — champ de saisie d'adresse (mode adresse)
  const [adresseCommittee, setAdresseCommittee] = useState<{ texte: string; point: { x: number; y: number } | null } | null>(null); // committée : suggestion CHOISIE (point) ou texte libre
  const [suggestions, setSuggestions] = useState<SuggestionAdresse[] | null>(null); // PL-E — autocomplétion ; null = pas de recherche, [] = aucune
  const [sugActive, setSugActive] = useState(-1);                    // index de la suggestion surlignée (clavier)
  const [autoAdresse, setAutoAdresse] = useState<number | null>(null); // dossier pour lequel on a déjà auto-basculé en mode adresse (impasse)

  useEffect(() => {
    let annule = false;
    void (async () => {
      setEtat('chargement');
      try {
        const q = new URLSearchParams({ dossierId: String(dossierId), rayon: String(rayon), centre: mode });
        if (mode === 'parcelle' && idu) q.set('idu', idu);
        if (mode === 'adresse' && adresseCommittee) {
          if (adresseCommittee.point) { q.set('px', String(adresseCommittee.point.x)); q.set('py', String(adresseCommittee.point.y)); q.set('plabel', adresseCommittee.texte); } // PL-E — suggestion CHOISIE : point déjà connu, aucun re-géocodage
          else q.set('adresse', adresseCommittee.texte); // PL-D — texte libre à géocoder
        }
        const res = await fetch(`/api/admin/permis/planche?${q.toString()}`, { cache: 'no-store' });
        if (annule) return;
        if (!res.ok) { setEtat('erreur'); return; }
        const j = (await res.json()) as { planche: PlancheData };
        setData(j.planche); setEtat('ok');
      } catch { if (!annule) setEtat('erreur'); }
    })();
    return () => { annule = true; };
  }, [dossierId, rayon, mode, idu, adresseCommittee]);

  // PL-E — AUTOCOMPLÉTION : ≥ 3 caractères, débounce 300 ms, requête ANNULABLE (AbortController) → une réponse périmée qui arrive en
  //   retard est IGNORÉE (le cleanup abort() la coupe). On ne re-suggère pas si le champ = exactement le libellé déjà choisi.
  useEffect(() => {
    const q = adresseSaisie.trim();
    // (A) AUTOCOMPLÉTION DISPONIBLE QUEL QUE SOIT LE MODE (décision Arno) : la recherche de suggestions ne dépend plus du mode de centrage
    //   (l'endpoint /suggest est un simple géocodage). Le CENTRAGE reste piloté par le mode 'adresse', fixé à la validation (cf. handlers).
    if (q.length < 3 || (adresseCommittee && adresseCommittee.texte === adresseSaisie)) return; // pas de fetch (le vidage se fait dans onChange)
    const ctrl = new AbortController();
    const t = setTimeout(() => { void (async () => {
      try {
        const res = await fetch(`/api/admin/permis/planche?dossierId=${dossierId}&suggest=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) { setSuggestions([]); return; }
        const j = (await res.json()) as { suggestions?: SuggestionAdresse[] };
        setSuggestions(j.suggestions ?? []); setSugActive(-1);
      } catch (e) { if ((e as Error).name !== 'AbortError') setSuggestions([]); } // AbortError = requête annulée (frappe rapide) → on ignore
    })(); }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [adresseSaisie, dossierId, adresseCommittee]);

  // Init/reset de la COMPOSITION locale, PENDANT LE RENDU (React idiome « ajuster l'état quand une clé change » ; pas d'effet →
  //   pas de rendu en cascade). Clé = dossier + état de VALIDATION (PAS le rayon) → changer le rayon/centrage NE perd PAS une
  //   composition en cours ; valider/retirer (la sélection change) réaligne bien la composition.
  const selKey = data ? `${dossierId}|${data.selection.active}|${data.selection.idus.join(',')}` : null;
  if (data && selKey !== prevSelKey) {
    setPrevSelKey(selKey);
    setComposition(new Set(data.selection.active ? data.selection.idus : origineIdus(data)));
  }
  // PL-D — IMPASSE (aucune parcelle rattachée) : basculer AUTOMATIQUEMENT (une fois par dossier) sur le centrage ADRESSE → la planche
  //   dessine le voisinage réel du permis (géocodage auto : local puis API nationale) et Arno peut composer sa sélection. Jamais muet.
  if (data && data.parcellesChoix.length === 0 && mode === 'empreinte' && autoAdresse !== dossierId) {
    setAutoAdresse(dossierId); setMode('adresse');
  }

  const defautIdus = useMemo(() => (data ? origineIdus(data) : []), [data]);
  const compositionModifiee = useMemo(() => {
    const d = new Set(defautIdus);
    return d.size !== composition.size || [...composition].some((x) => !d.has(x));
  }, [composition, defautIdus]);
  // PL-ÉTAT — CHANGEMENT EN ATTENTE = la composition à l'écran diffère de la BASE EFFECTIVE (sélection validée si active, sinon le défaut
  //   automatique). DISTINCT de `compositionModifiee` (toujours vs défaut) : sur une sélection validée, revenir manuellement à sa composition
  //   validée n'est PLUS « en attente ». C'est ce qui pilote le libellé du bouton (Valider vs Modifier) et l'alerte rouge « non validée ».
  const changementEnAttente = useMemo(() => {
    const base = new Set(data ? (data.selection.active ? data.selection.idus : origineIdus(data)) : []);
    return base.size !== composition.size || [...composition].some((x) => !base.has(x));
  }, [composition, data]);
  // PL-COMPARATIF / PL-ÉTAT — SOURCE UNIQUE du bilan déclaré ↔ sélectionné (IDU → section/numéro via meta/parcellesChoix), consommé À LA FOIS
  //   par le CONSTAT déplié (phrase + détail) ET par l'état de la ligne (remontée ci-dessous). Pur, aucune écriture ; `null` tant que rien n'est chargé.
  const comparatif = useMemo(() => {
    if (!data) return null;
    const refParIdu = new Map<string, RefParcelle>();
    for (const x of data.parcellesChoix) refParIdu.set(x.idu, { section: x.section, numero: x.numero });
    for (const m of data.meta) if (m.idu) refParIdu.set(m.idu, { section: m.section, numero: m.numero });
    const refsSelection: RefParcelle[] = [...composition].map((id) => refParIdu.get(id) ?? { section: '', numero: '' });
    return comparerParcelles(data.parcellesDeclarees ?? [], refsSelection);
  }, [data, composition]);
  // PL-ÉTAT — REMONTE l'état de titre au parent (effet, jamais pendant le rendu). Une valeur LIVE porte le changement en attente → la ligne de
  //   fonction passe au rouge « modifiée — non validée » ; validée → vert + nuance mêmes/différentes ; automatique concordant → neutre. Constat pur.
  useEffect(() => {
    if (!onEtatPlanche) return;
    if (!data || !comparatif) { onEtatPlanche(null); return; }
    onEtatPlanche(etatPlancheTitre({ selectionValidee: data.selection.active, changementEnAttente, cas: bilanComparatif(comparatif).cas }));
  }, [data, comparatif, changementEnAttente, onEtatPlanche]);

  // ② — fermeture du plein écran à la touche Échap (même sortie que « ✕ Fermer » / le clic hors zone). Aucune animation → prefers-reduced-motion respecté d'office.
  useEffect(() => {
    if (!schemaPleinEcran) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSchemaPleinEcran(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [schemaPleinEcran]);

  const basculer = (id: string | null) => { if (!id) return; setComposition((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const reinitialiser = () => { setComposition(new Set(defautIdus)); setMsg(null); };

  const poster = async (action: 'valider' | 'retirer', idus?: string[]) => {
    setEnCours(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/permis/planche', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, dossierId, idus }) });
      if (res.status === 401) { setMsg('Session expirée — reconnectez-vous.'); return; }
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string; planche?: PlancheData };
      if (!res.ok || !j.ok || !j.planche) { setMsg(j.erreur ?? 'action impossible, réessayez.'); return; }
      setData(j.planche); // la composition se réaligne via l'effet (selKey change)
      setMsg(action === 'valider' ? 'Sélection validée — empreinte, bâti et projection recalculés.' : 'Retour à la configuration automatique.');
      onEmpreinteRecalculee?.(); // PL-H — valider ET retirer recalculent l'empreinte serveur → rafraîchir le bloc « Bâtiments et projection » (jamais en cas d'échec : on est déjà sorti plus haut).
    } catch { setMsg('action impossible (réseau).'); } finally { setEnCours(false); }
  };

  const changerMode = (m: CentreMode) => { setMode(m); if (m === 'parcelle') setIdu((prev) => prev ?? data?.parcellesChoix[0]?.idu ?? null); };
  // PL-E — choisir une suggestion (point DÉJÀ connu → aucun 2e appel) ; localiser du texte libre ; revenir à l'adresse du permis.
  // (A) — valider une adresse la CENTRE dessus en passant par le mode 'adresse' EXISTANT (setMode) : la logique de centrage (fetch/query)
  //   n'est pas touchée, on la déclenche simplement. La saisie reste disponible quel que soit le mode ; c'est la validation qui centre.
  const choisirSuggestion = (s: SuggestionAdresse) => { setAdresseSaisie(s.label); setAdresseCommittee({ texte: s.label, point: { x: s.x, y: s.y } }); setMode('adresse'); setSuggestions(null); setSugActive(-1); };
  const localiserTexte = () => { const t = adresseSaisie.trim(); if (t) { setAdresseCommittee({ texte: t, point: null }); setMode('adresse'); } setSuggestions(null); setSugActive(-1); };
  const revenirAdressePermis = () => { setAdresseSaisie(''); setAdresseCommittee(null); setSuggestions(null); setSugActive(-1); };
  const clavierAdresse = (e: React.KeyboardEvent) => {
    const n = suggestions?.length ?? 0;
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); setSugActive((i) => (i + 1) % n); }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); setSugActive((i) => (i - 1 + n) % n); }
    else if (e.key === 'Enter') { e.preventDefault(); if (suggestions && sugActive >= 0 && sugActive < n) choisirSuggestion(suggestions[sugActive]); else localiserTexte(); }
    else if (e.key === 'Escape') { setSuggestions(null); setSugActive(-1); }
  };

  if (etat === 'chargement' && !data) return <div className="svv-card" style={{ fontSize: 12, color: 'var(--color-svv-muted)' }} aria-live="polite">Chargement de la planche cadastrale…</div>;
  if (etat === 'erreur' || !data) return <div className="svv-card" role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>Planche cadastrale indisponible.</div>;

  const { schema, meta } = data;
  const btn = (actif: boolean): React.CSSProperties => ({ cursor: 'pointer', border: `1px solid ${actif ? 'var(--color-svv-ink)' : 'var(--color-svv-line)'}`, borderRadius: '.4rem', background: actif ? 'var(--color-svv-field)' : 'var(--color-svv-surface)', color: 'var(--color-svv-ink)', padding: '.2rem .55rem', fontSize: 12, fontWeight: actif ? 700 : 400 });
  const btnAction: React.CSSProperties = { cursor: 'pointer', minHeight: 40, padding: '.4rem .7rem', borderRadius: '.45rem', fontSize: 13, fontWeight: 600, border: '1px solid var(--color-svv-line)' };
  const focusable = (m: PlancheParcelleMeta) => m.retenue || (m.idu ? composition.has(m.idu) : false); // parcelles ACTIONNABLES au clavier
  const provenanceSel = descriptionActeurParcelle({ majPar: data.selection.validePar, majLe: data.selection.valideLe, acteurNom: data.selection.acteurNom });
  // PL-D2 — plus JAMAIS de boîte SVG vide et muette : si le schéma ne dessine RIEN (aucun contour), on DIT pourquoi, en considérant
  //   le motif du SCHÉMA (empreinte absente) et pas seulement celui du repo (0 parcelle). Le motif du schéma peut désormais être
  //   INFORMATIF alors qu'on dessine bien (empreinte manquante) : on ne le traite comme bloquant QUE s'il n'y a réellement rien à voir.
  const rienADessiner = schema.polygones.length === 0 && !schema.empreintePath;
  const messageVide = data.motif ?? schema.motif ?? 'planche cadastrale indisponible';
  // PL-D2 — état de TRAVAIL normal (pas une panne) : aucune parcelle du permis n'apparaît sur la planche (permis sans parcelle rattachée,
  //   ou ligne « fantôme » sans contour au cadastre, cas DK 649 sur le 468). Bandeau discret, ton neutre — on invite à composer la sélection.
  const aucuneParcellePermis = data.nbRetenues === 0;

  // PL-COMPARATIF — CONSTAT (lecture seule) : parcelles DÉCLARÉES au permis ↔ SÉLECTIONNÉES dans la composition (IDU → section/numéro via
  //   `meta`/`parcellesChoix`, normalisation « DZ 09 » ⟷ « DZ 9 »). Calculé UNE fois dans le memo `comparatif` (SOURCE UNIQUE partagée avec
  //   la remontée d'état de la ligne). Non nul ici : les early returns au-dessus ont éliminé `data === null`.
  const comparatifRendu = comparatif!;

  // ── AGENCEMENT PARTAGÉ (parité « Bâtiments et projection ») — le MÊME contenu est monté SOIT dans la colonne intégrée, SOIT dans le
  //   MODAL plein écran, jamais les deux à la fois (source d'état UNIQUE → aucune duplication d'id ni de contrôle). On factorise les
  //   briques comme la référence factorise `barreDroiteSchema` / `blocSchema` : barre de centrage, contrôles au-dessus du schéma, dessin,
  //   bandeau de validation. On ne copie AUCUNE fonctionnalité de la référence : chaque brique reste 100 % propre à la planche.

  // Barre « Centrer : » (modes + parcelle) — barre d'outils EN TÊTE du schéma. `avecAgrandir` : le bouton d'agrandissement n'apparaît qu'en
  //   vue intégrée (dans le modal, on ferme par l'en-tête ✕ / le clic hors zone / Échap). Placé et libellé comme la référence (barreDroiteSchema) :
  //   dans la barre au-dessus du schéma, poussé à droite, « ⤢ Agrandir le schéma ». Cible tactile ≥ 44 px.
  const barreCentrage = (avecAgrandir: boolean) => (
    <div role="group" aria-label="Centrage de la planche" style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Centrer :</span>
      <button type="button" style={btn(mode === 'empreinte')} aria-pressed={mode === 'empreinte'} onClick={() => changerMode('empreinte')}>Toutes les parcelles</button>
      <button type="button" style={btn(mode === 'parcelle')} aria-pressed={mode === 'parcelle'} onClick={() => changerMode('parcelle')}
        disabled={data.parcellesChoix.length <= 1} title={data.parcellesChoix.length <= 1 ? 'ce permis n’a qu’une parcelle : identique à « Toutes les parcelles »' : undefined}>Centrer sur une parcelle</button>
      <button type="button" style={btn(mode === 'adresse')} aria-pressed={mode === 'adresse'} onClick={() => changerMode('adresse')}>Centrer sur l’adresse</button>
      {mode === 'parcelle' && data.parcellesChoix.length > 0 && (
        <select aria-label="Parcelle de centrage" value={idu ?? ''} onChange={(e) => setIdu(e.target.value || null)} style={{ fontSize: 12, padding: '.15rem .3rem', border: '1px solid var(--color-svv-line)', borderRadius: '.3rem', background: 'var(--color-svv-field)', color: 'var(--color-svv-ink)' }}>
          {data.parcellesChoix.map((p) => <option key={p.idu} value={p.idu}>Section {p.section} n° {p.numero}</option>)}
        </select>
      )}
      {avecAgrandir && <button type="button" style={{ ...btn(false), minHeight: 44, marginLeft: 'auto' }} onClick={() => setSchemaPleinEcran(true)} aria-label="Agrandir le schéma en plein écran">⤢ Agrandir le schéma</button>}
    </div>
  );

  // Contrôles de centrage/voisinage AU-DESSUS du schéma : saisie d'adresse (+ autocomplétion, provenance, avertissement), rayon des
  //   voisines, note de densité. TOUJOURS au-dessus du dessin (régression d1ef439 : jamais repoussés dessous, ni en intégré ni en plein
  //   écran). Monté une seule fois (intégré OU modal) → ids `sug-`/`rayon-` uniques.
  const blocControles = (
    <>
      {/* (A) SAISIE D'ADRESSE TOUJOURS DISPONIBLE (décision Arno) — le gate `mode === 'adresse'` est LEVÉ : Arno peut taper une adresse à
          tout moment, quel que soit le centrage. Valider (choisir/Localiser) centre la planche dessus (les handlers passent en mode 'adresse').
          PL-D/E — AUTOCOMPLÉTION (api-adresse) : suggestions à la frappe (≥3 car., biais commune) ; choisir = géocoder sans 2e appel ; texte
          libre à défaut. Recours quand le géocodage auto échoue (impasse du 468). */}
      <div style={{ display: 'flex', gap: '.3rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 0 }}>
            <input aria-label="Adresse à localiser" role="combobox" aria-expanded={!!(suggestions && suggestions.length)} aria-autocomplete="list" aria-controls={`sug-${dossierId}`}
              placeholder={data.centre.label ?? 'taper une adresse (ex. « inspecteur »…)'}
              value={adresseSaisie} onChange={(e) => { const v = e.target.value; setAdresseSaisie(v); if (adresseCommittee) setAdresseCommittee(null); if (v.trim().length < 3) { setSuggestions(null); setSugActive(-1); } }} onKeyDown={clavierAdresse}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '.25rem .4rem', minHeight: 34, border: '1px solid var(--color-svv-line)', borderRadius: '.3rem', background: 'var(--color-svv-field)', color: 'var(--color-svv-ink)' }} />
            {suggestions && suggestions.length > 0 && (
              <ul id={`sug-${dossierId}`} role="listbox" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40, listStyle: 'none', margin: '.1rem 0 0', padding: 0, background: 'var(--color-svv-surface)', border: '1px solid var(--color-svv-line)', borderRadius: '.3rem', boxShadow: '0 2px 6px rgba(0,0,0,.15)', maxHeight: 210, overflowY: 'auto' }}>
                {suggestions.map((s, i) => (
                  <li key={s.label} role="option" aria-selected={i === sugActive} onMouseEnter={() => setSugActive(i)}
                    onMouseDown={(e) => { e.preventDefault(); choisirSuggestion(s); }} // mouseDown : choisit AVANT un éventuel blur
                    style={{ padding: '.35rem .45rem', fontSize: 12, cursor: 'pointer', minHeight: 34, background: i === sugActive ? 'var(--color-svv-field)' : 'transparent', borderTop: i > 0 ? '1px solid var(--color-svv-line)' : undefined }}>{s.label}</li>
                ))}
              </ul>
            )}
            {suggestions && suggestions.length === 0 && adresseSaisie.trim().length >= 3 && (
              <div role="note" style={{ fontSize: 11, color: 'var(--color-svv-muted)', marginTop: '.15rem' }}>aucune suggestion — appuyez sur « Localiser » pour chercher tel quel</div>
            )}
          </div>
          <button type="button" style={{ ...btn(false), minHeight: 34 }} onClick={localiserTexte}>Localiser</button>
          {adresseCommittee && <button type="button" className="svv-link" style={{ width: 'auto', padding: '.05rem .3rem', fontSize: 11.5, alignSelf: 'center' }} onClick={revenirAdressePermis}>revenir à l’adresse du permis</button>}
        </div>
      {/* Point d'adresse localisé : provenance EXPLICITE (base locale vs API nationale — donnée externe, jamais « à la main »). Montré dès qu'un point existe (indépendant du mode). */}
      {data.centre.point && (
        <div style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>✚ {data.centre.label ?? 'adresse localisée'} — {data.centre.provenance === 'api-adresse' ? 'API nationale (Base Adresse Nationale, Licence Ouverte)' : 'base locale'}</div>
      )}
      {/* Avertissement : rouge (échec, aucun point) ou info (point trouvé mais approximatif / attribution API). */}
      {data.centreAvertissement && <div role="note" style={{ fontSize: 11.5, color: data.centre.point ? 'var(--color-svv-muted)' : 'var(--color-svv-red)' }}>{data.centre.point ? 'ℹ ' : '⚠ '}{data.centreAvertissement}</div>}

      {/* RAYON */}
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor={`rayon-${dossierId}`} style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Voisines à</label>
        <input id={`rayon-${dossierId}`} type="range" min={RAYON_MIN} max={RAYON_MAX} step={RAYON_PAS} value={rayon} onChange={(e) => setRayon(Number(e.target.value))} style={{ flex: '1 1 120px', maxWidth: 200 }} />
        <strong style={{ fontSize: 12 }}>{data.rayonM} m</strong>
        <span style={{ fontSize: 11.5, color: 'var(--color-svv-muted)' }}>· {data.nbVoisines} voisine(s)</span>
      </div>
      {data.nbRetenues + data.nbVoisines > SEUIL_DENSE && <div role="note" style={{ fontSize: 11.5, color: 'var(--color-svv-muted)' }}>Planche dense ({data.nbRetenues + data.nbVoisines} parcelles) — rapprochez le rayon pour lire les repères.</div>}
    </>
  );

  // Le SCHÉMA (message si rien à dessiner, sinon le SVG cliquable). `grand` élargit le cadrage en plein écran (parité maxWidth de la référence).
  const schemaDessin = (grand: boolean) => (
    data.motif || rienADessiner ? (
      <div role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>{messageVide}</div>
    ) : (
      <>
        {aucuneParcellePermis && (
          <div role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', padding: '.35rem .55rem', background: 'var(--color-svv-field)' }}>
            Aucune parcelle du permis n’est dessinable — sélectionnez les bonnes parcelles ci-dessous pour établir l’empreinte.
          </div>
        )}
        {/* SURFACE — en plein écran (`grand`) le tracé REMPLIT sa zone (largeur ET hauteur), sans plafond en dur : le conteneur s'étire (flex),
            le SVG occupe 100 % de la zone et `preserveAspectRatio="xMidYMid meet"` conserve le rapport d'aspect (aucune déformation, léger
            letterbox). `minHeight` évite qu'il soit écrasé quand la colonne latérale passe dessous (mobile) → la carte défile alors. En vue
            intégrée, cadrage inchangé (maxWidth 520, hauteur auto, défilement horizontal). */}
        <div style={grand ? { flex: 1, minWidth: 0, minHeight: '50vh', display: 'flex' } : { width: '100%', overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${schema.largeur} ${schema.hauteur}`} role="img" preserveAspectRatio="xMidYMid meet"
            aria-label={`Planche cadastrale : ${composition.size} parcelle(s) sélectionnée(s) sur ${data.nbRetenues} du permis, ${data.nbVoisines} voisine(s)`}
            style={grand
              ? { width: '100%', height: '100%', display: 'block', background: 'var(--color-svv-surface)', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem' }
              : { width: '100%', maxWidth: 520, height: 'auto', display: 'block', background: 'var(--color-svv-surface)', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem' }}>
            {schema.empreintePath && <path d={schema.empreintePath} fill="none" stroke="var(--color-svv-line)" strokeWidth={1.5} strokeDasharray="4 3" />}
            {schema.polygones.map((p, i) => { const m = meta[i]; if (!m) return null;
              const id = m.idu; const dans = id ? composition.has(id) : false; const s = styleParcelle(m, dans);
              // CIBLE DE CLIC — `pointerEvents: 'all'` (style du path) rend TOUT le tracé cliquable, intérieur compris, INDÉPENDAMMENT du fill.
              //   Sans lui, une parcelle du permis RETIRÉE (styleParcelle → `fill: 'none'`) n'était cliquable que sur son fin contour pointillé
              //   (hit-test `visiblePainted` par défaut : l'intérieur non peint n'est pas une cible) → impossible de la re-sélectionner d'un
              //   clic à l'intérieur. Bascule désormais symétrique et illimitée pour TOUTE parcelle (du permis ou voisine).
              return (
                <path key={p.repere} d={p.path} fill={s.fill} fillOpacity={s.fillOpacity} stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash}
                  role="button" aria-pressed={dans} aria-label={`${texteParcelle(m)} — ${dans ? 'sélectionnée' : 'non sélectionnée'}`}
                  tabIndex={focusable(m) ? 0 : -1} style={{ cursor: 'pointer', pointerEvents: 'all' }}
                  onClick={() => basculer(id)} onFocus={() => id && setSurvol(null)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); basculer(id); } }}
                  onMouseMove={(e) => setSurvol({ x: e.clientX, y: e.clientY, texte: texteParcelle(m) })} onMouseLeave={() => setSurvol(null)} />
              );
            })}
            {schema.polygones.map((p, i) => meta[i] && meta[i].retenue ? (
              <text key={`t-${p.repere}`} x={p.cx} y={p.cy} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 9, fontWeight: 700, fill: 'var(--color-svv-ink)', paintOrder: 'stroke', stroke: 'var(--color-svv-surface)', strokeWidth: 2.5, pointerEvents: 'none' }}>{meta[i].section} {meta[i].numero}</text>
            ) : null)}
            {data.marqueurAdresse && (
              <g pointerEvents="none">
                <circle cx={data.marqueurAdresse.cx} cy={data.marqueurAdresse.cy} r={4.5} fill="none" stroke="var(--color-svv-red)" strokeWidth={1.6} />
                <line x1={data.marqueurAdresse.cx - 7} y1={data.marqueurAdresse.cy} x2={data.marqueurAdresse.cx + 7} y2={data.marqueurAdresse.cy} stroke="var(--color-svv-red)" strokeWidth={1.2} />
                <line x1={data.marqueurAdresse.cx} y1={data.marqueurAdresse.cy - 7} x2={data.marqueurAdresse.cx} y2={data.marqueurAdresse.cy + 7} stroke="var(--color-svv-red)" strokeWidth={1.2} />
              </g>
            )}
          </svg>
        </div>

        {/* PL-G — parcelle(s) du permis hors de cette vue (au-delà du rayon) : elle(s) existe(nt), ailleurs — jamais « disparues ». Ton neutre. */}
        {data.retenuesHorsVue > 0 && (
          <div role="note" style={{ fontSize: 11.5, color: 'var(--color-svv-muted)' }}>
            ℹ {data.retenuesHorsVue} parcelle{data.retenuesHorsVue > 1 ? 's' : ''} du permis se situe{data.retenuesHorsVue > 1 ? 'nt' : ''} hors de cette vue (au-delà du rayon) — élargissez le rayon ou centrez sur les parcelles du permis pour la{data.retenuesHorsVue > 1 ? 's' : ''} voir.
          </div>
        )}
      </>
    )
  );

  // (C) — CONTRÔLES DE SÉLECTION (PL-C : état courant + composition + actions Valider/Modifier/Réinitialiser/Revenir). En vue INTÉGRÉE : sous
  //   le schéma. En PLEIN ÉCRAN : REMONTÉS AU-DESSUS du schéma, dans la marge des contrôles (avec « Centrer : » et le curseur « Voisines à »),
  //   jamais en colonne de droite (décision Arno). Rien si rien à dessiner.
  const controlesSelection = !(data.motif || rienADessiner) ? (
      <div style={{ borderTop: '1px solid var(--color-svv-line)', paddingTop: '.4rem', display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
        {/* État courant : DIT clairement automatique vs validé par QUI et QUAND (provenance honnête). */}
        <div aria-live="polite" style={{ fontSize: 12 }}>
          {data.selection.active
            ? <><strong style={{ color: 'var(--color-svv-green-ink)' }}>Sélection validée</strong> {provenanceSel.aLaMain ? <>par <strong>{provenanceSel.qui}</strong></> : <>par <strong>{provenanceSel.qui}</strong> <span style={{ fontStyle: 'italic', color: 'var(--color-svv-muted)' }}>(auteur non identifié)</span></>}{provenanceSel.quand ? <> le {provenanceSel.quand}</> : null}<span style={{ color: 'var(--color-svv-muted)' }}> — {data.selection.idus.length} parcelle(s).</span></>
            : <span style={{ color: 'var(--color-svv-muted)' }}><strong style={{ color: 'var(--color-svv-ink)' }}>Configuration automatique</strong> (préparée par l’analyse). Le passage par la planche n’est pas obligatoire.</span>}
        </div>
        <div style={{ fontSize: 12 }}><strong>{composition.size}</strong> parcelle(s) dans la composition{changementEnAttente ? <span style={{ color: 'var(--color-svv-red)' }}> (modifiée — non validée)</span> : null}</div>

        {/* PL-ÉTAT (rule 1) + décision Arno — BOUTON PRIMAIRE UNIQUE, TOUJOURS ACTIF (jamais grisé au repos) : le LIBELLÉ dit ce que le clic
            fait selon l'état RÉEL — changement en attente → « Valider la sélection » ; sinon sélection ACQUISE → « Modifier la sélection »,
            ACTIF lui aussi (MÊME handler : ré-applique/valide la composition acquise → recalcule empreinte, bâti et projection). On modifie
            aussi en cliquant une parcelle sur le schéma. Désactivé UNIQUEMENT pendant une écriture (enCours) ou si la composition est vide
            (une empreinte vide n'est pas validable — message rouge dédié ci-dessous). Identique en vue intégrée ET en plein écran. */}
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          <button type="button" className="svv-btn svv-btn-primary" style={btnAction} disabled={enCours || composition.size === 0}
            title={changementEnAttente ? undefined : 'Ré-applique la sélection acquise (recalcule empreinte, bâti et projection). Vous pouvez aussi cliquer une parcelle pour la modifier.'}
            onClick={() => void poster('valider', [...composition])}>{changementEnAttente ? 'Valider la sélection' : 'Modifier la sélection'}</button>
          {compositionModifiee && <button type="button" style={{ ...btnAction, background: 'var(--color-svv-field)' }} disabled={enCours} onClick={reinitialiser}>Réinitialiser à la sélection par défaut</button>}
          {data.selection.active && <button type="button" style={{ ...btnAction, background: 'var(--color-svv-field)' }} disabled={enCours} onClick={() => void poster('retirer')}>Revenir à la configuration d’origine</button>}
        </div>
        {!changementEnAttente && <div style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>Sélection acquise — cliquez une parcelle sur le schéma pour la modifier, ou « Modifier la sélection » pour la ré-appliquer.</div>}

        {/* Geste DÉLIBÉRÉ : on DIT ce qui va se recalculer (jamais un clic anodin). */}
        <div style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>⚠ « Valider » recalcule l’empreinte, la photo du bâti et la projection de ce permis. Réversible : « Revenir à la configuration d’origine » restaure l’état automatique à l’identique.</div>
        {composition.size === 0 && <div role="note" style={{ fontSize: 11.5, color: 'var(--color-svv-red)' }}>Sélectionnez au moins une parcelle : une empreinte vide n’est pas validable.</div>}
        {msg && <div role="status" style={{ fontSize: 12, color: msg.startsWith('Session') || msg.includes('impossible') ? 'var(--color-svv-red)' : 'var(--color-svv-green-ink)' }}>{msg}</div>}
      </div>
  ) : null;

  // INFOS DU SCHÉMA (lecture seule) : identité survolée, localisation, légende, comparatif « déclaré ↔ sélectionné ». En vue INTÉGRÉE : sous
  //   les contrôles. En PLEIN ÉCRAN : en COLONNE LATÉRALE à droite du schéma (parité « Bâtiments et projection » : infos/options en colonne).
  //   Ce ne sont PAS des contrôles de sélection → leur place en colonne de droite est conforme à la consigne. Rien si rien à dessiner.
  const infosSchema = !(data.motif || rienADessiner) ? (
    <>
      {/* Identité de la parcelle survolée (le survol seul, instantané ci-dessous, + une ligne stable au doigt). */}
      <div aria-live="polite" style={{ fontSize: 12, minHeight: '1.2em', color: 'var(--color-svv-muted)' }}>{survol ? survol.texte : 'Survolez ou touchez une parcelle pour l’identifier ; cliquez pour la (dé)sélectionner.'}</div>

      {/* OÙ L'ON EST */}
      <div style={{ fontSize: 12, color: 'var(--color-svv-ink)', borderTop: '1px solid var(--color-svv-line)', paddingTop: '.35rem' }}>
        <span aria-hidden>📍 </span><strong>{data.localisation.feuilleLibelle}</strong>
        {data.localisation.communeNom === null && data.localisation.communeCode ? <span style={{ color: 'var(--color-svv-red)' }}> — commune {data.localisation.communeCode} non résolue en base</span> : null}
        <span style={{ display: 'block', fontSize: 11, color: 'var(--color-svv-muted)' }}>{data.localisation.feuilleNote}</span>
      </div>

      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '.15rem .8rem', fontSize: 11, color: 'var(--color-svv-muted)' }}>
        {LEGENDE.map((l) => (
          <li key={l.cle} style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: l.cle === 'retiree' ? 'transparent' : l.couleur, opacity: l.cle === 'voisine' ? 0.4 : 0.6, border: `1px ${l.cle === 'retiree' ? 'dashed' : 'solid'} ${l.couleur}`, flexShrink: 0 }} />
            {l.texte}
          </li>
        ))}
      </ul>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--color-svv-muted)' }}>{data.nbRetenues} parcelle(s) du permis · {data.nbVoisines} voisine(s). Repère seulement — aucune mesure.</p>

      {/* PL-COMPARATIF — CONSTAT déclaré ↔ sélectionné, SOUS la légende. Lecture seule : n'ajoute/retire/coche/corrige/enregistre
          RIEN, ne touche pas « Valider la sélection ». Jetons EXISTANTS uniquement (vert -green-ink / rouge -red / neutre -muted). */}
      <div style={{ borderTop: '1px solid var(--color-svv-line)', paddingTop: '.4rem', display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-svv-ink)' }}>Déclaré au permis ↔ sélectionné sur le schéma</div>
        {!comparatifRendu.comparable ? (
          <div role="note" style={{ fontSize: 11.5, color: 'var(--color-svv-muted)' }}>{comparatifRendu.motif}</div>
        ) : (() => {
          // PHRASE DE BILAN (4 cas) + DÉTAIL GROUPÉ PAR NATURE de l'écart, tous DÉRIVÉS des statuts déjà classés (jamais recalculés).
          //   Chaque groupe n'est rendu QUE s'il contient ≥ 1 référence → on sait immédiatement de quel côté est chaque référence.
          const bilan = bilanComparatif(comparatifRendu);
          const parStatut = (s: LigneParcelleComparee['statut']) => comparatifRendu.lignes.filter((l) => l.statut === s);
          const communes = parStatut('commune'), manquantes = parStatut('declaree_non_selectionnee'), enTrop = parStatut('selectionnee_non_declaree'), aVerifier = parStatut('a_verifier');
          const groupe = (titre: string, lignes: LigneParcelleComparee[], couleur: string, marque: string) => lignes.length === 0 ? null : (
            <div key={titre}>
              <div style={{ fontSize: 11, fontWeight: 700, color: couleur }}>{titre}</div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.1rem' }}>
                {lignes.map((l) => <li key={l.cle} style={{ fontSize: 11.5, color: couleur }}><span aria-hidden>{marque} </span>{l.libelle}</li>)}
              </ul>
            </div>
          );
          return (
            <>
              {/* PHRASE DE BILAN : nomme la situation (correspondance / il manque / en trop / les deux). L'info est portée par le TEXTE. */}
              <div role="status" style={{ fontSize: 12, fontWeight: 700, color: bilan.ton === 'vert' ? 'var(--color-svv-green-ink)' : 'var(--color-svv-red)' }}>
                <span aria-hidden>{bilan.ton === 'vert' ? '✓ ' : '✗ '}</span>{bilan.phrase}
              </div>
              {/* DÉTAIL groupé : présentes des deux côtés (vert) ; déclarées non sélectionnées (rouge) ; sélectionnées non déclarées (rouge). */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
                {groupe('Présentes des deux côtés', communes, 'var(--color-svv-green-ink)', '✓')}
                {groupe('Déclarées au permis mais non sélectionnées', manquantes, 'var(--color-svv-red)', '✗')}
                {groupe('Sélectionnées mais non déclarées au permis', enTrop, 'var(--color-svv-red)', '✗')}
                {groupe('À vérifier — référence incomplète', aVerifier, 'var(--color-svv-muted)', '?')}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--color-svv-muted)' }}>Constat seulement (références rapprochées à l’écriture près). N’ajoute, ne coche ni ne corrige rien.</div>
            </>
          );
        })()}
      </div>
    </>
  ) : null;

  // BULLE DE SURVOL — petite bulle SUR LE SCHÉMA qui suit le curseur et porte le nom de la parcelle survolée (PL-B2, e52dfc7). Nœud/contenu/
  //   style/positionnement STRICTEMENT d'origine (zIndex 50 inchangé). Montée dans UNE seule vue à la fois : au sein du MODAL en plein écran
  //   (sinon, frère du modal en zIndex 50, elle était peinte DERRIÈRE le dialog zIndex 1000 depuis l'ajout du plein écran en 60aeda2 → invisible),
  //   à la racine sinon. Un seul nœud à la fois, aucune duplication. `pointer-events: none` → n'intercepte aucun clic (fermeture du modal intacte).
  const bulleSurvol = survol ? (
    <div role="status" aria-hidden style={{ position: 'fixed', left: survol.x + 12, top: survol.y + 12, zIndex: 50, pointerEvents: 'none', background: 'var(--color-svv-ink)', color: 'var(--color-svv-surface)', fontSize: 11, padding: '.15rem .4rem', borderRadius: '.3rem', whiteSpace: 'nowrap', boxShadow: '0 1px 4px rgba(0,0,0,.3)' }}>{survol.texte}</div>
  ) : null;

  return (
    <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>Planche cadastrale <span style={{ fontSize: 12, color: 'var(--color-svv-muted)', fontWeight: 400 }}>(cliquez une parcelle pour la sélectionner ; validez pour l’appliquer)</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '.8rem', alignItems: 'start' }}>
        {/* ALIGNEMENT (parité « Bâtiments et projection ») — la liseuse en mode « titre en en-tête » met l'aperçu EN HAUT (son titre
            « Liseuse des pièces » descend sous l'aperçu) : sa barre de zoom se retrouve sur la MÊME LIGNE que « Centrer : » à droite et
            l'aperçu démarre au MÊME Y que le schéma. C'est déjà une carte (svv-card) → parité de padding avec la colonne de droite. */}
        <LiseusePieces dossierId={dossierId} donneesPrechargees={donneesLiseuse} titreEnEntete />

        {/* Colonne SCHÉMA — vue INTÉGRÉE. Masquée quand le plein écran est ouvert : son contenu vit alors dans le MODAL (même état de
            composant, source de vérité UNIQUE → aucun id/contrôle en double). Contrôles TOUJOURS au-dessus du schéma (régression d1ef439). */}
        {!schemaPleinEcran && (
          <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', minWidth: 0 }}>
            {barreCentrage(true)}
            {blocControles}
            {schemaDessin(false)}
            {controlesSelection}
            {infosSchema}
          </div>
        )}
      </div>

      {/* PLEIN ÉCRAN — MODAL calqué sur « Agrandir le schéma » de « Bâtiments et projection » (BlocTraceEmprise:1853) : backdrop + carte
          centrée (svv-card, 95vw × 95vh), en-tête « titre + ✕ Fermer », puis les CONTRÔLES (centrage, saisie d'adresse, curseur, sélection)
          AU-DESSUS du schéma, et enfin DEUX ZONES [schéma | infos lecture seule] — comme la référence (contrôles/actions au-dessus, options en
          colonne). Pas d'empilement qui déborde sous le schéma. Fermeture : clic hors zone, ✕, ou Échap. SÉLECTION PARTAGÉE (même état). */}
      {schemaPleinEcran && (
        <div role="dialog" aria-modal="true" aria-label="Planche cadastrale agrandie — sélection des parcelles" onClick={() => setSchemaPleinEcran(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', zIndex: 1000, padding: '1.5vmin' }}>
          {/* SURFACE — la carte REMPLIT la fenêtre : `flex: 1` dans le fond en flex (largeur) + `align-items: stretch` par défaut (hauteur),
              avec une marge mince et homogène (padding 1.5vmin du fond). Plus de carte centrée dimensionnée au contenu — l'ancien
              `maxWidth 95vw / maxHeight 95vh` + centrage la bridait à ~la moitié de l'écran. `overflow: auto` = filet (fenêtre courte / mobile) ;
              en temps normal rien ne défile, l'espace va au schéma. */}
          <div onClick={(e) => e.stopPropagation()} className="svv-card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '.6rem', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 13 }}>Planche cadastrale</strong>
              <button type="button" style={{ ...btn(false), minHeight: 44 }} onClick={() => setSchemaPleinEcran(false)} aria-label="Fermer l’agrandissement du schéma">✕ Fermer</button>
            </div>
            {barreCentrage(false)}
            {blocControles}
            {/* (C) — CONTRÔLES DE SÉLECTION AU-DESSUS du schéma, dans la marge des contrôles (avec « Centrer : » et le curseur), jamais en
                colonne de droite (décision Arno). Ce sont les mêmes nœuds que la vue intégrée (état partagé, aucune duplication). */}
            {controlesSelection}
            {/* DEUX ZONES : schéma à gauche (prend l'espace), INFOS (survol / localisation / légende / comparatif — lecture seule, PAS des
                contrôles de sélection) en colonne latérale à droite, comme la référence range ses options à côté du dessin. En portrait, la
                colonne passe SOUS le schéma (flexWrap). */}
            {/* SURFACE — la rangée GRANDIT pour remplir la hauteur restante de la carte (`flex: 1`, `minHeight: 0`) et ses deux colonnes
                s'étirent sur cette hauteur (`alignItems: stretch`) → le schéma dispose de toute la hauteur. Le SCHÉMA prend l'espace
                (`flex: 1 1 420px`) ; la colonne d'INFOS garde une largeur stable et lisible (`flex: 0 1 320px` : ne s'étire PAS pour combler
                le vide, ne descend pas sous `minWidth 240`) et DÉFILE si son contenu dépasse (`overflowY: auto`) — le schéma, lui, ne défile
                pas. `flexWrap` : sur fenêtre étroite (mobile portrait) la colonne passe SOUS le schéma au lieu de l'écraser. */}
            <div style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap', alignItems: 'stretch', flex: 1, minHeight: 0 }}>
              <div style={{ flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>{schemaDessin(true)}</div>
              {infosSchema && <div style={{ flex: '0 1 320px', minWidth: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>{infosSchema}</div>}
            </div>
          </div>
          {/* La bulle de survol vit DANS le dialog en plein écran → contexte d'empilement du modal, peinte AU-DESSUS de la carte (donc sur le schéma), sans changer son zIndex. */}
          {bulleSurvol}
        </div>
      )}
      {/* En vue intégrée, la bulle est à la racine (rien ne la couvre). En plein écran elle est rendue DANS le modal (ci-dessus) → une seule instance à la fois. */}
      {!schemaPleinEcran && bulleSurvol}
    </div>
  );
}
