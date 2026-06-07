export interface Character {
  id: string;
  name: string;
  portrait: string;
  portraitAsset: string;
  fallenPortraitAsset: string;
  portraitSvg: string;
  portraitClass: string;
  portraitMark: string;
  baseHp: number;
  startingPerkId: string;
  innateTrait: {
    label: string;
    squadDescription: string;
    soloDescription: string;
  };
  unlockablePerkIds: string[];
  lines: {
    start: string;
    win: string;
    death: string;
  };
}

export const CHARACTERS: Character[] = [
  {
    id: "sergei",
    name: "Морпех Сергей",
    portrait: "MS",
    portraitAsset: "/assets/portraits/sergei.png",
    fallenPortraitAsset: "/assets/portraits/fallen/sergei.jpg",
    portraitSvg: createPortraitSvg("#243b4f", "#4f879f", "#e6f4ff", "anchor"),
    portraitClass: "portrait-sergei",
    portraitMark: "▲",
    baseHp: 5,
    startingPerkId: "sergei-cycle-survival",
    innateTrait: {
      label: "Запас плавучести",
      squadDescription: "Запас плавучести: один раз за цикл смертельный подрыв оставляет Сергея с 1 HP.",
      soloDescription: "Запас плавучести: один раз за цикл смертельный подрыв оставляет Сергея с 1 HP."
    },
    unlockablePerkIds: ["sergei-cycle-survival", "sergei-heavy-landing"],
    lines: {
      start: "Дышим ровно. Волна придёт позже.",
      win: "Сектор чист. Идём дальше.",
      death: "Корпус пробит. Дальше без меня."
    }
  },
  {
    id: "sych",
    name: "Тактик Сыч",
    portrait: "TS",
    portraitAsset: "/assets/portraits/sych.png",
    fallenPortraitAsset: "/assets/portraits/fallen/sych.jpg",
    portraitSvg: createPortraitSvg("#252d3a", "#87745f", "#eef0ec", "moon"),
    portraitClass: "portrait-sych",
    portraitMark: "◐",
    baseHp: 5,
    startingPerkId: "sych-flag-discipline",
    innateTrait: {
      label: "Флажковая дисциплина",
      squadDescription: "Флажковая дисциплина: +2% XP за каждый неиспользованный флаг, максимум +20%.",
      soloDescription: "Флажковая дисциплина: +2% XP за каждый неиспользованный флаг, максимум +20%."
    },
    unlockablePerkIds: ["sych-flag-discipline", "sych-night-patience"],
    lines: {
      start: "Флажок не украшение. Это обещание.",
      win: "Тихо сработано. Мне нравится.",
      death: "Слишком быстрый шаг."
    }
  },
  {
    id: "olga",
    name: "Аналитик Ольга",
    portrait: "AO",
    portraitAsset: "/assets/portraits/olga.png",
    fallenPortraitAsset: "/assets/portraits/fallen/olga.jpg",
    portraitSvg: createPortraitSvg("#263b34", "#7b8b6a", "#d9e5d6", "chevron"),
    portraitClass: "portrait-olga",
    portraitMark: "◆",
    baseHp: 5,
    startingPerkId: "olga-shared-analysis",
    innateTrait: {
      label: "Общий расчёт",
      squadDescription: "Общий расчёт: каждый другой живой оперативник получает +15% от XP, заработанного Ольгой.",
      soloDescription: "Общий расчёт: Ольга получает +20% XP за победу."
    },
    unlockablePerkIds: ["olga-shared-analysis", "olga-reserve-staff"],
    lines: {
      start: "Штаб видит поле. Ошибку оставим на крайний случай.",
      win: "Расчёт подтвердился. Следующий сектор.",
      death: "Расчёт оборвался."
    }
  },
  {
    id: "iskra",
    name: "Доктор Искра",
    portrait: "DI",
    portraitAsset: "/assets/portraits/iskra.png",
    fallenPortraitAsset: "/assets/portraits/fallen/iskra.jpg",
    portraitSvg: createPortraitSvg("#642833", "#db6b45", "#fff1e8", "cross"),
    portraitClass: "portrait-iskra",
    portraitMark: "✚",
    baseHp: 4,
    startingPerkId: "iskra-field-medicine",
    innateTrait: {
      label: "Полевой протокол",
      squadDescription: "После успешной операции Искры лечит 1 случайного живого оперативника на 1 HP.",
      soloDescription: "После успешной операции лечит себя на 1 HP."
    },
    unlockablePerkIds: ["iskra-field-medicine", "iskra-reanimation-chance"],
    lines: {
      start: "Если загорится, я рядом. Но лучше без этого.",
      win: "Пульс ровный. Нервы крепкие.",
      death: "Слишком много огня для одного отчёта."
    }
  },
  {
    id: "rom",
    name: "Наблюдатель Ром",
    portrait: "NR",
    portraitAsset: "/assets/portraits/rom.png",
    fallenPortraitAsset: "/assets/portraits/fallen/rom.jpg",
    portraitSvg: createPortraitSvg("#493622", "#9a8358", "#fff2d8", "block"),
    portraitClass: "portrait-rom",
    portraitMark: "■",
    baseHp: 4,
    startingPerkId: "rom-drunk-master",
    innateTrait: {
      label: "Пьяный мастер",
      squadDescription: "Пьяный мастер: после первого клика раскрывает 2 безопасные клетки вдали от открытого поля.",
      soloDescription: "Пьяный мастер: после первого клика раскрывает 2 безопасные клетки вдали от открытого поля."
    },
    unlockablePerkIds: ["rom-drunk-master", "rom-wild-intuition"],
    lines: {
      start: "Сначала поле, потом геройство.",
      win: "Вот это уже похоже на работу.",
      death: "Геройство опять полезло вперёд расчёта."
    }
  },
  {
    id: "lada",
    name: "Инженер Лада",
    portrait: "IL",
    portraitAsset: "/assets/portraits/lada.png",
    fallenPortraitAsset: "/assets/portraits/fallen/lada.jpg",
    portraitSvg: createPortraitSvg("#1e4b59", "#55a4a8", "#e4fbff", "diamond"),
    portraitClass: "portrait-lada",
    portraitMark: "◆",
    baseHp: 4,
    startingPerkId: "lada-local-scan",
    innateTrait: {
      label: "Сканер сектора",
      squadDescription: "Сканер сектора: 1 раз за операцию проверяет сектор из 3 клеток без раскрытия поля.",
      soloDescription: "Сканер сектора: 1 раз за операцию проверяет сектор из 3 клеток без раскрытия поля."
    },
    unlockablePerkIds: ["lada-local-scan", "lada-field-restoration"],
    lines: {
      start: "Сетка говорит больше, чем кажется.",
      win: "Расчёт верный. Поле обезврежено.",
      death: "Данные получены дорогой ценой."
    }
  }
];

