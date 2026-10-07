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
const RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 120_000, 300_000]
const isAndroidApp = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
const liveAdsEnabled = import.meta.env.PROD && import.meta.env.VITE_ADMOB_LIVE !== 'false'
const bannerId = liveAdsEnabled
  ? import.meta.env.VITE_ADMOB_BANNER_ID || PRODUCTION_BANNER_ID
  : TEST_BANNER_ID

let initialized = false
let initializing = false
let listenersRegistered = false
let retryAttempt = 0
let retryTimer = null

const setBannerSpace = (height = 0) => {
  document.documentElement.style.setProperty('--admob-banner-height', `${Math.max(0, height)}px`)
}

const bannerOptions = {
  adId: bannerId,
  adSize: BannerAdSize.ADAPTIVE_BANNER,
  position: BannerAdPosition.BOTTOM_CENTER,
  margin: 0,
  isTesting: !liveAdsEnabled,
}

const scheduleRetry = () => {
  if (retryTimer || retryAttempt >= RETRY_DELAYS_MS.length) return
  const delay = RETRY_DELAYS_MS[retryAttempt]
  retryAttempt += 1
  retryTimer = window.setTimeout(() => {
    retryTimer = null
    if (initialized) {
      void showBanner()
    } else {
      void initializeAdMob()
    }
  }, delay)
}

const showBanner = async () => {
  try {
    await AdMob.showBanner(bannerOptions)
  } catch (error) {
    console.warn('[admob] 배너 요청 실패:', error)
    setBannerSpace(RESERVED_BANNER_HEIGHT)
    scheduleRetry()
  }
}

const registerBannerListeners = async () => {
  if (listenersRegistered) return

  await AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
    retryAttempt = 0
    if (retryTimer) window.clearTimeout(retryTimer)
    retryTimer = null
    console.info('[admob] 배너 로드 완료')
  })
  await AdMob.addListener(BannerAdPluginEvents.SizeChanged, ({ height }) => {
    setBannerSpace(height || RESERVED_BANNER_HEIGHT)
  })
  await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (error) => {
    console.warn('[admob] 배너 로드 실패:', error)
    setBannerSpace(RESERVED_BANNER_HEIGHT)
    scheduleRetry()
  })
  listenersRegistered = true
}

export const initializeAdMob = async () => {
  if (!isAndroidApp) return
  setBannerSpace(RESERVED_BANNER_HEIGHT)
  if (initialized || initializing) return
  initializing = true

  try {
    await AdMob.initialize({
      initializeForTesting: !liveAdsEnabled,
      maxAdContentRating: MaxAdContentRating.General,
    })

    let consentInfo = await AdMob.requestConsentInfo()
    if (consentInfo.isConsentFormAvailable && consentInfo.status === AdmobConsentStatus.REQUIRED) {
      consentInfo = await AdMob.showConsentForm()
    }

    if (consentInfo.status === AdmobConsentStatus.REQUIRED) {
      console.info('[admob] 광고 동의가 완료되지 않아 배너 요청을 보류합니다.')
      return
    }

    await registerBannerListeners()
    initialized = true
    await showBanner()
  } catch (error) {
    console.warn('[admob] 초기화 실패:', error)
    initialized = false
    setBannerSpace(RESERVED_BANNER_HEIGHT)
    scheduleRetry()
  } finally {
    initializing = false
  }
}
