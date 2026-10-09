import { expect, test } from "bun:test";
import {
  DEFAULT_WORKING_TREE_COLUMNS,
  listGridTemplate,
  parseStoredColumns,
} from "../src/components/working-tree/working-tree-columns";

test("missing, corrupt, or non-array stored columns fall back to the defaults", () => {
  expect(parseStoredColumns(null)).toEqual([...DEFAULT_WORKING_TREE_COLUMNS]);
  expect(parseStoredColumns("{not json")).toEqual([...DEFAULT_WORKING_TREE_COLUMNS]);
  expect(parseStoredColumns('{"statusLabel":true}')).toEqual([...DEFAULT_WORKING_TREE_COLUMNS]);
});

test("stored columns drop unknown ids and duplicates and keep display order regardless of toggle order", () => {
  expect(parseStoredColumns(JSON.stringify(["partial", "bogus", "statusLabel", "partial", 3]))).toEqual([
    "statusLabel",
    "partial",
  ]);
});

test("core status, path, and actions columns frame every template, extras sit between path and actions", () => {
  expect(listGridTemplate([])).toBe("16px minmax(0,1fr) 64px");
  const template = listGridTemplate(["partial", "statusLabel"]).split(" ");
  expect(template[0]).toBe("16px");
  expect(template[1]).toBe("minmax(0,1fr)");
  expect(template.at(-1)).toBe("64px");
  expect(template.length).toBe(5);
});
