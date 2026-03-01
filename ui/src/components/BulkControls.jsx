import { useState } from 'react';
import { apiFetch } from '../api.js';

export default function BulkControls({ toast }) {
  const [busy, setBusy] = useState(false);

  async function sendAll(action) {
    setBusy(true);
    try {
      const results = await apiFetch(`/blinds/all/${action}`, { method: 'POST' });
      const failedCount = results.filter(r => !r.success).length;
      if (failedCount) {
        toast(`${results.length - failedCount}/${results.length} channels responded`, 'error');
      } else {
        toast(`All channels: ${action}`);
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
        All Channels
      </h2>
      <div className="grid grid-cols-3 gap-2">
        <button
          disabled={busy}
          onClick={() => sendAll('up')}
          className="flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          ▲ All Up
        </button>
        <button
          disabled={busy}
          onClick={() => sendAll('stop')}
          className="flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          ■ All Stop
        </button>
        <button
          disabled={busy}
          onClick={() => sendAll('down')}
          className="flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          ▼ All Down
        </button>
      </div>
    </div>
  );
}
