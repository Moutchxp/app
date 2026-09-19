'use client';

import { useEffect, useRef, useState } from 'react';
import { PROCESS_META, type Process } from '../../../../lib/sitadel/process';
import type { PermisVivier, ResultatRechercheVivier, ColonneTriVivier } from '../../../../lib/sitadel/rechercheVivier';

/** §D — critères d'une recherche du vivier, transférables d'un rail à l'autre lors d'un « voir les N autres… » : terme + types + tri. */
export interface CriteresRenvoi {
  q: string;
  types: string[];
  tri: { colonne: ColonneTriVivier; sens: 'asc' | 'desc' } | null;
}
/** §D — charge utile REÇUE par le moteur du rail d'ARRIVÉE : les critères + le rail cible + un `jeton` (nonce) → consommé UNE seule fois. */
export interface TransfertRenvoi extends CriteresRenvoi {
  cible: Process;
  jeton: number;
}

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
export function RechercheVivier({ process, categories, onBasculer, mode = 'auto', onPrepared, signalRafraichir = 0, transfert }: {
  process: Process;
  categories: { cle: string; libelle: string; rang: number }[];
  /** §D — bascule vers l'autre rail EN REPORTANT les critères courants (terme + types + tri). Le parent commute le process ET arme un
   *  `transfert` pour le rail d'arrivée. Le libellé du bouton ne change pas ; le CommutateurProcess, lui, n'emprunte JAMAIS ce chemin. */
  onBasculer: (p: Process, criteres: CriteresRenvoi) => void;
  /** Rail e-mail : le bouton d'action par ligne n'apparaît qu'en mode MANUEL (auto → aucun bouton). Téléservice : toujours. Défaut 'auto'. */
  mode?: 'auto' | 'manuel';
  /** Après une préparation réussie (POST /demandes {dossiersManuels}) → rafraîchit le carrousel + les compteurs (foyer du parent). */
  onPrepared?: () => void;
  /** §1 — SIGNAL de synchronisation du parent, incrémenté après toute action des vues sœurs (annulation/dépôt d'une carte du carrousel,
   *  préparation…). À chaque changement, la recherche COURANTE est réinterrogée (mêmes critères) → l'état des lignes DÉRIVE des données. */
  signalRafraichir?: number;
  /** §D — critères REÇUS de l'autre rail (report). À chaque nouveau `jeton`, le moteur du rail d'ARRIVÉE pré-remplit les champs, EXÉCUTE
   *  la recherche (scope = rail d'arrivée → total = le N annoncé), déplie le panneau si des filtres ont été transférés, et défile jusqu'à lui. */
  transfert?: TransfertRenvoi;
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
  const [retourPrep, setRetourPrep] = useState<{ texte: string; ok: boolean } | null>(null);
  const libelle = (cle: string): string => categories.find((c) => c.cle === cle)?.libelle ?? cle;
  const autre: Process = process === 'email' ? 'formulaire' : 'email';
  const estFormulaire = process === 'formulaire';
  const [moteurOuvert, setMoteurOuvert] = useState(false);
  const [typesCoches, setTypesCoches] = useState<Set<string>>(new Set());
  const [triColonne, setTriColonne] = useState<'' | ColonneTriVivier>('');
  const [triSens, setTriSens] = useState<'asc' | 'desc'>('asc');
  const basculerType = (cle: string): void => setTypesCoches((s) => { const n = new Set(s); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });
  const refRacine = useRef<HTMLDivElement | null>(null); // §D — cible de défilement à l'arrivée d'un report (renvoi vers l'autre rail).
  // §D — critères RÉELLEMENT appliqués à la recherche affichée (snapshot au succès). Le bouton de renvoi reporte CEUX-CI (pas l'état live du
  //   champ, qui pourrait avoir changé sans nouvelle recherche) → le N annoncé et les critères transférés proviennent de la MÊME recherche.
  const [critereApplique, setCritereApplique] = useState<CriteresRenvoi | null>(null);

  // B1 — les CRITÈRES (type coché OU tri explicite) valent désormais sur LES DEUX RAILS. Terme facultatif dès qu'un critère est présent ;
  //   sans terme NI critère → aucune recherche (bouton « Chercher » inactif + indice), règles ed3590c/a46f64b appliquées à l'identique.
  const aCritere = typesCoches.size > 0 || triColonne !== '';
  const aUnCritere = q.trim() !== '' || aCritere;

  // Recherche À PARTIR de critères EXPLICITES (jamais l'état, pour éviter toute course avec un setState) : `chercher()` lit l'état courant ;
  //   le report de rail (`transfert`) passe SES critères directement. Le scope reste le `process` du rail AFFICHÉ. Au succès, on mémorise les
  //   critères appliqués (`critereApplique`) → le bouton de renvoi les reporte tels quels, cohérents avec le `autreProcess` (N) affiché.
  async function chercherAvec(c: CriteresRenvoi): Promise<void> {
    const query = c.q.trim();
    if (query === '' && c.types.length === 0 && c.tri === null) { setRes(null); setCritereApplique(null); return; }
    setChargement(true); setErreur('');
    const params = new URLSearchParams({ q: query, process });
    if (c.types.length > 0) params.set('types', c.types.join(','));
    if (c.tri !== null) params.set('tri', `${c.tri.colonne}:${c.tri.sens}`);
    try {
      const r = await fetch(`/api/admin/permis/demandes/vivier-recherche?${params.toString()}`, { cache: 'no-store' });
      if (r.ok) { setRes((await r.json()) as ResultatRechercheVivier & { tronque: boolean; bloquees?: Bloquees; plafonds?: Plafonds }); setCritereApplique(c); }
      else setErreur('Recherche indisponible.');
    } catch { setErreur('Recherche indisponible.'); }
    finally { setChargement(false); }
  }
  const critereCourant = (): CriteresRenvoi => ({ q, types: [...typesCoches], tri: triColonne !== '' ? { colonne: triColonne, sens: triSens } : null });
  async function chercher(): Promise<void> { return chercherAvec(critereCourant()); }

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

  // §1 — SYNCHRO carrousel → moteur : à chaque signal du parent (annulation/dépôt d'une carte, préparation…), RÉINTERROGER la recherche
  //   COURANTE. Ne relance QUE si une recherche est affichée (res≠null couvre aussi le montage). L'état des lignes suit ainsi les données :
  //   un permis annulé redevient « demandable » (+ bouton), un permis préparé quitte les demandables. Aucune écriture (GET). La recherche
  //   de l'utilisateur (terme, types, tri, scroll) est conservée — `chercher()` LIT les états courants sans les toucher. `retourPrep` (feedback
  //   de préparation) N'est PAS effacé ici (seule une nouvelle recherche manuelle l'efface), pour que la confirmation survive au rechargement de la liste.
  useEffect(() => {
    if (res === null) return;
    void chercher();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalRafraichir]);

  // §D — REPORT DE RAIL : à réception d'un `transfert` pour CE rail (cible === process ; une SEULE fois par `jeton`), le moteur d'ARRIVÉE :
  //   ① pré-remplit les champs (terme, types, tri) à l'identique ; ② EXÉCUTE la recherche avec CES critères (scope = rail d'arrivée → le
  //   total = le N annoncé par le bouton) ; ③ DÉPLIE le panneau si des filtres (types/tri) ont été transférés, sinon le laisse fermé ;
  //   ④ DÉFILE jusqu'au moteur (prefers-reduced-motion respecté). Aucune écriture (GET). Le CommutateurProcess ne change JAMAIS le jeton
  //   → il ne passe jamais par ici (report réservé au bouton « voir les N autres… »).
  useEffect(() => {
    if (!transfert || transfert.cible !== process) return;
    setQ(transfert.q);
    setTypesCoches(new Set(transfert.types));
    setTriColonne(transfert.tri?.colonne ?? '');
    setTriSens(transfert.tri?.sens ?? 'asc');
    setMoteurOuvert(transfert.types.length > 0 || transfert.tri !== null);
    setRetourPrep(null);
    void chercherAvec({ q: transfert.q, types: transfert.types, tri: transfert.tri });
    const el = refRacine.current;
    if (el) {
      const reduit = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
      el.scrollIntoView?.({ behavior: reduit ? 'auto' : 'smooth', block: 'start' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfert?.jeton]);

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
    <div ref={refRacine} className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      {/* TITRE + DÉCLENCHEUR du moteur complet (LES DEUX RAILS depuis la fusion) sur la même ligne, à droite ; discret ; wrap sous le titre si étroit. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.4rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13, flex: '1 1 auto' }}>Rechercher un permis / une ville — vivier {PROCESS_META[process].court}</strong>
        <button type="button" aria-expanded={moteurOuvert} aria-controls="moteur-recherche-complet"
          onClick={() => setMoteurOuvert((o) => !o)}
          style={{ flex: '0 0 auto', background: 'none', border: 0, padding: '.4rem .3rem', minHeight: 44, fontSize: 12, color: 'var(--color-svv-muted)', textDecoration: 'underline', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <span aria-hidden="true">{moteurOuvert ? '▾ ' : '▸ '}</span>Moteur de recherche complet
        </button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); setRetourPrep(null); void chercher(); }} style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
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
                return (
                  // §2 — résultat sur DEUX lignes : ① identité ; ② adresse + état + action sur la MÊME 2e ligne (flex-wrap → repli propre en
                  //   iPhone portrait). Séparateur + respiration conservés (borderTop + padding) : le gain de hauteur vient de la compacité interne.
                  <li key={p.dossierId} style={{ borderTop: '1px solid var(--color-svv-line)', padding: '.5rem 0', display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
                    {/* ① IDENTITÉ : n° de permis · commune · type · date */}
                    <div>
                      <span style={{ fontWeight: 700 }}>{p.type ?? ''} {p.numDau}</span>
                      <span style={{ color: 'var(--color-svv-muted)' }}> · {nomCommune} · {libelle(p.categorie)}{p.dateAutorisation ? ` · ${p.dateAutorisation}` : ''}</span>
                    </div>
                    {/* ② ADRESSE + ÉTAT + ACTION, sur la 2e ligne (wrap en écran étroit ; jamais de débordement ni de troncature de l'adresse). */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem .6rem', alignItems: 'center' }}>
                      {/* ADRESSE (rue) — dit POURQUOI la ligne matche ; distincte de la commune (localité) ; rien si absente. */}
                      {p.adresse && <span style={{ color: 'var(--color-svv-muted)', fontSize: 12, wordBreak: 'break-word' }}>{p.adresse}</span>}
                      {bloc ? (
                        /* Commune BLOQUÉE (verrou référence) → JAMAIS de bouton d'action : la raison + le geste de déblocage (jamais contourné). */
                        <>
                          <span style={{ color: 'var(--color-svv-red)', fontWeight: 600 }}><span aria-hidden="true">⛔</span> bloqué — {nomCommune} en attente de l’accusé de {refBloc}</span>
                          <button type="button" className="svv-btn svv-btn-outline" style={{ minHeight: 44, padding: '.25rem .6rem', width: 'auto', color: 'var(--color-svv-red)' }}
                            disabled={debloquant === bloc.demandeId} onClick={() => void debloquer(bloc.demandeId)}>
                            Débloquer — pas d’accusé attendu
                          </button>
                          <span style={{ color: 'var(--color-svv-muted)', fontSize: 11 }}>
                            ou saisir la référence mairie sur la demande {refBloc} (onglet « En cours »).
                          </span>
                        </>
                      ) : p.enAttente ? (
                        /* §B — porté par une carte du carrousel (virtuelle) : état DÉRIVÉ du serveur, JAMAIS de bouton d'action (la carte
                           y est déjà). La ligne reste visible et comptée. Le mot porte l'info (pas la couleur seule). */
                        <span style={{ color: 'var(--color-svv-ink)', fontWeight: 600 }}><span aria-hidden="true">🗂️</span> carte en attente dans le carrousel</span>
                      ) : (
                        <>
                          <span style={{ color: 'var(--color-svv-green-ink)', fontWeight: 600 }}>demandable</span>
                          {/* PLAFOND mensuel (téléservice) — AFFICHÉ, ne bloque JAMAIS. */}
                          {plaf?.depasse && (
                            <span style={{ color: 'var(--color-svv-red)', fontSize: 12 }}>
                              <span aria-hidden="true">⚠</span> {nomCommune} au plafond mensuel ({plaf.consomme}/{plaf.plafond}) — tu peux quand même.
                            </span>
                          )}
                          {/* Bouton DISCRET (cible ≥ 44 px, largeur propre). §1 — plus de drapeau « préparé » local : après préparation, la
                              réinterrogation retire le permis des demandables (il est passé au carrousel / à la liste). L'état DÉRIVE des données. */}
                          {actionParLigne && (
                            <button type="button" className="svv-btn svv-btn-outline" style={{ minHeight: 44, padding: '.3rem .7rem', width: 'auto', fontSize: 13 }}
                              disabled={preparant === p.dossierId} onClick={() => void preparer(p)}>
                              {preparant === p.dossierId ? 'Préparation…' : libelleAction}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            </>
          )}
          {res.tronque && <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: '.3rem 0 0' }}>Affichage limité — précisez la recherche.</p>}
          {/* MENTION NON SILENCIEUSE — un SEUL bouton porte l'info (compteur + canal) ET, en une action : bascule vers l'autre rail AFFICHÉ
              EN REPORTANT les critères de LA recherche affichée (`critereApplique`, jamais l'état live) → le rail d'arrivée exécute la même
              recherche, dont le total = le N annoncé ici. Le libellé ne change pas. §D. */}
          {res.autreProcess > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '.35rem' }}>
              <button type="button" className="svv-btn svv-btn-outline"
                style={{ minHeight: 44, padding: '.4rem .8rem', width: 'auto', maxWidth: '100%', whiteSpace: 'normal', textAlign: 'center' }}
                onClick={() => onBasculer(autre, critereApplique ?? critereCourant())}>
                Voir {res.autreProcess === 1 ? 'l’autre résultat' : `les ${res.autreProcess} autres résultats`} dans le canal {PROCESS_META[autre].court}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
