import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { addressesAPI, devicesAPI } from '../services/api';
import './SteerableInverters.css';
import './DevicesDetails.css';
import './GroupSolarAnalytics.css';

const extractResults = (data) => (Array.isArray(data) ? data : data?.results || []);

/** Integer minutes since lastProductionState.time (null if missing/invalid). */
const getMinutesSinceReport = (dateString) => {
  if (!dateString) return null;
  try {
    const t = new Date(dateString).getTime();
    if (Number.isNaN(t)) return null;
    return Math.floor((Date.now() - t) / 60000);
  } catch {
    return null;
  }
};

const formatMinutesAgo = (dateString) => {
  const minutes = getMinutesSinceReport(dateString);
  if (minutes === null) return null;
  if (minutes < 0) return 'just now';
  if (minutes === 0) return '0 min ago';
  return `${minutes} min ago`;
};

const formatLocalDateTime = (dateString) => {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
};

const formatBoolish = (v) => {
  if (v === true || v === false) return v ? 'Yes' : 'No';
  if (v === undefined || v === null) return '—';
  return String(v);
};

const escapeCsvCell = (val) => {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const boolishForCsv = (v) => {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  if (v === undefined || v === null) return '';
  return String(v);
};

const GroupSolarAnalytics = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const group = location.state?.group;

  const [inverters, setInverters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [jsonModalOpen, setJsonModalOpen] = useState(false);
  const [selectedDeviceJson, setSelectedDeviceJson] = useState(null);
  const [copiedAddressUuid, setCopiedAddressUuid] = useState(null);

  const [filterIsSteerable, setFilterIsSteerable] = useState('all');
  const [filterLiveDataSupported, setFilterLiveDataSupported] = useState('all');
  /** 'any' | 'atLeast' | 'atMost' */
  const [reportMinutesMode, setReportMinutesMode] = useState('any');
  const [reportMinutesInput, setReportMinutesInput] = useState('');

  const fetchAllSolarInverters = useCallback(async () => {
    if (!group?.uuid) return;

    setLoading(true);
    setError('');

    try {
      const MAX_ADDRESSES = 1000;
      const firstPageData = await addressesAPI.getAddresses(group.uuid, { offset: 0, limit: 1 });
      const totalAddresses = firstPageData?.meta?.total || 0;
      const addressesToProcess = Math.min(totalAddresses, MAX_ADDRESSES);

      const batchSize = 100;
      const batches = Math.ceil(addressesToProcess / batchSize);
      const allAddresses = [];
      const addressUuidSet = new Set();

      for (let i = 0; i < batches; i++) {
        const offset = i * batchSize;
        const limit = Math.min(batchSize, addressesToProcess - offset);
        const batchData = await addressesAPI.getAddresses(group.uuid, { offset, limit });
        const batchResults = batchData?.results || [];
        batchResults.forEach((address) => {
          if (address.uuid && !addressUuidSet.has(address.uuid)) {
            addressUuidSet.add(address.uuid);
            allAddresses.push(address);
          }
        });
      }

      const deviceBatchSize = 50;
      const deviceBatches = Math.ceil(allAddresses.length / deviceBatchSize);
      const collected = [];
      const inverterKeySet = new Set();

      for (let i = 0; i < deviceBatches; i++) {
        const batchStart = i * deviceBatchSize;
        const batchEnd = Math.min(batchStart + deviceBatchSize, allAddresses.length);
        const addressBatch = allAddresses.slice(batchStart, batchEnd);

        const inverterFetches = addressBatch.map((address) =>
          devicesAPI.getSolarInverters(address.uuid).catch(() => null)
        );

        const batchResults = await Promise.allSettled(inverterFetches);

        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            try {
              const data = result.value;
              const list = extractResults(data);
              list.forEach((inverter) => {
                const addressUuid = addressBatch[index].uuid;
                const inverterKey = `${inverter.identifier || inverter.uuid}-${addressUuid}`;
                if (!inverterKeySet.has(inverterKey)) {
                  inverterKeySet.add(inverterKey);
                  collected.push({
                    ...inverter,
                    addressUuid,
                    address: addressBatch[index],
                  });
                }
              });
            } catch (err) {
              console.error('Error processing inverter data:', err);
            }
          }
        });
      }

      const sorted = collected.sort((a, b) => {
        const getMostRecentTime = (inv) => {
          const productionTime = inv.lastProductionState?.time
            ? new Date(inv.lastProductionState.time).getTime()
            : 0;
          const lastSeenTime = inv.info?.lastSeen ? new Date(inv.info.lastSeen).getTime() : 0;
          return Math.max(productionTime, lastSeenTime);
        };
        return getMostRecentTime(b) - getMostRecentTime(a);
      });

      setInverters(sorted);
    } catch (err) {
      console.error('Error fetching solar inverters:', err);
      setError(err.message || 'Failed to fetch solar inverters');
    } finally {
      setLoading(false);
    }
  }, [group?.uuid]);

  useEffect(() => {
    if (group) {
      fetchAllSolarInverters();
    } else {
      setError('No group selected');
      setLoading(false);
    }
  }, [group, fetchAllSolarInverters]);

  const filteredInverters = useMemo(() => {
    const x = parseInt(reportMinutesInput, 10);
    const timeFilterActive =
      reportMinutesMode !== 'any' && reportMinutesInput.trim() !== '' && !Number.isNaN(x) && x >= 0;

    return inverters.filter((inv) => {
      const steer = inv.info?.isSteerable;
      if (filterIsSteerable === 'yes' && steer !== true) return false;
      if (filterIsSteerable === 'no' && steer !== false) return false;

      const live = inv.info?.liveDataSupported;
      if (filterLiveDataSupported === 'yes' && live !== true) return false;
      if (filterLiveDataSupported === 'no' && live !== false) return false;

      if (timeFilterActive) {
        const mins = getMinutesSinceReport(inv.lastProductionState?.time);
        if (mins === null) return false;
        if (reportMinutesMode === 'atLeast' && mins < x) return false;
        if (reportMinutesMode === 'atMost' && mins > x) return false;
      }

      return true;
    });
  }, [
    inverters,
    filterIsSteerable,
    filterLiveDataSupported,
    reportMinutesMode,
    reportMinutesInput,
  ]);

  const handleBackToDashboard = () => {
    navigate('/dashboard');
  };

  const handleViewAddress = (e, inverter) => {
    e.stopPropagation();
    navigate('/devices-details', {
      state: {
        address: inverter.address,
        group,
      },
    });
  };

  const handleCopyAddressUuid = (e, addressUuid) => {
    e.stopPropagation();
    navigator.clipboard.writeText(addressUuid).then(() => {
      setCopiedAddressUuid(addressUuid);
      window.setTimeout(() => setCopiedAddressUuid(null), 2000);
    });
  };

  const openJsonModal = (e, inverter) => {
    e.stopPropagation();
    const { address, addressUuid, ...devicePayload } = inverter;
    setSelectedDeviceJson({
      ...devicePayload,
      addressUuid,
      address: address
        ? {
            uuid: address.uuid,
            street: address.street,
            city: address.city,
            postalCode: address.postalCode,
          }
        : undefined,
    });
    setJsonModalOpen(true);
  };

  const handleCloseJsonModal = () => {
    setJsonModalOpen(false);
    setSelectedDeviceJson(null);
  };

  const handleCopyJson = () => {
    if (selectedDeviceJson) {
      const jsonString = JSON.stringify(selectedDeviceJson, null, 2);
      navigator.clipboard.writeText(jsonString).catch((err) => {
        console.error('Failed to copy JSON:', err);
      });
    }
  };

  const handleExportCsv = () => {
    if (filteredInverters.length === 0) return;

    const headers = [
      'brand',
      'model',
      'siteName',
      'isSteerable',
      'liveDataSupported',
      'lastReportMinutesAgo',
      'lastReportLocalDateTime',
      'productionRate_W',
      'isProducing',
      'addressUuid',
      'deviceIdentifier',
    ];

    const lines = [
      headers.join(','),
      ...filteredInverters.map((inv) => {
        const lps = inv.lastProductionState;
        const row = [
          inv.info?.brand ?? '',
          inv.info?.model ?? '',
          inv.info?.siteName ?? '',
          boolishForCsv(inv.info?.isSteerable),
          boolishForCsv(inv.info?.liveDataSupported),
          lps?.time ? formatMinutesAgo(lps.time) ?? '' : '',
          lps?.time ? formatLocalDateTime(lps.time) : '',
          lps?.productionRate !== undefined && lps?.productionRate !== null ? lps.productionRate : '',
          lps ? (lps.isProducing ? 'Yes' : 'No') : '',
          inv.addressUuid ?? '',
          inv.identifier || inv.uuid || '',
        ];
        return row.map(escapeCsvCell).join(',');
      }),
    ];

    const csv = `\ufeff${lines.join('\r\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const slug = (group?.uuid || 'export').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 12);
    a.href = url;
    a.download = `solar-inverters-filtered-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!group) {
    return (
      <div className="steerable-inverters">
        <div className="error-state">
          <h2>No Group Information</h2>
          <p>Unable to load solar inverter analytics.</p>
          <button type="button" onClick={handleBackToDashboard} className="back-button">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="steerable-inverters">
      <header className="steerable-header">
        <div className="header-content">
          <button type="button" onClick={handleBackToDashboard} className="back-button">
            ← Back to Dashboard
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1>Solar inverter analytics</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--chargee-gray-600)', fontFamily: 'monospace' }}>
              {group.name} · {group.uuid}
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchAllSolarInverters()}
            disabled={loading}
            className="refresh-button"
            title="Refresh data"
          >
            🔄 Refresh
          </button>
        </div>
      </header>

      <main className="steerable-main">
        {error && <div className="error-banner">{error}</div>}

        {!loading && !error && inverters.length > 0 && (
          <>
            <div className="group-solar-analytics-filters" role="search" aria-label="Filter inverters">
              <div className="group-solar-analytics-filter-field">
                <label htmlFor="filter-is-steerable">isSteerable</label>
                <select
                  id="filter-is-steerable"
                  className="group-solar-analytics-select"
                  value={filterIsSteerable}
                  onChange={(e) => setFilterIsSteerable(e.target.value)}
                >
                  <option value="all">All</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="group-solar-analytics-filter-field">
                <label htmlFor="filter-live-data">liveDataSupported</label>
                <select
                  id="filter-live-data"
                  className="group-solar-analytics-select"
                  value={filterLiveDataSupported}
                  onChange={(e) => setFilterLiveDataSupported(e.target.value)}
                >
                  <option value="all">All</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="group-solar-analytics-filter-field group-solar-analytics-filter-field-grow">
                <label htmlFor="filter-report-mode">Last report (min ago)</label>
                <div className="group-solar-analytics-report-row">
                  <select
                    id="filter-report-mode"
                    className="group-solar-analytics-select"
                    value={reportMinutesMode}
                    onChange={(e) => setReportMinutesMode(e.target.value)}
                  >
                    <option value="any">Any</option>
                    <option value="atLeast">At least … min ago</option>
                    <option value="atMost">At most … min ago</option>
                  </select>
                  <input
                    id="filter-report-minutes"
                    type="number"
                    min={0}
                    step={1}
                    className="group-solar-analytics-number"
                    placeholder="Minutes"
                    value={reportMinutesInput}
                    onChange={(e) => setReportMinutesInput(e.target.value)}
                    disabled={reportMinutesMode === 'any'}
                    aria-label="Minutes for last report filter"
                  />
                </div>
              </div>
            </div>

            <div className="group-solar-analytics-toolbar">
              <p className="count">
                Showing {filteredInverters.length} of {inverters.length} solar inverters
              </p>
              <div className="group-solar-analytics-toolbar-actions">
                <button
                  type="button"
                  className="group-solar-analytics-export-button"
                  onClick={handleExportCsv}
                  disabled={filteredInverters.length === 0}
                  title="Download filtered rows as CSV"
                >
                  Export CSV
                </button>
              </div>
            </div>
          </>
        )}

        {loading ? (
          <div className="loading">Loading solar inverters…</div>
        ) : inverters.length === 0 ? (
          <div className="empty-state">
            <p>No solar inverters found in this group.</p>
          </div>
        ) : filteredInverters.length === 0 ? (
          <div className="empty-state">
            <p>No rows match the current filters.</p>
          </div>
        ) : (
          <div className="group-solar-analytics-table-wrap">
            <table className="group-solar-analytics-table">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Model</th>
                  <th>Site</th>
                  <th>isSteerable</th>
                  <th>liveDataSupported</th>
                  <th>Last report (min ago)</th>
                  <th>Local time</th>
                  <th>productionRate</th>
                  <th>isProducing</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInverters.map((inverter) => {
                  const lps = inverter.lastProductionState;
                  const minutesAgo = lps?.time ? formatMinutesAgo(lps.time) : null;
                  const key = `${inverter.addressUuid}-${inverter.identifier || inverter.uuid}`;

                  return (
                    <tr key={key}>
                      <td>{inverter.info?.brand || '—'}</td>
                      <td>{inverter.info?.model || '—'}</td>
                      <td>{inverter.info?.siteName || '—'}</td>
                      <td>{formatBoolish(inverter.info?.isSteerable)}</td>
                      <td>{formatBoolish(inverter.info?.liveDataSupported)}</td>
                      <td>{minutesAgo ?? '—'}</td>
                      <td>{lps?.time ? formatLocalDateTime(lps.time) : '—'}</td>
                      <td>
                        {lps?.productionRate !== undefined && lps?.productionRate !== null
                          ? `${lps.productionRate} W`
                          : '—'}
                      </td>
                      <td>
                        {lps ? (
                          <span
                            className={
                              lps.isProducing ? 'status-producing' : 'status-not-producing'
                            }
                          >
                            {lps.isProducing ? 'Yes' : 'No'}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="cell-actions">
                        <button
                          type="button"
                          className="view-address-button"
                          onClick={(e) => openJsonModal(e, inverter)}
                          title="Raw device JSON"
                        >
                          Raw JSON
                        </button>
                        <button
                          type="button"
                          className="view-address-button"
                          onClick={(e) => handleViewAddress(e, inverter)}
                          title="Open address in Devices"
                        >
                          Go to address
                        </button>
                        <button
                          type="button"
                          className="view-address-button"
                          onClick={(e) => handleCopyAddressUuid(e, inverter.addressUuid)}
                          title="Copy address UUID"
                        >
                          {copiedAddressUuid === inverter.addressUuid
                            ? 'Copied!'
                            : 'Copy UUID'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {jsonModalOpen && selectedDeviceJson && (
        <div className="json-modal-overlay" onClick={handleCloseJsonModal} role="presentation">
          <div className="json-modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="json-modal-header">
              <h3>Device JSON Data</h3>
              <div className="json-modal-actions">
                <button
                  type="button"
                  className="copy-json-button"
                  onClick={handleCopyJson}
                  title="Copy JSON to clipboard"
                >
                  📋 Copy
                </button>
                <button
                  type="button"
                  className="close-json-button"
                  onClick={handleCloseJsonModal}
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="json-modal-content">
              <pre className="json-display">
                <code>{JSON.stringify(selectedDeviceJson, null, 2)}</code>
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupSolarAnalytics;
