'use strict';

// ── Constants ──────────────────────────────────────────────────────────────────
const TOAST_DURATION_MS = 4000;

// ── Shorthand helpers ──────────────────────────────────────────────────────────
const { useState, useEffect, useCallback, createElement: h } = React;

// ── API helpers ────────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error ?? 'Request failed');
  return json.data;
}

// ── Toast ──────────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((message, type = 'ok') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), TOAST_DURATION_MS);
  }, []);
  const remove = useCallback(id =>
    setToasts(prev => prev.filter(t => t.id !== id)), []);
  return { toasts, toast: add, removeToast: remove };
}

function Toast({ toasts, removeToast }) {
  return h('div', { className: 'toast-container' },
    toasts.map(t =>
      h('div', {
        key: t.id,
        className: 'toast ' + (t.type === 'error' ? 'toast-error' : 'toast-ok'),
        onClick: () => removeToast(t.id),
      },
        h('span', null, t.type === 'error' ? '✗' : '✓'),
        h('span', null, t.message)
      )
    )
  );
}

// ── State badge colour ─────────────────────────────────────────────────────────
function stateColor(state) {
  return { up: 'text-emerald-400', down: 'text-red-400',
           stop: 'text-amber-400', pair: 'text-violet-400' }[state] ?? 'text-gray-500';
}

// ── ChannelCard ────────────────────────────────────────────────────────────────
function ChannelCard({ channel, toast }) {
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
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  }

  async function startLearn() {
    setLearning(true); setBusy(true);
    try {
      const data = await apiFetch('/blinds/learn', {
        method: 'POST',
        body: JSON.stringify({ channelId: channel.id, command: learnCmd, timeoutSec: learnSec }),
      });
      const preview = data.code ? data.code.slice(0, 12) + '…' : '(no code)';
      toast(`Learned "${learnCmd}": ${preview}`);
    } catch (err) { toast(err.message, 'error'); }
    finally { setLearning(false); setBusy(false); }
  }

  return h('div', { className: 'card' },
    // Header
    h('div', { className: 'card-header' },
      h('div', null,
        h('h2', { className: 'text-lg font-semibold' }, channel.name),
        h('p',  { className: 'text-xs text-gray-500' }, `Channel ${channel.id}`)
      ),
      h('span', { className: 'state-badge ' + stateColor(state) }, state)
    ),
    // Control buttons
    h('div', { className: 'grid-4' },
      h('button', { className: 'btn-up',   disabled: busy, onClick: () => sendCmd('up')   }, '▲ Up'),
      h('button', { className: 'btn-stop', disabled: busy, onClick: () => sendCmd('stop') }, '■ Stop'),
      h('button', { className: 'btn-down', disabled: busy, onClick: () => sendCmd('down') }, '▼ Down'),
      h('button', { className: 'btn-pair', disabled: busy, onClick: () => sendCmd('pair') }, '⚙ Pair'),
    ),
    // Learn section
    h('details', null,
      h('summary', null, 'Learn code from remote'),
      h('div', { className: 'flex-col gap-3 mt-3', style: { display: 'flex' } },
        h('div', { className: 'grid-2' },
          h('div', null,
            h('label', null, 'Command'),
            h('select', { value: learnCmd, onChange: e => setLearnCmd(e.target.value) },
              ['up', 'down', 'stop', 'pair'].map(c => h('option', { key: c, value: c }, c))
            )
          ),
          h('div', null,
            h('label', null, 'Timeout (s)'),
            h('input', {
              type: 'number', min: 1, max: 60, value: learnSec,
              onChange: e => setLearnSec(Number(e.target.value)),
            })
          )
        ),
        h('button', {
          className: 'btn-indigo',
          disabled: busy,
          onClick: startLearn,
          style: { width: '100%' },
        }, learning ? `⏳ Listening… (${learnSec}s)` : '📡 Start Learning'),
        learning && h('p', { className: 'text-xs text-indigo-300 text-center animate-pulse' },
          `Press the "${learnCmd}" button on your remote now…`
        )
      )
    )
  );
}

// ── BulkControls ───────────────────────────────────────────────────────────────
function BulkControls({ toast }) {
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
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  }

  return h('div', { className: 'card' },
    h('p', { className: 'section-label' }, 'All Channels'),
    h('div', { className: 'grid-3' },
      h('button', { className: 'btn-up',   disabled: busy, onClick: () => sendAll('up')   }, '▲ All Up'),
      h('button', { className: 'btn-stop', disabled: busy, onClick: () => sendAll('stop') }, '■ All Stop'),
      h('button', { className: 'btn-down', disabled: busy, onClick: () => sendAll('down') }, '▼ All Down'),
    )
  );
}

// ── App ────────────────────────────────────────────────────────────────────────
function App() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const { toasts, toast, removeToast } = useToast();

  const loadChannels = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/blinds');
      setChannels(data);
      setError(null);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  return h('div', { className: 'app-wrap' },
    // Header
    h('header', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' },
    },
      h('div', null,
        h('h1', { className: 'text-2xl font-bold tracking-tight' }, '🪟 Blinds Controller'),
        h('p',  { className: 'text-sm text-gray-500 mt-1' }, '433.92 MHz RF · SX1278')
      ),
      h('button', { className: 'btn-outline', onClick: loadChannels }, '↻ Refresh')
    ),

    loading && h('p', { className: 'text-center text-gray-500 py-16 animate-pulse' }, 'Loading channels…'),

    error && h('div', { className: 'alert-error' }, '⚠ ', error),

    !loading && !error && h('div', { style: { display: 'flex', flexDirection: 'column', gap: '1rem' } },
      h(BulkControls, { toast }),
      channels.length === 0
        ? h('p', { className: 'text-center text-gray-600 py-8' },
            'No channels configured. Edit ', h('code', null, 'config/blinds.json'), ' to add channels.')
        : channels.map(ch => h(ChannelCard, { key: ch.id, channel: ch, toast }))
    ),

    h(Toast, { toasts, removeToast })
  );
}

// ── Mount ──────────────────────────────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById('root')).render(h(App, null));
