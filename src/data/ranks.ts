export interface Rank {
  id: string;
  label: string;
  minXp: number;
  icon: string;
}

export const RANKS: Rank[] = [
  { id: "cadet", label: "Кадет", minXp: 0, icon: "◇" },
  { id: "private", label: "Рядовой сапёр", minXp: 120, icon: "◈" },
  { id: "senior-private", label: "Старший сапёр", minXp: 260, icon: "◎" },
  { id: "corporal", label: "Капрал", minXp: 450, icon: "♦" },
  { id: "junior-sergeant", label: "Младший сержант", minXp: 700, icon: "⬖" },
  { id: "sergeant", label: "Сержант", minXp: 1000, icon: "⬗" },
  { id: "senior-sergeant", label: "Старший сержант", minXp: 1400, icon: "⬘" },
  { id: "warrant-officer", label: "Прапорщик", minXp: 1900, icon: "⬙" },
  { id: "junior-lieutenant", label: "Младший лейтенант", minXp: 2500, icon: "★" },
  { id: "lieutenant", label: "Лейтенант", minXp: 3200, icon: "✦" },
  { id: "senior-lieutenant", label: "Старший лейтенант", minXp: 4000, icon: "✧" },
  { id: "captain", label: "Капитан", minXp: 5000, icon: "✪" }
];

export function getRankByXp(xp: number): Rank {
  return [...RANKS].reverse().find((rank) => xp >= rank.minXp) ?? RANKS[0];
}

export function getRankById(rankId: string): Rank {
  return RANKS.find((rank) => rank.id === rankId) ?? RANKS[0];
}

export function getNextRank(xp: number): Rank | null {
  return RANKS.find((rank) => rank.minXp > xp) ?? null;
}
