import { useState } from 'react';
import { apiFetch } from '../api.js';

const STATE_COLORS = {
  up:      'text-emerald-400',
  down:    'text-red-400',
  stop:    'text-amber-400',
  pair:    'text-violet-400',
  unknown: 'text-gray-500',
};

export default function ChannelCard({ channel, toast }) {
  const [busy, setBusy]         = useState(false);
  const [state, setState]       = useState(channel.state ?? 'unknown');
  const [learning, setLearning] = useState(false);
  const [learnCmd, setLearnCmd] = useState('up');
  const [learnSec, setLearnSec] = useState(10);

  async function sendCmd(action) {
    setBusy(true);
    try {
      await apiFetch(`/blinds/${channel.id}/${action}`, { method: 'POST' });
      setState(action);
      toast(`Channel ${channel.id}: ${action}`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function startLearn() {
    setLearning(true);
    setBusy(true);
    try {
      const data = await apiFetch('/blinds/learn', {
        method: 'POST',
        body: JSON.stringify({ channelId: channel.id, command: learnCmd, timeoutSec: learnSec }),
      });
      const preview = data.code != null ? String(data.code).slice(0, 12) + '…' : '(no code)';
      toast(`Learned "${learnCmd}": ${preview}`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLearning(false);
      setBusy(false);
    }
  }

  const stateColor = STATE_COLORS[state] ?? STATE_COLORS.unknown;

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">{channel.name}</h2>
          <p className="text-xs text-gray-500">Channel {channel.id}</p>
        </div>
        <span className={`text-sm font-medium capitalize ${stateColor}`}>{state}</span>
      </div>

      {/* Control buttons */}
      <div className="grid grid-cols-4 gap-2">
        <button
          disabled={busy}
          onClick={() => sendCmd('up')}
          className="flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          ▲ Up
        </button>
        <button
          disabled={busy}
          onClick={() => sendCmd('stop')}
          className="flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          ■ Stop
        </button>
        <button
          disabled={busy}
          onClick={() => sendCmd('down')}
          className="flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          ▼ Down
        </button>
        <button
          disabled={busy}
          onClick={() => sendCmd('pair')}
          className="flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          ⚙ Pair
        </button>
      </div>

      {/* Learn section */}
      <details className="group">
        <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-200 select-none list-none">
          ▸ Learn code from remote
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Command</label>
              <select
                value={learnCmd}
                onChange={e => setLearnCmd(e.target.value)}
                className="rounded-lg bg-gray-800 border border-gray-700 text-sm px-2 py-1.5 text-gray-100"
              >
                {['up', 'down', 'stop', 'pair'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Timeout (s)</label>
              <input
                type="number"
                min={1}
                max={60}
                value={learnSec}
                onChange={e => setLearnSec(Number(e.target.value))}
                className="rounded-lg bg-gray-800 border border-gray-700 text-sm px-2 py-1.5 text-gray-100"
              />
            </div>
          </div>
          <button
            disabled={busy}
            onClick={startLearn}
            className="w-full flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {learning ? `⏳ Listening… (${learnSec}s)` : '📡 Start Learning'}
          </button>
          {learning && (
            <p className="text-xs text-indigo-300 text-center animate-pulse">
              Press the &ldquo;{learnCmd}&rdquo; button on your remote now…
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
