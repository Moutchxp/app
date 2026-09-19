'use client';

import { useState } from 'react';
import { PROCESS_META, type Process } from '../../../../lib/sitadel/process';
import type { PermisVivier, ResultatRechercheVivier, ColonneTriVivier } from '../../../../lib/sitadel/rechercheVivier';

/**
 * MOTEUR DE RECHERCHE DU VIVIER — FUSIONNÉ (consultation + action). Recherche par n° de permis / ville / adresse, scopée au process
 * actif. Panneau « Moteur de recherche complet » (Type de permis multi + Tri) sur LES DEUX RAILS ; terme facultatif dès qu'un critère
 * est présent (type coché OU tri explicite) ; compteur « N affichés sur M » ; renvoi vers l'autre canal ; adresse par ligne.
 *
 * ACTION PAR LIGNE (permis DEMANDABLE), selon le rail :
 *   - TÉLÉSERVICE → « Afficher la carte dans le carrousel » : prépare la demande du permis choisi (POST /demandes {dossiersManuels}).
 *     Via `dejaPreparees` (cartesDepotAutoTeleservice), le brouillon REMPLACE la carte automatique de sa commune et sort EN 1re position
 *     (listerADeposer ORDER BY cree_le DESC) ; les autres cartes du carrousel sont intactes ; l'automatisation reprend au dépôt.
 *   - E-MAIL, mode MANUEL → « Préparer cette demande » (MÊME chemin) ; mode AUTO → aucun bouton d'action (consultation seule).
 * Les deux boutons empruntent EXACTEMENT le chemin d'écriture existant — aucun nouveau chemin. Une commune BLOQUÉE (verrou référence)
 * n'a jamais de bouton actif : la raison est affichée + le geste « Débloquer ». Le PLAFOND mensuel est affiché mais ne bloque pas.
 * Mobile-first (cibles ≥ 44 px), pas de dark mode.
 */
