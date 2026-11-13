'use client';

import { useEffect, useMemo, useState } from 'react';
import { BoutonAffichage, ecrireAdresse, eur, FournisseurAffichage, MOT_UNITE, parametre, useAffichageRetenu } from '../transaction/commun';
import { CSS } from '../transaction/EcransTransaction';
import { estMontantSaisi, estMontantSaisiTaux, URL_COUTS } from '../../../../lib/mon-espace/couts';
import { AGENCES, estAgence, LIBELLE_AGENCE, type Agence } from '../../../../lib/mon-espace/agence';
import { cleMoisAn, estPeriodeRecap, libelleFenetre, lienSaisieDuMois, lienSuiviCaGestion, moisAbrege, moisDeLaFenetre, tableauRecap,
  type CelluleRecap, type LigneRecap, type PeriodeRecap } from '../../../../lib/mon-espace/recap';
import { libelleMois, type MoisAn, type Validation } from '../../../../lib/mon-espace/saisieMois';
import { lienRecap } from '../../../../lib/mon-espace/recap';
import { TAUX_TVA_CA_GESTION_DEFAUT, type GestionMois, type Vente } from '../../../../lib/transaction/modele';
import type { EntreesCoutsGlobaux } from '../../../../lib/transaction/coutsGlobal';
import { resolveurDe } from '../../../../lib/transaction/statutLigne';
import { lireMontant, posterCout } from './EditionCouts';
import { useVerrouDefilement } from '../_composants/verrouDefilement';

/**
 * ══ 🔴 MON ESPACE « COÛTS ET CA » — LE TABLEAU RÉCAPITULATIF (Arno, 13/11/2026) ═══════════════════════════════════════════════════════════════════
 * Pleine page (« ← Retour » vers la page d'origine). Les 12 mois de la fenêtre (année civile, ou 12 derniers mois glissants ; ‹ › décalent d'un cran)
 * et leur total ; les COÛTS par famille (les couleurs de la saisie du mois) puis le CA GESTION (violet). Suit « Voir » (CRITERIMMO, MACJ, FUSION ;
 * MACJ : pas de CA gestion) et HT | TTC. Chaque cellule saisie dit son état : complète (✓ discret), à compléter (fond orangé, « — » si vide) ; un mois
 * incomplet est signalé dans l'en-tête de sa colonne.
 * MODIFIER : ADHOC, MONGA, honoraires de gestion, honoraires GLI se modifient SUR PLACE (montant HT, taux de TVA pour le CA, case ✓) ; une fenêtre
 * récapitule le changement (« Revenir » / « Valider ») ; puis LES MÊMES gestes que la saisie du mois (la même route, le même journal — qui, quand,
 * avant / après) : la valeur est celle de toute l'application (une seule comptabilité). Salaires chargés et « Autres » (plusieurs lignes) : la
 * saisie du mois, au bon mois. En lecture : les totaux, le CA global, et ce qui vient d'un import (corriger dans Suivi CA › Gestion). FUSION se lit.
 * Les données : la route de « Coûts et CA » (403 à qui n'a pas la case « Les coûts » : rien n'est lu).
 */
type Donnees = { aujourdhui: string; ventes: unknown[]; retrocessions?: unknown[]; statutsNegociateurs: Parameters<typeof resolveurDe>[0]; locationCa?: EntreesCoutsGlobaux['location'];
  gestion: GestionMois[]; coutsSaisis?: EntreesCoutsGlobaux['saisis']; saisie?: boolean; validations?: Validation[] | null; monga?: boolean; caGestion?: boolean;
  versionsGestion?: Record<string, { version: number; origine: string }> };
type Lu = { etat: 'chargement' } | { etat: 'ok'; data: Donnees } | { etat: 'refus' } | { etat: 'erreur' };
type PosteSurPlace = 'adhoc' | 'monga' | 'honoraires' | 'gli';
interface Edition { ligne: LigneRecap; mois: MoisAn; poste: PosteSurPlace; montant: string; taux: string; complet: boolean;
  avant: { montant: number | null; taux: number | null; complet: boolean } }
