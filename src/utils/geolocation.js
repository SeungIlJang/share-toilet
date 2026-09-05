import { Capacitor } from '@capacitor/core';

// 크로스 플랫폼 현재 위치 조회
// - 네이티브(Android/iOS): @capacitor/geolocation (권한 요청 포함)
// - 웹: 브라우저 navigator.geolocation
// 반환: Promise<{ latitude, longitude }>
export async function getCurrentPosition(options = {}) {
  const { enableHighAccuracy = true, timeout = 8000 } = options;

  if (Capacitor.isNativePlatform()) {
    const { Geolocation } = await import('@capacitor/geolocation');

    let perm = await Geolocation.checkPermissions();
    if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
      perm = await Geolocation.requestPermissions({ permissions: ['location'] });
    }
    if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
      throw new Error('위치 권한이 거부되었습니다');
    }

    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy, timeout });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  }

  // 웹
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation을 지원하지 않는 브라우저입니다'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy, timeout }
    );
  });
}
