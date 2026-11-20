'use client';

import { useState } from 'react';
import { ChampAdresseBan } from '../gestion/ChampAdresseBan';
import { communeAffichee } from '../../../../lib/adresse/libelleAffiche';
import { FenetreCarte } from '../gestion/CartesPersonnes';
import { MENTION_ETRANGER, MENTION_HORS_LISTE } from '../../../../lib/gestion/adresseSaisie';
import { codePostalFormate, communeEnSaisie } from '../../../../lib/gestion/saisieFiche';
import { adresseBienEnLigne, type AdresseBienSaisie } from '../../../../lib/location/adresseBienSaisie';
import { TITRE_SANS_NUMERO_PERSONNE, texteSansNumeroPersonne } from '../../../../lib/gestion/adresseSaisie';

/**
 * ══ 🔴🔴 L'ADRESSE D'UN BIEN (Arno, 17/11/2026, « Adresses uniformisées », lot 3) ═══════════════════════════════════════════════════════════
 * Décision d'Arno : « les adresses des biens (« Nouveau bien », « Modifier le bien », annexes à une autre adresse) passent sur ChampAdresseBan réutilisé
 * tel quel ; plus de Code postal / Commune tapés à la main ; adresse absente de la liste = saisie libre autorisée avec confirmation, marquée « hors
 * liste — à vérifier » ; rue sans numéro = même fenêtre de confirmation ; aucune adresse existante réécrite. »
 * `ChampAdresseBan` tel quel : un choix remplit les trois champs d'un coup (le code postal et la commune se lisent, ne se tapent plus). « Adresse
 * absente de la liste ? » ouvre la confirmation de la fiche d'une personne (lot 2) ; confirmée : saisie libre marquée. L'appelant tient l'état —
 * le choix continue d'alimenter, chez lui, la copropriété, les digicodes connus, les PV d'AG et le syndic, comme avant.
 * 🔴 (lot 4) l'adresse d'un APPORTEUR : la même saisie, avec `avecEtranger` — la case « Adresse à l'étranger » (saisie libre, Pays obligatoire, Q6).
 * Un bien ne l'a jamais (il est en France).
 */
