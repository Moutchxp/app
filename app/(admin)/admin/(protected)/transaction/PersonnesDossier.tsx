'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChampAdresseBan } from '../gestion/ChampAdresseBan';
import { libellePersonne, type Civilite, type PersonneVente, type RepresentantVente } from '../../../../lib/transaction/modele';
import { formeNom, formePrenom } from '../../../../lib/transaction/personnes';

/**
 * ══ 🔴 LOT BJ (Arno, 30/10/2026) — LES VENDEURS ET ACQUÉREURS : PARTICULIER OU SOCIÉTÉ ═══════════════════════════════════════════════════════
 * Le formulaire (« Nouveau compromis », « Modifier », « + Ajouter un vendeur / acquéreur ») : pour chacun, « Particulier » | « Société » ;
 * un particulier : civilité (facultative), nom (obligatoire), prénom, téléphone, e-mail, adresse (auto-complétion) ; une société : son nom
 * (obligatoire) et ses représentants (autant qu'on veut, zéro accepté), chacun comme un particulier. Le lien avec l'annuaire reste (« fiche de
 * l'annuaire n° … »). Passer de l'un à l'autre ne perd rien en silence : s'il y a des champs à perdre, une confirmation le dit.
 * Sur la carte (retrait autorisé par Arno : plus de coordonnées en clair), un BOUTON par personne (« Mme Mira BERCIER », « CRITERIMMO »)
 * ouvre sa fenêtre de détail. Sans la migration 443 : l'ancien formulaire (un nom, des coordonnées) et l'ancien libellé.
 */

export interface PersonneRef { id: number; nom: string; telephone: string | null; email: string | null; adresse: string | null;
  /** 🔴 LOT BJ (443) — absents : une fiche d'avant (un particulier). */
  type?: 'particulier' | 'societe'; civilite?: Civilite | null; prenom?: string | null }
export interface RepresentantEcran { id: number | null; civilite: Civilite | ''; nom: string; prenom: string; telephone: string; email: string; adresse: string }
export interface PersonneEcran { id: number | null; role: 'vendeur' | 'acquereur'; type: 'particulier' | 'societe'; civilite: Civilite | ''; nom: string; prenom: string;
  telephone: string; email: string; adresse: string; representants: RepresentantEcran[] }

export const representantVide = (): RepresentantEcran => ({ id: null, civilite: '', nom: '', prenom: '', telephone: '', email: '', adresse: '' });
export const personneVide = (role: PersonneEcran['role']): PersonneEcran => ({ id: null, role, type: 'particulier', civilite: '', nom: '', prenom: '', telephone: '', email: '', adresse: '', representants: [] });
const representantEcranDe = (r: RepresentantVente): RepresentantEcran => ({ id: r.id, civilite: r.civilite ?? '', nom: r.nom, prenom: r.prenom ?? '', telephone: r.telephone ?? '',
  email: r.email ?? '', adresse: r.adresse ?? '' });
/** Une personne enregistrée → la ligne du formulaire (une fiche d'avant : un particulier, son texte dans « Nom », un prénom vide). PUR. */
export const personneEcranDe = (p: PersonneVente): PersonneEcran => ({ id: p.id, role: p.role, type: p.type ?? 'particulier', civilite: p.civilite ?? '', nom: p.nom,
  prenom: p.prenom ?? '', telephone: p.telephone ?? '', email: p.email ?? '', adresse: p.adresse ?? '', representants: (p.representants ?? []).map(representantEcranDe) });
/** Le libellé d'une fiche de l'annuaire, dans la liste (libellé + téléphone + e-mail). PUR. */
export const decrire = (p: PersonneRef): string => [libellePersonne({ nom: p.nom, type: p.type, civilite: p.civilite ?? null, prenom: p.prenom ?? null }), p.telephone, p.email]
  .filter((x) => x !== null && x !== '').join(' — ');

/**
 * Ce qu'un passage Particulier ↔ Société ferait perdre (les champs remplis) ; vide : rien, le passage se fait sans question. PUR.
 * Particulier → Société : la civilité, le prénom, le téléphone, l'e-mail et l'adresse (le nom devient celui de la société).
 * Société → Particulier : ses représentants.
 */
