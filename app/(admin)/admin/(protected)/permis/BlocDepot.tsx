'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CarteDepot, BoutonAnnulerDepot, type DepotAffiche } from './DemandesRendu';
import type { DepotVirtuel } from '../../../../lib/sitadel/demandeRepo'; // type SEUL (erasé au build) — la carte virtuelle a la même forme que DepotAffiche, sans id
import { creerPlanificateurReleve, type PlanificateurReleve } from './planifieReleveDepot'; // LOT 34 : relève déclenchée par le clic « copier »

/**
 * File « À déposer à la main » de l'onglet Demandes (S16) : les demandes en canal 'formulaire' (téléservice). Trois gestes par
 * carte — « Copier le texte » / « Copier le numéro de permis » (dans la carte) puis « Marquer comme déposée » (→ 'envoyee').
 * Mobile-first (cartes). AUCUN envoi automatique.
 *
 * AFFICHAGE AUTOMATIQUE (lot 9) — en plus des demandes DÉJÀ préparées, le carrousel affiche des cartes de dépôt VIRTUELLES : une
 * par commune LIBRE (`virtuels`, servies par le GET), rendues COMPLÈTES sans aucun clic ni aucune écriture en base. La demande ne
 * se CRÉE qu'au 1er geste réel (copie du texte / du numéro, ou « Marquer comme déposée ») via `assurerMaterialisee` (dédupliquée
 * par `cle` → jamais deux demandes pour une même carte). Une carte affichée mais jamais touchée ne laisse RIEN en base. Les cartes
 * virtuelles n'ont pas de bouton « Annuler » (il n'y a encore aucune demande à annuler ; les demandes réelles gardent le leur).
 * `afficherVirtuels` (piloté par le mode auto/manuel du parent) montre/masque les virtuelles ; les demandes réelles restent toujours.
 *
 * DEPOT-1 — RAFRAÎCHISSEMENT : la file se recharge sur `signalRafraichir` (incrémenté par le parent APRÈS une création dans
 * « À demander »), donc une demande téléservice fraîchement préparée apparaît SANS rechargement de page. Symétriquement, un dépôt
 * ou une annulation appelle `onChangement()` → le parent réincrémente le signal → les vues sœurs (compteurs, « À demander »)
 * se remettent à jour. Le retrait OPTIMISTE fait disparaître la carte immédiatement ; le rechargement confirme.
 */

// LOT A — trace BEST-EFFORT du clic « copier » (signal d'intention de dépôt téléservice). Détachée À DESSEIN : jamais
//   attendue, jamais rethrow → la copie clipboard d'Arno (déjà faite) n'est bloquée par rien, même si le serveur échoue.
function signalerDepot(demandeId: number, bouton: 'texte' | 'ref'): void {
  void fetch('/api/admin/permis/depot-presume', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demandeId, bouton }),
  }).catch(() => undefined);
}

// RELECTURE EN DIRECT — intervalle de re-synchronisation du carrousel avec le vivier SERVEUR (GET …/demandes/depot). Une commune
//   qui quitte le vivier (référence enregistrée, dépôt sans référence, auto-confirmation d'accusé…) voit sa carte disparaître SANS
//   rechargement de page, même quand la bascule s'est faite HORS d'un geste local du carrousel. La relecture est aussi déclenchée
//   au retour de focus/onglet, et SUSPENDUE tant qu'un geste (copie / saisie) est en cours dans une carte (anti-morphing, lot 9).
const RELIRE_INTERVALLE_MS = 12_000;

