import * as opentype from 'opentype.js';

const BASE_FONT_URL = '/text-encrypt-base.woff';
/** 密文落在 PUA，避免与正文汉字冲突 */
const PUA_START = 0xe000;

const fontFamilyCache = new Map<string, string>();
const permTableCache = new Map<string, Map<string, string>>();
let baseFontPromise: Promise<opentype.Font | null> | null = null;
let alphabetPromise: Promise<string[]> | null = null;

function seedFromString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: T[], random: () => number): T[] {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

async function loadBaseFont(): Promise<opentype.Font | null> {
  if (!baseFontPromise) {
    baseFontPromise = fetch(BASE_FONT_URL)
      .then(async (res) => {
        if (!res.ok) return null;
        return opentype.parse(await res.arrayBuffer());
      })
      .catch(() => null);
  }
  return baseFontPromise;
}

function hasGlyph(font: opentype.Font, char: string) {
  const glyph = font.charToGlyph(char);
  return !!glyph && glyph.index !== 0 && !!glyph.path?.commands?.length;
}

async function getAlphabet(): Promise<string[]> {
  if (!alphabetPromise) {
    alphabetPromise = (async () => {
      const font = await loadBaseFont();
      if (!font) return [];

      const han: string[] = [];
      const glyphCount = font.glyphs.length;
      for (let i = 0; i < glyphCount; i += 1) {
        const glyph = font.glyphs.get(i);
        const code = glyph?.unicode;
        if (
          code &&
          code >= 0x4e00 &&
          code <= 0x9fff &&
          glyph.path?.commands?.length
        ) {
          han.push(String.fromCodePoint(code));
        }
      }
      han.sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!);

      const latin: string[] = [];
      for (let code = 0x41; code <= 0x5a; code += 1) {
        const ch = String.fromCharCode(code);
        if (hasGlyph(font, ch)) latin.push(ch);
      }
      for (let code = 0x61; code <= 0x7a; code += 1) {
        const ch = String.fromCharCode(code);
        if (hasGlyph(font, ch)) latin.push(ch);
      }

      return [...han, ...latin];
    })();
  }
  return alphabetPromise;
}

async function getPermutationTable(
  userId: string
): Promise<Map<string, string>> {
  const cached = permTableCache.get(userId);
  if (cached) return cached;

  const alphabet = await getAlphabet();
  const table = new Map<string, string>();
  if (!alphabet.length) {
    permTableCache.set(userId, table);
    return table;
  }

  const random = mulberry32(seedFromString(`dx-text-encrypt:${userId}`));
  const slots = shuffle(
    alphabet.map((_, index) => index),
    random
  );

  alphabet.forEach((plain, index) => {
    table.set(plain, String.fromCodePoint(PUA_START + slots[index]));
  });

  permTableCache.set(userId, table);
  return table;
}

function clonePath(source: opentype.Path) {
  const path = new opentype.Path();
  path.commands = source.commands.map((cmd) => ({ ...cmd }));
  path.fill = source.fill;
  path.stroke = source.stroke;
  path.strokeWidth = source.strokeWidth;
  return path;
}