interface Changement { quoi: string; avant: string; apres: string }

const ecrireMontant = (x: number | null): string => (x === null ? '' : x.toFixed(2).replace('.', ','));
const posteDe = (l: LigneRecap): PosteSurPlace | null => (l.edition.sorte === 'gestion' || l.edition.sorte === 'ca' ? l.edition.poste : null);
const avecTaux = (p: PosteSurPlace): boolean => p === 'honoraires' || p === 'gli';
const COULEUR: Record<string, number> = { vente: 1, location: 3, gestion: 5, ca: 4 };
const FAMILLE: Record<string, string> = { vente: 'Vente', location: 'Location', gestion: 'Gestion' };

/** 🔴 L'ACCÈS au récapitulatif : l'icône « tableau » et son libellé (accueil de Mon espace, onglet « Coûts et CA », saisie du mois). Rendu seulement là
 *  où « Coûts et CA » est visible (le composant qui le pose le vérifie) ; la page et la route le vérifient de nouveau (403). */
export function LienRecapitulatif({ agence, className = '' }: { agence: Agence; className?: string }) {
  return (
    <a className={`svv-btn svv-btn-outline gst-btn mes-lien-recap ${className}`.trim()} href={lienRecap(agence)} data-lien-recap={agence}>
      <svg className="mes-lien-recap-icone" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M1.5 6h13M1.5 9.5h13M6 2.5v11M10.5 2.5v11" stroke="currentColor" strokeWidth="1.1" fill="none" />
      </svg>
      <span>Récapitulatif</span>
    </a>
  );
}
/** AUCUN ACCENT GRAVE. Le lien, partout le meme. */
export const CSS_LIEN_RECAP = `
.mes-lien-recap{display:inline-flex;align-items:center;gap:6px;width:auto;min-height:40px;padding:0 .9rem;text-decoration:none;white-space:nowrap}
.mes-lien-recap-icone{flex:0 0 auto}
`;

