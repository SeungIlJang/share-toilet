import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const indexPath = join(process.cwd(), 'dist', 'index.html');
const indexHtml = await readFile(indexPath, 'utf8');
const unresolvedVariables = [...indexHtml.matchAll(/%VITE_[A-Z0-9_]+%/g)].map(([value]) => value);

if (unresolvedVariables.length > 0) {
  throw new Error(`배포 빌드에 주입되지 않은 환경 변수가 있습니다: ${[...new Set(unresolvedVariables)].join(', ')}`);
}

const mapScript = indexHtml.match(/<script[^>]+src="([^"]*oapi\.map\.naver\.com[^"]*)"/i)?.[1];

if (!mapScript) {
  throw new Error('배포 빌드에서 네이버 지도 스크립트를 찾을 수 없습니다.');
}

const mapUrl = new URL(mapScript);
const clientId = mapUrl.searchParams.get('ncpKeyId');

if (!clientId || !/^[a-z0-9]+$/i.test(clientId)) {
  throw new Error('배포 빌드의 네이버 지도 Client ID가 유효하지 않습니다.');
}

console.log('[build-check] production HTML environment variables are valid');
