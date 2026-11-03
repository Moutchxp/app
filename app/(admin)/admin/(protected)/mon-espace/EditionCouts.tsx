'use client';

import { useState } from 'react';
import { eur } from '../transaction/commun';
import { estMontantSaisi, URL_COUTS } from '../../../../lib/mon-espace/couts';
import { profilsPourSalaire, type ProfilCout } from '../../../../lib/admin/fonctionsCompteModele';
import type { CoutLigne, FamilleCout, PosteSaisi } from '../../../../lib/transaction/coutsSaisis';
import { NOMS_MOIS, type Societe } from '../../../../lib/transaction/modele';

/**
 * ══ 🔴 « LES COÛTS », LOT 2 (Arno, 03/11/2026, C3 / C4 / C15) — LE PANNEAU D'ÉDITION SUR PLACE ════════════════════════════════════════════════════
 * Ouvert d'un clic sur une case du tableau (associés, une structure choisie dans « Voir »). Il écrit LES MÊMES enregistrements que la page
 * « Saisir les coûts du mois » et que le Suivi CA (journalisés, garde de version : 409 si la ligne a changé depuis sa lecture) :
 *   · salaires chargés : un salarié par ligne (profil + montant chargé), ajout / modification / retrait ; les profils de la fonction de la famille
 *     d'abord, puis ceux de la location ou de la gestion, puis les autres (C9) ;
 *   · « Autres » : des lignes libellé + montant ;
 *   · ADHOC, facture MONGA : le montant du mois (la Gestion du Suivi CA) ;
 *   · un coût AUTOMATIQUE : il se corrige à la source (C4) — l'affaire, le bail ou la règle de l'apporteur — ; le panneau dit où.
 * Montants saisis en HT ; « Autres » : comptés sans TVA ajoutée (TTC = HT).
 */
export type CibleCout =
  | { sorte: 'lignes'; famille: FamilleCout; poste: PosteSaisi; mois: number }
  | { sorte: 'gestion'; poste: 'adhoc' | 'monga'; mois: number }
  | { sorte: 'auto'; famille: FamilleCout; poste: string; libelle: string; mois: number };

export interface DonneesSaisie {
  lignes: readonly CoutLigne[]; profils: readonly ProfilCout[];
  versionsGestion: Readonly<Record<string, { version: number; origine: string }>>;
  /** La valeur actuelle d'ADHOC / MONGA du mois (HT, null : non saisi) et le montant mensuel d'avant des salaires (C8), s'il en reste un. */
  gestionDuMois: (mois: number) => { adhoc: number | null; monga: number | null; salaireMensuel: number | null };
  salaireMensuelLocation: (mois: number) => number | null;
  /** Les affaires (ventes) du mois de la structure, pour un coût automatique de la vente. */
  ventesDuMois: (mois: number) => readonly { id: number; libelle: string }[];
}

/** Un montant tapé (« 1 234,56 », « 1234.5 ») → nombre, ou null s'il est vide ; `NaN` s'il est illisible. PUR. */
export function lireMontant(texte: string): number | null {
  const t = texte.replace(/[\s  €]/g, '').replace(',', '.');
  if (t === '') return null;
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : Number.NaN;
}
const ecrireMontant = (x: number | null): string => (x === null ? '' : x.toFixed(2).replace('.', ','));

