// ============================================================================
// RubberRegionPicker — Chọn vùng mủ với search + bản đồ
// API: Nominatim (OpenStreetMap) — miễn phí
// Map: Leaflet + react-leaflet — miễn phí
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react'
import { Input, Tag, Typography, Spin } from 'antd'
import { SearchOutlined, EnvironmentOutlined, CloseOutlined } from '@ant-design/icons'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const { Text } = Typography

// Fix Leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// ============================================================================
// TYPES
// ============================================================================

export interface RubberRegion {
  name: string
  lat?: number
  lng?: number
}

interface RubberRegionPickerProps {
  value?: RubberRegion
  onChange: (region: RubberRegion) => void
}

// ============================================================================
// POPULAR REGIONS
// ============================================================================

const POPULAR_REGIONS: RubberRegion[] = [
  // Đông Nam Bộ
  { name: 'Bình Phước', lat: 11.7512, lng: 106.7235 },
  { name: 'Tây Ninh', lat: 11.3555, lng: 106.1099 },
  { name: 'Đồng Nai', lat: 11.0686, lng: 107.1676 },
  { name: 'Bình Dương', lat: 11.1702, lng: 106.6291 },
  // Tây Nguyên
  { name: 'Gia Lai', lat: 13.9908, lng: 108.0004 },
  { name: 'Đắk Lắk', lat: 12.7100, lng: 108.2378 },
  { name: 'Kon Tum', lat: 14.3500, lng: 108.0000 },
  // Miền Trung
  { name: 'Quảng Trị', lat: 16.7500, lng: 107.1854 },
  { name: 'TT Huế', lat: 16.4637, lng: 107.5909 },
  // Lào
  { name: 'Savannakhet, Lào', lat: 16.5536, lng: 104.7528 },
  // Campuchia
  { name: 'Kampong Cham', lat: 11.9964, lng: 105.4583 },
]

// ============================================================================
// NOMINATIM SEARCH
// ============================================================================

interface NominatimResult {
  display_name: string
  lat: string
  lon: string
}

let searchTimeout: ReturnType<typeof setTimeout>

async function searchNominatim(query: string): Promise<NominatimResult[]> {
  if (query.length < 2) return []
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(query)}&format=json&countrycodes=vn,la,th,kh&limit=5&accept-language=vi`,
      { headers: { 'User-Agent': 'HuyAnhB2B/1.0' } }
    )
    return res.json()
  } catch {
    return []
  }
}

// ============================================================================
// MAP SUB-COMPONENTS
// ============================================================================

function FlyToLocation({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo([lat, lng], 11, { duration: 0.8 })
  }, [map, lat, lng])
  return null
}

function MapClickHandler({ onSelect }: { onSelect: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onSelect(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function RubberRegionPicker({ value, onChange }: RubberRegionPickerProps) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<NominatimResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const handleSearch = useCallback((q: string) => {
    setSearch(q)
    setShowResults(true)
    clearTimeout(searchTimeout)
    if (q.length < 2) { setResults([]); return }
    searchTimeout = setTimeout(async () => {
      setSearching(true)
      const data = await searchNominatim(q)
      setResults(data)
      setSearching(false)
    }, 500) // debounce 500ms (Nominatim limit 1req/s)
  }, [])

  const handleSelectResult = (result: NominatimResult) => {
    const name = result.display_name.split(',').slice(0, 3).join(',').trim()
    onChange({ name, lat: parseFloat(result.lat), lng: parseFloat(result.lon) })
    setSearch('')
    setResults([])
    setShowResults(false)
    setShowMap(true)
  }

  const handleSelectPopular = (region: RubberRegion) => {
    onChange(region)
    setShowMap(true)
  }

  const handleMapClick = async (lat: number, lng: number) => {
    // Reverse geocode
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=vi`,
        { headers: { 'User-Agent': 'HuyAnhB2B/1.0' } }
      )
      const data = await res.json()
      const name = data.display_name?.split(',').slice(0, 3).join(',').trim() || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
      onChange({ name, lat, lng })
    } catch {
      onChange({ name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng })
    }
  }

  const handleClear = () => {
    onChange({ name: '' })
    setSearch('')
    setShowMap(false)
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={wrapperRef}>
      {/* Label */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
          <EnvironmentOutlined style={{ color: '#52c41a', marginRight: 4 }} />
          Vùng mủ
        </Text>
        {showMap && (
          <Text
            style={{ fontSize: 12, cursor: 'pointer' }}
            onClick={() => setShowMap(!showMap)}
          >
            {showMap ? 'Ẩn bản đồ' : 'Hiện bản đồ'}
          </Text>
        )}
      </div>

      {/* Search input */}
      <div style={{ position: 'relative' }}>
        <Input
          value={value?.name ? '' : search}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => setShowResults(true)}
          placeholder={value?.name || 'Tìm vùng mủ...'}
          prefix={<SearchOutlined style={{ color: '#999' }} />}
          suffix={searching ? <Spin size="small" /> : value?.name ? (
            <CloseOutlined style={{ color: '#999', cursor: 'pointer' }} onClick={handleClear} />
          ) : null}
          size="large"
        />

        {/* Search results dropdown */}
        {showResults && results.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
            background: '#fff', border: '1px solid #d9d9d9', borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto',
            marginTop: 4,
          }}>
            {results.map((r, i) => (
              <div
                key={i}
                onClick={() => handleSelectResult(r)}
                style={{
                  padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5',
                  fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f5f5')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
              >
                <EnvironmentOutlined style={{ color: '#52c41a', marginTop: 2 }} />
                <span>{r.display_name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected value */}
      {value?.name && (
        <div style={{
          marginTop: 6, padding: '6px 10px', background: '#f6ffed',
          borderRadius: 8, border: '1px solid #b7eb8f',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <EnvironmentOutlined style={{ color: '#52c41a' }} />
          <Text style={{ fontSize: 13, flex: 1 }}>{value.name}</Text>
          {value.lat && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {value.lat.toFixed(4)}, {value.lng?.toFixed(4)}
            </Text>
          )}
          <CloseOutlined style={{ color: '#999', cursor: 'pointer', fontSize: 12 }} onClick={handleClear} />
        </div>
      )}

      {/* Popular regions — chỉ hiện khi chưa chọn */}
      {!value?.name && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {POPULAR_REGIONS.map(r => (
            <Tag
              key={r.name}
              onClick={() => handleSelectPopular(r)}
              style={{ cursor: 'pointer', borderRadius: 12, fontSize: 12 }}
            >
              {r.name}
            </Tag>
          ))}
        </div>
      )}

      {/* Map */}
      {showMap && value?.lat && value?.lng && (
        <div style={{ marginTop: 8, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
          <MapContainer
            center={[value.lat, value.lng]}
            zoom={11}
            style={{ height: 180, width: '100%' }}
            scrollWheelZoom={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={[value.lat, value.lng]} />
            <FlyToLocation lat={value.lat} lng={value.lng} />
            <MapClickHandler onSelect={handleMapClick} />
          </MapContainer>
        </div>
      )}

      {/* Toggle map button */}
      {value?.name && !showMap && (
        <Text
          style={{ fontSize: 12, cursor: 'pointer', display: 'block', marginTop: 4, color: '#1677ff' }}
          onClick={() => setShowMap(true)}
        >
          🗺️ Hiện bản đồ
        </Text>
      )}
    </div>
  )
}
