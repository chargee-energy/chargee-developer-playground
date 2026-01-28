import React, { useState, useEffect, useRef } from 'react';
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { sparkyAPI } from '../services/api';
import './EnergyGraph.css';

const EnergyGraph = ({ sparkySerialNumber }) => {
  const [powerData, setPowerData] = useState([]);
  const [isActive, setIsActive] = useState(false);
  const [currentPower, setCurrentPower] = useState(0);
  const [error, setError] = useState('');
  const intervalRef = useRef(null);
  const maxDataPoints = 60; // Keep last 60 seconds of data

  const fetchPowerData = async () => {
    if (!sparkySerialNumber) return;

    try {
      const data = await sparkyAPI.getElectricityLatestP1(sparkySerialNumber);
      
      if (data && data.power_delivered !== undefined && data.power_returned !== undefined) {
        // Ensure power values are numbers and convert from kW to W
        const delivered = (typeof data.power_delivered === 'number' ? data.power_delivered : parseFloat(data.power_delivered) || 0) * 1000;
        const returned = (typeof data.power_returned === 'number' ? data.power_returned : parseFloat(data.power_returned) || 0) * 1000;
        const netPower = delivered - returned;
        const timestamp = new Date().toLocaleTimeString();
        
        setCurrentPower(netPower);
        
        setPowerData(prevData => {
          const newDataPoint = {
            time: timestamp,
            power: netPower,
            delivered: delivered,
            returned: returned,
            timestamp: Date.now()
          };
          
          // Add new data point and keep only the last maxDataPoints
          const updatedData = [...prevData, newDataPoint];
          return updatedData.length > maxDataPoints 
            ? updatedData.slice(-maxDataPoints) 
            : updatedData;
        });
        
        setError('');
      } else {
        // Handle case where data structure is unexpected
        console.warn('Unexpected data structure:', data);
        setError('Invalid data format received');
      }
    } catch (err) {
      console.error('Error fetching power data:', err);
      setError('Failed to fetch power data');
    }
  };

  const startRealtimeUpdates = () => {
    if (intervalRef.current) return;
    
    setIsActive(true);
    setError('');
    
    // Fetch immediately
    fetchPowerData();
    
    // Then fetch every second
    intervalRef.current = setInterval(fetchPowerData, 1000);
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
    // Ensure value is a number, default to 0 if not
    const numValue = typeof value === 'number' ? value : parseFloat(value) || 0;
    return `${numValue} W`;
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isExport = data.power < 0;
      const powerType = isExport ? 'Export to Grid' : 'Consumption from Grid';
      const powerColor = isExport ? '#4CAF50' : '#FF9800';
      
      return (
        <div className="custom-tooltip">
          <p className="tooltip-time">{label}</p>
          <p className="tooltip-power" style={{ color: powerColor }}>
            <span className="label">{powerType}:</span>
            <span className="value">{formatPowerValue(Math.abs(data.power))}</span>
          </p>
          <p className="tooltip-delivered">
            <span className="label">Delivered:</span>
            <span className="value">{formatPowerValue(data.delivered)}</span>
          </p>
          <p className="tooltip-returned">
            <span className="label">Exported:</span>
            <span className="value">{formatPowerValue(data.returned)}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="energy-graph-container">
      <div className="graph-header">
        <div className="graph-title">
          <h3>Real-time Power Usage</h3>
          <div className="current-power">
            <span className="power-label">Current:</span>
            <span 
              className="power-value" 
              style={{ 
                color: currentPower >= 0 ? '#FF9800' : '#4CAF50',
                fontWeight: 'bold'
              }}
            >
              {currentPower >= 0 ? 'Consumption from Grid' : 'Export to Grid'}: {formatPowerValue(Math.abs(currentPower))}
            </span>
          </div>
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
            onClick={() => setPowerData([])}
            disabled={powerData.length === 0}
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
        {powerData.length === 0 ? (
          <div className="no-data">
            <p>No data available. Click "Start" to begin real-time monitoring.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={powerData}>
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
              <ReferenceLine y={0} stroke="#999" strokeDasharray="2 2" />
              
              {/* Area for negative values (export to grid) - Green */}
              <Area
                type="monotone"
                dataKey={(entry) => entry.power < 0 ? entry.power : 0}
                fill="#4CAF50"
                fillOpacity={0.3}
                stroke="#4CAF50"
                strokeWidth={2}
                animationDuration={0}
              />
              
              {/* Area for positive values (consumption) - Orange */}
              <Area
                type="monotone"
                dataKey={(entry) => entry.power > 0 ? entry.power : 0}
                fill="#FF9800"
                fillOpacity={0.3}
                stroke="#FF9800"
                strokeWidth={2}
                animationDuration={0}
              />
              
              {/* Line for the actual power values */}
              <Line
                type="monotone"
                dataKey="power"
                stroke="#333"
                strokeWidth={1}
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
          <span className="info-value">{powerData.length}</span>
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
      
      <div className="graph-legend">
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#4CAF50' }}></div>
          <span className="legend-label">Export to Grid (Negative Values)</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#FF9800' }}></div>
          <span className="legend-label">Consumption from Grid (Positive Values)</span>
        </div>
      </div>
    </div>
  );
};

export default EnergyGraph;
