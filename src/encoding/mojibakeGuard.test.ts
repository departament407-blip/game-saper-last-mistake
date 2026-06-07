import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC_ROOT = join(process.cwd(), "src");
const CHECKED_EXTENSIONS = new Set([".ts", ".tsx", ".css"]);
const MARKERS = [
  [0x0420, 0x045f],
  [0x0420, 0x2014],
  [0x0420, 0x00b0],
  [0x0421, 0x0453],
  [0x0421, 0x201a],
  [0x0421, 0x201a],
  [0x0421, 0x2018],
  [0x0421, 0x2019],
  [0x0421, 0x201c],
  [0x0421, 0x201d],
  [0x0420, 0x0451],
  [0x0420, 0x0405],
  [0x0420, 0x0454],
  [0x0420, 0x0456],
  [0x0420, 0x0455],
  [0x0420, 0x045c],
  [0x0420, 0x00b5],
  [0x0420, 0x00bd],
  [0x0420, 0x045e],
  [0x0420, 0x00bb],
  [0x0420, 0x0458],
  [0x0420, 0x0456],
  [0x0420, 0x00ba],
  [0x0420, 0x00bc]
].map((codes) => String.fromCharCode(...codes));

describe("text encoding", () => {
  it("does not contain common Cyrillic mojibake markers in src", () => {
    const offenders = collectFiles(SRC_ROOT)
      .filter((file) => CHECKED_EXTENSIONS.has(file.slice(file.lastIndexOf("."))))
      .flatMap((file) => {
        const text = readFileSync(file, "utf8");
        return MARKERS
          .filter((marker) => text.includes(marker))
          .map((marker) => `${file.replace(`${process.cwd()}\\`, "")}: ${JSON.stringify(marker)}`);
      });

    expect(offenders).toEqual([]);
  });
});

function collectFiles(directory: string): string[] {
  return readdirSync(directory)
    .flatMap((name) => {
      const fullPath = join(directory, name);
      const stats = statSync(fullPath);

      return stats.isDirectory() ? collectFiles(fullPath) : [fullPath];
    });
}
