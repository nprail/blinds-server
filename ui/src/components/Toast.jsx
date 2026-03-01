export default function Toast({ toasts, removeToast }) {
  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => removeToast(t.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg text-sm cursor-pointer select-none
            ${t.type === 'error' ? 'bg-red-700 text-white' : 'bg-emerald-700 text-white'}`}
        >
          <span>{t.type === 'error' ? '✗' : '✓'}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