export function RecapCoutsCa() {
  const [unite, setUnite] = useAffichageRetenu();
  const k = unite === 'ht' ? 'htC' : 'ttcC';
  const [agence, setAgence] = useState<Agence>(() => (estAgence(parametre('agence')) ? parametre('agence') as Agence : 'criterimmo'));
  const [periode, setPeriode] = useState<PeriodeRecap>(() => (estPeriodeRecap(parametre('periode')) ? parametre('periode') as PeriodeRecap : 'annee'));
  const [decalage, setDecalage] = useState(0);
  const [lu, setLu] = useState<Lu>({ etat: 'chargement' });
  const [relu, setRelu] = useState(0);
  const [edition, setEdition] = useState<Edition | null>(null);
  const [confirmer, setConfirmer] = useState<Changement[] | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<{ texte: string; ok: boolean } | null>(null);
  useEffect(() => { ecrireAdresse({ agence, periode: periode === 'annee' ? null : periode }); }, [agence, periode]);
  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const r = await fetch(URL_COUTS, { cache: 'no-store' });
        const j = (await r.json().catch(() => ({}))) as { etat?: string; data?: Donnees };
        if (!vivant) return;
        if (r.status === 403) { setLu({ etat: 'refus' }); return; }
        setLu(r.ok && j.etat === 'ok' && j.data !== undefined ? { etat: 'ok', data: j.data } : { etat: 'erreur' });
      } catch { if (vivant) setLu({ etat: 'erreur' }); }
    })();
    return () => { vivant = false; };
  }, [relu]);
  const d = lu.etat === 'ok' ? lu.data : null;
  const eC = useMemo((): EntreesCoutsGlobaux | null => (d === null ? null : { ventes: d.ventes as Vente[], retrocessions: (d.retrocessions ?? []) as EntreesCoutsGlobaux['retrocessions'],
    statutDuLibelle: resolveurDe(d.statutsNegociateurs), location: d.locationCa ?? null, gestion: d.gestion, saisis: d.coutsSaisis ?? [] }), [d]);
  const jour = d?.aujourdhui ?? new Date().toISOString().slice(0, 10);
  const ms = moisDeLaFenetre(periode, jour, decalage);
  const t = useMemo(() => (eC === null || d === null ? null : tableauRecap({ e: eC, agence, mois: ms, jour, validations: d.validations ?? null,
    versionsGestion: d.versionsGestion ?? {}, monga: d.monga === true, caGestion: d.caGestion === true })), [eC, d, agence, periode, decalage]); // eslint-disable-line react-hooks/exhaustive-deps

  if (lu.etat === 'refus') return <p className="loc-muet" data-recap-refus>Le récapitulatif est réservé aux comptes qui ont la case « Les coûts ».</p>;
  if (lu.etat === 'chargement') return <p className="loc-muet" role="status" data-recap-chargement>Chargement du récapitulatif…</p>;
  if (lu.etat === 'erreur' || d === null || t === null) return <p className="loc-alerte loc-alerte--orange" role="alert" data-recap-erreur>Le récapitulatif n’a pas pu être lu. Rechargez la page.</p>;

  // ── l'édition sur place : la valeur enregistrée du mois (la ligne du Suivi CA › Gestion), la case ✓ ──
  const ligneMois = (m: MoisAn) => d.gestion.find((g) => g.annee === m.annee && g.mois === m.mois && g.id > 0);
  const valide = (p: PosteSurPlace, m: MoisAn) => (d.validations ?? []).some((v) => v.societe === 'criterimmo' && v.famille === 'gestion' && v.poste === p && v.annee === m.annee && v.mois === m.mois);
  const ouvrir = (l: LigneRecap, c: CelluleRecap) => {
    const p = posteDe(l); if (p === null) return;
    const g = ligneMois(c.mois);
    const montant = p === 'adhoc' ? g?.adhocHt ?? null : p === 'monga' ? g?.mongaHt ?? null : p === 'honoraires' ? g?.honorairesHt ?? null : g?.gliHt ?? null;
    const taux = !avecTaux(p) ? null : (p === 'honoraires' ? g?.honorairesTvaTaux : g?.gliTvaTaux) ?? TAUX_TVA_CA_GESTION_DEFAUT;
    setMessage(null);
    setEdition({ ligne: l, mois: c.mois, poste: p, montant: ecrireMontant(montant), taux: taux === null ? '' : String(taux).replace('.', ','), complet: valide(p, c.mois),
      avant: { montant, taux, complet: valide(p, c.mois) } });
  };
  const verifier = () => {
    if (edition === null) return;
    const m = lireMontant(edition.montant);
    if (m !== null && !estMontantSaisi(m)) { setMessage({ texte: 'Montant invalide (un nombre positif, deux décimales au plus).', ok: false }); return; }
    const tx = avecTaux(edition.poste) ? lireMontant(edition.taux) : null;
    if (avecTaux(edition.poste) && (tx === null || !estMontantSaisiTaux(tx))) { setMessage({ texte: 'Taux de TVA invalide (un pourcentage entre 0 et 100).', ok: false }); return; }
    const quoi = `${edition.ligne.libelle} — ${libelleMois(edition.mois)}`;
    const ch: Changement[] = [];
    if (m !== edition.avant.montant) ch.push({ quoi: `${quoi} : montant HT`, avant: edition.avant.montant === null ? 'non saisi' : eur(edition.avant.montant), apres: m === null ? 'non saisi' : eur(m) });
    if (avecTaux(edition.poste) && tx !== edition.avant.taux) ch.push({ quoi: `${quoi} : taux de TVA`, avant: `${edition.avant.taux} %`, apres: `${tx} %` });
    if (d.validations != null && edition.complet !== edition.avant.complet) ch.push({ quoi: `${quoi} : complet`, avant: edition.avant.complet ? 'oui' : 'non', apres: edition.complet ? 'oui' : 'non' });
    if (ch.length === 0) { setMessage({ texte: 'Rien n’a changé.', ok: true }); setEdition(null); return; }
    setConfirmer(ch);
  };
  const valider = async () => {
    if (edition === null || confirmer === null) return;
    const e = edition; const m = lireMontant(e.montant); const tx = avecTaux(e.poste) ? lireMontant(e.taux) : null;
    const version = d.versionsGestion?.[cleMoisAn(e.mois)]?.version ?? 0;
    const gestes: unknown[] = [];
    if (m !== e.avant.montant || (avecTaux(e.poste) && tx !== e.avant.taux)) gestes.push(avecTaux(e.poste)
      ? { action: 'ca-gestion', annee: e.mois.annee, mois: e.mois.mois, poste: e.poste, montantHt: m, tauxTva: tx, version }
      : { action: 'gestion-poste', annee: e.mois.annee, mois: e.mois.mois, poste: e.poste, montantHt: m, version });
    if (d.validations != null && e.complet !== e.avant.complet) gestes.push({ action: 'valider',
      validation: { societe: 'criterimmo', famille: 'gestion', poste: e.poste, annee: e.mois.annee, mois: e.mois.mois }, valide: e.complet });
    setEnvoi(true);
    let faits = 0;
    for (const g of gestes) {
      const r = await posterCout(g);
      if (!r.ok) {
        setEnvoi(false); setConfirmer(null);
        setMessage({ texte: `${r.motif ?? 'Enregistrement impossible.'}${faits > 0 ? ' (une partie est déjà enregistrée)' : ''}${r.statut === 409 ? ' Rechargez la page.' : ''}`, ok: false });
        if (faits > 0) setRelu((x) => x + 1);
        return;
      }
      faits += 1;
    }
    setEnvoi(false); setConfirmer(null); setEdition(null);
    setMessage({ texte: `Enregistré : ${confirmer.map((c) => `${c.quoi} ${c.avant} → ${c.apres}`).join(' ; ')}.`, ok: true });
    setRelu((x) => x + 1);
  };

  const autre = unite === 'ht' ? 'ttcC' : 'htC';
  const cellule = (l: LigneRecap, c: CelluleRecap, i: number) => {
    const vide = c.m.htC === 0 && c.m.ttcC === 0;
    const enEdition = edition !== null && edition.ligne.cle === l.cle && cleMoisAn(edition.mois) === cleMoisAn(c.mois);
    const classe = ['rcp-c', c.etat === 'a-completer' ? 'rcp-a-completer' : '', c.etat === 'complet' ? 'rcp-complet' : ''].filter(Boolean).join(' ');
    const valeur = c.etat === 'a-completer' && vide ? '—' : eur(c.m[k] / 100);
    const attrs = { 'data-cellule-recap': `${l.cle}-${cleMoisAn(c.mois)}`, 'data-etat-cellule': c.etat, title: `${l.libelle} — ${libelleMois(c.mois)} (${eur(c.m[autre] / 100)} ${unite === 'ht' ? 'TTC' : 'HT'})` };
    if (enEdition) return (
      <td key={i} className={`${classe} rcp-edition`} {...attrs}>
        <div className="rcp-editeur" data-editeur-recap>
          <label>HT <input type="text" inputMode="decimal" value={edition.montant} placeholder="vide : non saisi" autoFocus aria-label={`${l.libelle} — ${libelleMois(c.mois)} : montant HT`}
            onChange={(ev) => setEdition({ ...edition, montant: ev.target.value })} data-editeur-montant /></label>
          {avecTaux(edition.poste) ? <label>TVA <input type="text" inputMode="decimal" value={edition.taux} aria-label="Taux de TVA (%)" onChange={(ev) => setEdition({ ...edition, taux: ev.target.value })} data-editeur-taux /> %</label>
            : <span className="loc-muet">TVA 20 %</span>}
          {d.validations != null && <label className="rcp-editeur-ok"><input type="checkbox" checked={edition.complet} onChange={(ev) => setEdition({ ...edition, complet: ev.target.checked })} data-editeur-complet /> ✓ complet</label>}
          <span className="rcp-editeur-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setEdition(null)} data-editeur-annuler>Annuler</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={verifier} data-editeur-enregistrer>Enregistrer…</button>
          </span>
        </div>
      </td>);
    const contenu = <>{valeur}{c.etat === 'complet' && <span className="rcp-ok" aria-label="complet"> ✓</span>}</>;
    if (c.modifiable === 'sur-place') return <td key={i} className={classe} {...attrs}><button type="button" className="rcp-bouton" onClick={() => ouvrir(l, c)} aria-label={`Modifier ${l.libelle} — ${libelleMois(c.mois)}`}
      data-modifier-recap={`${l.cle}-${cleMoisAn(c.mois)}`}>{contenu}</button></td>;
    if (c.modifiable === 'saisie-du-mois') return <td key={i} className={classe} {...attrs}><a className="rcp-bouton" href={lienSaisieDuMois(agence === 'macj' ? 'macj' : 'criterimmo', c.mois, 'couts')}
      data-saisie-recap={`${l.cle}-${cleMoisAn(c.mois)}`}>{contenu}</a></td>;
    if (c.modifiable === 'importe') return <td key={i} className={`${classe} rcp-importe`} {...attrs}>{contenu}
      <a className="rcp-corriger" href={lienSuiviCaGestion(c.mois)} data-corriger-recap={`${l.cle}-${cleMoisAn(c.mois)}`}>corriger dans Suivi CA › Gestion</a></td>;
    return <td key={i} className={classe} {...attrs}>{contenu}</td>;
  };
  const sections: { cle: 'couts' | 'ca'; mot: string }[] = [{ cle: 'couts', mot: 'Coûts' }, ...(t.lignes.some((l) => l.section === 'ca') ? [{ cle: 'ca' as const, mot: 'CA gestion' }] : [])];
  const nb = t.mois.length + 2;
  return (
    <FournisseurAffichage value={unite}>
    <div className="rcp tdb loc-page" data-recap-couts-ca={agence} data-transaction={agence}>
      <style>{CSS}{CSS_RECAP}{CSS_LIEN_RECAP}</style>
      <h2 className="rcp-titre">Récapitulatif des coûts et du CA gestion — {LIBELLE_AGENCE[agence]}</h2>
      <div className="rcp-outils" data-recap-outils>
        <div className="trx-unites" role="group" aria-label="Voir" data-recap-voir>
          {AGENCES.map((a) => <button key={a} type="button" className="trx-unite" aria-pressed={agence === a} onClick={() => { setAgence(a); setEdition(null); }} data-recap-agence={a}>{LIBELLE_AGENCE[a]}</button>)}
        </div>
        <div className="trx-unites" role="group" aria-label="Période" data-recap-periode>
          <button type="button" className="trx-unite" aria-pressed={periode === 'annee'} onClick={() => { setPeriode('annee'); setDecalage(0); }} data-periode="annee">Année en cours (janv.–déc. {jour.slice(0, 4)})</button>
          <button type="button" className="trx-unite" aria-pressed={periode === 'glissant'} onClick={() => { setPeriode('glissant'); setDecalage(0); }} data-periode="glissant">12 derniers mois (glissant)</button>
        </div>
        <div className="rcp-fleches" data-recap-fleches>
          <button type="button" className="trx-unite" onClick={() => setDecalage((x) => x - 1)} aria-label={periode === 'annee' ? 'Année précédente' : 'Un mois plus tôt'} data-decaler="-1">‹</button>
          <strong data-recap-fenetre>{libelleFenetre(periode, t.mois)}</strong>
          <button type="button" className="trx-unite" onClick={() => setDecalage((x) => x + 1)} aria-label={periode === 'annee' ? 'Année suivante' : 'Un mois plus tard'} data-decaler="1">›</button>
        </div>
        <span className="rcp-unite"><span className="loc-muet">Montants en</span><BoutonAffichage unite={unite} onChange={setUnite} /></span>
      </div>
      {agence === 'tous' && <p className="loc-muet" data-recap-fusion>FUSION se lit : pour modifier, choisissez CRITERIMMO ou MACJ.</p>}
      {agence === 'macj' && <p className="loc-muet" data-recap-macj>MACJ : la vente seulement (la location, la gestion et le CA gestion sont à CRITERIMMO).</p>}
      {message !== null && <p className={message.ok ? 'rcp-message' : 'trx-erreur'} role={message.ok ? 'status' : 'alert'} data-recap-message={message.ok ? 'ok' : 'refus'}>{message.texte}</p>}
      <div className="rcp-defile" data-recap-defile>
        <table className="rcp-table" data-table-recap>
          <thead><tr><th scope="col" className="rcp-coin">Poste ({MOT_UNITE[unite]})</th>
            {t.mois.map((m, i) => <th key={cleMoisAn(m)} scope="col" className={t.moisIncomplets[i] ? 'rcp-mois-incomplet' : undefined} data-mois-recap={cleMoisAn(m)}
              data-mois-incomplet={t.moisIncomplets[i] ? 'oui' : undefined} title={t.moisIncomplets[i] ? `${libelleMois(m)} : à compléter` : libelleMois(m)}>
              {moisAbrege(m)}{t.moisIncomplets[i] && <span className="rcp-pastille" aria-label="à compléter"> ●</span>}</th>)}
            <th scope="col" className="rcp-total">Total</th></tr></thead>
          {sections.map((s) => (
            <tbody key={s.cle} className={`rcp-section rcp-section--${s.cle}${s.cle === 'ca' ? ' trx-serie--4' : ''}`} data-section-recap={s.cle}>
              <tr className="rcp-section-titre"><th scope="rowgroup" colSpan={nb}><span className="rcp-colle">{s.mot}</span></th></tr>
              {t.lignes.filter((l) => l.section === s.cle).map((l, j, xs) => {
                const nouvelleFamille = l.famille !== null && (j === 0 || xs[j - 1].famille !== l.famille);
                return [
                  nouvelleFamille ? <tr key={`f-${l.famille}`} className={`rcp-famille trx-serie--${COULEUR[l.famille!]}`} data-famille-recap={l.famille!}><th scope="rowgroup" colSpan={nb}><span className="rcp-colle">{FAMILLE[l.famille!]}</span></th></tr> : null,
                  <tr key={l.cle} className={`rcp-ligne rcp-ligne--${l.niveau}${l.famille !== null ? ` trx-serie--${COULEUR[l.famille]}` : s.cle === 'ca' ? ' trx-serie--4' : ''}`} data-ligne-recap={l.cle}>
                    <th scope="row">{l.libelle}{l.niveau === 'info' && <small className="loc-muet"> (pour information, hors totaux)</small>}{l.niveau === 'calcule' && <small className="loc-muet"> (calculé)</small>}</th>
                    {l.cellules.map((c, i) => cellule(l, c, i))}
                    <td className="rcp-c rcp-total" data-total-recap={l.cle}>{eur(l.total[k] / 100)}</td>
                  </tr>,
                ];
              })}
            </tbody>))}
        </table>
      </div>
      <p className="loc-muet rcp-note" data-recap-note>Chaque montant est celui de « Coûts et CA » et du Suivi CA (une seule comptabilité) ; le total d’une ligne est la somme des mois affichés
        (les ventes signées sans mois — « mois à confirmer » — n’y sont pas). ✓ : poste coché complet ; fond orangé : à compléter (mois écoulés).</p>
      {confirmer !== null && edition !== null && <FenetreConfirmation changements={confirmer} envoi={envoi} onRevenir={() => setConfirmer(null)} onValider={() => void valider()} />}
    </div>
    </FournisseurAffichage>
  );
}

