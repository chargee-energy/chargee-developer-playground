import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import SparkyDetails from './components/SparkyDetails';
import DevicesDetails from './components/DevicesDetails';
import SteerableInverters from './components/SteerableInverters';
import GroupSolarAnalytics from './components/GroupSolarAnalytics';
import InverterDetail from './components/InverterDetail';
import './App.css';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <div className="App">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route 
                path="/dashboard" 
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/sparky-details" 
                element={
                  <ProtectedRoute>
                    <SparkyDetails />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/devices-details" 
                element={
                  <ProtectedRoute>
                    <DevicesDetails />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/steerable-inverters" 
                element={
                  <ProtectedRoute>
                    <SteerableInverters />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/group-solar-analytics" 
                element={
                  <ProtectedRoute>
                    <GroupSolarAnalytics />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/inverter-detail" 
                element={
                  <ProtectedRoute>
                    <InverterDetail />
                  </ProtectedRoute>
                } 
              />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;