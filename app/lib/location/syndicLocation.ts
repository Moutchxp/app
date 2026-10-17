/**
 * TUILE LOCATION — LE SYNDIC DU BIEN : les formes échangées entre l'écran et le serveur. MODULE PUR (aucune base).
 * Voir `syndicLocationRepo.ts` (fonctions de la Gestion) et `BlocSyndicBien.tsx` (l'écran).
 */
export interface SyndicSuggere { id: number; nom: string; ville: string | null; motif: string }

export interface NouveauContactSyndic {
  civilite?: 'M.' | 'Mme' | null; prenom?: string; nom?: string; fonction?: string; email?: string; telephone?: string;
}

export interface SyndicDuBien { id: number; contactsIds?: number[]; nouveauxContacts?: NouveauContactSyndic[] }
