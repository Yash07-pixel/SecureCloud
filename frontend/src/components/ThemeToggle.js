import React from 'react';
import { useTheme } from '../context/ThemeContext';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button className="theme-toggle" type="button" onClick={toggleTheme}>
      <span className="theme-toggle-icon">{theme === 'light' ? 'Dark' : 'Light'}</span>
      <span className="theme-toggle-label">{theme === 'light' ? 'Switch Theme' : 'Switch Theme'}</span>
    </button>
  );
}

export default ThemeToggle;
