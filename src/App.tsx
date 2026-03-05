/**
 * Root app component. Handles auth state, navigation (Feed vs Create),
 * and header with login/signout.
 */
import { useState } from 'react';
import { db } from '../lib/db';
import Feed from './components/Feed';
import CreateMeme from './components/CreateMeme';
import Login from './components/Login';

type Page = 'feed' | 'create';

function App() {
  const { isLoading, user } = db.useAuth();
  const [page, setPage] = useState<Page>('feed');

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        Loading...
      </div>
    );
  }

  return (
    <div>
      <header
        style={{
          padding: '12px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #333',
        }}
      >
        <nav style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Meme Feed</h1>
          <button
            onClick={() => setPage('feed')}
            style={{
              padding: '6px 12px',
              cursor: 'pointer',
              background: page === 'feed' ? '#333' : 'transparent',
              color: page === 'feed' ? '#fff' : '#888',
              border: '1px solid #444',
              borderRadius: 4,
            }}
          >
            Feed
          </button>
          <button
            onClick={() => setPage('create')}
            style={{
              padding: '6px 12px',
              cursor: 'pointer',
              background: page === 'create' ? '#333' : 'transparent',
              color: page === 'create' ? '#fff' : '#888',
              border: '1px solid #444',
              borderRadius: 4,
            }}
          >
            Create
          </button>
        </nav>
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.875rem', color: '#888' }}>{user.email}</span>
            <button
              onClick={() => db.auth.signOut()}
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                background: '#333',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
              }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <Login />
        )}
      </header>
      {page === 'feed' ? (
        <Feed user={user} />
      ) : (
        <CreateMeme user={user} onPostSuccess={() => setPage('feed')} />
      )}
    </div>
  );
}

export default App;
