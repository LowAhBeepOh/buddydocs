// Markdown and Word (.docx) conversion. No dependencies: the zip container is
// written uncompressed and read with DecompressionStream.
import { sanitizeHtml, escapeHtml } from './sanitize.js';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ---------- zip helpers ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Writes an uncompressed (stored) zip. Office apps accept stored entries.
function buildZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 file names
    local.setUint16(8, 0, true); // stored
    local.setUint16(12, 0x21, true); // date 1980-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    localParts.push(new Uint8Array(local.buffer), name, file.data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(14, 0x21, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, size, true);
    central.setUint32(24, size, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    centralParts.push(new Uint8Array(central.buffer), name);

    offset += 30 + name.length + size;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  return new Blob([...localParts, ...centralParts, new Uint8Array(end.buffer)], { type: DOCX_MIME });
}

async function inflateEntry(bytes, method) {
  if (method === 0) return bytes;
  if (method === 8) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw new Error('Unsupported zip compression');
}

// Returns a Map of entry name -> Uint8Array.
async function readZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a valid zip file');

  const count = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map();

  for (let i = 0; i < count; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) throw new Error('Corrupt zip directory');
    const method = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
    pos += 46 + nameLength + extraLength + commentLength;

    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const data = await inflateEntry(bytes.subarray(dataStart, dataStart + compressedSize), method);
    entries.set(name, data);
  }
  return entries;
}

// ---------- HTML -> blocks (shared by Markdown and DOCX export) ----------

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'HR',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER',
  'FIGURE', 'FIGCAPTION', 'DL', 'DT', 'DD', 'ADDRESS'
]);

function collectInline(node, fmt, runs) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue.replace(/\s+/g, ' ');
    if (text) runs.push({ ...fmt, text });
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const tag = node.tagName;
  if (tag === 'BR') {
    runs.push({ br: true });
    return;
  }
  if (tag === 'IMG' || tag === 'SCRIPT' || tag === 'STYLE') return;

  const next = { ...fmt };
  if (tag === 'B' || tag === 'STRONG') next.b = true;
  if (tag === 'I' || tag === 'EM') next.i = true;
  if (tag === 'U' || tag === 'INS') next.u = true;
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') next.s = true;
  if (tag === 'CODE') next.mono = true;
  if (tag === 'A' && node.getAttribute('href')) next.href = node.getAttribute('href');
  for (const child of node.childNodes) collectInline(child, next, runs);
}

function trimRuns(runs) {
  const list = runs.map((run) => ({ ...run }));
  const isBlank = (run) => run.br || !run.text.trim();
  while (list.length && isBlank(list[0])) list.shift();
  while (list.length && isBlank(list[list.length - 1])) list.pop();
  if (list.length && list[0].text !== undefined) list[0].text = list[0].text.replace(/^\s+/, '');
  if (list.length && list[list.length - 1].text !== undefined) {
    list[list.length - 1].text = list[list.length - 1].text.replace(/\s+$/, '');
  }
  return list.filter((run) => run.br || run.text);
}

function collectBlocks(parent, ctx, out) {
  let runs = [];
  const flush = () => {
    const trimmed = trimRuns(runs);
    if (trimmed.length) out.push({ ...ctx, runs: trimmed });
    runs = [];
  };
  for (const node of parent.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.tagName)) {
      flush();
      blockElement(node, ctx, out);
    } else {
      collectInline(node, {}, runs);
    }
  }
  flush();
}

function blockElement(el, ctx, out) {
  const tag = el.tagName;
  if (/^H[1-6]$/.test(tag)) {
    collectBlocks(el, { ...ctx, heading: Number(tag[1]) }, out);
    return;
  }
  if (tag === 'UL' || tag === 'OL') {
    const depth = ctx.list ? (ctx.depth || 0) + 1 : 0;
    let num = 0;
    for (const child of el.children) {
      if (child.tagName === 'LI') {
        num++;
        collectBlocks(child, { ...ctx, list: tag === 'OL' ? 'ol' : 'ul', num, depth }, out);
      } else {
        blockElement(child, ctx, out);
      }
    }
    return;
  }
  if (tag === 'BLOCKQUOTE') {
    collectBlocks(el, { ...ctx, quote: true }, out);
    return;
  }
  if (tag === 'PRE') {
    const lines = el.textContent.replace(/\n$/, '').split('\n');
    const runs = [];
    lines.forEach((line, i) => {
      if (i) runs.push({ br: true });
      runs.push({ text: line, mono: true });
    });
    out.push({ ...ctx, mono: true, runs });
    return;
  }
  if (tag === 'HR') {
    out.push({ rule: true });
    return;
  }
  collectBlocks(el, ctx, out);
}

function htmlToBlocks(html) {
  const tmp = document.createElement('template');
  tmp.innerHTML = sanitizeHtml(html || '');
  const blocks = [];
  collectBlocks(tmp.content, {}, blocks);
  return blocks;
}

// ---------- Markdown ----------

