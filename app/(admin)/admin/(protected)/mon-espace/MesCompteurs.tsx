'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoutonAffichage, FournisseurAffichage, FournisseurChangerAffichage, FournisseurConsolide, FournisseurNoms, montantAffiche, useAffichageRetenu } from '../transaction/commun';
import { CSS } from '../transaction/EcransTransaction';
import { CarteAffaire, DetailAffaire, useColonnesNegociateurs, type HoteDetail, type VuePersonnelle } from '../transaction/OngletCompromis';
import { resolveurDe } from '../../../../lib/transaction/statutLigne';
import { empreinteDe, type MesAffaires, type VenteMonEspace } from '../../../../lib/mon-espace/mesAffaires';
import { CSS_NOUVEAU_COMPROMIS, envoyerMonEspace, NouveauCompromis, URL_REFERENCES } from './NouveauCompromis';
import { HistoriqueAffaire } from './HistoriqueAffaire';
import { GestesAffaire } from './GestesAffaire';
import { CSS_MES_STATISTIQUES, MesStatistiques } from './MesStatistiques';
import { MesApporteurs, posterApporteur, URL_APPORTEURS } from './MesApporteurs';
import { ContexteNouvelApporteur, type FaconNouvelApporteur } from '../transaction/NouvelApporteur';
import type { Doublon, SaisieApporteur } from '../../../../lib/mon-espace/apporteurs';

/** 🔴 LOT 9 — les doublons de TOUT l'annuaire pour une saisie (le serveur) ; trop peu de saisi pour comparer : aucun. */
async function chercherDoublons(s: SaisieApporteur): Promise<Doublon[]> {
  const assez = `${s.prenom}${s.nom}`.replace(/\s/g, '').length >= 3 || s.telephone.replace(/\D/g, '').length >= 9 || s.email.includes('@');
  if (!assez) return [];
  try {
    const q = new URLSearchParams({ nom: s.nom, prenom: s.prenom, telephone: s.telephone, email: s.email });
    const r = await fetch(`${URL_APPORTEURS}/doublons?${q.toString()}`, { cache: 'no-store' });
    const j = (await r.json()) as { etat?: string; data?: Doublon[] };
    return j.etat === 'ok' && Array.isArray(j.data) ? j.data : [];
  } catch { return []; }
}
import { DUREE_SURBRILLANCE_MS, doitRelire, messageMiseAJour, misesAJourDesAutres, peutBattre, PERIODE_MON_ESPACE_MS } from '../../../../lib/mon-espace/rafraichir';
import { FormulaireDossier, etatRepartitionDe, type References } from '../transaction/FormulaireDossier';

/**
 * 🔴 MON ESPACE (Arno, 02/11/2026) — l'accueil de l'espace.
 *   · LOT 3 : deux compteurs, « Mes compromis en cours » et « Mes ventes actées cette année » (nombre — mon CA, décision 1), bascule « HT | TTC »
 *     du Suivi CA (la même mémoire du navigateur) ; données de /api/admin/mon-espace/affaires, déjà filtrées par le serveur.
 *   · LOT 4 : les compteurs ouvrent leur onglet ; « Mes compromis en cours » et « Mes ventes » (toutes années, sélecteur d'année, total de
 *     l'année) avec EXACTEMENT la carte et la fiche dépliée de la tuile Suivi CA (`CarteAffaire`, `DetailAffaire`), en vue personnelle : sans la
 *     commission de l'autre collègue, sans aucun geste (ils arrivent aux lots 5 à 7). Les listes montrent les ventes que le serveur a comptées
 *     pour moi (les mêmes identifiants que les compteurs), rien d'autre.
 *   · LOT 5 : « + Nouveau compromis » (le parcours `NouveauCompromis`) ; enregistré, l'écran relit ses affaires et rouvre « Mes compromis en
 *     cours », la nouvelle affaire en haut, dépliée.
 *   · LOT 6 : sous la fiche dépliée, « Modifier » (ses négociateurs et les administrateurs : le formulaire de la tuile, les commissions non
 *     visibles pour un collaborateur, garde de version) et « Historique des modifications » (lecture seule).
 *   · LOT 7 : les gestes (« Acte signé », « Annuler le compromis », « Revenir en compromis », `GestesAffaire`, confirmés dans la page) ; le
 *     RAFRAÎCHISSEMENT AUTOMATIQUE (`rafraichir.ts`) : l'empreinte relue toutes les 15 s et au retour sur l'onglet, les listes relues seulement si
 *     elle a changé, jamais pendant une saisie ou une confirmation ; « Léa a mis à jour « X » » et la ligne éclairée quand c'est un autre.
 */
