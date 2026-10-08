import { Capacitor } from '@capacitor/core'
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  MaxAdContentRating,
} from '@capacitor-community/admob'

const TEST_BANNER_ID = 'ca-app-pub-3940256099942544/6300978111'
const PRODUCTION_BANNER_ID = 'ca-app-pub-9017259597860535/1002068317'
const RESERVED_BANNER_HEIGHT = 60
const isAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
const liveAdsEnabled = import.meta.env.VITE_ADMOB_LIVE !== 'false'
const testAdsEnabled = import.meta.env.DEV || import.meta.env.VITE_ADMOB_TEST === 'true'
const configuredBannerId = import.meta.env.VITE_ADMOB_BANNER_ID || PRODUCTION_BANNER_ID
const bannerId = liveAdsEnabled ? configuredBannerId : TEST_BANNER_ID
const adsEnabled = testAdsEnabled || (liveAdsEnabled && Boolean(configuredBannerId))
export const ADMOB_STATUS_EVENT = 'share-toilet:admob-status'

let initialized = false

const emitAdMobStatus = (stage, message, level = 'info', details = {}) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ADMOB_STATUS_EVENT, {
    detail: {
      stage,
      message,
      level,
      timestamp: new Date().toISOString(),
      ...details,
    },
  }))
}

const describeError = (error) => {
  if (!error) return '알 수 없는 오류'
  const code = error.code != null ? `코드 ${error.code}: ` : ''
  return `${code}${error.message || String(error)}`
}

const setBannerSpace = (height = 0) => {
  document.documentElement.style.setProperty('--admob-banner-height', `${Math.max(0, height)}px`)
}

export const initializeAdMob = async () => {
  if (!isAndroidApp()) {
    emitAdMobStatus('unsupported', '웹 환경에서는 AdMob을 실행하지 않습니다.', 'muted')
    return
  }

  // 광고가 늦게 로드되거나 요청에 실패해도 화면이 배너와 겹치지 않게 한다.
  setBannerSpace(RESERVED_BANNER_HEIGHT)
  if (initialized) {
    emitAdMobStatus('ready', 'AdMob이 이미 초기화되어 있습니다.', 'success')
    return
  }
  if (!adsEnabled) {
    emitAdMobStatus('disabled', '광고가 비활성화되어 있습니다.', 'warning')
    return
  }

  try {
    emitAdMobStatus('initializing', 'AdMob SDK 초기화 중…')
    await AdMob.initialize({
      initializeForTesting: testAdsEnabled,
      maxAdContentRating: MaxAdContentRating.General,
    })
    emitAdMobStatus('initialized', `AdMob SDK 초기화 완료 · ${testAdsEnabled ? '테스트 광고' : '운영 광고'}`)

    emitAdMobStatus('consent-check', '광고 동의 상태 확인 중…')
    let consentInfo = await AdMob.requestConsentInfo()
    emitAdMobStatus('consent-status', `광고 동의 상태: ${consentInfo.status}`)
    if (consentInfo.isConsentFormAvailable && consentInfo.status === AdmobConsentStatus.REQUIRED) {
      emitAdMobStatus('consent-form', '광고 동의 화면 표시 중…')
      consentInfo = await AdMob.showConsentForm()
      emitAdMobStatus('consent-result', `광고 동의 결과: ${consentInfo.status}`)
    }

    if (consentInfo.status === AdmobConsentStatus.REQUIRED) {
      emitAdMobStatus('consent-required', '광고 동의가 완료되지 않아 배너 요청을 중단했습니다.', 'warning')
      return
    }

    await AdMob.addListener(BannerAdPluginEvents.SizeChanged, ({ height }) => {
      setBannerSpace(height || RESERVED_BANNER_HEIGHT)
      emitAdMobStatus('banner-size', `배너 표시 영역 확인 · 높이 ${height || RESERVED_BANNER_HEIGHT}px`, 'success')
    })
    await AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
      emitAdMobStatus('banner-loaded', '배너 광고 로드 성공 · 흔들기 설정 수신 가능', 'success')
    })
    await AdMob.addListener(
      BannerAdPluginEvents.FailedToLoad,
      (error) => {
        setBannerSpace(RESERVED_BANNER_HEIGHT)
        emitAdMobStatus('banner-failed', `배너 광고 로드 실패 · ${describeError(error)}`, 'error')
      },
    )
    emitAdMobStatus('banner-request', '배너 광고 요청 중…')
    await AdMob.showBanner({
      adId: bannerId,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: testAdsEnabled,
    })
    initialized = true
  } catch (error) {
    setBannerSpace(RESERVED_BANNER_HEIGHT)
    emitAdMobStatus('error', `AdMob 처리 실패 · ${describeError(error)}`, 'error')
  }
}
