import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, MapPin, Loader2, Search, X } from 'lucide-react';
import {
  LocationOption,
  PhilippineHierarchySelection,
  getPhilippineRegions,
  getProvincesByRegionName,
  getCitiesByProvinceName,
  getBarangaysByCityName,
  normalizeRegionName,
} from '../utils/philippineLocations';
import { Location } from '../types';

interface SearchableDropdownProps {
  label: string;
  required?: boolean;
  value: string;
  options: LocationOption[];
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
  searchPlaceholder: string;
  emptyText?: string;
  onSelect: (name: string) => void;
}

const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
  label,
  required = false,
  value,
  options,
  placeholder,
  disabled = false,
  loading = false,
  searchPlaceholder,
  emptyText = 'No matching locations found',
  onSelect,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
      setSearchTerm('');
    }
  }, [disabled]);

  const filteredOptions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return options.slice(0, 100);
    return options.filter((opt) => opt.name.toLowerCase().includes(q)).slice(0, 120);
  }, [options, searchTerm]);

  const isTruncated = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return options.length > 100;
    return options.filter((opt) => opt.name.toLowerCase().includes(q)).length > 120;
  }, [options, searchTerm]);

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && '*'}
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        className={`w-full p-2.5 border rounded-lg text-sm flex items-center justify-between text-left transition-colors ${
          disabled
            ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-white border-gray-200 text-gray-900 hover:border-agri-green-400 focus:outline-none focus:ring-2 focus:ring-agri-green-500'
        }`}
      >
        <span className={value ? 'text-gray-900 font-medium truncate' : 'text-gray-400 truncate'}>
          {loading ? 'Loading PSGC data...' : value || placeholder}
        </span>
        {loading ? (
          <Loader2 size={15} className="animate-spin text-agri-green-600 shrink-0 ml-2" />
        ) : (
          <ChevronDown size={15} className="text-gray-400 shrink-0 ml-2" />
        )}
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-40 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl p-2">
          <div className="relative mb-2">
            <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              className="w-full pl-8 pr-7 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-agri-green-500 focus:border-agri-green-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {loading ? (
              <div className="py-4 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Loading locations...
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-xs text-gray-500">{emptyText}</div>
            ) : (
              <>
                {filteredOptions.map((opt) => {
                  const selected = value.toLowerCase() === opt.name.toLowerCase();
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      onClick={() => {
                        onSelect(opt.name);
                        setIsOpen(false);
                        setSearchTerm('');
                      }}
                      className={`w-full text-left px-2.5 py-1.5 text-xs rounded flex items-center justify-between transition-colors ${
                        selected
                          ? 'bg-agri-green-50 font-semibold text-agri-green-800'
                          : 'text-gray-700 hover:bg-agri-green-50/70 hover:text-agri-green-900'
                      }`}
                    >
                      <span className="truncate">{opt.name}</span>
                      {selected && <Check size={14} className="text-agri-green-600 shrink-0 ml-2" />}
                    </button>
                  );
                })}
                {isTruncated && (
                  <p className="px-2.5 py-1.5 text-[11px] text-gray-400 italic border-t border-gray-100">
                    Type in the search box to narrow down more results...
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface LocationSelectorProps {
  value: PhilippineHierarchySelection;
  onChange: (next: PhilippineHierarchySelection) => void;
  disabled?: boolean;
  required?: boolean;
}

/**
 * Cascading Philippine administrative location selector:
 * Region -> Province -> City/Municipality -> Barangay
 * Parent changes automatically clear dependent child selections.
 */
export const LocationSelector: React.FC<LocationSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  required = true,
}) => {
  const [regions, setRegions] = useState<LocationOption[]>([]);
  const [provinces, setProvinces] = useState<LocationOption[]>([]);
  const [cities, setCities] = useState<LocationOption[]>([]);
  const [barangays, setBarangays] = useState<LocationOption[]>([]);
  const [loadingLevel, setLoadingLevel] = useState<'region' | 'province' | 'city' | 'barangay' | null>(null);
  const [loadError, setLoadError] = useState('');

  const normalizedRegion = normalizeRegionName(value.region);

  useEffect(() => {
    let active = true;
    setLoadingLevel('region');
    getPhilippineRegions()
      .then((list) => {
        if (active) {
          setRegions(list);
          setLoadError('');
        }
      })
      .catch(() => {
        if (active) setLoadError('Unable to load Philippine PSGC regions.');
      })
      .finally(() => {
        if (active) setLoadingLevel(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!normalizedRegion) {
      setProvinces([]);
      return;
    }
    setLoadingLevel('province');
    getProvincesByRegionName(normalizedRegion)
      .then((list) => {
        if (active) setProvinces(list);
      })
      .finally(() => {
        if (active) setLoadingLevel(null);
      });
    return () => {
      active = false;
    };
  }, [normalizedRegion]);

  useEffect(() => {
    let active = true;
    if (!normalizedRegion || !value.province) {
      setCities([]);
      return;
    }
    setLoadingLevel('city');
    getCitiesByProvinceName(normalizedRegion, value.province)
      .then((list) => {
        if (active) setCities(list);
      })
      .finally(() => {
        if (active) setLoadingLevel(null);
      });
    return () => {
      active = false;
    };
  }, [normalizedRegion, value.province]);

  useEffect(() => {
    let active = true;
    if (!normalizedRegion || !value.province || !value.city) {
      setBarangays([]);
      return;
    }
    setLoadingLevel('barangay');
    getBarangaysByCityName(normalizedRegion, value.province, value.city)
      .then((list) => {
        if (active) setBarangays(list);
      })
      .finally(() => {
        if (active) setLoadingLevel(null);
      });
    return () => {
      active = false;
    };
  }, [normalizedRegion, value.province, value.city]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-agri-green-800">
          <MapPin size={13} />
          <span>Philippine Administrative Location Hierarchy</span>
        </div>
        <span className="text-[11px] text-gray-500">PSGC Reference (All 18 Regions)</span>
      </div>

      {loadError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">
          {loadError}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SearchableDropdown
          label="Region"
          required={required}
          value={normalizedRegion}
          options={regions}
          placeholder="Select Region"
          searchPlaceholder="Search region (e.g. Caraga, Northern Mindanao)..."
          disabled={disabled}
          loading={loadingLevel === 'region'}
          onSelect={(regionName) => {
            onChange({
              region: regionName,
              province: '',
              city: '',
              barangay: '',
            });
          }}
        />

        <SearchableDropdown
          label="Province"
          required={required}
          value={value.province}
          options={provinces}
          placeholder={normalizedRegion ? 'Select Province' : 'Select a Region first'}
          searchPlaceholder="Search province..."
          disabled={disabled || !normalizedRegion}
          loading={loadingLevel === 'province'}
          onSelect={(provinceName) => {
            onChange({
              region: normalizedRegion,
              province: provinceName,
              city: '',
              barangay: '',
            });
          }}
        />

        <SearchableDropdown
          label="City / Municipality"
          required={required}
          value={value.city}
          options={cities}
          placeholder={value.province ? 'Select City or Municipality' : 'Select a Province first'}
          searchPlaceholder="Search city or municipality..."
          disabled={disabled || !normalizedRegion || !value.province}
          loading={loadingLevel === 'city'}
          onSelect={(cityName) => {
            onChange({
              region: normalizedRegion,
              province: value.province,
              city: cityName,
              barangay: '',
            });
          }}
        />

        <SearchableDropdown
          label="Barangay"
          required={required}
          value={value.barangay}
          options={barangays}
          placeholder={value.city ? 'Select Barangay' : 'Select a City/Municipality first'}
          searchPlaceholder="Search barangay..."
          disabled={disabled || !normalizedRegion || !value.province || !value.city}
          loading={loadingLevel === 'barangay'}
          onSelect={(barangayName) => {
            onChange({
              region: normalizedRegion,
              province: value.province,
              city: value.city,
              barangay: barangayName,
            });
          }}
        />
      </div>
    </div>
  );
};

interface LocationFilterValue {
  region: string;
  province: string;
  city: string;
  barangay: string;
}

interface LocationFilterSelectsProps {
  locations: Location[];
  value: LocationFilterValue;
  onChange: (next: LocationFilterValue) => void;
  compact?: boolean;
}

/**
 * Cascading location filter bar derived from active system locations,
 * clearing child filter levels when a parent level changes.
 */
export const LocationFilterSelects: React.FC<LocationFilterSelectsProps> = ({
  locations,
  value,
  onChange,
  compact = false,
}) => {
  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    locations.forEach((l) => {
      const r = normalizeRegionName(l.region);
      if (r) set.add(r);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [locations]);

  const provinceOptions = useMemo(() => {
    const set = new Set<string>();
    locations.forEach((l) => {
      const r = normalizeRegionName(l.region);
      if (value.region !== 'ALL' && r !== value.region) return;
      if (l.province) set.add(l.province);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [locations, value.region]);

  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    locations.forEach((l) => {
      const r = normalizeRegionName(l.region);
      if (value.region !== 'ALL' && r !== value.region) return;
      if (value.province !== 'ALL' && l.province !== value.province) return;
      if (l.city) set.add(l.city);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [locations, value.region, value.province]);

  const barangayOptions = useMemo(() => {
    const set = new Set<string>();
    locations.forEach((l) => {
      const r = normalizeRegionName(l.region);
      if (value.region !== 'ALL' && r !== value.region) return;
      if (value.province !== 'ALL' && l.province !== value.province) return;
      if (value.city !== 'ALL' && l.city !== value.city) return;
      if (l.barangay) set.add(l.barangay);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [locations, value.region, value.province, value.city]);

  const selectClass = compact
    ? 'w-full p-2 border border-gray-200 rounded text-xs focus:ring-agri-green-500 focus:border-agri-green-500 bg-white'
    : 'w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-agri-green-500 focus:border-agri-green-500 bg-white';

  const labelClass = compact
    ? 'block text-[11px] font-semibold text-gray-600 mb-1'
    : 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <div className={compact ? 'space-y-2.5' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3'}>
      <div>
        <label className={labelClass}>Region</label>
        <select
          className={selectClass}
          value={value.region}
          onChange={(e) =>
            onChange({
              region: e.target.value,
              province: 'ALL',
              city: 'ALL',
              barangay: 'ALL',
            })
          }
        >
          <option value="ALL">All Regions</option>
          {regionOptions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Province</label>
        <select
          className={selectClass}
          value={value.province}
          disabled={provinceOptions.length === 0}
          onChange={(e) =>
            onChange({
              region: value.region,
              province: e.target.value,
              city: 'ALL',
              barangay: 'ALL',
            })
          }
        >
          <option value="ALL">All Provinces</option>
          {provinceOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>City / Municipality</label>
        <select
          className={selectClass}
          value={value.city}
          disabled={cityOptions.length === 0}
          onChange={(e) =>
            onChange({
              region: value.region,
              province: value.province,
              city: e.target.value,
              barangay: 'ALL',
            })
          }
        >
          <option value="ALL">All Cities / Municipalities</option>
          {cityOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Barangay</label>
        <select
          className={selectClass}
          value={value.barangay}
          disabled={barangayOptions.length === 0}
          onChange={(e) =>
            onChange({
              ...value,
              barangay: e.target.value,
            })
          }
        >
          <option value="ALL">All Barangays</option>
          {barangayOptions.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
