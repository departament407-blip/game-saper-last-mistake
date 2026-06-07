export interface Achievement {
  id: string;
  icon: string;
  label: string;
  description: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first-win",
    icon: "▣",
    label: "Первое обезвреживание",
    description: "Одержать первую победу оперативником."
  },
  {
    id: "three-wins",
    icon: "▥",
    label: "Три выхода",
    description: "Одержать три победы одним оперативником в текущей сессии."
  },
  {
    id: "five-wins",
    icon: "▧",
    label: "Пять чистых полей",
    description: "Победить пять раз одним оперативником."
  },
  {
    id: "two-win-streak",
    icon: "◆",
    label: "Двойной контроль",
    description: "Выиграть две операции подряд одним оперативником."
  },
  {
    id: "three-win-streak",
    icon: "◇",
    label: "Серия без паники",
    description: "Выиграть три операции подряд одним оперативником."
  },
  {
    id: "forest-win",
    icon: "♣",
    label: "Лесная зачистка",
    description: "Победить в лесном биоме."
  },
  {
    id: "desert-win",
    icon: "△",
    label: "Песчаный расчёт",
    description: "Победить в пустынном биоме."
  },
  {
    id: "sunflower-win",
    icon: "✦",
    label: "Золотое поле",
    description: "Победить на подсолнуховом поле."
  },
  {
    id: "factory-win",
    icon: "▦",
    label: "Мёртвый цех",
    description: "Победить в биоме заброшенного завода."
  },
  {
    id: "sea-win",
    icon: "≈",
    label: "Чёрная вода",
    description: "Победить в морском биоме."
  },
  {
    id: "expert-win",
    icon: "▲",
    label: "Экспертная выдержка",
    description: "Победить в операции Железный квадрат или сложнее."
  },
  {
    id: "all-biomes-win",
    icon: "◎",
    label: "Пять театров",
    description: "Одержать победу во всех пяти биомах одним оперативником."
  }
];
