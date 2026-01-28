import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { sparkyAPI, devicesAPI } from '../services/api';
import EnergyGraph from './EnergyGraph';
import ForecastGraph from './ForecastGraph';
import './SparkyDetails.css';

const SparkyDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { sparky, address, group } = location.state || {};
  
  const [sparkyData, setSparkyData] = useState({
    details: null,
    access: null,
    electricityLatest: null,
    electricityLatestP1: null,
    electricityFirst: null,
    electricity15min: null,
    gas15min: null,
    total15min: null,
  });
  
  const [selectedDate, setSelectedDate] = useState(() => {
    // Default to today's date in YYYY-MM-DD format
    return new Date().toISOString().split('T')[0];
  });
  
  const [selectedForecastDate, setSelectedForecastDate] = useState(() => {
    // Default to today's date in YYYY-MM-DD format for forecasts
    return new Date().toISOString().split('T')[0];
  });
  
  const [loading, setLoading] = useState({
    details: false,
    access: false,
    electricityLatest: false,
    electricityLatestP1: false,
    electricityFirst: false,
    electricity15min: false,
    gas15min: false,
    total15min: false,
    smartMeters: false,
    deliveryForecast: false,
    returnForecast: false,
  });
  
  const [smartMeters, setSmartMeters] = useState([]);
  const [selectedSmartMeter, setSelectedSmartMeter] = useState(null);
  const [forecastData, setForecastData] = useState({
    deliveryForecast: null,
    returnForecast: null,
  });
  
  const [show15minOnForecast, setShow15minOnForecast] = useState(false);
  
  const [error, setError] = useState('');

  const fetchSparkyData = useCallback(async () => {
    if (!sparky?.serialNumber) {
      setError('No Sparky serial number available');
      return;
    }

    const serialNumber = sparky.serialNumber;
    
    // Fetch all Sparky data in parallel
    const fetchPromises = [
      fetchData('details', () => sparkyAPI.getSparkyDetails(serialNumber)),
      fetchData('access', () => sparkyAPI.getSparkyAccess(serialNumber)),
      fetchData('electricityLatest', () => sparkyAPI.getElectricityLatest(serialNumber)),
      fetchData('electricityLatestP1', () => sparkyAPI.getElectricityLatestP1(serialNumber)),
      fetchData('electricityFirst', () => sparkyAPI.getElectricityFirst(serialNumber)),
      fetchData('electricity15min', () => sparkyAPI.getElectricity15min(serialNumber, selectedDate)),
      fetchData('gas15min', () => sparkyAPI.getGas15min(serialNumber, selectedDate)),
      fetchData('total15min', () => sparkyAPI.getTotal15min(serialNumber, selectedDate)),
    ];

    await Promise.all(fetchPromises);
  }, [sparky?.serialNumber, selectedDate]);

  const fetchData = async (key, apiCall) => {
    setLoading(prev => ({ ...prev, [key]: true }));
    try {
      const data = await apiCall();
      console.log(`Sparky ${key} response:`, data);
      setSparkyData(prev => ({ ...prev, [key]: data }));
    } catch (err) {
      console.error(`Error fetching Sparky ${key}:`, err);
      // Don't set error for individual failures, just log them
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  // Fetch smart meters when address is available
  const fetchSmartMeters = useCallback(async () => {
    if (!address?.uuid) {
      return;
    }

    setLoading(prev => ({ ...prev, smartMeters: true }));
    try {
      const data = await devicesAPI.getSmartMeters(address.uuid);
      const meters = Array.isArray(data) ? data : (data?.results || []);
      setSmartMeters(meters);
      // Only set selected smart meter if none is selected
      // Use identifier field as the smart meter UUID
      if (meters.length > 0) {
        setSelectedSmartMeter(prev => prev || meters[0].identifier);
      }
    } catch (err) {
      console.error('Error fetching smart meters:', err);
    } finally {
      setLoading(prev => ({ ...prev, smartMeters: false }));
    }
  }, [address?.uuid]);

  // Fetch forecasts when smart meter is selected
  const fetchForecasts = useCallback(async () => {
    if (!address?.uuid || !selectedSmartMeter || !selectedForecastDate) {
      return;
    }

    setLoading(prev => ({ ...prev, deliveryForecast: true, returnForecast: true }));
    try {
      const [deliveryData, returnData] = await Promise.all([
        devicesAPI.getSmartMeterDeliveryForecast(address.uuid, selectedSmartMeter, selectedForecastDate),
        devicesAPI.getSmartMeterReturnForecast(address.uuid, selectedSmartMeter, selectedForecastDate),
      ]);
      console.log('Delivery forecast response:', deliveryData);
      console.log('Return forecast response:', returnData);
      setForecastData({
        deliveryForecast: deliveryData || null,
        returnForecast: returnData || null,
      });
    } catch (err) {
      console.error('Error fetching forecasts:', err);
      setForecastData({
        deliveryForecast: null,
        returnForecast: null,
      });
    } finally {
      setLoading(prev => ({ ...prev, deliveryForecast: false, returnForecast: false }));
    }
  }, [address?.uuid, selectedSmartMeter, selectedForecastDate]);

  useEffect(() => {
    if (sparky?.serialNumber) {
      fetchSparkyData();
    } else {
      setError('No Sparky information available');
    }
  }, [sparky?.serialNumber, fetchSparkyData]);

  useEffect(() => {
    if (address?.uuid) {
      fetchSmartMeters();
    }
  }, [address?.uuid, fetchSmartMeters]);

  useEffect(() => {
    if (address?.uuid && selectedSmartMeter && selectedForecastDate) {
      fetchForecasts();
    }
  }, [address?.uuid, selectedSmartMeter, selectedForecastDate, fetchForecasts]);

  // When forecast date changes, also fetch 15min data for that date
  useEffect(() => {
    if (sparky?.serialNumber && selectedForecastDate) {
      // Fetch 15min data for the forecast date
      fetchData('electricity15min', () => sparkyAPI.getElectricity15min(sparky.serialNumber, selectedForecastDate));
    }
  }, [sparky?.serialNumber, selectedForecastDate]);

  const handleBackToDashboard = () => {
    // Use browser history to go back, which preserves the previous state
    navigate(-1);
  };

  const formatData = (data) => {
    if (typeof data === 'object' && data !== null) {
      return JSON.stringify(data, null, 2);
    }
    return String(data);
  };

  const renderDataSection = (title, data, loadingKey, dataKey) => {
    const isLoading = loading[loadingKey];
    const hasData = data !== null && data !== undefined;
    
    return (
      <div className="data-section">
        <h3>{title}</h3>
        {isLoading ? (
          <div className="loading">Loading {title.toLowerCase()}...</div>
        ) : hasData ? (
          <pre className="data-display">{formatData(data)}</pre>
        ) : (
          <div className="no-data">No {title.toLowerCase()} available</div>
        )}
      </div>
    );
  };

  if (!sparky) {
    return (
      <div className="sparky-details">
        <div className="error-state">
          <h2>No Sparky Information</h2>
          <p>Unable to load Sparky details.</p>
          <button onClick={handleBackToDashboard} className="back-button">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sparky-details">
      <header className="sparky-header">
        <div className="header-content">
          <button onClick={handleBackToDashboard} className="back-button">
            ← Back to Dashboard
          </button>
          <h1>Sparky Details</h1>
        </div>
      </header>

      <main className="sparky-main">
        {error && <div className="error-banner">{error}</div>}

        {/* Sparky Information */}
        <div className="sparky-info-section">
          <h2>Sparky Information</h2>
          <div className="info-grid">
            <div className="info-item">
              <label>Serial Number:</label>
              <span>{sparky.serialNumber}</span>
            </div>
            <div className="info-item">
              <label>Box Code:</label>
              <span>{sparky.boxCode}</span>
            </div>
            <div className="info-item">
              <label>UUID:</label>
              <span className="uuid">{sparky.uuid}</span>
            </div>
          </div>
        </div>

        {/* Address Information */}
        <div className="address-info-section">
          <h2>Address Information</h2>
          <div className="info-grid">
            <div className="info-item">
              <label>Address UUID:</label>
              <span className="uuid">{address?.uuid}</span>
            </div>
            <div className="info-item">
              <label>Group:</label>
              <span>{group?.name}</span>
            </div>
          </div>
        </div>

        {/* Real-time Energy Graph */}
        <EnergyGraph sparkySerialNumber={sparky.serialNumber} />

        {/* Smart Meter Forecast Section */}
        {address?.uuid && (
          <div className="data-sections">
            <div className="section-header">
              <h2>Smart Meter Forecasts</h2>
              <div className="header-controls">
                {loading.smartMeters ? (
                  <div className="loading">Loading smart meters...</div>
                ) : smartMeters.length > 0 ? (
                  <div className="smart-meter-controls-group">
                    <div className="smart-meter-selector">
                      <div className="date-picker">
                        <label htmlFor="forecast-date-picker">
                          <span className="label-icon">📅</span>
                          Date for forecast:
                        </label>
                        <input
                          id="forecast-date-picker"
                          type="date"
                          value={selectedForecastDate}
                          onChange={(e) => {
                            const newDate = e.target.value;
                            setSelectedForecastDate(newDate);
                            // Also update the 15min data date to match
                            setSelectedDate(newDate);
                          }}
                          className="date-input"
                        />
                      </div>
                      <div className="select-wrapper">
                        <label htmlFor="smart-meter-select">
                          <span className="label-icon">⚡</span>
                          Select Smart Meter:
                        </label>
                        <div className="custom-select-container">
                          <select
                            id="smart-meter-select"
                            value={selectedSmartMeter || ''}
                            onChange={(e) => setSelectedSmartMeter(e.target.value)}
                            className="smart-meter-select"
                          >
                            {smartMeters.map((meter) => (
                              <option key={meter.identifier || meter.uuid} value={meter.identifier}>
                                {meter.smartMeterType || meter.name || meter.identifier || meter.uuid}
                              </option>
                            ))}
                          </select>
                          <span className="select-arrow">▼</span>
                        </div>
                      </div>
                      <div className="button-wrapper">
                        <label className="button-label-spacer"></label>
                        <button
                          onClick={fetchForecasts}
                          className="refresh-button"
                          disabled={loading.deliveryForecast || loading.returnForecast}
                        >
                          <span className="button-icon">
                            {loading.deliveryForecast || loading.returnForecast ? '⏳' : '🔄'}
                          </span>
                          {loading.deliveryForecast || loading.returnForecast ? 'Loading...' : 'Refresh Forecasts'}
                        </button>
                      </div>
                      {selectedForecastDate === selectedDate && sparkyData.electricity15min && (
                        <div className="toggle-wrapper">
                          <label className="button-label-spacer"></label>
                          <label className="toggle-15min">
                            <input
                              type="checkbox"
                              checked={show15minOnForecast}
                              onChange={(e) => setShow15minOnForecast(e.target.checked)}
                              className="toggle-input"
                            />
                            <span className="toggle-switch"></span>
                            <span className="toggle-label">
                              <span className="toggle-icon">📊</span>
                              <span className="toggle-text">Show 15min actual data</span>
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="no-data">No smart meters available for this address</div>
                )}
              </div>
            </div>

            {selectedSmartMeter && (
              <>
                {/* Forecast Graph */}
                {(forecastData.deliveryForecast || forecastData.returnForecast) && (
                  <ForecastGraph
                    deliveryForecast={forecastData.deliveryForecast}
                    returnForecast={forecastData.returnForecast}
                    date={selectedForecastDate}
                    electricity15min={selectedForecastDate === selectedDate ? sparkyData.electricity15min : null}
                    show15minData={show15minOnForecast && selectedForecastDate === selectedDate}
                  />
                )}
                
                {/* Forecast Data Sections */}
                <div className="data-grid">
                  {renderDataSection(
                    'Delivery Forecast',
                    forecastData.deliveryForecast,
                    'deliveryForecast',
                    'deliveryForecast'
                  )}
                  {renderDataSection(
                    'Export Forecast',
                    forecastData.returnForecast,
                    'returnForecast',
                    'returnForecast'
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Sparky Data Sections */}
        <div className="data-sections">
          <div className="section-header">
            <h2>Sparky Data</h2>
            <div className="header-controls">
              <div className="date-picker">
                <label htmlFor="date-picker">Date for 15min data:</label>
                <input
                  id="date-picker"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="date-input"
                />
              </div>
              <button 
                onClick={fetchSparkyData} 
                className="refresh-button"
                disabled={Object.values(loading).some(Boolean)}
              >
                {Object.values(loading).some(Boolean) ? 'Refreshing...' : 'Refresh All'}
              </button>
            </div>
          </div>

          <div className="data-grid">
            {renderDataSection('Sparky Details', sparkyData.details, 'details', 'details')}
            {renderDataSection('Access Information', sparkyData.access, 'access', 'access')}
            {renderDataSection('Electricity Latest', sparkyData.electricityLatest, 'electricityLatest', 'electricityLatest')}
            {renderDataSection('Electricity Latest P1', sparkyData.electricityLatestP1, 'electricityLatestP1', 'electricityLatestP1')}
            {renderDataSection('Electricity First', sparkyData.electricityFirst, 'electricityFirst', 'electricityFirst')}
            {renderDataSection('Electricity 15min', sparkyData.electricity15min, 'electricity15min', 'electricity15min')}
            {renderDataSection('Gas 15min', sparkyData.gas15min, 'gas15min', 'gas15min')}
            {renderDataSection('Total 15min', sparkyData.total15min, 'total15min', 'total15min')}
          </div>
        </div>
      </main>
    </div>
  );
};

export default SparkyDetails;