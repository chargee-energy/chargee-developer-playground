import React, { useState, useEffect, useRef } from 'react';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { sparkyAPI, devicesAPI } from '../services/api';
import './InverterGraph.css';

const InverterGraph = ({ addressUuid, solarInverterUuid, sparkySerialNumber }) => {
  const [graphData, setGraphData] = useState([]);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState('');
  const intervalRef = useRef(null);
  const maxDataPoints = 60; // Keep last 60 seconds of data

  const fetchData = async () => {
    if (!addressUuid || !solarInverterUuid) return;

    try {
      // Fetch P1 data and production rate in parallel
      const [p1Data, inverterData] = await Promise.allSettled([
        sparkySerialNumber ? sparkyAPI.getElectricityLatestP1(sparkySerialNumber) : Promise.resolve(null),
        devicesAPI.getSolarInverters(addressUuid)
      ]);

      let generation = 0; // power_delivered (consumption from grid)
      let returnPower = 0; // power_returned (export to grid)
      let productionRate = 0;

      // Process P1 data
      if (p1Data.status === 'fulfilled' && p1Data.value) {
        const data = p1Data.value;
        if (data.power_delivered !== undefined && data.power_returned !== undefined) {
          // Convert from kW to W
          generation = (typeof data.power_delivered === 'number' ? data.power_delivered : parseFloat(data.power_delivered) || 0) * 1000;
          returnPower = (typeof data.power_returned === 'number' ? data.power_returned : parseFloat(data.power_returned) || 0) * 1000;
        }
      }

      // Process inverter data to get production rate
      if (inverterData.status === 'fulfilled' && inverterData.value) {
        const inverters = Array.isArray(inverterData.value) ? inverterData.value : (inverterData.value?.results || []);
        const inverter = inverters.find(inv => inv.identifier === solarInverterUuid);
        if (inverter?.lastProductionState?.productionRate !== undefined) {
          productionRate = typeof inverter.lastProductionState.productionRate === 'number' 
            ? inverter.lastProductionState.productionRate 
            : parseFloat(inverter.lastProductionState.productionRate) || 0;
        }
      }

      const timestamp = new Date().toLocaleTimeString();
      
      setGraphData(prevData => {
        const newDataPoint = {
          time: timestamp,
          generation: generation,
          return: returnPower,
          productionRate: productionRate,
          timestamp: Date.now()
        };
        
        // Add new data point and keep only the last maxDataPoints
        const updatedData = [...prevData, newDataPoint];
        return updatedData.length > maxDataPoints 
          ? updatedData.slice(-maxDataPoints) 
          : updatedData;
      });
      
      setError('');
    } catch (err) {
      console.error('Error fetching inverter data:', err);
      setError('Failed to fetch data');
    }
  };

  const startRealtimeUpdates = () => {
    if (intervalRef.current) return;
    
    setIsActive(true);
    setError('');
    
    // Fetch immediately
    fetchData();
    
    // Then fetch every second
    intervalRef.current = setInterval(fetchData, 1000);
  };

  const stopRealtimeUpdates = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsActive(false);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const formatPowerValue = (value) => {
    const numValue = typeof value === 'number' ? value : parseFloat(value) || 0;
    return `${numValue.toFixed(0)} W`;
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip">
          <p className="tooltip-time">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="tooltip-item" style={{ color: entry.color }}>
              <span className="label">{entry.name}:</span>
              <span className="value">{formatPowerValue(entry.value)}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="inverter-graph-container">
      <div className="graph-header">
        <div className="graph-title">
          <h3>Real-time Generation & Production</h3>
        </div>
        <div className="graph-controls">
          <button
            className={`control-button ${isActive ? 'stop' : 'start'}`}
            onClick={isActive ? stopRealtimeUpdates : startRealtimeUpdates}
          >
            {isActive ? '⏸️ Stop' : '▶️ Start'}
          </button>
          <button
            className="control-button clear"
            onClick={() => setGraphData([])}
            disabled={graphData.length === 0}
          >
            🗑️ Clear
          </button>
        </div>
      </div>

      {error && (
        <div className="graph-error">
          {error}
        </div>
      )}

      <div className="graph-content">
        {graphData.length === 0 ? (
          <div className="no-data">
            <p>No data available. Click "Start" to begin real-time monitoring.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={graphData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis 
                dataKey="time" 
                stroke="#666"
                fontSize={12}
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis 
                stroke="#666"
                fontSize={12}
                tick={{ fontSize: 10 }}
                label={{ value: 'Power (W)', angle: -90, position: 'insideLeft' }}
                domain={['dataMin - 100', 'dataMax + 100']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              
              {/* Generation line (power_delivered) */}
              <Line
                type="monotone"
                dataKey="generation"
                name="Generation (Consumption)"
                stroke="#FF9800"
                strokeWidth={2}
                dot={false}
                animationDuration={0}
              />
              
              {/* Return line (power_returned) */}
              <Line
                type="monotone"
                dataKey="return"
                name="Return (Export)"
                stroke="#4CAF50"
                strokeWidth={2}
                dot={false}
                animationDuration={0}
              />
              
              {/* Production Rate line */}
              <Line
                type="monotone"
                dataKey="productionRate"
                name="Production Rate"
                stroke="#2196F3"
                strokeWidth={2}
                dot={false}
                animationDuration={0}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="graph-info">
        <div className="info-item">
          <span className="info-label">Data Points:</span>
          <span className="info-value">{graphData.length}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Status:</span>
          <span className={`info-value ${isActive ? 'active' : 'inactive'}`}>
            {isActive ? 'Live' : 'Paused'}
          </span>
        </div>
        <div className="info-item">
          <span className="info-label">Update Rate:</span>
          <span className="info-value">1 second</span>
        </div>
      </div>
    </div>
  );
};

export default InverterGraph;




