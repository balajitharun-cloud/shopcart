/* Inline SVG product artwork.
   Flat illustrations on a transparent ground so the card background shows through.
   Keys match Product.image; unknown keys fall back to "package". */

/* Products that ship a real photograph in assets/products/. Everything else falls back to
   the inline illustrations below. */
const PHOTO_KEYS = ["laptop", "phone", "watch", "headphones", "charger", "keyboard",
  "sneakers", "tshirt", "bottle", "containers", "skillet", "books"];

const ART_KEYS = [
  ["headphones", "Headphones"], ["watch", "Watch"], ["charger", "Charger"],
  ["keyboard", "Keyboard"], ["sneakers", "Sneakers"], ["jeans", "Jeans"],
  ["tshirt", "T-shirt"], ["bottle", "Bottle"], ["containers", "Containers"],
  ["skillet", "Skillet"], ["book", "Book"], ["book2", "Stacked books"],
  ["serum", "Serum"], ["sunscreen", "Sunscreen tube"], ["package", "Generic box"],
];

const INK = "#1F1E18";
const ACCENT = "#1C4A3A";
const SAND = "#CFC8B6";
const LIGHT = "#FFFFFF";

const ART = {
  headphones: `
    <path d="M52 118V96a48 48 0 0 1 96 0v22" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>
    <rect x="38" y="112" width="26" height="56" rx="12" fill="${INK}"/>
    <rect x="136" y="112" width="26" height="56" rx="12" fill="${INK}"/>
    <rect x="45" y="122" width="12" height="36" rx="6" fill="${ACCENT}"/>
    <rect x="143" y="122" width="12" height="36" rx="6" fill="${ACCENT}"/>
    <path d="M64 150c14 10 58 10 72 0" fill="none" stroke="${SAND}" stroke-width="3" stroke-linecap="round"/>`,

  watch: `
    <rect x="78" y="20" width="44" height="46" rx="10" fill="${SAND}"/>
    <rect x="78" y="154" width="44" height="46" rx="10" fill="${SAND}"/>
    <rect x="58" y="62" width="84" height="96" rx="22" fill="${INK}"/>
    <rect x="68" y="74" width="64" height="72" rx="14" fill="${ACCENT}"/>
    <path d="M100 92v20l14 10" fill="none" stroke="${LIGHT}" stroke-width="5" stroke-linecap="round"/>
    <rect x="143" y="96" width="6" height="16" rx="3" fill="${SAND}"/>`,

  charger: `
    <rect x="52" y="64" width="96" height="96" rx="16" fill="${INK}"/>
    <rect x="66" y="78" width="68" height="52" rx="8" fill="${ACCENT}"/>
    <rect x="76" y="96" width="18" height="8" rx="4" fill="${LIGHT}"/>
    <rect x="104" y="96" width="18" height="8" rx="4" fill="${LIGHT}"/>
    <path d="M100 160v22a10 10 0 0 0 10 10h34" fill="none" stroke="${SAND}" stroke-width="6" stroke-linecap="round"/>
    <rect x="76" y="46" width="10" height="20" rx="4" fill="${SAND}"/>
    <rect x="114" y="46" width="10" height="20" rx="4" fill="${SAND}"/>`,

  keyboard: `
    <rect x="22" y="82" width="156" height="76" rx="10" fill="${INK}"/>
    <g fill="${SAND}">
      <rect x="34" y="94" width="16" height="14" rx="3"/><rect x="56" y="94" width="16" height="14" rx="3"/>
      <rect x="78" y="94" width="16" height="14" rx="3"/><rect x="100" y="94" width="16" height="14" rx="3"/>
      <rect x="122" y="94" width="16" height="14" rx="3"/><rect x="144" y="94" width="22" height="14" rx="3"/>
      <rect x="34" y="114" width="16" height="14" rx="3"/><rect x="56" y="114" width="16" height="14" rx="3"/>
      <rect x="78" y="114" width="16" height="14" rx="3"/><rect x="100" y="114" width="16" height="14" rx="3"/>
      <rect x="122" y="114" width="16" height="14" rx="3"/><rect x="144" y="114" width="22" height="14" rx="3"/>
      <rect x="34" y="134" width="88" height="14" rx="3"/><rect x="128" y="134" width="38" height="14" rx="3"/>
    </g>
    <rect x="72" y="70" width="56" height="6" rx="3" fill="${ACCENT}"/>`,

  sneakers: `
    <path d="M30 148c0-12 6-20 18-26l26-14 12 14 20-6 8 16 40 10c16 4 24 10 24 20v8H30z" fill="${INK}"/>
    <path d="M30 156h148v10a8 8 0 0 1-8 8H38a8 8 0 0 1-8-8z" fill="${SAND}"/>
    <path d="M86 122l10 12M100 116l10 12M114 110l10 12" stroke="${SAND}" stroke-width="4" stroke-linecap="round"/>
    <path d="M46 140c26 10 74 16 116 14" fill="none" stroke="${ACCENT}" stroke-width="4" stroke-linecap="round"/>`,

  jeans: `
    <path d="M64 34h72l6 40-4 108h-26l-4-84-4 84H74L70 74z" fill="${INK}"/>
    <rect x="64" y="34" width="72" height="16" fill="${SAND}"/>
    <path d="M100 50v38" stroke="${SAND}" stroke-width="3"/>
    <path d="M74 74l10 8M126 74l-10 8" stroke="${SAND}" stroke-width="3" stroke-linecap="round"/>
    <rect x="88" y="56" width="24" height="6" rx="3" fill="${ACCENT}"/>`,

  tshirt: `
    <path d="M72 40l-30 14 10 26 14-6v92h68V74l14 6 10-26-30-14-14 10h-28z" fill="${INK}"/>
    <path d="M86 40c0 10 28 10 28 0" fill="none" stroke="${SAND}" stroke-width="5"/>
    <path d="M66 74h68" stroke="${ACCENT}" stroke-width="4"/>`,

  bottle: `
    <rect x="74" y="44" width="52" height="18" rx="7" fill="${ACCENT}"/>
    <rect x="82" y="62" width="36" height="10" fill="${SAND}"/>
    <path d="M70 72h60a8 8 0 0 1 8 9l-6 84a12 12 0 0 1-12 11H80a12 12 0 0 1-12-11l-6-84a8 8 0 0 1 8-9z" fill="${INK}"/>
    <path d="M86 92v62" stroke="${SAND}" stroke-width="6" stroke-linecap="round" opacity=".7"/>`,

  containers: `
    <rect x="40" y="120" width="120" height="56" rx="8" fill="${INK}"/>
    <rect x="40" y="112" width="120" height="14" rx="6" fill="${ACCENT}"/>
    <rect x="54" y="68" width="92" height="42" rx="8" fill="${SAND}"/>
    <rect x="54" y="60" width="92" height="12" rx="5" fill="${INK}"/>
    <rect x="68" y="30" width="64" height="30" rx="7" fill="${ACCENT}"/>
    <rect x="66" y="24" width="68" height="10" rx="4" fill="${INK}"/>`,

  skillet: `
    <circle cx="86" cy="112" r="56" fill="${INK}"/>
    <circle cx="86" cy="112" r="42" fill="none" stroke="${SAND}" stroke-width="3"/>
    <rect x="140" y="104" width="52" height="16" rx="8" fill="${INK}"/>
    <rect x="176" y="100" width="10" height="24" rx="5" fill="${SAND}"/>
    <circle cx="86" cy="112" r="14" fill="${ACCENT}" opacity=".35"/>`,

  book: `
    <rect x="46" y="34" width="108" height="152" rx="4" fill="${INK}"/>
    <rect x="56" y="34" width="12" height="152" fill="${ACCENT}"/>
    <rect x="80" y="66" width="58" height="7" rx="3.5" fill="${SAND}"/>
    <rect x="80" y="84" width="44" height="7" rx="3.5" fill="${SAND}" opacity=".65"/>
    <rect x="80" y="120" width="30" height="6" rx="3" fill="${LIGHT}" opacity=".8"/>`,

  book2: `
    <rect x="38" y="132" width="124" height="30" rx="4" fill="${SAND}"/>
    <rect x="48" y="102" width="112" height="30" rx="4" fill="${ACCENT}"/>
    <rect x="58" y="70" width="96" height="32" rx="4" fill="${INK}"/>
    <rect x="72" y="82" width="52" height="6" rx="3" fill="${SAND}"/>
    <rect x="66" y="114" width="46" height="6" rx="3" fill="${LIGHT}" opacity=".8"/>
    <rect x="58" y="146" width="56" height="6" rx="3" fill="${INK}" opacity=".5"/>`,

  serum: `
    <rect x="86" y="24" width="28" height="18" rx="5" fill="${INK}"/>
    <rect x="94" y="42" width="12" height="20" fill="${SAND}"/>
    <rect x="72" y="60" width="56" height="106" rx="12" fill="${INK}"/>
    <rect x="80" y="86" width="40" height="46" rx="4" fill="${SAND}"/>
    <rect x="88" y="98" width="24" height="5" rx="2.5" fill="${INK}"/>
    <rect x="88" y="110" width="16" height="5" rx="2.5" fill="${ACCENT}"/>`,

  sunscreen: `
    <rect x="74" y="30" width="52" height="16" rx="6" fill="${INK}"/>
    <path d="M64 52h72l-8 116a10 10 0 0 1-10 9H82a10 10 0 0 1-10-9z" fill="${LIGHT}" stroke="${SAND}" stroke-width="3"/>
    <rect x="72" y="92" width="56" height="44" fill="${ACCENT}" opacity=".18"/>
    <rect x="84" y="104" width="32" height="6" rx="3" fill="${INK}"/>
    <rect x="84" y="118" width="20" height="5" rx="2.5" fill="${ACCENT}"/>`,

  package: `
    <path d="M100 36l64 30v78l-64 30-64-30V66z" fill="${SAND}"/>
    <path d="M100 36l64 30-64 30-64-30z" fill="${LIGHT}" stroke="${SAND}" stroke-width="2"/>
    <path d="M100 96v78M36 66l64 30 64-30" fill="none" stroke="${INK}" stroke-width="4" opacity=".45"/>
    <rect x="88" y="40" width="24" height="52" fill="${ACCENT}" opacity=".75"/>`,
};

