import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { decideUpdateAction } from '../utils/updateDecision.js';

const UPDATE_ORIGIN = 'https://seungiljang.github.io';
const UPDATE_PATH_PREFIX = '/share-toilet/live-update/';
const MANIFEST_URL = `${UPDATE_ORIGIN}/share-toilet/live-update/manifest.json`;
const CHECK_TIMEOUT_MS = 7000;
const UPDATE_STATUS_EVENT = 'share-toilet:update-status';

const reportStatus = (status, message = '') => {
  window.dispatchEvent(new CustomEvent(UPDATE_STATUS_EVENT, {
    detail: { status, message },
  }));
};

// 업데이트 화면이 실제로 한 프레임 이상 표시된 뒤 WebView를 교체한다.
const waitForStatusPaint = () => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
});

const fetchManifest = async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
};

const validateManifest = (manifest) => {
  if (!manifest || typeof manifest.version !== 'string') return false;
  if (!/^web-[a-f0-9]{16}$/.test(manifest.version)) return false;
  if (!/^[a-f0-9]{64}$/.test(manifest.checksum || '')) return false;

  try {
    const url = new URL(manifest.url);
    return url.origin === UPDATE_ORIGIN && url.pathname.startsWith(UPDATE_PATH_PREFIX);
  } catch {
    return false;
  }
};

export async function startLiveUpdate() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    reportStatus('checking', '업데이트 확인 중...');

    // 새 번들이 여기까지 실행됐다면 정상으로 확정한다. 호출하지 않으면 자동 롤백된다.
    await CapacitorUpdater.notifyAppReady();

    const manifest = await fetchManifest();
    if (!validateManifest(manifest)) throw new Error('잘못된 업데이트 정보');

    const [{ bundle: current }, queued] = await Promise.all([
      CapacitorUpdater.current(),
      CapacitorUpdater.getNextBundle(),
    ]);

    const action = decideUpdateAction({
      currentVersion: current.version,
      queuedVersion: queued?.version,
      targetVersion: manifest.version,
    });

    if (action === 'none') {
      reportStatus('ready');
      return;
    }

    // 이미 내려받은 번들이 적용 대기 중이면 그대로 방치하지 않고 즉시 전환한다.
    if (action === 'reload') {
      console.info(`[update] 대기 중인 ${manifest.version} 즉시 적용`);
      reportStatus('applying', '업데이트 적용 중...');
      await waitForStatusPaint();
      await CapacitorUpdater.reload();
      return;
    }

    reportStatus('downloading', '업데이트 다운로드 중...');
    const bundle = await CapacitorUpdater.download({
      version: manifest.version,
      url: manifest.url,
      checksum: manifest.checksum,
    });

    // set()은 새 번들을 현재 버전으로 바꾸고 WebView를 즉시 다시 불러온다.
    // 이 호출은 현재 JavaScript 실행 컨텍스트를 종료하므로 뒤에 로직을 두지 않는다.
    console.info(`[update] ${manifest.version} 다운로드 완료, 즉시 적용`);
    reportStatus('applying', '업데이트 적용 중...');
    await waitForStatusPaint();
    await CapacitorUpdater.set({ id: bundle.id });
  } catch (error) {
    // 네트워크/서버 문제는 앱 사용을 막지 않는다. 현재 정상 번들을 그대로 유지한다.
    console.info('[update] 확인 생략:', error?.message || error);
    reportStatus('ready');
  }
}
