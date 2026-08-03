function csvValue(value: string) {
  const safe = /^[\u0000-\u0020\u00a0\ufeff]*[=+\-@]/u.test(value)
    ? `'${value}`
    : value;
  return /[;"\r\n]/.test(safe)
    ? `"${safe.replaceAll('"', '""')}"`
    : safe;
}

export function downloadCsv(name: string, headers: string[], rows: string[][]) {
  const csv = `\ufeff${[headers, ...rows]
    .map((row) => row.map(csvValue).join(";"))
    .join("\r\n")}`;
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