function escapeMarkdown(text) {
  return text.replace(/[\\`*_[\]~]/g, '\\$&');
}

function wrapMarkdown(text, marker) {
  const parts = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return parts[2] ? `${parts[1]}${marker}${parts[2]}${marker}${parts[3]}` : text;
}

function runsToMarkdown(runs) {
  return runs.map((run) => {
    if (run.br) return '  \n';
    if (run.mono) return `\`${run.text}\``;
    let text = escapeMarkdown(run.text);
    if (run.href) text = `[${text}](${run.href.replace(/[\s()]/g, encodeURIComponent)})`;
    if (run.s) text = wrapMarkdown(text, '~~');
    if (run.i) text = wrapMarkdown(text, '*');
    if (run.b) text = wrapMarkdown(text, '**');
    return text;
  }).join('');
}

function blockToMarkdown(block) {
  if (block.rule) return '---';
  if (block.mono) {
    return `\`\`\`\n${block.runs.map((run) => (run.br ? '\n' : run.text)).join('')}\n\`\`\``;
  }
  const text = runsToMarkdown(block.runs).trim();
  if (!text) return '';
  if (block.heading) return `${'#'.repeat(block.heading)} ${text.replace(/\s*\n\s*/g, ' ')}`;
  const indent = '  '.repeat(block.depth || 0);
  if (block.list === 'ul') return `${indent}- ${text}`;
  if (block.list === 'ol') return `${indent}${block.num}. ${text}`;
  if (block.quote) return text.split('\n').map((line) => `> ${line}`).join('\n');
  return text;
}

export function htmlToMarkdown(html) {
  let result = '';
  let prev = null;
  for (const block of htmlToBlocks(html)) {
    const text = blockToMarkdown(block);
    if (!text) continue;
    if (result) result += prev?.list && block.list && !block.heading ? '\n' : '\n\n';
    result += text;
    prev = block;
  }
  return result;
}