export function getCharacter(id: string): Character {
  return CHARACTERS.find((character) => character.id === id) ?? CHARACTERS[0];
}

export function getCharacterBaseHp(id: string): number {
  return getCharacter(id).baseHp;
}

function createPortraitSvg(primary: string, secondary: string, light: string, emblem: string): string {
  const emblemMarkup: Record<string, string> = {
    anchor: `<path d="M32 17v31M24 25h16M22 43c2 8 18 8 20 0M21 42l-4 3M43 42l4 3" stroke="${light}" stroke-width="4" stroke-linecap="round" fill="none"/>`,
    chevron: `<path d="M18 47 32 37l14 10-4 5-10-7-10 7z" fill="${light}" opacity=".92"/>`,
    diamond: `<path d="M32 36 44 48 32 60 20 48z" fill="${light}" opacity=".9"/>`,
    moon: `<path d="M42 44a13 13 0 1 1-14-18 16 16 0 0 0 14 18z" fill="${light}" opacity=".9"/>`,
    cross: `<path d="M28 39h8v7h7v8h-7v7h-8v-7h-7v-8h7z" fill="${light}" opacity=".92"/>`,
    block: `<path d="M22 42h20v20H22z" fill="${light}" opacity=".88"/><path d="M27 47h10v10H27z" fill="${primary}" opacity=".55"/>`
  };

  return `
    <svg class="portrait-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="portrait-${emblem}" x1="10" y1="6" x2="54" y2="58" gradientUnits="userSpaceOnUse">
          <stop stop-color="${secondary}"/>
          <stop offset="1" stop-color="${primary}"/>
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="10" fill="url(#portrait-${emblem})"/>
      <path d="M14 57c2-13 11-20 18-20s16 7 18 20z" fill="${light}" opacity=".2"/>
      <path d="M22 24c0-8 5-14 10-14s10 6 10 14-4 13-10 13-10-5-10-13z" fill="${light}" opacity=".76"/>
      <path d="M18 23c3-11 10-17 21-11 5 3 7 8 7 14-8-4-17-5-28-3z" fill="${primary}" opacity=".72"/>
      ${emblemMarkup[emblem]}
      <rect x="5" y="5" width="54" height="54" rx="8" fill="none" stroke="${light}" stroke-opacity=".42" stroke-width="2"/>
    </svg>
  `;
}