export function BlocDepot({ signalRafraichir, onChangement, afficherVirtuels = true, compteurVivier }: { signalRafraichir: number; onChangement: () => void; afficherVirtuels?: boolean; compteurVivier?: ReactNode }) {
  const [demandes, setDemandes] = useState<DepotAffiche[]>([]);
  const [virtuels, setVirtuels] = useState<DepotVirtuel[]>([]); // AFFICHAGE AUTO — communes libres rendues à la volée (aucune demande en base)
  const [msg, setMsg] = useState<Record<number, string>>({});  // retour (ok/échec) par carte réelle
  const [msgV, setMsgV] = useState<Record<string, string>>({}); // retour par carte VIRTUELLE (clé = cle du lot)
  const [refs, setRefs] = useState<Record<number, string>>({}); // P1 — référence mairie saisie par carte réelle (facultative)
  const [refsV, setRefsV] = useState<Record<string, string>>({}); // P1 — référence mairie saisie par carte VIRTUELLE (clé = cle)
  const [annulerOuverts, setAnnulerOuverts] = useState<Set<number>>(new Set()); // U3 — confirmations « Annuler cette demande » ouvertes
  const [retourAnnul, setRetourAnnul] = useState('');                            // U3 — retour de niveau SECTION (la carte annulée disparaît → retour visible ailleurs)
  const [retourDepot, setRetourDepot] = useState('');                            // RELECTURE EN DIRECT — confirmation de SECTION nommant la commune qui vient de quitter le vivier (survit au retrait de sa carte)
  // MATÉRIALISATION dédupliquée par `cle` : une carte virtuelle ne crée sa demande qu'UNE fois, quel que soit le nombre de gestes
  //   (copie texte, copie numéro, dépôt) déclenchés avant le rafraîchissement. La promesse en cours/résolue est réutilisée.
  const materialiseesRef = useRef<Map<string, Promise<number>>>(new Map());
  // LOT 34 — RELÈVE DÉCLENCHÉE par le clic « copier » : délai (config), retour d'écran, planificateur dédupliqué (une seule relève).
  const [releveMsg, setReleveMsg] = useState<string | null>(null);
  // CARROUSEL (présentation) — index de la carte courante + réf. de la piste défilante (rendu plus bas).
  const [index, setIndex] = useState(0);
  const pisteRef = useRef<HTMLDivElement | null>(null);
  const delaiSecRef = useRef(60);          // délai courant (config), lu au clic → jamais figé
  const planifRef = useRef<PlanificateurReleve | null>(null);
  const onChangementRef = useRef(onChangement); // dernière valeur du callback, sans recréer le planificateur
  useEffect(() => { onChangementRef.current = onChangement; }, [onChangement]);

  const virtuelsAffiches = afficherVirtuels ? virtuels : []; // mode manuel → aucune carte virtuelle (les demandes réelles restent)
  const total = demandes.length + virtuelsAffiches.length;

  // Planificateur créé UNE fois au montage (refs lues seulement ici, jamais pendant le rendu). Cleanup = annule un timer en attente.
  useEffect(() => {
    const planif = creerPlanificateurReleve({
      delaiMs: () => Math.max(1, delaiSecRef.current) * 1000,          // délai FRAIS à chaque clic → suit la config
      programmer: (cb, ms) => setTimeout(cb, ms),
      annuler: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      avantAttente: () => setReleveMsg(`La boîte sera relevée dans ~${delaiSecRef.current}s (lecture seule, sans envoi)…`),
      executer: () => {
        setReleveMsg('Relève de la boîte en cours…');
        void (async () => {
          try {
            const res = await fetch('/api/admin/permis/relever-depot', { method: 'POST' }); // LECTURE SEULE côté serveur
            const d = (await res.json().catch(() => ({}))) as { resultat?: string; message?: string; compteurs?: { retenus?: number; referencesCaptees?: number; rattaches?: number } };
            if (d.resultat === 'ok' && d.compteurs) {
              const c = d.compteurs;
              setReleveMsg(`Boîte relevée : ${c.retenus ?? 0} message(s) retenu(s), ${c.referencesCaptees ?? 0} référence(s) mairie captée(s), ${c.rattaches ?? 0} rattaché(s).`);
              onChangementRef.current(); // une référence captée peut faire évoluer l'état (file + vues sœurs)
            } else setReleveMsg(d.message ?? 'Relève terminée.');
          } catch { setReleveMsg('Relève impossible (réseau) — la relève ordinaire prendra le relais.'); }
        })();
      },
    });
    planifRef.current = planif;
    return () => { planif.annuler(); planifRef.current = null; }; // démontage : pas de relève fantôme
  }, []);
  const programmerReleve = (): void => planifRef.current?.demander(); // DÉDUP interne : deux clics rapprochés → une seule relève

  // ÉTAT SERVEUR courant (miroir) — pour DIFFÉRENCIER, à la relecture, les communes qui étaient proposées et ne le sont plus (afin
  //   de les NOMMER dans la confirmation), sans rendu supplémentaire. Suit chaque changement de la file.
  const etatRef = useRef<{ demandes: DepotAffiche[]; virtuels: DepotVirtuel[] }>({ demandes: [], virtuels: [] });
  useEffect(() => { etatRef.current = { demandes, virtuels }; }, [demandes, virtuels]);

  // RELECTURE de l'état auprès du SERVEUR (source UNIQUE d'éligibilité : GET …/demandes/depot). La liste affichée SUIT strictement
  //   la réponse serveur — jamais une règle d'éligibilité réinventée côté client. `annoncer` → nomme, en confirmation de section,
  //   les communes qui ont quitté le vivier depuis la dernière lecture (leur carte va disparaître).
  const relireEtat = useCallback(async (annoncer: boolean): Promise<void> => {
    try {
      const res = await fetch('/api/admin/permis/demandes/depot', { cache: 'no-store' });
      if (!res.ok) return;
      const d = (await res.json()) as { demandes?: DepotAffiche[]; virtuels?: DepotVirtuel[]; releveDelaiSecondes?: number };
      const fraiches = d.demandes ?? [];
      const fraisVirtuels = d.virtuels ?? [];
      if (annoncer) {
        const nom = (x: { communeNom: string | null }): string | null => x.communeNom;
        const nonVide = (x: string | null): x is string => x !== null && x !== '';
        const apres = new Set([...fraiches.map(nom), ...fraisVirtuels.map(nom)].filter(nonVide));
        const avant = etatRef.current;
        const parties = [...new Set([...avant.demandes.map(nom), ...avant.virtuels.map(nom)].filter(nonVide))].filter((c) => !apres.has(c));
        if (parties.length > 0) setRetourDepot(`${parties.join(', ')} — demande partie en « En cours » (n’est plus à déposer à la main).`);
      }
      setDemandes(fraiches);
      setVirtuels(fraisVirtuels);
      if (typeof d.releveDelaiSecondes === 'number') delaiSecRef.current = d.releveDelaiSecondes; // LOT 34 : délai piloté par config
    } catch { /* file de dépôt indisponible : le reste de l'écran reste utilisable */ }
  }, []);

  // DEPOT-1 — recharge à chaque signal du parent (création, dépôt, annulation LOCAUX) : la commune vient d'un GESTE, sa confirmation
  //   est déjà posée → on ne ré-annonce pas ici (annoncer=false).
  useEffect(() => { void relireEtat(false); }, [signalRafraichir, relireEtat]);

  // RELECTURE EN DIRECT — un geste HORS carrousel (auto-confirmation d'accusé, référence saisie dans « En cours », dépôt sans
  //   référence…) peut faire quitter une commune du vivier SANS notifier le carrousel. On relit donc périodiquement ET au retour de
  //   focus/onglet, pour retirer sa carte sans rechargement. GARDE ANTI-MORPHING (lot 9) : suspendu tant qu'un champ/bouton du
  //   carrousel a le focus (geste en cours) → aucune carte ne se transforme/s'efface pendant une copie ou une saisie.
  useEffect(() => {
    const relire = (): void => {
      if (document.hidden) return;                                              // onglet caché → inutile de relire
      if (pisteRef.current?.contains(document.activeElement) ?? false) return;  // geste en cours dans une carte → anti-morphing
      void relireEtat(true);
    };
    const timer = setInterval(relire, RELIRE_INTERVALLE_MS);
    const surRetour = (): void => { if (document.visibilityState === 'visible') relire(); };
    window.addEventListener('focus', surRetour);
    document.addEventListener('visibilitychange', surRetour);
    return () => { clearInterval(timer); window.removeEventListener('focus', surRetour); document.removeEventListener('visibilitychange', surRetour); };
  }, [relireEtat]);

  // CARROUSEL — MOLETTE verticale → défilement HORIZONTAL, dans les bornes du carrousel (en bout de course, la PAGE reprend la
  //   main → pas de scroll piégé). Listener natif NON-PASSIF pour que preventDefault soit fiable. Le trackpad horizontal (deltaX)
  //   et le swipe tactile restent NATIFS (overflow-x). Ré-attaché quand la file apparaît (piste montée) ou change de longueur.
  useEffect(() => {
    const piste = pisteRef.current;
    if (!piste) return;
    const onWheel = (e: WheelEvent): void => {
      if (e.deltaX !== 0 || e.deltaY === 0) return;                       // geste déjà horizontal (trackpad) → natif
      const max = piste.scrollWidth - piste.clientWidth;
      if (max <= 1) return;                                               // rien à faire défiler (une seule carte visible en entier)
      const versDroite = e.deltaY > 0;
      if ((versDroite && piste.scrollLeft >= max - 1) || (!versDroite && piste.scrollLeft <= 0)) return; // en bout → laisser la page
      piste.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    piste.addEventListener('wheel', onWheel, { passive: false });
    return () => piste.removeEventListener('wheel', onWheel);
  }, [total]);

  const poser = (id: number, texte: string): void => setMsg((s) => ({ ...s, [id]: texte }));
  const poserV = (cle: string, texte: string): void => setMsgV((s) => ({ ...s, [cle]: texte }));

  async function marquerDeposee(id: number): Promise<void> {
    poser(id, '');
    try {
      // P1 — référence FACULTATIVE : envoyée seulement si saisie (le dépôt reste possible sans).
      const reference = (refs[id] ?? '').trim();
      const res = await fetch('/api/admin/permis/demandes/depot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reference === '' ? { id } : { id, reference }) });
      if (res.ok) {
        const commune = demandes.find((x) => x.id === id)?.communeNom ?? '';
        setRetourDepot(`${commune || 'Commune'} — demande déposée${reference !== '' ? ', référence enregistrée' : ''} → onglet « En cours ».`); // RETOUR VISUEL : la carte s'efface, la confirmation reste
        setDemandes((prev) => prev.filter((x) => x.id !== id)); // retrait optimiste (la carte disparaît, compteur à jour)
        onChangement();                                         // DEPOT-1 — recharge la file + les vues sœurs (pas de page à rafraîchir)
      } else {
        const e = (await res.json().catch(() => ({}))) as { erreur?: string };
        poser(id, e.erreur ? `Refusé : ${e.erreur}.` : 'Action refusée.');
      }
    } catch { poser(id, 'Action impossible.'); }
  }

  // AFFICHAGE AUTO — MATÉRIALISE la demande de la carte virtuelle `v` (1er geste réel), UNE seule fois (mémoïsée par `cle`). En cas
  //   d'échec, on OUBLIE la promesse pour permettre un nouvel essai. Renvoie l'id de la demande créée → le geste enchaîne dessus.
  function assurerMaterialisee(v: DepotVirtuel): Promise<number> {
    const enCours = materialiseesRef.current.get(v.cle);
    if (enCours) return enCours;
    const p = (async (): Promise<number> => {
      const res = await fetch('/api/admin/permis/demandes/depot-auto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cle: v.cle, communeNom: v.communeNom }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: number; erreur?: string };
      if (res.ok && d.ok && typeof d.id === 'number') return d.id;
      throw new Error(res.status === 401 || res.status === 403 ? 'Session expirée — reconnecte-toi.' : (d.erreur ?? 'préparation impossible'));
    })();
    materialiseesRef.current.set(v.cle, p);
    p.catch(() => materialiseesRef.current.delete(v.cle)); // échec → on oublie (nouvel essai possible)
    return p;
  }

  // COPIE sur carte virtuelle : la copie clipboard a DÉJÀ eu lieu (BoutonCopier, valeur figée byte-identique) → on matérialise en
  //   arrière-plan pour attacher la trace « copier » + la relève à la demande. La carte reste virtuelle jusqu'au dépôt (pas de
  //   morphing en plein geste) ; le prochain rafraîchissement la remplacera par la carte réelle (avec sa référence SVAV + Annuler).
  function copierVirtuel(v: DepotVirtuel, bouton: 'texte' | 'ref'): void {
    void assurerMaterialisee(v)
      .then((id) => { signalerDepot(id, bouton); programmerReleve(); })
      .catch((e: unknown) => poserV(v.cle, (e as { message?: string })?.message ?? 'Préparation impossible.'));
  }

  // DÉPÔT depuis une carte virtuelle : on s'assure d'abord que la demande existe (matérialisation mémoïsée → id), PUIS on enchaîne
  //   le dépôt via le MÊME endpoint que les cartes réelles ({ id, reference? }). Succès → rafraîchissement (la demande devient
  //   'envoyee' et quitte le carrousel). Échec → motif DANS la carte (jamais un échec muet).
  async function deposerVirtuel(v: DepotVirtuel): Promise<void> {
    poserV(v.cle, '');
    try {
      const id = await assurerMaterialisee(v);
      const reference = (refsV[v.cle] ?? '').trim();
      const res = await fetch('/api/admin/permis/demandes/depot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reference === '' ? { id } : { id, reference }) });
      if (res.ok) {
        setRetourDepot(`${v.communeNom || 'Commune'} — demande déposée${reference !== '' ? ', référence enregistrée' : ''} → onglet « En cours ».`); // RETOUR VISUEL avant l'effacement de la carte (au rafraîchissement)
        onChangement();
      }
      else { const e = (await res.json().catch(() => ({}))) as { erreur?: string }; poserV(v.cle, e.erreur ? `Refusé : ${e.erreur}.` : 'Action refusée.'); }
    } catch (e) { poserV(v.cle, (e as { message?: string })?.message ?? 'Préparation impossible.'); }
  }

  const fermerAnnul = (id: number): void => setAnnulerOuverts((s) => { const n = new Set(s); n.delete(id); return n; });

  // U3 — ANNULER : réutilise le chemin EXISTANT (PATCH …/demandes {statut:'annulee'} → changerStatutLot), AUCUN nouvel écrivain
  //   de demande.statut. Succès → la carte quitte la file (retrait optimiste) + retour de SECTION (la carte a disparu). Refus →
  //   motif DANS la carte (jamais un échec muet). listerADeposer ne renvoie que brouillon/prête → aucune demande déposée ici.
  async function annuler(id: number): Promise<void> {
    poser(id, '');
    try {
      const res = await fetch('/api/admin/permis/demandes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id], statut: 'annulee' }) });
      if (res.ok) {
        fermerAnnul(id);
        setDemandes((prev) => prev.filter((x) => x.id !== id)); // retrait optimiste (la carte disparaît, compteur à jour)
        setRetourAnnul('Demande annulée — ses dossiers redeviennent demandables (onglet « À demander »).');
        onChangement();                                         // DEPOT-1 — recharge la file + les vues sœurs
      } else {
        const e = (await res.json().catch(() => ({}))) as { erreur?: string };
        poser(id, e.erreur ? `Annulation refusée : ${e.erreur}.` : 'Annulation refusée.'); // carte conservée, motif visible
      }
    } catch { poser(id, 'Annulation impossible.'); }
  }

  // CARROUSEL — navigation. `pos` = index BORNÉ (une carte retirée après dépôt/annulation ne laisse jamais « 4 sur 3 »).
  //   Défilement natif (swipe) + boutons ; `scrollTo` respecte prefers-reduced-motion (non animé si l'utilisateur le refuse).
  const pos = Math.min(index, Math.max(0, total - 1));
  const comportementScroll = (): ScrollBehavior =>
    (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  const allerA = (i: number): void => {
    const piste = pisteRef.current;
    if (!piste || piste.children.length === 0) return;
    const cible = Math.max(0, Math.min(i, piste.children.length - 1));
    const carte = piste.children[cible] as HTMLElement | undefined;
    piste.scrollTo?.({ left: carte ? carte.offsetLeft : 0, behavior: comportementScroll() });
    setIndex(cible);
  };
  // La carte courante SUIT le défilement manuel (swipe) : on retient celle dont le bord gauche est le plus proche du scroll.
  const onScrollPiste = (): void => {
    const piste = pisteRef.current;
    if (!piste) return;
    const enfants = Array.from(piste.children) as HTMLElement[];
    if (enfants.length === 0) return;
    let plusProche = 0, meilleur = Infinity;
    enfants.forEach((c, i) => { const d = Math.abs(c.offsetLeft - piste.scrollLeft); if (d < meilleur) { meilleur = d; plusProche = i; } });
    setIndex((cur) => (cur === plusProche ? cur : plusProche));
  };

  // RIEN À AFFICHER — aucune carte, aucun compteur, aucune confirmation → null (comportement d'avant). En rail téléservice le compteur
  //   de vivier est TOUJOURS fourni → la vue reste rendue, donc le compteur reste visible MÊME à 0 carte (comme avant son déplacement).
  if (total === 0 && !compteurVivier && retourDepot === '') return null;

  return (
    <section role="group" aria-label="Demandes à déposer à la main (téléservice)" className="flex flex-col gap-2">
      {total > 0 && (
        <div style={{ fontSize: 13 }}>
          <strong>{total} demande(s) à déposer à la main</strong> — ces communes n’acceptent que leur téléservice. Ouvrez le formulaire, collez le texte, puis marquez la demande déposée.
        </div>
      )}
      {/* U3 — retour de l'annulation : la carte concernée a disparu de la file, le retour reste visible au niveau de la section. */}
      {retourAnnul && <div role="status" style={{ fontSize: 12, color: 'var(--color-svv-green-ink)' }}>{retourAnnul}</div>}
      {/* RELECTURE EN DIRECT — confirmation NOMMÉE (dépôt local ou départ hors carrousel) : brève, non bloquante, survit au retrait de la carte. */}
      {retourDepot && <div role="status" aria-live="polite" style={{ fontSize: 12, color: 'var(--color-svv-green-ink)' }}>{retourDepot}</div>}
      {/* ÉTAT VIDE EXPLICITE — carrousel vidé après un départ : on dit POURQUOI il n'y a plus rien (jamais un blanc). */}
      {total === 0 && retourDepot !== '' && <div style={{ fontSize: 13, color: 'var(--color-svv-muted)' }}>Plus aucune commune à déposer à la main pour l’instant (les demandes sont parties en « En cours », ou le vivier téléservice est vide).</div>}
      {/* LOT 34 — état de la relève déclenchée par « copier » : « relevée dans un instant » puis résultat. Jamais silencieux. */}
      {releveMsg && <div role="status" aria-live="polite" style={{ fontSize: 12, color: 'var(--color-svv-ink)' }}>{releveMsg}</div>}
      {/* BARRE — sur UNE seule ligne : la NAVIGATION du carrousel (flèches + « n sur m » = PAGES) puis, dans son PROLONGEMENT, le
          COMPTEUR DE VIVIER (permis demandables = VIVIER ENTIER). DEUX nombres de natures DIFFÉRENTES : séparés par un « · » discret
          + un espacement, chacun gardant son libellé explicite (jamais un nombre nu). flex-wrap → sur écran étroit le compteur passe
          proprement SOUS la nav (libellé jamais tronqué). La nav n'apparaît que s'il y a des cartes ; le compteur, lui, reste visible
          même carrousel vide (il vit désormais ICI, plus à côté). `flex:'0 0 auto'` + `width:'auto'` ANNULENT le `width:100%` de `.svv-btn`. */}
      {(total > 0 || compteurVivier) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.35rem .7rem' }}>
          {total > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <button type="button" className="svv-btn svv-btn-outline" style={{ flex: '0 0 auto', width: 'auto', padding: '.25rem .6rem', minHeight: 36 }}
                onClick={() => allerA(pos - 1)} disabled={pos <= 0} aria-label="Carte précédente"><span aria-hidden="true">‹</span></button>
              <span role="status" aria-live="polite" style={{ fontSize: 13, fontWeight: 600, minWidth: '4.5rem', textAlign: 'center' }}>{pos + 1} sur {total}</span>
              <button type="button" className="svv-btn svv-btn-outline" style={{ flex: '0 0 auto', width: 'auto', padding: '.25rem .6rem', minHeight: 36 }}
                onClick={() => allerA(pos + 1)} disabled={pos >= total - 1} aria-label="Carte suivante"><span aria-hidden="true">›</span></button>
            </div>
          )}
          {compteurVivier && (
            <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '.4rem', minWidth: 0 }}>
              {total > 0 && <span aria-hidden="true" style={{ color: 'var(--color-svv-muted)', fontSize: 13 }}>·</span>}
              {compteurVivier}
            </div>
          )}
        </div>
      )}
      {/* PISTE — rangée flex de cartes CÔTE À CÔTE à leur largeur d'ORIGINE (~320 px, `min(20rem,90vw)`), défilement HORIZONTAL
          (swipe/trackpad natifs + molette + boutons) + scroll-snap. `alignItems:'flex-start'` = rangée alignée EN HAUT → aucun
          saut vertical d'une carte à l'autre. Seule la PISTE défile (overflow-x) : la page ne déborde jamais horizontalement.
          Cartes RÉELLES (déjà préparées) d'abord, puis cartes VIRTUELLES (communes libres, affichage automatique). La PISTE n'est
          rendue que s'il y a des cartes (total > 0) — carrousel vide → seule la barre (compteur / état vide) subsiste. */}
      {total > 0 && (
      <div ref={pisteRef} onScroll={onScrollPiste} role="group" aria-label="Cartes de dépôt à faire (défilement horizontal)"
        style={{ display: 'flex', gap: '.6rem', overflowX: 'auto', overflowY: 'hidden', scrollSnapType: 'x mandatory', overscrollBehaviorX: 'contain', position: 'relative', alignItems: 'flex-start', WebkitOverflowScrolling: 'touch' }}>
        {demandes.map((d) => (
          <div key={d.id} style={{ flex: '0 0 auto', width: 'min(20rem, 90vw)', boxSizing: 'border-box', scrollSnapAlign: 'start' }}>
            <CarteDepot d={d}
              onCopieTexte={() => { signalerDepot(d.id, 'texte'); programmerReleve(); }} onCopieRef={() => { signalerDepot(d.id, 'ref'); programmerReleve(); }}>
              {/* P1 — référence renvoyée par la mairie (accusé de réception). Facultative : ne bloque jamais le dépôt. */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: '.15rem', fontSize: 12, color: 'var(--color-svv-muted)' }}>
                Référence mairie (accusé de réception) — facultatif
                <input value={refs[d.id] ?? ''} onChange={(e) => setRefs((s) => ({ ...s, [d.id]: e.target.value }))}
                  placeholder="ex. SLC260810440700"
                  style={{ padding: '.3rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13, fontFamily: 'var(--font-svv-mono, monospace)' }} />
              </label>
              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.3rem .7rem' }} onClick={() => void marquerDeposee(d.id)}>Marquer comme déposée</button>
              </div>
              {msg[d.id] && <span role="status" style={{ fontSize: 12, color: 'var(--color-svv-green-ink)' }}>{msg[d.id]}</span>}
              {/* U3 — geste SECONDAIRE, nettement séparé de « Marquer comme déposée » (bordure supérieure + zone dédiée). */}
              <div style={{ borderTop: '1px solid var(--color-svv-line)', paddingTop: '.4rem', marginTop: '.2rem' }}>
                <BoutonAnnulerDepot ouvert={annulerOuverts.has(d.id)}
                  onOuvrir={() => setAnnulerOuverts((s) => new Set(s).add(d.id))}
                  onConfirmer={() => void annuler(d.id)}
                  onFermer={() => fermerAnnul(d.id)} />
              </div>
            </CarteDepot>
          </div>
        ))}
        {virtuelsAffiches.map((v) => (
          <div key={`v-${v.cle}`} style={{ flex: '0 0 auto', width: 'min(20rem, 90vw)', boxSizing: 'border-box', scrollSnapAlign: 'start' }}>
            {/* CARTE VIRTUELLE — MÊME composant, MÊME présentation qu'une carte réelle (id de demande = null : aucune référence SVAV
                encore attribuée, elle le sera à la matérialisation). Gestes de copie/dépôt matérialisent la demande au 1er clic. */}
            <CarteDepot d={{ id: -1, reference: '', communeNom: v.communeNom, url: v.url, corps: v.corps, nbDossiers: v.nbDossiers, statut: 'brouillon', dossiers: v.dossiers }}
              onCopieTexte={() => copierVirtuel(v, 'texte')} onCopieRef={() => copierVirtuel(v, 'ref')}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '.15rem', fontSize: 12, color: 'var(--color-svv-muted)' }}>
                Référence mairie (accusé de réception) — facultatif
                <input value={refsV[v.cle] ?? ''} onChange={(e) => setRefsV((s) => ({ ...s, [v.cle]: e.target.value }))}
                  placeholder="ex. SLC260810440700"
                  style={{ padding: '.3rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13, fontFamily: 'var(--font-svv-mono, monospace)' }} />
              </label>
              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.3rem .7rem' }} onClick={() => void deposerVirtuel(v)}>Marquer comme déposée</button>
              </div>
              {msgV[v.cle] && <span role="status" style={{ fontSize: 12, color: 'var(--color-svv-green-ink)' }}>{msgV[v.cle]}</span>}
            </CarteDepot>
          </div>
        ))}
      </div>
      )}
    </section>
  );
}