/** Card/sheet media: a photo when we have one, otherwise the inline illustration. */
function productMedia(key) {
  if (PHOTO_KEYS.includes(key)) {
    return `<img src="assets/products/${key}.webp" alt="" loading="lazy" width="800" height="1000" />`;
  }
  return productArt(key);
}

function productArt(key) {
  const body = ART[key] || ART.package;
  return `<svg viewBox="0 0 200 220" role="img" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

let starSeq = 0;
const STAR_PATH = "M10 1.6l2.55 5.2 5.75.8-4.15 4.05 1 5.7-5.15-2.7-5.15 2.7 1-5.7L1.7 7.6l5.75-.8z";

/** Five stars with a precise partial fill for the given rating. */
function starsSvg(rating) {
  const pct = Math.max(0, Math.min(5, Number(rating) || 0)) / 5;
  const id = "sc" + ++starSeq;
  const positions = [0, 22, 44, 66, 88];
  const row = positions.map((x) => `<path d="${STAR_PATH}" transform="translate(${x},0)"/>`).join("");
  return `<svg class="stars-svg" viewBox="0 0 108 20" width="66" height="12" aria-hidden="true">
    <defs><clipPath id="${id}"><rect x="0" y="0" width="${(pct * 108).toFixed(2)}" height="20"/></clipPath></defs>
    <g fill="#D9D4C7">${row}</g>
    <g fill="#14140F" clip-path="url(#${id})">${row}</g>
  </svg>`;
}