function FenetreConfirmation({ changements, envoi, onRevenir, onValider }: { changements: readonly Changement[]; envoi: boolean; onRevenir: () => void; onValider: () => void }) {
  useVerrouDefilement();
  useEffect(() => {
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape' && !envoi) onRevenir(); };
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [envoi, onRevenir]);
  return (
    <div className="rcp-voile" data-recap-voile>
      <div className="rcp-fenetre" role="dialog" aria-modal="true" aria-labelledby="rcp-confirmer-titre" data-recap-confirmation>
        <h3 id="rcp-confirmer-titre">Vérifier la modification</h3>
        <ul className="rcp-changements">{changements.map((c) => <li key={c.quoi} data-changement-recap><span>{c.quoi}</span> <strong>{c.avant} → {c.apres}</strong></li>)}</ul>
        <p className="loc-muet">La valeur sera celle de toute l’application (saisie du mois, Suivi CA, CA net et global, fusion, indicateur) ; la modification est journalisée.</p>
        <div className="rcp-fenetre-boutons">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onRevenir} disabled={envoi} data-recap-revenir>Revenir</button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={onValider} disabled={envoi} data-recap-valider>{envoi ? 'Enregistrement…' : 'Valider'}</button>
        </div>
      </div>
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Le tableau defile DANS son cadre (en-tete et premiere colonne collants) ; la page, elle, ne s'allonge pas
 *  (aucun element invisible positionne : rien ne peut agrandir le document — lot a107a8d7) ; au bout de son defilement, la molette passe a la page. */
const CSS_RECAP = `
.rcp{display:flex;flex-direction:column;gap:12px}
.rcp-titre{margin:0;font-size:1.15rem}
.rcp-outils{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px}
.rcp-outils .trx-unite{min-height:40px}
.rcp-fleches{display:inline-flex;align-items:center;gap:6px}
.rcp-fleches .trx-unite{min-width:40px;font-size:1.1rem}
.rcp-unite{display:inline-flex;align-items:center;gap:6px;margin-left:auto}
.rcp-message{margin:0;padding:6px 10px;border:1px solid var(--color-svv-green);border-radius:8px;background:color-mix(in srgb, var(--color-svv-green) 10%, var(--color-svv-surface))}
.rcp-defile{overflow:auto;max-height:calc(100dvh - 230px);border:1px solid var(--color-svv-line);border-radius:10px;background:var(--color-svv-surface)}
.rcp-table{border-collapse:separate;border-spacing:0;min-width:100%;font-variant-numeric:tabular-nums;font-size:.86rem}
.rcp-table th,.rcp-table td{padding:5px 8px;border-bottom:1px solid var(--color-svv-line);white-space:nowrap;text-align:right}
.rcp-table thead th{position:sticky;top:0;z-index:2;background:var(--color-svv-field);font-size:.74rem;text-transform:uppercase;letter-spacing:.02em}
.rcp-table th[scope=row],.rcp-table thead th.rcp-coin{position:sticky;left:0;z-index:1;text-align:left;background:var(--color-svv-surface);min-width:12rem;max-width:18rem;white-space:normal}
.rcp-table thead th.rcp-coin{z-index:3;background:var(--color-svv-field)}
.rcp-section-titre th{text-align:left;font-size:.8rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;background:var(--color-svv-ink);color:var(--color-svv-surface)}
.rcp-section--ca .rcp-section-titre th{background:var(--trx-serie);color:#fff}
/* le titre d'une bande (section, famille) reste lisible quand le tableau defile a l'horizontale : c'est le LIBELLE qui colle a gauche (la bande fait
   toute la largeur, elle ne peut pas coller elle-meme) */
.rcp-colle{position:sticky;left:8px}
.rcp-famille th{text-align:left;font-weight:800;border-left:4px solid var(--trx-serie);background:color-mix(in srgb, var(--trx-serie) 14%, var(--color-svv-surface))}
.rcp-ligne th[scope=row]{border-left:4px solid var(--trx-serie);font-weight:600}
.rcp-ligne--info th,.rcp-ligne--info td{color:var(--color-svv-muted);font-style:italic}
.rcp-ligne--sous-total th,.rcp-ligne--sous-total td{font-weight:800;background:color-mix(in srgb, var(--trx-serie) 8%, var(--color-svv-surface))}
.rcp-ligne--total th,.rcp-ligne--total td,.rcp-ligne--calcule th,.rcp-ligne--calcule td{font-weight:800;border-top:2px solid var(--color-svv-line-strong)}
.rcp-section--ca .rcp-ligne th[scope=row]{border-left-color:var(--trx-serie)}
.rcp-total{border-left:2px solid var(--color-svv-line-strong);font-weight:800}
.rcp-a-completer{background:color-mix(in srgb, var(--color-svv-amber) 16%, var(--color-svv-surface))}
.rcp-ok{color:var(--color-svv-green);font-size:.78rem}
.rcp-mois-incomplet{color:var(--color-svv-amber)}
.rcp-pastille{color:var(--color-svv-amber)}
.rcp-bouton{display:block;width:100%;min-height:32px;padding:0;border:0;background:none;font:inherit;color:inherit;text-align:right;cursor:pointer;text-decoration:none}
.rcp-bouton:hover,.rcp-bouton:focus-visible{text-decoration:underline;outline-offset:2px}
.rcp-importe{color:var(--color-svv-muted)}
.rcp-corriger{display:block;font-size:.7rem;white-space:normal;min-width:7rem}
.rcp-edition{background:var(--color-svv-field)}
.rcp-editeur{display:flex;flex-direction:column;align-items:stretch;gap:4px;min-width:11rem;text-align:left}
.rcp-editeur label{display:flex;align-items:center;gap:4px;font-size:.78rem}
.rcp-editeur input[type=text]{min-height:32px;width:100%;padding:0 .4rem;font:inherit;text-align:right;border:1px solid var(--color-svv-line-strong);border-radius:6px;background:var(--color-svv-surface);color:var(--color-svv-ink)}
.rcp-editeur-boutons{display:flex;gap:4px}
.rcp-editeur-boutons .gst-btn{width:auto;min-height:34px;padding:0 .6rem;font-size:.8rem}
.rcp-note{margin:0;font-size:.82rem}
.rcp-voile{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.35)}
.rcp-fenetre{width:min(560px,100%);max-height:calc(100dvh - 32px);overflow:auto;padding:16px 18px;border-radius:12px;background:var(--color-svv-surface);box-shadow:0 18px 40px rgba(0,0,0,.25)}
.rcp-fenetre h3{margin:0 0 8px}
.rcp-changements{margin:0 0 8px;padding-left:1.1rem;display:flex;flex-direction:column;gap:4px}
.rcp-fenetre-boutons{display:flex;justify-content:flex-end;gap:8px}
.rcp-fenetre-boutons .gst-btn{width:auto;min-height:44px;padding:0 1.2rem}
@media (max-width:640px){
  .rcp-unite{margin-left:0}
  .rcp-defile{max-height:calc(100dvh - 300px)}
  .rcp-table th[scope=row],.rcp-table thead th.rcp-coin{min-width:8.5rem;max-width:10rem}
}
`;