/** Envoie une saisie ; rend le statut et le motif (409 : la ligne a changé entre-temps). */
export async function posterCout(corps: unknown): Promise<{ ok: boolean; statut: number; motif: string | null }> {
  try {
    const r = await fetch(URL_COUTS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const j = (await r.json().catch(() => ({}))) as { motif?: string; message?: string };
    return { ok: r.ok, statut: r.status, motif: r.ok ? null : j.motif ?? j.message ?? 'Enregistrement impossible.' };
  } catch { return { ok: false, statut: 0, motif: 'Réseau indisponible : rien n’a été écrit.' }; }
}

const MOT_FAMILLE: Record<FamilleCout, string> = { vente: 'vente', location: 'location', gestion: 'gestion' };

export function PanneauCouts({ cible, annee, societe, d, onFermer, onEcrit }: { cible: CibleCout; annee: number; societe: Societe; d: DonneesSaisie;
  onFermer: () => void; onEcrit: () => void }) {
  const [message, setMessage] = useState<{ texte: string; conflit: boolean } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const mois = `${NOMS_MOIS[cible.mois - 1]} ${annee}`;
  const envoyer = async (corps: unknown): Promise<boolean> => {
    setEnvoi(true); setMessage(null);
    const r = await posterCout(corps);
    setEnvoi(false);
    if (r.ok) { onEcrit(); return true; }
    setMessage({ texte: r.motif ?? 'Enregistrement impossible.', conflit: r.statut === 409 });
    return false;
  };
  const titre = cible.sorte === 'lignes' ? `${cible.poste === 'salaires' ? 'Salaires chargés' : 'Autres'} — ${MOT_FAMILLE[cible.famille]}, ${mois}`
    : cible.sorte === 'gestion' ? `${cible.poste === 'adhoc' ? 'ADHOC' : 'MONGA'} — ${mois}` : `${cible.libelle} — ${mois}`;
  return (
    <div className="mes-couts-panneau" role="dialog" aria-labelledby="mes-couts-panneau-titre" data-panneau-couts={cible.sorte}>
      <div className="mes-couts-panneau-tete">
        <h4 id="mes-couts-panneau-titre">{titre}</h4>
        <button type="button" className="mes-couts-fermer" aria-label="Fermer" onClick={onFermer} data-fermer-panneau>×</button>
      </div>
      {cible.sorte === 'lignes' && <EditeurLignes cible={cible} annee={annee} societe={societe} d={d} envoi={envoi} envoyer={envoyer} />}
      {cible.sorte === 'gestion' && <EditeurGestion cible={cible} annee={annee} d={d} envoi={envoi} envoyer={envoyer} />}
      {cible.sorte === 'auto' && <DetailAuto cible={cible} annee={annee} societe={societe} d={d} />}
      {message !== null && <p className={message.conflit ? 'loc-alerte loc-alerte--orange' : 'trx-erreur'} role="alert" data-message-couts={message.conflit ? 'conflit' : 'refus'}>
        {message.texte}{message.conflit && <> <button type="button" className="trx-bouton-lien" onClick={onEcrit} data-recharger-couts>Recharger</button></>}</p>}
    </div>
  );
}

function EditeurLignes({ cible, annee, societe, d, envoi, envoyer }: { cible: Extract<CibleCout, { sorte: 'lignes' }>; annee: number; societe: Societe; d: DonneesSaisie;
  envoi: boolean; envoyer: (c: unknown) => Promise<boolean> }) {
  const siennes = d.lignes.filter((l) => l.societe === societe && l.famille === cible.famille && l.poste === cible.poste && l.annee === annee && l.mois === cible.mois);
  const salaires = cible.poste === 'salaires';
  const ordre = profilsPourSalaire(cible.famille, d.profils);
  const pris = new Set(siennes.map((l) => l.compteId));
  const [nouveau, setNouveau] = useState({ compte: '', libelle: '', montant: '' });
  const [edits, setEdits] = useState<Record<number, { montant: string; compte: string; libelle: string }>>({});
  const editDe = (l: CoutLigne) => edits[l.id] ?? { montant: ecrireMontant(l.montantHt), compte: String(l.compteId ?? ''), libelle: l.libelle ?? '' };
  const [erreur, setErreur] = useState<string | null>(null);
  const ancien = cible.poste === 'salaires' && cible.famille !== 'vente' && siennes.length === 0
    ? (cible.famille === 'gestion' ? d.gestionDuMois(cible.mois).salaireMensuel : d.salaireMensuelLocation(cible.mois)) : null;
  const choixProfil = (valeur: string, onChange: (v: string) => void, exclus: Set<number | null>, attr: string) => (
    <select value={valeur} onChange={(e) => onChange(e.target.value)} aria-label="Salarié" data-choix-profil={attr}>
      <option value="">Choisir le salarié…</option>
      {([1, 2, 3] as const).map((g) => {
        const xs = ordre.filter((x) => x.groupe === g && (!exclus.has(x.profil.id) || String(x.profil.id) === valeur));
        return xs.length === 0 ? null : <optgroup key={g} label={g === 1 ? `Fonction ${MOT_FAMILLE[cible.famille]}` : g === 2 ? 'Location ou gestion' : 'Autres profils'} data-groupe-profils={g}>
          {xs.map((x) => <option key={x.profil.id} value={x.profil.id}>{x.profil.libelle}</option>)}</optgroup>;
      })}
    </select>
  );
  const verifier = (montant: string): number | null => {
    const m = lireMontant(montant);
    if (m === null || !estMontantSaisi(m)) { setErreur('Montant attendu : un nombre positif, en euros HT (deux décimales au plus).'); return null; }
    setErreur(null); return m;
  };
  const ajouter = async (): Promise<void> => {
    const m = verifier(nouveau.montant); if (m === null) return;
    if (salaires && nouveau.compte === '') { setErreur('Choisissez le salarié.'); return; }
    if (!salaires && nouveau.libelle.trim() === '') { setErreur('Donnez un libellé.'); return; }
    const ok = await envoyer({ action: 'ligne-ajouter', ligne: { societe, famille: cible.famille, poste: cible.poste, annee, mois: cible.mois,
      compteId: salaires ? Number(nouveau.compte) : null, libelle: salaires ? null : nouveau.libelle.trim(), montantHt: m } });
    if (ok) setNouveau({ compte: '', libelle: '', montant: '' });
  };
  return (
    <div className="mes-couts-editeur" data-editeur-lignes={`${cible.famille}-${cible.poste}`}>
      {ancien !== null && <p className="loc-muet" data-salaire-mensuel-ancien>Montant mensuel d’avant : {eur(ancien)} HT — il est remplacé dès qu’un salarié est saisi pour ce mois.</p>}
      {siennes.length === 0 && <p className="loc-muet" data-aucune-ligne>Aucune ligne ce mois-ci.</p>}
      <ul className="mes-couts-lignes">
        {siennes.map((l) => { const e = editDe(l); const changer = (x: Partial<typeof e>) => setEdits((s) => ({ ...s, [l.id]: { ...e, ...x } })); return (
          <li key={l.id} data-ligne-cout={l.id}>
            {salaires ? choixProfil(e.compte, (v) => changer({ compte: v }), pris, String(l.id))
              : <input type="text" value={e.libelle} onChange={(x) => changer({ libelle: x.target.value })} aria-label="Libellé" maxLength={120} data-libelle-ligne={l.id} />}
            <input type="text" inputMode="decimal" value={e.montant} onChange={(x) => changer({ montant: x.target.value })} aria-label="Montant HT" data-montant-ligne={l.id} />
            <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi} data-enregistrer-ligne={l.id} onClick={() => {
              const m = verifier(e.montant); if (m === null) return;
              void envoyer({ action: 'ligne-modifier', id: l.id, version: l.version, montantHt: m, ...(salaires ? { compteId: Number(e.compte) } : { libelle: e.libelle }) });
            }}>Enregistrer</button>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi} data-retirer-ligne={l.id}
              onClick={() => void envoyer({ action: 'ligne-retirer', id: l.id, version: l.version })}>Retirer</button>
          </li>); })}
        <li data-nouvelle-ligne>
          {salaires ? choixProfil(nouveau.compte, (v) => setNouveau((s) => ({ ...s, compte: v })), pris, 'nouveau')
            : <input type="text" value={nouveau.libelle} placeholder="Libellé (loyer, logiciel…)" onChange={(x) => setNouveau((s) => ({ ...s, libelle: x.target.value }))} aria-label="Libellé" maxLength={120} data-libelle-nouveau />}
          <input type="text" inputMode="decimal" value={nouveau.montant} placeholder="Montant HT" onChange={(x) => setNouveau((s) => ({ ...s, montant: x.target.value }))} aria-label="Montant HT" data-montant-nouveau />
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => void ajouter()} data-ajouter-ligne>Ajouter</button>
        </li>
      </ul>
      {erreur !== null && <p className="trx-erreur" role="alert" data-erreur-saisie>{erreur}</p>}
      <p className="loc-muet mes-couts-aide">Montants en euros HT{salaires ? ', chargés (sans TVA)' : ' (comptés sans TVA ajoutée)'}.</p>
    </div>
  );
}

