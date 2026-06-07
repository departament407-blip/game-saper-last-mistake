# Сапёр: Последняя ошибка

Браузерная игра на базе классического Minesweeper: операции по циклам, отряд/solo-режим, HP, портреты, биомы, перки и локальные рекорды.

Стек: TypeScript, Vite, HTML/CSS, DOM UI.

## Требования

- Node.js 20.19.0 или новее
- npm

## Локальный запуск

```bash
npm install
npm run dev
```

Vite обычно открывает игру здесь:

```text
http://127.0.0.1:5173/
```

## Тесты

```bash
npm test
```

## Production build

```bash
npm run build
```

Готовая сборка появляется в папке:

```text
dist/
```

## Локальная проверка production build

```bash
npm run build
npm run start
```

По умолчанию production server использует порт `3000`. Можно задать порт через переменную окружения `PORT`.

PowerShell:

```powershell
$env:PORT="4174"; npm run start
```

## Railway deploy

Игра публикуется как отдельный Railway-сервис без backend и без базы данных.

Настройки Railway:

- Build command: `npm run build`
- Start command: `npm run start`
- Publish/runtime: Node.js service
- Environment variable: Railway сам задаёт `PORT`

`npm run start` отдаёт production build из `dist` через пакет `serve`.

Для отдельного Railway-домена используется Vite `base: "/"`.

## Почему нельзя открывать index.html двойным кликом

Проект использует Vite и TypeScript. Браузер не компилирует TypeScript из `src/main.ts` при запуске через `file://`, поэтому игру нужно запускать через dev server или production server:

```bash
npm run dev
```

или

```bash
npm run build
npm run start
```
