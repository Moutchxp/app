'use client';

import { useState } from 'react';
import type { PermisVivier, ResultatRechercheVivier } from '../../../../lib/sitadel/rechercheVivier';

/**
 * MODE MANUEL (téléservice) — recherche dans le VIVIER par n° de permis ou par ville, puis PRÉPARE la demande d'un permis
 * CHOISI À LA MAIN, hors des critères de sélection du tri automatique. RÉUTILISE la SOURCE existante (endpoint
 * `/api/admin/permis/demandes/vivier-recherche`, même vivier que RechercheVivier — aucune 2e définition du vivier) et le chemin
 * de création EXISTANT (POST `/api/admin/permis/demandes` avec `dossiersManuels`). La carte produite apparaît dans le MÊME
 * carrousel que les autres (via `onPrepared`, qui rafraîchit les vues sœurs).
 *
 * RÈGLES (décidées) : le VERROU DE COMMUNE (une seule demande téléservice en vol par mairie) est signalé AVANT toute tentative
 * (« bloqué », avec la demande qui bloque + le geste qui lève le blocage) — aucun bouton « Préparer » sur une commune bloquée.
 * Le PLAFOND MENSUEL est AFFICHÉ mais NE BLOQUE PAS : au plafond, on prévient en toutes lettres et on laisse préparer.
 *
 * Mobile-first (cibles ≥ 40 px), le mot porte l'info (jamais la couleur seule). Session expirée → « reconnecte-toi » (jamais un
 * message de panne de données). Recherche à la soumission (pas de charge du vivier à chaque frappe).
 */
type Bloquees = Record<string, { reference: string | null; demandeId: number }>;
type Plafonds = Record<string, { consomme: number; plafond: number; depasse: boolean }>;
type Reponse = ResultatRechercheVivier & { tronque: boolean; bloquees?: Bloquees; plafonds?: Plafonds };

