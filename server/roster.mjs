// Roster tim Somewhere (fork Nottbadl/kantor-rpg): agen yang boleh menerima
// perintah dari RPG. Diambil dari profil yang aktif; actorId mengikat
// karakter di dunia ke profil. Roster asli Budi diganti dengan tim cafe
// Somewhere: Muse (PM), Asep (Frontend), Udin (Backend), Barong (Testing).
export const ROSTER = [
  { profile: 'muse', name: 'Muse', lane: 'Project Manager', actorId: 'ACT-MAX', badan: 'SOMEWHERE' },
  { profile: 'asep', name: 'Asep', lane: 'Frontend', actorId: 'ACT-LEO', badan: 'SOMEWHERE' },
  { profile: 'udin', name: 'Udin', lane: 'Backend', actorId: 'ACT-BRUNO', badan: 'SOMEWHERE' },
  { profile: 'barong', name: 'Barong', lane: 'Testing', actorId: 'ACT-REX', badan: 'SOMEWHERE' },
];

export const PRIVATE_PROFILES = new Set(['yupus', 'wealth']);

export const byProfile = (p) => ROSTER.find((r) => r.profile === p) ?? null;
