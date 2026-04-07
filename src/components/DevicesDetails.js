import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { devicesAPI } from '../services/api';
import ForecastGraph from './ForecastGraph';
import InverterGraph from './InverterGraph';
import ScheduleModal from './ScheduleModal';
import './DevicesDetails.css';

const DevicesDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { address, group } = location.state || {};
  
  const [devices, setDevices] = useState({
    vehicles: [],
    chargers: [],
    solarInverters: [],
    smartMeters: [],
    hvacs: [],
    batteries: [],
    gridConnections: []
  });
  
  const [loading, setLoading] = useState({
    devices: false
  });
  
  const [error, setError] = useState('');
  const [deviceErrors, setDeviceErrors] = useState({});
  const [jsonModalOpen, setJsonModalOpen] = useState(false);
  const [selectedDeviceJson, setSelectedDeviceJson] = useState(null);
  
  // Production forecast state per inverter
  const [productionForecasts, setProductionForecasts] = useState({});
  const [productionData, setProductionData] = useState({});
  const [forecastDates, setForecastDates] = useState({});
  const [loadingForecasts, setLoadingForecasts] = useState({});
  const [loadingProduction, setLoadingProduction] = useState({});
  const [showActualProduction, setShowActualProduction] = useState({});
  
  // Schedule management state per inverter
  const [schedules, setSchedules] = useState({});
  const [loadingSchedules, setLoadingSchedules] = useState({});
  const [scheduleModalOpen, setScheduleModalOpen] = useState({});
  const [editingSchedule, setEditingSchedule] = useState({});
  
  // Track if we're currently fetching to prevent duplicate calls
  const isFetchingRef = useRef(false);
  const lastFetchedRef = useRef({ groupUuid: null, addressUuid: null });

  useEffect(() => {
    if (!address || !group) {
      // Reset refs when address/group is cleared
      lastFetchedRef.current = { groupUuid: null, addressUuid: null };
      return;
    }
    
    const groupUuid = group.uuid;
    const addressUuid = address.uuid;
    
    // Check if we're already fetching for this exact address/group combination
    if (isFetchingRef.current && 
        lastFetchedRef.current.groupUuid === groupUuid && 
        lastFetchedRef.current.addressUuid === addressUuid) {
      console.log('[DevicesDetails] Fetch already in progress for this address/group, skipping...');
      return;
    }
    
    // Check if we've already successfully fetched for this address/group
    if (lastFetchedRef.current.groupUuid === groupUuid && 
        lastFetchedRef.current.addressUuid === addressUuid &&
        !isFetchingRef.current) {
      console.log('[DevicesDetails] Already fetched for this address/group, skipping...');
      return;
    }
    
    console.log('[DevicesDetails] Fetching devices for:', { groupUuid, addressUuid });
    isFetchingRef.current = true;
    lastFetchedRef.current = { groupUuid, addressUuid };
    
    fetchDevices(groupUuid, addressUuid).finally(() => {
      isFetchingRef.current = false;
    });
  }, [address, group]);

  // Fetch schedules for steerable inverters when devices are loaded
  useEffect(() => {
    if (devices.solarInverters.length > 0 && address) {
      devices.solarInverters.forEach(inverter => {
        if (inverter.info?.isSteerable === true) {
          fetchSchedules(inverter.identifier);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices.solarInverters, address]);

  const fetchDevices = async (groupUuid, addressUuid) => {
    setLoading(prev => ({ ...prev, devices: true }));
    setError('');
    setDeviceErrors({});
    
    // Fetch all device types in parallel, but handle each independently
    const deviceFetches = [
      { key: 'vehicles', apiCall: () => devicesAPI.getVehicles(addressUuid) },
      { key: 'chargers', apiCall: () => devicesAPI.getChargers(addressUuid) },
      { key: 'solarInverters', apiCall: () => devicesAPI.getSolarInverters(addressUuid) },
      { key: 'smartMeters', apiCall: () => devicesAPI.getSmartMeters(addressUuid) },
      { key: 'hvacs', apiCall: () => devicesAPI.getHvacs(addressUuid) },
      { key: 'batteries', apiCall: () => devicesAPI.getBatteries(addressUuid) },
      { key: 'gridConnections', apiCall: () => devicesAPI.getGridConnections(addressUuid) }
    ];

    // Use Promise.allSettled to handle each device type independently
    const results = await Promise.allSettled(
      deviceFetches.map(fetch => fetch.apiCall())
    );

    // Extract results from each API response (handle both { results: [...] } and direct array)
    const extractResults = (data) => Array.isArray(data) ? data : (data?.results || []);

    const newDevices = {
      vehicles: [],
      chargers: [],
      solarInverters: [],
      smartMeters: [],
      hvacs: [],
      batteries: [],
      gridConnections: []
    };

    const newDeviceErrors = {};

    // Process each result
    results.forEach((result, index) => {
      const deviceKey = deviceFetches[index].key;
      
      if (result.status === 'fulfilled') {
        try {
          const data = result.value;
          console.log(`${deviceKey} API response:`, data);
          newDevices[deviceKey] = extractResults(data);
        } catch (err) {
          console.error(`Error processing ${deviceKey} data:`, err);
          newDeviceErrors[deviceKey] = `Failed to process ${deviceKey} data`;
        }
      } else {
        // Handle rejected promise
        const error = result.reason;
        console.error(`Error fetching ${deviceKey}:`, error);
        newDeviceErrors[deviceKey] = `Failed to fetch ${deviceKey}`;
        newDevices[deviceKey] = []; // Set empty array for failed device type
      }
    });

    setDevices(newDevices);
    setDeviceErrors(newDeviceErrors);
    setLoading(prev => ({ ...prev, devices: false }));
  };

  const handleBackToDashboard = () => {
    navigate('/dashboard');
  };

  const handleViewDeviceJson = (device) => {
    setSelectedDeviceJson(device);
    setJsonModalOpen(true);
  };

  const handleCloseJsonModal = () => {
    setJsonModalOpen(false);
    setSelectedDeviceJson(null);
  };

  const handleCopyJson = () => {
    if (selectedDeviceJson) {
      const jsonString = JSON.stringify(selectedDeviceJson, null, 2);
      navigator.clipboard.writeText(jsonString).then(() => {
        alert('JSON copied to clipboard!');
      }).catch(err => {
        console.error('Failed to copy JSON:', err);
      });
    }
  };

  const fetchProductionForecast = async (inverterUuid, date) => {
    if (!address || !inverterUuid || !date) return;
    
    setLoadingForecasts(prev => ({ ...prev, [inverterUuid]: true }));
    try {
      const forecast = await devicesAPI.getSolarInverterProductionForecast(
        address.uuid,
        inverterUuid,
        date
      );
      setProductionForecasts(prev => ({ ...prev, [inverterUuid]: forecast }));
    } catch (err) {
      console.error('Error fetching production forecast:', err);
      setProductionForecasts(prev => ({ ...prev, [inverterUuid]: null }));
    } finally {
      setLoadingForecasts(prev => ({ ...prev, [inverterUuid]: false }));
    }
  };

  const handleForecastDateChange = (inverterUuid, date) => {
    setForecastDates(prev => ({ ...prev, [inverterUuid]: date }));
    fetchProductionForecast(inverterUuid, date);
    // Also fetch actual production data for the selected date
    fetchProductionData(inverterUuid, date);
  };

  const fetchProductionData = async (inverterUuid, date) => {
    if (!address || !inverterUuid || !date) return;
    
    // Calculate fromDate and toDate for the selected date (full day)
    const fromDate = new Date(date + 'T00:00:00.000Z').toISOString();
    const toDate = new Date(date + 'T23:59:59.999Z').toISOString();
    
    setLoadingProduction(prev => ({ ...prev, [inverterUuid]: true }));
    try {
      const data = await devicesAPI.getSolarInverterProduction(
        address.uuid,
        inverterUuid,
        fromDate,
        toDate,
        'ASC',
        1000 // Increased limit to get all data points for the day
      );
      setProductionData(prev => ({ ...prev, [inverterUuid]: data }));
    } catch (err) {
      console.error('Error fetching production data:', err);
      setProductionData(prev => ({ ...prev, [inverterUuid]: null }));
    } finally {
      setLoadingProduction(prev => ({ ...prev, [inverterUuid]: false }));
    }
  };

  // Schedule management functions
  const fetchSchedules = async (inverterUuid) => {
    if (!address || !inverterUuid) return;
    
    setLoadingSchedules(prev => ({ ...prev, [inverterUuid]: true }));
    try {
      const data = await devicesAPI.getSolarInverterSchedules(address.uuid, inverterUuid);
      const scheduleList = Array.isArray(data) ? data : (data?.results || []);
      setSchedules(prev => ({ ...prev, [inverterUuid]: scheduleList }));
    } catch (err) {
      console.error('Error fetching schedules:', err);
      setSchedules(prev => ({ ...prev, [inverterUuid]: [] }));
    } finally {
      setLoadingSchedules(prev => ({ ...prev, [inverterUuid]: false }));
    }
  };

  const handleCreateSchedule = (inverterUuid) => {
    setEditingSchedule(prev => ({ ...prev, [inverterUuid]: null }));
    setScheduleModalOpen(prev => ({ ...prev, [inverterUuid]: true }));
  };

  const handleEditSchedule = (inverterUuid, schedule) => {
    setEditingSchedule(prev => ({ ...prev, [inverterUuid]: schedule }));
    setScheduleModalOpen(prev => ({ ...prev, [inverterUuid]: true }));
  };

  const handleSaveSchedule = async (inverterUuid, scheduleData) => {
    try {
      const editing = editingSchedule[inverterUuid];
      if (editing) {
        // Update existing schedule
        await devicesAPI.updateSolarInverterSchedule(
          address.uuid,
          inverterUuid,
          editing.identifier || editing.uuid,
          scheduleData
        );
      } else {
        // Create new schedule
        await devicesAPI.createSolarInverterSchedule(
          address.uuid,
          inverterUuid,
          scheduleData
        );
      }
      
      setScheduleModalOpen(prev => ({ ...prev, [inverterUuid]: false }));
      setEditingSchedule(prev => ({ ...prev, [inverterUuid]: null }));
      fetchSchedules(inverterUuid); // Refresh schedules list
    } catch (err) {
      console.error('Error saving schedule:', err);
      setError(err.message || 'Failed to save schedule');
    }
  };

  const handleDeleteSchedule = async (inverterUuid, schedule) => {
    if (!window.confirm('Are you sure you want to delete this schedule?')) {
      return;
    }
    
    try {
      await devicesAPI.deleteSolarInverterSchedule(
        address.uuid,
        inverterUuid,
        schedule.identifier || schedule.uuid
      );
      fetchSchedules(inverterUuid); // Refresh schedules list
    } catch (err) {
      console.error('Error deleting schedule:', err);
      setError(err.message || 'Failed to delete schedule');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  const formatTimeAgo = (dateString) => {
    if (!dateString) return '—';
    let d;
    try {
      d = new Date(dateString);
      if (Number.isNaN(d.getTime())) return '—';
    } catch {
      return '—';
    }
    const diffMs = Date.now() - d.getTime();
    if (diffMs < 0) return 'just now';
    const totalMinutes = Math.floor(diffMs / 60000);
    const totalHours = Math.floor(totalMinutes / 60);
    const days = Math.floor(totalHours / 24);
    if (days > 0) {
      return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    }
    if (totalHours > 0) {
      return `${totalHours} ${totalHours === 1 ? 'hour' : 'hours'} ago`;
    }
    if (totalMinutes > 0) {
      return `${totalMinutes} ${totalMinutes === 1 ? 'minute' : 'minutes'} ago`;
    }
    return 'just now';
  };

  if (!address || !group) {
    return (
      <div className="devices-details">
        <div className="error-state">
          <h2>No Address Information</h2>
          <p>Unable to load device details.</p>
          <button onClick={handleBackToDashboard} className="back-button">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="devices-details">
      <header className="devices-header">
        <div className="header-content">
          <button onClick={handleBackToDashboard} className="back-button">
            ← Back to Dashboard
          </button>
          <h1>Devices</h1>
        </div>
      </header>

      <main className="devices-main">
        {error && <div className="error-banner">{error}</div>}

        {/* Address Information */}
        <div className="address-info-section">
          <h2>Address Information</h2>
          <div className="info-grid">
            <div className="info-item">
              <label>Address UUID:</label>
              <span className="uuid">{address.uuid}</span>
            </div>
            <div className="info-item">
              <label>Group:</label>
              <span>{group.name}</span>
            </div>
            {address.sparky && (
              <div className="info-item">
                <label>Sparky Serial:</label>
                <span>{address.sparky.serialNumber}</span>
              </div>
            )}
          </div>
        </div>

        {/* Devices Section */}
        {loading.devices ? (
          <div className="loading">Loading devices...</div>
        ) : (
          <div className="devices-container">
            {/* Vehicles */}
            {deviceErrors.vehicles && (
              <div className="device-error-message">
                ⚠️ {deviceErrors.vehicles}
              </div>
            )}
            {devices.vehicles.length > 0 && (
              <div className="device-category">
                <h3>🚗 Vehicles ({devices.vehicles.length})</h3>
                <div className="device-list">
                  {devices.vehicles.map((vehicle) => (
                    <div key={vehicle.identifier} className="device-card vehicle-card">
                      <div className="device-header">
                        <div>
                          <span className="device-brand">{vehicle.info.brand}</span>
                          <span className="device-model">{vehicle.info.model}</span>
                        </div>
                        <button 
                          className="json-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDeviceJson(vehicle);
                          }}
                          title="View JSON"
                        >
                          📄
                        </button>
                      </div>
                      <div className="device-details">
                        <div className="detail-item">
                          <span className="label">VIN:</span>
                          <span className="value">{vehicle.vin}</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Year:</span>
                          <span className="value">{vehicle.info.year}</span>
                        </div>
                        {vehicle.lastChargeState && (
                          <div className="detail-item">
                            <span className="label">Battery:</span>
                            <span className="value">
                              {typeof vehicle.lastChargeState.batteryLevel === 'object' 
                                ? (vehicle.lastChargeState.batteryLevel?.percent || 0)
                                : (vehicle.lastChargeState.batteryLevel || 0)
                              }%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chargers */}
            {deviceErrors.chargers && (
              <div className="device-error-message">
                ⚠️ {deviceErrors.chargers}
              </div>
            )}
            {devices.chargers.length > 0 && (
              <div className="device-category">
                <h3>🔌 Chargers ({devices.chargers.length})</h3>
                <div className="device-list">
                  {devices.chargers.map((charger) => (
                    <div key={charger.identifier} className="device-card charger-card">
                      <div className="device-header">
                        <div>
                          <span className="device-brand">{charger.brand}</span>
                          <span className="device-model">{charger.model}</span>
                        </div>
                        <button 
                          className="json-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDeviceJson(charger);
                          }}
                          title="View JSON"
                        >
                          📄
                        </button>
                      </div>
                      <div className="device-details">
                        <div className="detail-item">
                          <span className="label">Status:</span>
                          <span className="value">{charger.lastChargeState?.powerDeliveryState || 'Unknown'}</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Max Current:</span>
                          <span className="value">{charger.lastChargeState?.maxCurrent || 0}A</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Solar Inverters */}
            {deviceErrors.solarInverters && (
              <div className="device-error-message">
                ⚠️ {deviceErrors.solarInverters}
              </div>
            )}
            {devices.solarInverters.length > 0 && (
              <>
                <div className="device-category">
                  <h3>☀️ Solar Inverters ({devices.solarInverters.length})</h3>
                  <div className="device-list">
                    {devices.solarInverters.map((inverter) => (
                      <div key={inverter.identifier} className="device-card solar-card">
                        <div className="device-header">
                          <div>
                            <span className="device-brand">{inverter.info?.brand || inverter.brand}</span>
                            <span className="device-model">{inverter.info?.model || inverter.model}</span>
                          </div>
                          <button 
                            className="json-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewDeviceJson(inverter);
                            }}
                            title="View JSON"
                          >
                            📄
                          </button>
                        </div>
                        <div className="device-details">
                          <div className="detail-item">
                            <span className="label">Steerable:</span>
                            <span className="value">
                              {inverter.info?.isSteerable === true
                                ? 'Yes'
                                : inverter.info?.isSteerable === false
                                  ? 'No'
                                  : '—'}
                            </span>
                          </div>
                          <div className="detail-item">
                            <span className="label">Status:</span>
                            <span className="value">
                              {inverter.lastProductionState
                                ? `${inverter.lastProductionState.productionRate ?? '—'} W · last report ${formatTimeAgo(inverter.lastProductionState.time)}`
                                : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Production Forecast Section - Separate */}
                <div className="device-category forecast-category">
                  <h3>☀️ PV Production Forecasts</h3>
                  <div className="forecast-list">
                    {devices.solarInverters.map((inverter) => {
                      const inverterUuid = inverter.identifier;
                      const forecastDate = forecastDates[inverterUuid] || new Date().toISOString().split('T')[0];
                      const forecast = productionForecasts[inverterUuid];
                      const production = productionData[inverterUuid];
                      const isLoadingForecast = loadingForecasts[inverterUuid];
                      const isLoadingProduction = loadingProduction[inverterUuid];
                      const showActual = showActualProduction[inverterUuid] || false;
                      
                      return (
                        <div key={inverter.identifier} className="forecast-item">
                            <div className="forecast-item-header">
                            <div className="forecast-inverter-info">
                              <span className="forecast-inverter-brand">{inverter.info?.brand || inverter.brand}</span>
                              <span className="forecast-inverter-model">{inverter.info?.model || inverter.model}</span>
                            </div>
                            <div className="forecast-controls">
                              <div className="forecast-date-picker">
                                <label htmlFor={`forecast-date-${inverterUuid}`}>Date:</label>
                                <input
                                  id={`forecast-date-${inverterUuid}`}
                                  type="date"
                                  value={forecastDate}
                                  onChange={(e) => handleForecastDateChange(inverterUuid, e.target.value)}
                                  className="forecast-date-input"
                                />
                              </div>
                              <label className="forecast-toggle-label">
                                <input
                                  type="checkbox"
                                  checked={showActual}
                                  onChange={(e) => setShowActualProduction(prev => ({ ...prev, [inverterUuid]: e.target.checked }))}
                                  className="forecast-toggle-checkbox"
                                  disabled={!production || isLoadingProduction}
                                />
                                <span>Show actual PV production</span>
                              </label>
                              <button
                                onClick={() => {
                                  fetchProductionForecast(inverterUuid, forecastDate);
                                  fetchProductionData(inverterUuid, forecastDate);
                                }}
                                disabled={isLoadingForecast || isLoadingProduction}
                                className="refresh-forecast-button"
                              >
                                {(isLoadingForecast || isLoadingProduction) ? 'Loading...' : 'Refresh Forecast'}
                              </button>
                            </div>
                          </div>
                          
                          {(isLoadingForecast || isLoadingProduction) && (
                            <div className="forecast-loading">Loading PV production data...</div>
                          )}
                          
                          {forecast && !isLoadingForecast && (
                            <div className="forecast-graph-wrapper">
                              <ForecastGraph
                                deliveryForecast={null}
                                returnForecast={null}
                                productionForecast={forecast}
                                productionData={production}
                                date={forecastDate}
                                electricity15min={null}
                                show15minData={showActual}
                              />
                            </div>
                          )}
                          
                          {!forecast && !isLoadingForecast && forecastDate && (
                            <div className="forecast-empty">
                              No forecast data available. Click "Refresh Forecast" to load.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Steerable Inverters - Separate Device Category */}
            {deviceErrors.solarInverters && (
              <div className="device-error-message">
                ⚠️ {deviceErrors.solarInverters}
              </div>
            )}
            {devices.solarInverters.filter(inv => inv.info?.isSteerable === true).length > 0 && (
              <div className="device-category steerable-inverters-category">
                <h3>⚡ Steerable Inverters ({devices.solarInverters.filter(inv => inv.info?.isSteerable === true).length})</h3>
                <div className="steerable-inverters-list">
                      {devices.solarInverters
                        .filter(inverter => inverter.info?.isSteerable === true)
                        .map((inverter) => {
                          const inverterUuid = inverter.identifier;
                          const inverterSchedules = schedules[inverterUuid] || [];
                          const isLoadingSchedule = loadingSchedules[inverterUuid];
                          
                          return (
                            <div key={inverter.identifier} className="steerable-inverter-item">
                              <div className="steerable-inverter-header">
                                <div className="steerable-inverter-info">
                                  <h4>{inverter.info?.brand || inverter.brand} {inverter.info?.model || inverter.model}</h4>
                                  {inverter.lastProductionState && (
                                    <span className="steerable-inverter-production">
                                      {inverter.lastProductionState.productionRate ?? '—'} W · last report{' '}
                                      {formatTimeAgo(inverter.lastProductionState.time)}
                                    </span>
                                  )}
                                </div>
                                <button
                                  className="button-primary"
                                  onClick={() => handleCreateSchedule(inverterUuid)}
                                >
                                  + Add Schedule
                                </button>
                              </div>
                              
                              {/* Real-time Graph */}
                              <div className="steerable-inverter-graph">
                                <h5>Real-time Import & PV Production</h5>
                                <InverterGraph
                                  addressUuid={address.uuid}
                                  solarInverterUuid={inverterUuid}
                                  sparkySerialNumber={address.sparky?.serialNumber}
                                />
                              </div>
                              
                              {/* Schedules List */}
                              <div className="steerable-inverter-schedules">
                                <h5>Schedules</h5>
                                {isLoadingSchedule ? (
                                  <div className="loading">Loading schedules...</div>
                                ) : inverterSchedules.length === 0 ? (
                                  <div className="empty-state">
                                    <p>No schedules found.</p>
                                  </div>
                                ) : (
                                  <div className="schedules-table-wrapper">
                                    <table className="schedules-table">
                                      <thead>
                                        <tr>
                                          <th>Time</th>
                                          <th>Type</th>
                                          <th>Value</th>
                                          <th>Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {inverterSchedules.map((schedule) => (
                                          <tr key={schedule.identifier || schedule.uuid}>
                                            <td>{formatDate(schedule.time)}</td>
                                            <td>
                                              {schedule.zeroExport ? (
                                                <span className="schedule-type zero-export">Zero Export</span>
                                              ) : (
                                                <span className="schedule-type power-limit">Power Limit</span>
                                              )}
                                            </td>
                                            <td>
                                              {schedule.zeroExport ? (
                                                <span className="schedule-value">Auto Balance</span>
                                              ) : (
                                                <span className="schedule-value">{schedule.powerlimit || 0}%</span>
                                              )}
                                            </td>
                                            <td>
                                              <div className="action-buttons">
                                                <button
                                                  className="button-edit"
                                                  onClick={() => handleEditSchedule(inverterUuid, schedule)}
                                                  title="Edit schedule"
                                                >
                                                  ✏️ Edit
                                                </button>
                                                <button
                                                  className="button-delete"
                                                  onClick={() => handleDeleteSchedule(inverterUuid, schedule)}
                                                  title="Delete schedule"
                                                >
                                                  🗑️ Delete
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                              
                              {/* Schedule Modal */}
                              <ScheduleModal
                                isOpen={scheduleModalOpen[inverterUuid] || false}
                                onClose={() => {
                                  setScheduleModalOpen(prev => ({ ...prev, [inverterUuid]: false }));
                                  setEditingSchedule(prev => ({ ...prev, [inverterUuid]: null }));
                                }}
                                onSave={(scheduleData) => handleSaveSchedule(inverterUuid, scheduleData)}
                                schedule={editingSchedule[inverterUuid]}
                              />
                            </div>
                          );
                        })}
                </div>
              </div>
            )}

            {/* Smart Meters */}
            {deviceErrors.smartMeters && (
              <div className="device-error-message">
                ⚠️ {deviceErrors.smartMeters}
              </div>
            )}
            {devices.smartMeters.length > 0 && (
              <div className="device-category">
                <h3>📊 Smart Meters ({devices.smartMeters.length})</h3>
                <div className="device-list">
                  {devices.smartMeters.map((meter) => (
                    <div key={meter.identifier} className="device-card meter-card">
                      <div className="device-header">
                        <div>
                          <span className="device-brand">{meter.smartMeterType}</span>
                        </div>
                        <button 
                          className="json-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDeviceJson(meter);
                          }}
                          title="View JSON"
                        >
                          📄
                        </button>
                      </div>
                      <div className="device-details">
                        <div className="detail-item">
                          <span className="label">Meter #:</span>
                          <span className="value">{meter.meterNumber}</span>
                        </div>
                        {meter.gasMeterNumber && (
                          <div className="detail-item">
                            <span className="label">Gas Meter #:</span>
                            <span className="value">{meter.gasMeterNumber}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* HVACs */}
            {deviceErrors.hvacs && (
              <div className="device-error-message">
                ⚠️ {deviceErrors.hvacs}
              </div>
            )}
            {devices.hvacs.length > 0 && (
              <div className="device-category">
                <h3>🌡️ HVAC Systems ({devices.hvacs.length})</h3>
                <div className="device-list">
                  {devices.hvacs.map((hvac) => (
                    <div key={hvac.identifier} className="device-card hvac-card">
                      <div className="device-header">
                        <div>
                          <span className="device-brand">{hvac.brand}</span>
                          <span className="device-model">{hvac.model}</span>
                        </div>
                        <button 
                          className="json-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDeviceJson(hvac);
                          }}
                          title="View JSON"
                        >
                          📄
                        </button>
                      </div>
                      <div className="device-details">
                        <div className="detail-item">
                          <span className="label">Name:</span>
                          <span className="value">{hvac.displayName}</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Category:</span>
                          <span className="value">{hvac.category}</span>
                        </div>
                        {hvac.lastTemperatureState && (
                          <div className="detail-item">
                            <span className="label">Temperature:</span>
                            <span className="value">{hvac.lastTemperatureState.currentTemperature}°C</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Batteries */}
            {deviceErrors.batteries && (
              <div className="device-error-message">
                ⚠️ {deviceErrors.batteries}
              </div>
            )}
            {devices.batteries.length > 0 && (
              <div className="device-category">
                <h3>🔋 Batteries ({devices.batteries.length})</h3>
                <div className="device-list">
                  {devices.batteries.map((battery) => (
                    <div key={battery.identifier} className="device-card battery-card">
                      <div className="device-header">
                        <div>
                          <span className="device-brand">{battery.brand}</span>
                          <span className="device-model">{battery.model}</span>
                        </div>
                        <button 
                          className="json-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDeviceJson(battery);
                          }}
                          title="View JSON"
                        >
                          📄
                        </button>
                      </div>
                      <div className="device-details">
                        <div className="detail-item">
                          <span className="label">Site:</span>
                          <span className="value">{battery.siteName}</span>
                        </div>
                        {battery.lastChargeState && battery.lastChargeState.batteryLevel && (
                          <div className="detail-item">
                            <span className="label">Level:</span>
                            <span className="value">{battery.lastChargeState.batteryLevel.percent || 0}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Grid Connections */}
            {deviceErrors.gridConnections && (
              <div className="device-error-message">
                ⚠️ {deviceErrors.gridConnections}
              </div>
            )}
            {devices.gridConnections.length > 0 && (
              <div className="device-category">
                <h3>⚡ Grid Connections ({devices.gridConnections.length})</h3>
                <div className="device-list">
                  {devices.gridConnections.map((connection) => (
                    <div key={connection.identifier} className="device-card grid-card">
                      <div className="device-header">
                        <div>
                          <span className="device-brand">Grid Connection</span>
                        </div>
                        <button 
                          className="json-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDeviceJson(connection);
                          }}
                          title="View JSON"
                        >
                          📄
                        </button>
                      </div>
                      <div className="device-details">
                        <div className="detail-item">
                          <span className="label">Phase 1:</span>
                          <span className="value">{connection.phaseOneCapacity?.capacity || 0}A</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Phase 2:</span>
                          <span className="value">{connection.phaseTwoCapacity?.capacity || 0}A</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Phase 3:</span>
                          <span className="value">{connection.phaseThreeCapacity?.capacity || 0}A</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No devices message */}
            {Object.values(devices).every(deviceArray => deviceArray.length === 0) && 
             Object.keys(deviceErrors).length === 0 && (
              <div className="placeholder">No devices found for this address</div>
            )}
          </div>
        )}
      </main>

      {/* JSON Modal */}
      {jsonModalOpen && selectedDeviceJson && (
        <div className="json-modal-overlay" onClick={handleCloseJsonModal}>
          <div className="json-modal" onClick={(e) => e.stopPropagation()}>
            <div className="json-modal-header">
              <h3>Device JSON Data</h3>
              <div className="json-modal-actions">
                <button 
                  className="copy-json-button"
                  onClick={handleCopyJson}
                  title="Copy JSON to clipboard"
                >
                  📋 Copy
                </button>
                <button 
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

export default DevicesDetails;

