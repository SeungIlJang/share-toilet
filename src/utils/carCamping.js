export const CAR_CAMPING_OPTIONS = [
  { key: 'all', label: '전체' },
  { key: 'confirmed', label: '✅ 공식 확인' },
  { key: 'candidate', label: '⚠️ 확인 필요' },
  { key: 'prohibited', label: '⛔ 차박 금지' },
];

const STATUS_META = {
  confirmed: { key: 'confirmed', label: '공식 차박 가능', shortLabel: '차박 가능', color: '#2e7d32' },
  candidate: { key: 'candidate', label: '차박 후보 · 확인 필요', shortLabel: '확인 필요', color: '#ef6c00' },
  prohibited: { key: 'prohibited', label: '차박 금지 확인', shortLabel: '차박 금지', color: '#c62828' },
};

const normalizeStatus = (value) => {
  const status = String(value || '').toLowerCase();
  if (['confirmed', 'allowed', 'possible', 'yes'].includes(status)) return 'confirmed';
  if (['prohibited', 'forbidden', 'blocked', 'no'].includes(status)) return 'prohibited';
  if (['candidate', 'unknown', 'check'].includes(status)) return 'candidate';
  return null;
};

export const getCarCampingInfo = (location) => {
  const supplied = location.carCamping || {};
  const explicit = normalizeStatus(supplied.status || location.carCampingStatus);
  if (explicit) {
    return {
      ...STATUS_META[explicit],
      reason: supplied.reason || location.carCampingReason || '관리 데이터에서 확인된 정보',
      source: supplied.source || location.carCampingSource || null,
      checkedAt: supplied.checkedAt || location.carCampingCheckedAt || null,
    };
  }

  const text = [
    location.title,
    location.address,
    location.newAddress,
    location.note,
    location.description,
  ].filter(Boolean).join(' ');
  const hours = String(location.openHour || '');

  if (/(차박|야영|숙박|취사)\s*(금지|불가|단속)/.test(text)) {
    return { ...STATUS_META.prohibited, reason: '시설 안내에 차박·야영 관련 금지 문구가 있음', source: null, checkedAt: null };
  }

  const nearVehicleFacility = /(공영)?주차장|휴게소|캠핑장|야영장|오토캠핑/.test(text);
  const openAllDay = /24\s*시간|상시|00\s*[~\-]\s*24|00:00\s*[~\-]\s*24:00/.test(hours);
  if (nearVehicleFacility && openAllDay) {
    return {
      ...STATUS_META.candidate,
      reason: '24시간 화장실과 차량 이용 시설이 확인되지만 차박 허용 여부는 미확인',
      source: null,
      checkedAt: null,
    };
  }

  return null;
};

export const withCarCampingInfo = (locations) =>
  locations.map((location) => ({ ...location, carCamping: getCarCampingInfo(location) }));
