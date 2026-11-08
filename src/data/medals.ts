export interface Medal {
  id: string;
  icon: string;
  label: string;
  description: string;
  assetPath: string;
  /** Visual treatment only; does not affect award rules. */
  finish: "bronze" | "silver" | "gold";
}

export const MEDALS: Medal[] = [
  {
    id: "no-flags-win",
    icon: "★",
    label: "Чистые руки",
    description: "Победить, не поставив ни одного флага.",
    assetPath: "/assets/medals/no-flags-win.svg",
    finish: "silver"
  },
  {
    id: "training-medal",
    icon: "Ⅰ",
    label: "Медаль учебного двора",
    description: "Победить в операции Учебный двор.",
    assetPath: "/assets/medals/training-medal.svg",
    finish: "bronze"
  },
  {
    id: "border-medal",
    icon: "Ⅱ",
    label: "Медаль пограничного поста",
    description: "Победить в операции Пограничный пост.",
    assetPath: "/assets/medals/border-medal.svg",
    finish: "bronze"
  },
  {
    id: "forest-road-medal",
    icon: "Ⅲ",
    label: "Медаль лесной дороги",
    description: "Победить в операции Лесная дорога.",
    assetPath: "/assets/medals/forest-road-medal.svg",
    finish: "silver"
  },
  {
    id: "dry-line-medal",
    icon: "Ⅳ",
    label: "Медаль сухого рубежа",
    description: "Победить в операции Сухой рубеж.",
    assetPath: "/assets/medals/dry-line-medal.svg",
    finish: "bronze"
  },
  {
    id: "sunfield-medal",
    icon: "Ⅴ",
    label: "Медаль подсолнухового фронта",
    description: "Победить в операции Подсолнуховый фронт.",
    assetPath: "/assets/medals/sunfield-medal.svg",
    finish: "silver"
  },
  {
    id: "iron-square-medal",
    icon: "Ⅵ",
    label: "Медаль железного квадрата",
    description: "Победить в операции Железный квадрат.",
    assetPath: "/assets/medals/iron-square-medal.svg",
    finish: "silver"
  },
  {
    id: "grand-sweep-medal",
    icon: "✪",
    label: "Медаль большой зачистки",
    description: "Победить в операции Большая зачистка.",
    assetPath: "/assets/medals/grand-sweep-medal.svg",
    finish: "gold"
  },
  {
    id: "fast-small-win",
    icon: "⧖",
    label: "Быстрый вход",
    description: "Победить в небольшой операции быстрее чем за 60 секунд.",
    assetPath: "/assets/medals/fast-small-win.svg",
    finish: "bronze"
  },
  {
    id: "hard-survivor",
    icon: "⬟",
    label: "Под огнём",
    description: "Победить в операции с 40 минами или больше.",
    assetPath: "/assets/medals/hard-survivor.svg",
    finish: "gold"
  }
];

export interface MedalAssetRegistryItem {
  medalId: string;
  displayName: string;
  condition: string;
  expectedAssetFilename: string;
}

export const MEDAL_ASSET_REGISTRY: MedalAssetRegistryItem[] = MEDALS.map((medal) => ({
  medalId: medal.id,
  displayName: medal.label,
  condition: medal.description,
  expectedAssetFilename: `${medal.id}.svg`
}));
