import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Moon, Sun, LogOut, User, Mail, Target } from 'lucide-react';

function Settings() {
  const { clientData, theme, toggleTheme, logout } = useAuth();

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px' }}>
        Profile & Settings
      </h1>

      {/* Profile Card */}
      <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
        <div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'var(--brand-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '2rem',
            fontWeight: '600',
            margin: '0 auto 16px'
          }}
        >
          {getInitials(clientData?.client_name)}
        </div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '4px' }}>
          {clientData?.client_name || 'User'}
        </h2>
        <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem' }}>
          {clientData?.email || ''}
        </p>
      </div>

      {/* Settings Options */}
      <div className="card" style={{ marginTop: '16px' }}>
        <h3 style={{ fontWeight: '600', marginBottom: '16px' }}>Settings</h3>

        {/* Theme Toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 0',
            borderBottom: '1px solid var(--gray-200)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
            <span>Dark Mode</span>
          </div>
          <button
            onClick={toggleTheme}
            style={{
              width: '48px',
              height: '28px',
              borderRadius: '14px',
              background: theme === 'dark' ? 'var(--brand-primary)' : 'var(--gray-300)',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s'
            }}
          >
            <span
              style={{
                position: 'absolute',
                width: '22px',
                height: '22px',
                background: 'white',
                borderRadius: '50%',
                top: '3px',
                left: theme === 'dark' ? '23px' : '3px',
                transition: 'left 0.2s'
              }}
            ></span>
          </button>
        </div>

        {/* Goals Info */}
        {clientData && (
          <div style={{ padding: '12px 0', borderBottom: '1px solid var(--gray-200)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <Target size={20} />
              <span style={{ fontWeight: '600' }}>Daily Goals</span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '8px',
              fontSize: '0.85rem',
              color: 'var(--gray-600)'
            }}>
              <div>Calories: {clientData.calorie_goal || 2000}</div>
              <div>Protein: {clientData.protein_goal || 150}g</div>
              <div>Carbs: {clientData.carbs_goal || 200}g</div>
              <div>Fat: {clientData.fat_goal || 65}g</div>
            </div>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={logout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 0',
            width: '100%',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--error)',
            fontSize: '1rem',
            textAlign: 'left'
          }}
        >
          <LogOut size={20} />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Link to classic version */}
      <div style={{
        marginTop: '24px',
        textAlign: 'center',
        fontSize: '0.85rem',
        color: 'var(--gray-500)'
      }}>
        <a
          href="/client-settings.html"
          style={{ color: 'var(--brand-primary)', textDecoration: 'none' }}
        >
          Use classic settings page
        </a>
      </div>
    </div>
  );
}

export default Settings;