export function pertesBascule(p: PersonneEcran, vers: PersonneEcran['type']): string[] {
  if (p.type === vers) return [];
  if (vers === 'societe') {
    return ([['civilite', 'la civilité'], ['prenom', 'le prénom'], ['telephone', 'le téléphone'], ['email', 'l’e-mail'], ['adresse', 'l’adresse']] as const)
      .filter(([k]) => p[k].trim() !== '').map(([, mot]) => mot);
  }
  const n = p.representants.filter((r) => [r.nom, r.prenom, r.telephone, r.email, r.adresse].some((x) => x.trim() !== '') || r.id !== null).length;
  return n === 0 ? [] : [n === 1 ? 'son représentant' : `ses ${n} représentants`];
}
/** La personne après le passage (les champs perdus vidés, le nom gardé). PUR. */
export function basculer(p: PersonneEcran, vers: PersonneEcran['type']): PersonneEcran {
  return vers === 'societe' ? { ...p, type: 'societe', civilite: '', prenom: '', telephone: '', email: '', adresse: '' } : { ...p, type: 'particulier', representants: [] };
}
const joindre = (xs: readonly string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} et ${xs[xs.length - 1]}`);

/** Les champs d'un particulier (ou d'un représentant) : civilité, nom (avec l'annuaire), prénom, téléphone, e-mail, adresse. */
function ChampsParticulier({ cle, v, onChange, onNom, avecType, autoFocus }: {
  cle: string; v: { id: number | null; civilite: Civilite | ''; nom: string; prenom: string; telephone: string; email: string; adresse: string };
  onChange: (x: Partial<RepresentantEcran>) => void; onNom: (texte: string) => void; avecType: boolean; autoFocus?: boolean;
}) {
  return <>
    {avecType && <label>Civilité
      <select value={v.civilite} onChange={(e) => onChange({ civilite: e.target.value as Civilite | '' })} data-civilite={cle}>
        <option value="">non renseignée</option><option value="M.">M.</option><option value="Mme">Mme</option>
      </select></label>}
    {/* 🔴 LOT BL — la mise en forme commune à la sortie du champ (nom en majuscules, prénom « Jean-Baptiste ») ; le serveur l'applique aussi. */}
    <label>Nom<input list="trx-personnes" value={v.nom} onChange={(e) => onNom(e.target.value)} onBlur={() => { if (v.nom !== formeNom(v.nom)) onChange({ nom: formeNom(v.nom) }); }}
      data-personne-nom={cle} autoFocus={autoFocus} />
      {v.id !== null && <span className="loc-muet">fiche de l’annuaire n° {v.id}</span>}</label>
    {avecType && <label>Prénom<input value={v.prenom} onChange={(e) => onChange({ prenom: e.target.value })} onBlur={() => { if (v.prenom !== formePrenom(v.prenom)) onChange({ prenom: formePrenom(v.prenom) }); }}
      data-personne-prenom={cle} /></label>}
    <label>Téléphone<input type="tel" inputMode="tel" value={v.telephone} onChange={(e) => onChange({ telephone: e.target.value })} data-personne-telephone={cle} /></label>
    <label>E-mail<input type="email" inputMode="email" autoCapitalize="none" value={v.email} onChange={(e) => onChange({ email: e.target.value })} data-personne-email={cle} /></label>
    <label data-personne-adresse={cle}>Adresse
      {avecType
        ? <ChampAdresseBan id={`trx-adresse-${cle}`} valeur={v.adresse} verifiee onChange={(x) => onChange({ adresse: x })} exemple="ex. 12 rue de la République, 92800 Puteaux"
          onChoisir={(a) => onChange({ adresse: [a.voie, [a.codePostal, a.commune].filter((y) => y !== '').join(' ')].filter((y) => y !== '').join(', ') })} />
        : <input value={v.adresse} onChange={(e) => onChange({ adresse: e.target.value })} />}</label>
  </>;
}

/**
 * 🔴 LOT BJ — LE BLOC « Vendeur(s) » / « Acquéreur(s) » du formulaire. `avecType` faux (sans la 443) : l'ancien bloc (nom et coordonnées).
 */
export function BlocPersonnes({ role, mot, personnes, onChange, annuaire, avecType, focus }: {
  role: PersonneEcran['role']; mot: string; personnes: readonly PersonneEcran[]; onChange: (x: PersonneEcran[]) => void; annuaire: readonly PersonneRef[];
  avecType: boolean;
  /** L'indice de la ligne qui prend le focus (une ligne ajoutée depuis la carte, ou la personne visée par « Modifier ») ; null : aucune. */
  focus: number | null;
}) {
  const [bascule, setBascule] = useState<{ i: number; vers: PersonneEcran['type']; pertes: string[] } | null>(null);
  const changer = (i: number, x: Partial<PersonneEcran>): void => onChange(personnes.map((p, j) => (j === i ? { ...p, ...x } : p)));
  const changerRep = (i: number, k: number, x: Partial<RepresentantEcran>): void =>
    changer(i, { representants: personnes[i].representants.map((r, j) => (j === k ? { ...r, ...x } : r)) });
  /** Choisir une fiche de l'annuaire (par son libellé dans la liste) : reprise, son id gardé (aucun doublon) ; sinon, le nom tapé. */
  const choisir = (texte: string, type: PersonneEcran['type']): Partial<PersonneEcran> => {
    const f = annuaire.find((x) => decrire(x) === texte);
    if (f === undefined) return { nom: texte, id: null };
    return { id: f.id, nom: f.nom, telephone: f.telephone ?? '', email: f.email ?? '', adresse: f.adresse ?? '', civilite: f.civilite ?? '', prenom: f.prenom ?? '',
      ...(avecType ? { type: f.type ?? type } : {}) };
  };
  const demanderBascule = (i: number, vers: PersonneEcran['type']): void => {
    const pertes = pertesBascule(personnes[i], vers);
    if (pertes.length === 0) changer(i, basculer(personnes[i], vers));
    else setBascule({ i, vers, pertes });
  };
  return (
    <fieldset className="trx-plein trx-parts" data-personnes={role}>
      <legend className="loc-muet">{mot}</legend>
      {personnes.map((p, i) => p.role !== role ? null : (
        <div className="trx-part" key={i} data-personne={i} data-type-personne={p.type}>
          {avecType && (
            <div className="trx-unites trx-plein" role="group" aria-label="Particulier ou société">
              {(['particulier', 'societe'] as const).map((t) => (
                <button key={t} type="button" className="trx-unite" aria-pressed={p.type === t} onClick={() => demanderBascule(i, t)} data-choix-type={`${i}-${t}`}>
                  {t === 'particulier' ? 'Particulier' : 'Société'}</button>
              ))}
            </div>
          )}
          {bascule !== null && bascule.i === i && (
            <p className="loc-alerte loc-alerte--orange trx-plein" role="alertdialog" data-confirmer-bascule={i}>
              Passer en {bascule.vers === 'societe' ? 'Société' : 'Particulier'} : {joindre(bascule.pertes)} {bascule.pertes.length > 1 || bascule.pertes[0]?.startsWith('ses') ? 'ne seront pas gardés' : 'ne sera pas gardé'}. Continuer ?
              {' '}<button type="button" className="trx-bouton-lien" onClick={() => { changer(i, basculer(personnes[i], bascule.vers)); setBascule(null); }} data-oui-bascule>Oui, passer en {bascule.vers === 'societe' ? 'Société' : 'Particulier'}</button>
              {' '}<button type="button" className="trx-bouton-lien" onClick={() => setBascule(null)} data-non-bascule>Annuler</button>
            </p>
          )}
          {p.type === 'societe' && avecType ? <>
            <label>Nom de la société<input list="trx-personnes" value={p.nom} onChange={(e) => changer(i, choisir(e.target.value, 'societe'))}
              onBlur={() => { if (p.nom !== formeNom(p.nom)) changer(i, { nom: formeNom(p.nom) }); }} data-personne-nom={i} autoFocus={focus === i} />
              {p.id !== null && <span className="loc-muet">fiche de l’annuaire n° {p.id}</span>}</label>
            <div className="trx-plein trx-representants" data-representants={i}>
              <span className="loc-muet">{p.representants.length === 0 ? 'Aucun représentant' : `${p.representants.length} représentant${p.representants.length > 1 ? 's' : ''}`}</span>
              {p.representants.map((r, k) => (
                <div className="trx-part trx-representant" key={k} data-representant={`${i}-${k}`}>
                  <ChampsParticulier cle={`${i}-${k}`} v={r} avecType onChange={(x) => changerRep(i, k, x)}
                    onNom={(t) => { const c = choisir(t, 'particulier'); changerRep(i, k, { id: c.id ?? null, nom: c.nom ?? t, ...(c.id != null ? { telephone: c.telephone, email: c.email, adresse: c.adresse, civilite: c.civilite, prenom: c.prenom } : {}) }); }} />
                  <button type="button" className="trx-bouton-lien" onClick={() => changer(i, { representants: p.representants.filter((_, j) => j !== k) })} data-enlever-representant={`${i}-${k}`}>Enlever</button>
                </div>
              ))}
              <button type="button" className="trx-bouton-lien" onClick={() => changer(i, { representants: [...p.representants, representantVide()] })} data-ajouter-representant={i}>+ Un représentant</button>
            </div>
          </> : <ChampsParticulier cle={String(i)} v={p} avecType={avecType} autoFocus={focus === i} onChange={(x) => changer(i, x)} onNom={(t) => changer(i, choisir(t, 'particulier'))} />}
          <button type="button" className="trx-bouton-lien" onClick={() => onChange(personnes.filter((_, j) => j !== i))}>Enlever</button>
        </div>
      ))}
      <p><button type="button" className="trx-bouton-lien" onClick={() => onChange([...personnes, personneVide(role)])} data-ajouter-personne={role}>+ {role === 'vendeur' ? 'Un vendeur' : 'Un acquéreur'}</button></p>
    </fieldset>
  );
}

const lienTel = (t: string) => <a href={`tel:${t.replace(/\s/g, '')}`}>{t}</a>;
const lienMail = (e: string) => <a href={`mailto:${e}`}>{e}</a>;
/** Les coordonnées d'une personne (ou d'un représentant), une par ligne ; « à renseigner » pour celles qui manquent. */
function Coordonnees({ p }: { p: { telephone: string | null; email: string | null; adresse: string | null } }) {
  return <dl className="trx-couples">
    <div className="trx-couple"><dt>Téléphone</dt><dd>{p.telephone ? lienTel(p.telephone) : <span className="trx-a-renseigner">à renseigner</span>}</dd></div>
    <div className="trx-couple"><dt>E-mail</dt><dd>{p.email ? lienMail(p.email) : <span className="trx-a-renseigner">à renseigner</span>}</dd></div>
    <div className="trx-couple"><dt>Adresse</dt><dd>{p.adresse ?? <span className="trx-a-renseigner">à renseigner</span>}</dd></div>
  </dl>;
}

/**
 * 🔴 LOT BJ — UNE PERSONNE SUR LA CARTE : un bouton (le style de « + Ajouter un vendeur ») à son libellé ; un clic ouvre sa fenêtre de détail
 * (toutes ses coordonnées, son type, les représentants d'une société) avec « Modifier » ; croix, Échap ou clic dehors la ferment. Sans
 * `onModifier` (observateur, ligne miroir) : en lecture seule.
 */
export function BoutonPersonne({ p, onModifier }: { p: PersonneVente; onModifier?: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => {
    if (!ouvert) return;
    const touche = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOuvert(false); };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [ouvert]);
  const libelle = libellePersonne(p) || 'Sans nom';
  const societe = p.type === 'societe';
  const reps = p.representants ?? [];
  return <>
    <button type="button" className="svv-btn svv-btn-outline gst-btn trx-btn-personne" onClick={() => setOuvert(true)} aria-haspopup="dialog" data-bouton-personne={p.id}>{libelle}</button>
    {ouvert && typeof document !== 'undefined' && createPortal(
      <div className="trx-ap-voile" onClick={(e) => { if (e.target === e.currentTarget) setOuvert(false); }}>
        <div className="trx-ap-fenetre" role="dialog" aria-modal="true" aria-label={libelle} data-fenetre-personne={p.id}>
          <div className="trx-fp-tete"><p className="trx-ap-titre">{libelle}</p>
            <button type="button" className="tdb-x" aria-label="Fermer" onClick={() => setOuvert(false)} data-fermer-personne>×</button></div>
          <p className="loc-muet" data-type-detail>{societe ? 'Société' : 'Particulier'} · {p.role === 'vendeur' ? 'vendeur' : 'acquéreur'}</p>
          {(!societe || p.telephone !== null || p.email !== null || p.adresse !== null) && <Coordonnees p={p} />}
          {societe && <>
            <p className="trx-fp-sous-titre" data-nb-representants>{reps.length === 0 ? 'Aucun représentant' : `${reps.length} représentant${reps.length > 1 ? 's' : ''}`}</p>
            {reps.map((r) => (
              <div className="trx-fp-representant" key={r.id} data-representant-detail={r.id}>
                <strong>{libellePersonne({ ...r, type: 'particulier' })}</strong>
                <Coordonnees p={r} />
              </div>
            ))}
          </>}
          {onModifier !== undefined && <div className="trx-actions">
            <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { setOuvert(false); onModifier(); }} data-modifier-personne={p.id}>Modifier</button>
          </div>}
        </div>
      </div>, document.querySelector('.svv-adm-root') ?? document.body)}
  </>;
}
