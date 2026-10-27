'use client';

import { useEffect, useState } from 'react';
import { ht, LIBELLE_SOCIETE, type Societe, type Vente } from '../../../../lib/transaction/modele';
import { BlocRepartition, etatSomme, lignesDe, nombre, partiesPour, versModele, type ApporteurRef, type EtatRepartition, type NegociateurRef } from './Repartition';
import { eur, posterTransaction } from './commun';
import { Journal } from './FormulaireVente';

/**
 * ══ 🔴 TUILE « TRANSACTION », LOT D (Arno, 27/10/2026) — LE DOSSIER D'UN COMPROMIS (ou d'une vente répartie) ════════════════════
 * Vendeur(s) et acquéreur(s) avec leurs coordonnées — une personne déjà connue se choisit dans l'annuaire, et une saisie qui la désigne
 * (même e-mail, même téléphone, ou même nom et même adresse) la RÉUTILISE : jamais deux fiches —, adresse du bien, date du compromis et
 * date prévue de l'acte (et date de l'acte pour une vente), commission TTC et HT, puis le bloc partagé « Négociateurs et répartition ».
 * Enregistré, journalisé, réversible ; un refus (répartition ≠ 100 %…) laisse toute la saisie à l'écran.
 */

export interface PersonneRef { id: number; nom: string; telephone: string | null; email: string | null; adresse: string | null }
export interface References { lotD: boolean; negociateurs: NegociateurRef[]; apporteurs: ApporteurRef[]; personnes: PersonneRef[];
  /** LOT E — la migration 435 (prix de vente) est-elle appliquée ? Absent : réponse d'avant ce lot (champ grisé). */
  prixVente?: boolean;
  /** LOT G — la migration 436 (annulation d'un compromis) est-elle appliquée ? */
  annulation?: boolean }
interface PersonneEcran { id: number | null; role: 'vendeur' | 'acquereur'; nom: string; telephone: string; email: string; adresse: string }
const personneVide = (role: PersonneEcran['role']): PersonneEcran => ({ id: null, role, nom: '', telephone: '', email: '', adresse: '' });
const decrire = (p: PersonneRef): string => [p.nom, p.telephone, p.email].filter((x) => x !== null && x !== '').join(' — ');

/** L'état de la répartition d'une vente lue (ou vide). PUR. */
export function etatRepartitionDe(v: Vente | null, negos: readonly NegociateurRef[]): EtatRepartition {
  const entreeId = v?.dossier?.entree?.id ?? null;
  const sortieId = v?.dossier?.sortie?.id ?? null;
  return { entreeId, sortieId, apporteurId: v?.dossier?.apporteurId ?? null,
    retroTexte: v?.repartition && v.repartition.retroApporteurTtc !== 0 ? String(v.repartition.retroApporteurTtc).replace('.', ',') : '',
    parties: v?.repartition ? lignesDe(v.repartition.parties, negos) : partiesPour(negos, entreeId, sortieId) };
}

/** Le corps envoyé à `dossier-enregistrer` (la saisie telle quelle : le serveur relit et vérifie tout). */
export function corpsDossier(societe: Societe, statut: 'compromis' | 'vendue', champs: { libelle: string; commission: string; dateCompromis: string; dateActePrevue: string;
  dateActe: string; adresseBien: string; note: string; prixVente?: string }, personnes: readonly PersonneEcran[], r: EtatRepartition, lignes?: unknown[]): Record<string, unknown> {
  return { societe, statut, libelle: champs.libelle, honorairesTtc: champs.commission, prixVente: champs.prixVente ?? '', dateCompromis: champs.dateCompromis || null, dateActePrevue: champs.dateActePrevue || null,
    dateActe: champs.dateActe || null, adresseBien: champs.adresseBien, note: champs.note, entreeId: r.entreeId, sortieId: r.sortieId, apporteurId: r.apporteurId,
    retroApporteurTtc: r.retroTexte, personnes: personnes.map((p) => ({ ...p })), parties: versModele(r.parties), ...(lignes ? { lignes } : {}) };
}

