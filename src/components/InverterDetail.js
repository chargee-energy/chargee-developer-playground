import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { devicesAPI } from '../services/api';
import InverterGraph from './InverterGraph';
import ScheduleModal from './ScheduleModal';
import './InverterDetail.css';

const InverterDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { inverter, address, group } = location.state || {};
  
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState({
    schedules: false
  });
  const [error, setError] = useState('');
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);

  useEffect(() => {
    if (inverter && address) {
      fetchSchedules();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inverter, address]);

  const fetchSchedules = async () => {
    if (!inverter || !address) return;
    
    setLoading(prev => ({ ...prev, schedules: true }));
    setError('');
    
    try {
      const data = await devicesAPI.getSolarInverterSchedules(address.uuid, inverter.identifier);
      const scheduleList = Array.isArray(data) ? data : (data?.results || []);
      setSchedules(scheduleList);
    } catch (err) {
      console.error('Error fetching schedules:', err);
      setError(err.message || 'Failed to fetch schedules');
    } finally {
      setLoading(prev => ({ ...prev, schedules: false }));
    }
  };

  const handleBack = () => {
    navigate('/steerable-inverters', {
      state: {
        group: group
      }
    });
  };

  const handleCreateSchedule = () => {
    setEditingSchedule(null);
    setScheduleModalOpen(true);
  };

  const handleEditSchedule = (schedule) => {
    setEditingSchedule(schedule);
    setScheduleModalOpen(true);
  };

  const handleSaveSchedule = async (scheduleData) => {
    try {
      if (editingSchedule) {
        // Update existing schedule
        await devicesAPI.updateSolarInverterSchedule(
          address.uuid,
          inverter.identifier,
          editingSchedule.identifier || editingSchedule.uuid,
          scheduleData
        );
      } else {
        // Create new schedule
        await devicesAPI.createSolarInverterSchedule(
          address.uuid,
          inverter.identifier,
          scheduleData
        );
      }
      
      setScheduleModalOpen(false);
      setEditingSchedule(null);
      fetchSchedules(); // Refresh schedules list
    } catch (err) {
      console.error('Error saving schedule:', err);
      setError(err.message || 'Failed to save schedule');
    }
  };

  const handleDeleteSchedule = async (schedule) => {
    if (!window.confirm('Are you sure you want to delete this schedule?')) {
      return;
    }
    
    try {
      await devicesAPI.deleteSolarInverterSchedule(
        address.uuid,
        inverter.identifier,
        schedule.identifier || schedule.uuid
      );
      fetchSchedules(); // Refresh schedules list
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

  if (!inverter || !address) {
    return (
      <div className="inverter-detail">
        <div className="error-state">
          <h2>No Inverter Information</h2>
          <p>Unable to load inverter details.</p>
          <button onClick={handleBack} className="back-button">
            Back to Steerable Inverters
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="inverter-detail">
      <header className="inverter-header">
        <div className="header-content">
          <button onClick={handleBack} className="back-button">
            ← Back to Steerable Inverters
          </button>
          <h1>Inverter Details</h1>
        </div>
      </header>

      <main className="inverter-main">
        {error && <div className="error-banner">{error}</div>}

        {/* Inverter Information */}
        <div className="inverter-info-section">
          <h2>Inverter Information</h2>
          <div className="info-grid">
            <div className="info-item">
              <label>Identifier:</label>
              <span className="uuid">{inverter.identifier}</span>
            </div>
            <div className="info-item">
              <label>Brand:</label>
              <span>{inverter.info?.brand || 'N/A'}</span>
            </div>
            <div className="info-item">
              <label>Model:</label>
              <span>{inverter.info?.model || 'N/A'}</span>
            </div>
            <div className="info-item">
              <label>Site Name:</label>
              <span>{inverter.info?.siteName || 'N/A'}</span>
            </div>
            <div className="info-item">
              <label>Installation Date:</label>
              <span>{formatDate(inverter.info?.installationDate)}</span>
            </div>
            <div className="info-item">
              <label>Last Seen:</label>
              <span>{formatDate(inverter.info?.lastSeen)}</span>
            </div>
            <div className="info-item">
              <label>Timezone:</label>
              <span>{inverter.info?.timezone || 'N/A'}</span>
            </div>
            <div className="info-item">
              <label>Reachable:</label>
              <span className={inverter.info?.isReachable ? 'status-success' : 'status-error'}>
                {inverter.info?.isReachable ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="info-item">
              <label>Steerable:</label>
              <span className="status-success">Yes</span>
            </div>
          </div>
        </div>

        {/* Current Production State */}
        {inverter.lastProductionState && (
          <div className="production-state-section">
            <h2>Current PV Production State</h2>
            <div className="info-grid">
              <div className="info-item">
                <label>PV Production Rate:</label>
                <span>{inverter.lastProductionState.productionRate || 0} W</span>
              </div>
              <div className="info-item">
                <label>Is Producing:</label>
                <span className={inverter.lastProductionState.isProducing ? 'status-success' : 'status-error'}>
                  {inverter.lastProductionState.isProducing ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="info-item">
                <label>Total Lifetime PV Production:</label>
                <span>{(inverter.lastProductionState.totalLifetimeProduction || 0).toLocaleString()} Wh</span>
              </div>
              <div className="info-item">
                <label>Last Update:</label>
                <span>{formatDate(inverter.lastProductionState.time)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Real-time Graph */}
        <div className="graph-section">
          <h2>Real-time Import & PV Production</h2>
          <InverterGraph
            addressUuid={address.uuid}
            solarInverterUuid={inverter.identifier}
            sparkySerialNumber={inverter.sparkySerialNumber}
          />
        </div>

        {/* Schedule Management */}
        <div className="schedules-section">
          <div className="schedules-header">
            <h2>Schedules</h2>
            <button className="button-primary" onClick={handleCreateSchedule}>
              + Add Schedule
            </button>
          </div>

          {loading.schedules ? (
            <div className="loading">Loading schedules...</div>
          ) : schedules.length === 0 ? (
            <div className="empty-state">
              <p>No schedules found.</p>
              <button className="button-primary" onClick={handleCreateSchedule}>
                + Add Schedule
              </button>
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
                  {schedules.map((schedule) => (
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
                            onClick={() => handleEditSchedule(schedule)}
                            title="Edit schedule"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            className="button-delete"
                            onClick={() => handleDeleteSchedule(schedule)}
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
      </main>

      {/* Schedule Modal */}
      <ScheduleModal
        isOpen={scheduleModalOpen}
        onClose={() => {
          setScheduleModalOpen(false);
          setEditingSchedule(null);
        }}
        onSave={handleSaveSchedule}
        schedule={editingSchedule}
      />
    </div>
  );
};

export default InverterDetail;

