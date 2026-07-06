import { Fragment, useState, type ComponentType, type SVGProps } from 'react'
import { Tab } from '@headlessui/react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  BoltIcon,
  ChartBarIcon,
  SunIcon,
  PowerIcon,
  Battery50Icon,
  TruckIcon,
  FireIcon,
  Squares2X2Icon,
  SignalIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline'
import { PageHeader } from '@/components/PageHeader'
import { DataState } from '@/components/common/DataState'
import { EmptyState } from '@/components/common/EmptyState'
import { DataTable, type Column } from '@/components/common/DataTable'
import { LiveBadge } from '@/components/common/LiveBadge'
import { CloudBadge } from '@/components/common/CloudBadge'
import { SolarProductionStatusBadge } from '@/components/common/SolarProductionStatusBadge'
import { DeviceDetailDrawer, type DeviceDetail } from './DeviceDetailDrawer'
import { useContextStore } from '@/store/context'
import { useTelemetryStore } from '@/store/telemetry'
import { cn } from '@/utils/cn'
import { formatBoxCode } from '@/utils/sparky'
import type { TelemetryKind, TelemetryTarget } from '@/features/telemetry/types'

import { useVehicleControllerGetVehiclesForAddressV2 } from '@/api/generated/vehicles/vehicles'
import { useChargerControllerGetChargersForAddressV2 } from '@/api/generated/chargers/chargers'
import { useSolarInvertersControllerListV2 } from '@/api/generated/solar-inverters/solar-inverters'
import { useSmartMetersControllerGetSmartMetersForAddressV2 } from '@/api/generated/smart-meters/smart-meters'
import { useHvacControllerGetHvacsForAddressV2 } from '@/api/generated/hvacs/hvacs'
import { useBatteryControllerGetBatteriesForAddressV2 } from '@/api/generated/batteries/batteries'
import { useGridConnectionControllerGetGridConnectionsForAddressV2 } from '@/api/generated/grid-connections/grid-connections'

interface TabModel {
  key: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  rows: any[]
  isLoading?: boolean
  error?: unknown
  onRetry?: () => void
  telemetry?: TelemetryKind
  cols?: Column<any>[]
  /** Field used as the device id for row keys and the telemetry target. */
  idField: string
  emptyMessage?: string
}

