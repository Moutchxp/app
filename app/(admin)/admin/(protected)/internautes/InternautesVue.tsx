'use client';

import { useEffect, useState, type CSSProperties } from 'react';

/**
 * Vue interactive du module « Internautes » (LOT 3). Client PUR : ne touche jamais la base ; consomme
 * `/api/admin/internautes*` (réservé administrateur, invariant consentement F1 actif appliqué CÔTÉ SERVEUR — cette
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

type Filtres = {
  commune: string;
  scoreMin: string;
  scoreMax: string;
  dernierEtage: '' | 'true' | 'false';
  residencePrincipale: '' | 'true' | 'false';
  verdict: string;
  creeApres: string;
  creeAvant: string;
  // Restriction PARMI les F1 (jamais un ajout) : exiger AUSSI le consentement F2 (email) / F3 (retargeting tiers).
  aF2: boolean;
  aF3: boolean;
};

const FILTRES_VIDES: Filtres = { commune: '', scoreMin: '', scoreMax: '', dernierEtage: '', residencePrincipale: '', verdict: '', creeApres: '', creeAvant: '', aF2: false, aF3: false };

function versParams(f: Filtres): URLSearchParams {
  const p = new URLSearchParams();
  if (f.commune.trim()) p.set('commune', f.commune.trim());
  if (f.scoreMin.trim()) p.set('scoreMin', f.scoreMin.trim());
  if (f.scoreMax.trim()) p.set('scoreMax', f.scoreMax.trim());
  if (f.dernierEtage) p.set('dernierEtage', f.dernierEtage);
  if (f.residencePrincipale) p.set('residencePrincipale', f.residencePrincipale);
  if (f.verdict) p.set('verdict', f.verdict);
  if (f.creeApres) p.set('creeApres', f.creeApres);
  if (f.creeAvant) p.set('creeAvant', f.creeAvant);
  if (f.aF2) p.set('f2', 'true'); // restreint aux F1 ayant AUSSI F2 (AND côté serveur ; jamais un OR)
  if (f.aF3) p.set('f3', 'true'); // restreint aux F1 ayant AUSSI F3
  return p;
}

const TAILLE = 25;

export function InternautesVue() {
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES);
  const [applique, setApplique] = useState<Filtres>(FILTRES_VIDES); // filtres réellement soumis
  const [page, setPage] = useState(1);
  const [etat, setEtat] = useState<{ statut: 'chargement' } | { statut: 'erreur'; code: number } | { statut: 'ok'; total: number; lignes: Ligne[] }>({ statut: 'chargement' });
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

  // Fetch sur (filtres appliqués, page). Patron admin (cf. audit/page.tsx) : setState DANS l'IIFE async (jamais
  // synchrone dans le corps de l'effet) + garde `annule` anti-course. La liste est réservée administrateur côté
  // serveur ; un non-admin reçoit 403 → état « erreur » (message « réservé »).
  useEffect(() => {
    let annule = false;
    void (async () => {
      setEtat({ statut: 'chargement' });
      try {
        const p = versParams(applique);
        p.set('page', String(page));
        p.set('taille', String(TAILLE));
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
  }, [applique, page]);

  const filtrer = () => {
    setPage(1);
    setApplique(filtres);
  };
  const reinitialiser = () => {
    setFiltres(FILTRES_VIDES);
    setPage(1);
    setApplique(FILTRES_VIDES);
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
  const detailPanel = (detailChargement || detail) ? (
    <div className="svv-card" style={{ border: '1px solid var(--color-svv-red)', marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <button type="button" style={{ ...btnOutline, marginLeft: 'auto' }} onClick={fermerDetail}>Fermer</button>
      </div>
      {detailChargement && <div style={{ color: 'var(--color-svv-muted)' }}>Chargement…</div>}
      {detail && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '.85rem' }}>
          {/* En-tête : Prénom Nom EN GROS, coordonnées, date + heure de création (Europe/Paris). Plus d'intitulés. */}
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-svv-ink)', lineHeight: 1.15 }}>
              {[String(detail.internaute.prenom ?? ''), String(detail.internaute.nom ?? '')].filter((s) => s.trim()).join(' ') || (detail.internaute.efface_a ? '(identité effacée)' : '—')}
            </div>
            <div style={{ fontSize: '.85rem', color: 'var(--color-svv-muted)', wordBreak: 'break-word' }}>
              {String(detail.internaute.email ?? '—')}{detail.internaute.telephone ? ` · ${String(detail.internaute.telephone)}` : ''}
            </div>
            <div style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>Créé le {dateHeureFr(detail.internaute.cree_a)}</div>
          </div>

          {/* Consentements RGPD (3 finalités) — état + date. Conservés. */}
          <div>
            <div style={{ fontWeight: 700, color: 'var(--color-svv-muted)', fontSize: '.75rem', textTransform: 'uppercase' }}>Consentements</div>
            {detail.consentements.map((c) => (
              <div key={c.finalite} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: 'var(--color-svv-ink)' }}>{c.libelle}</span>
                <span style={{ color: c.actif ? 'var(--color-svv-green)' : 'var(--color-svv-muted)', fontWeight: 700 }}>
                  {c.actif ? 'Actif' : c.etat ? c.etat : 'Aucun'}{c.depuis ? ` · ${dateFr(c.depuis)}` : ''}
                </span>
              </div>
            ))}
          </div>

          {/* Analyse(s) COMPLÈTE(S) : tous les champs SAISIS (payload aplati, label FR) + TOUT le résultat de scoring. Rien masqué. */}
          <div>
            <div style={{ fontWeight: 700, color: 'var(--color-svv-muted)', fontSize: '.75rem', textTransform: 'uppercase' }}>Analyse{detail.projets.length > 1 ? 's' : ''} ({detail.projets.length})</div>
            {detail.projets.map((p, i) => {
              const payload = (p.payload && typeof p.payload === 'object' ? p.payload : {}) as Record<string, unknown>;
              const rpOui = p.residence_principale === true;
              const adresseRp = payload.adresseResidence;
              const norm = p.adresse_normalisee == null ? '' : String(p.adresse_normalisee);
              const saisie = p.adresse_saisie == null ? '' : String(p.adresse_saisie);
              const saisieDifferente = saisie.trim() !== '' && saisie !== norm;
              // Clés payload déjà rendues explicitement dans « Le bien » ; le reste passe en catch-all → rien masqué.
              const CLES_BIEN = new Set(['typeBien', 'surface', 'nbPieces', 'epoque', 'balcon', 'terrasse', 'jardin', 'adresseResidence']);
              const autres = Object.entries(payload).filter(([k]) => !CLES_BIEN.has(k));
              const groupe: CSSProperties = { fontWeight: 800, color: 'var(--color-svv-ink)', fontSize: '.78rem', marginTop: 8 };
              return (
                <div key={i} style={{ border: '1px solid var(--color-svv-line)', borderRadius: 8, padding: 8, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                  {/* Grandeurs de visée (migration 026). Dossiers ANCIENS = colonnes NULL → Champ affiche « — » (pas de crash).
                      numeric pg = chaîne → Number() ; AFFICHAGE à 2 décimales (toFixed) — valeur STOCKÉE brute inchangée,
                      aucun recalcul. Lat/lon gardent leur précision complète (jamais arrondis). */}
                  <Champ label="Azimut de l’axe" valeur={p.azimut_deg == null ? null : `${Number(p.azimut_deg).toFixed(2)}°`} />
                  <Champ label="Hauteur sous plafond" valeur={p.hauteur_sous_plafond_m == null ? null : `${Number(p.hauteur_sous_plafond_m).toFixed(2)} m`} />
                  <Champ label="Hauteur de vision" valeur={p.hauteur_vision_m == null ? null : `${Number(p.hauteur_vision_m).toFixed(2)} m`} />
                </div>
              );
            })}
          </div>

          {/* Actions cycle de vie (LOT 4) — admin-only. Effacement = règle ASYMÉTRIQUE (A+C purgés, preuve B conservée). */}
          {detail.internaute.efface_a ? (
            <div style={{ color: 'var(--color-svv-muted)', borderTop: '1px solid var(--color-svv-line)', paddingTop: 8 }}>
              Profil effacé le {new Date(String(detail.internaute.efface_a)).toLocaleDateString('fr-FR')} — identité anonymisée, analyses supprimées ; la preuve de consentement est conservée.
            </div>
          ) : (
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
          )}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="svv-int" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{CSS}</style>

      {/* FILTRES — grille COMMUNE (colonnes via .svv-int-filtres) : les 2 rangées partagent les mêmes colonnes,
          alignées verticalement, bas des contrôles alignés (align-items:end). */}
      <div className="svv-card svv-int-filtres" style={{ display: 'grid', gap: 10, alignItems: 'start', background: 'var(--color-svv-field)' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.75rem', fontWeight: 700, color: 'var(--color-svv-muted)' }}>
          Commune (INSEE)
          <input style={champ} value={filtres.commune} onChange={(e) => setFiltres({ ...filtres, commune: e.target.value })} placeholder="ex. 92004" inputMode="numeric" />
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
        <fieldset style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.75rem', fontWeight: 700, color: 'var(--color-svv-muted)', border: 0, padding: 0, margin: 0 }}>
          <legend style={{ padding: 0 }}>Consentement (parmi les F1)</legend>
          {/* Ces cases RESTREIGNENT l'ensemble F1 (AND côté serveur) : F1 reste toujours requis, jamais un non-F1. */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, fontWeight: 600, color: 'var(--color-svv-ink)', cursor: 'pointer' }}>
            <input type="checkbox" checked={filtres.aF2} onChange={(e) => setFiltres({ ...filtres, aF2: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--color-svv-red)' }} />
            a aussi F2 (email)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, fontWeight: 600, color: 'var(--color-svv-ink)', cursor: 'pointer' }}>
            <input type="checkbox" checked={filtres.aF3} onChange={(e) => setFiltres({ ...filtres, aF3: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--color-svv-red)' }} />
            a aussi F3 (retargeting)
          </label>
        </fieldset>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', gridColumn: '1 / -1', flexWrap: 'wrap' }}>
          <button type="button" style={btnRouge} onClick={filtrer}>Filtrer</button>
          <button type="button" style={btnOutline} onClick={reinitialiser}>Réinitialiser</button>
          <a style={{ ...btnOutline, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} href={`/api/admin/internautes/export?${versParams(applique).toString()}`}>
            Exporter (CSV)
          </a>
          {/* Correction 2 : export SANS filtre (filtres VIDES) → tous les consentants F1 via le MÊME invariant + journal. */}
          <a style={{ ...btnRouge, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} href={`/api/admin/internautes/export?${versParams(FILTRES_VIDES).toString()}`} title="Exporter tous les consentants F1, sans appliquer les filtres">
            Exporter toute la base
          </a>
        </div>
      </div>

      {/* RÉSULTATS */}
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
            {total} profil{total > 1 ? 's' : ''} recontactable{total > 1 ? 's' : ''} (consentement F1 actif).
          </div>
          {etat.lignes.length === 0 ? (
            <div className="svv-card" style={{ textAlign: 'center', color: 'var(--color-svv-muted)' }}>Aucun profil pour ces critères.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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

/** Verdict lisible (affichage). */
const verdictFr = (v: unknown) =>
  v === 'SANS_VIS_A_VIS' ? 'Sans vis-à-vis' : v === 'VIS_A_VIS' ? 'Vis-à-vis' : v === 'INDETERMINE' ? 'Indéterminé' : '—';

/** Ligne label/valeur générique (lecture seule). */
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

/** Détail COMPLET en lecture seule : identité + champs SAISIS (payload) + résultat de SCORING + consentements. */
function DetailComplet({ detail }: { detail: Detail }) {
  const i = detail.internaute;
  const titre: CSSProperties = { fontWeight: 700, color: 'var(--color-svv-muted)', fontSize: '.72rem', textTransform: 'uppercase', marginTop: 6 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '.82rem' }}>
      <div style={titre}>Identité (saisie)</div>
      <Champ label="Prénom" valeur={i.prenom} />
      <Champ label="Nom" valeur={i.nom} />
      <Champ label="Email" valeur={i.email} />
      <Champ label="Téléphone" valeur={i.telephone} />
      <Champ label="Source de collecte" valeur={i.source_collecte} />
      <Champ label="Créé le" valeur={dateFr(i.cree_a)} />
      {i.efface_a ? <Champ label="Effacé le" valeur={dateFr(i.efface_a)} /> : null}

      <div style={titre}>Consentements</div>
      {detail.consentements.map((c) => (
        <Champ key={c.finalite} label={c.libelle} valeur={`${c.actif ? 'Actif' : c.etat ?? 'Aucun'}${c.depuis ? ` · ${dateFr(c.depuis)}` : ''}`} />
      ))}

      <div style={titre}>Analyses ({detail.projets.length})</div>
      {detail.projets.map((p, idx) => {
        const payload = (p.payload && typeof p.payload === 'object' ? p.payload : {}) as Record<string, unknown>;
        return (
          <div key={idx} style={{ border: '1px solid var(--color-svv-line)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ color: 'var(--color-svv-muted)', fontSize: '.72rem' }}>Saisi au tunnel (v{String(p.version_tunnel ?? '—')}) · {dateFr(p.cree_a)}</div>
            {Object.entries(payload).map(([k, v]) => (
              <Champ key={k} label={k} valeur={v} />
            ))}
            <div style={{ color: 'var(--color-svv-muted)', fontSize: '.72rem', marginTop: 4 }}>Résultat (scoring)</div>
            <Champ label="Verdict" valeur={p.verdict} />
            <Champ label="Score" valeur={p.score} />
            <Champ label="Étage" valeur={p.etage} />
            <Champ label="Dernier étage" valeur={p.dernier_etage} />
            <Champ label="Résidence principale" valeur={p.residence_principale} />
            <Champ label="Commune (INSEE)" valeur={p.commune_insee} />
            <Champ label="Latitude" valeur={p.lat} />
            <Champ label="Longitude" valeur={p.lon} />
            <Champ label="Adresse saisie" valeur={p.adresse_saisie} />
            <Champ label="Adresse normalisée" valeur={p.adresse_normalisee} />
          </div>
        );
      })}
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
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--color-svv-ink)' }}>Vérification — derniers internautes</h2>
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
                    {detail && <DetailComplet detail={detail} />}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
