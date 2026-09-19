const REGION_ALIASES = {
  서울: '서울특별시',
  부산: '부산광역시',
  대구: '대구광역시',
  인천: '인천광역시',
  광주: '광주광역시',
  대전: '대전광역시',
  울산: '울산광역시',
  세종: '세종특별자치시',
  경기: '경기도',
  강원: '강원특별자치도',
  충북: '충청북도',
  충남: '충청남도',
  전북: '전북특별자치도',
  전남: '전라남도',
  경북: '경상북도',
  경남: '경상남도',
  제주: '제주특별자치도',
};

const text = (value) => typeof value === 'string' ? value.toLowerCase() : '';

export const matchesToiletSearch = (toilet, query) => {
  const tokens = text(query).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;

  const searchable = [
    toilet?.title,
    toilet?.sido,
    toilet?.address,
    toilet?.newAddress,
  ].map(text).filter(Boolean).join(' ');

  return tokens.every((token) => {
    const expanded = REGION_ALIASES[token] || token;
    return searchable.includes(token) || searchable.includes(expanded.toLowerCase());
  });
};