export function DevicesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { addressUuid, addressRecord, addressSerial } = useContextStore()
  const a = addressUuid ?? ''
  const enabled = { query: { enabled: !!addressUuid } }
  const [detail, setDetail] = useState<DeviceDetail | null>(null)

  const vehicles = useVehicleControllerGetVehiclesForAddressV2(a, enabled)
  const chargers = useChargerControllerGetChargersForAddressV2(a, enabled)
  const solar = useSolarInvertersControllerListV2(a, enabled)
  const meters = useSmartMetersControllerGetSmartMetersForAddressV2(a, enabled)
  const hvacs = useHvacControllerGetHvacsForAddressV2(a, enabled)
  const batteries = useBatteryControllerGetBatteriesForAddressV2(a, enabled)
  const grid = useGridConnectionControllerGetGridConnectionsForAddressV2(a, enabled)

  const setTelemetry = useTelemetryStore((s) => s.setTarget)
  const goTelemetry = (target: TelemetryTarget) => {
    setTelemetry(target)
    navigate('/telemetry')
  }

  // A "Live" badge column for steerable assets that stream realtime data.
  const liveCol = (isLive: (row: any) => boolean): Column<any> => ({
    key: '__live',
    header: '',
    render: (row) => (isLive(row) ? <LiveBadge /> : null),
  })
  const solarSteerable = (r: any) => r.info?.isSteerable === true || r.info?.liveDataSupported === true
  const chargerSteerable = (r: any) => r.isSteerable === true || r.liveDataSupported === true

  const tabs: TabModel[] = [
    {
      key: 'solarInverters',
      icon: SunIcon,
      rows: solar.data?.results ?? [],
      isLoading: solar.isLoading,
      error: solar.error,
      onRetry: solar.refetch,
      telemetry: 'solar',
      idField: 'identifier',
      cols: [
        { key: 'identifier', header: 'identifier' },
        { key: 'brand', header: 'brand', render: (r) => r.info?.brand ?? '—' },
        { key: 'model', header: 'model', render: (r) => r.info?.model ?? '—' },
        {
          key: '__production',
          header: 'production',
          render: (r) => (
            <SolarProductionStatusBadge
              lastProductionState={r.lastProductionState}
              isSteerable={r.info?.isSteerable === true}
            />
          ),
        },
        {
          key: '__live',
          header: '',
          render: (r) => (solarSteerable(r) ? <LiveBadge /> : <CloudBadge />),
        },
      ],
    },
    {
      key: 'smartMeters',
      icon: BoltIcon,
      rows: meters.data?.results ?? [],
      isLoading: meters.isLoading,
      error: meters.error,
      onRetry: meters.refetch,
      telemetry: 'smartMeter',
      idField: 'identifier',
      cols: [
        { key: 'identifier', header: 'identifier' },
        { key: 'smartMeterType', header: 'type' },
        { key: 'meterNumber', header: 'meter no.' },
        { key: 'eanElectricity', header: 'EAN elec' },
      ],
    },
    {
      key: 'chargers',
      icon: PowerIcon,
      rows: chargers.data?.results ?? [],
      isLoading: chargers.isLoading,
      error: chargers.error,
      onRetry: chargers.refetch,
      telemetry: 'charger',
      idField: 'identifier',
      cols: [
        { key: 'identifier', header: 'identifier' },
        { key: 'brand', header: 'brand' },
        { key: 'model', header: 'model' },
        { key: 'year', header: 'year' },
        liveCol(chargerSteerable),
      ],
    },
    { key: 'batteries', icon: Battery50Icon, rows: batteries.data?.results ?? [], isLoading: batteries.isLoading, error: batteries.error, onRetry: batteries.refetch, idField: 'identifier' },
    {
      key: 'vehicles',
      icon: TruckIcon,
      rows: vehicles.data?.results ?? [],
      isLoading: vehicles.isLoading,
      error: vehicles.error,
      onRetry: vehicles.refetch,
      idField: 'identifier',
      cols: [
        { key: 'identifier', header: 'identifier' },
        { key: 'brand', header: 'brand', render: (r) => r.info?.brand ?? '—' },
        { key: 'model', header: 'model', render: (r) => r.info?.model ?? '—' },
      ],
    },
    { key: 'hvacs', icon: FireIcon, rows: hvacs.data?.results ?? [], isLoading: hvacs.isLoading, error: hvacs.error, onRetry: hvacs.refetch, idField: 'identifier' },
    { key: 'gridConnections', icon: Squares2X2Icon, rows: grid.data?.results ?? [], isLoading: grid.isLoading, error: grid.error, onRetry: grid.refetch, idField: 'identifier' },
    // Address-level connected units (from the selected address record).
    {
      key: 'sparky',
      icon: SignalIcon,
      rows: addressRecord?.sparky ? [addressRecord.sparky] : [],
      telemetry: 'sparky',
      idField: 'serialNumber',
      emptyMessage: t('devices.emptySparky'),
      cols: [
        { key: 'serialNumber', header: 'serial' },
        { key: 'boxCode', header: 'box code', render: (r) => formatBoxCode(r.boxCode) },
      ],
    },
    { key: 'flint', icon: CpuChipIcon, rows: addressRecord?.flint ? [addressRecord.flint] : [], idField: 'serialNumber', emptyMessage: t('devices.emptyFlint') },
  ]

  const openDetail = (tab: TabModel, row: any) => {
    const id = row[tab.idField]
    // Cloud (non-steerable) inverters serve production via interval aggregation.
    const steerable =
      tab.telemetry === 'solar'
        ? row.info?.isSteerable === true || row.info?.liveDataSupported === true
        : undefined
    setDetail({
      record: row,
      category: t(`devices.${tab.key}`),
      deviceId: id ?? row.uuid ?? '—',
      telemetry: tab.telemetry
        ? { kind: tab.telemetry, addressUuid: a, identifier: id, label: id, steerable }
        : undefined,
    })
  }

  if (!addressUuid) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t('devices.eyebrow')} title={t('devices.title')} hideInspector />
        <EmptyState title={t('devices.selectAddressFirst')} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('devices.eyebrow')}
        title={t('devices.title')}
        subtitle={t('devices.subtitle')}
        primaryCall={{ method: 'GET', url: `/api/v2/addresses/${a}/solar-inverters` }}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-secondary"
              onClick={() =>
                goTelemetry({ kind: 'addressEnergy', addressUuid: a, identifier: a, label: t('telemetry.addressEnergy') })
              }
            >
              <ChartBarIcon className="size-4" />
              {t('devices.viewEnergy')}
            </button>
            {addressSerial && (
              <button
                className="btn-secondary"
                onClick={() =>
                  goTelemetry({ kind: 'sparky', addressUuid: a, identifier: addressSerial, label: addressSerial })
                }
              >
                <BoltIcon className="size-4" />
                {t('devices.sparky')}
              </button>
            )}
          </div>
        }
      />

      <p className="text-13 text-text-gray">{t('devices.detailsHint')}</p>

      <Tab.Group>
        <Tab.List className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-thin sm:mx-0 sm:w-full sm:overflow-visible sm:px-0 sm:pb-0">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <Tab key={tab.key} as={Fragment}>
                {({ selected }) => (
                  <button
                    title={t(`devices.${tab.key}`)}
                    className={cn(
                      'flex shrink-0 items-center justify-center gap-1 rounded-full px-3 py-1.5 text-11 font-semibold transition-colors focus:outline-none sm:min-w-0 sm:flex-1 sm:px-2',
                      selected ? 'bg-dark-blue text-beige' : 'bg-white text-text-gray hover:bg-beige border border-beige-2',
                    )}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    <span className="truncate">{t(`devices.tab.${tab.key}`)}</span>
                    <span className="opacity-60">{tab.rows.length}</span>
                  </button>
                )}
              </Tab>
            )
          })}
        </Tab.List>
        <Tab.Panels className="mt-4">
          {tabs.map((tab) => (
            <Tab.Panel key={tab.key} className="card p-5">
              <DataState
                isLoading={tab.isLoading}
                error={tab.error}
                isEmpty={tab.rows.length === 0}
                emptyMessage={tab.emptyMessage ?? t('devices.empty')}
                onRetry={tab.onRetry}
              >
                <DataTable
                  rows={tab.rows}
                  columns={tab.cols}
                  rowKey={(r, i) => r[tab.idField] ?? r.uuid ?? String(i)}
                  onRowClick={(row) => openDetail(tab, row)}
                />
              </DataState>
            </Tab.Panel>
          ))}
        </Tab.Panels>
      </Tab.Group>

      <DeviceDetailDrawer detail={detail} onClose={() => setDetail(null)} onTelemetry={goTelemetry} />
    </div>
  )
}
