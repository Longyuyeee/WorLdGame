import { read, utils, write } from "xlsx";

export function encodeLocalizationXlsx(matrix: readonly (readonly string[])[]): ArrayBuffer {
  const sheet = utils.aoa_to_sheet(matrix.map((row) => [...row]));
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, "Localization");
  return write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function parseLocalizationXlsx(bytes: ArrayBuffer): string[][] {
  const workbook = read(bytes, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (sheetName === undefined) throw new Error("XLSX 中没有工作表");
  const rows = utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName]!, { header: 1, raw: false, defval: "" });
  return rows.map((row) => row.map((value) => String(value)));
}
