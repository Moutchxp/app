'use client';

import { useEffect, useState } from 'react';
import { ListeChoix } from '../location/ListeChoix';
import { LIBELLE_ROLE, LIBELLE_SOCIETE, LIBELLE_STATUT, NOMS_MOIS, STATUTS, ht, type RoleLigne, type Societe, type StatutVente, type Vente } from '../../../../lib/transaction/modele';
import { API_TRANSACTION, eur, posterTransaction } from './commun';
import { BlocRepartition, etatSomme, type EtatRepartition } from './Repartition';
import { corpsDossier, etatRepartitionDe, type References } from './FormulaireDossier';

/**
 * TUILE TRANSACTION — SAISIR ou MODIFIER une vente (journalisé, réversible). Une vente neuve porte ses négociateurs et leurs parts ;
 * une vente existante se corrige champ par champ (ses lignes d'origine, venues du fichier, restent lisibles) ; son historique se lit
 * dessous, chaque geste avec « Annuler ». « Retirer » la met de côté (réversible) : rien n'est jamais supprimé.
 */
interface Part { negociateur: string; role: RoleLigne; montantTtc: string }
const vide = (): Part => ({ negociateur: '', role: 'vendeur', montantTtc: '' });

export function FormulaireVente({ societe, vente, annee, mois, negociateurs, references = null, onFermer, onFait }: {
  societe: Societe; vente: Vente | null; annee: number; mois: number | null; negociateurs: readonly string[];
  /** LOT D (434) — les comptes, apporteurs et personnes : le bloc « Négociateurs et répartition » d'une vente neuve (absent sans la 434). */
  references?: References | null;
  onFermer: () => void; onFait: () => void;
}) {
  const [libelle, setLibelle] = useState(vente?.libelle ?? '');
  const [honoraires, setHonoraires] = useState(vente === null ? '' : String(vente.honorairesTtc).replace('.', ','));
  const [statut, setStatut] = useState<StatutVente>(vente?.statut ?? 'vendue');
  const [an, setAn] = useState(String(vente?.annee ?? annee));
  const [m, setM] = useState(vente === null ? (mois === null ? '' : String(mois)) : vente.mois === null ? '' : String(vente.mois));
  const [dateCompromis, setDateCompromis] = useState(vente?.dateCompromis ?? '');
  const [apporteur, setApporteur] = useState(vente?.apporteur ?? '');
  const [note, setNote] = useState(vente?.note ?? '');
  // LOT E (435) — le prix de vente, facultatif (grisé sans la migration).
  const [prixVente, setPrixVente] = useState(vente?.prixVente == null ? '' : String(vente.prixVente).replace('.', ','));
  const prixDisponible = references?.prixVente === true;
  const [parts, setParts] = useState<Part[]>([vide()]);
  const [repartition, setRepartition] = useState<EtatRepartition>(() => etatRepartitionDe(null, references?.negociateurs ?? []));
  /** LOT D — une vente neuve avec un négociateur d'entrée ou de sortie suit la répartition (enregistrée avec son dossier). */
  const repartie = vente === null && references?.lotD === true && (repartition.entreeId !== null || repartition.sortieId !== null);
  const somme = etatSomme(repartition, Number(honoraires.replace(/\s/g, '').replace(',', '.')));
  const sommeFausse = repartie && somme.motif !== null;
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const honorairesNombre = Number(honoraires.replace(/\s/g, '').replace(',', '.'));

  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [onFermer]);

  const enregistrer = async (): Promise<void> => {
    setEnvoi(true);
    const champs = { libelle, honorairesTtc: honoraires, statut, annee: an, mois: m === '' ? null : m, dateCompromis: dateCompromis || null, apporteur, note,
      ...(prixDisponible ? { prixVente } : {}) };
    const dateActe = statut === 'vendue' && m !== '' ? `${an}-${String(m).padStart(2, '0')}-01` : '';
    const r = repartie
      ? (statut === 'annulee' ? 'Une vente répartie est un compromis ou une vente (pas « annulée »).'
        : statut === 'vendue' && dateActe === '' ? 'Une vente répartie porte le mois de l’acte.'
        : await posterTransaction({ action: 'dossier-enregistrer', id: null, dossier: { ...corpsDossier(societe, statut, { libelle, commission: honoraires, dateCompromis,
          dateActePrevue: '', dateActe, adresseBien: '', note, prixVente }, [], repartition, parts), apporteurNom: apporteur } }))
      : vente === null
      ? await posterTransaction({ action: 'vente-saisir', vente: { societe, ...champs, parts } })
      : await posterTransaction({ action: 'vente-modifier', id: vente.id, champs });
    setEnvoi(false);
    if (r === null) onFait(); else setMotif(r);
  };
  const retirer = async (): Promise<void> => {
    if (vente === null) return;
    setEnvoi(true);
    const r = await posterTransaction({ action: 'vente-retirer', id: vente.id, retirer: true });
    setEnvoi(false);
    if (r === null) onFait(); else setMotif(r);
  };

  const titre = vente === null ? `Nouvelle vente — ${LIBELLE_SOCIETE[societe]}` : `Modifier — ${vente.libelle}`;
  return (
    <div className="tdb-voile" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className="tdb-fenetre" role="dialog" aria-modal="true" aria-label={titre} data-formulaire-vente={vente?.id ?? 'nouvelle'}>
        <header className="tdb-fenetre-tete">
          <h3>{titre}</h3>
          <button type="button" className="tdb-x" aria-label="Fermer" onClick={onFermer}>×</button>
        </header>
        <div className="tdb-fenetre-corps">
          <form className="trx-form" onSubmit={(e) => { e.preventDefault(); void enregistrer(); }}>
            <label className="trx-plein">Vendeur / acquéreur
              <input value={libelle} onChange={(e) => setLibelle(e.target.value)} required autoFocus data-champ="libelle" /></label>
            <label>Honoraires TTC
              <input value={honoraires} onChange={(e) => setHonoraires(e.target.value)} inputMode="decimal" required data-champ="honoraires" />
              <span className="loc-muet">{Number.isFinite(honorairesNombre) && honoraires !== '' ? `soit ${eur(ht(honorairesNombre))} HT` : 'HT = TTC ÷ 1,2'}</span></label>
            <label>Prix de vente (€)
              <input value={prixVente} onChange={(e) => setPrixVente(e.target.value)} inputMode="decimal" disabled={!prixDisponible} data-champ="prix-vente" />
              {!prixDisponible && <span className="loc-muet">Disponible après la mise à jour de la base (migration 435).</span>}</label>
            <label>Statut
              <ListeChoix options={STATUTS.map((s) => ({ id: s, libelle: LIBELLE_STATUT[s] }))} valeur={statut} vide={null} libelle="Statut"
                onChange={(v) => setStatut(v as StatutVente)} donnees={{ 'data-champ': 'statut' }} /></label>
            <label>Année
              <input value={an} onChange={(e) => setAn(e.target.value)} inputMode="numeric" data-champ="annee" /></label>
            <label>Mois de l’acte (le mois du CA)
              <ListeChoix options={NOMS_MOIS.map((x, i) => ({ id: i + 1, libelle: x }))} valeur={m} vide={statut === 'compromis' ? 'Sans objet (compromis)' : 'Mois à confirmer'}
                libelle="Mois de l’acte" onChange={setM} desactive={statut === 'compromis'} donnees={{ 'data-champ': 'mois' }} /></label>
            <label>Date du compromis
              <input type="date" value={dateCompromis} onChange={(e) => setDateCompromis(e.target.value)} data-champ="date-compromis" /></label>
            <label>Apporteur
              <input value={apporteur} onChange={(e) => setApporteur(e.target.value)} data-champ="apporteur" /></label>
            <label className="trx-plein">Note
              <textarea value={note} onChange={(e) => setNote(e.target.value)} data-champ="note" /></label>
            {vente === null && references?.lotD === true && (
              <BlocRepartition etat={repartition} onChange={setRepartition} negociateurs={references.negociateurs} apporteurs={references.apporteurs} honorairesTtc={honorairesNombre}
                societeVente={societe} />
            )}
            {vente === null ? (
              <fieldset className="trx-plein trx-parts" data-parts>
                <legend className="loc-muet">Négociateur(s) et leurs parts</legend>
                <datalist id="trx-negociateurs">{negociateurs.map((x) => <option key={x} value={x} />)}</datalist>
                {parts.map((p, i) => (
                  <div className="trx-part" key={i}>
                    <label>Négociateur<input list="trx-negociateurs" value={p.negociateur} data-part-negociateur={i}
                      onChange={(e) => setParts((xs) => xs.map((y, j) => (j === i ? { ...y, negociateur: e.target.value } : y)))} /></label>
                    <label>Rôle<ListeChoix options={(['vendeur', 'negociateur', 'part'] as const).map((r) => ({ id: r, libelle: LIBELLE_ROLE[r] }))} valeur={p.role} vide={null}
                      libelle="Rôle" onChange={(v) => setParts((xs) => xs.map((y, j) => (j === i ? { ...y, role: v as RoleLigne } : y)))} /></label>
                    <label>Montant TTC<input inputMode="decimal" value={p.montantTtc}
                      onChange={(e) => setParts((xs) => xs.map((y, j) => (j === i ? { ...y, montantTtc: e.target.value } : y)))} /></label>
                    <button type="button" className="trx-bouton-lien" onClick={() => setParts((xs) => (xs.length === 1 ? [vide()] : xs.filter((_, j) => j !== i)))}>Enlever</button>
                  </div>
                ))}
                <p><button type="button" className="trx-bouton-lien" onClick={() => setParts((xs) => [...xs, vide()])}>+ Un négociateur</button></p>
              </fieldset>
            ) : (
              <div className="trx-plein">
                <p className="loc-muet">Négociateurs et lignes d’origine</p>
                {vente.lignes.length === 0 ? <p className="loc-muet">Aucun négociateur.</p> : (
                  <ul className="trx-journal">{vente.lignes.map((l) => (
                    <li key={l.id}>{l.negociateur} — {LIBELLE_ROLE[l.role]}{l.montantTtc !== null ? ` : ${eur(l.montantTtc)} TTC` : ''}
                      {!l.compte && <span className="loc-pastille trx-pastilles">hors honoraires</span>}
                      {l.sourceOnglet !== null && <span className="trx-source"> · {l.sourceFichier} › {l.sourceOnglet} › ligne {l.sourceLigne}</span>}</li>
                  ))}</ul>
                )}
              </div>
            )}
            {motif !== null && <p className="trx-erreur trx-plein" role="alert">{motif}</p>}
            <div className="trx-plein trx-actions">
              <button type="submit" className="svv-btn svv-btn-primary gst-btn" disabled={envoi || sommeFausse} data-enregistrer-vente>{vente === null ? 'Enregistrer la vente' : 'Enregistrer les modifications'}</button>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFermer}>Fermer</button>
              {sommeFausse && <span className="trx-explication" data-enregistrer-bloque>Enregistrer est désactivé : la répartition doit faire exactement 100 %.</span>}
              {vente !== null && <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void retirer()} disabled={envoi} data-retirer-vente>Retirer la vente (réversible)</button>}
            </div>
          </form>
          {vente !== null && <Journal entite="vente" id={vente.id} onFait={onFait} />}
        </div>
      </div>
    </div>
  );
}

