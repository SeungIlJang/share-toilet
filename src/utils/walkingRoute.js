const WALKING_ROUTER = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving';

export const buildWalkingRouteUrl = (stops) => {
  const coordinates = stops
    .map(({ latitude, longitude }) => `${Number(longitude)},${Number(latitude)}`)
    .join(';');

  return `${WALKING_ROUTER}/${coordinates}?overview=full&geometries=geojson&steps=false`;
};

export const fetchWalkingRoute = async (stops, fetchImpl = fetch) => {
  if (!Array.isArray(stops) || stops.length < 2) {
    throw new Error('경로를 보려면 음수대를 2곳 이상 선택해야 합니다.');
  }

  const response = await fetchImpl(buildWalkingRouteUrl(stops));
  if (!response.ok) throw new Error(`보행 경로 요청 실패 (${response.status})`);

  const data = await response.json();
  const route = data.routes?.[0];
  if (data.code !== 'Ok' || !route?.geometry?.coordinates?.length) {
    throw new Error('보행 경로를 찾지 못했습니다.');
  }

  return {
    points: route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
    distanceMeters: Math.round(route.distance || 0),
    durationSeconds: Math.round(route.duration || 0)
  };
};

export const formatRouteSummary = ({ distanceMeters, durationSeconds }) => {
  const distance = distanceMeters < 1000
    ? `${distanceMeters}m`
    : `${(distanceMeters / 1000).toFixed(1)}km`;
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  return `총 ${distance} · 도보 약 ${minutes}분`;
};
