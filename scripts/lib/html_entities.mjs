const namedEntities = new Map(Object.entries({
  amp: "&",
  apos: "'",
  colon: ":",
  copy: "\u00a9",
  deg: "\u00b0",
  diams: "\u2666",
  emsp: "\u2003",
  gamma: "\u03b3",
  gt: ">",
  infin: "\u221e",
  lsquo: "\u2018",
  ldquo: "\u201c",
  lt: "<",
  nbsp: "\u00a0",
  NewLine: "\n",
  Oslash: "\u00d8",
  plusmn: "\u00b1",
  quot: '"',
  ndash: "\u2013",
  mdash: "\u2014",
  rdquo: "\u201d",
  reg: "\u00ae",
  rsquo: "\u2019",
  Tab: "\t",
  trade: "\u2122",
}));

function codePoint(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isInteger(number) || number <= 0 || number > 0x10ffff || (number >= 0xd800 && number <= 0xdfff)) {
    return "\ufffd";
  }
  return String.fromCodePoint(number);
}

export function decodeHtmlEntities(value) {
  return String(value).replace(
    /&(?:#([0-9]+);?|#[xX]([0-9a-fA-F]+);?|([A-Za-z][A-Za-z0-9]+);)/g,
    (match, decimal, hexadecimal, name) => {
      if (decimal) return codePoint(decimal);
      if (hexadecimal) return codePoint(String(Number.parseInt(hexadecimal, 16)));
      return namedEntities.get(name) ?? match;
    },
  );
}
