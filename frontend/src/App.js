import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import SharedWithMe from './pages/SharedWithMe';
import Starred from './pages/Starred';
import Trash from './pages/Trash';
import { FeedbackProvider } from './context/FeedbackContext';
import { ThemeProvider } from './context/ThemeContext';
import ThemeToggle from './components/ThemeToggle';


function App() {
  return (
    <ThemeProvider>
      <FeedbackProvider>
        <BrowserRouter>
          <ThemeToggle />
          <Routes>
            <Route path="/" element={<Navigate to="/login" />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/shared" element={<SharedWithMe />} />
            <Route path="/starred" element={<Starred />} />
            <Route path="/trash" element={<Trash />} />
          </Routes>
        </BrowserRouter>
      </FeedbackProvider>
    </ThemeProvider>
  );
}

export default App;
