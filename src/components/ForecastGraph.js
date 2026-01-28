import React, { useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import './ForecastGraph.css';

const ForecastGraph = ({ deliveryForecast, returnForecast, productionForecast, productionData, date, electricity15min, show15minData }) => {
  // Process forecast data to extract time series from intervals array
  const processForecastData = (forecast) => {
    if (!forecast) return [];
    
    // The forecast data structure:
    // {
    //   "results": [
    //     {
    //       "identifier": "...",
    //       "smartMeterIdentifier": "...",
    //       "intervals": [
    //         {
    //           "start": 1762124400000,  // Epoch timestamp in milliseconds
    //           "whSum": 607            // Total Wh for that hour
    //         },
    //         ...
    //       ],
    //       "processedTime": ...,
    //       "modelType": "...",
    //       "modelVersion": "..."
    //     }
    //   ]
    // }
    
    let intervals = [];
    
    // Extract intervals from results array
    if (forecast.results && Array.isArray(forecast.results) && forecast.results.length > 0) {
      // Use the first result's intervals (you could also choose the most recent based on processedTime)
      // Or merge all results if needed - for now we'll use the first one
      const firstResult = forecast.results[0];
      if (firstResult.intervals && Array.isArray(firstResult.intervals)) {
        intervals = firstResult.intervals;
      }
    }
    // Fallback: check for intervals directly on forecast object (backwards compatibility)
    else if (forecast.intervals && Array.isArray(forecast.intervals)) {
      intervals = forecast.intervals;
    }
    
    // Process intervals: start is epoch in milliseconds, whSum is watt-hours
    const dataPoints = intervals.map((interval) => {
      const start = interval.start; // Epoch timestamp in milliseconds (13 digits)
      const whSum = interval.whSum || 0; // Total Wh for that hour
      
      // Convert epoch milliseconds to seconds for easier handling
      const epochSeconds = Math.floor(start / 1000);
      
      // Calculate end of hour (start + 1 hour in milliseconds)
      const endMillis = start + (60 * 60 * 1000); // Add 1 hour
      const endSeconds = Math.floor(endMillis / 1000);
      
      return {
        timestamp: epochSeconds,
        start: start,
        end: endMillis,
        endSeconds: endSeconds,
        whSum: typeof whSum === 'number' ? whSum : parseFloat(whSum) || 0,
        time: formatTimestamp(epochSeconds),
        timeRange: formatHourRange(start, endMillis),
        hour: new Date(start).getHours() // Use milliseconds directly for Date
      };
    });
    
    // Sort by timestamp to ensure proper order
    return dataPoints.sort((a, b) => a.timestamp - b.timestamp);
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    
    try {
      // Timestamp is in epoch seconds
      const numTimestamp = typeof timestamp === 'number' ? timestamp : parseFloat(timestamp);
      if (!isNaN(numTimestamp)) {
        // Convert epoch seconds to Date
        const date = new Date(numTimestamp * 1000);
        
        // Format as hour:00 (e.g., "14:00" for 2 PM)
        return date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        });
      }
    } catch (e) {
      console.warn('Error formatting timestamp:', timestamp, e);
    }
    
    return String(timestamp);
  };

  const formatHourRange = (startMillis, endMillis) => {
    try {
      const startDate = new Date(startMillis);
      const endDate = new Date(endMillis);
      
      const startTime = startDate.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
      
      const endTime = endDate.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
      
      return `${startTime} - ${endTime}`;
    } catch (e) {
      console.warn('Error formatting hour range:', e);
      return '';
    }
  };

  // Process electricity 15min data to aggregate by hour
  // Data structure: Array of objects with:
  // - from: ISO timestamp string (e.g., "2025-11-03T00:00:00+01:00")
  // - to: ISO timestamp string
  // - delivery: kWh for this 15min period (sum of delivery_peak + delivery_off_peak)
  // - return: kWh for this 15min period (sum of return_peak + return_off_peak)
  const process15minData = (electricity15min) => {
    if (!electricity15min || !show15minData) return [];
    
    // Extract the data array - it's a direct array
    let dataPoints = [];
    
    if (Array.isArray(electricity15min)) {
      dataPoints = electricity15min;
    } else if (electricity15min.data && Array.isArray(electricity15min.data)) {
      dataPoints = electricity15min.data;
    } else if (electricity15min.results && Array.isArray(electricity15min.results)) {
      dataPoints = electricity15min.results;
    }
    
    // Group 15min data points by hour (4 quarters per hour)
    const hourlyData = new Map();
    
    dataPoints.forEach((point) => {
      // Extract timestamp from 'from' field (ISO string with timezone)
      const fromTimestamp = point.from;
      if (!fromTimestamp) return;
      
      // Parse ISO timestamp string
      const timestampDate = new Date(fromTimestamp);
      if (isNaN(timestampDate.getTime())) return;
      
      const timestampMillis = timestampDate.getTime();
      
      // Round down to the start of the hour
      const hourStart = new Date(timestampMillis);
      hourStart.setMinutes(0, 0, 0, 0);
      const hourStartMillis = hourStart.getTime();
      const hourStartSeconds = Math.floor(hourStartMillis / 1000);
      
      // Initialize hour if not exists
      if (!hourlyData.has(hourStartSeconds)) {
        hourlyData.set(hourStartSeconds, {
          timestamp: hourStartSeconds,
          start: hourStartMillis,
          end: hourStartMillis + (60 * 60 * 1000),
          deliveredWh: [],
          returnedWh: [],
          count: 0
        });
      }
      
      const hourData = hourlyData.get(hourStartSeconds);
      
      // Extract delivery and return values (already in kWh per 15min)
      // delivery is sum of delivery_peak + delivery_off_peak
      // return is sum of return_peak + return_off_peak
      const deliveryKwh = typeof point.delivery === 'number' ? point.delivery : parseFloat(point.delivery) || 0;
      const returnKwh = typeof point.return === 'number' ? point.return : parseFloat(point.return) || 0;
      
      // Convert kWh to Wh (multiply by 1000)
      // Note: These are already kWh values for the 15min period
      const deliveredWh = deliveryKwh * 1000;
      const returnedWh = returnKwh * 1000;
      
      hourData.deliveredWh.push(deliveredWh);
      hourData.returnedWh.push(returnedWh);
      hourData.count++;
    });
    
    // Calculate hourly totals and net values
    const hourlyAggregated = Array.from(hourlyData.values()).map((hourData) => {
      // Sum all 15min intervals for the hour (should be 4)
      // Each interval is already in Wh, so we sum them
      const totalDeliveredWh = hourData.deliveredWh.reduce((sum, val) => sum + val, 0);
      const totalReturnedWh = hourData.returnedWh.reduce((sum, val) => sum + val, 0);
      
      // Net grid usage: 
      // - Positive values = consumption from grid (using more energy than producing)
      // - Negative values = export to grid (producing more energy than using)
      // netWh = returned - delivered
      // If netWh > 0: you're consuming from the grid
      // If netWh < 0: you're exporting to the grid
      const netWh = totalReturnedWh - totalDeliveredWh;
      
      return {
        timestamp: hourData.timestamp,
        start: hourData.start,
        end: hourData.end,
        deliveredWh: totalDeliveredWh,
        returnedWh: totalReturnedWh,
        netWh: netWh,
        time: formatTimestamp(hourData.timestamp),
        timeRange: formatHourRange(hourData.start, hourData.end),
        hour: new Date(hourData.start).getHours()
      };
    });
    
    // Sort by timestamp
    return hourlyAggregated.sort((a, b) => a.timestamp - b.timestamp);
  };

  // Process all forecasts
  const deliveryData = useMemo(() => processForecastData(deliveryForecast), [deliveryForecast]); // eslint-disable-line react-hooks/exhaustive-deps
  const returnData = useMemo(() => processForecastData(returnForecast), [returnForecast]); // eslint-disable-line react-hooks/exhaustive-deps
  const productionForecastData = useMemo(() => processForecastData(productionForecast), [productionForecast]); // eslint-disable-line react-hooks/exhaustive-deps
  const actualData = useMemo(() => process15minData(electricity15min), [electricity15min, show15minData]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Process production data (actual production from solar inverter)
  const processProductionData = (productionData) => {
    if (!productionData) return [];
    
    // Extract results array
    let dataPoints = [];
    if (productionData.results && Array.isArray(productionData.results)) {
      dataPoints = productionData.results;
    } else if (Array.isArray(productionData)) {
      dataPoints = productionData;
    }
    
    // Group production data by hour
    const hourlyData = new Map();
    
    dataPoints.forEach((point) => {
      // Extract timestamp from 'time' field (ISO 8601 string)
      const timeStr = point.time;
      if (!timeStr) return;
      
      // Parse ISO timestamp string
      const timestampDate = new Date(timeStr);
      if (isNaN(timestampDate.getTime())) return;
      
      const timestampMillis = timestampDate.getTime();
      
      // Round down to the start of the hour
      const hourStart = new Date(timestampMillis);
      hourStart.setMinutes(0, 0, 0, 0);
      const hourStartMillis = hourStart.getTime();
      const hourStartSeconds = Math.floor(hourStartMillis / 1000);
      
      // Initialize hour if not exists
      if (!hourlyData.has(hourStartSeconds)) {
        hourlyData.set(hourStartSeconds, {
          timestamp: hourStartSeconds,
          start: hourStartMillis,
          end: hourStartMillis + (60 * 60 * 1000),
          powerValues: [],
          energyValues: [],
          count: 0
        });
      }
      
      const hourData = hourlyData.get(hourStartSeconds);
      
      // Extract power (W) and energyTotal (Wh) values
      const power = typeof point.power === 'number' ? point.power : parseFloat(point.power) || 0;
      const energyTotal = typeof point.energyTotal === 'number' ? point.energyTotal : parseFloat(point.energyTotal) || 0;
      
      hourData.powerValues.push(power);
      hourData.energyValues.push(energyTotal);
      hourData.count++;
    });
    
    // Calculate hourly totals
    // Sort hourly data by timestamp to process in order
    const sortedHourlyData = Array.from(hourlyData.entries()).sort((a, b) => a[0] - b[0]);
    
    const hourlyAggregated = sortedHourlyData.map(([hourTimestamp, hourData], index) => {
      // Average power for the hour
      const avgPower = hourData.powerValues.length > 0 
        ? hourData.powerValues.reduce((sum, val) => sum + val, 0) / hourData.powerValues.length
        : 0;
      
      // Calculate energy for the hour
      // If energyTotal is cumulative, calculate the difference
      // Otherwise, estimate from average power
      let hourlyEnergyWh = 0;
      
      if (hourData.energyValues.length > 0) {
        // If energyTotal is cumulative, calculate difference from previous hour
        const lastEnergy = hourData.energyValues[hourData.energyValues.length - 1];
        
        // If energyTotal is cumulative, calculate difference
        // For now, assume it's incremental per data point, so use last - first
        // If it's truly cumulative, we'd need the previous hour's value
        if (index > 0) {
          const prevHourData = sortedHourlyData[index - 1][1];
          const prevLastEnergy = prevHourData.energyValues.length > 0
            ? prevHourData.energyValues[prevHourData.energyValues.length - 1]
            : 0;
          hourlyEnergyWh = lastEnergy - prevLastEnergy;
        } else {
          // First hour, use the last value or estimate from power
          hourlyEnergyWh = lastEnergy > 0 ? lastEnergy : (avgPower * 1);
        }
      } else {
        // No energy values, estimate from average power (W * 1 hour = Wh)
        hourlyEnergyWh = avgPower * 1;
      }
      
      // Ensure non-negative values
      hourlyEnergyWh = Math.max(0, hourlyEnergyWh);
      
      return {
        timestamp: hourData.timestamp,
        start: hourData.start,
        end: hourData.end,
        productionWh: hourlyEnergyWh,
        power: avgPower,
        time: formatTimestamp(hourData.timestamp),
        timeRange: formatHourRange(hourData.start, hourData.end),
        hour: new Date(hourData.start).getHours()
      };
    });
    
    // Sort by timestamp
    return hourlyAggregated.sort((a, b) => a.timestamp - b.timestamp);
  };
  
  const actualProductionData = useMemo(() => processProductionData(productionData), [productionData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge data by timestamp (hour)
  const chartData = useMemo(() => {
    const dataMap = new Map();
    
    // Add delivery forecast data - use whSum as the value
    deliveryData.forEach(point => {
      const key = point.timestamp;
      if (!dataMap.has(key)) {
        dataMap.set(key, {
          time: point.time,
          timeRange: point.timeRange,
          timestamp: point.timestamp,
          hour: point.hour,
          start: point.start,
          end: point.end
        });
      }
      dataMap.get(key).delivery = point.whSum; // Use whSum (watt-hours)
    });
    
    // Add return forecast data - use whSum as the value
    returnData.forEach(point => {
      const key = point.timestamp;
      if (!dataMap.has(key)) {
        dataMap.set(key, {
          time: point.time,
          timeRange: point.timeRange,
          timestamp: point.timestamp,
          hour: point.hour,
          start: point.start,
          end: point.end
        });
      }
      dataMap.get(key).return = point.whSum; // Use whSum (watt-hours)
    });
    
    // Add production forecast data - use whSum as the value
    productionForecastData.forEach(point => {
      const key = point.timestamp;
      if (!dataMap.has(key)) {
        dataMap.set(key, {
          time: point.time,
          timeRange: point.timeRange,
          timestamp: point.timestamp,
          hour: point.hour,
          start: point.start,
          end: point.end
        });
      }
      dataMap.get(key).production = point.whSum; // Use whSum (watt-hours)
    });
    
    // Add actual production data if available
    if (productionData && actualProductionData.length > 0) {
      actualProductionData.forEach(point => {
        const key = point.timestamp;
        if (!dataMap.has(key)) {
          dataMap.set(key, {
            time: point.time,
            timeRange: point.timeRange,
            timestamp: point.timestamp,
            hour: point.hour,
            start: point.start,
            end: point.end
          });
        }
        dataMap.get(key).actualProduction = point.productionWh; // Use productionWh (watt-hours)
      });
    }
    
    // Add actual 15min data if available
    if (show15minData && actualData.length > 0) {
      actualData.forEach(point => {
        const key = point.timestamp;
        if (!dataMap.has(key)) {
          dataMap.set(key, {
            time: point.time,
            timeRange: point.timeRange,
            timestamp: point.timestamp,
            hour: point.hour,
            start: point.start,
            end: point.end
          });
        }
        dataMap.get(key).actualDelivery = point.deliveredWh;
        dataMap.get(key).actualReturn = point.returnedWh;
        dataMap.get(key).actualNet = point.netWh; // Net grid usage/export
      });
    }
    
    // Convert to array and sort by timestamp
    const merged = Array.from(dataMap.values())
      .sort((a, b) => a.timestamp - b.timestamp);
    
    return merged;
  }, [deliveryData, returnData, productionForecastData, actualProductionData, productionData, actualData, show15minData]);

  const formatValue = (value) => {
    const numValue = typeof value === 'number' ? value : parseFloat(value) || 0;
    // Value is in Wh (watt-hours) - format appropriately
    if (numValue >= 1000) {
      return `${(numValue / 1000).toFixed(2)} kWh`;
    }
    return `${numValue.toFixed(2)} Wh`;
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const timeRange = data.timeRange || data.time || label;
      
      return (
        <div className="forecast-tooltip">
          <p className="tooltip-time">{`Hour: ${timeRange}`}</p>
          <p className="tooltip-period">(Full hour period)</p>
          {payload.map((entry, index) => {
            const value = entry.value !== undefined ? entry.value : entry.payload[entry.dataKey];
            return (
              <p key={index} className="tooltip-item" style={{ color: entry.color }}>
                <span className="tooltip-label">{entry.name}:</span>
                <span className="tooltip-value">{formatValue(value)}</span>
              </p>
            );
          })}
        </div>
      );
    }
    return null;
  };

  const hasData = chartData.length > 0;
  const hasDelivery = deliveryData.length > 0;
  const hasReturn = returnData.length > 0;
  const hasProduction = productionForecastData.length > 0;
  const hasActualProduction = productionData && actualProductionData.length > 0;
  const hasActual = show15minData && actualData.length > 0;

  if (!hasData && !hasDelivery && !hasReturn && !hasProduction) {
    return (
      <div className="forecast-graph-container">
        <div className="forecast-graph-header">
          <h3>Forecast Graph</h3>
        </div>
        <div className="no-forecast-data">
          <p>No forecast data available. Please fetch forecast data first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="forecast-graph-container">
      <div className="forecast-graph-header">
        <h3>{hasProduction ? 'PV Production Forecast' : 'Smart Meter Forecast'}</h3>
        {date && <span className="forecast-date">Date: {date}</span>}
      </div>
      
      <div className="forecast-graph-content">
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis 
              dataKey="time" 
              stroke="#666"
              fontSize={12}
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
              label={{ value: 'Time (Hour)', position: 'insideBottom', offset: -5 }}
            />
            <YAxis 
              stroke="#666"
              fontSize={12}
              tick={{ fontSize: 10 }}
              label={{ value: 'Forecast (Wh)', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            
            {/* Delivery Forecast Bar - represents full hour */}
            {hasDelivery && (
              <Bar
                dataKey="delivery"
                fill="#FF9800"
                fillOpacity={0.7}
                name="Delivery Forecast (Wh/hour)"
                radius={[0, 0, 0, 0]}
              />
            )}
            
            {/* Export Forecast Bar - represents full hour */}
            {hasReturn && (
              <Bar
                dataKey="return"
                fill="#4CAF50"
                fillOpacity={0.7}
                name="Export Forecast (Wh/hour)"
                radius={[0, 0, 0, 0]}
              />
            )}
            
            {/* PV Production Forecast Bar - represents full hour */}
            {hasProduction && (
              <Bar
                dataKey="production"
                fill="#FFC107"
                fillOpacity={0.7}
                name="PV Production Forecast (Wh/hour)"
                radius={[0, 0, 0, 0]}
              />
            )}
            
            {/* Actual PV Production Line - Dotted */}
            {hasActualProduction && (
              <Line
                type="monotone"
                dataKey="actualProduction"
                stroke="#FF6F00"
                strokeWidth={2}
                name="Actual PV Production (Wh/hour)"
                strokeDasharray="5 5"
                dot={{ fill: '#FF6F00', r: 3 }}
                activeDot={{ r: 5 }}
              />
            )}
            
            {/* Actual Delivery from 15min data - Line */}
            {hasActual && (
              <Line
                type="monotone"
                dataKey="actualDelivery"
                stroke="#FF6B35"
                strokeWidth={2}
                dot={{ fill: '#FF6B35', r: 3 }}
                name="Actual Delivery (Wh/hour)"
                strokeDasharray="5 5"
              />
            )}
            
            {/* Actual Export from 15min data - Line */}
            {hasActual && (
              <Line
                type="monotone"
                dataKey="actualReturn"
                stroke="#2E7D32"
                strokeWidth={2}
                dot={{ fill: '#2E7D32', r: 3 }}
                name="Actual Export (Wh/hour)"
                strokeDasharray="5 5"
              />
            )}
            
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      
      <div className="forecast-graph-legend">
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#FF9800' }}></div>
          <span className="legend-label">Delivery Forecast</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#4CAF50' }}></div>
          <span className="legend-label">Export Forecast</span>
        </div>
        {hasActual && (
          <>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: '#FF6B35', borderStyle: 'none' }}></div>
              <div className="legend-line" style={{ borderColor: '#FF6B35' }}></div>
              <span className="legend-label">Actual Delivery</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: '#2E7D32', borderStyle: 'none' }}></div>
              <div className="legend-line" style={{ borderColor: '#2E7D32' }}></div>
              <span className="legend-label">Actual Export</span>
            </div>
          </>
        )}
      </div>
      
      <div className="forecast-graph-info">
        <div className="info-item">
          <span className="info-label">Data Points</span>
          <span className="info-value">{chartData.length}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Delivery Points</span>
          <span className="info-value">{deliveryData.length}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Export Points</span>
          <span className="info-value">{returnData.length}</span>
        </div>
        {hasActual && (
          <div className="info-item">
            <span className="info-label">Actual Data Points</span>
            <span className="info-value">{actualData.length}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ForecastGraph;

