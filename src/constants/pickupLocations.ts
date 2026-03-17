// ============================================================================
// FILE: src/constants/pickupLocations.ts
// MODULE: Huy Anh ERP — Constants
// DESCRIPTION: Danh sach dia diem chot hang (pickup locations) + DRC du kien
// DONG BO VOI: b2b-portal/src/constants/pickupLocations.ts
// V2: Them Thai Lan, Campuchia, DRC du kien theo vung
// ============================================================================

export interface PickupLocation {
  code: string
  value: string
  label: string
  region: string
  country: string
  default_drc: number
}

export const PICKUP_LOCATIONS: PickupLocation[] = [
  // ============================================
  // VIET NAM
  // ============================================

  // Thua Thien Hue
  { code: 'VN-HUE-PD', value: 'phong_dien', label: 'Phong Dien, Hue', region: 'hue', country: 'vietnam', default_drc: 32.0 },
  { code: 'VN-HUE-AL', value: 'a_luoi', label: 'A Luoi, Hue', region: 'hue', country: 'vietnam', default_drc: 28.5 },
  { code: 'VN-HUE-ND', value: 'nam_dong', label: 'Nam Dong, Hue', region: 'hue', country: 'vietnam', default_drc: 30.0 },
  { code: 'VN-HUE-HT', value: 'huong_tra', label: 'Huong Tra, Hue', region: 'hue', country: 'vietnam', default_drc: 31.5 },
  { code: 'VN-HUE-HT2', value: 'huong_thuy', label: 'Huong Thuy, Hue', region: 'hue', country: 'vietnam', default_drc: 31.0 },

  // Quang Tri
  { code: 'VN-QT-CL', value: 'cam_lo', label: 'Cam Lo, Quang Tri', region: 'quang_tri', country: 'vietnam', default_drc: 33.0 },
  { code: 'VN-QT-GL', value: 'gio_linh', label: 'Gio Linh, Quang Tri', region: 'quang_tri', country: 'vietnam', default_drc: 32.5 },
  { code: 'VN-QT-VL', value: 'vinh_linh', label: 'Vinh Linh, Quang Tri', region: 'quang_tri', country: 'vietnam', default_drc: 31.0 },
  { code: 'VN-QT-DK', value: 'dakrong', label: 'Dakrong, Quang Tri', region: 'quang_tri', country: 'vietnam', default_drc: 29.0 },
  { code: 'VN-QT-HH', value: 'huong_hoa', label: 'Huong Hoa, Quang Tri', region: 'quang_tri', country: 'vietnam', default_drc: 28.0 },
  { code: 'VN-QT-TH', value: 'trieu_hai', label: 'Trieu Hai, Quang Tri', region: 'quang_tri', country: 'vietnam', default_drc: 32.0 },

  // Quang Binh
  { code: 'VN-QB-BT', value: 'bo_trach', label: 'Bo Trach, Quang Binh', region: 'quang_binh', country: 'vietnam', default_drc: 30.5 },
  { code: 'VN-QB-LT', value: 'le_thuy', label: 'Le Thuy, Quang Binh', region: 'quang_binh', country: 'vietnam', default_drc: 31.0 },
  { code: 'VN-QB-QN', value: 'quang_ninh_qb', label: 'Quang Ninh, Quang Binh', region: 'quang_binh', country: 'vietnam', default_drc: 30.0 },

  // ============================================
  // LAO
  // ============================================
  { code: 'LA-SVK', value: 'savannakhet', label: 'Savannakhet, Lao', region: 'savannakhet', country: 'laos', default_drc: 35.0 },
  { code: 'LA-SLV', value: 'salavan', label: 'Salavan, Lao', region: 'salavan', country: 'laos', default_drc: 34.5 },
  { code: 'LA-SKG', value: 'sekong', label: 'Sekong, Lao', region: 'sekong', country: 'laos', default_drc: 33.0 },
  { code: 'LA-ATP', value: 'attapeu', label: 'Attapeu, Lao', region: 'attapeu', country: 'laos', default_drc: 34.0 },
  { code: 'LA-CPS', value: 'champasak', label: 'Champasak, Lao', region: 'champasak', country: 'laos', default_drc: 35.5 },
  { code: 'LA-KHM', value: 'khammouane', label: 'Khammouane, Lao', region: 'khammouane', country: 'laos', default_drc: 33.5 },

  // ============================================
  // THAI LAN
  // ============================================
  { code: 'TH-UBN', value: 'ubon_ratchathani', label: 'Ubon Ratchathani, Thai Lan', region: 'ubon', country: 'thailand', default_drc: 36.0 },
  { code: 'TH-MKD', value: 'mukdahan', label: 'Mukdahan, Thai Lan', region: 'mukdahan', country: 'thailand', default_drc: 35.0 },
  { code: 'TH-NKP', value: 'nakhon_phanom', label: 'Nakhon Phanom, Thai Lan', region: 'nakhon_phanom', country: 'thailand', default_drc: 34.5 },
  { code: 'TH-SKN', value: 'sakon_nakhon', label: 'Sakon Nakhon, Thai Lan', region: 'sakon_nakhon', country: 'thailand', default_drc: 34.0 },
  { code: 'TH-NKR', value: 'nakhon_ratchasima', label: 'Nakhon Ratchasima, Thai Lan', region: 'nakhon_ratchasima', country: 'thailand', default_drc: 35.5 },

  // ============================================
  // CAMPUCHIA
  // ============================================
  { code: 'KH-STG', value: 'stung_treng', label: 'Stung Treng, Campuchia', region: 'stung_treng', country: 'cambodia', default_drc: 33.5 },
  { code: 'KH-RTK', value: 'ratanakiri', label: 'Ratanakiri, Campuchia', region: 'ratanakiri', country: 'cambodia', default_drc: 32.0 },
  { code: 'KH-MKR', value: 'mondulkiri', label: 'Mondulkiri, Campuchia', region: 'mondulkiri', country: 'cambodia', default_drc: 31.5 },
  { code: 'KH-KTM', value: 'kratie', label: 'Kratie, Campuchia', region: 'kratie', country: 'cambodia', default_drc: 33.0 },
  { code: 'KH-KPC', value: 'kampong_cham', label: 'Kampong Cham, Campuchia', region: 'kampong_cham', country: 'cambodia', default_drc: 34.0 },
  { code: 'KH-TBK', value: 'tboung_khmum', label: 'Tboung Khmum, Campuchia', region: 'tboung_khmum', country: 'cambodia', default_drc: 33.5 },

  // ============================================
  // KHAC
  // ============================================
  { code: 'OTHER', value: 'other', label: 'Khac (nhap tay)', region: 'other', country: 'other', default_drc: 30.0 },
]

