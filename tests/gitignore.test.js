import { expect, test } from "bun:test";
import { buildIgnoreSuggestions, toIgnorePattern } from "../src/lib/gitignore";

test("anchors exact paths and marks directories with a trailing slash", () => {
  expect(toIgnorePattern("src/utils/debug.log", { anchored: true, directory: false })).toBe(
    "/src/utils/debug.log",
  );
  expect(toIgnorePattern("build/out", { anchored: true, directory: true })).toBe("/build/out/");
  expect(toIgnorePattern("node_modules", { anchored: false, directory: true })).toBe(
    "node_modules/",
  );
});

test("escapes glob metacharacters so literal paths stay literal", () => {
  expect(toIgnorePattern("logs/report[1].txt", { anchored: true, directory: false })).toBe(
    "/logs/report\\[1\\].txt",
  );
  expect(toIgnorePattern("weird/na?me*.bin", { anchored: true, directory: false })).toBe(
    "/weird/na\\?me\\*.bin",
  );
});

test("escapes leading comment/negation markers and trailing spaces", () => {
  expect(toIgnorePattern("#notes.txt", { anchored: false, directory: false })).toBe(
    "\\#notes.txt",
  );
  expect(toIgnorePattern("!important.txt", { anchored: false, directory: false })).toBe(
    "\\!important.txt",
  );
  expect(toIgnorePattern("trailing ", { anchored: false, directory: false })).toBe("trailing\\ ");
});

test("suggests exact, extension, name and parent rules for a nested file", () => {
  const suggestions = buildIgnoreSuggestions("src/utils/debug.log", "file");

  expect(suggestions.map((suggestion) => suggestion.pattern)).toEqual([
    "/src/utils/debug.log",
    "*.log",
    "debug.log",
    "/src/utils/",
  ]);
});

test("omits the extension rule for files without one", () => {
  const suggestions = buildIgnoreSuggestions("Makefile", "file");

  expect(suggestions.map((suggestion) => suggestion.id)).toEqual(["exact", "name"]);
  expect(suggestions.map((suggestion) => suggestion.pattern)).toEqual(["/Makefile", "Makefile"]);
});

test("treats a leading dot as a dotfile rather than an extension", () => {
  const suggestions = buildIgnoreSuggestions(".env", "file");

  expect(suggestions.some((suggestion) => suggestion.id === "extension")).toBe(false);
});

test("suggests folder rules for directories", () => {
  const suggestions = buildIgnoreSuggestions("packages/app/dist", "directory");

  expect(suggestions.map((suggestion) => suggestion.pattern)).toEqual([
    "/packages/app/dist/",
    "dist/",
    "/packages/app/",
  ]);
});

test("drops duplicate patterns", () => {
  const suggestions = buildIgnoreSuggestions("dist", "directory");

  expect(suggestions.map((suggestion) => suggestion.pattern)).toEqual(["/dist/", "dist/"]);
});
