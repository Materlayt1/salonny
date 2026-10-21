export type ImportedCustomer = { fullName: string; phone: string; email: string; notes: string; marketingConsent: boolean };

function parseRow(line: string, delimiter: string) {
  const cells: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { cells.push(value.trim()); value = ""; }
    else value += char;
  }
  cells.push(value.trim()); return cells;
}

export function parseCustomerCsv(source: string): ImportedCustomer[] {
  const normalized = source.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
  if (!normalized) return [];
  const lines = normalized.split("\n").filter(Boolean); const delimiter = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = parseRow(lines[0], delimiter).map((cell) => cell.toLocaleLowerCase("tr-TR").replaceAll(/[^a-z0-9çğıöşü]/g, ""));
  const find = (...names: string[]) => header.findIndex((cell) => names.includes(cell));
  const nameIndex = find("adsoyad", "isim", "fullname", "name"); const phoneIndex = find("telefon", "phone", "tel");
  const emailIndex = find("eposta", "email"); const notesIndex = find("not", "notlar", "notes"); const consentIndex = find("pazarlamaizni", "marketingconsent", "izin");
  if (nameIndex < 0 || phoneIndex < 0) throw new Error("CSV dosyasında Ad Soyad ve Telefon sütunları bulunmalıdır.");
  return lines.slice(1).map((line) => parseRow(line, delimiter)).filter((row) => row.some(Boolean)).map((row) => ({
    fullName: row[nameIndex]?.trim() ?? "", phone: row[phoneIndex]?.trim() ?? "", email: emailIndex >= 0 ? row[emailIndex]?.trim() ?? "" : "", notes: notesIndex >= 0 ? row[notesIndex]?.trim() ?? "" : "", marketingConsent: consentIndex >= 0 && /^(1|true|evet|yes)$/i.test(row[consentIndex]?.trim() ?? ""),
  }));
}