function EditeurGestion({ cible, annee, d, envoi, envoyer }: { cible: Extract<CibleCout, { sorte: 'gestion' }>; annee: number; d: DonneesSaisie; envoi: boolean;
  envoyer: (c: unknown) => Promise<boolean> }) {
  const actuel = d.gestionDuMois(cible.mois)[cible.poste];
  const v = d.versionsGestion[`${annee}-${String(cible.mois).padStart(2, '0')}`];
  const [texte, setTexte] = useState(ecrireMontant(actuel));
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <div className="mes-couts-editeur" data-editeur-gestion={cible.poste}>
      <label className="mes-couts-champ">Montant du mois (HT){cible.poste === 'monga' ? ' — la facture mensuelle MONGA' : ''}
        <input type="text" inputMode="decimal" value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="vide : non saisi" data-montant-gestion /></label>
      <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} data-enregistrer-gestion onClick={() => {
        const m = lireMontant(texte);
        if (m !== null && !estMontantSaisi(m)) { setErreur('Montant attendu : un nombre positif, en euros HT (deux décimales au plus).'); return; }
        setErreur(null);
        void envoyer({ action: 'gestion-poste', annee, mois: cible.mois, poste: cible.poste, montantHt: m, version: v?.version ?? 0 });
      }}>Enregistrer</button>
      {erreur !== null && <p className="trx-erreur" role="alert" data-erreur-saisie>{erreur}</p>}
      <p className="loc-muet mes-couts-aide">La même valeur que Suivi CA › Gestion (une seule ligne par mois, journalisée). TVA : 20 % ajoutés en TTC, comme dans « Coûts globaux ».</p>
    </div>
  );
}

