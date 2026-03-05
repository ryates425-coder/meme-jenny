/**
 * Meme feed component. Fetches memes from InstantDB, ordered by createdAt (newest first).
 * Supports upvote/unvote (requires sign-in) and download.
 */
import { id } from '@instantdb/react';
import { db } from '../../lib/db';

type User = { id: string; email?: string } | null;

interface FeedProps {
  user: User;
}

type MemeEntity = {
  id: string;
  textBoxes: unknown;
  voteCount: number;
  createdAt: number;
  $file?: { id: string; url: string; path?: string } | null;
  $user?: { id: string } | null; // Creator
  votes?: Array<{ id: string; $user?: { id: string } | null }>;
};

/** Fetches image from URL and triggers download. Falls back to opening in new tab if fetch fails (CORS). */
async function downloadMeme(url: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `meme-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, '_blank');
  }
}

export default function Feed({ user }: FeedProps) {
  const query = {
    memes: {
      $file: {},
      $user: {}, // Creator - used to show Delete button
      votes: { $user: {} },
      $: { order: { createdAt: 'desc' as const } },
    },
  };

  const { isLoading, error, data } = db.useQuery(query);

  if (isLoading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <p>Loading memes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#ef4444' }}>
        <p>Error: {error.message}</p>
      </div>
    );
  }

  const memes = (data?.memes ?? []) as MemeEntity[];

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      {memes.length === 0 ? (
        <div
          style={{
            padding: 48,
            textAlign: 'center',
            background: '#1a1a1a',
            borderRadius: 8,
            color: '#888',
          }}
        >
          <p>No memes yet. Be the first to post one!</p>
          <p style={{ fontSize: 14, marginTop: 8 }}>Use the Create tab above to make your first meme.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {memes.map((meme) => {
            const hasVoted = user && meme.votes?.some((v) => v.$user?.id === user.id);
            const isCreator = user && meme.$user?.id === user.id;
            return (
              <article
                key={meme.id}
                style={{
                  background: '#1a1a1a',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                <div style={{ position: 'relative', background: '#000' }}>
                  {meme.$file?.url ? (
                    <img src={meme.$file.url} alt="Meme" style={{ width: '100%', display: 'block' }} />
                  ) : (
                    <div
                      style={{
                        aspectRatio: '1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#666',
                      }}
                    >
                      No image
                    </div>
                  )}
                </div>
                <div
                  style={{
                    padding: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => {
                        if (!user) return;
                        if (hasVoted) {
                          const myVote = meme.votes?.find((v) => v.$user?.id === user.id);
                          if (myVote) {
                            db.transact([
                              db.tx.votes[myVote.id].delete(),
                              db.tx.memes[meme.id].update({ voteCount: Math.max(0, meme.voteCount - 1) }),
                            ]);
                          }
                        } else {
                          const voteId = id();
                          db.transact([
                            db.tx.votes[voteId]
                              .update({ createdAt: Date.now() })
                              .link({ meme: meme.id, $user: user.id }),
                            db.tx.memes[meme.id].update({ voteCount: meme.voteCount + 1 }),
                          ]);
                        }
                      }}
                      disabled={!user}
                      title={!user ? 'Sign in to upvote' : hasVoted ? 'Remove vote' : 'Upvote'}
                      style={{
                        padding: '8px 16px',
                        cursor: user ? 'pointer' : 'not-allowed',
                        background: hasVoted ? '#6366f1' : '#333',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        fontWeight: 600,
                        opacity: !user ? 0.6 : 1,
                      }}
                    >
                      ▲ {meme.voteCount}
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {meme.$file?.url && (
                      <button
                        onClick={() => downloadMeme(meme.$file!.url)}
                        style={{
                          padding: '8px 16px',
                          cursor: 'pointer',
                          background: '#333',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 8,
                          fontWeight: 500,
                        }}
                      >
                        Download
                      </button>
                    )}
                    {user && (
                      <button
                        onClick={async () => {
                          if (!isCreator) return;
                          try {
                            if (meme.$file?.id) {
                              await db.transact([
                                db.tx.memes[meme.id].delete(),
                                db.tx.$files[meme.$file.id].delete(),
                              ]);
                            } else {
                              await db.transact(db.tx.memes[meme.id].delete());
                            }
                          } catch (err) {
                            console.error('Delete failed:', err);
                          }
                        }}
                        disabled={!isCreator}
                        title={isCreator ? 'Delete meme' : 'Only the creator can delete'}
                        style={{
                          padding: '8px 16px',
                          cursor: isCreator ? 'pointer' : 'not-allowed',
                          background: isCreator ? '#7f1d1d' : '#333',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 8,
                          fontWeight: 500,
                          opacity: isCreator ? 1 : 0.6,
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