async function createMappedFont(
  baseFont: opentype.Font,
  charMap: Map<string, string>,
  userId: string
): Promise<string | null> {
  const cacheKey = `${userId}|${[...charMap.keys()].sort().join('')}`;
  const cached = fontFamilyCache.get(cacheKey);
  if (cached) return cached;

  const glyphs: opentype.Glyph[] = [
    new opentype.Glyph({
      name: '.notdef',
      unicode: 0,
      advanceWidth: 500,
      path: new opentype.Path(),
    }),
  ];

  for (const [plain, cipher] of charMap) {
    if (!hasGlyph(baseFont, plain)) return null;
    const sourceGlyph = baseFont.charToGlyph(plain);
    const cipherCode = cipher.codePointAt(0);
    if (cipherCode === undefined) return null;

    glyphs.push(
      new opentype.Glyph({
        name: `uni${cipherCode.toString(16).toUpperCase()}`,
        unicode: cipherCode,
        advanceWidth: sourceGlyph.advanceWidth || baseFont.unitsPerEm,
        path: clonePath(sourceGlyph.path),
      })
    );
  }

  const font = new opentype.Font({
    familyName: 'DxPermEncrypt',
    styleName: 'Regular',
    unitsPerEm: baseFont.unitsPerEm,
    ascender: baseFont.ascender,
    descender: baseFont.descender,
    glyphs,
  });

  const family = `DxPermEncrypt-${cacheKey.length}`;
  const objectUrl = URL.createObjectURL(
    new Blob([new Uint8Array(font.toArrayBuffer())], { type: 'font/ttf' })
  );
  try {
    const face = new FontFace(family, `url(${objectUrl})`);
    await face.load();
    document.fonts.add(face);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  fontFamilyCache.set(cacheKey, family);
  return family;
}

export type EncryptHighlightPart = {
  text: string;
  highlight: boolean;
};

export const KEYWORD_HIGHLIGHT_STYLE = {
  color: 'inherit',
  fontWeight: 500,
  background: '#fff566',
} as const;

export function getKeywordHighlightParts(
  text?: string,
  keyword?: string
): EncryptHighlightPart[] {
  const content = text || '';
  const trimmedKeyword = keyword?.trim() || '';
  if (!content || !trimmedKeyword) {
    return [{ text: content, highlight: false }];
  }

  const lowerContent = content.toLowerCase();
  const lowerKeyword = trimmedKeyword.toLowerCase();
  const matchIndex = lowerContent.indexOf(lowerKeyword);
  if (matchIndex === -1) {
    return [{ text: content, highlight: false }];
  }

  const parts: EncryptHighlightPart[] = [];
  let startIndex = 0;
  let currentMatchIndex = matchIndex;

  while (currentMatchIndex !== -1) {
    if (currentMatchIndex > startIndex) {
      parts.push({
        text: content.slice(startIndex, currentMatchIndex),
        highlight: false,
      });
    }
    parts.push({
      text: content.slice(
        currentMatchIndex,
        currentMatchIndex + trimmedKeyword.length
      ),
      highlight: true,
    });
    startIndex = currentMatchIndex + trimmedKeyword.length;
    currentMatchIndex = lowerContent.indexOf(lowerKeyword, startIndex);
  }

  if (startIndex < content.length) {
    parts.push({ text: content.slice(startIndex), highlight: false });
  }

  return parts;
}

function applyPermutation(
  plain: string,
  table: Map<string, string>
): { text: string; charMap: Map<string, string> } {
  const charMap = new Map<string, string>();
  let cipherText = '';

  for (const char of plain) {
    const cipherChar = table.get(char);
    if (!cipherChar) {
      cipherText += char;
      continue;
    }
    charMap.set(char, cipherChar);
    cipherText += cipherChar;
  }

  return { text: cipherText, charMap };
}

export function toCodePoints(text: string): string {
  return [...text]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
    })
    .join(' ');
}

export async function prepareEncryptedText(
  plainText: string,
  userId: string,
  keyword?: string
): Promise<{
  text: string;
  fontFamily: string;
  parts: EncryptHighlightPart[];
  charMap: Map<string, string>;
}> {
  const plain = plainText ?? '';
  const uid = userId || 'guest';
  const plainParts = getKeywordHighlightParts(plain, keyword);
  const empty = {
    text: plain,
    fontFamily: '',
    parts: plainParts,
    charMap: new Map<string, string>(),
  };

  if (!plain) return { ...empty, text: '' };

  const [baseFont, table] = await Promise.all([
    loadBaseFont(),
    getPermutationTable(uid),
  ]);
  if (!baseFont || !table.size) return empty;

  const { text: cipherText, charMap } = applyPermutation(plain, table);
  if (!charMap.size) return empty;

  const fontFamily = await createMappedFont(baseFont, charMap, uid);
  if (!fontFamily) return empty;

  const parts = plainParts.map((part) => ({
    highlight: part.highlight,
    text: applyPermutation(part.text, table).text,
  }));

  return { text: cipherText, fontFamily, parts, charMap };
}