/** C4 — un coût automatique : il se corrige à la source, avec les gestes et le journal du Suivi CA ou de la Location. */
function DetailAuto({ cible, annee, societe, d }: { cible: Extract<CibleCout, { sorte: 'auto' }>; annee: number; societe: Societe; d: DonneesSaisie }) {
  const m = String(cible.mois).padStart(2, '0');
  if (cible.famille === 'vente') {
    const ventes = d.ventesDuMois(cible.mois);
    return (
      <div className="mes-couts-editeur" data-detail-auto="vente">
        <p>Ce montant vient des affaires signées en {NOMS_MOIS[cible.mois - 1].toLowerCase()} {annee}. Il se corrige sur l’affaire elle-même (commission, apporteur,
          agence extérieure) : mêmes gestes, même journal que le Suivi CA.</p>
        {ventes.length === 0 ? <p className="loc-muet">Aucune affaire signée ce mois-ci.</p>
          : <ul className="mes-couts-affaires">{ventes.map((v) => <li key={v.id} data-affaire-couts={v.id}>{v.libelle}</li>)}</ul>}
        <a className="svv-btn svv-btn-outline gst-btn" href={`/admin/transaction/${societe}?vue=mois&annee=${annee}&mois=${cible.mois}`} data-lien-source="vente">Ouvrir le mois dans le Suivi CA</a>
      </div>
    );
  }
  return (
    <div className="mes-couts-editeur" data-detail-auto="location">
      <p>Ce montant est calculé par le module Location ({`${m}/${annee}`}) à partir des baux et des règles des apporteurs. Il se corrige à la source : sur le bail
        (feuille du mois) ou dans la règle de l’apporteur (paramètres).</p>
      <a className="svv-btn svv-btn-outline gst-btn" href="/admin/location/outils/mois" data-lien-source="location-mois">Ouvrir la feuille du mois</a>{' '}
      <a className="svv-btn svv-btn-outline gst-btn" href="/admin/location/outils/parametres" data-lien-source="location-regles">Règles des apporteurs</a>
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Le panneau : sous le tableau, pleine largeur ; au telephone, les champs passent a la ligne. */
export const CSS_EDITION_COUTS = `
.mes-couts-case{appearance:none;border:0;background:none;font:inherit;color:inherit;cursor:pointer;padding:2px 4px;margin:-2px -4px;border-radius:6px;min-height:28px;text-align:right}
.mes-couts-case:hover,.mes-couts-case:focus-visible{background:var(--color-svv-field);outline:1px dashed var(--color-svv-line-strong)}
.mes-couts-case[data-case-saisie]::after{content:"\\270E";margin-left:4px;font-size:.7rem;color:var(--color-svv-muted)}
.mes-couts-panneau{margin:10px 0 0;padding:12px;border:1px solid var(--color-svv-line-strong);border-radius:12px;background:var(--color-svv-surface)}
.mes-couts-panneau-tete{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px}
.mes-couts-panneau-tete h4{margin:0;font-size:1rem}
.mes-couts-fermer{min-width:44px;min-height:44px;font:inherit;font-size:1.25rem;background:none;border:0;color:var(--color-svv-ink);cursor:pointer}
.mes-couts-lignes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.mes-couts-lignes li{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.mes-couts-editeur .gst-btn{width:auto;flex:0 0 auto;min-height:44px;padding:0 1rem}
.mes-couts-editeur select,.mes-couts-editeur input{min-height:44px;padding:0 .6rem;font:inherit;color:var(--color-svv-ink);background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:8px}
.mes-couts-editeur select{min-width:12rem;max-width:100%}
.mes-couts-editeur input[inputmode=decimal]{width:8.5rem;text-align:right}
.mes-couts-editeur input[type=text]:not([inputmode]){flex:1 1 12rem;min-width:0}
.mes-couts-champ{display:flex;flex-direction:column;gap:4px;margin:0 0 8px;font-weight:600}
.mes-couts-aide{margin:8px 0 0;font-size:.85rem}
.mes-couts-affaires{margin:6px 0 10px;padding-left:1.2rem}
@media (max-width:640px){ .mes-couts-lignes li{align-items:stretch} .mes-couts-editeur select,.mes-couts-editeur input[inputmode=decimal]{flex:1 1 100%;width:100%} .mes-couts-lignes .gst-btn{flex:1 1 auto} }
`;