export function RechercheVivier({ process, categories, onBasculer, mode = 'auto', onPrepared }: {
  process: Process;
  categories: { cle: string; libelle: string; rang: number }[];
  onBasculer: (p: Process) => void;
  /** Rail e-mail : le bouton d'action par ligne n'apparaît qu'en mode MANUEL (auto → aucun bouton). Téléservice : toujours. Défaut 'auto'. */
  mode?: 'auto' | 'manuel';
  /** Après une préparation réussie (POST /demandes {dossiersManuels}) → rafraîchit le carrousel + les compteurs (foyer du parent). */
  onPrepared?: () => void;
}) {
  // `bloquees` : par code_insee, la commune téléservice en attente d'accusé (réf. SVAV de la demande qui bloque). `plafonds` : état du
  //   plafond mensuel par commune (téléservice) — AFFICHÉ, ne bloque JAMAIS. Les deux ne sont calculés côté serveur que pour 'formulaire'.
  type Bloquees = Record<string, { reference: string | null; demandeId: number }>;
  type Plafonds = Record<string, { consomme: number; plafond: number; depasse: boolean }>;
  const [q, setQ] = useState('');
  const [res, setRes] = useState<(ResultatRechercheVivier & { tronque: boolean; bloquees?: Bloquees; plafonds?: Plafonds }) | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');
  const [debloquant, setDebloquant] = useState<number | null>(null);
  // Action par ligne (préparer un permis choisi), repris de RechercheVivierManuel : dossierId en cours, déjà préparés, retour de section.
  const [preparant, setPreparant] = useState<number | null>(null);
  const [prepares, setPrepares] = useState<Set<number>>(new Set());
  const [retourPrep, setRetourPrep] = useState<{ texte: string; ok: boolean } | null>(null);
  const libelle = (cle: string): string => categories.find((c) => c.cle === cle)?.libelle ?? cle;
  const autre: Process = process === 'email' ? 'formulaire' : 'email';
  const estFormulaire = process === 'formulaire';
  const [moteurOuvert, setMoteurOuvert] = useState(false);
  const [typesCoches, setTypesCoches] = useState<Set<string>>(new Set());
  const [triColonne, setTriColonne] = useState<'' | ColonneTriVivier>('');
  const [triSens, setTriSens] = useState<'asc' | 'desc'>('asc');
  const basculerType = (cle: string): void => setTypesCoches((s) => { const n = new Set(s); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });

  // B1 — les CRITÈRES (type coché OU tri explicite) valent désormais sur LES DEUX RAILS. Terme facultatif dès qu'un critère est présent ;
  //   sans terme NI critère → aucune recherche (bouton « Chercher » inactif + indice), règles ed3590c/a46f64b appliquées à l'identique.
  const aCritere = typesCoches.size > 0 || triColonne !== '';
  const aUnCritere = q.trim() !== '' || aCritere;

  async function chercher(): Promise<void> {
    const query = q.trim();
    if (query === '' && !aCritere) { setRes(null); return; }
    setChargement(true); setErreur('');
    const params = new URLSearchParams({ q: query, process });
    if (typesCoches.size > 0) params.set('types', [...typesCoches].join(','));
    if (triColonne !== '') params.set('tri', `${triColonne}:${triSens}`);
    try {
      const r = await fetch(`/api/admin/permis/demandes/vivier-recherche?${params.toString()}`, { cache: 'no-store' });
      if (r.ok) { setRes((await r.json()) as ResultatRechercheVivier & { tronque: boolean; bloquees?: Bloquees; plafonds?: Plafonds }); setPrepares(new Set()); setRetourPrep(null); }
      else setErreur('Recherche indisponible.');
    } catch { setErreur('Recherche indisponible.'); }
    finally { setChargement(false); }
  }

  // ISSUE DE SECOURS depuis le vivier : « pas d'accusé attendu » lève le verrou de la commune (geste humain), puis on relance la recherche.
  async function debloquer(demandeId: number): Promise<void> {
    setDebloquant(demandeId); setErreur('');
    try {
      const r = await fetch('/api/admin/permis/demandes/debloquer', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ demandeId }),
      });
      if (!r.ok) { setErreur('Déblocage indisponible.'); return; }
      await chercher();
    } catch { setErreur('Déblocage indisponible.'); }
    finally { setDebloquant(null); }
  }

  // B3 — préparer la demande d'un permis CHOISI, par le chemin EXISTANT (POST /demandes {dossiersManuels}). Repris À L'IDENTIQUE de
  //   RechercheVivierManuel (piège bigint→chaîne : l'API sérialise dossierId en CHAÎNE, la route attend un ENTIER → conversion au point
  //   d'appel ; sinon la garde stricte refuse). Le brouillon créé apparaît dans le carrousel (téléservice) / la liste (e-mail).
  const messageEchec = (statut: number, repli: string): string => (statut === 401 || statut === 403 ? 'Session expirée — reconnecte-toi.' : repli);
  async function preparer(p: PermisVivier): Promise<void> {
    const dossierId = Number(p.dossierId);
    if (!Number.isInteger(dossierId)) { setRetourPrep({ texte: `Identifiant de permis illisible (${p.numDau}) — préparation impossible.`, ok: false }); return; }
    setPreparant(p.dossierId); setRetourPrep(null);
    try {
      const r = await fetch('/api/admin/permis/demandes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dossiersManuels: [dossierId] }) });
      const d = (await r.json().catch(() => ({}))) as { demandesCreees?: number; ignoresConflit?: number; lotsInvalides?: { raison?: string }[]; erreur?: string };
      if (r.ok && (d.demandesCreees ?? 0) >= 1) {
        setPrepares((s) => new Set(s).add(p.dossierId));
        setRetourPrep({ texte: estFormulaire
          ? `${p.type ?? ''} ${p.numDau} — carte ajoutée en 1re position du carrousel (elle remplace la carte automatique de ${p.communeNom ?? 'sa commune'}).`
          : `Demande préparée pour ${p.type ?? ''} ${p.numDau} — elle apparaît dans la liste des demandes.`, ok: true });
        onPrepared?.();
      } else if (r.ok && (d.ignoresConflit ?? 0) >= 1) {
        setRetourPrep({ texte: `${p.numDau} est déjà rattaché à une demande — rien préparé.`, ok: false });
      } else if (r.ok) {
        setRetourPrep({ texte: `Préparation impossible : ${d.lotsInvalides?.[0]?.raison ?? 'permis non préparable'}.`, ok: false });
      } else {
        setRetourPrep({ texte: messageEchec(r.status, d.erreur ? `Refusé : ${d.erreur}.` : 'Préparation impossible.'), ok: false });
      }
    } catch { setRetourPrep({ texte: 'Préparation impossible (réseau).', ok: false }); }
    finally { setPreparant(null); }
  }

  // B3 — le bouton d'action par ligne : téléservice → toujours (« Afficher la carte ») ; e-mail → mode MANUEL seulement (« Préparer »).
  const actionParLigne = estFormulaire || mode === 'manuel';
  const libelleAction = estFormulaire ? 'Afficher la carte dans le carrousel' : 'Préparer cette demande';

  return (
    <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      {/* TITRE + DÉCLENCHEUR du moteur complet (LES DEUX RAILS depuis la fusion) sur la même ligne, à droite ; discret ; wrap sous le titre si étroit. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.4rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13, flex: '1 1 auto' }}>Rechercher un permis / une ville — vivier {PROCESS_META[process].court}</strong>
        <button type="button" aria-expanded={moteurOuvert} aria-controls="moteur-recherche-complet"
          onClick={() => setMoteurOuvert((o) => !o)}
          style={{ flex: '0 0 auto', background: 'none', border: 0, padding: '.4rem .3rem', minHeight: 44, fontSize: 12, color: 'var(--color-svv-muted)', textDecoration: 'underline', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <span aria-hidden="true">{moteurOuvert ? '▾ ' : '▸ '}</span>Moteur de recherche complet
        </button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void chercher(); }} style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="n° de permis, ville ou adresse"
          aria-label="Rechercher un permis (numéro), une ville ou une adresse dans le vivier"
          style={{ flex: '1 1 12rem', minHeight: 40, padding: '.4rem .55rem', border: '1px solid var(--color-svv-line)', borderRadius: '.45rem', fontSize: 14 }} />
        {/* PANNEAU (les deux rails) ENTRE le champ et « Chercher » ; dépliage instantané (respecte prefers-reduced-motion). */}
        {moteurOuvert && (
          <div id="moteur-recherche-complet" style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', gap: '.7rem', padding: '.6rem', border: '1px solid var(--color-svv-line)', borderRadius: '.5rem', background: 'var(--color-svv-field)' }}>
            {/* Groupe 1 — TYPE DE PERMIS : cases multi. Référentiel = prop `categories` (= categoriesConnues(config)), JAMAIS une liste en dur. */}
            <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
              <legend style={{ fontSize: 12, fontWeight: 700, padding: 0 }}>Type de permis</legend>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
                {categories.map((c) => (
                  <label key={c.cle} style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', minHeight: 44, padding: '.2rem .55rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={typesCoches.has(c.cle)} onChange={() => basculerType(c.cle)} style={{ width: 18, height: 18 }} />
                    {c.libelle}
                  </label>
                ))}
              </div>
              <span style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>Aucun coché = tous les types.</span>
            </fieldset>
            {/* Groupe 2 — TRI : colonne × sens, sur les champs RÉELLEMENT présents dans le vivier (date, commune). Pas de « surface » (absente de PermisVivier). */}
            <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'flex-end' }}>
              <legend style={{ fontSize: 12, fontWeight: 700, padding: 0, width: '100%' }}>Tri</legend>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', fontSize: 12 }}>Trier par
                <select value={triColonne} onChange={(e) => setTriColonne(e.target.value as '' | ColonneTriVivier)} style={{ minHeight: 44, padding: '.3rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13 }}>
                  <option value="">Ordre par défaut</option>
                  <option value="date">Date d’autorisation</option>
                  <option value="commune">Commune</option>
                </select>
              </label>
              {triColonne !== '' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', fontSize: 12 }}>Sens
                  <select value={triSens} onChange={(e) => setTriSens(e.target.value as 'asc' | 'desc')} style={{ minHeight: 44, padding: '.3rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13 }}>
                    <option value="asc">Croissant</option>
                    <option value="desc">Décroissant</option>
                  </select>
                </label>
              )}
            </fieldset>
          </div>
        )}
        <button type="submit" className="svv-btn svv-btn-primary" style={{ minHeight: 40, padding: '.4rem .8rem' }}
          disabled={chargement || !aUnCritere}
          title={!aUnCritere ? 'Saisis un terme, ou coche un type de permis dans le moteur de recherche complet' : undefined}>
          <span aria-hidden="true">🔍</span> Chercher
        </button>
      </form>
      {/* Indice NON-mensonger quand « Chercher » est inactif : il manque un critère, ce n'est pas une panne. Visible (pas hover-only). */}
      {!aUnCritere && (
        <p style={{ fontSize: 11, color: 'var(--color-svv-muted)', margin: 0 }}>Saisis un terme, ou coche un type de permis dans le moteur de recherche complet.</p>
      )}

      {chargement && <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }} aria-live="polite">Recherche…</p>}
      {erreur && <p role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', margin: 0 }}>{erreur}</p>}

      {res && !chargement && (
        <div style={{ fontSize: 13 }}>
          {/* Retour de la dernière préparation (niveau section) : la ligne préparée reste visible, marquée « préparé » ci-dessous. */}
          {retourPrep && <p role="status" aria-live="polite" style={{ fontSize: 12, margin: '0 0 .35rem', color: retourPrep.ok ? 'var(--color-svv-green-ink)' : 'var(--color-svv-red)' }}>{retourPrep.texte}</p>}
          {res.resultats.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--color-svv-muted)' }}>
              Aucun permis demandable dans le process {PROCESS_META[process].court} pour cette recherche.
            </p>
          ) : (
            <>
            {/* COMPTEUR HONNÊTE — le cap 50 ne doit jamais laisser croire que l'affiché est le tout. `total` = COUNT (en mémoire, mêmes critères, AVANT cap). */}
            <p style={{ margin: '0 0 .35rem', fontSize: 12, color: 'var(--color-svv-muted)' }} aria-live="polite">
              <strong style={{ color: 'var(--color-svv-ink)' }}>{res.resultats.length}</strong> affiché{res.resultats.length > 1 ? 's' : ''} sur <strong style={{ color: 'var(--color-svv-ink)' }}>{res.total}</strong> permis demandable{res.total > 1 ? 's' : ''}
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
              {res.resultats.map((p: PermisVivier) => {
                const bloc = res.bloquees?.[p.codeInsee];
                const plaf = res.plafonds?.[p.codeInsee];
                const nomCommune = p.communeNom ?? p.codeInsee;
                const refBloc = bloc?.reference ?? (bloc ? `demande #${bloc.demandeId}` : '');
                const prepare = prepares.has(p.dossierId);
                return (
                  // B2 — chaque résultat est un BLOC nettement séparé : séparateur + respiration verticale ; identité, adresse, état/action en colonne.
                  <li key={p.dossierId} style={{ borderTop: '1px solid var(--color-svv-line)', padding: '.55rem 0', display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
                    <div>
                      <span style={{ fontWeight: 700 }}>{p.type ?? ''} {p.numDau}</span>
                      <span style={{ color: 'var(--color-svv-muted)' }}> · {nomCommune} · {libelle(p.categorie)}{p.dateAutorisation ? ` · ${p.dateAutorisation}` : ''}</span>
                    </div>
                    {/* ADRESSE (rue) — dit POURQUOI la ligne matche (« rue de Paris » d'une commune de banlieue). Distincte de la commune ; rien si absente. */}
                    {p.adresse && <div style={{ color: 'var(--color-svv-muted)', fontSize: 12, wordBreak: 'break-word' }}>{p.adresse}</div>}
                    {bloc ? (
                      /* Commune BLOQUÉE (verrou référence) → JAMAIS de bouton d'action : la raison + le geste de déblocage (jamais contourné). */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                        <span style={{ color: 'var(--color-svv-red)', fontWeight: 600 }}><span aria-hidden="true">⛔</span> bloqué — {nomCommune} en attente de l’accusé de {refBloc}</span>
                        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                          <button type="button" className="svv-btn svv-btn-outline" style={{ minHeight: 44, padding: '.25rem .6rem', width: 'auto', color: 'var(--color-svv-red)' }}
                            disabled={debloquant === bloc.demandeId} onClick={() => void debloquer(bloc.demandeId)}>
                            Débloquer — pas d’accusé attendu
                          </button>
                          <span style={{ color: 'var(--color-svv-muted)', fontSize: 11 }}>
                            ou saisir la référence mairie sur la demande {refBloc} (onglet « En cours »).
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center' }}>
                        <span style={{ color: 'var(--color-svv-green-ink)', fontWeight: 600 }}>demandable</span>
                        {/* PLAFOND mensuel (téléservice) — AFFICHÉ, ne bloque JAMAIS (repris de RechercheVivierManuel). */}
                        {plaf?.depasse && (
                          <span style={{ color: 'var(--color-svv-red)', fontSize: 12 }}>
                            <span aria-hidden="true">⚠</span> {nomCommune} au plafond mensuel ({plaf.consomme}/{plaf.plafond}) — tu peux quand même.
                          </span>
                        )}
                        {prepare ? (
                          <span style={{ color: 'var(--color-svv-green-ink)', fontWeight: 600 }}>
                            <span aria-hidden="true">✓</span> {estFormulaire ? 'Carte ajoutée — voir le carrousel ci-dessus' : 'Préparé — voir la liste des demandes ci-dessous'}
                          </span>
                        ) : actionParLigne ? (
                          /* Bouton DISCRET (sobre, pas pleine largeur, cible ≥ 44 px) : téléservice « Afficher la carte », e-mail manuel « Préparer ». */
                          <button type="button" className="svv-btn svv-btn-outline" style={{ minHeight: 44, padding: '.3rem .7rem', width: 'auto', fontSize: 13 }}
                            disabled={preparant === p.dossierId} onClick={() => void preparer(p)}>
                            {preparant === p.dossierId ? 'Préparation…' : libelleAction}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            </>
          )}
          {res.tronque && <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: '.3rem 0 0' }}>Affichage limité — précisez la recherche.</p>}
          {/* MENTION NON SILENCIEUSE — un SEUL bouton porte l'info (compteur + canal) ET navigue vers l'autre rail AFFICHÉ (onBasculer → setProcessActif : aucun écrit). */}
          {res.autreProcess > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '.35rem' }}>
              <button type="button" className="svv-btn svv-btn-outline"
                style={{ minHeight: 44, padding: '.4rem .8rem', width: 'auto', maxWidth: '100%', whiteSpace: 'normal', textAlign: 'center' }}
                onClick={() => onBasculer(autre)}>
                Voir {res.autreProcess === 1 ? 'l’autre résultat' : `les ${res.autreProcess} autres résultats`} dans le canal {PROCESS_META[autre].court}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