interface Geste { id: number; action: string; avant: unknown; apres: unknown; commentaire: string | null; auteur: string; le: string; annuleJournalId: number | null; annulePar: number | null }
const LIBELLE_ACTION: Record<string, string> = { saisie: 'Saisie', modification: 'Modification', retrait: 'Retrait', retablissement: 'Rétablissement',
  rattachement: 'Rattachement', annulation: 'Annulation', import_fichier: 'Import du fichier', attribution: 'Attribution',
  // LOT D (434)
  repartition: 'Répartition de la commission', personnes: 'Vendeurs et acquéreurs', acte_signe: 'Acte signé', retour_compromis: 'Retour en compromis',
  // LOT G (436)
  annulation_compromis: 'Annulation du compromis', retablissement_compromis: 'Compromis rétabli' };
const resume = (x: unknown): string => (x === null || typeof x !== 'object' ? '—' : Object.entries(x as Record<string, unknown>)
  .filter(([k]) => k !== 'parts' && k !== 'lignes').map(([k, v]) => `${k} : ${v === null ? 'vide' : String(v)}`).join(' · ') || '—');

/** L'historique d'une ligne (le plus récent d'abord), chaque geste avec « Annuler » s'il ne l'a pas déjà été. */
export function Journal({ entite, id, onFait }: { entite: string; id: number; onFait: () => void }) {
  const [gestes, setGestes] = useState<Geste[] | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivant = true;
    fetch(`${API_TRANSACTION}?vue=journal&entite=${entite}&id=${id}`, { cache: 'no-store' }).then((r) => r.json())
      .then((x: { etat?: string; data?: Geste[] }) => { if (vivant) setGestes(x.etat === 'ok' && Array.isArray(x.data) ? x.data : []); })
      .catch(() => { if (vivant) setGestes([]); });
    return () => { vivant = false; };
  }, [entite, id, n]);
  const annuler = async (g: Geste): Promise<void> => {
    const r = await posterTransaction({ action: 'annuler', journalId: g.id });
    if (r === null) { setMotif(null); setN((x) => x + 1); onFait(); } else setMotif(r);
  };
  return (
    <section style={{ marginTop: 16 }} data-journal={`${entite}-${id}`}>
      <h4>Historique</h4>
      {motif !== null && <p className="trx-erreur" role="alert">{motif}</p>}
      {gestes === null ? <p className="loc-muet">Chargement…</p> : gestes.length === 0 ? <p className="loc-muet">Aucun geste.</p> : (
        <ul className="trx-journal">
          {gestes.map((g) => (
            <li key={g.id} data-geste={g.id}>
              <strong>{LIBELLE_ACTION[g.action] ?? g.action}</strong> — {new Date(g.le).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} — {g.auteur}
              <br /><span className="loc-muet">Avant : {resume(g.avant)} → après : {resume(g.apres)}</span>
              {g.commentaire && <><br /><span className="loc-muet">{g.commentaire}</span></>}
              {g.annulePar !== null ? <span className="loc-pastille trx-pastilles">annulé</span>
                : g.action !== 'annulation' || g.annuleJournalId !== null
                  ? <> <button type="button" className="trx-bouton-lien" onClick={() => void annuler(g)} data-annuler-geste={g.id}>Annuler ce geste</button></> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
