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
};

const FILTRES_VIDES: Filtres = { commune: '', scoreMin: '', scoreMax: '', dernierEtage: '', residencePrincipale: '', verdict: '', creeApres: '', creeAvant: '' };

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
  return p;
}

const TAILLE = 25;

export function InternautesVue() {
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES);
  const [applique, setApplique] = useState<Filtres>(FILTRES_VIDES); // filtres réellement soumis
  const [page, setPage] = useState(1);
  const [etat, setEtat] = useState<{ statut: 'chargement' } | { statut: 'erreur' } | { statut: 'ok'; total: number; lignes: Ligne[] }>({ statut: 'chargement' });
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailChargement, setDetailChargement] = useState(false);
  // Actions cycle de vie (LOT 4) sur le dossier ouvert : rectification (édition A) et effacement (droit RGPD).
  const [detailId, setDetailId] = useState<string | null>(null);
  const [edition, setEdition] = useState(false);
  const [formEdit, setFormEdit] = useState({ prenom: '', nom: '', email: '', telephone: '' });
  const [confirmEffacement, setConfirmEffacement] = useState(false);
  const [actionEnCours, setActionEnCours] = useState(false);
  const [actionErreur, setActionErreur] = useState<string | null>(null);

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
          setEtat({ statut: 'erreur' });
          return;
        }
        const data = await res.json();
        if (annule) return;
        setEtat({ statut: 'ok', total: Number(data.total) || 0, lignes: Array.isArray(data.lignes) ? data.lignes : [] });
      } catch {
        if (!annule) setEtat({ statut: 'erreur' });
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

  return (
    <div className="svv-int" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{CSS}</style>

      {/* FILTRES */}
      <div className="svv-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10 }}>
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', gridColumn: '1 / -1', flexWrap: 'wrap' }}>
          <button type="button" style={btnRouge} onClick={filtrer}>Filtrer</button>
          <button type="button" style={btnOutline} onClick={reinitialiser}>Réinitialiser</button>
          <a style={{ ...btnOutline, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} href={`/api/admin/internautes/export?${versParams(applique).toString()}`}>
            Exporter (CSV)
          </a>
        </div>
      </div>

      {/* RÉSULTATS */}
      {etat.statut === 'chargement' && <div className="svv-card" style={{ textAlign: 'center', color: 'var(--color-svv-muted)' }}>Chargement…</div>}
      {etat.statut === 'erreur' && <div className="svv-card" style={{ textAlign: 'center', color: 'var(--color-svv-red)' }}>Liste indisponible (réservée au rôle administrateur).</div>}
      {etat.statut === 'ok' && (
        <>
          <div style={{ fontSize: '.85rem', color: 'var(--color-svv-muted)' }}>
            {total} profil{total > 1 ? 's' : ''} recontactable{total > 1 ? 's' : ''} (consentement F1 actif).
          </div>
          {etat.lignes.length === 0 ? (
            <div className="svv-card" style={{ textAlign: 'center', color: 'var(--color-svv-muted)' }}>Aucun profil pour ces critères.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {etat.lignes.map((l) => (
                <div key={l.id} className="svv-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                    <div style={{ fontWeight: 800, color: 'var(--color-svv-ink)' }}>{[l.prenom, l.nom].filter(Boolean).join(' ') || '—'}</div>
                    <div style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)', wordBreak: 'break-word' }}>{l.email ?? '—'}{l.telephone ? ` · ${l.telephone}` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '.78rem', color: 'var(--color-svv-ink)' }}>
                    <span>{l.commune_insee ?? '—'}</span>
                    <span>{l.verdict === 'SANS_VIS_A_VIS' ? 'Sans V-à-V' : l.verdict === 'VIS_A_VIS' ? 'Vis-à-vis' : l.verdict === 'INDETERMINE' ? 'Indéterminé' : '—'}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{l.score != null ? l.score.toFixed(1) : '—'}</span>
                  </div>
                  <button type="button" style={btnOutline} onClick={() => ouvrirDetail(l.id)}>Voir</button>
                </div>
              ))}
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

      {/* DÉTAIL (droit d'accès) */}
      {(detailChargement || detail) && (
        <div className="svv-card" style={{ border: '1px solid var(--color-svv-red)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <strong style={{ color: 'var(--color-svv-ink)' }}>Dossier de la personne</strong>
            <button type="button" style={{ ...btnOutline, marginLeft: 'auto' }} onClick={() => setDetail(null)}>Fermer</button>
          </div>
          {detailChargement && <div style={{ color: 'var(--color-svv-muted)' }}>Chargement…</div>}
          {detail && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '.85rem' }}>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--color-svv-muted)', fontSize: '.75rem', textTransform: 'uppercase' }}>Identité</div>
                <div style={{ color: 'var(--color-svv-ink)' }}>
                  {String(detail.internaute.prenom ?? '')} {String(detail.internaute.nom ?? '')} · {String(detail.internaute.email ?? '—')}
                  {detail.internaute.telephone ? ` · ${String(detail.internaute.telephone)}` : ''}
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--color-svv-muted)', fontSize: '.75rem', textTransform: 'uppercase' }}>Consentements</div>
                {detail.consentements.map((c) => (
                  <div key={c.finalite} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: 'var(--color-svv-ink)' }}>{c.libelle}</span>
                    <span style={{ color: c.actif ? 'var(--color-svv-green)' : 'var(--color-svv-muted)', fontWeight: 700 }}>
                      {c.actif ? 'Actif' : c.etat ? c.etat : 'Aucun'}{c.depuis ? ` · ${new Date(c.depuis).toLocaleDateString('fr-FR')}` : ''}
                    </span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--color-svv-muted)', fontSize: '.75rem', textTransform: 'uppercase' }}>Analyses ({detail.projets.length})</div>
                {detail.projets.map((p, i) => (
                  <div key={i} style={{ color: 'var(--color-svv-ink)' }}>
                    {String(p.commune_insee ?? '—')} · {String(p.verdict ?? '—')} · score {p.score != null ? String(p.score) : '—'} · étage {String(p.etage ?? '—')}
                  </div>
                ))}
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
      )}
    </div>
  );
}