export type PickupLocationValue = typeof PICKUP_LOCATIONS[number]['value']

export const COUNTRY_LABELS: Record<string, string> = {
  vietnam: 'Viet Nam',
  laos: 'Lao',
  thailand: 'Thai Lan',
  cambodia: 'Campuchia',
  other: 'Khac',
}

export const COUNTRY_FLAGS: Record<string, string> = {
  vietnam: '🇻🇳',
  laos: '🇱🇦',
  thailand: '🇹🇭',
  cambodia: '🇰🇭',
  other: '🌍',
}

export const REGION_LABELS: Record<string, string> = {
  // Vietnam
  hue: 'Thua Thien Hue',
  quang_tri: 'Quang Tri',
  quang_binh: 'Quang Binh',
  // Laos
  savannakhet: 'Savannakhet',
  salavan: 'Salavan',
  sekong: 'Sekong',
  attapeu: 'Attapeu',
  champasak: 'Champasak',
  khammouane: 'Khammouane',
  // Thailand
  ubon: 'Ubon Ratchathani',
  mukdahan: 'Mukdahan',
  nakhon_phanom: 'Nakhon Phanom',
  sakon_nakhon: 'Sakon Nakhon',
  nakhon_ratchasima: 'Nakhon Ratchasima',
  // Cambodia
  stung_treng: 'Stung Treng',
  ratanakiri: 'Ratanakiri',
  mondulkiri: 'Mondulkiri',
  kratie: 'Kratie',
  kampong_cham: 'Kampong Cham',
  tboung_khmum: 'Tboung Khmum',
  // Other
  other: 'Khac',
}

/** Lay danh sach dia diem theo quoc gia */
export const getLocationsByCountry = (country: string): PickupLocation[] => {
  return PICKUP_LOCATIONS.filter(l => l.country === country && l.value !== 'other')
}

/** Lay danh sach quoc gia (unique, khong bao gom 'other') */
export const getCountries = (): string[] => {
  return [...new Set(PICKUP_LOCATIONS.map(l => l.country).filter(c => c !== 'other'))]
}

/** Tim dia diem theo value */
export const findLocationByValue = (value: string): PickupLocation | undefined => {
  return PICKUP_LOCATIONS.find(l => l.value === value)
}

/** Tim dia diem theo code */
export const findLocationByCode = (code: string): PickupLocation | undefined => {
  return PICKUP_LOCATIONS.find(l => l.code === code)
}