export const URL_EMPREINTE = '/api/admin/mon-espace/empreinte';
type Lu = { etat: 'chargement' } | { etat: 'ok'; data: MesAffaires } | { etat: 'erreur' };
type Onglet = 'compromis' | 'ventes' | 'statistiques' | 'apporteurs';

export const URL_MES_AFFAIRES = '/api/admin/mon-espace/affaires';
const rien = (): void => {};

/** Tri : compromis par date de signature (plus récent en haut, sans date en bas) ; ventes par date d'acte (à défaut, son mois). PUR. */
export function trierMesCompromis(vs: readonly VenteMonEspace[]): VenteMonEspace[] {
  return [...vs].sort((a, b) => (b.dateCompromis ?? '').localeCompare(a.dateCompromis ?? '') || b.id - a.id);
}
const jourActe = (v: VenteMonEspace): string => v.dossier?.dateActe ?? (v.mois === null ? `${v.annee}-00-00` : `${v.annee}-${String(v.mois).padStart(2, '0')}-00`);
export function trierMesVentes(vs: readonly VenteMonEspace[]): VenteMonEspace[] {
  return [...vs].sort((a, b) => jourActe(b).localeCompare(jourActe(a)) || b.id - a.id);
}

export function MesCompteurs() {
  const [lu, setLu] = useState<Lu>({ etat: 'chargement' });
  const [unite, setUnite] = useAffichageRetenu();
  const [onglet, setOnglet] = useState<Onglet>('compromis');
  const [annee, setAnnee] = useState<number | null>(null);
  // 🔴 LOT 5 — le parcours de création ouvert ; l'affaire qui vient d'être créée (en haut, dépliée) ; le compteur de relecture.
  const [parcours, setParcours] = useState(false);
  const [nouvelle, setNouvelle] = useState<number | null>(null);
  const [lecture, setLecture] = useState(0);
  // 🔴 LOT 6 — l'affaire en cours de modification, l'historique ouvert, les références du formulaire (lues à la première modification).
  const [edition, setEdition] = useState<VenteMonEspace | null>(null);
  const [historique, setHistorique] = useState<number | null>(null);
  const [refs, setRefs] = useState<(References & { titulaireId: number; administrateur: boolean }) | null>(null);
  const [motifEdition, setMotifEdition] = useState<string | null>(null);
  const modifier = async (v: VenteMonEspace): Promise<void> => {
    setMotifEdition(null);
    if (refs !== null) { setEdition(v); return; }
    try {
      const r = await fetch(URL_REFERENCES, { cache: 'no-store' });
      const j = (await r.json()) as { etat?: string; data?: References & { titulaireId: number; administrateur: boolean } };
      if (r.ok && j.etat === 'ok' && j.data !== undefined) { setRefs(j.data); setEdition(v); } else setMotifEdition('Le formulaire n’a pas pu être préparé. Rechargez la page.');
    } catch { setMotifEdition('Le formulaire n’a pas pu être préparé. Rechargez la page.'); }
  };
  const listes = useRef<HTMLDivElement>(null);
  useColonnesNegociateurs(listes);
  // 🔴 LOT 7 — le rafraîchissement automatique : l'empreinte vue en dernier, les affaires d'avant (pour dire qui a changé quoi), la relecture en
  // cours est-elle automatique, les gestes ouverts (pause) ; le message, les lignes éclairées, « reconnectez-vous ».
  const empreinteVue = useRef<string | null>(null);
  const precedentes = useRef<VenteMonEspace[] | null>(null);
  const relectureAuto = useRef(false);
  const gestesOuverts = useRef(new Set<number>());
  const occupe = useRef(false);
  const [miseAJour, setMiseAJour] = useState<string | null>(null);
  const [eclairees, setEclairees] = useState<number[]>([]);
  const [reconnexion, setReconnexion] = useState(false);
  const surOccupe = useCallback((id: number, o: boolean): void => { if (o) gestesOuverts.current.add(id); else gestesOuverts.current.delete(id); }, []);
  useEffect(() => { occupe.current = parcours || edition !== null || lu.etat === 'chargement'; });
  // un geste ouvert (saisie, confirmation) ne redessine pas cet écran : la pause relit l'ensemble des gestes ouverts au moment du battement
  const enPause = (): boolean => occupe.current || gestesOuverts.current.size > 0;
  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const r = await fetch(URL_MES_AFFAIRES, { cache: 'no-store' });
        const j = (await r.json()) as { etat?: string; data?: MesAffaires };
        if (!vivant) return;
        if (!(r.ok && j.etat === 'ok' && j.data !== undefined)) { if (!relectureAuto.current) setLu({ etat: 'erreur' }); relectureAuto.current = false; return; }
        const nouvelles = j.data.ventes;
        // 🔴 LOT 7 — une relecture AUTOMATIQUE : ce qu'un AUTRE collaborateur a changé se dit, et sa ligne s'éclaire brièvement.
        if (relectureAuto.current && precedentes.current !== null) {
          const m = misesAJourDesAutres(precedentes.current, nouvelles, j.data.titulaire.id);
          if (m.length > 0) { setMiseAJour(messageMiseAJour(m)); setEclairees(m.map((x) => x.id)); setTimeout(() => { if (vivant) setEclairees([]); }, DUREE_SURBRILLANCE_MS); }
        }
        relectureAuto.current = false;
        precedentes.current = nouvelles;
        // L'empreinte de RÉFÉRENCE = celle des affaires réellement chargées (la même fonction que le serveur) : un changement survenu entre ce
        // chargement et le battement suivant n'est jamais perdu.
        empreinteVue.current = empreinteDe(nouvelles);
        setLu({ etat: 'ok', data: j.data });
      } catch { if (vivant && !relectureAuto.current) setLu({ etat: 'erreur' }); relectureAuto.current = false; }
    })();
    return () => { vivant = false; };
  }, [lecture]);
  useEffect(() => {
    let vivant = true;
    const battre = async (): Promise<void> => {
      if (!peutBattre({ visible: document.visibilityState === 'visible', chargementEnCours: false, gesteEnCours: enPause(), releveEnCours: false })) return;
      try {
        const r = await fetch(URL_EMPREINTE, { cache: 'no-store' });
        if (!vivant) return;
        // session expirée : « reconnectez-vous » ; toute autre panne : nouvel essai silencieux au prochain battement (aucun faux message)
        if (r.status === 401) { setReconnexion(true); return; }
        if (!r.ok) return;
        const j = (await r.json()) as { data?: { empreinte?: unknown } };
        const e = j.data?.empreinte;
        if (typeof e !== 'string') return;
        setReconnexion(false);
        if (enPause()) return;
        if (doitRelire(empreinteVue.current, e)) { relectureAuto.current = true; setLecture((x) => x + 1); }
      } catch { /* réseau : nouvel essai silencieux */ }
    };
    const minuterie = setInterval(() => { void battre(); }, PERIODE_MON_ESPACE_MS);
    const auRetour = (): void => { if (document.visibilityState === 'visible') void battre(); };
    document.addEventListener('visibilitychange', auRetour);
    void battre();
    return () => { vivant = false; clearInterval(minuterie); document.removeEventListener('visibilitychange', auRetour); };
  }, []);
  const data = lu.etat === 'ok' ? lu.data : null;
  // 🔴 LOT 9 — « + Nouvel apporteur » (onglet et formulaire de compromis) : la façon de « Mon espace » (zéro doublon, « L'utiliser »).
  const titulaireId = data?.titulaire.id ?? null;
  const facon = useMemo((): FaconNouvelApporteur => ({
    envoyer: async (apporteur) => { const r = await posterApporteur({ action: 'creer', apporteur }); return { motif: r.motif, id: r.data?.id, doublons: r.doublons }; },
    chercher: chercherDoublons,
    // Sans la 450, le refus est sans conséquence : l'apporteur est quand même choisi (dans le compromis, il est enregistré sur la vente).
    utiliser: async (id) => { await posterApporteur({ action: 'utiliser', apporteurId: id }); },
    collegueDefaut: titulaireId,
  }), [titulaireId]);
  const hote = useMemo((): HoteDetail | null => (data === null ? null : {
    d: { lotD: data.schema?.lotD ?? true, personneType: data.schema?.personneType ?? true, uniteCommission: data.schema?.uniteCommission ?? true,
      prixVente: data.schema?.prixVente ?? true, mandat: data.schema?.mandat ?? false, negociateurs: [], apporteurs: [], personnes: [], disponible: data.disponible,
      aujourdhui: data.aujourdhui, annulation: false },
    vue: null, societe: 'tous', statutDuLibelle: resolveurDe(data.statutsNegociateurs), relire: rien, signalerPorteuse: rien,
    enregistrerApporteur: async () => null, ouvrirEdition: rien, ouvrirPersonnes: rien, acte: null, setActe: rien, signer: async () => {},
    historique: null, setHistorique: rien, ouvrirAnnulation: rien,
  }), [data]);

  if (lu.etat === 'chargement') return <p className="loc-muet" role="status" data-mon-espace-chargement>Chargement de vos affaires…</p>;
  if (lu.etat === 'erreur' || data === null || hote === null) return <p className="loc-alerte loc-alerte--orange" role="alert" data-mon-espace-erreur>Vos affaires n’ont pas pu être lues. Rechargez la page.</p>;
  const { compteurs, disponible } = data;
  const total = (c: { ca: { htC: number; ttcC: number } }): string => montantAffiche(unite, c.ca.htC / 100, c.ca.ttcC / 100);
  const nombre = (n: number, un: string, plusieurs: string): string => `${n} ${n > 1 ? plusieurs : un}`;
  const parId = new Map(data.ventes.map((v) => [v.id, v]));
  const des = (ids: readonly number[]): VenteMonEspace[] => ids.flatMap((id) => { const v = parId.get(id); return v === undefined ? [] : [v]; });
  const annees = compteurs.parAnnee ?? [];
  const anneeVue = annee ?? compteurs.actees.annee;
  const choixAnnees = [...new Set([compteurs.actees.annee, ...annees.map((a) => a.annee)])].sort((a, b) => b - a);
  const anneeChoisie = annees.find((a) => a.annee === anneeVue) ?? { annee: anneeVue, nb: 0, ids: [], ca: { htC: 0, ttcC: 0 } };
  const tries = trierMesCompromis(des(compteurs.compromis.ids));
  // 🔴 LOT 5 — l'affaire qui vient d'être créée : en haut, quelle que soit sa date de compromis.
  const compromis = nouvelle === null ? tries : [...tries.filter((v) => v.id === nouvelle), ...tries.filter((v) => v.id !== nouvelle)];
  const ventes = trierMesVentes(des(anneeChoisie.ids));
  const ouvrir = (o: Onglet): void => { setOnglet(o); if (o === 'ventes') setAnnee(compteurs.actees.annee); };
  const personnel = (v: VenteMonEspace): VuePersonnelle => ({ mesCotes: v.mesCotes, commissionsRetirees: v.commissionsRetirees === true });
  const peutAgir = (v: VenteMonEspace): boolean => (v.mesCotes.length > 0 || data.titulaire.administrateur) && disponible;
  const relire = (): void => setLecture((x) => x + 1);
  const carte = (v: VenteMonEspace, section: 'compromis' | 'vente') => (
    <div key={v.id} className={eclairees.includes(v.id) ? 'mes-eclairee' : undefined} data-eclairee={eclairees.includes(v.id) ? 'oui' : undefined}>
    <CarteAffaire v={v} aujourdhui={data.aujourdhui} section={`mon-espace-${section}`} vue={null} statutDuLibelle={hote.statutDuLibelle} personnel={personnel(v)}
      donnees={{ 'data-ma-vente': String(v.id) }} ouvertInitial={section === 'compromis' && v.id === nouvelle}>
      <DetailAffaire v={v} hote={hote} etiquettes={section === 'vente'} personnel={personnel(v)} />
      {/* 🔴 LOT 6 — « Modifier » : ses négociateurs et les administrateurs (le serveur refuse les autres, 403) ; l'historique, en lecture. */}
      <div className="trx-actions trx-barre-actions mes-actions">
        {/* 🔴 LOT 7 — les gestes (décision 5) : un négociateur de l'affaire ou un administrateur ; confirmés dans la page. */}
        <GestesAffaire v={v} aujourdhui={data.aujourdhui} peutAgir={peutAgir(v)} onFait={relire} onOccupe={surOccupe} />
        {peutAgir(v) && <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void modifier(v)}
          data-modifier-mon-espace={v.id}>Modifier</button>}
        <button type="button" className="svv-btn svv-btn-outline gst-btn" aria-expanded={historique === v.id} onClick={() => setHistorique(historique === v.id ? null : v.id)}
          data-historique-bouton={v.id}>{historique === v.id ? 'Masquer l’historique' : 'Historique des modifications'}</button>
      </div>
      {historique === v.id && <HistoriqueAffaire id={v.id} />}
    </CarteAffaire>
    </div>
  );
  return (
    <ContexteNouvelApporteur.Provider value={facon}>
    <FournisseurNoms value={data.nomsNegociateurs ?? {}}><FournisseurAffichage value={unite}><FournisseurChangerAffichage value={setUnite}><FournisseurConsolide value>
    <div className="mes-compteurs-bloc">
      <style>{CSS}{CSS_MES_COMPTEURS}{CSS_NOUVEAU_COMPROMIS}{CSS_MES_STATISTIQUES}</style>
      {!disponible && <p className="loc-alerte loc-alerte--orange" role="status">Le Suivi CA n’est pas encore en place dans la base : aucune affaire à montrer.</p>}
      <div className="mes-compteurs-tete">
        {/* 🔴 LOT 5 — créer un compromis : structure, n° de mandat, vérification, puis le formulaire de la tuile Suivi CA. */}
        {disponible && !parcours && <button type="button" className="svv-btn svv-btn-primary gst-btn mes-nouveau" onClick={() => setParcours(true)} data-nouveau-compromis-mon-espace>+ Nouveau compromis</button>}
        <span className="loc-muet">Montants en</span><BoutonAffichage unite={unite} onChange={setUnite} /></div>
      {motifEdition !== null && <p className="trx-erreur" role="alert" data-motif-edition>{motifEdition}</p>}
      {/* 🔴 LOT 7 — ce qu'un collègue vient de changer (discret) ; une session expirée (jamais un faux message de panne). */}
      {miseAJour !== null && <p className="mes-mise-a-jour" role="status" data-mise-a-jour>{miseAJour}
        <button type="button" className="mes-mise-a-jour-fermer" aria-label="Fermer le message" onClick={() => setMiseAJour(null)}>×</button></p>}
      {reconnexion && <p className="loc-alerte loc-alerte--orange" role="alert" data-reconnexion>Votre session a expiré : <a href="/admin/login">reconnectez-vous</a> pour voir les dernières mises à jour.</p>}
      {/* 🔴 LOT 6 — le formulaire de la tuile, sur l'affaire telle que je la reçois ; la version lue part avec l'enregistrement (409 si un collègue a
          enregistré entre-temps : le message le dit, rien n'est écrasé). */}
      {edition !== null && refs !== null && <FormulaireDossier societe={edition.societe} vente={edition} references={refs}
        repartitionInitiale={etatRepartitionDe(edition, refs.negociateurs, refs.uniteCommission === true)} commissionsMasquees={!refs.administrateur}
        envoyer={envoyerMonEspace} onFermer={() => setEdition(null)} onFait={() => { setEdition(null); setLecture((x) => x + 1); }} />}
      {parcours && <NouveauCompromis onFermer={() => setParcours(false)} onCree={(id) => { setParcours(false); setOnglet('compromis'); setNouvelle(id); setLecture((x) => x + 1); }} />}
      <div className="mes-compteurs">
        <button type="button" className="svv-card mes-compteur" aria-label={`Mes compromis en cours : ${nombre(compteurs.compromis.nb, 'compromis', 'compromis')}, ${total(compteurs.compromis)}`}
          aria-controls="mon-espace-listes" aria-pressed={onglet === 'compromis'} onClick={() => ouvrir('compromis')} data-compteur="compromis">
          <span className="mes-compteur-titre">Mes compromis en cours</span>
          <span className="mes-compteur-chiffres"><span data-compteur-nb>{nombre(compteurs.compromis.nb, 'compromis', 'compromis')}</span>
            <span aria-hidden="true"> — </span><strong data-compteur-total>{total(compteurs.compromis)}</strong></span>
        </button>
        <button type="button" className="svv-card mes-compteur" aria-label={`Mes ventes actées en ${compteurs.actees.annee} : ${nombre(compteurs.actees.nb, 'vente', 'ventes')}, ${total(compteurs.actees)}`}
          aria-controls="mon-espace-listes" aria-pressed={onglet === 'ventes'} onClick={() => ouvrir('ventes')} data-compteur="actees">
          <span className="mes-compteur-titre">Mes ventes actées cette année ({compteurs.actees.annee})</span>
          <span className="mes-compteur-chiffres"><span data-compteur-nb>{nombre(compteurs.actees.nb, 'vente', 'ventes')}</span>
            <span aria-hidden="true"> — </span><strong data-compteur-total>{total(compteurs.actees)}</strong></span>
        </button>
      </div>
      <p className="loc-muet mes-compteurs-note">Le montant est votre CA : les honoraires du côté (vendeur ou acquéreur) que vous portez sur chaque affaire.</p>

      <div className="mes-onglets" role="tablist" aria-label="Mes affaires">
        {(['compromis', 'ventes', 'statistiques', 'apporteurs'] as const).map((o) => (
          <button key={o} type="button" role="tab" id={`mon-espace-onglet-${o}`} aria-selected={onglet === o} aria-controls="mon-espace-listes" className="mes-onglet"
            onClick={() => setOnglet(o)} data-onglet-mon-espace={o}>{o === 'compromis' ? 'Mes compromis en cours' : o === 'ventes' ? 'Mes ventes' : o === 'statistiques' ? 'Mes statistiques' : 'Mes apporteurs'}</button>
        ))}
      </div>
      <div id="mon-espace-listes" role="tabpanel" aria-labelledby={`mon-espace-onglet-${onglet}`} ref={listes} data-liste-mon-espace={onglet}>
        {/* 🔴 LOT 8 — « Mes statistiques » : mon CA (N / N−1), mois par mois, par apporteur, le prévisionnel ; les données du serveur seules. */}
        {onglet === 'apporteurs' ? <MesApporteurs /> : onglet === 'statistiques' ? <MesStatistiques data={data} /> : onglet === 'compromis' ? (
          compromis.length === 0
            ? <p className="loc-muet mes-vide" data-liste-vide="compromis">Aucun compromis en cours à votre nom.</p>
            : <div className="trx-cartes mes-cartes">{compromis.map((v) => carte(v, 'compromis'))}</div>
        ) : <>
          <div className="mes-ventes-tete">
            <label className="mes-annee">Année
              <select value={anneeVue} onChange={(e) => setAnnee(Number(e.target.value))} data-annee-mes-ventes>
                {choixAnnees.map((a) => <option key={a} value={a}>{a}</option>)}
              </select></label>
            <p className="mes-ventes-total" data-total-mes-ventes>{nombre(anneeChoisie.nb, 'vente', 'ventes')} en {anneeVue} — <strong>{total(anneeChoisie)}</strong></p>
          </div>
          {ventes.length === 0
            ? <p className="loc-muet mes-vide" data-liste-vide="ventes">Aucune vente actée à votre nom en {anneeVue}.</p>
            : <div className="trx-cartes mes-cartes">{ventes.map((v) => carte(v, 'vente'))}</div>}
        </>}
      </div>
    </div>
    </FournisseurConsolide></FournisseurChangerAffichage></FournisseurAffichage></FournisseurNoms>
    </ContexteNouvelApporteur.Provider>
  );
}

