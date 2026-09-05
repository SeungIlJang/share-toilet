// 화장실 상태(사용가능/비밀번호/잠김/사용못함)를 파일로 관리
// - 네이티브: 앱 데이터 디렉터리의 실제 파일(toilet-status.json)
// - 웹: Capacitor Filesystem 웹 구현(IndexedDB)로 동일 API 동작
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

const FILE = 'toilet-status.json';
const opts = { path: FILE, directory: Directory.Data, encoding: Encoding.UTF8 };

// { [toiletId]: statusKey } 로드 (없으면 {})
export async function loadStatus() {
  try {
    const res = await Filesystem.readFile(opts);
    return JSON.parse(res.data || '{}') || {};
  } catch (e) {
    return {}; // 파일 없음 등
  }
}

// 상태 저장 (파일 덮어쓰기)
export async function saveStatus(map) {
  try {
    await Filesystem.writeFile({ ...opts, data: JSON.stringify(map), recursive: true });
  } catch (e) {
    console.warn('상태 저장 실패:', e?.message);
  }
}
