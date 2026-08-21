export interface Rank {
  id: string;
  label: string;
  minXp: number;
  icon: string;
}

export const RANKS: Rank[] = [
  { id: "cadet", label: "Кадет", minXp: 0, icon: "◇" },
  { id: "private-sapper", label: "Рядовой сапёр", minXp: 80, icon: "◆" },
  { id: "senior-sapper", label: "Старший сапёр", minXp: 180, icon: "◉" },
  { id: "corporal", label: "Капрал", minXp: 320, icon: "♦" },
  { id: "junior-sergeant", label: "Младший сержант", minXp: 500, icon: "▣" },
  { id: "sergeant", label: "Сержант", minXp: 750, icon: "▤" },
  { id: "senior-sergeant", label: "Старший сержант", minXp: 1050, icon: "▥" },
  { id: "warrant-officer", label: "Прапорщик", minXp: 1400, icon: "▦" },
  { id: "junior-lieutenant", label: "Младший лейтенант", minXp: 1750, icon: "★" },
  { id: "lieutenant", label: "Лейтенант", minXp: 2100, icon: "✦" },
  { id: "senior-lieutenant", label: "Старший лейтенант", minXp: 2500, icon: "✧" },
  { id: "captain", label: "Капитан", minXp: 2900, icon: "✪" },
  { id: "major", label: "Майор", minXp: 3300, icon: "✹" },
  { id: "lieutenant-colonel", label: "Подполковник", minXp: 3650, icon: "✷" },
  { id: "colonel", label: "Полковник", minXp: 4000, icon: "✸" },
  { id: "general", label: "Генерал", minXp: 4400, icon: "✯" }
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
