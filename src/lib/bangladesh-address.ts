import bdAddressData from '../data/bangladesh-addresses.json' with { type: 'json' };

type RawUpazila =
  | string
  | {
      name?: string | null;
    };

type RawDistrict = {
  name?: string | null;
  upazilas?: RawUpazila[] | null;
};

type RawDivision = {
  name?: string | null;
  districts?: RawDistrict[] | null;
};

type NormalizedDistrict = {
  name: string;
  upazilas: string[];
};

type NormalizedDivision = {
  name: string;
  districts: NormalizedDistrict[];
};

const normalizeName = (value: unknown) => String(value || '').trim();

const normalizeUpazilas = (upazilas: RawUpazila[] | null | undefined) =>
  Array.from(
    new Set(
      (upazilas || [])
        .map((item) => (typeof item === 'string' ? item : item?.name || ''))
        .map(normalizeName)
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));

const normalizedDivisions: NormalizedDivision[] = ((bdAddressData as { divisions?: RawDivision[] }).divisions || [])
  .map((division) => ({
    name: normalizeName(division.name),
    districts: (division.districts || [])
      .map((district) => ({
        name: normalizeName(district.name),
        upazilas: normalizeUpazilas(district.upazilas),
      }))
      .filter((district) => district.name)
      .sort((left, right) => left.name.localeCompare(right.name)),
  }))
  .filter((division) => division.name)
  .sort((left, right) => left.name.localeCompare(right.name));

export function getDivisionOptions() {
  return normalizedDivisions.map((division) => division.name);
}

export function getDistrictOptions(divisionName: string) {
  const division = normalizedDivisions.find((entry) => entry.name === divisionName);
  return division?.districts.map((district) => district.name) || [];
}

export function getUpazilaOptions(divisionName: string, districtName: string) {
  const division = normalizedDivisions.find((entry) => entry.name === divisionName);
  const district = division?.districts.find((entry) => entry.name === districtName);
  return district?.upazilas || [];
}

export function buildBangladeshAddressLine(input: {
  address?: string | null;
  upazila?: string | null;
  district?: string | null;
  division?: string | null;
}) {
  return [input.address, input.upazila, input.district, input.division].filter(Boolean).join(', ');
}
