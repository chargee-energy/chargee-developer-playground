import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { addressesAPI, devicesAPI } from '../services/api';
import './SteerableInverters.css';

const SteerableInverters = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const group = location.state?.group;
  
  const [inverters, setInverters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (group) {
      fetchSteerableInverters();
    } else {
      setError('No group selected');
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);

  const fetchSteerableInverters = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Fetch all addresses for the group
      const MAX_ADDRESSES = 1000;
      const firstPageData = await addressesAPI.getAddresses(group.uuid, { offset: 0, limit: 1 });
      const totalAddresses = firstPageData?.meta?.total || 0;
      const addressesToProcess = Math.min(totalAddresses, MAX_ADDRESSES);
      
      // Fetch addresses in batches
      const batchSize = 100;
      const batches = Math.ceil(addressesToProcess / batchSize);
      let allAddresses = [];
      const addressUuidSet = new Set(); // Track unique addresses
      
      for (let i = 0; i < batches; i++) {
        const offset = i * batchSize;
        const limit = Math.min(batchSize, addressesToProcess - offset);
        const batchData = await addressesAPI.getAddresses(group.uuid, { offset, limit });
        const batchResults = batchData?.results || [];
        // Deduplicate addresses by UUID
        batchResults.forEach(address => {
          if (address.uuid && !addressUuidSet.has(address.uuid)) {
            addressUuidSet.add(address.uuid);
            allAddresses.push(address);
          }
        });
      }

      // Fetch solar inverters from all addresses
      const deviceBatchSize = 50;
      const deviceBatches = Math.ceil(allAddresses.length / deviceBatchSize);
      const allSteerableInverters = [];
      const inverterKeySet = new Set(); // Track unique inverters by identifier + addressUuid
      
      const extractResults = (data) => Array.isArray(data) ? data : (data?.results || []);

      for (let i = 0; i < deviceBatches; i++) {
        const batchStart = i * deviceBatchSize;
        const batchEnd = Math.min(batchStart + deviceBatchSize, allAddresses.length);
        const addressBatch = allAddresses.slice(batchStart, batchEnd);

        const inverterFetches = addressBatch.map(address => 
          devicesAPI.getSolarInverters(address.uuid).catch(() => null)
        );

        const batchResults = await Promise.allSettled(inverterFetches);

        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            try {
              const data = result.value;
              const inverters = extractResults(data);
              
              // Filter for steerable inverters with lastProductionState and add address info
              inverters.forEach(inverter => {
                if (inverter.info?.isSteerable === true && inverter.lastProductionState) {
                  const addressUuid = addressBatch[index].uuid;
                  const inverterKey = `${inverter.identifier || inverter.uuid}-${addressUuid}`;
                  
                  // Only add if we haven't seen this inverter+address combination before
                  if (!inverterKeySet.has(inverterKey)) {
                    inverterKeySet.add(inverterKey);
                    allSteerableInverters.push({
                      ...inverter,
                      addressUuid: addressUuid,
                      address: addressBatch[index],
                      sparkySerialNumber: addressBatch[index].sparky?.serialNumber
                    });
                  }
                }
              });
            } catch (err) {
              console.error('Error processing inverter data:', err);
            }
          }
        });
      }

      // Sort by most recent reporting (lastProductionState.time or info.lastSeen)
      const sortedInverters = allSteerableInverters.sort((a, b) => {
        // Get the most recent timestamp for each inverter
        const getMostRecentTime = (inverter) => {
          const productionTime = inverter.lastProductionState?.time 
            ? new Date(inverter.lastProductionState.time).getTime() 
            : 0;
          const lastSeenTime = inverter.info?.lastSeen 
            ? new Date(inverter.info.lastSeen).getTime() 
            : 0;
          return Math.max(productionTime, lastSeenTime);
        };
        
        const timeA = getMostRecentTime(a);
        const timeB = getMostRecentTime(b);
        
        // Sort descending (most recent first)
        return timeB - timeA;
      });
      
      setInverters(sortedInverters);
    } catch (err) {
      console.error('Error fetching steerable inverters:', err);
      setError(err.message || 'Failed to fetch steerable inverters');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToDashboard = () => {
    navigate('/dashboard');
  };

  const handleInverterClick = (inverter) => {
    navigate('/inverter-detail', {
      state: {
        inverter: inverter,
        address: inverter.address,
        group: group
      }
    });
  };

  const formatTimeAgo = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      const now = Date.now();
      const diff = now - date.getTime();
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
      } else if (seconds > 0) {
        return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
      } else {
        return 'just now';
      }
    } catch {
      return 'N/A';
    }
  };

  if (!group) {
    return (
      <div className="steerable-inverters">
        <div className="error-state">
          <h2>No Group Information</h2>
          <p>Unable to load steerable inverters.</p>
          <button onClick={handleBackToDashboard} className="back-button">
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
          <button onClick={handleBackToDashboard} className="back-button">
            ← Back to Dashboard
          </button>
          <h1>Steerable Inverters</h1>
        </div>
      </header>

      <main className="steerable-main">
        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="loading">Loading steerable inverters...</div>
        ) : inverters.length === 0 ? (
          <div className="empty-state">
            <p>No steerable inverters found in this group.</p>
          </div>
        ) : (
          <div className="inverters-list">
            {inverters.map((inverter) => (
              <div
                key={`${inverter.addressUuid}-${inverter.identifier}`}
                className="inverter-card"
                onClick={() => handleInverterClick(inverter)}
              >
                <div className="inverter-header">
                  <div className="inverter-title">
                    <h3>{inverter.info?.brand || 'Unknown'} {inverter.info?.model || ''}</h3>
                    {inverter.info?.siteName && (
                      <span className="inverter-site">{inverter.info.siteName}</span>
                    )}
                  </div>
                </div>
                
                <div className="inverter-details">
                  {inverter.lastProductionState && (
                    <>
                      <div className="detail-row main-stats">
                        <div className="detail-item production-rate">
                          <span className="label">Production Rate</span>
                          <span className="value large">{inverter.lastProductionState.productionRate || 0} W</span>
                        </div>
                        <div className="detail-item producing-status">
                          <span className="label">Status</span>
                          <span className={`value status-badge ${inverter.lastProductionState.isProducing ? 'producing' : 'not-producing'}`}>
                            {inverter.lastProductionState.isProducing ? 'Producing' : 'Not Producing'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="detail-row time-info">
                        <div className="detail-item">
                          <span className="label">Last Update:</span>
                          <span className="value">{formatTimeAgo(inverter.lastProductionState.time)}</span>
                        </div>
                        {inverter.info?.lastSeen && (
                          <div className="detail-item">
                            <span className="label">Present:</span>
                            <span className="value">{formatTimeAgo(inverter.info.lastSeen)}</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  
                  {!inverter.lastProductionState && (
                    <div className="detail-row">
                      <div className="detail-item">
                        <span className="label">No production data available</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default SteerableInverters;

