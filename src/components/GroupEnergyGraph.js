import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import './GroupEnergyGraph.css';

const GroupEnergyGraph = ({ groupEnergy }) => {
  const [graphData, setGraphData] = useState([]);
  const maxDataPoints = 60; // Keep last 60 seconds of data

  useEffect(() => {
    if (!groupEnergy) return;

    const timestamp = new Date().toLocaleTimeString();
    
    setGraphData(prevData => {
      const newDataPoint = {
        time: timestamp,
        production: groupEnergy.production || 0,
        return: groupEnergy.return || 0,
        delivery: groupEnergy.delivery || 0,
        timestamp: Date.now()
      };
      
      // Add new data point and keep only the last maxDataPoints
      const updatedData = [...prevData, newDataPoint];
      return updatedData.length > maxDataPoints 
        ? updatedData.slice(-maxDataPoints) 
        : updatedData;
    });
  }, [groupEnergy]);

  const formatPowerValue = (value) => {
    const numValue = typeof value === 'number' ? value : parseFloat(value) || 0;
    if (numValue >= 1000) {
      return `${(numValue / 1000).toFixed(2)} kW`;
    }
    return `${numValue.toFixed(0)} W`;
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="group-energy-tooltip">
          <p className="tooltip-time">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="tooltip-item" style={{ color: entry.color }}>
              <span className="tooltip-label">{entry.name}:</span>
              <span className="tooltip-value">{formatPowerValue(entry.value)}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (!groupEnergy || graphData.length === 0) {
    return (
      <div className="group-energy-graph-container">
        <div className="graph-placeholder">
          <p>Waiting for data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="group-energy-graph-container">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={graphData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis 
            dataKey="time" 
            stroke="#666"
            fontSize={10}
            tick={{ fontSize: 9 }}
            interval="preserveStartEnd"
            angle={-45}
            textAnchor="end"
            height={40}
          />
          <YAxis 
            stroke="#666"
            fontSize={10}
            tick={{ fontSize: 9 }}
            label={{ value: 'Power (W)', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
            iconType="line"
          />
          <Line
            type="monotone"
            dataKey="production"
            stroke="#1570EF"
            strokeWidth={2}
            dot={false}
            name="PV Production"
            animationDuration={0}
          />
          <Line
            type="monotone"
            dataKey="return"
            stroke="#16B364"
            strokeWidth={2}
            dot={false}
            name="Export"
            animationDuration={0}
          />
          <Line
            type="monotone"
            dataKey="delivery"
            stroke="#FF8500"
            strokeWidth={2}
            dot={false}
            name="Delivery"
            animationDuration={0}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default GroupEnergyGraph;

