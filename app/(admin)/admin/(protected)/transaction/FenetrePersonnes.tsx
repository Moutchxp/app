'use client';

import { useEffect, useRef, useState } from 'react';
import { libellePersonne, type Vente } from '../../../../lib/transaction/modele';
import { sansEspacesEnTrop } from '../../../../lib/transaction/personnes';
import { decrire, FichePersonne, personneEcranDe, personneVide, type PersonneEcran, type PersonneRef } from './PersonnesDossier';
import { CSS_CHAMP_ADRESSE } from '../gestion/ChampAdresseBan';

/**
 * ══ 🔴 LOT BM (Arno, 30/10/2026) — LA FENÊTRE « VENDEURS — [affaire] » / « ACQUÉREURS — [affaire] » ════════════════════════════════════════════
 * Ouverte par « + Ajouter un vendeur / un acquéreur » de la carte, et par « Modifier » de la fenêtre de détail d'une personne (sur elle seule,
 * dépliée). Elle ne contient QUE les personnes de ce côté :
 *   · les fiches déjà enregistrées, chacune repliée sur une ligne (son libellé), dépliable pour la modifier ;
 *   · une fiche vierge ouverte d'office (« + Ajouter … ») — la même fiche que le formulaire complet (`FichePersonne`) : Particulier | Société,
 *     civilité, nom, prénom, téléphone, e-mail, adresse, ou le nom de la société et ses représentants ; le lien avec l'annuaire ; la mise en forme ;
 *   · par fiche : « Valider » (enregistre CETTE seule personne — les autres telles qu'enregistrées — puis la replie) et « Enlever » (confirmation) ;
 *   · « + Un vendeur » / « + Un acquéreur » ; en bas, seulement « Fermer » (une fiche commencée non validée : « Fiche non enregistrée — fermer
 *     quand même ? »).
 * Rien d'autre : ni montants, ni bien, ni dates, ni prix, ni commission, ni libellé, ni apporteur, ni négociateurs, ni répartition, ni note, ni
 * historique, ni « Enregistrer » global — tout cela reste dans le formulaire complet (« Modifier » de l'affaire), inchangé.
 * L'enregistrement passe par le geste de « Modifier » (`dossier-enregistrer` : journalisé, réversible ; un observateur y est refusé, 403).
 */

type Role = PersonneEcran['role'];
const MOT: Record<Role, { titre: string; un: string; aucun: string }> = {
  vendeur: { titre: 'Vendeurs', un: 'Un vendeur', aucun: 'Aucun vendeur enregistré' },
  acquereur: { titre: 'Acquéreurs', un: 'Un acquéreur', aucun: 'Aucun acquéreur enregistré' },
};

/** Une fiche neuve où quelque chose a été saisi (le seul choix Particulier | Société ne compte pas). PUR. */
export const ficheCommencee = (p: PersonneEcran): boolean =>
  [p.civilite, p.nom, p.prenom, p.telephone, p.email, p.adresse].some((x) => x.trim() !== '') || p.representants.length > 0;
/** Une fiche ouverte qui diffère de ce qui est enregistré (neuve : commencée). PUR. */
export const ficheModifiee = (p: PersonneEcran, enregistree: PersonneEcran | undefined): boolean =>
  enregistree === undefined ? ficheCommencee(p) : JSON.stringify(p) !== JSON.stringify(enregistree);

/**
 * La liste des personnes de l'affaire à envoyer quand UNE fiche est validée (`fiche`) ou enlevée (`fiche` null) : toutes les autres telles
 * qu'enregistrées (les deux côtés, dans leur ordre) ; la fiche validée à sa place (`origine` : son id enregistré), ou à la fin si elle est neuve. PUR.
 */
export function listeApres(toutes: readonly PersonneEcran[], role: Role, origine: number | null, fiche: PersonneEcran | null): PersonneEcran[] {
  if (origine === null) return fiche === null ? [...toutes] : [...toutes, fiche];
  return fiche === null ? toutes.filter((p) => !(p.role === role && p.id === origine)) : toutes.map((p) => (p.role === role && p.id === origine ? fiche : p));
}