export function RechercheVivierManuel({ categories, onPrepared }: {
  categories: { cle: string; libelle: string; rang: number }[];
  onPrepared: () => void;
}) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Reponse | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');
  const [debloquant, setDebloquant] = useState<number | null>(null);
  const [preparant, setPreparant] = useState<number | null>(null);       // dossierId dont la préparation est en cours
  const [prepares, setPrepares] = useState<Set<number>>(new Set());       // dossierId déjà préparés (carte partie au carrousel)
  const [retour, setRetour] = useState<{ texte: string; ok: boolean } | null>(null); // retour de niveau SECTION
  const libelle = (cle: string): string => categories.find((c) => c.cle === cle)?.libelle ?? cle;

  // Auth (session expirée / révoquée) → on invite à se reconnecter, JAMAIS « données indisponibles ».
  const messageEchec = (statut: number, repli: string): string =>
    statut === 401 || statut === 403 ? 'Session expirée — reconnecte-toi.' : repli;

  async function chercher(): Promise<void> {
    const query = q.trim();
    if (query === '') { setRes(null); setRetour(null); return; }
    setChargement(true); setErreur(''); setRetour(null);
    try {
      const r = await fetch(`/api/admin/permis/demandes/vivier-recherche?q=${encodeURIComponent(query)}&process=formulaire`, { cache: 'no-store' });
      if (r.ok) { setRes((await r.json()) as Reponse); setPrepares(new Set()); }
      else setErreur(messageEchec(r.status, 'Recherche indisponible.'));
    } catch { setErreur('Recherche indisponible.'); }
    finally { setChargement(false); }
  }

  // ISSUE DE SECOURS du verrou de commune (« pas d'accusé attendu ») — geste HUMAIN, puis on relance la recherche : la commune
  //   n'est plus bloquée. L'autre sortie (saisir la référence mairie sur la demande) est rappelée dans le libellé.
  async function debloquer(demandeId: number): Promise<void> {
    setDebloquant(demandeId); setErreur('');
    try {
      const r = await fetch('/api/admin/permis/demandes/debloquer', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ demandeId }),
      });
      if (!r.ok) { setErreur(messageEchec(r.status, 'Déblocage indisponible.')); return; }
      await chercher();
    } catch { setErreur('Déblocage indisponible.'); }
    finally { setDebloquant(null); }
  }

  // PRÉPARE la demande du permis choisi, par le chemin EXISTANT (POST …/demandes avec `dossiersManuels`). Succès → la carte part
  //   au carrousel : on marque le permis « préparé » (sa ligne le montre) et on notifie le parent (onPrepared → rafraîchit le
  //   carrousel + les compteurs). Le plafond ne bloque pas : ce bouton reste actif même au plafond.
  async function preparer(p: PermisVivier): Promise<void> {
    // ⚠️ L'id de dossier est un bigint : l'API le sérialise en CHAÎNE ("11142"). La route attend un ENTIER (validerIdsLot, strict —
    //   « une chaîne n'est jamais un id valide », piège bigint→chaîne). On le convertit ICI, au point d'appel : sans ça la requête
    //   part avec une chaîne et la garde saine « au moins un des deux » la refuse (« aucun lot sélectionné »). Jamais NaN → garde.
    const dossierId = Number(p.dossierId);
    if (!Number.isInteger(dossierId)) { setRetour({ texte: `Identifiant de permis illisible (${p.numDau}) — préparation impossible.`, ok: false }); return; }
    setPreparant(p.dossierId); setRetour(null);
    try {
      const r = await fetch('/api/admin/permis/demandes', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dossiersManuels: [dossierId] }),
      });
      const d = (await r.json().catch(() => ({}))) as { demandesCreees?: number; ignoresConflit?: number; lotsInvalides?: { raison?: string }[]; erreur?: string };
      if (r.ok && (d.demandesCreees ?? 0) >= 1) {
        setPrepares((s) => new Set(s).add(p.dossierId));
        setRetour({ texte: `Demande préparée pour ${p.type ?? ''} ${p.numDau} — elle apparaît dans le carrousel ci-dessous.`, ok: true });
        onPrepared(); // la carte apparaît dans le même carrousel que les autres, sans distinction
      } else if (r.ok && (d.ignoresConflit ?? 0) >= 1) {
        setRetour({ texte: `${p.numDau} est déjà rattaché à une demande — rien préparé.`, ok: false });
      } else if (r.ok) {
        const raison = d.lotsInvalides?.[0]?.raison ?? 'permis non préparable';
        setRetour({ texte: `Préparation impossible : ${raison}.`, ok: false });
      } else {
        setRetour({ texte: messageEchec(r.status, d.erreur ? `Refusé : ${d.erreur}.` : 'Préparation impossible.'), ok: false });
      }
    } catch { setRetour({ texte: 'Préparation impossible (réseau).', ok: false }); }
    finally { setPreparant(null); }
  }

  return (
    <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <strong style={{ fontSize: 13 }}>Choisir un permis à demander — vivier Téléservice</strong>
      <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }}>
        Cherche par numéro de permis ou par ville, puis prépare la demande du permis voulu. Ce mode ignore les critères du tri
        automatique (ancienneté, ordre d’examen, cap de candidats) : tu peux préparer un permis que le tri n’aurait pas proposé.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); void chercher(); }} style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="n° de permis ou ville"
          aria-label="Rechercher un permis (numéro) ou une ville dans le vivier téléservice"
          style={{ flex: '1 1 12rem', minWidth: 0, minHeight: 40, padding: '.4rem .55rem', border: '1px solid var(--color-svv-line)', borderRadius: '.45rem', fontSize: 14 }} />
        <button type="submit" className="svv-btn svv-btn-primary" style={{ minHeight: 40, padding: '.4rem .8rem' }} disabled={chargement}>
          <span aria-hidden="true">🔍</span> Chercher
        </button>
      </form>

      {chargement && <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }} aria-live="polite">Recherche…</p>}
      {erreur && <p role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', margin: 0 }}>{erreur}</p>}
      {retour && <p role="status" aria-live="polite" style={{ fontSize: 12, margin: 0, color: retour.ok ? 'var(--color-svv-green-ink)' : 'var(--color-svv-red)' }}>{retour.texte}</p>}

      {res && !chargement && (
        <div style={{ fontSize: 13 }}>
          {res.resultats.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--color-svv-muted)' }}>Aucun permis demandable dans le vivier Téléservice pour cette recherche.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
              {res.resultats.map((p: PermisVivier) => {
                const bloc = res.bloquees?.[p.codeInsee];
                const plaf = res.plafonds?.[p.codeInsee];
                const nomCommune = p.communeNom ?? p.codeInsee;
                const refBloc = bloc?.reference ?? (bloc ? `demande #${bloc.demandeId}` : '');
                const prepare = prepares.has(p.dossierId);
                return (
                  <li key={p.dossierId} style={{ borderBottom: '1px solid var(--color-svv-line)', paddingBottom: '.35rem' }}>
                    <div>
                      <span style={{ fontWeight: 700 }}>{p.type ?? ''} {p.numDau}</span>
                      <span style={{ color: 'var(--color-svv-muted)' }}> · {nomCommune} · {libelle(p.categorie)}{p.dateAutorisation ? ` · ${p.dateAutorisation}` : ''}</span>
                    </div>
                    {bloc ? (
                      /* VERROU DE COMMUNE signalé AVANT toute tentative : pas de bouton « Préparer », mais le geste qui lève le blocage. */
                      <div style={{ marginTop: '.2rem', display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                        <span style={{ color: 'var(--color-svv-red)', fontWeight: 600 }}>
                          <span aria-hidden="true">⛔</span> Commune bloquée — {nomCommune} est en attente de l’accusé de {refBloc}. Impossible de préparer une 2e demande téléservice ici.
                        </span>
                        <button type="button" className="svv-btn svv-btn-outline" style={{ minHeight: 32, padding: '.2rem .6rem', color: 'var(--color-svv-red)' }}
                          disabled={debloquant === bloc.demandeId} onClick={() => void debloquer(bloc.demandeId)}>
                          Débloquer — pas d’accusé attendu
                        </button>
                        <span style={{ color: 'var(--color-svv-muted)', fontSize: 11 }}>
                          ou saisir la référence mairie sur la demande {refBloc} (onglet « En cours »).
                        </span>
                      </div>
                    ) : prepare ? (
                      <div style={{ marginTop: '.2rem', color: 'var(--color-svv-green-ink)', fontWeight: 600 }}>
                        <span aria-hidden="true">✓</span> Préparé — voir le carrousel ci-dessous.
                      </div>
                    ) : (
                      <div style={{ marginTop: '.2rem', display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                        {/* PLAFOND MENSUEL — AFFICHÉ mais NE BLOQUE PAS : au plafond, on prévient, le bouton reste actif. */}
                        {plaf?.depasse && (
                          <span style={{ color: 'var(--color-svv-red)', fontSize: 12 }}>
                            <span aria-hidden="true">⚠</span> {nomCommune} est au plafond mensuel ({plaf.consomme}/{plaf.plafond} ce mois) — tu peux préparer quand même.
                          </span>
                        )}
                        <button type="button" className="svv-btn svv-btn-primary" style={{ minHeight: 40, padding: '.35rem .8rem' }}
                          disabled={preparant === p.dossierId} onClick={() => void preparer(p)}>
                          {preparant === p.dossierId ? 'Préparation…' : 'Préparer cette demande'}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {res.tronque && <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: '.3rem 0 0' }}>Affichage limité — précise la recherche.</p>}
        </div>
      )}
    </div>
  );
}
