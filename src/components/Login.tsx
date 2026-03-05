/**
 * Compact magic-code login for the header.
 * Step 1: Enter email, send code. Step 2: Enter code, verify.
 */
import { useState } from 'react';
import { db } from '../../lib/db';

export default function Login() {
  const [sentEmail, setSentEmail] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  // Step 1: Email input
  if (!sentEmail) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="email"
          placeholder="Email to sign in"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError('');
          }}
          style={{
            padding: '6px 12px',
            background: '#222',
            border: '1px solid #444',
            borderRadius: 4,
            color: '#fff',
            width: 180,
          }}
        />
        <button
          onClick={() => {
            if (!email.trim()) return;
            setError('');
            db.auth
              .sendMagicCode({ email: email.trim() })
              .then(() => setSentEmail(email.trim()))
              .catch((err: { body?: { message?: string } }) => {
                setError(err.body?.message || 'Failed to send code');
              });
          }}
          style={{
            padding: '6px 12px',
            cursor: 'pointer',
            background: '#6366f1',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
          }}
        >
          Send code
        </button>
        {error && <span style={{ fontSize: 12, color: '#ef4444' }}>{error}</span>}
      </div>
    );
  }

  // Step 2: Code verification
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        type="text"
        placeholder="Enter code"
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          setError('');
        }}
        style={{
          padding: '6px 12px',
          background: '#222',
          border: '1px solid #444',
          borderRadius: 4,
          color: '#fff',
          width: 120,
        }}
      />
      <button
        onClick={() => {
          db.auth
            .signInWithMagicCode({ email: sentEmail, code })
            .then(() => {
              setSentEmail('');
              setCode('');
            })
            .catch((err: { body?: { message?: string } }) => {
              setError(err.body?.message || 'Invalid code');
              setCode('');
            });
        }}
        style={{
          padding: '6px 12px',
          cursor: 'pointer',
          background: '#6366f1',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
        }}
      >
        Verify
      </button>
      <button
        onClick={() => {
          setSentEmail('');
          setCode('');
          setError('');
        }}
        style={{
          padding: '6px 12px',
          cursor: 'pointer',
          background: 'transparent',
          color: '#888',
          border: '1px solid #444',
          borderRadius: 4,
        }}
      >
        Cancel
      </button>
      {error && <span style={{ fontSize: 12, color: '#ef4444' }}>{error}</span>}
    </div>
  );
}
