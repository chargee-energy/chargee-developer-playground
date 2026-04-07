import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { groupsAPI, addressesAPI, devicesAPI, sparkyAPI } from '../services/api';
import ChargeeLogo from './ChargeeLogo';
import './Dashboard.css';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [groups, setGroups] = useState([]);
  const [addresses, setAddresses] = useState([]);
  // Devices state removed - now handled in DevicesDetails component
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [loading, setLoading] = useState({
    groups: false,
    addresses: false,
    adminQuery: false,
  });
  const [error, setError] = useState('');
  const [adminQuery, setAdminQuery] = useState('');
  const [adminQueryResult, setAdminQueryResult] = useState(null);
  const [addressSearch, setAddressSearch] = useState('');
  const [addressPage, setAddressPage] = useState(1);
  const [addressTotal, setAddressTotal] = useState(0);
  const [addressesTimestamp, setAddressesTimestamp] = useState(null);
  const addressesPerPage = 50; // Increased page size for better performance
  // addressesMeta removed - not currently used
  const [searchDebounceTimer, setSearchDebounceTimer] = useState(null);
  const [jsonModalOpen, setJsonModalOpen] = useState(false);
  const [selectedDeviceJson, setSelectedDeviceJson] = useState(null);
  // Fetch groups on mount
  useEffect(() => {
    fetchGroups();
  }, []);

  // Restore selection from URL after groups load, or auto-select if only 1 group
  useEffect(() => {
    console.log('[useEffect] Groups changed, length:', groups.length, 'selectedGroup:', selectedGroup?.uuid);
    if (groups.length === 0 || selectedGroup) {
      console.log('[useEffect] Early return - no groups or already selected');
      return;
    }

    // If there's exactly 1 group, always select it
    if (groups.length === 1) {
      console.log('[useEffect] Auto-selecting single group');
      const group = groups[0];
      handleGroupSelect(group);
      return;
    }

    // Otherwise, restore from URL params (previously selected group)
    const groupUuid = searchParams.get('group');
    if (groupUuid) {
      const group = groups.find(g => g.uuid === groupUuid);
      if (group) {
        console.log('[useEffect] Restoring group from URL');
        handleGroupSelect(group);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]); // Only depend on groups, not searchParams

  // Restore address selection after addresses load
  useEffect(() => {
    const addressUuid = searchParams.get('address');
    
    if (addressUuid && addresses.length > 0 && !selectedAddress && selectedGroup) {
      const address = addresses.find(a => a.uuid === addressUuid);
      if (address) {
        setSelectedAddress(address);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses, selectedGroup, searchParams]);

  // Update URL when selection changes
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedGroup) {
      params.set('group', selectedGroup.uuid);
    }
    if (selectedAddress) {
      params.set('address', selectedAddress.uuid);
    }
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup, selectedAddress]);

  const fetchGroups = async () => {
    setLoading(prev => ({ ...prev, groups: true }));
    setError('');
    try {
      const data = await groupsAPI.getGroups();
      console.log('Groups API response:', data); // Debug log
      // Handle the actual API response structure: { meta: {...}, results: [...] }
      const groupsArray = data?.results || [];
      setGroups(groupsArray);
    } catch (err) {
      setError('Failed to fetch groups');
      console.error('Error fetching groups:', err);
      setGroups([]); // Ensure groups is always an array
    } finally {
      setLoading(prev => ({ ...prev, groups: false }));
    }
  };

  const fetchAddresses = async (groupUuid, page = 1, limit = addressesPerPage, useCache = true) => {
    // Check cache first if useCache is true
    if (useCache && page === 1) {
      const cacheKey = `addresses_${groupUuid}_page_${page}`;
      const cachedData = localStorage.getItem(cacheKey);
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData);
          // Check if cache is less than 1 hour old
          const cacheAge = Date.now() - parsed.timestamp;
          const oneHour = 60 * 60 * 1000;
          if (cacheAge < oneHour) {
            setAddresses(parsed.data.addresses);
            setAddressTotal(parsed.data.total);
            setAddressesTimestamp(parsed.timestamp);
            setSelectedAddress(null);
            return; // Use cached data, don't fetch
          }
        } catch (err) {
          console.error('Error parsing cached addresses:', err);
        }
      }
    }

    setLoading(prev => ({ ...prev, addresses: true }));
    setError('');
    try {
      const offset = (page - 1) * limit;
      const data = await addressesAPI.getAddresses(groupUuid, { offset, limit });
      console.log('Addresses API response:', data); // Debug log
      console.log('Addresses array:', data?.results); // Debug log
      console.log('Total count:', data?.meta?.total); // Debug log
      // Handle the actual API response structure: { meta: {...}, results: [...] }
      const addressesArray = data?.results || [];
      const total = data?.meta?.total || 0;
      console.log('Processed addresses array:', addressesArray); // Debug log
      const timestamp = Date.now();
      setAddresses(addressesArray);
      setAddressTotal(total);
      setAddressesTimestamp(timestamp);
      setSelectedAddress(null);

      // Cache the addresses data (only for first page)
      if (page === 1) {
        const cacheKey = `addresses_${groupUuid}_page_${page}`;
        localStorage.setItem(cacheKey, JSON.stringify({
          data: {
            addresses: addressesArray,
            total: total
          },
          timestamp: timestamp
        }));
      }
    } catch (err) {
      setError('Failed to fetch addresses');
      console.error('Error fetching addresses:', err);
      setAddresses([]); // Ensure addresses is always an array
      setAddressTotal(0);
      setAddressesTimestamp(null);
    } finally {
      setLoading(prev => ({ ...prev, addresses: false }));
    }
  };

  // fetchDevices removed - now handled in DevicesDetails component

  const handleGroupSelect = (group) => {
    console.log('[handleGroupSelect] Called for group:', group.uuid);
    setSelectedGroup(group);
    setSelectedAddress(null); // Clear selected address when changing groups
    setAddressSearch('');
    setAddressPage(1);

    // Fetch addresses (will check cache internally)
    fetchAddresses(group.uuid, 1);
  };

  const handleAddressSelect = (address) => {
    setSelectedAddress(address);
    // Address selection is now just for highlighting, devices are shown in separate screen
  };

  const handleLogout = () => {
    logout();
  };

  const handleViewHousehold = (address) => {
    if (address.sparky) {
      navigate('/sparky-details', {
        state: {
          sparky: address.sparky,
          address: address,
          group: selectedGroup
        }
      });
    }
  };

  const handleViewDevices = (address) => {
    navigate('/devices-details', {
      state: {
        address: address,
        group: selectedGroup
      }
    });
  };

  const handleViewDeviceJson = (device) => {
    setSelectedDeviceJson(device);
    setJsonModalOpen(true);
  };

  const handleCloseJsonModal = () => {
    setJsonModalOpen(false);
    setSelectedDeviceJson(null);
  };

  const formatTimeAgo = (timestamp) => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else {
      return 'just now';
    }
  };

  const handleCopyJson = () => {
    if (selectedDeviceJson) {
      const jsonString = JSON.stringify(selectedDeviceJson, null, 2);
      navigator.clipboard.writeText(jsonString).then(() => {
        // Optional: show a brief success message
        alert('JSON copied to clipboard!');
      }).catch(err => {
        console.error('Failed to copy JSON:', err);
      });
    }
  };

  const handleAdminQuery = async () => {
    if (!adminQuery.trim()) return;
    
    setLoading(prev => ({ ...prev, adminQuery: true }));
    setError('');
    setAdminQueryResult(null);
    
    try {
      const query = adminQuery.trim();
      
      // Try to determine if it's a Sparky serial number or address UUID
      // Sparky serial numbers are typically alphanumeric (e.g., "6055F9C9D650")
      // Address UUIDs are typically UUID format
      const isSparkySerial = /^[A-Z0-9]+$/.test(query) && query.length >= 10;
      
      if (isSparkySerial) {
        // Query Sparky device
        const sparkyData = await sparkyAPI.getSparkyDetails(query);
        setAdminQueryResult({
          type: 'sparky',
          data: sparkyData
        });
      } else {
        // Query address devices
        const [vehiclesData, chargersData, solarInvertersData, smartMetersData, hvacsData, batteriesData, gridConnectionsData] = await Promise.all([
          devicesAPI.getVehicles(query),
          devicesAPI.getChargers(query),
          devicesAPI.getSolarInverters(query),
          devicesAPI.getSmartMeters(query),
          devicesAPI.getHvacs(query),
          devicesAPI.getBatteries(query),
          devicesAPI.getGridConnections(query)
        ]);
        
        // Extract results from each API response (handle both { results: [...] } and direct array)
        const extractResults = (data) => Array.isArray(data) ? data : (data?.results || []);
        
        setAdminQueryResult({
          type: 'address',
          data: {
            vehicles: extractResults(vehiclesData),
            chargers: extractResults(chargersData),
            solarInverters: extractResults(solarInvertersData),
            smartMeters: extractResults(smartMetersData),
            hvacs: extractResults(hvacsData),
            batteries: extractResults(batteriesData),
            gridConnections: extractResults(gridConnectionsData)
          }
        });
      }
    } catch (err) {
      setError(`Failed to query ${adminQuery}: ${err.response?.data?.message || err.message}`);
      console.error('Admin query error:', err);
    } finally {
      setLoading(prev => ({ ...prev, adminQuery: false }));
    }
  };

  // Filter and paginate addresses
  // Debounced search effect
  useEffect(() => {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }

    const timer = setTimeout(() => {
      if (selectedGroup) {
        setAddressPage(1); // Reset to first page on search
        fetchAddresses(selectedGroup.uuid, 1, addressesPerPage, false);
      }
    }, 500); // 500ms debounce

    setSearchDebounceTimer(timer);

    return () => {
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressSearch, selectedGroup]);

  // Filter addresses client-side for current page (for search functionality)
  const filteredAddresses = useMemo(() => {
    if (!addressSearch.trim()) return addresses;
    const searchLower = addressSearch.toLowerCase();
    return addresses.filter((address) => {
    return (
      address.uuid.toLowerCase().includes(searchLower) ||
      address.sparky?.serialNumber?.toLowerCase().includes(searchLower) ||
      address.sparky?.boxCode?.toLowerCase().includes(searchLower)
    );
  });
  }, [addresses, addressSearch]);

  const totalPages = Math.ceil((addressTotal || filteredAddresses.length) / addressesPerPage);
  const startIndex = (addressPage - 1) * addressesPerPage;
  const endIndex = startIndex + filteredAddresses.length;
  const paginatedAddresses = filteredAddresses;

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <ChargeeLogo size="medium" className="dashboard-logo" />
          <h1>Chargee Developer Playground</h1>
          <div className="user-info">
            <div className="user-details">
              <span>Welcome, {user?.email || 'User'}</span>
              {user?.role && (
                <span className={`role-badge role-${user.role}`}>
                  {user.role.toUpperCase()}
                </span>
              )}
            </div>
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        {error && <div className="error-banner">{error}</div>}

        {/* Admin Section */}
        {user?.role === 'admin' && (
          <div className="admin-section">
            <h2>🔧 Admin Tools</h2>
            <div className="admin-tools">
              <div className="query-box">
                <h3>Direct Query</h3>
                <p>Query any address or Sparky device directly by UUID/Serial</p>
                <div className="query-controls">
                  <input
                    type="text"
                    placeholder="Enter Address UUID or Sparky Serial Number"
                    value={adminQuery}
                    onChange={(e) => setAdminQuery(e.target.value)}
                    className="query-input"
                  />
                  <button 
                    onClick={handleAdminQuery}
                    disabled={!adminQuery.trim() || loading.adminQuery}
                    className="query-button"
                  >
                    {loading.adminQuery ? 'Querying...' : 'Query'}
                  </button>
                </div>
                {adminQueryResult && (
                  <div className="query-result">
                    <h4>Query Result:</h4>
                    {adminQueryResult.type === 'sparky' ? (
                      <div className="sparky-result">
                        <h5>🔌 Sparky Device Details</h5>
                        <div className="sparky-info">
                          <div className="info-item">
                            <span className="label">Serial Number:</span>
                            <span className="value">{adminQueryResult.data?.serialNumber || 'N/A'}</span>
                          </div>
                          <div className="info-item">
                            <span className="label">Box Code:</span>
                            <span className="value">{adminQueryResult.data?.boxCode || 'N/A'}</span>
                          </div>
                          <div className="info-item">
                            <span className="label">Status:</span>
                            <span className="value">{adminQueryResult.data?.status || 'Unknown'}</span>
                          </div>
                        </div>
                        <button 
                          className="view-sparky-button"
                          onClick={() => {
                            navigate('/sparky-details', {
                              state: {
                                sparky: adminQueryResult.data,
                                address: null,
                                group: null
                              }
                            });
                          }}
                        >
                          View Full Sparky Details
                        </button>
                      </div>
                    ) : (
                      <div className="address-result">
                        <h5>🏠 Address Devices</h5>
                        <div className="devices-container">
                          {/* Vehicles */}
                          {adminQueryResult.data.vehicles?.length > 0 && (
                            <div className="device-category">
                              <h3>🚗 Vehicles ({adminQueryResult.data.vehicles.length})</h3>
                              <div className="device-list">
                                {adminQueryResult.data.vehicles.map((vehicle) => (
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
                          {adminQueryResult.data.chargers?.length > 0 && (
                            <div className="device-category">
                              <h3>🔌 Chargers ({adminQueryResult.data.chargers.length})</h3>
                              <div className="device-list">
                                {adminQueryResult.data.chargers.map((charger) => (
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
                          {adminQueryResult.data.solarInverters?.length > 0 && (
                            <div className="device-category">
                              <h3>☀️ Solar Inverters ({adminQueryResult.data.solarInverters.length})</h3>
                              <div className="device-list">
                                {adminQueryResult.data.solarInverters.map((inverter) => (
                                  <div key={inverter.identifier} className="device-card solar-card">
                                    <div className="device-header">
                                      <div>
                                        <span className="device-brand">{inverter.brand}</span>
                                        <span className="device-model">{inverter.model}</span>
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
                                        <span className="label">Site:</span>
                                        <span className="value">{inverter.siteName}</span>
                                      </div>
                                      <div className="detail-item">
                                        <span className="label">Status:</span>
                                        <span className="value">{inverter.isReachable ? 'Online' : 'Offline'}</span>
                                      </div>
                          {inverter.lastProductionState && (
                            <div className="detail-item">
                              <span className="label">PV Production:</span>
                              <span className="value">{inverter.lastProductionState.productionRate}W</span>
                            </div>
                          )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Smart Meters */}
                          {adminQueryResult.data.smartMeters?.length > 0 && (
                            <div className="device-category">
                              <h3>📊 Smart Meters ({adminQueryResult.data.smartMeters.length})</h3>
                              <div className="device-list">
                                {adminQueryResult.data.smartMeters.map((meter) => (
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
                          {adminQueryResult.data.hvacs?.length > 0 && (
                            <div className="device-category">
                              <h3>🌡️ HVAC Systems ({adminQueryResult.data.hvacs.length})</h3>
                              <div className="device-list">
                                {adminQueryResult.data.hvacs.map((hvac) => (
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
                          {adminQueryResult.data.batteries?.length > 0 && (
                            <div className="device-category">
                              <h3>🔋 Batteries ({adminQueryResult.data.batteries.length})</h3>
                              <div className="device-list">
                                {adminQueryResult.data.batteries.map((battery) => (
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
                          {adminQueryResult.data.gridConnections?.length > 0 && (
                            <div className="device-category">
                              <h3>⚡ Grid Connections ({adminQueryResult.data.gridConnections.length})</h3>
                              <div className="device-list">
                                {adminQueryResult.data.gridConnections.map((connection) => (
                                  <div key={connection.identifier} className="device-card grid-card">
                                    <div className="device-header">
                                      <div>
                                        <span className="device-brand">Grid Connection</span>
                                        <span className="device-model">Type {connection.type}</span>
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
                          {Object.values(adminQueryResult.data).every(deviceArray => !deviceArray || deviceArray.length === 0) && (
                            <div className="placeholder">No devices found for this address</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Groups Section - Full Width */}
        <div className="section section-full-width">
          <div className="section-header">
            <h2>Groups</h2>
            {selectedGroup && (
              <button
                type="button"
                className="devices-button"
                onClick={() =>
                  navigate('/group-solar-analytics', { state: { group: selectedGroup } })
                }
              >
                Solar Analytics
              </button>
            )}
          </div>
            {loading.groups ? (
              <div className="loading">Loading groups...</div>
            ) : Array.isArray(groups) && groups.length > 0 ? (
              <div className="list">
                {groups.map((group) => (
                  <div
                    key={group.uuid}
                    className={`list-item ${selectedGroup?.uuid === group.uuid ? 'selected' : ''}`}
                    onClick={() => handleGroupSelect(group)}
                  >
                    <div className="item-title">{group.name}</div>
                    <div className="item-subtitle uuid">{group.uuid}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="placeholder">No groups found</div>
            )}
          </div>

        {/* Addresses Section - Full Width */}
        <div className="section section-full-width">
            <div className="section-header">
              <h2>Addresses</h2>
            <div className="addresses-header-actions">
              {selectedGroup && addressTotal > 0 && (
                <span className="section-count">({addressTotal.toLocaleString()} total)</span>
              )}
              {addressesTimestamp && (
                <>
                  <span className="addresses-timestamp">
                    Last updated: {formatTimeAgo(addressesTimestamp)}
                  </span>
                  <button 
                    className="refresh-addresses-button"
                    onClick={() => {
                      if (selectedGroup) {
                        fetchAddresses(selectedGroup.uuid, addressPage, addressesPerPage, false);
                      }
                    }}
                    disabled={loading.addresses}
                    title="Refresh addresses"
                  >
                    🔄 Refresh
                  </button>
                </>
              )}
            </div>
            </div>
            {!selectedGroup ? (
              <div className="placeholder">Select a group to view addresses</div>
            ) : loading.addresses ? (
              <div className="loading">Loading addresses...</div>
            ) : Array.isArray(addresses) && addresses.length > 0 ? (
              <>
                {/* Search Box */}
                <div className="search-box">
                  <input
                    type="text"
                    placeholder="Search by UUID, serial number, or box code..."
                    value={addressSearch}
                    onChange={(e) => {
                      setAddressSearch(e.target.value);
                    }}
                    className="search-input"
                  />
                </div>

                {/* Addresses List */}
                <div className="list">
                  {paginatedAddresses.length > 0 ? (
                    paginatedAddresses.map((address) => (
                      <div
                        key={address.uuid}
                        className={`list-item ${selectedAddress?.uuid === address.uuid ? 'selected' : ''}`}
                      >
                        <div 
                          className="address-content"
                          onClick={() => handleAddressSelect(address)}
                        >
                          <div className="item-title uuid">{address.uuid}</div>
                          <div className="item-subtitle">Sparky: {address.sparky?.serialNumber || 'Unknown'}</div>
                          <div className="item-details">
                            <span className="status">Box: {address.sparky?.boxCode || 'N/A'}</span>
                          </div>
                        </div>
                        <div className="address-actions">
                        {address.sparky && (
                          <button 
                              className="household-button"
                            onClick={(e) => {
                              e.stopPropagation();
                                handleViewHousehold(address);
                            }}
                          >
                              Household
                          </button>
                        )}
                          <button 
                            className="devices-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewDevices(address);
                            }}
                          >
                            Devices
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="placeholder">No addresses match your search</div>
                  )}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="pagination">
                    <div className="pagination-controls">
                      <button
                        onClick={() => {
                          const newPage = Math.max(1, addressPage - 1);
                          setAddressPage(newPage);
                          if (selectedGroup && !addressSearch.trim()) {
                            fetchAddresses(selectedGroup.uuid, newPage, addressesPerPage, false);
                          }
                        }}
                        disabled={addressPage === 1 || loading.addresses}
                        className="pagination-button"
                      >
                        Previous
                      </button>
                      <span className="pagination-info">
                        Showing {startIndex + 1}-{Math.min(endIndex, addressTotal || filteredAddresses.length)} of {addressTotal || filteredAddresses.length} addresses
                        {addressTotal > 0 && ` (Page ${addressPage} of ${totalPages})`}
                      </span>
                      <button
                        onClick={() => {
                          const newPage = addressPage + 1;
                          setAddressPage(newPage);
                          if (selectedGroup && !addressSearch.trim()) {
                            fetchAddresses(selectedGroup.uuid, newPage, addressesPerPage, false);
                          }
                        }}
                        disabled={addressPage >= totalPages || loading.addresses}
                        className="pagination-button"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="placeholder">No addresses found</div>
            )}
          </div>

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

export default Dashboard;
