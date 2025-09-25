'use client';

import { useEffect, useState } from 'react';

export default function IngestPage() {
  const [folderUrl, setFolderUrl] = useState('');
  const [log, setLog] = useState([]);
  const [progress, setProgress] = useState({ total: 0, processed: 0, remaining: 0, percent: 0 });
  // State để lưu danh sách file đã enqueue (có thumbnail, folder)
  const [enqueuedFiles, setEnqueuedFiles] = useState([]);
  const [enqueuedFolderId, setEnqueuedFolderId] = useState("");

  // status badges
  const [adobeStatus, setAdobeStatus] = useState('not_connected');
  const [googleStatus, setGoogleStatus] = useState('checking');

  useEffect(() => {
    // đọc query để biết kết quả từ các callback
    const p = new URLSearchParams(window.location.search);
    const a = p.get('adobe');
    if (a) setAdobeStatus(a === 'connected' ? 'connected' : `error:${a}`);
    const g = p.get('google');
    if (g) setGoogleStatus(g === 'connected' ? 'connected' : `error:${g}`);

    // ping trạng thái Google (env có refresh token chưa)
    fetch('/api/google/status')
      .then(r => r.json())
      .then(j => setGoogleStatus(j.connected ? 'connected' : 'not_connected'))
      .catch(() => setGoogleStatus('not_connected'));

      // ping adobe status
    fetch('/api/adobe/status')
        .then(r => r.json())
        .then(j => setAdobeStatus(j.connected ? 'connected' : 'not_connected'))
        .catch(() => setAdobeStatus('not_connected'));

    // load progress lần đầu
    refreshProgress();
  }, []);

  function connectAdobe() {
    window.location.href = '/api/adobe/oauth/login';
  }

  function connectGoogle() {
    window.location.href = '/api/google/oauth/login';
  }

  async function enqueue() {
    if (googleStatus !== 'connected') {
      setLog(l => [`⚠️ Google chưa kết nối — hãy bấm "Connect Google" trước.`, ...l]);
      return;
    }
    setLog(l => [`Scanning & enqueueing...`, ...l]);
    const r = await fetch('/api/enqueue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folderUrl })
    });
    const j = await r.json();
    if (!r.ok) {
      setLog(l => [`Enqueue failed: ${j.error}`, ...l]);
      setEnqueuedFiles([]);
      setEnqueuedFolderId("");
    } else {
      setLog(l => [`Enqueued ${j.total} BMP files`, ...l]);
      setEnqueuedFiles(j.files || []);
      setEnqueuedFolderId(j.folderId || "");
    }
    await refreshProgress();
  }

  async function processOne() {
    const r = await fetch('/api/worker/process', { method: 'POST' });
    const j = await r.json();
    if (j.status === 'done') setLog(l => [`✔ ${j.file}`, ...l]);
    else if (j.status === 'idle') setLog(l => [`Queue empty`, ...l]);
    else setLog(l => [`Retry: ${j.error}`, ...l]);
    await refreshProgress();
  }

  async function processAll() {
    let keep = true;
    while (keep) {
      const r = await fetch('/api/worker/process', { method: 'POST' });
      const j = await r.json();
      if (j.status === 'done') setLog(l => [`✔ ${j.file}`, ...l]);
      if (j.status === 'idle') keep = false;
      await refreshProgress();
      await new Promise(res => setTimeout(res, 300));
    }
  }

  async function refreshProgress() {
    const r = await fetch('/api/progress');
    const j = await r.json();
    setProgress(j);
  }

  const Badge = ({ ok, text }) => (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 12,
        background: ok ? '#DCFCE7' : '#FEE2E2',
        color: ok ? '#14532D' : '#7F1D1D',
        border: `1px solid ${ok ? '#86EFAC' : '#FCA5A5'}`
      }}
    >
      {text}
    </span>
  );

  const adobeOk = adobeStatus === 'connected';
  const googleOk = googleStatus === 'connected';

  // Group files theo folder
  const groupedFiles = enqueuedFiles.reduce((acc, file) => {
    if (!acc[file.folder]) acc[file.folder] = [];
    acc[file.folder].push(file);
    return acc;
  }, {});

  async function clearQueue() {
    setLog(l => ["Đang xóa queue...", ...l]);
    const r = await fetch('/api/queue/clear', { method: 'POST' });
    const j = await r.json();
    if (r.ok) setLog(l => [`Đã xóa ${j.cleared} jobs`, ...l]);
    else setLog(l => [`Lỗi khi xóa queue: ${j.error}`, ...l]);
    await refreshProgress();
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Drive BMP → TIFF → (Lightroom)</h1>

      {/* Kết nối Adobe & Google */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={connectAdobe} className="px-3 py-2 rounded bg-black text-white">
          Connect Adobe
        </button>
        <Badge ok={adobeOk} text={adobeOk ? 'Adobe: Connected' : `Adobe: ${adobeStatus}`} />

        <button onClick={connectGoogle} className="px-3 py-2 rounded bg-black text-white">
          Connect Google
        </button>
        <Badge ok={googleOk} text={googleOk ? 'Google: Connected' : `Google: ${googleStatus}`} />
      </div>

      <input
        className="border rounded px-3 py-2 w-full"
        placeholder="Paste Google Drive folder URL..."
        value={folderUrl}
        onChange={e => setFolderUrl(e.target.value)}
      />

      <div className="flex gap-2 flex-wrap">
        <button onClick={enqueue} className="px-3 py-2 rounded bg-black text-white" disabled={!googleOk}>
          Scan & Enqueue
        </button>
        <button onClick={processOne} className="px-3 py-2 rounded border">Process One</button>
        <button onClick={processAll} className="px-3 py-2 rounded border">Process All</button>
        <button onClick={refreshProgress} className="px-3 py-2 rounded border">Refresh</button>
        <button onClick={clearQueue} className="px-3 py-2 rounded border text-red-700 border-red-400">Clear Queue</button>
      </div>

      <div className="text-sm">
        Progress: {progress.percent}% — {progress.processed}/{progress.total} (remaining {progress.remaining})
      </div>

      <div className="border rounded p-3 h-64 overflow-auto text-sm space-y-1">
        {log.map((l, i) => <div key={i}>{l}</div>)}
      </div>

      {/* Thumbnails group theo folder */}
      {enqueuedFiles.length > 0 && (
        <div className="mt-6">
          <h2 className="font-semibold mb-2">Thumbnails (group by folder):</h2>
          <div className="space-y-4">
            {Object.entries(groupedFiles).map(([folder, files]) => (
              <div key={folder}>
                <div className="font-medium text-sm mb-1">📁 {folder}</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 mb-2">
                  {files.map(f => (
                    <div key={f.id} className="flex flex-col items-center">
                      <img src={f.thumbnail} alt={f.name} className="w-20 h-20 object-cover border rounded mb-1" />
                      <div className="text-xs truncate w-full text-center">{f.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Lưu ý: để giữ free-tier, mỗi job xử lý 1 ảnh. Nếu đổi port dev, nhớ cập nhật redirect URI của Adobe & Google.
      </p>
    </div>
  );
}
