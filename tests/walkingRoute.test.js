import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWalkingRouteUrl, fetchWalkingRoute, formatRouteSummary } from '../src/utils/walkingRoute.js';

const stops = [
  { latitude: 37.5667, longitude: 126.9784 },
  { latitude: 37.57, longitude: 126.982 }
];

test('보행 경로 URL에 선택 순서대로 좌표를 넣는다', () => {
  assert.match(
    buildWalkingRouteUrl(stops),
    /126\.9784,37\.5667;126\.982,37\.57/
  );
});

test('경로 응답을 네이버 지도 좌표 형식으로 변환한다', async () => {
  const result = await fetchWalkingRoute(stops, async () => ({
    ok: true,
    json: async () => ({
      code: 'Ok',
      routes: [{
        distance: 951.4,
        duration: 761.2,
        geometry: { coordinates: [[126.9784, 37.5667], [126.982, 37.57]] }
      }]
    })
  }));

  assert.deepEqual(result.points[0], { latitude: 37.5667, longitude: 126.9784 });
  assert.equal(result.distanceMeters, 951);
  assert.equal(formatRouteSummary(result), '총 951m · 도보 약 13분');
});

test('경로보기는 음수대가 2곳 이상 필요하다', async () => {
  await assert.rejects(() => fetchWalkingRoute(stops.slice(0, 1)), /2곳 이상/);
});
