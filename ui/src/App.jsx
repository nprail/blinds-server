import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from './api.js';
import BulkControls from './components/BulkControls.jsx';
import ChannelCard from './components/ChannelCard.jsx';
import Toast from './components/Toast.jsx';
import { useToast } from './hooks/useToast.js';

export default function App() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { toasts, toast, removeToast } = useToast();

  const loadChannels = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/blinds');
      setChannels(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-100">🪟 Blinds Controller</h1>
          <p className="text-sm text-gray-500 mt-0.5">433.92 MHz RF · SX1278</p>
        </div>
        <button
          onClick={loadChannels}
          className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-100 hover:border-gray-500 transition-colors"
        >
          ↻ Refresh
        </button>
      </header>

      {loading && (
        <p className="text-center text-gray-500 mt-16 animate-pulse">Loading channels…</p>
      )}

      {error && (
        <div className="rounded-xl bg-red-900/40 border border-red-700 p-4 text-sm text-red-300 mb-6">
          ⚠ {error}
        </div>
      )}

      {!loading && !error && (
        <div className="flex flex-col gap-4">
          <BulkControls toast={toast} />
          {channels.length === 0 ? (
            <p className="text-center text-gray-600 py-8">
              No channels configured. Edit{' '}
              <code className="text-gray-400">config/blinds.json</code> to add channels.
            </p>
          ) : (
            channels.map(ch => (
              <ChannelCard key={ch.id} channel={ch} toast={toast} />
            ))
          )}
        </div>
      )}

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
