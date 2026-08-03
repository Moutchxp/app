import type { CSSProperties } from 'react';
import type { CanalContact } from '../../../../lib/sitadel/mairieContact';
import { CANAUX_ORDONNES, AIDE_CANAL, MENTION_TELESERVICE } from './contactForm';

/**
 * Rendu PUR du sélecteur de canal de l'éditeur de contact mairie — aucun état, aucun effet → testable en Node via
 * `renderToStaticMarkup`. Options par préférence décroissante (téléservice → e-mail → courrier → inconnu), mention de
 * suggestion quand un téléservice est connu, et aide contextuelle (dont la conséquence « courrier/inconnu = 0 demande »).
 */
const styleChamp: CSSProperties = { padding: '.35rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13 };
const styleAide: CSSProperties = { fontSize: 11, color: 'var(--color-svv-muted)', lineHeight: 1.4 };

/**
 * Champs de PROTOCOLE (S18) : date de dernière vérification en LECTURE SEULE (quand elle existe — un protocole qui date se
 * repère ainsi), + saisies éditables du téléphone et du responsable du service urbanisme. La date est mise à jour
 * automatiquement à l'enregistrement (côté serveur), donc non éditable ici.
 */
export function ChampsProtocole({ telephone, responsableNom, protocoleVerifieLe, onTelephone, onResponsable }: {
  telephone: string; responsableNom: string; protocoleVerifieLe: string | null;
  onTelephone: (v: string) => void; onResponsable: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 0, flex: '1 1 100%' }}>
      {protocoleVerifieLe && (
        <span style={styleAide}>Protocole vérifié le <strong>{protocoleVerifieLe}</strong> (mis à jour automatiquement à l’enregistrement).</span>
      )}
      <label style={{ ...styleAide, display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
        Téléphone du service urbanisme
        <input type="tel" value={telephone} placeholder="01 23 45 67 89" onChange={(e) => onTelephone(e.target.value)}
          style={{ ...styleChamp, width: '100%', boxSizing: 'border-box' }} aria-label="Téléphone du service urbanisme" />
      </label>
      <label style={{ ...styleAide, display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
        Responsable du service (si publié)
        <input type="text" value={responsableNom} placeholder="Prénom Nom" onChange={(e) => onResponsable(e.target.value)}
          style={{ ...styleChamp, width: '100%', boxSizing: 'border-box' }} aria-label="Responsable du service" />
      </label>
    </div>
  );
}

export function SelecteurCanal({ canal, suggestionTeleservice, onCanal }: {
  canal: CanalContact; suggestionTeleservice: boolean; onCanal: (c: CanalContact) => void;
}) {
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
      <select value={canal} onChange={(e) => onCanal(e.target.value as CanalContact)} style={styleChamp} aria-label="Canal de contact">
        {CANAUX_ORDONNES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {suggestionTeleservice && <span style={{ ...styleAide, color: 'var(--color-svv-green-ink)', fontWeight: 600 }}>{MENTION_TELESERVICE}</span>}
      <span style={styleAide}>{AIDE_CANAL}</span>
    </div>
  );
}