export function FenetrePersonnes({ vente, role, personneVisee, annuaire, avecType, onEnregistrer, onFermer }: {
  vente: Vente; role: Role;
  /** « Modifier » depuis la fenêtre de détail : cette seule personne, dépliée (aucune fiche vierge) ; null : « + Ajouter … ». */
  personneVisee: number | null;
  annuaire: readonly PersonneRef[]; avecType: boolean;
  /** Enregistre la liste complète des personnes de l'affaire ; rend le motif d'un refus, ou null. */
  onEnregistrer: (personnes: PersonneEcran[]) => Promise<string | null>;
  onFermer: () => void;
}) {
  const toutes = (vente.dossier?.personnes ?? []).map(personneEcranDe);
  const enregistrees = toutes.filter((p) => p.role === role);
  const compteur = useRef(1);
  // Les fiches ouvertes : `p<id>` une fiche enregistrée dépliée, `n<k>` une fiche neuve.
  const [ouvertes, setOuvertes] = useState<Record<string, PersonneEcran>>(() => {
    const visee = personneVisee === null ? undefined : enregistrees.find((p) => p.id === personneVisee);
    return visee !== undefined ? { [`p${visee.id}`]: visee } : { n0: personneVide(role) };
  });
  const [focus, setFocus] = useState<string | null>(() => Object.keys(ouvertes)[0] ?? null);
  const [motifs, setMotifs] = useState<Record<string, string>>({});
  const [enlever, setEnlever] = useState<string | null>(null);
  const [fermeture, setFermeture] = useState(false);
  // Après un enregistrement, la fenêtre attend la relecture de l'affaire (sa liste à jour) avant un autre geste : rien ne se perd.
  const [attente, setAttente] = useState(false);
  useEffect(() => { setAttente(false); }, [vente]);

  const enregistreeDe = (cle: string): PersonneEcran | undefined => (cle.startsWith('p') ? enregistrees.find((p) => p.id === Number(cle.slice(1))) : undefined);
  const modifiees = Object.entries(ouvertes).filter(([cle, p]) => ficheModifiee(p, enregistreeDe(cle)));
  const demanderFermer = (): void => { if (modifiees.length === 0) onFermer(); else setFermeture(true); };
  const fermerRef = useRef(demanderFermer);
  fermerRef.current = demanderFermer;
  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape') fermerRef.current(); };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, []);

  const retirerOuverte = (cle: string): void => {
    setOuvertes((o) => { const { [cle]: _, ...reste } = o; void _; return reste; });
    setMotifs((m) => { const { [cle]: _, ...reste } = m; void _; return reste; });
  };
  const envoyer = async (cle: string, liste: PersonneEcran[]): Promise<boolean> => {
    setAttente(true);
    const r = await onEnregistrer(liste);
    if (r !== null) { setAttente(false); setMotifs((m) => ({ ...m, [cle]: r })); return false; }
    return true;
  };
  const valider = async (cle: string): Promise<void> => {
    const p = ouvertes[cle];
    if (sansEspacesEnTrop(p.nom) === '') {
      setMotifs((m) => ({ ...m, [cle]: p.type === 'societe' ? 'Le nom de la société est obligatoire. Rien n’a été enregistré.' : 'Le nom est obligatoire. Rien n’a été enregistré.' }));
      return;
    }
    const origine = cle.startsWith('p') ? Number(cle.slice(1)) : null;
    if (await envoyer(cle, listeApres(toutes, role, origine, p))) { retirerOuverte(cle); setFermeture(false); }
  };
  const confirmerEnlever = async (cle: string): Promise<void> => {
    setEnlever(null);
    if (!cle.startsWith('p')) { retirerOuverte(cle); return; }
    if (await envoyer(cle, listeApres(toutes, role, Number(cle.slice(1)), null))) retirerOuverte(cle);
  };
  const demanderEnlever = (cle: string): void => {
    if (!cle.startsWith('p') && !ficheCommencee(ouvertes[cle])) { retirerOuverte(cle); return; }
    setEnlever(cle);
  };
  const ajouter = (): void => { const cle = `n${compteur.current++}`; setOuvertes((o) => ({ ...o, [cle]: personneVide(role) })); setFocus(cle); };

  const titre = `${MOT[role].titre} — ${vente.libelle}`;
  const neuves = Object.keys(ouvertes).filter((c) => c.startsWith('n'));
  // Le repère `data-*` d'une fiche : son rang à l'écran (les enregistrées d'abord, puis les neuves).
  const lignes: { cle: string; enregistree?: PersonneEcran }[] = [...enregistrees.map((p) => ({ cle: `p${p.id}`, enregistree: p })), ...neuves.map((cle) => ({ cle }))];
  const nomDe = (cle: string): string => {
    const p = enregistreeDe(cle) ?? ouvertes[cle];
    return (p === undefined ? '' : libellePersonne({ nom: p.nom, type: p.type, civilite: p.civilite === '' ? null : p.civilite, prenom: p.prenom })) || 'cette fiche';
  };
  const actionsFiche = (cle: string) => <>
    {enlever === cle && (
      <p className="loc-alerte loc-alerte--orange trx-plein" role="alertdialog" data-confirmer-enlever={cle}>
        {cle.startsWith('p') ? `Retirer ${nomDe(cle)} de cette affaire ? Sa fiche reste dans l’annuaire.` : 'Abandonner cette fiche ? Ce qui y est saisi sera perdu.'}
        {' '}<button type="button" className="trx-bouton-lien" onClick={() => void confirmerEnlever(cle)} data-oui-enlever>Oui, enlever</button>
        {' '}<button type="button" className="trx-bouton-lien" onClick={() => setEnlever(null)} data-non-enlever>Annuler</button>
      </p>
    )}
    {motifs[cle] !== undefined && <p className="trx-erreur trx-plein" role="alert" data-motif-fiche={cle}>{motifs[cle]}</p>}
  </>;

  return (
    <div className="tdb-voile" onMouseDown={(e) => { if (e.target === e.currentTarget) demanderFermer(); }}>
      <div className="tdb-fenetre trx-fenetre-personnes" role="dialog" aria-modal="true" aria-label={titre} data-fenetre-personnes={role}>
        <header className="tdb-fenetre-tete"><h3>{titre}</h3><button type="button" className="tdb-x" aria-label="Fermer" onClick={demanderFermer} data-fermer-fenetre-personnes>×</button></header>
        <div className="tdb-fenetre-corps">
          <style>{CSS_CHAMP_ADRESSE}</style>
          <div className="trx-form">
            <datalist id="trx-personnes">{annuaire.map((p) => <option key={p.id} value={decrire(p)} />)}</datalist>
            <div className="trx-plein trx-parts" data-personnes={role}>
              {lignes.length === 0 && <p className="loc-muet" data-aucune-fiche>{MOT[role].aucun}</p>}
              {lignes.map(({ cle, enregistree }, i) => {
                const p = ouvertes[cle];
                if (p === undefined && enregistree !== undefined) {
                  return (
                    <div className="trx-fiche-repliee" key={cle} data-fiche-repliee={enregistree.id}>
                      <button type="button" className="trx-fiche-libelle" aria-expanded="false" disabled={attente}
                        onClick={() => { setOuvertes((o) => ({ ...o, [cle]: enregistree })); setFocus(cle); }} data-deplier-fiche={enregistree.id}>
                        <span aria-hidden="true">▸ </span>{nomDe(cle)}</button>
                      <button type="button" className="trx-bouton-lien" onClick={() => demanderEnlever(cle)} disabled={attente} data-enlever-fiche={i}>Enlever</button>
                      {actionsFiche(cle)}
                    </div>
                  );
                }
                if (p === undefined) return null;
                return (
                  <FichePersonne key={cle} cle={i} p={p} annuaire={annuaire} avecType={avecType} autoFocus={focus === cle}
                    onChange={(x) => { setOuvertes((o) => ({ ...o, [cle]: x })); setMotifs((m) => { const { [cle]: _, ...reste } = m; void _; return reste; }); }}>
                    <div className="trx-actions trx-plein trx-fiche-actions">
                      <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => void valider(cle)} disabled={attente} data-valider-fiche={i}>Valider</button>
                      <button type="button" className="trx-bouton-lien" onClick={() => demanderEnlever(cle)} disabled={attente} data-enlever-fiche={i}>Enlever</button>
                    </div>
                    {actionsFiche(cle)}
                  </FichePersonne>
                );
              })}
              <p><button type="button" className="trx-bouton-lien" onClick={ajouter} data-ajouter-fiche={role}>+ {MOT[role].un}</button></p>
            </div>
          </div>
        </div>
        <footer className="trx-fenetre-pied">
          {fermeture && (
            <p className="loc-alerte loc-alerte--orange" role="alertdialog" data-confirmer-fermeture>
              Fiche non enregistrée — fermer quand même ?
              {' '}<button type="button" className="trx-bouton-lien" onClick={onFermer} data-fermer-quand-meme>Fermer quand même</button>
              {' '}<button type="button" className="trx-bouton-lien" onClick={() => setFermeture(false)} data-continuer-saisie>Continuer la saisie</button>
            </p>
          )}
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={demanderFermer} data-fermer-personnes>Fermer</button>
        </footer>
      </div>
    </div>
  );
}