export function FormulaireDossier({ societe, vente, references, onFermer, onFait, ajouter = null, repartitionInitiale, message }: {
  /** LOT G — une répartition déjà changée (négociateur choisi depuis la carte) à revoir, et le message qui le dit. */
  repartitionInitiale?: EtatRepartition; message?: string;
  societe: Societe; vente: Vente | null; references: References; onFermer: () => void; onFait: () => void;
  /** LOT F — « + Ajouter un vendeur / un acquéreur » depuis la carte : une ligne neuve de ce côté, prête à la saisie (personne connue ou neuve). */
  ajouter?: 'vendeur' | 'acquereur' | null;
}) {
  const statut: 'compromis' | 'vendue' = vente?.statut === 'vendue' ? 'vendue' : 'compromis';
  const d = vente?.dossier ?? null;
  const [champs, setChamps] = useState({ libelle: vente?.libelle ?? '', commission: vente === null ? '' : String(vente.honorairesTtc).replace('.', ','),
    dateCompromis: vente?.dateCompromis ?? '', dateActePrevue: d?.dateActePrevue ?? '', dateActe: d?.dateActe ?? (vente?.statut === 'vendue' && vente.mois !== null
      ? `${vente.annee}-${String(vente.mois).padStart(2, '0')}-01` : ''), adresseBien: d?.adresseBien ?? '', note: vente?.note ?? '',
    prixVente: vente?.prixVente == null ? '' : String(vente.prixVente).replace('.', ',') });
  const [personnes, setPersonnes] = useState<PersonneEcran[]>(() => {
    const lues = (d?.personnes ?? []).map((p) => ({ id: p.id, role: p.role, nom: p.nom, telephone: p.telephone ?? '', email: p.email ?? '', adresse: p.adresse ?? '' }));
    const base = [...(lues.some((p) => p.role === 'vendeur') ? [] : [personneVide('vendeur')]), ...lues, ...(lues.some((p) => p.role === 'acquereur') ? [] : [personneVide('acquereur')])];
    return ajouter !== null && lues.some((p) => p.role === ajouter) ? [...base, personneVide(ajouter)] : base;
  });
  const [repartition, setRepartition] = useState<EtatRepartition>(() => repartitionInitiale ?? etatRepartitionDe(vente, references.negociateurs));
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const commission = nombre(champs.commission) ?? Number.NaN;
  // LOT E — une répartition qui ne fait pas 100 % désactive « Enregistrer » (avec l'explication) ; la saisie reste.
  const somme = etatSomme(repartition, commission);
  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [onFermer]);

  const champ = (k: keyof typeof champs) => (e: { target: { value: string } }) => setChamps((c) => ({ ...c, [k]: e.target.value }));
  const changerPersonne = (i: number, p: Partial<PersonneEcran>): void => setPersonnes((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  /** Choisir une personne de l'annuaire (par son libellé dans la liste) : sa fiche est reprise, son id gardé (aucun doublon). */
  const choisirConnue = (i: number, texte: string): void => {
    const p = references.personnes.find((x) => decrire(x) === texte);
    if (p === undefined) changerPersonne(i, { nom: texte, id: null });
    else changerPersonne(i, { id: p.id, nom: p.nom, telephone: p.telephone ?? '', email: p.email ?? '', adresse: p.adresse ?? '' });
  };
  const enregistrer = async (): Promise<void> => {
    setEnvoi(true);
    const r = await posterTransaction({ action: 'dossier-enregistrer', id: vente?.id ?? null, dossier: corpsDossier(societe, statut, champs, personnes, repartition) });
    setEnvoi(false);
    if (r === null) onFait(); else setMotif(r);
  };

  const titre = vente === null ? `Nouveau compromis — ${LIBELLE_SOCIETE[societe]}` : `${statut === 'compromis' ? 'Compromis' : 'Vente'} — ${vente.libelle}`;
  const blocPersonnes = (role: PersonneEcran['role'], mot: string) => (
    <fieldset className="trx-plein trx-parts" data-personnes={role}>
      <legend className="loc-muet">{mot}</legend>
      {personnes.map((p, i) => p.role !== role ? null : (
        <div className="trx-part" key={i} data-personne={i}>
          <label>Nom<input list="trx-personnes" value={p.nom} onChange={(e) => choisirConnue(i, e.target.value)} data-personne-nom={i}
            autoFocus={ajouter === role && i === personnes.map((x) => x.role).lastIndexOf(role)} />
            {p.id !== null && <span className="loc-muet">fiche de l’annuaire n° {p.id}</span>}</label>
          <label>Téléphone<input type="tel" inputMode="tel" value={p.telephone} onChange={(e) => changerPersonne(i, { telephone: e.target.value })} /></label>
          <label>E-mail<input type="email" inputMode="email" autoCapitalize="none" value={p.email} onChange={(e) => changerPersonne(i, { email: e.target.value })} /></label>
          <label>Adresse<input value={p.adresse} onChange={(e) => changerPersonne(i, { adresse: e.target.value })} /></label>
          <button type="button" className="trx-bouton-lien" onClick={() => setPersonnes((xs) => xs.filter((_, j) => j !== i))}>Enlever</button>
        </div>
      ))}
      <p><button type="button" className="trx-bouton-lien" onClick={() => setPersonnes((xs) => [...xs, personneVide(role)])} data-ajouter-personne={role}>+ {role === 'vendeur' ? 'Un vendeur' : 'Un acquéreur'}</button></p>
    </fieldset>
  );
  return (
    <div className="tdb-voile" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className="tdb-fenetre" role="dialog" aria-modal="true" aria-label={titre} data-formulaire-dossier={vente?.id ?? 'nouveau'}>
        <header className="tdb-fenetre-tete"><h3>{titre}</h3><button type="button" className="tdb-x" aria-label="Fermer" onClick={onFermer}>×</button></header>
        <div className="tdb-fenetre-corps">
          {!references.lotD && <p className="loc-alerte loc-alerte--orange" role="status" data-sans-434>Disponible après la mise à jour de la base (migration 434) : rien ne s’enregistre encore.</p>}
          {message !== undefined && <p className="loc-alerte loc-alerte--orange" role="status" data-message-revoir>{message}</p>}
          <form className="trx-form" onSubmit={(e) => { e.preventDefault(); void enregistrer(); }}>
            <datalist id="trx-personnes">{references.personnes.map((p) => <option key={p.id} value={decrire(p)} />)}</datalist>
            {blocPersonnes('vendeur', 'Vendeur(s)')}
            {blocPersonnes('acquereur', 'Acquéreur(s)')}
            <label className="trx-plein">Adresse du bien<input value={champs.adresseBien} onChange={champ('adresseBien')} data-champ="adresse-bien" /></label>
            <label>Date du compromis<input type="date" value={champs.dateCompromis} onChange={champ('dateCompromis')} data-champ="date-compromis" /></label>
            <label>Date prévue de l’acte<input type="date" value={champs.dateActePrevue} onChange={champ('dateActePrevue')} data-champ="date-acte-prevue" /></label>
            {statut === 'vendue' && <label>Date de l’acte (le mois du CA)<input type="date" value={champs.dateActe} onChange={champ('dateActe')} required data-champ="date-acte" /></label>}
            <label>Prix de vente (€)
              <input value={champs.prixVente} onChange={champ('prixVente')} inputMode="decimal" disabled={references.prixVente !== true} data-champ="prix-vente" />
              {references.prixVente !== true && <span className="loc-muet">Disponible après la mise à jour de la base (migration 435).</span>}</label>
            <label>Commission TTC
              <input value={champs.commission} onChange={champ('commission')} inputMode="decimal" required data-champ="commission" />
              <span className="loc-muet">{Number.isFinite(commission) ? `soit ${eur(ht(commission))} HT` : 'HT = TTC ÷ 1,2'}</span></label>
            <label className="trx-plein">Libellé (facultatif : sinon « vendeurs / acquéreurs »)<input value={champs.libelle} onChange={champ('libelle')} data-champ="libelle" /></label>
            <BlocRepartition etat={repartition} onChange={setRepartition} negociateurs={references.negociateurs} apporteurs={references.apporteurs} honorairesTtc={commission}
              societeVente={vente?.societe ?? societe} />
            <label className="trx-plein">Note<textarea value={champs.note} onChange={champ('note')} /></label>
            {motif !== null && <p className="trx-erreur trx-plein" role="alert" data-motif-dossier>{motif}</p>}
            <div className="trx-plein trx-actions">
              <button type="submit" className="svv-btn svv-btn-primary gst-btn" disabled={envoi || !references.lotD || somme.motif !== null} data-enregistrer-dossier>Enregistrer</button>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFermer}>Fermer</button>
              {somme.motif !== null && <span className="trx-explication" data-enregistrer-bloque>Enregistrer est désactivé : la répartition doit faire exactement 100 %.</span>}
            </div>
          </form>
          {vente !== null && <Journal entite="vente" id={vente.id} onFait={onFait} />}
        </div>
      </div>
    </div>
  );
}