// Les jetons de la charte seulement (Clair et Sombre) ; cibles de 44 px au moins ; une colonne sur téléphone.
const CSS_MES_COMPTEURS = `
.mes-compteurs-tete{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:.5rem;margin:0 0 .75rem}
.mes-compteurs-tete .mes-nouveau{margin-right:auto}
.mes-compteurs{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:.75rem}
.mes-compteur{display:flex;flex-direction:column;align-items:flex-start;gap:.4rem;min-height:44px;width:100%;text-align:left;cursor:pointer;font:inherit;color:var(--color-svv-ink);
  border:1px solid var(--color-svv-line);background:var(--color-svv-surface)}
.mes-compteur[aria-pressed="true"]{border-color:var(--color-svv-red);box-shadow:inset 0 0 0 1px var(--color-svv-red)}
.mes-compteur:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.mes-compteur-titre{font-weight:700;font-size:1rem}
.mes-compteur-chiffres{font-size:1.15rem}
.mes-compteur-chiffres strong{color:var(--color-svv-green)}
.mes-compteurs-note{margin:.75rem 0 1rem;font-size:.9rem}
.mes-onglets{display:flex;flex-wrap:wrap;gap:.5rem;margin:0 0 .75rem;border-bottom:1px solid var(--color-svv-line)}
.mes-onglet{min-height:44px;padding:.5rem 1rem;font:inherit;font-weight:600;color:var(--color-svv-muted);background:none;border:0;border-bottom:3px solid transparent;cursor:pointer}
.mes-onglet[aria-selected="true"]{color:var(--color-svv-ink);border-bottom-color:var(--color-svv-red)}
.mes-onglet:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.mes-ventes-tete{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem;margin:0 0 .75rem}
.mes-annee{display:flex;align-items:center;gap:.5rem;font-weight:600}
.mes-annee select{min-height:44px;padding:0 .75rem;font:inherit;color:var(--color-svv-ink);background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:8px}
.mes-ventes-total{margin:0}
.mes-ventes-total strong{color:var(--color-svv-green)}
.mes-cartes{display:flex;flex-direction:column;gap:.5rem}
.mes-vide{margin:.5rem 0}
.trx-negociateur-lecture{margin:.25rem 0;font-weight:600}
.mes-mise-a-jour{display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin:0 0 .75rem;padding:.25rem .25rem .25rem .75rem;border-radius:8px;
  background:var(--color-svv-amber-soft);color:var(--color-svv-ink);border:1px solid var(--color-svv-amber)}
.mes-mise-a-jour-fermer{min-width:44px;min-height:44px;font:inherit;font-size:1.25rem;background:none;border:0;color:var(--color-svv-ink);cursor:pointer}
.mes-eclairee{border-radius:12px;outline:2px solid var(--color-svv-amber);outline-offset:2px}
@media (prefers-reduced-motion:no-preference){.mes-eclairee{animation:mes-eclat 1s ease-out}@keyframes mes-eclat{from{outline-color:transparent}to{outline-color:var(--color-svv-amber)}}}
.mes-confirmation{display:flex;flex-direction:column;gap:.5rem;width:100%}
.mes-confirmation-question{margin:0;font-weight:600}
.trx-societe-cote-lecture{font-weight:600;color:var(--color-svv-muted)}
`;