function inlineMarkdown(text) {
  const codes = [];
  let s = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(((?:https?:|mailto:)[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`)
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/\*([^*\s][^*]*)\*/g, '<em>$1</em>')
    .replace(/(^|\W)_([^_]+)_(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

export function markdownToHtml(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let paragraph = [];
  let quote = [];
  let listTag = null;
  let fence = null;

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote><p>${inlineMarkdown(quote.join(' '))}</p></blockquote>`);
    quote = [];
  };
  const closeList = () => {
    if (listTag) out.push(`</${listTag}>`);
    listTag = null;
  };
  const flushAll = () => {
    flushParagraph();
    flushQuote();
    closeList();
  };

  for (const line of lines) {
    if (fence) {
      if (/^\s*```/.test(line)) {
        out.push(`<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`);
        fence = null;
      } else {
        fence.push(line);
      }
      continue;
    }
    if (/^\s*```/.test(line)) {
      flushAll();
      fence = [];
      continue;
    }

    const quoteMatch = line.match(/^\s*>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      closeList();
      quote.push(quoteMatch[1]);
      continue;
    }
    flushQuote();

    if (!line.trim()) {
      flushAll();
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (heading) {
      flushAll();
      const n = heading[1].length;
      out.push(`<h${n}>${inlineMarkdown(heading[2].replace(/\s+#+\s*$/, ''))}</h${n}>`);
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushAll();
      out.push('<hr>');
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || ordered) {
      flushParagraph();
      const tag = bullet ? 'ul' : 'ol';
      if (listTag !== tag) {
        closeList();
        out.push(`<${tag}>`);
        listTag = tag;
      }
      out.push(`<li>${inlineMarkdown((bullet || ordered)[1])}</li>`);
      continue;
    }

    closeList();
    paragraph.push(line.trim());
  }

  if (fence) out.push(`<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`);
  flushAll();
  return sanitizeHtml(out.join('\n'));
}

// ---------- DOCX export ----------

function xmlEscape(value) {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function runToDocxXml(run) {
  if (run.br) return '<w:r><w:br/></w:r>';
  const rPr = [];
  if (run.mono) rPr.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>');
  if (run.b) rPr.push('<w:b/>');
  if (run.i) rPr.push('<w:i/>');
  if (run.s) rPr.push('<w:strike/>');
  if (run.u) rPr.push('<w:u w:val="single"/>');
  const props = rPr.length ? `<w:rPr>${rPr.join('')}</w:rPr>` : '';
  return `<w:r>${props}<w:t xml:space="preserve">${xmlEscape(run.text)}</w:t></w:r>`;
}

function blockToDocxXml(block) {
  if (block.rule) {
    return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>';
  }
  const pPr = [];
  if (block.heading) pPr.push(`<w:pStyle w:val="Heading${Math.min(block.heading, 3)}"/>`);

  let runs = block.runs;
  if (block.list) {
    const left = 360 * ((block.depth || 0) + 1) + (block.quote ? 720 : 0);
    pPr.push(`<w:ind w:left="${left}" w:hanging="360"/>`);
    const marker = block.list === 'ol' ? `${block.num}. ` : '• ';
    runs = [{ text: marker }, ...runs];
  } else if (block.quote) {
    pPr.push('<w:ind w:left="720"/>');
  }

  const body = runs.map((run) => runToDocxXml(block.mono ? { ...run, mono: true } : run)).join('');
  return `<w:p>${pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : ''}${body}</w:p>`;
}

const PAGE_BREAK_XML = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

const STYLES_XML = `${XML_HEADER}
<w:styles xmlns:w="${W_NS}"><w:docDefaults/>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
</w:styles>`;

const CONTENT_TYPES_XML = `${XML_HEADER}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

const ROOT_RELS_XML = `${XML_HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const DOCUMENT_RELS_XML = `${XML_HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

// pagesHtml: array of HTML strings, one per page. Returns a .docx Blob.
export async function htmlPagesToDocx(pagesHtml) {
  const parts = [];
  pagesHtml.forEach((html, i) => {
    if (i > 0) parts.push(PAGE_BREAK_XML);
    parts.push(...htmlToBlocks(html).map(blockToDocxXml));
  });
  if (!parts.length) parts.push('<w:p/>');

  const documentXml = `${XML_HEADER}
<w:document xmlns:w="${W_NS}"><w:body>${parts.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const encoder = new TextEncoder();
  return buildZip([
    { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES_XML) },
    { name: '_rels/.rels', data: encoder.encode(ROOT_RELS_XML) },
    { name: 'word/document.xml', data: encoder.encode(documentXml) },
    { name: 'word/styles.xml', data: encoder.encode(STYLES_XML) },
    { name: 'word/_rels/document.xml.rels', data: encoder.encode(DOCUMENT_RELS_XML) }
  ]);
}

// ---------- DOCX import ----------

function readRunFormat(run) {
  const rPr = run.getElementsByTagNameNS(W_NS, 'rPr')[0];
  const flag = (name) => {
    const el = rPr?.getElementsByTagNameNS(W_NS, name)[0];
    if (!el) return false;
    return !['0', 'false', 'none'].includes(el.getAttributeNS(W_NS, 'val'));
  };
  return { b: flag('b'), i: flag('i'), u: flag('u'), s: flag('strike') };
}

function formatRunHtml(text, fmt) {
  let html = escapeHtml(text);
  if (!html) return '';
  if (fmt.s) html = `<s>${html}</s>`;
  if (fmt.u) html = `<u>${html}</u>`;
  if (fmt.i) html = `<em>${html}</em>`;
  if (fmt.b) html = `<strong>${html}</strong>`;
  return html;
}

// Returns an array of sanitized HTML strings, one per page (split on hard page breaks).
export async function docxToPages(buffer) {
  const entries = await readZip(buffer);
  const xmlBytes = entries.get('word/document.xml');
  if (!xmlBytes) throw new Error('Not a valid .docx file');

  const xml = new DOMParser().parseFromString(new TextDecoder().decode(xmlBytes), 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error('Could not read the Word document');

  const pages = [];
  let current = [];
  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      current.push('</ul>');
      listOpen = false;
    }
  };
  const startNewPage = () => {
    closeList();
    pages.push(current.join(''));
    current = [];
  };

  for (const p of xml.getElementsByTagNameNS(W_NS, 'p')) {
    const styleEl = p.getElementsByTagNameNS(W_NS, 'pStyle')[0];
    const style = styleEl?.getAttributeNS(W_NS, 'val') || '';
    const headingMatch = /^heading\s?([1-6])$/i.exec(style);
    const level = headingMatch ? Math.min(Number(headingMatch[1]), 3) : (/^title$/i.test(style) ? 1 : 0);
    const isItem = p.getElementsByTagNameNS(W_NS, 'numPr').length > 0;

    let body = '';
    let sawPageBreak = false;
    const emit = () => {
      if (isItem) {
        if (!listOpen) {
          current.push('<ul>');
          listOpen = true;
        }
        current.push(`<li>${body || '<br>'}</li>`);
      } else {
        closeList();
        if (level) {
          if (body) current.push(`<h${level}>${body}</h${level}>`);
        } else {
          current.push(body ? `<p>${body}</p>` : '<p><br></p>');
        }
      }
    };

    for (const run of p.getElementsByTagNameNS(W_NS, 'r')) {
      const fmt = readRunFormat(run);
      for (const node of run.children) {
        if (node.namespaceURI !== W_NS) continue;
        if (node.localName === 't') {
          body += formatRunHtml(node.textContent, fmt);
        } else if (node.localName === 'tab') {
          body += formatRunHtml('\t', fmt);
        } else if (node.localName === 'cr') {
          body += '<br>';
        } else if (node.localName === 'br') {
          if (node.getAttributeNS(W_NS, 'type') === 'page') {
            sawPageBreak = true;
            if (body) emit();
            body = '';
            startNewPage();
          } else {
            body += '<br>';
          }
        }
      }
    }

    if (!(sawPageBreak && !body)) emit();
  }

  closeList();
  pages.push(current.join(''));

  const sanitized = pages.map((html) => sanitizeHtml(html)).filter((html) => html);
  return sanitized.length ? sanitized : [''];
}
