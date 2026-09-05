import fs from 'node:fs';
import iconv from 'iconv-lite';

// 인코딩 자동 감지(UTF-8 BOM / UTF-8 / CP949) 후 문자열
export function readCsvText(file) {
  const buf = fs.readFileSync(file);
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.slice(3).toString('utf8');
  const utf8 = buf.toString('utf8');
  if (/화장실|소재지|주소/.test(utf8)) return utf8;
  return iconv.decode(buf, 'cp949');
}

// CSV 파서 (따옴표/줄바꿈 처리)
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}

// 헤더 이름 부분일치 컬럼 파인더
export function makeColFinder(header) {
  const norm = header.map((h) => h.replace(/\s|_|-/g, ''));
  return (...cands) => {
    for (const cand of cands) {
      const key = cand.replace(/\s|_|-/g, '');
      const idx = norm.findIndex((h) => h.includes(key));
      if (idx !== -1) return idx;
    }
    return -1;
  };
}

// .env 에서 키 읽기 (VITE_ 접두 상관없이)
export function readEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

// 지오코딩용 주소 (도로명 우선, 없으면 지번)
export function pickAddress(road, jibun) {
  const r = String(road ?? '').trim();
  const j = String(jibun ?? '').trim();
  return r || j;
}