export function AdresseBien({ valeur, onChange, etiquette, manque, id, nom = 'adresse', avecEtranger = false, autonome = false }: {
  valeur: AdresseBienSaisie;
  onChange: (f: (x: AdresseBienSaisie) => AdresseBienSaisie) => void;
  etiquette: React.ReactNode;
  manque?: React.ReactNode;
  id?: string;
  /** distingue les attributs d'épreuve (« adresse » du bien, « annexe-0 »…) */
  nom?: string;
  /** la case « Adresse à l'étranger » (apporteurs) */
  avecEtranger?: boolean;
  /** hors de la page d'un bien (les apporteurs) : la mise en page et les champs portent leur propre style, celui des champs voisins (`plo-champ`) */
  autonome?: boolean;
}) {
  const [fenetre, setFenetre] = useState(false);
  const libre = valeur.nature === 'hors_liste';
  const etranger = avecEtranger && valeur.nature === 'etranger';
  return (
    <div className={`loc-grille loc-adr${autonome ? ' loc-adr--autonome' : ''}`} data-adresse-bien={nom}>
      {avecEtranger && (
        <label className="loc-adr-etranger loc-pleine" data-champ-etranger>
          <input type="checkbox" checked={etranger} data-adresse-etranger onChange={(e) => {
            const oui = e.target.checked;
            // retour en France : l'adresse étrangère n'a plus cours, elle se choisit dans la liste
            onChange((x) => (oui ? { ...x, nature: 'etranger', verifiee: false, horsListeConfirme: false, sansNumeroConfirme: false }
              : { ...x, nature: 'liste', verifiee: false, horsListeConfirme: false, sansNumeroConfirme: false, adresse: '', codePostal: '', commune: '', pays: '' }));
          }} />
          <span>Adresse à l’étranger</span>
        </label>
      )}
      {etranger ? (
        <>
          <div className="loc-champ loc-pleine">
            <label htmlFor={id}>{etiquette} <span className="loc-adr-marque" data-adresse-marque>{MENTION_ETRANGER}</span></label>
            <input id={id} value={valeur.adresse} data-adresse-libre onChange={(e) => { const v = e.target.value; onChange((x) => ({ ...x, adresse: v })); }} />
          </div>
          <label className="loc-champ">Code postal
            <input value={valeur.codePostal} maxLength={20} data-adresse-cp onChange={(e) => { const v = e.target.value; onChange((x) => ({ ...x, codePostal: v })); }} /></label>
          <label className="loc-champ">Ville
            <input value={valeur.commune} data-adresse-commune onChange={(e) => { const v = communeEnSaisie(e.target.value); onChange((x) => ({ ...x, commune: v })); }} /></label>
          <label className="loc-champ">Pays
            <input value={valeur.pays ?? ''} maxLength={120} aria-required="true" data-adresse-pays onChange={(e) => { const v = e.target.value; onChange((x) => ({ ...x, pays: v })); }} />
            {valeur.adresse.trim() !== '' && (valeur.pays ?? '').trim() === '' && <span className="loc-adr-aide">Le pays est obligatoire.</span>}</label>
        </>
      ) : !libre ? (
        <>
          <div className="loc-champ loc-pleine">
            <label htmlFor={id}>{etiquette}</label>
            <ChampAdresseBan exemple="ex. 12 rue de l’Église" id={id} valeur={valeur.adresse} verifiee={valeur.verifiee}
              onChange={(v) => onChange((x) => ({ ...x, adresse: v, verifiee: false, sansNumeroConfirme: false,
                // la rue effacée : l'adresse entière s'efface (code postal et commune ne se tapent plus)
                ...(v.trim() === '' ? { codePostal: '', commune: '' } : {}) }))}
              onChoisir={(a) => onChange((x) => ({ ...x, adresse: a.voie, codePostal: a.codePostal, commune: a.commune, verifiee: true, nature: 'liste',
                horsListeConfirme: false, sansNumeroConfirme: false }))} />
            {!valeur.verifiee && valeur.adresse.trim() !== '' && (
              <p className="loc-adr-aide" data-adresse-a-choisir>Choisissez l’adresse dans la liste proposée.{' '}
                <button type="button" className="loc-adr-lien" onClick={() => setFenetre(true)} data-adresse-hors-liste>Adresse absente de la liste ?</button>
              </p>
            )}
          </div>
          <label className="loc-champ">Code postal
            <input className="loc-adr-auto" value={valeur.codePostal} readOnly tabIndex={-1} aria-readonly="true"
              title="Rempli par le choix de l’adresse dans la liste" data-adresse-cp /></label>
          <label className="loc-champ">Commune
            <input className="loc-adr-auto" value={communeAffichee(valeur.commune)} readOnly tabIndex={-1} aria-readonly="true"
              title="Remplie par le choix de l’adresse dans la liste" data-adresse-commune /></label>
        </>
      ) : (
        <>
          <div className="loc-champ loc-pleine">
            <label htmlFor={id}>{etiquette} <span className="loc-adr-marque" data-adresse-marque>{MENTION_HORS_LISTE}</span></label>
            <input id={id} value={valeur.adresse} data-adresse-libre
              onChange={(e) => { const v = e.target.value; onChange((x) => ({ ...x, adresse: v, sansNumeroConfirme: false })); }} />
            <button type="button" className="loc-adr-lien" data-adresse-retour-liste
              onClick={() => onChange((x) => ({ ...x, nature: 'liste', horsListeConfirme: false, verifiee: false, sansNumeroConfirme: false }))}>Revenir aux suggestions</button>
          </div>
          <label className="loc-champ">Code postal
            <input value={valeur.codePostal} inputMode="numeric" maxLength={5} data-adresse-cp
              onChange={(e) => { const v = codePostalFormate(e.target.value); onChange((x) => ({ ...x, codePostal: v })); }} /></label>
          <label className="loc-champ">Commune
            <input value={valeur.commune} data-adresse-commune
              onChange={(e) => { const v = communeEnSaisie(e.target.value); onChange((x) => ({ ...x, commune: v })); }} /></label>
        </>
      )}
      {manque}
      {fenetre && (
        <FenetreCarte titre="Adresse hors liste"
          texte="Cette adresse n’est pas dans la liste de la Base Adresse Nationale. Elle sera enregistrée telle que vous la saisissez, marquée « hors liste — à vérifier », et regroupée dans la liste des adresses à contrôler. Confirmez-vous ?"
          boutons={[{ mot: 'Revenir à la liste', onClic: () => setFenetre(false) },
            { mot: 'Confirmer : adresse hors liste', principal: true,
              onClic: () => { onChange((x) => ({ ...x, nature: 'hors_liste', horsListeConfirme: true, verifiee: false })); setFenetre(false); } }]}
          onFermer={() => setFenetre(false)} />
      )}
    </div>
  );
}

