import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { groupsAPI, addressesAPI, devicesAPI, sparkyAPI } from '../services/api';
import ChargeeLogo from './ChargeeLogo';
import GroupEnergyGraph from './GroupEnergyGraph';
import ScheduleModal from './ScheduleModal';
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
  const isFetchingAnalyticsRef = React.useRef(false);
  const [loading, setLoading] = useState({
    groups: false,
    addresses: false,
    adminQuery: false,
    analytics: false
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
  const [analytics, setAnalytics] = useState(null);
  const [analyticsProgress, setAnalyticsProgress] = useState(null);
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [deviceModalData, setDeviceModalData] = useState(null);
  const [deviceModalLoading, setDeviceModalLoading] = useState(false);
  const [deviceModalSearch, setDeviceModalSearch] = useState('');
  const [groupEnergy, setGroupEnergy] = useState(null);
  const [bulkScheduleModalOpen, setBulkScheduleModalOpen] = useState(false);
  const [steerableInverters, setSteerableInverters] = useState([]);
  const [steerableInvertersCount, setSteerableInvertersCount] = useState(0);
  const [steerableInvertersProgress, setSteerableInvertersProgress] = useState(null);
  const [bulkScheduleLoading, setBulkScheduleLoading] = useState(false);

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

  // Fetch group energy data every second
  useEffect(() => {
    if (!selectedGroup) {
      setGroupEnergy(null);
      return;
    }

    const fetchGroupEnergy = async () => {
      try {
        const data = await groupsAPI.getGroupEnergyLatest(selectedGroup.uuid);
        setGroupEnergy(data);
      } catch (err) {
        console.error('Error fetching group energy:', err);
        // Don't set error state, just log it to avoid disrupting the UI
      }
    };

    // Fetch immediately
    fetchGroupEnergy();

    // Then fetch every second
    const interval = setInterval(fetchGroupEnergy, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup]);

  // Fetch steerable inverters count when group is selected
  useEffect(() => {
    if (!selectedGroup) {
      setSteerableInvertersCount(0);
      setSteerableInvertersProgress(null);
      return;
    }

    const fetchSteerableCount = async () => {
      try {
        setSteerableInvertersProgress({ stage: 'initializing', progress: 0, message: 'Initializing...' });
        const inverters = await fetchAllSteerableInverters((progress) => {
          setSteerableInvertersProgress(progress);
        });
        setSteerableInvertersCount(inverters.length);
        setSteerableInverters(inverters);
        setSteerableInvertersProgress({ stage: 'complete', progress: 100, message: 'Complete!' });
        // Clear progress after a short delay
        setTimeout(() => setSteerableInvertersProgress(null), 500);
      } catch (err) {
        console.error('Error fetching steerable inverters count:', err);
        setSteerableInvertersCount(0);
        setSteerableInvertersProgress(null);
      }
    };

    fetchSteerableCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup]);

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

    // Analytics fetching temporarily removed - Group Analytics tab is hidden
    // if (user?.role === 'extendeduser' || user?.role === 'admin') {
    //   // Check for cached analytics first
    //   const analyticsCacheKey = `analytics_${group.uuid}`;
    //   const cachedAnalytics = localStorage.getItem(analyticsCacheKey);
    //   if (cachedAnalytics) {
    //     try {
    //       const parsed = JSON.parse(cachedAnalytics);
    //       // Check if cache is less than 1 hour old (optional: you can adjust this)
    //       const cacheAge = Date.now() - parsed.timestamp;
    //       const oneHour = 60 * 60 * 1000;
    //       if (cacheAge < oneHour) {
    //         console.log('[handleGroupSelect] Using cached analytics');
    //         setAnalytics(parsed.data);
    //         // Don't call fetchGroupAnalytics at all
    //       } else {
    //         // Cache expired, fetch fresh data
    //         console.log('[handleGroupSelect] Cache expired, fetching analytics');
    //         setAnalytics(null);
    //         fetchGroupAnalytics(group.uuid);
    //       }
    //     } catch (err) {
    //       console.error('Error parsing cached analytics:', err);
    //       setAnalytics(null);
    //       fetchGroupAnalytics(group.uuid);
    //     }
    //   } else {
    //     // No cache, fetch fresh data
    //     console.log('[handleGroupSelect] No cache, fetching analytics');
    //     setAnalytics(null);
    //     fetchGroupAnalytics(group.uuid);
    //   }
    // } else {
    //   // User doesn't have permission, clear analytics
    //   setAnalytics(null);
    // }

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

  // getDeviceTypeName removed - not currently used

  const handleAnalyticsClick = async (deviceType, count) => {
    if (!selectedGroup || count === 0) return;
    
    // Navigate to steerable inverters route instead of opening modal
    if (deviceType === 'steerableInverters') {
      navigate('/steerable-inverters', {
        state: {
          group: selectedGroup
        }
      });
      return;
    }
    
    setDeviceModalOpen(true);
    setDeviceModalLoading(true);
    setDeviceModalData({ type: deviceType, devices: [], count });
    
    try {
      // Fetch all addresses for the group (API doesn't support pagination)
      const addressData = await addressesAPI.getAddresses(selectedGroup.uuid);
      const allAddresses = addressData?.results || [];
      console.log(`[handleAnalyticsClick] Fetched ${allAddresses.length} addresses for ${deviceType}`);

      // Fetch devices from all addresses
      const deviceBatchSize = 50;
      const deviceBatches = Math.ceil(allAddresses.length / deviceBatchSize);
      const allDevices = [];
      
      const extractResults = (data) => Array.isArray(data) ? data : (data?.results || []);
      
      // Handle Sparky's separately (they're part of addresses, not devices)
      if (deviceType === 'sparkies') {
        // Use the addresses we already fetched above
        console.log(`[handleAnalyticsClick] Filtering ${allAddresses.length} addresses for Sparkies`);

        // Filter addresses that have Sparky's and format them for the modal
        const sparkyAddresses = allAddresses
          .filter(address => address.sparky)
          .map(address => ({
            identifier: address.sparky.serialNumber,
            serialNumber: address.sparky.serialNumber,
            boxCode: address.sparky.boxCode,
            addressUuid: address.uuid,
            addressSparky: address.sparky.serialNumber
          }));

        console.log(`[handleAnalyticsClick] Found ${sparkyAddresses.length} Sparkies`);
        setDeviceModalData({
          type: deviceType,
          devices: sparkyAddresses,
          count: sparkyAddresses.length
        });
        setDeviceModalLoading(false);
        return;
      }
      
      // Map device type to API function
      const deviceTypeMap = {
        vehicles: devicesAPI.getVehicles,
        solarInverters: devicesAPI.getSolarInverters,
        batteries: devicesAPI.getBatteries,
        hvacs: devicesAPI.getHvacs,
        chargers: devicesAPI.getChargers,
        smartMeters: devicesAPI.getSmartMeters,
        gridConnections: devicesAPI.getGridConnections
      };
      
      const fetchDeviceFunction = deviceTypeMap[deviceType];
      if (!fetchDeviceFunction) {
        throw new Error(`Unknown device type: ${deviceType}`);
      }
      
      // Process devices in batches
      for (let i = 0; i < deviceBatches; i++) {
        const batchStart = i * deviceBatchSize;
        const batchEnd = Math.min(batchStart + deviceBatchSize, allAddresses.length);
        const addressBatch = allAddresses.slice(batchStart, batchEnd);

        const deviceFetches = addressBatch.map(address => 
          fetchDeviceFunction(address.uuid).catch(() => null)
        );

        const batchResults = await Promise.allSettled(deviceFetches);

        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            try {
              const data = result.value;
              const devices = extractResults(data);
              // Add address info to each device
              devices.forEach(device => {
                allDevices.push({
                  ...device,
                  addressUuid: addressBatch[index].uuid,
                  addressSparky: addressBatch[index].sparky?.serialNumber
                });
              });
            } catch (err) {
              console.error('Error processing device data:', err);
            }
          }
        });
      }

      console.log(`[handleAnalyticsClick] Found ${allDevices.length} ${deviceType}`);
      setDeviceModalData({
        type: deviceType,
        devices: allDevices,
        count: allDevices.length
      });
    } catch (err) {
      console.error('Error fetching devices:', err);
      setDeviceModalData({ 
        type: deviceType, 
        devices: [], 
        count: 0,
        error: err.message || 'Failed to fetch devices'
      });
    } finally {
      setDeviceModalLoading(false);
    }
  };

  const handleCloseDeviceModal = () => {
    setDeviceModalOpen(false);
    setDeviceModalData(null);
    setDeviceModalSearch('');
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

  const fetchAllSteerableInverters = async (onProgress) => {
    if (!selectedGroup) return [];

    const startTime = Date.now();

    try {
      // Fetch all addresses for the group (API doesn't support pagination)
      if (onProgress) {
        onProgress({ stage: 'fetching_addresses', progress: 10, message: 'Fetching addresses...' });
      }
      const addressData = await addressesAPI.getAddresses(selectedGroup.uuid);
      const allAddresses = addressData?.results || [];
      console.log(`[fetchAllSteerableInverters] Fetched ${allAddresses.length} addresses`);

      if (allAddresses.length === 0) {
        if (onProgress) {
          onProgress({ stage: 'complete', progress: 100, message: 'No addresses found' });
        }
        return [];
      }

      // Fetch solar inverters from all addresses
      const deviceBatchSize = 50;
      const deviceBatches = Math.ceil(allAddresses.length / deviceBatchSize);
      const allSteerableInverters = [];
      const inverterKeySet = new Set(); // Track unique inverters by identifier + addressUuid
      
      const extractResults = (data) => Array.isArray(data) ? data : (data?.results || []);

      if (onProgress) {
        onProgress({ 
          stage: 'fetching_inverters', 
          progress: 20, 
          message: `Fetching inverters (0/${allAddresses.length})...`,
          current: 0,
          total: allAddresses.length
        });
      }

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
                      address: addressBatch[index]
                    });
                  }
                }
              });
            } catch (err) {
              console.error('Error processing inverter data:', err);
            }
          }
        });

        // Update progress
        if (onProgress) {
          const processed = Math.min(batchEnd, allAddresses.length);
          const progress = 20 + (processed / allAddresses.length) * 75;
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = processed / elapsed;
          const remaining = allAddresses.length - processed;
          const estimatedSeconds = rate > 0 ? Math.round(remaining / rate) : 0;
          const estimatedTime = estimatedSeconds > 60
            ? `${Math.round(estimatedSeconds / 60)}m ${estimatedSeconds % 60}s`
            : `${estimatedSeconds}s`;

          onProgress({
            stage: 'fetching_inverters',
            progress: Math.min(95, progress),
            message: `Fetching inverters (${processed}/${allAddresses.length})${estimatedSeconds > 0 ? ` - Est. ${estimatedTime} remaining` : ''}...`,
            current: processed,
            total: allAddresses.length
          });
        }
      }

      return allSteerableInverters;
    } catch (err) {
      console.error('Error fetching steerable inverters:', err);
      if (onProgress) {
        onProgress(null);
      }
      return [];
    }
  };

  const handleOpenBulkScheduleModal = async () => {
    setBulkScheduleModalOpen(true);
    // Use cached inverters if available, otherwise fetch (without progress reporting)
    if (steerableInverters.length > 0) {
      // Already have inverters, use them
      return;
    }
    // Fetch steerable inverters when opening modal (no progress reporting for modal)
    const inverters = await fetchAllSteerableInverters(null);
    setSteerableInverters(inverters);
  };

  const handleBulkScheduleSave = async (scheduleData) => {
    if (steerableInverters.length === 0) {
      setError('No steerable inverters found');
      return;
    }

    setBulkScheduleLoading(true);
    setError('');

    try {
      // Send schedule to all inverters in parallel batches
      const batchSize = 10;
      const batches = Math.ceil(steerableInverters.length / batchSize);
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < batches; i++) {
        const batchStart = i * batchSize;
        const batchEnd = Math.min(batchStart + batchSize, steerableInverters.length);
        const batch = steerableInverters.slice(batchStart, batchEnd);

        const schedulePromises = batch.map(inverter => 
          devicesAPI.createSolarInverterSchedule(
            inverter.addressUuid,
            inverter.identifier || inverter.uuid,
            scheduleData
          ).then(() => ({ success: true, inverter }))
          .catch(err => ({ success: false, inverter, error: err }))
        );

        const results = await Promise.allSettled(schedulePromises);
        
        results.forEach(result => {
          if (result.status === 'fulfilled') {
            if (result.value.success) {
              successCount++;
            } else {
              errorCount++;
              console.error(`Error creating schedule for inverter ${result.value.inverter.identifier}:`, result.value.error);
            }
          } else {
            errorCount++;
          }
        });
      }

      if (errorCount > 0) {
        setError(`Schedule created for ${successCount} inverters, but ${errorCount} failed.`);
      } else {
        setError('');
        alert(`Schedule successfully created for all ${successCount} steerable inverters!`);
      }

      setBulkScheduleModalOpen(false);
    } catch (err) {
      console.error('Error creating bulk schedule:', err);
      setError(err.message || 'Failed to create schedules');
    } finally {
      setBulkScheduleLoading(false);
    }
  };

  const fetchGroupAnalytics = async (groupUuid) => {
    if (!groupUuid) return;

    console.log(`[Analytics] fetchGroupAnalytics called for group:`, groupUuid);

    // Prevent concurrent fetches
    if (isFetchingAnalyticsRef.current) {
      console.log('[Analytics] Fetch already in progress, skipping...');
      return;
    }

    console.log(`[Analytics] Starting fetch for group:`, groupUuid);
    isFetchingAnalyticsRef.current = true;
    setLoading(prev => ({ ...prev, analytics: true }));
    setError('');
    setAnalyticsProgress({ stage: 'initializing', progress: 0, message: 'Initializing analytics...' });

    const startTime = Date.now();
    
    try {
      // First, get total count of addresses
      setAnalyticsProgress({ stage: 'counting', progress: 5, message: 'Counting addresses...' });
      const firstPageData = await addressesAPI.getAddresses(groupUuid, { offset: 0, limit: 1 });
      const totalAddresses = firstPageData?.meta?.total || 0;
      console.log(`[Analytics ${groupUuid}] API reports total addresses for this group:`, totalAddresses);
      
      if (totalAddresses === 0) {
        const emptyAnalytics = {
          connectedSparkies: 0,
          reportingSparkies: 0,
          vehicles: 0,
          solarInverters: 0,
          batteries: 0,
          hvacs: 0,
          chargers: 0,
          smartMeters: 0,
          gridConnections: 0,
          totalAddresses: 0,
          sampledAddresses: 0,
          timestamp: Date.now()
        };
        setAnalytics(emptyAnalytics);
        
        // Cache the empty analytics
        const cacheKey = `analytics_${groupUuid}`;
        localStorage.setItem(cacheKey, JSON.stringify({
          data: emptyAnalytics,
          timestamp: Date.now()
        }));

        setLoading(prev => ({ ...prev, analytics: false }));
        setAnalyticsProgress(null);
        isFetchingAnalyticsRef.current = false;
        return;
      }

      // Fetch all addresses for the group in a single call
      // Note: The API doesn't support pagination (offset/limit), so we fetch all at once
      setAnalyticsProgress({
        stage: 'fetching_addresses',
        progress: 10,
        message: `Fetching addresses (0/${totalAddresses})...`,
        current: 0,
        total: totalAddresses
      });

      console.log(`[Analytics ${groupUuid}] Fetching all addresses for group`);
      const addressData = await addressesAPI.getAddresses(groupUuid);
      const allAddresses = addressData?.results || [];
      console.log(`[Analytics ${groupUuid}] Fetched ${allAddresses.length} addresses (expected: ${totalAddresses})`);

      setAnalyticsProgress({
        stage: 'fetching_addresses',
        progress: 30,
        message: `Fetched ${allAddresses.length} addresses`,
        current: allAddresses.length,
        total: totalAddresses
      });

      if (allAddresses.length === 0) {
        setAnalytics({
          connectedSparkies: 0,
          reportingSparkies: 0,
          vehicles: 0,
          solarInverters: 0,
          batteries: 0,
          hvacs: 0,
          totalAddresses,
          sampledAddresses: 0
        });
        setLoading(prev => ({ ...prev, analytics: false }));
        setAnalyticsProgress(null);
        isFetchingAnalyticsRef.current = false;
        return;
      }

      // Count connected Sparky's (addresses with sparky)
      setAnalyticsProgress({
        stage: 'counting_sparkies',
        progress: 30,
        message: 'Counting connected Sparky\'s...'
      });
      console.log(`[Analytics ${groupUuid}] Total addresses fetched:`, allAddresses.length);
      console.log(`[Analytics ${groupUuid}] Addresses with Sparky:`, allAddresses.filter(addr => addr.sparky).length);
      const connectedSparkies = allAddresses.filter(addr => addr.sparky).length;

      // For reporting Sparky's, limit to first 100 to avoid too many API calls
      setAnalyticsProgress({ 
        stage: 'checking_reporting', 
        progress: 35, 
        message: 'Checking reporting Sparky\'s (0/100)...',
        current: 0,
        total: 100
      });
      const sparkyAddresses = allAddresses.filter(addr => addr.sparky?.serialNumber).slice(0, 100);
      const sparkyChecks = sparkyAddresses.map(addr => ({
        serialNumber: addr.sparky.serialNumber,
        check: sparkyAPI.getElectricityLatestP1(addr.sparky.serialNumber).catch(() => null)
      }));

      const sparkyResults = await Promise.allSettled(
        sparkyChecks.map(check => check.check)
      );
      
      const reportingSparkies = sparkyResults.filter(
        result => result.status === 'fulfilled' && result.value !== null
      ).length;

      setAnalyticsProgress({
        stage: 'fetching_devices',
        progress: 50,
        message: 'Fetching device data (0%)...',
        current: 0,
        total: allAddresses.length
      });

      // Fetch ALL device types in a SINGLE loop to avoid overwhelming the API
      const deviceBatchSize = 50;
      const deviceBatches = Math.ceil(allAddresses.length / deviceBatchSize);
      const counters = {
        vehicles: 0,
        solarInverters: 0,
        steerableInverters: 0,
        batteries: 0,
        hvacs: 0,
        chargers: 0,
        smartMeters: 0,
        gridConnections: 0
      };

      const extractResults = (data) => Array.isArray(data) ? data : (data?.results || []);

      console.log(`[Analytics ${groupUuid}] Fetching all device types from ${allAddresses.length} addresses in ${deviceBatches} batches`);

      // Process all device types in one loop to reduce total API calls
      for (let i = 0; i < deviceBatches; i++) {
        const batchStart = i * deviceBatchSize;
        const batchEnd = Math.min(batchStart + deviceBatchSize, allAddresses.length);
        const addressBatch = allAddresses.slice(batchStart, batchEnd);
        console.log(`[Analytics ${groupUuid}] Batch ${i + 1}/${deviceBatches}: processing addresses ${batchStart}-${batchEnd - 1} (${addressBatch.length} addresses)`);

        // Fetch all 7 device types for each address in one Promise.allSettled
        const deviceFetches = addressBatch.map(address =>
          Promise.allSettled([
            devicesAPI.getVehicles(address.uuid),
            devicesAPI.getSolarInverters(address.uuid),
            devicesAPI.getBatteries(address.uuid),
            devicesAPI.getHvacs(address.uuid),
            devicesAPI.getChargers(address.uuid),
            devicesAPI.getSmartMeters(address.uuid),
            devicesAPI.getGridConnections(address.uuid)
          ])
        );

        const batchResults = await Promise.all(deviceFetches);

        let batchCounts = {
          vehicles: 0,
          solarInverters: 0,
          steerableInverters: 0,
          batteries: 0,
          hvacs: 0,
          chargers: 0,
          smartMeters: 0,
          gridConnections: 0
        };

        batchResults.forEach((addressResults) => {
          addressResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
              try {
                const data = result.value;
                const deviceResults = extractResults(data);

                switch (index) {
                  case 0: // vehicles
                    counters.vehicles += deviceResults.length;
                    batchCounts.vehicles += deviceResults.length;
                    break;
                  case 1: // solarInverters
                    counters.solarInverters += deviceResults.length;
                    batchCounts.solarInverters += deviceResults.length;
                    // Count steerable inverters with lastProductionState separately
                    deviceResults.forEach(inverter => {
                      if (inverter.info?.isSteerable === true && inverter.lastProductionState) {
                        counters.steerableInverters += 1;
                        batchCounts.steerableInverters += 1;
                      }
                    });
                    break;
                  case 2: // batteries
                    counters.batteries += deviceResults.length;
                    batchCounts.batteries += deviceResults.length;
                    break;
                  case 3: // hvacs
                    counters.hvacs += deviceResults.length;
                    batchCounts.hvacs += deviceResults.length;
                    break;
                  case 4: // chargers
                    counters.chargers += deviceResults.length;
                    batchCounts.chargers += deviceResults.length;
                    break;
                  case 5: // smartMeters
                    counters.smartMeters += deviceResults.length;
                    batchCounts.smartMeters += deviceResults.length;
                    break;
                  case 6: // gridConnections
                    counters.gridConnections += deviceResults.length;
                    batchCounts.gridConnections += deviceResults.length;
                    break;
                  default:
                    break;
                }
              } catch (err) {
                console.error('Error processing device data:', err);
              }
            }
          });
        });

        console.log(`[Analytics ${groupUuid}] Batch ${i + 1} found:`, batchCounts);

        // Update progress with estimated time
        const processed = Math.min(batchEnd, allAddresses.length);
        const progress = 50 + (processed / allAddresses.length) * 45;
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = processed / elapsed;
        const remaining = allAddresses.length - processed;
        const estimatedSeconds = rate > 0 ? Math.round(remaining / rate) : 0;
        const estimatedTime = estimatedSeconds > 60
          ? `${Math.round(estimatedSeconds / 60)}m ${estimatedSeconds % 60}s`
          : `${estimatedSeconds}s`;

        setAnalyticsProgress({
          stage: 'fetching_devices',
          progress: Math.min(95, progress),
          message: `Fetching device data (${Math.round((processed / allAddresses.length) * 100)}%)${estimatedSeconds > 0 ? ` - Est. ${estimatedTime} remaining` : ''}...`,
          current: processed,
          total: allAddresses.length
        });
      }

      console.log(`[Analytics ${groupUuid}] Total devices found:`, counters);

      setAnalyticsProgress({
        stage: 'calculating',
        progress: 95,
        message: 'Calculating final results...'
      });

      const analyticsData = {
        connectedSparkies: connectedSparkies,
        reportingSparkies: reportingSparkies,
        vehicles: counters.vehicles,
        solarInverters: counters.solarInverters,
        steerableInverters: counters.steerableInverters,
        batteries: counters.batteries,
        hvacs: counters.hvacs,
        chargers: counters.chargers,
        smartMeters: counters.smartMeters,
        gridConnections: counters.gridConnections,
        totalAddresses,
        timestamp: Date.now()
      };

      console.log(`[Analytics ${groupUuid}] Final analytics data:`, analyticsData);

      setAnalytics(analyticsData);

      // Cache the analytics data
      if (groupUuid) {
        const cacheKey = `analytics_${groupUuid}`;
        localStorage.setItem(cacheKey, JSON.stringify({
          data: analyticsData,
          timestamp: Date.now()
        }));
      }

      setAnalyticsProgress({ 
        stage: 'complete', 
        progress: 100, 
        message: 'Analytics complete!' 
      });
      
      // Clear progress after a short delay
      setTimeout(() => setAnalyticsProgress(null), 500);
    } catch (err) {
      setError(`Failed to fetch group analytics: ${err.response?.data?.message || err.message}`);
      console.error('Error fetching group analytics:', err);
      setAnalytics(null);
      setAnalyticsProgress(null);
    } finally {
      setLoading(prev => ({ ...prev, analytics: false }));
      isFetchingAnalyticsRef.current = false;
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
                                          <span className="label">Production:</span>
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

        {/* Group Analytics Section - Temporarily Removed */}

        {/* Steerable Inverters & Energy Section - Full Width */}
        {selectedGroup && (steerableInvertersCount > 0 || steerableInvertersProgress) && (
          <div className="section section-full-width">
            <div className="section-header">
              <h2>Steerable Inverters & Energy</h2>
            </div>
            {steerableInvertersProgress && (
              <div className="analytics-loading">
                <div className="analytics-progress-bar">
                  <div 
                    className="analytics-progress-fill" 
                    style={{ width: `${steerableInvertersProgress?.progress || 0}%` }}
                  ></div>
                </div>
                <div className="analytics-progress-text">
                  {steerableInvertersProgress?.message || 'Loading steerable inverters...'}
                  {steerableInvertersProgress?.current !== undefined && steerableInvertersProgress?.total !== undefined && (
                    <span className="analytics-progress-count">
                      {' '}({steerableInvertersProgress.current.toLocaleString()}/{steerableInvertersProgress.total.toLocaleString()})
                    </span>
                  )}
                </div>
              </div>
            )}
            {steerableInvertersCount > 0 && (
            <div className="steerable-energy-grid">
              <div className="steerable-inverters-card-wrapper">
                <div 
                  className="analytics-card"
                  onClick={() => handleAnalyticsClick('steerableInverters', steerableInvertersCount)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="analytics-content">
                    <div className="analytics-value">{steerableInvertersCount}</div>
                    <div className="analytics-label">Steerable Inverters</div>
                  </div>
                </div>
                <button 
                  className="bulk-schedule-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenBulkScheduleModal();
                  }}
                  disabled={bulkScheduleLoading}
                >
                  {bulkScheduleLoading ? 'Loading...' : 'Schedule All'}
                </button>
              </div>
              
              <div className="group-energy-card">
                <div className="group-energy-content">
                  <div className="group-energy-header">
                    <h3>Total Generation</h3>
                    <span className="energy-update-indicator">Live</span>
                  </div>
                  {groupEnergy ? (
                    <>
                      <div className="energy-values">
                        <div className="energy-item">
                          <span className="energy-label">Production</span>
                          <span className="energy-value production">{groupEnergy.production?.toFixed(1) || '0.0'} W</span>
                        </div>
                        <div className="energy-item">
                          <span className="energy-label">Return</span>
                          <span className="energy-value return">{groupEnergy.return?.toFixed(1) || '0.0'} W</span>
                        </div>
                        <div className="energy-item">
                          <span className="energy-label">Delivery</span>
                          <span className="energy-value delivery">{groupEnergy.delivery?.toFixed(1) || '0.0'} W</span>
                        </div>
                      </div>
                      <GroupEnergyGraph groupEnergy={groupEnergy} />
                    </>
                  ) : (
                    <div className="energy-loading">Loading energy data...</div>
                  )}
                </div>
              </div>
            </div>
            )}
          </div>
        )}

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

      {/* Device List Modal */}
      {deviceModalOpen && (
        <div className="device-modal-overlay" onClick={handleCloseDeviceModal}>
          <div className="device-modal" onClick={(e) => e.stopPropagation()}>
            <div className="device-modal-header">
              <h3>
                {deviceModalData?.type === 'vehicles' && '🚗'}
                {deviceModalData?.type === 'solarInverters' && '☀️'}
                {deviceModalData?.type === 'batteries' && '🔋'}
                {deviceModalData?.type === 'hvacs' && '🌡️'}
                {deviceModalData?.type === 'chargers' && '🔌'}
                {deviceModalData?.type === 'smartMeters' && '📊'}
                {deviceModalData?.type === 'gridConnections' && '⚡'}
                {deviceModalData?.type === 'sparkies' && '⚡'}
                {' '}
                {deviceModalData?.type === 'vehicles' && 'Vehicles'}
                {deviceModalData?.type === 'solarInverters' && 'Solar Inverters'}
                {deviceModalData?.type === 'batteries' && 'Batteries'}
                {deviceModalData?.type === 'hvacs' && 'HVAC Systems'}
                {deviceModalData?.type === 'chargers' && 'Chargers'}
                {deviceModalData?.type === 'smartMeters' && 'Smart Meters'}
                {deviceModalData?.type === 'gridConnections' && 'Grid Connections'}
                {deviceModalData?.type === 'sparkies' && 'Sparky\'s'}
                {deviceModalData?.count !== undefined && ` (${deviceModalData.count.toLocaleString()})`}
              </h3>
                            <button 
                className="close-device-modal-button"
                onClick={handleCloseDeviceModal}
                title="Close"
                            >
                ✕
                            </button>
                          </div>
            <div className="device-modal-content">
              {deviceModalLoading ? (
                <div className="device-modal-loading">Loading devices...</div>
              ) : deviceModalData?.error ? (
                <div className="device-modal-error">Error: {deviceModalData.error}</div>
              ) : deviceModalData?.devices && deviceModalData.devices.length > 0 ? (
                <>
                  {/* Search Box */}
                  <div className="device-modal-search-box">
                    <input
                      type="text"
                      placeholder="Search by identifier, serial number, address, or box code..."
                      value={deviceModalSearch}
                      onChange={(e) => setDeviceModalSearch(e.target.value)}
                      className="device-modal-search-input"
                    />
                    {deviceModalSearch.trim() && (
                      <div className="device-modal-search-count">
                        {(() => {
                          const filtered = deviceModalData.devices.filter(device => {
                            const searchLower = deviceModalSearch.toLowerCase();
                            const identifier = (device.identifier || '').toLowerCase();
                            const serialNumber = (device.serialNumber || '').toLowerCase();
                            const addressUuid = (device.addressUuid || '').toLowerCase();
                            const boxCode = (device.boxCode || '').toLowerCase();
                            const brand = (device.brand || device.info?.brand || '').toLowerCase();
                            const model = (device.model || device.info?.model || '').toLowerCase();
                            const siteName = (device.siteName || '').toLowerCase();
                            const displayName = (device.displayName || '').toLowerCase();
                            const vin = (device.vin || '').toLowerCase();
                            const meterNumber = (device.meterNumber || '').toLowerCase();
                            
                            return identifier.includes(searchLower) ||
                              serialNumber.includes(searchLower) ||
                              addressUuid.includes(searchLower) ||
                              boxCode.includes(searchLower) ||
                              brand.includes(searchLower) ||
                              model.includes(searchLower) ||
                              siteName.includes(searchLower) ||
                              displayName.includes(searchLower) ||
                              vin.includes(searchLower) ||
                              meterNumber.includes(searchLower);
                          });
                          return `Showing ${filtered.length} of ${deviceModalData.devices.length} devices`;
                        })()}
                  </div>
                )}
                  </div>
                  <div className="device-modal-list">
                    {deviceModalData.devices
                      .filter(device => {
                        if (!deviceModalSearch.trim()) return true;
                        const searchLower = deviceModalSearch.toLowerCase();
                        const identifier = (device.identifier || '').toLowerCase();
                        const serialNumber = (device.serialNumber || '').toLowerCase();
                        const addressUuid = (device.addressUuid || '').toLowerCase();
                        const boxCode = (device.boxCode || '').toLowerCase();
                        const brand = (device.brand || device.info?.brand || '').toLowerCase();
                        const model = (device.model || device.info?.model || '').toLowerCase();
                        const siteName = (device.siteName || '').toLowerCase();
                        const displayName = (device.displayName || '').toLowerCase();
                        const vin = (device.vin || '').toLowerCase();
                        const meterNumber = (device.meterNumber || '').toLowerCase();
                        
                        return identifier.includes(searchLower) ||
                          serialNumber.includes(searchLower) ||
                          addressUuid.includes(searchLower) ||
                          boxCode.includes(searchLower) ||
                          brand.includes(searchLower) ||
                          model.includes(searchLower) ||
                          siteName.includes(searchLower) ||
                          displayName.includes(searchLower) ||
                          vin.includes(searchLower) ||
                          meterNumber.includes(searchLower);
                      })
                      .map((device, index) => (
                      <div key={`${device.addressUuid || 'unknown'}_${device.identifier || index}`} className="device-modal-item">
                        <div className="device-modal-item-header">
                          <div className="device-modal-item-title">
                            {device.info?.brand || device.brand || 'Unknown'} {device.info?.model || device.model || ''}
                            {device.siteName && ` - ${device.siteName}`}
                            {device.displayName && ` - ${device.displayName}`}
                            {device.vin && ` (${device.vin})`}
                            {device.meterNumber && ` - Meter #${device.meterNumber}`}
                            </div>
                            <button 
                            className="json-button-small"
                              onClick={(e) => {
                                e.stopPropagation();
                              handleViewDeviceJson(device);
                              }}
                              title="View JSON"
                            >
                              📄
                            </button>
                          </div>
                        <div className="device-modal-item-details">
                          {deviceModalData?.type === 'sparkies' ? (
                            <>
                              <div className="device-modal-item-detail">
                                <span className="label">Serial Number:</span>
                                <span className="value">{device.serialNumber || device.identifier}</span>
                            </div>
                              {device.boxCode && (
                                <div className="device-modal-item-detail">
                                  <span className="label">Box Code:</span>
                                  <span className="value">{device.boxCode}</span>
                  </div>
                )}
                              {device.addressUuid && (
                                <div className="device-modal-item-detail">
                                  <span className="label">Address:</span>
                                  <span className="value uuid">{device.addressUuid}</span>
                              </div>
                            )}
                            </>
                          ) : (
                            <>
                              <div className="device-modal-item-detail">
                                <span className="label">Identifier:</span>
                                <span className="value uuid">{device.identifier}</span>
                          </div>
                              {device.addressUuid && (
                                <div className="device-modal-item-detail">
                                  <span className="label">Address:</span>
                                  <span className="value uuid">{device.addressUuid}</span>
                  </div>
                )}
                              {device.addressSparky && (
                                <div className="device-modal-item-detail">
                                  <span className="label">Sparky:</span>
                                  <span className="value">{device.addressSparky}</span>
                              </div>
                            )}
                            </>
                          )}
                          {device.lastChargeState?.batteryLevel && (
                            <div className="device-modal-item-detail">
                              <span className="label">Battery:</span>
                              <span className="value">
                                {typeof device.lastChargeState.batteryLevel === 'object' 
                                  ? (device.lastChargeState.batteryLevel?.percent || 0)
                                  : (device.lastChargeState.batteryLevel || 0)
                                }%
                              </span>
                  </div>
                )}
                          {device.lastProductionState?.productionRate !== undefined && (
                            <div className="device-modal-item-detail">
                              <span className="label">Production:</span>
                              <span className="value">{device.lastProductionState.productionRate}W</span>
                            </div>
                          )}
                          {device.lastTemperatureState?.currentTemperature !== undefined && (
                            <div className="device-modal-item-detail">
                                <span className="label">Temperature:</span>
                              <span className="value">{device.lastTemperatureState.currentTemperature}°C</span>
                              </div>
                            )}
                          {device.isReachable !== undefined && (
                            <div className="device-modal-item-detail">
                              <span className="label">Status:</span>
                              <span className="value">{device.isReachable ? 'Online' : 'Offline'}</span>
                  </div>
                )}
                          </div>
                        </div>
                      ))}
                    </div>
                </>
              ) : (
                <div className="device-modal-empty">No devices found</div>
              )}
                            </div>
                    </div>
                  </div>
                )}

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

      {/* Bulk Schedule Modal */}
      <ScheduleModal
        isOpen={bulkScheduleModalOpen}
        onClose={() => {
          setBulkScheduleModalOpen(false);
          setSteerableInverters([]);
        }}
        onSave={handleBulkScheduleSave}
        schedule={null}
        bulkMode={true}
        inverterCount={steerableInverters.length}
      />
    </div>
  );
};

export default Dashboard;