/** Q9 — « une rue sans numéro : la même fenêtre de confirmation partout » (celle de la fiche d'une personne). */
export function FenetreSansNumero({ adresse, onCorriger, onConfirmer }: { adresse: AdresseBienSaisie; onCorriger: () => void; onConfirmer: () => void }) {
  return (
    <FenetreCarte titre={TITRE_SANS_NUMERO_PERSONNE} lignes={texteSansNumeroPersonne(adresseBienEnLigne(adresse))}
      boutons={[{ mot: 'Corriger', onClic: onCorriger }, { mot: 'Confirmer', principal: true, onClic: onConfirmer }]} onFermer={onCorriger} />
  );
}

/** L'état de saisie d'une adresse LUE (un apporteur existant) : réputée choisie, sa nature telle qu'en base ; une fiche à créer : rien de choisi. */
export const etatAdresseLue = (lue: boolean, nature: AdresseBienSaisie['nature'] = null): Omit<AdresseBienSaisie, 'adresse' | 'codePostal' | 'commune' | 'pays'> =>
  ({ verifiee: lue, nature, horsListeConfirme: false, sansNumeroConfirme: false });

export const CSS_ADRESSE_BIEN = `
.loc-adr--autonome{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px}
.loc-adr--autonome .loc-pleine{grid-column:1/-1}
.loc-adr--autonome .loc-champ{display:flex;flex-direction:column;gap:4px;min-width:0;font-size:.8rem;font-weight:700;color:var(--color-svv-muted)}
.loc-adr--autonome input:not([type="checkbox"]){min-height:44px;border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:0 10px;font:inherit;font-size:.95rem;color:var(--color-svv-ink);background:var(--color-svv-surface);min-width:0;width:100%;box-sizing:border-box}
.loc-adr--autonome input.loc-adr-auto{background:var(--color-svv-field);color:var(--color-svv-muted)}
@media (max-width:640px){.loc-adr--autonome{grid-template-columns:minmax(0,1fr)}}
.loc-adr-etranger{display:flex;align-items:center;gap:.5rem;min-height:44px;font-size:.85rem;font-weight:600;color:var(--color-svv-ink);cursor:pointer}
.loc-adr-etranger input{width:1.1rem;height:1.1rem;accent-color:var(--color-svv-red)}
.loc-adr-auto{background:var(--color-svv-field);color:var(--color-svv-muted);cursor:default}
.loc-adr-aide{margin:.25rem 0 0;font-size:.78rem;color:var(--color-svv-red-dark)}
.loc-adr-lien{display:inline-flex;align-items:center;min-height:44px;padding:0;border:0;background:none;color:var(--color-svv-red);font:inherit;font-weight:700;text-decoration:underline;cursor:pointer}
.loc-adr-marque{display:inline-block;margin-left:.4rem;padding:.05rem .45rem;border-radius:999px;font-size:.7rem;font-weight:700;letter-spacing:.01em;background:color-mix(in srgb, var(--color-svv-red) 12%, transparent);color:var(--color-svv-red-dark)}
`;
