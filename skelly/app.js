(() => {
  document.body.classList.add('disconnected');

  // --- Config ---
  const SERVICE_UUID = '0000ae00-0000-1000-8000-00805f9b34fb';
  const WRITE_UUID   = '0000ae01-0000-1000-8000-00805f9b34fb';
  const NOTIFY_UUID  = '0000ae02-0000-1000-8000-00805f9b34fb';
  const ACK_KEY = 'skelly_ack_v2';
  const LONG_WARN_ACK_KEY = 'skelly_long_track_ack';

  // Platform detection - macOS needs longer delays for Bluetooth reliability
  const IS_MACOS = navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
  // Base inter-chunk pacing; macOS kept conservative but reduced from 300 → 150ms
  const CHUNK_DELAY_MS = IS_MACOS ? 150 : 50;

  // Log storage for saving to file
  const logHistory = [];

    // Long-audio warning
    const LONG_TRACK_LIMIT_SECONDS = 30;
    const LONG_TRACK_WARN = 'Uploading a track longer than 30 seconds is experimental, please proceed with caution.';

  /** Get audio duration (in seconds) from a File. Tries <audio> first, falls back to WebAudio. */
  async function getAudioDurationFromFile(file) {
  // Fast path: use an off-DOM <audio> to read metadata
  const viaElement = () => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
    const d = audio.duration;
    URL.revokeObjectURL(url);
    // Some formats may report Infinity until enough data is loaded
    if (isFinite(d) && d > 0) resolve(d); else reject(new Error('Non-finite duration'));
    };
    audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Audio element failed')); };
    audio.src = url;
  });

  try {
    return await viaElement();
  } catch {
    // Fallback: decode with Web Audio API
    try {
    const buf = await file.arrayBuffer();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const audioBuf = await ctx.decodeAudioData(buf.slice(0)); // copy for Safari compatibility
    ctx.close?.();
    return audioBuf?.duration ?? null;
    } catch {
    return null; // Unknown/unsupported type
    }
  }
  }

/** If duration exceeds limit, show a dismissible modal once (checkbox to hide in future). */
async function maybeWarnLongTrack(durationSec) {
  if (durationSec != null && durationSec > LONG_TRACK_LIMIT_SECONDS) {
    await ensureLongWarning();
    log(LONG_TRACK_WARN, 'warn'); // keep logging so it’s visible in the Log panel
  }
}

/** Show the long-audio modal unless the user opted out. Always resolves true. */
function ensureLongWarning() {
  if (localStorage.getItem(LONG_WARN_ACK_KEY) === '1') return Promise.resolve(true);
  const m = $('#longModal');
  // Fallback to alert if the modal block isn’t in the HTML for some reason
  if (!m) { alert(LONG_TRACK_WARN); return Promise.resolve(true); }

  m.classList.remove('hidden');
  return new Promise((resolve) => {
    const ok = () => {
      if ($('#longDontShow')?.checked) localStorage.setItem(LONG_WARN_ACK_KEY, '1');
      cleanup(); resolve(true);
    };
    const cleanup = () => {
      $('#longOk')?.removeEventListener('click', ok);
      m.classList.add('hidden');
    };
    $('#longOk')?.addEventListener('click', ok);
  });
}

  // advanced toggles
const ADV_KEYS = { raw:'skelly_adv_raw', ft:'skelly_adv_ft', fedc:'skelly_adv_fedc', edit:'skelly_adv_edit' };

  // --- Padding defaults (bytes) ---
  const PAD_DEFAULT = 8;
  const PAD_QUERY   = 8;
  const PAD_MEDIA   = 8;

  // --- UI helpers ---
  const $ = sel => document.querySelector(sel);
  const logEl = $('#log');
  function log(msg, cls='') {
    const div = document.createElement('div');
    div.className = `line ${cls}`;
    const time = new Date().toLocaleTimeString();
    const logLine = `[${time}] ${msg}`;
    div.textContent = logLine;
    logEl.appendChild(div);

    // Store in history for saving
    logHistory.push(logLine);

    const auto = $('#chkAutoscroll');
    if (!auto || auto.checked) logEl.scrollTop = logEl.scrollHeight;
  }
  function setStatus(text) { document.querySelector('#status span').textContent = text; }
  function setProgress(idx, total) {
    const pct = total ? Math.round((idx/total)*100) : 0;
    $('#progText').textContent = `${idx} / ${total}`;
    $('#progPct').textContent = `${pct}%`;
    $('#progBar').style.width = `${pct}%`;
  }
  $('#btnClearLog')?.addEventListener('click', ()=>{
    logEl.innerHTML='';
    logHistory.length = 0; // Clear log history
  });

  // Save logs to file
  $('#btnSaveLogs')?.addEventListener('click', ()=>{
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `ultraskelly-logs-${timestamp}.txt`;
    const content = logHistory.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    log(`Logs saved to ${filename}`, 'success');
  });

  // --- Warning modal ---
  const riskModal = $('#riskModal');
  const showRisk = () => riskModal.classList.remove('hidden');
  const hideRisk = () => riskModal.classList.add('hidden');
  window.addEventListener('load', () => { if (!localStorage.getItem(ACK_KEY)) showRisk(); });
  $('#riskAccept').addEventListener('click', () => { localStorage.setItem(ACK_KEY, '1'); hideRisk(); });
  $('#riskCancel').addEventListener('click', () => { window.location.href = 'about:blank'; });

  // --- Advanced menu ---
  const advMenu = $('#advMenu');
  const advRaw = $('#advRaw');
  const advFT  = $('#advFT');
  const advFEDC = $('#advFEDC');
  const advRawBlock = $('#advRawBlock');
  const advFTBlock  = $('#advFTBlock');
  const advEdit = $('#advEdit');

function loadAdvState() {
  advRaw.checked   = localStorage.getItem(ADV_KEYS.raw)  === '1';
  advFT.checked    = localStorage.getItem(ADV_KEYS.ft)   === '1';
  advFEDC.checked  = localStorage.getItem(ADV_KEYS.fedc) === '1';
  advEdit.checked  = localStorage.getItem(ADV_KEYS.edit) === '1';
  applyAdvVisibility();
}

function saveAdvState() {
  localStorage.setItem(ADV_KEYS.raw,  advRaw.checked  ? '1':'0');
  localStorage.setItem(ADV_KEYS.ft,   advFT.checked   ? '1':'0');
  localStorage.setItem(ADV_KEYS.fedc, advFEDC.checked ? '1':'0');
  localStorage.setItem(ADV_KEYS.edit, advEdit.checked ? '1':'0');
}
  loadAdvState();

// Warning modal wiring
const editWarnModal = $('#editWarnModal');
const showEditWarn  = () => editWarnModal?.classList.remove('hidden');
const hideEditWarn  = () => editWarnModal?.classList.add('hidden');
$('#editWarnOk')?.addEventListener('click', hideEditWarn);

// Show popup when enabling Edit; also re-render the table so buttons enable/disable
advEdit?.addEventListener('change', () => {
  saveAdvState();
  updateFilesTable();
  if (advEdit.checked) showEditWarn();
});

  $('#btnAdvanced').addEventListener('click', (e) => {
    e.stopPropagation();
    advMenu.classList.toggle('hidden');
  });
  document.addEventListener('click', (e)=>{
    if (!e.target.closest('.menuwrap')) advMenu.classList.add('hidden');
  });
  [advRaw, advFT, advFEDC].forEach(el => el.addEventListener('change', ()=>{ saveAdvState(); applyAdvVisibility(); }));

  // --- BLE state ---
  let device = null, server = null, service = null, writeChar = null, notifyChar = null;
  const isConnected = () => !!(device && device.gatt && device.gatt.connected && writeChar);

  // --- Waiters (optional) ---
  const waiters = [];
  function waitFor(prefix, timeoutMs=4000) {
    return new Promise((resolve, reject) => {
      const w = { prefix, resolve, reject, t:setTimeout(()=>{ reject(new Error(`Timeout waiting for ${prefix}`)); }, timeoutMs) };
      waiters.push(w);
    });
  }
  function handleWaiters(hex) {
    for (let i=waiters.length-1; i>=0; i--) {
      if (hex.startsWith(waiters[i].prefix)) {
        clearTimeout(waiters[i].t);
        waiters[i].resolve(hex);
        waiters.splice(i,1);
      }
    }
  }

  // --- CRC8 helpers ---
  function crc8(bytes) {
    let crc = 0;
    for (const b of bytes) {
      let x = crc ^ b;
      for (let i=0;i<8;i++) x = (x & 1) ? ((x >>> 1) ^ 0x8C) : (x >>> 1);
      crc = x & 0xFF;
    }
    return crc.toString(16).toUpperCase().padStart(2,'0');
  }
  function hexToBytes(hex) {
    if (!hex) return new Uint8Array();
    const clean = hex.replace(/\s+/g,'');
    if (clean.length % 2 !== 0) throw new Error('Hex length must be even');
    const out = new Uint8Array(clean.length/2);
    for (let i=0;i<out.length;i++) out[i] = parseInt(clean.substr(i*2,2),16);
    return out;
  }
  const bytesToHex = u8 => Array.from(u8, b=>b.toString(16).toUpperCase().padStart(2,'0')).join('');
  const intToHex = (n, bytes) => (n>>>0).toString(16).toUpperCase().padStart(bytes*2,'0').slice(-bytes*2);
  function utf16leHex(str) {
    if (!str) return '';
    let hex = '';
    for (const ch of str) {
      const cp = ch.codePointAt(0);
      if (cp <= 0xFFFF) {
        const lo = cp & 0xFF, hi = (cp >> 8) & 0xFF;
        hex += lo.toString(16).padStart(2,'0') + hi.toString(16).padStart(2,'0');
      } else {
        const v = cp - 0x10000;
        const hiS = 0xD800 + ((v >> 10) & 0x3FF);
        const loS = 0xDC00 + (v & 0x3FF);
        hex += (hiS & 0xFF).toString(16).padStart(2,'0') + ((hiS >> 8) & 0xFF).toString(16).padStart(2,'0');
        hex += (loS & 0xFF).toString(16).padStart(2,'0') + ((loS >> 8) & 0xFF).toString(16).padStart(2,'0');
      }
    }
    return hex.toUpperCase();
  }
  function decodeUtf16le(u8) {
    let s = '';
    for (let i=0;i+1<u8.length;i+=2) {
      const lo = u8[i], hi = u8[i+1];
      const code = (hi<<8) | lo;
      if (code === 0) continue;
      s += String.fromCharCode(code);
    }
    return s;
  }

  function buildCmd(tag, payloadHex = '', minBytes = PAD_DEFAULT) {
    const p = (payloadHex || '').replace(/\s+/g, '').toUpperCase();
    const minLen = Math.max(0, (minBytes|0) * 2);
    const padded = p.length < minLen ? p + '0'.repeat(minLen - p.length) : p;
    const base = 'AA' + tag.toUpperCase() + padded;
    const crc = crc8(hexToBytes(base));
    return hexToBytes(base + crc);
  }

  // --- Status model ---
  const status = {
    deviceName: '',
    showMode: null,
    channels: [],
    btName: '',
    volume: null,
    live: { action: null, eye: null },
    capacity: null,
    filesReported: null,
  };
  let targetsBuiltFromE0 = false;

    function eyeSrc(eyeNumber) {
      const map = (typeof EYE_NUM_TO_IMG !== 'undefined') ? EYE_NUM_TO_IMG : {};
      const imgIdx = map[eyeNumber] || eyeNumber;
      return `images/icon_eyes_${imgIdx}_se.png`;
    }
    function eyeImgHTML(eyeNumber) {
      const map = (typeof EYE_NUM_TO_IMG !== 'undefined') ? EYE_NUM_TO_IMG : {};
      const imgIdx = map[eyeNumber] || eyeNumber;
      const png = `images/icon_eyes_${imgIdx}_se.png`;
      const bmp = `images/icon_eyes_${imgIdx}_se.bmp`;
      return `<img class="eye-thumb" src="${png}" onerror="this.onerror=null;this.src='${bmp}'" alt="eye ${eyeNumber}" />`;
    }
  function buildTargetOptions(count = 6) {
    const sel = $('#targetSelect');
    if (!sel) return;
    sel.innerHTML = `<option value="FF">All Channels</option>` +
      Array.from({length: count}, (_, i) =>
        `<option value="${intToHex(i+1,1)}">Channel ${i+1}</option>`).join('');
  }
  buildTargetOptions(6);

  function currentChannelHex() {
    return ($('#targetSelect')?.value || 'FF').toUpperCase();
  }

  function updateStatusUI() {
    $('#statName') && ($('#statName').textContent = status.deviceName || '—');
    $('#statShowMode') && ($('#statShowMode').textContent = status.showMode ?? '—');
    $('#statChannels') && ($('#statChannels').textContent = status.channels.length ? status.channels.join(', ') : '—');
    $('#statBtName') && ($('#statBtName').textContent = status.btName || '—');
    if ($('#statVolume')) {
      const v = status.volume;
      $('#statVolume').textContent = (v==null) ? '—' : `${v}%`;
    }
    $('#statAction') && ($('#statAction').textContent = status.live.action ?? '—');

    if (!targetsBuiltFromE0 && status.channels && status.channels.length) {
      buildTargetOptions(status.channels.length);
      targetsBuiltFromE0 = true;
    }

    if ($('#statCapacity')) {
      $('#statCapacity').textContent = (status.capacity != null)
        ? `${status.capacity} KB (${status.filesReported ?? '—'} files)`
        : '—';
    }
    const img = $('#statEye');
    const txt = $('#statEyeText');
    if (img && txt) {
      if (status.live.eye != null) {
        img.style.display = 'inline-block';
        img.src = eyeSrc(status.live.eye);
        img.onerror = () => { img.onerror = null; img.src = `images/icon_eyes_${status.live.eye}_se.bmp`; };
        txt.textContent = ` ${status.live.eye}`;
      } else {
        img.style.display = 'none';
        txt.textContent = '—';
      }
    }
  }

  async function connect() {
    try {
      const nameFilter = $('#nameFilter').value.trim();
      const options = nameFilter
        ? { filters:[{ namePrefix: nameFilter }], optionalServices:[SERVICE_UUID] }
        : { acceptAllDevices:true, optionalServices:[SERVICE_UUID] };
      device = await navigator.bluetooth.requestDevice(options);
      device.addEventListener('gattserverdisconnected', onDisconnect);
      log(`Selected: ${device.name || '(unnamed)'} ${device.id}`, 'warn');
      server = await device.gatt.connect();
      service = await server.getPrimaryService(SERVICE_UUID);
      writeChar = await service.getCharacteristic(WRITE_UUID);
      notifyChar = await service.getCharacteristic(NOTIFY_UUID);
      await notifyChar.startNotifications();
      notifyChar.addEventListener('characteristicvaluechanged', onNotify);
      $('#btnDisconnect').disabled = false;
      setStatus('Connected');
      document.body.classList.remove('disconnected');
      status.deviceName = device?.name || status.deviceName;
      updateStatusUI();
      log('Connected and notifications started', 'warn');

      // Sync like the Android app:
      startFetchFiles(true);
    } catch (err) {
      log('Connect error: ' + err.message, 'warn');
    }
  }
  async function disconnect() {
    try {
      if (notifyChar) { try { await notifyChar.stopNotifications(); } catch {}
        notifyChar.removeEventListener('characteristicvaluechanged', onNotify);
      }
      if (device && device.gatt.connected) device.gatt.disconnect();
    } finally { onDisconnect(); }
  }
  function onDisconnect() {
    document.body.classList.add('disconnected');
    $('#btnDisconnect').disabled = true;
    setStatus('Disconnected');
    log('Disconnected', 'warn');
    device = server = service = writeChar = notifyChar = null;
    waiters.splice(0);
    files.activeFetch = false;
    clearTimeout(files.timer);
  }

  async function send(cmdBytes, opts = {}) {
    if (!isConnected()) { log('Not connected', 'warn'); return; }
    const hex = bytesToHex(cmdBytes);
    log('TX ' + hex, 'tx');
    // Choose write method based on command type and characteristic capabilities
    const c = writeChar;
    if (!c) return;
    const props = c.properties || {};
    const tag = (cmdBytes && cmdBytes.length >= 2) ? cmdBytes[1] : 0x00; // 0xC0..C3, etc.
    const doWrite = async (preferWithout) => {
      if (preferWithout && typeof c.writeValueWithoutResponse === 'function' && props.writeWithoutResponse) {
        return c.writeValueWithoutResponse(cmdBytes);
      }
      if (typeof c.writeValueWithResponse === 'function' && props.write) {
        return c.writeValueWithResponse(cmdBytes);
      }
      if (!preferWithout && typeof c.writeValueWithoutResponse === 'function' && props.writeWithoutResponse) {
        return c.writeValueWithoutResponse(cmdBytes);
      }
      if (typeof c.writeValue === 'function') {
        return c.writeValue(cmdBytes);
      }
      return c.writeValue(cmdBytes);
    };
    try {
      // Override preferences if explicitly requested
      const forceWith = !!opts.forceWithResponse;
      const forceWithout = !!opts.forceWithoutResponse;
      let preferWithout = false;
      if (forceWith) {
        preferWithout = false;
      } else if (forceWithout) {
        preferWithout = true;
      } else {
        // Default: data chunks
        // - On macOS, prefer with-response for C1 to improve reliability (esp. chunk 0)
        // - Elsewhere, prefer without-response for throughput
        preferWithout = (tag === 0xC1) ? !IS_MACOS : false;
      }
      await doWrite(preferWithout);
    } catch (e1) {
      log('Write error (first try): ' + (e1?.message || e1), 'warn');
      // Brief backoff and try alternate path
      await sleep(100);
      try {
        // Flip preference and retry
        const forceWith = !!opts.forceWithResponse;
        const forceWithout = !!opts.forceWithoutResponse;
        let preferWithout = false;
        if (forceWith) {
          preferWithout = false;
        } else if (forceWithout) {
          preferWithout = true;
        } else {
          preferWithout = (tag === 0xC1) ? IS_MACOS : true; // flip from first try
        }
        await doWrite(preferWithout);
      } catch (e2) {
        log('Write error (retry): ' + (e2?.message || e2), 'warn');
        throw e2;
      }
    }
  }

  function onNotify(e) {
    const v = new Uint8Array(e.target.value.buffer);
    const hex = bytesToHex(v);
    log('RX ' + hex, 'rx');
    try { parseNotify(hex, v); } catch {}
    try { handleWaiters(hex); } catch {}
  }

  // --- Files table model ---
  const files = {
    expected: null,
    items: new Map(),
    activeFetch: false,
    timer: null,
    afterCompleteSent: false,
  };
  function resetFiles() {
    files.expected = null;
    files.items.clear();
    files.afterCompleteSent = false;
    updateFilesTable();
    $('#filesSummary').textContent = '—';
    clearTimeout(files.timer);
  }
  function updateFilesTable() {
    const tbody = $('#filesTable tbody');
    tbody.innerHTML = '';
    const q = ($('#filesFilter')?.value || '').toLowerCase().trim();
    const rows = Array.from(files.items.values())
      .filter(it => !q || (it.name||'').toLowerCase().includes(q))
      .sort((a,b)=>a.serial-b.serial);

    const canEdit = !!(advEdit && advEdit.checked);   // <— toggle state

    for (const it of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${it.serial}</td>
        <td>${it.cluster}</td>
        <td>${escapeHtml(it.name || '')}</td>
        <td>${it.attr}</td>
        <td>${eyeImgHTML(it.eye)}${it.eye ?? ''}</td>
        <td>${it.db}</td>
        <td>
          <button class="btn sm" data-action="play" data-serial="${it.serial}">▶ Play</button>
          <button class="btn sm" data-action="edit" data-serial="${it.serial}"
            ${canEdit ? '' : 'disabled aria-disabled="true" title="Enable in Advanced ▾ to use"'}>✏️ Edit</button>
        </td>`;
      tbody.appendChild(tr);
    }
    const got = rows.length;
    $('#filesSummary').textContent = `Received ${got}${files.expected?` / ${files.expected}`:''}`;
  }

    function normalizeDevName(s){ return (s||'').trim().toLowerCase(); }
    function deviceHasFileName(name){
    if (!name) return null;
    const needle = normalizeDevName(name);
    for (const it of files.items.values()){
        if (normalizeDevName(it.name) === needle) return it;
    }
    return null;
    }
    function warnIfNameConflicts(name, inputSelector){
    const conflict = deviceHasFileName(name);
    const el = document.querySelector(inputSelector);
    if (el) el.classList.toggle('warn-border', !!conflict);
    if (conflict){
        log(`Warning: A file named "${conflict.name}" already exists on the device. Uploading will most likely overwrite it.`, 'warn');
        return true;
    }
    return false;
    }


  const escapeHtml = s => s.replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  async function startFetchFiles(triggerChain=false) {
    if (!isConnected()) { log('Not connected — cannot refresh files.', 'warn'); return; }
    resetFiles();
    files.activeFetch = true;

    await send(buildCmd('D0', '', PAD_QUERY));

    files.timer = setTimeout(()=>{
      if (!files.expected && files.items.size===0) {
        files.activeFetch = false;
        log('No file info received (timeout).', 'warn');
      }
    }, 6000);

    files.afterCompleteSent = !triggerChain ? true : false;
  }

  function finalizeFilesIfDone() {
    if (!files.activeFetch || !files.expected) return;
    if (files.items.size >= files.expected) {
      files.activeFetch = false;
      clearTimeout(files.timer);
      log('File list complete ✔', 'warn');
      if (!files.afterCompleteSent) {
        files.afterCompleteSent = true;
        send(buildCmd('D1', '', PAD_QUERY));                 // query order
        setTimeout(()=> send(buildCmd('E1','', PAD_QUERY)), 100);
        setTimeout(()=> send(buildCmd('E5','', PAD_QUERY)), 200);
        setTimeout(()=> send(buildCmd('D2','', PAD_QUERY)), 300);
      }
    }
  }

  function parseNotify(hex, bytes) {
    const starts = (s) => hex.startsWith(s);
    const getAscii = (hs) => {
      const clean = hs.replace(/[^0-9A-F]/gi,'');
      const u8 = hexToBytes(clean);
      let out = '';
      for (const b of u8) if (b>=32 && b<=126) out += String.fromCharCode(b);
      return out.trim();
    };

    if (starts('FEDC')) {
      if (advFEDC.checked) log('Keepalive (FEDC)', 'warn');
      return;
    }

    if (starts('BBE5')) {
      const vol = parseInt(hex.slice(4,6),16);
      status.volume = vol; updateStatusUI();
      log(`Parsed Volume: ${vol}`);
    } else if (starts('BBE6')) {
      const len = parseInt(hex.slice(4,6),16);
      const nameHex = hex.slice(6, 6+len*2);
      const btName = getAscii(nameHex);
      status.btName = btName; updateStatusUI();
      log(`Parsed Classic BT Name: ${btName}`);
    } else if (starts('BBE1')) {
      const action = parseInt(hex.slice(4,6),16);
      const lightData = hex.slice(6,90);
      const lights=[];
      for(let i=0;i<6;i++){
        const ch = lightData.slice(i*14,(i+1)*14);
        if (ch.length<14) continue;
        const light = {
          chEffect: parseInt(ch.slice(0,2),16),
          effectGroup: parseInt(ch.slice(2,4),16),
          r: parseInt(ch.slice(4,6),16),
          g: parseInt(ch.slice(6,8),16),
          b: parseInt(ch.slice(8,10),16),
          brightness: parseInt(ch.slice(10,12),16),
          channel: parseInt(ch.slice(12,14),16),
        };
        lights.push(light);
      }
      const eyeIcon = parseInt(hex.slice(90,92),16);
      status.live.action = action;
      status.live.eye = eyeIcon;
      updateStatusUI();
      log(`Parsed Live: action=${action} eyeIcon=${eyeIcon} lights=${JSON.stringify(lights)}`);
    } else if (starts('BBE0')) {
      const channels = [4,6,8,10,12,14].map(i=>parseInt(hex.slice(i,i+2),16));
      const pin = getAscii(hex.slice(16,24));
      const wpass = getAscii(hex.slice(24,40));
      const showMode = parseInt(hex.slice(40,42),16);
      const nameLen = parseInt(hex.slice(56,58),16);
      const name = getAscii(hex.slice(58, 58+nameLen*2));
      status.channels = channels;
      status.showMode = showMode;
      status.deviceName = name || status.deviceName;
      updateStatusUI();
      log(`Parsed Params: channels=${channels} pin=${pin} wifi=${wpass} showMode=${showMode} name=${name}`);
    } else if (starts('BBCC')) {
      const mac = hex.slice(4,16); log(`Parsed Wi-Fi MAC: ${mac}`);
    } else if (starts('BBC0')) {
      const failed = parseInt(hex.slice(4,6),16);
      const written = parseInt(hex.slice(6,14),16);
      log(`Start Xfer: failed=${failed} written=${written}`);
    } else if (starts('BBC1')) {
      const dropped = parseInt(hex.slice(4,6),16);
      const index = parseInt(hex.slice(6,10),16);
      log(`Chunk Dropped: ${dropped} @${index}`);
      // Queue retransmit requests; handled explicitly in loops
      if (transfer.inProgress && !transfer.handlingRetransmits) {
        transfer.retransmitQueue.push(index);
      }
    } else if (starts('BBC2')) {
      const failed = parseInt(hex.slice(4,6),16); log(`End Xfer: failed=${failed}`);
      // If failure arrives mid-stream, mark so C1 loop can break into retransmit/C2 phase
      if (failed === 1 && transfer.inProgress && !transfer.ending) {
        transfer.midStreamEndFail = true;
      }
    } else if (starts('BBC3')) { const failed = parseInt(hex.slice(4,6),16); log(`Rename: failed=${failed}`);
    } else if (starts('BBC4')) { const failed = parseInt(hex.slice(4,6),16); log(`Cancel: failed=${failed}`);
    } else if (starts('BBC5')) { const written = parseInt(hex.slice(4,12),16); log(`Resume written=${written}`);
    } else if (starts('BBC6')) {
      const serial = parseInt(hex.slice(4,8),16); const playing = !!parseInt(hex.slice(8,10),16); const dur = parseInt(hex.slice(10,14),16); log(`Play/Pause serial=${serial} playing=${playing} duration=${dur}`);
    } else if (starts('BBC7')) { const ok = parseInt(hex.slice(4,6),16)===0; log(`Delete ${ok?'OK':'FAIL'}`);
    } else if (starts('BBC8')) { const ok = parseInt(hex.slice(4,6),16); log(`Format ok=${ok}`);
    } else if (starts('BBD2')) {
      const capacityKB = parseInt(hex.slice(4,12),16);
      const count = parseInt(hex.slice(12,14),16);
      const field4 = parseInt(hex.slice(14,22),16);
      status.capacity = capacityKB;
      status.filesReported = count;
      updateStatusUI();
      log(`Capacity ${capacityKB}KB filesReported=${count} extra=0x${field4.toString(16).toUpperCase()}`);
      $('#capLine').textContent = `Remaining capacity: ${capacityKB} KB, files reported: ${count}`;
    } else if (starts('BBD1')) {
      let count = parseInt(hex.slice(4,6),16); const data = hex.slice(6);
      if (data.length < count*4) count = Math.floor(data.length/4);
      const orders = Array.from({length:count},(_,i)=>parseInt(data.slice(i*4,i*4+4),16));
      log('Music Order: ' + JSON.stringify(orders));
    } else if (starts('BBD0')) {
      const serial = parseInt(hex.slice(4,8),16);
      const cluster = parseInt(hex.slice(8,16),16);
      const total   = parseInt(hex.slice(16,20),16);
      const length  = parseInt(hex.slice(20,24),16);
      const attr    = parseInt(hex.slice(24,26),16);
      const eyeIcon = parseInt(hex.slice(110,112),16);
      const dbPos   = parseInt(hex.slice(112,114),16);

      // Extract filename after 5C55 marker
      let name = '';
      const p = hex.indexOf('5C55', 114);
      if (p >= 0) {
        const nameHex = hex.slice(p + 4, hex.length - 2);
        try { name = decodeUtf16le(hexToBytes(nameHex)).trim(); } catch {}
      }

      files.expected = parseInt(hex.slice(16,20),16) || files.expected;
      files.items.set(serial, { serial, cluster, total, length, attr, eye: eyeIcon, db: dbPos, name });
      updateFilesTable();
      finalizeFilesIfDone();
    } else {
      // unhandled
    }
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Simple ACK wait helper that reuses the existing waiter system
  function waitForAck(prefix, timeoutMs = 3000) {
    return waitFor(prefix, timeoutMs).catch(() => null);
  }

  // Global-ish transfer state
  const transfer = {
    inProgress: false,
    cancel: false,
    resumeFrom: null, // set by device (e.g., after C2 fail) to resume index
    chunks: new Map(),
  handlingRetransmits: false, // Set to true when we're manually handling BBC1 retransmits
  retransmitQueue: [],       // queued BBC1 requests when not in explicit loop
  midStreamEndFail: false,   // BBC2(failed) seen during C1 loop
  ending: false              // true once we start C2/ack phase
  };

  // (kept if needed later for other ACK types)
  function handleDeviceAck(hex) {
    if (!hex) return;
    const head = hex.slice(0,4).toUpperCase();
    if (head === 'BBC1') {
      const isFailed  = parseInt(hex.slice(4,6), 16);
      if (isFailed === 1) {
        const lastIndex = parseInt(hex.slice(6,10), 16);
        transfer.resumeFrom = lastIndex; // device wants this index next
      }
    }
  }

 // Image index (1..18) → device eye number
    const EYE_IMG_TO_NUM = {
    1:1,  2:10, 3:2,  4:11, 5:3,  6:12,
    7:4,  8:13, 9:5, 10:14,11:6, 12:15,
    13:7, 14:16,15:8, 16:17,17:9, 18:18
    };
    // Reverse: device eye number → image index (for showing correct icon)
    const EYE_NUM_TO_IMG = Object.fromEntries(
    Object.entries(EYE_IMG_TO_NUM).map(([img, num]) => [num, Number(img)])
    );

  // --- helper: exact-hex (NO MTU padding) ---
  function chunkToHex(u8, off, per) {
    const end = Math.min(off + per, u8.length);
    const chunk = u8.subarray(off, end);
    return Array.from(chunk, b => b.toString(16).toUpperCase().padStart(2,'0')).join('');
  }

  async function sendFileToDevice(u8, name) {
  log('sendFileToDevice called - v24: macOS adaptive pacing (150ms → 80ms when clean)', 'warn');
    if (!isConnected()) { log('Not connected — cannot send file.', 'warn'); return; }

    transfer.inProgress = true;
    transfer.cancel = false;
    transfer.chunks.clear();
    $('#btnSendFile').disabled = true;
    $('#btnCancelFile').disabled = true;
    setProgress(0, 0);

    try {
      // === Prep ===
  const size = u8.length;
  // On macOS use smaller payloads to improve stability; elsewhere keep 500
  // Keep macOS payload small so full C1 frame (AA C1 + idx2 + data + crc) <= ATT_MTU-3 (~182)
  const per = IS_MACOS ? 160 : 500;
  const maxPack = Math.ceil(size / per);
  const nameHex = utf16leHex(name);
  // Initialize adaptive pacing early so we can use it for pre-C0 and chunk0 timing
  let paceMs = CHUNK_DELAY_MS;

  // Start timestamp for throughput stats
  const tStart = performance.now();
  // C0 (start)
  if (IS_MACOS) await sleep(Math.max(50, Math.floor((paceMs || CHUNK_DELAY_MS) / 2))); // dynamic debounce
      await send(buildCmd('C0', intToHex(size,4) + intToHex(maxPack,2) + '5C55' + nameHex, PAD_DEFAULT));

      // Wait for BBC0 before sending chunks
      let c0 = await waitForAck('BBC0', 5000);
      if (!c0) throw new Error('Timeout waiting for BBC0');
      const c0Failed  = parseInt(c0.slice(4,6),16);
      const c0Written = parseInt(c0.slice(6,14),16) || 0;
      if (c0Failed !== 0) throw new Error('Device rejected start (BBC0 failed)');
      // resume if device reports prior bytes written
      let startIdx = Math.floor(c0Written / per);
      if (startIdx > 0) log(`Resuming at chunk index ${startIdx} (written=${c0Written})`, 'warn');

  // Always send chunk 0; smaller per-chunk size + write-with-response should prevent macOS drop

      $('#btnCancelFile').disabled = false;

  // Proactively send chunk 0 with response on macOS before the loop
      if (IS_MACOS && startIdx === 0 && maxPack > 0) {
        const off0 = 0;
        const dataHex0 = chunkToHex(u8, off0, per);
        const payload0 = intToHex(0, 2) + dataHex0;
        transfer.chunks.set(0, payload0);
        log('macOS: Proactively sending chunk 0 with response...', 'warn');
  await send(buildCmd('C1', payload0, 0), { forceWithResponse: true });
  // Small delay aligned with current adaptive pacing
  await sleep(IS_MACOS ? paceMs : CHUNK_DELAY_MS);
        setProgress(1, maxPack);
        startIdx = 1;
      }

      // === Data loop (NO MTU padding) ===
      transfer.midStreamEndFail = false;
      transfer.retransmitQueue.length = 0;
      transfer.ending = false;
  // Adaptive pacing on macOS: start at CHUNK_DELAY_MS and ratchet down if clean
  paceMs = CHUNK_DELAY_MS; // reassert start value (already declared above)
      let goodSinceBbc1 = 0;
      const PACE_FLOOR_MS = 80;
      const PACE_DECR_STEP = 10;
      const PACE_DECR_EVERY = 20; // chunks
      const PACE_INCR_STEP = 20;
      const PACE_MAX_MS = 250;
      for (let idx = startIdx; idx < maxPack; idx++) {
        if (!isConnected()) throw new Error('Disconnected during transfer');
        if (transfer.cancel) throw new Error('Transfer cancelled');

        if (transfer.resumeFrom !== null) { idx = transfer.resumeFrom; transfer.resumeFrom = null; }

        // If device already indicated end fail or queued retransmits, pause C1 loop
        if (transfer.midStreamEndFail || transfer.retransmitQueue.length) {
          // Back off pacing slightly on retransmit
          if (transfer.retransmitQueue.length && IS_MACOS) {
            paceMs = Math.min(paceMs + PACE_INCR_STEP, PACE_MAX_MS);
            log(`Breaking C1 loop early at idx=${idx} (BBC1 queued). Increasing pace to ${paceMs}ms`, 'warn');
          } else {
            log(`Breaking C1 loop early at idx=${idx} due to ${transfer.midStreamEndFail ? 'BBC2 fail' : 'queued BBC1'}`, 'warn');
          }
          break;
        }

        const off = idx * per;
        const dataHex = chunkToHex(u8, off, per);   // exact bytes only
        const payload = intToHex(idx, 2) + dataHex;

  transfer.chunks.set(idx, payload);
  // On macOS, chunk 0 retransmits are sensitive; normal loop already sent chunk 0 earlier with-response
  await send(buildCmd('C1', payload, 0));
        setProgress(idx + 1, maxPack);
  await sleep(IS_MACOS ? paceMs : CHUNK_DELAY_MS);
        if (IS_MACOS) {
          goodSinceBbc1++;
          if (goodSinceBbc1 % PACE_DECR_EVERY === 0 && paceMs > PACE_FLOOR_MS) {
            const prev = paceMs; paceMs = Math.max(paceMs - PACE_DECR_STEP, PACE_FLOOR_MS);
            if (paceMs !== prev) log(`Adaptive pacing: ${prev}ms → ${paceMs}ms (clean streak)`, 'warn');
          }
        }

        // Log when approaching the last chunk
        if (idx === maxPack - 1) {
          log(`C1 loop: Sent last chunk ${idx + 1}/${maxPack}. Loop will exit next.`, 'warn');
        }
      }

      log(`C1 loop: EXITED for loop. maxPack=${maxPack}, startIdx=${startIdx}`, 'warn');
      log(`C1 loop complete. Sent ${maxPack} chunks.`, 'warn');

      // Process any queued retransmits before C2, if present
      if (transfer.retransmitQueue.length) {
        transfer.handlingRetransmits = true;
        const seen = new Set();
        while (transfer.retransmitQueue.length) {
          const rqIdx = transfer.retransmitQueue.shift();
          if (seen.has(rqIdx)) continue; // prevent tight loops
          seen.add(rqIdx);
          const payload = transfer.chunks.get(rqIdx);
          if (!payload) { log(`Queued retransmit ${rqIdx} not in cache`, 'warn'); continue; }
          const forceWith = IS_MACOS && rqIdx === 0;
          log(`Queued retransmit: sending chunk ${rqIdx}${forceWith?' (with-response)':''}`, 'warn');
          await send(buildCmd('C1', payload, 0), forceWith ? { forceWithResponse: true } : undefined);
          // After a retransmit on macOS, back off pacing once, then reset streak
          if (IS_MACOS) {
            const prev = paceMs; paceMs = Math.min(paceMs + PACE_INCR_STEP, PACE_MAX_MS);
            if (paceMs !== prev) log(`Adaptive pacing: ${prev}ms → ${paceMs}ms (after retransmit)`, 'warn');
            goodSinceBbc1 = 0;
            await sleep(paceMs);
          } else {
            await sleep(CHUNK_DELAY_MS);
          }
        }
        transfer.handlingRetransmits = false;
      }

      // Short macOS settle to let device raise BBC1s before C2
      if (IS_MACOS && !transfer.midStreamEndFail) {
        const EXTRA_WAIT_MS = Math.max(500, (paceMs || CHUNK_DELAY_MS) * 3);
        log(`macOS: waiting ${EXTRA_WAIT_MS}ms before C2...`, 'warn');
        await sleep(EXTRA_WAIT_MS);
      }

      // === C2 (end)  must be 8 zero bytes ===
      log('Sending C2 (end transfer)...', 'warn');
      transfer.ending = true;
      await send(buildCmd('C2', '', 8)); // -> AAC200000000000000004F

      // Wait for BBC2 OK (isFailed==0)
      // Device may respond with BBC1 (chunk retransmit requests) first, then BBC2
      log('Waiting for BBC2 response (device may request chunk retransmits first)...', 'warn');
      let c2 = null;
      let retryAttempts = 0;
      const maxRetries = 100; // Allow up to 100 chunk retransmits

      // Use longer timeouts on macOS which is slower to process retransmits
  const ACK_WAIT_MS = IS_MACOS ? 8000 : 5000;

      transfer.handlingRetransmits = true; // Disable automatic BBC1 handling while we explicitly handle retransmits

      while (!c2 && retryAttempts < maxRetries) {
        // Wait for either BBC1 (retransmit) or BBC2 (done)
        const response = await Promise.race([
          waitForAck('BBC1', ACK_WAIT_MS).catch(() => null),
          waitForAck('BBC2', ACK_WAIT_MS).catch(() => null)
        ]);

        if (!response) {
          retryAttempts++;
          log(`No response, retry ${retryAttempts}/${maxRetries}`, 'warn');
          continue;
        }

        if (response.startsWith('BBC2')) {
          c2 = response;
          log('BBC2 received', 'warn');
          break;
        }

        if (response.startsWith('BBC1')) {
          // Device wants a chunk retransmitted
          let isFailed = parseInt(response.slice(4,6), 16);
          let chunkIndex = parseInt(response.slice(6,10), 16);
          if (isFailed === 1) {
            log(`Device requests retransmit of chunk ${chunkIndex}`, 'warn');
            // Try multiple attempts for this chunk and wait for device to respond after each send
            const maxChunkRetrans = 6;
            const perAttemptWait = Math.max(1500, CHUNK_DELAY_MS * 4);
      for (let attempt = 1; attempt <= maxChunkRetrans; attempt++) {
              const payload = transfer.chunks.get(chunkIndex);
              if (!payload) { log(`Chunk ${chunkIndex} not found in cache, cannot retransmit`, 'warn'); break; }
              log(`Retransmit attempt ${attempt}/${maxChunkRetrans} for chunk ${chunkIndex}`, 'warn');
              // For macOS and chunk 0, force with-response to increase reliability
              const forceWith = IS_MACOS && chunkIndex === 0;
              await send(buildCmd('C1', payload, 0), forceWith ? { forceWithResponse: true } : undefined);
              // After sending, wait briefly for a BBC2 (completion) or BBC1 (further requests)
              const resp = await Promise.race([
                waitForAck('BBC2', perAttemptWait).catch(() => null),
                waitForAck('BBC1', perAttemptWait).catch(() => null)
              ]);
              if (!resp) {
        // no response yet — keep/adapt pacing
        await sleep(IS_MACOS ? paceMs : CHUNK_DELAY_MS);
                continue;
              }
              if (resp.startsWith('BBC2')) {
                c2 = resp; log('BBC2 received (during retransmit attempts)', 'warn'); break;
              }
              // resp is BBC1 — parse and if it's asking for the same chunk, continue attempts; if different, update chunkIndex to handle it
              const nextFailed = parseInt(resp.slice(4,6), 16);
              const nextIdx = parseInt(resp.slice(6,10), 16);
              if (nextFailed === 1 && nextIdx !== chunkIndex) {
                log(`Device now requests retransmit of different chunk ${nextIdx} (was ${chunkIndex}), switching`, 'warn');
                chunkIndex = nextIdx; // switch to the newly requested chunk and restart attempts
                // reset attempt counter to give the new chunk its full attempts
                attempt = 0;
                continue;
              }
              // otherwise, loop will retry the same chunk
            }
          }
          retryAttempts++;
        }
      }

      transfer.handlingRetransmits = false; // Re-enable automatic BBC1 handling

      if (!c2) throw new Error('Timeout waiting for BBC2 after retransmits');

      const c2Failed = parseInt(c2.slice(4,6), 16);
      if (c2Failed !== 0) {
        // If macOS reported failure, give the device one more retransmit pass (many macs/parcels
        // request BBC1s slightly after we receive BBC2) then resend C2 once.
    if (IS_MACOS) {
          log('BBC2 reported failure on macOS — running one extra retransmit pass then retrying C2...', 'warn');
          transfer.handlingRetransmits = true;
          // Listen for BBC1 requests for a short window and respond
          const extraWindow = 4000; // ms
          const endAt = Date.now() + extraWindow;
          while (Date.now() < endAt) {
            const resp = await waitForAck('BBC1', Math.min(1000, endAt - Date.now())).catch(() => null);
            if (!resp) continue;
            const isFailed = parseInt(resp.slice(4,6), 16);
            if (isFailed === 1) {
              const chunkIndex = parseInt(resp.slice(6,10), 16);
              const payload = transfer.chunks.get(chunkIndex);
              if (payload) {
                log(`Extra-pass resend of chunk ${chunkIndex}`, 'warn');
                await send(buildCmd('C1', payload, 0));
                await sleep(IS_MACOS ? paceMs : CHUNK_DELAY_MS);
              }
            }
          }
          transfer.handlingRetransmits = false;

          // Resend C2 and wait one more time (longer)
          log('Resending C2 (macOS extra retry)...', 'warn');
          await send(buildCmd('C2', '', 8));
          const finalC2 = await waitForAck('BBC2', 10000).catch(() => null);
          if (!finalC2) throw new Error('Timeout waiting for BBC2 after macOS extra retry');
          const finalFailed = parseInt(finalC2.slice(4,6), 16);
          if (finalFailed !== 0) throw new Error('Device reported transfer failed even after macOS extra retry');
        } else {
          throw new Error('Device reported transfer failed even after retransmits.');
        }
      }

  // === C3 (rename/commit) ===
  // Shorter settle before C3
  await sleep(200);
      await send(buildCmd('C3', '5C55' + nameHex, PAD_DEFAULT));
      const c3 = await waitForAck('BBC3', 15000);  // Long timeout for flash write (especially on macOS)
      if (!c3) throw new Error('Timeout waiting for BBC3');
      const c3Failed = parseInt(c3.slice(4,6), 16);
      if (c3Failed !== 0) throw new Error('Device failed final rename');

  const tEnd = performance.now();
  const secs = (tEnd - tStart) / 1000;
  const kb = (size / 1024).toFixed(1);
  const rate = secs ? (size / secs / 1024).toFixed(1) : '∞';
  log(`File transfer complete ✔  (${kb} KB in ${secs.toFixed(2)}s, ~${rate} KB/s)`, 'warn');
      startFetchFiles(); // refresh
    } catch (e) {
      log('File send error: ' + e.message, 'warn');
      console.error('Full error details:', e);
    } finally {
      transfer.inProgress = false;
      $('#btnSendFile').disabled = false;
      $('#btnCancelFile').disabled = true;
    }
  }

  // --- Wire up controls ---
  $('#btnConnect').addEventListener('click', connect);
  $('#btnDisconnect').addEventListener('click', disconnect);

  // quick queries
  document.querySelectorAll('[data-q]').forEach(btn => btn.addEventListener('click', async () => {
    if (!isConnected()) return log('Not connected', 'warn');
    const tag = btn.getAttribute('data-q');
    await send(buildCmd(tag, '', PAD_QUERY));
  }));

  // media
  $('#btnPlay').addEventListener('click', () => { if (!isConnected()) return log('Not connected','warn'); send(buildCmd('FC','01', PAD_MEDIA)); });
  $('#btnPause').addEventListener('click', () => { if (!isConnected()) return log('Not connected','warn'); send(buildCmd('FC','00', PAD_MEDIA)); });
  $('#btnBT').addEventListener('click', () => { if (!isConnected()) return log('Not connected','warn'); send(buildCmd('FD','01', PAD_MEDIA)); });

  // volume UI (0–100%) -> wire value (0–255)
  const clamp = (n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
  const volRange = $('#volRange');
  const volNum = $('#vol');

  if (volRange && volNum) {
    volRange.addEventListener('input', e => volNum.value = e.target.value);
    volNum.addEventListener('input', e => volRange.value = clamp(e.target.value,0,100));
  }
  $('#btnSetVol').addEventListener('click', () => {
    if (!isConnected()) return log('Not connected','warn');
     const v = Math.max(0, Math.min(255, parseInt($('#vol').value || '0', 10)));
    send(buildCmd('FA', intToHex(v, 1), PAD_MEDIA));
  });

  // brightness (selected target) with slider sync
  const briRange = $('#brightnessRange');
  const briNum = $('#brightness');
  if (briRange && briNum) {
    briRange.addEventListener('input', e => briNum.value = e.target.value);
    briNum.addEventListener('input', e => briRange.value = clamp(e.target.value,0,255));
  }
  $('#btnSetBrightness').addEventListener('click', () => {
    if (!isConnected()) return log('Not connected','warn');
    const ch = currentChannelHex(); // 'FF' or '01'..'0N'
    const brightness = intToHex(clamp($('#brightness').value, 0, 255), 1);
    const cluster = intToHex(0, 4);
    const nameLen = '00';
    const payload = ch + brightness + cluster + nameLen; // 7 bytes → padded to 8
    send(buildCmd('F3', payload, PAD_MEDIA));
  });

  // color picker sync
  const colorPick = $('#colorPick');
  ['r','g','b'].forEach(id => {
    $('#'+id).addEventListener('input', () => {
      const r = clamp($('#r').value,0,255);
      const g = clamp($('#g').value,0,255);
      const b = clamp($('#b').value,0,255);
      const hex = `#${intToHex(r,1)}${intToHex(g,1)}${intToHex(b,1)}`.toLowerCase();
      if (colorPick.value !== hex) colorPick.value = hex;
    });
  });
  if (colorPick) colorPick.addEventListener('input', () => {
    const v = colorPick.value.replace('#','');
    if (v.length === 6) {
      $('#r').value = parseInt(v.slice(0,2),16);
      $('#g').value = parseInt(v.slice(2,4),16);
      $('#b').value = parseInt(v.slice(4,6),16);
    }
  });

  // quick color swatches
  document.querySelectorAll('.color-swatch').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const [rr,gg,bb] = btn.dataset.rgb.split(',').map(s=>clamp(s,0,255));
      $('#r').value = rr; $('#g').value = gg; $('#b').value = bb;
      const hex = `#${intToHex(rr,1)}${intToHex(gg,1)}${intToHex(bb,1)}`.toLowerCase();
      if (colorPick) colorPick.value = hex;
    });
  });

  // rgb (selected target)
  $('#btnSetRGB').addEventListener('click', () => {
    if (!isConnected()) return log('Not connected','warn');
    const ch = currentChannelHex(); // 'FF' or '01'..'0N'
    const r = intToHex(clamp($('#r').value,0,255), 1);
    const g = intToHex(clamp($('#g').value,0,255), 1);
    const b = intToHex(clamp($('#b').value,0,255), 1);
    const loop = intToHex(0, 1);
    const cluster = intToHex(0, 4);
    const nameLen = '00';
    const payload = ch + r + g + b + loop + cluster + nameLen; // 10 bytes
    send(buildCmd('F4', payload, PAD_MEDIA));
  });

  // filter typing
  $('#filesFilter')?.addEventListener('input', updateFilesTable);

  // Appearance eye grid
  let apEye = 1; // device eye number
function buildAppearanceEyeGrid() {
  const grid = document.querySelector('#apEyeGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let imgIdx = 1; imgIdx <= 18; imgIdx++) {
    const eyeNum = EYE_IMG_TO_NUM[imgIdx] || imgIdx; // device value for this tile
    const div = document.createElement('div');
    div.className = 'eye-opt' + (eyeNum === apEye ? ' selected' : '');
    div.dataset.eye = String(eyeNum);   // store the device eye number
    div.innerHTML = eyeImgHTML(eyeNum); // renders correct icon
    div.title = `Eye ${eyeNum}`;
    grid.appendChild(div);
  }
}
buildAppearanceEyeGrid();

document.querySelector('#apEyeGrid')?.addEventListener('click', (e) => {
  const cell = e.target.closest('.eye-opt');
  if (!cell) return;
  apEye = parseInt(cell.dataset.eye, 10);         // device eye number
  document.querySelectorAll('#apEyeGrid .eye-opt').forEach(el => el.classList.remove('selected'));
  cell.classList.add('selected');
});

  document.querySelector('#apSetEye')?.addEventListener('click', () => {
    if (!isConnected()) return log('Not connected','warn');
    const cluster = Math.max(0, parseInt(document.querySelector('#apCluster').value || '0', 10)) >>> 0;
    const name = (document.querySelector('#apName').value || '').trim();
    let payload = intToHex(apEye,1) + '00' + intToHex(cluster,4);
    if (name) {
      const nameHex = utf16leHex(name);
      const nameLen = intToHex((nameHex.length/2) + 2, 1);
      payload += nameLen + '5C55' + nameHex;
    } else {
      payload += '00';
    }
    send(buildCmd('F9', payload, PAD_DEFAULT));
    log(`Set Eye (F9) icon=${apEye} cluster=${cluster}${name?` name="${name}"`:''}`);
  });


// ---------- Movement toggles (shared) ----------
function initMoveGroup(rootId) {
  const root = document.getElementById(rootId);
  if (!root) return;
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('.iconToggle');
    if (!btn || !root.contains(btn)) return;

    const part = btn.dataset.part; // 'all' | 'head' | 'arm' | 'torso'
    const allBtn   = root.querySelector('[data-part="all"]');
    const headBtn  = root.querySelector('[data-part="head"]');
    const armBtn   = root.querySelector('[data-part="arm"]');
    const torsoBtn = root.querySelector('[data-part="torso"]');

    if (part === 'all') {
      // Selecting ALL turns the others off
      allBtn.classList.toggle('selected');
      if (allBtn.classList.contains('selected')) {
        headBtn.classList.remove('selected');
        armBtn.classList.remove('selected');
        torsoBtn.classList.remove('selected');
      }
    } else {
      // Toggling any individual deselects ALL
      btn.classList.toggle('selected');
      allBtn.classList.remove('selected');
    }
  });
}

    initMoveGroup('liveMove');
    initMoveGroup('edMove');

    // Action codes per your Android "CA" command (setMusicPlayAnimation)
    // Head: 1 on, 2 off | Arm: 3 on, 4 off
    // Torso codes were inconsistent in logs (6 vs 7). Use 6/7 but swap by context.
    const MOV_MAP = {
    live: { HEAD: {on:1, off:2}, ARM:{on:3, off:4}, TORSO:{on:6, off:7}, ALL_ON:255 },
    file: { HEAD: {on:1, off:2}, ARM:{on:3, off:4}, TORSO:{on:7, off:6}, ALL_ON:255 } // note torso swapped
    };

    // Build CA payload: action(1B) + 00 + cluster(4B) + nameLen+5C55+UTF16LE(name) | 00
    function buildCAPayload(actionNumber, clusterNumber, name) {
    const action = intToHex(actionNumber, 1);
    const zero   = '00';
    const cluster= intToHex(clusterNumber, 4);
    if (name && name.trim()) {
        const nameHex = utf16leHex(name.trim());
        const len = intToHex((nameHex.length / 2) + 2, 1);
        return action + zero + cluster + len + '5C55' + nameHex;
    }
    return action + zero + cluster + '00';
    }

    function applyMovementFromUI(containerId, { context }) {
    if (!isConnected()) return log('Not connected', 'warn');

    const root = document.getElementById(containerId);
    const sel = (part) => root.querySelector(`[data-part="${part}"]`)?.classList.contains('selected');

    const ALL   = sel('all');
    const HEAD  = sel('head');
    const ARM   = sel('arm');
    const TORSO = sel('torso');

    const map = context === 'live' ? MOV_MAP.live : MOV_MAP.file;

    // Determine addressing
    let cluster = 0, name = '';
    if (context === 'file') {
        cluster = Math.max(0, parseInt($('#edCluster').value || '0', 10));
        name    = ($('#edName').value || '').trim();
    }

    // If ALL is selected -> single CA with FF
    if (ALL) {
        const payload = buildCAPayload(map.ALL_ON, cluster, context === 'file' ? name : '');
        send(buildCmd('CA', payload, PAD_MEDIA));
        log(`Movement: ALL ON (CA) ${context==='file' ? `(file "${name}" cluster=${cluster})` : '(live)'}`);
        return;
    }

    // Otherwise: send each part ON/OFF to match the toggles
    const ops = [
        { label:'HEAD',  on:HEAD,  codes:map.HEAD  },
        { label:'ARM',   on:ARM,   codes:map.ARM   },
        { label:'TORSO', on:TORSO, codes:map.TORSO },
    ];

    ops.forEach(o => {
        const code = o.on ? o.codes.on : o.codes.off;
        const payload = buildCAPayload(code, cluster, context === 'file' ? name : '');
        send(buildCmd('CA', payload, PAD_MEDIA));
        log(`Movement: ${o.label} ${o.on ? 'ON' : 'OFF'} (CA) ${context==='file' ? `(file "${name}" cluster=${cluster})` : '(live)'}`);
    });
    }

    // Buttons to apply the current toggles
    $('#applyLiveMove')?.addEventListener('click', () => applyMovementFromUI('liveMove', { context:'live' }));
    $('#applyEdMove')?.addEventListener('click',   () => applyMovementFromUI('edMove',  { context:'file' }));


    // === Cycle All Colors (Live + Per-file) ===
    // Sequence matches your logs: F3 (brightness) -> F2 (mode=1 Static) -> F4 (loop=1)
    function sendColorCycle({ context }) {
    if (!isConnected()) return log('Not connected', 'warn');

    // Use current picker values as the seed RGB (like the logs did)
    const r = clamp($('#r').value, 0, 255);
    const g = clamp($('#g').value, 0, 255);
    const b = clamp($('#b').value, 0, 255);

    // Common pieces
    const chFF   = 'FF';
    const rHex   = intToHex(r,1);
    const gHex   = intToHex(g,1);
    const bHex   = intToHex(b,1);
    const loopOn = '01';

    if (context === 'live') {
        // LIVE: no name/cluster; respect current brightness input
        const brightness = intToHex(clamp($('#brightness').value, 0, 255), 1);
        const cluster    = intToHex(0, 4);
        const nameLen    = '00';

        // F3: brightness on All channels
        send(buildCmd('F3', chFF + brightness + cluster + nameLen, PAD_MEDIA));
        // F2: mode=1 (Static) on All channels
        send(buildCmd('F2', chFF + '01' + cluster + nameLen, PAD_MEDIA));
        // F4: RGB with loop=1 on All channels
        const f4 = chFF + rHex + gHex + bHex + loopOn + cluster + nameLen;
        send(buildCmd('F4', f4, PAD_MEDIA));

        log(`Cycle Colors (LIVE): ch=FF rgb=${r},${g},${b} (F3→F2→F4 loop=1)`);
    } else {
        // FILE: include cluster + filename
        const clusterNum = Math.max(0, parseInt($('#edCluster').value || '0', 10)) >>> 0;
        const cluster    = intToHex(clusterNum, 4);
        const name       = ($('#edName').value || '').trim();
        const nameHex    = name ? utf16leHex(name) : '';
        const nameLen    = name ? intToHex((nameHex.length/2) + 2, 1) : '00';
        const nameBlock  = name ? (nameLen + '5C55' + nameHex) : nameLen;

        // Per-file logs show brightness = 255 for this flow; match that.
        send(buildCmd('F3', chFF + 'FF' + cluster + nameBlock, PAD_MEDIA));
        send(buildCmd('F2', chFF + '01' + cluster + nameBlock, PAD_MEDIA));
        const f4 = chFF + rHex + gHex + bHex + loopOn + cluster + nameBlock;
        send(buildCmd('F4', f4, PAD_MEDIA));

        log(`Cycle Colors (FILE): "${name || '(no name)'}" ch=FF rgb=${r},${g},${b} (F3→F2→F4 loop=1 cluster=${clusterNum})`);
    }
    }

    // Wire the new buttons
    document.getElementById('btnColorCycleLive')?.addEventListener('click', () => sendColorCycle({ context: 'live' }));
    document.getElementById('edColorCycle')?.addEventListener('click', () => sendColorCycle({ context: 'file' }));


    // --- Lighting Type (F2) + Speed (F6) ---

    // Show/hide speed when the mode changes
    const modeSel = $('#lightMode');
    const speedBlock = $('#speedBlock');
    modeSel?.addEventListener('change', () => {
    const v = parseInt(modeSel.value, 10);
    speedBlock.classList.toggle('hidden', v === 1); // hide for Static
    });

    // Apply lighting mode (F2)
    $('#btnSetMode')?.addEventListener('click', () => {
    if (!isConnected()) return log('Not connected','warn');
    const ch = currentChannelHex(); // 'FF' or '01'..'0N'
    const mode = intToHex(parseInt($('#lightMode').value,10), 1);
    const cluster = intToHex(Math.max(0, parseInt($('#apCluster').value || '0',10)), 4);
    const name = ($('#apName').value || '').trim();

    let payload = ch + mode + cluster;
    if (name) {
        const nameHex = utf16leHex(name);
        const nameLen = intToHex((nameHex.length/2) + 2, 1);
        payload += nameLen + '5C55' + nameHex;
    } else {
        payload += '00';
    }
    send(buildCmd('F2', payload, PAD_MEDIA));
    log(`Set Mode (F2) channel=${ch} mode=${parseInt($('#lightMode').value,10)} cluster=${parseInt($('#apCluster').value||'0',10)}${name?` name="${name}"`:''}`);
    });

    // Speed sync + apply (F6)
    const speedRange = $('#speedRange');
    const speedNum = $('#speed');
    if (speedRange && speedNum) {
    speedRange.addEventListener('input', e => speedNum.value = e.target.value);
    speedNum.addEventListener('input', e => speedRange.value = clamp(e.target.value, 0, 255));
    }

    $('#btnSetSpeed')?.addEventListener('click', () => {
    if (!isConnected()) return log('Not connected','warn');
    const ch = currentChannelHex();
    const speed = intToHex(clamp($('#speed').value, 0, 255), 1);
    const cluster = intToHex(Math.max(0, parseInt($('#apCluster').value || '0',10)), 4);
    const name = ($('#apName').value || '').trim();

    let payload = ch + speed + cluster;
    if (name) {
        const nameHex = utf16leHex(name);
        const nameLen = intToHex((nameHex.length/2) + 2, 1);
        payload += nameLen + '5C55' + nameHex;
    } else {
        payload += '00';
    }
    send(buildCmd('F6', payload, PAD_MEDIA));
    log(`Set Speed (F6) channel=${ch} speed=${parseInt($('#speed').value||'0',10)} cluster=${parseInt($('#apCluster').value||'0',10)}${name?` name="${name}"`:''}`);
    });


  // raw (advanced)
  $('#btnSendRaw').addEventListener('click', () => {
    if (!isConnected()) return log('Not connected','warn');
    const tag = $('#tag').value.trim().toUpperCase();
    const payload = ($('#payload').value || '').replace(/\s+/g, '').toUpperCase();
    try { send(buildCmd(tag, payload, PAD_DEFAULT)); } catch (e) { log('Bad payload: ' + e.message, 'warn'); }
  });

document.getElementById('fileName')?.addEventListener('input', () => {
  warnIfNameConflicts(document.getElementById('fileName').value, '#fileName');
});

  // File transfer UI (advanced)
let lastPickedFile = null;
let lastOriginalBytes = null;
let lastFileBytes = null, lastFileName = '';
$('#fileInput').addEventListener('change', async (e)=>{
  const f = e.target.files?.[0];
  lastPickedFile = f || null;
  lastOriginalBytes = null;
  lastFileBytes = null;
  lastFileName = '';

  if (!f) return;

  // Warn on >30s (non-blocking)
  try {
    const dur = await getAudioDurationFromFile(f);
    maybeWarnLongTrack(dur);
  } catch {}

  try {
    // Always capture the original bytes + name
    const buf = await f.arrayBuffer();
    lastOriginalBytes = new Uint8Array(buf);
    lastFileName = f.name;

    // If convert box is already checked, convert right away
    if ($('#chkConvert')?.checked) {
      const kbps = parseInt($('#mp3Kbps')?.value || '32', 10);
      log(`Converting to MP3 8 kHz mono (${kbps} kbps)…`);
      const { u8, name } = await convertFileToDeviceMp3(f, kbps);
      lastFileBytes = u8;
      lastFileName  = name;
      log(`Converted: ${name} (${u8.length} bytes)`, 'warn');
    } else {
      // No convert right now: keep original as the active payload
      lastFileBytes = lastOriginalBytes;
      log(`Picked file: ${f.name} (${lastFileBytes.length} bytes)`);
    }

    if (!$('#fileName').value) $('#fileName').value = lastFileName;
    setProgress(0,0);
    warnIfNameConflicts(($('#fileName').value || lastFileName), '#fileName');
  } catch (err) {
    log(`File read/convert error: ${err.message}`, 'warn');
  }
});

    
  $('#btnSendFile').addEventListener('click', async ()=>{
    if (!isConnected()) return log('Not connected','warn');

    // Must have a chosen file
    if (!lastPickedFile && !lastFileBytes) {
        log('Pick a file first.', 'warn'); 
        return;
    }

    // If user toggled "Convert" AFTER selecting the file, convert now
    try {
        if ($('#chkConvert')?.checked && lastPickedFile) {
        const kbps = parseInt($('#mp3Kbps')?.value || '32', 10);
        log(`Converting to MP3 8 kHz mono (${kbps} kbps) before send…`);
        const { u8, name } = await convertFileToDeviceMp3(lastPickedFile, kbps);
        lastFileBytes = u8;
        // If the filename box is empty or still matches the previous base, prefer .mp3
        const typed = ($('#fileName').value || '').trim();
        if (!typed || typed === lastFileName) {
            $('#fileName').value = name;
        }
        lastFileName = name;
        } else if (!$('#chkConvert')?.checked && lastOriginalBytes) {
        // Ensure we’re using the original bytes if convert is off
        lastFileBytes = lastOriginalBytes;
        lastFileName = lastPickedFile?.name || lastFileName;
        }
    } catch (err) {
        log(`Convert error: ${err.message} — sending original file`, 'warn');
        if (lastOriginalBytes) { lastFileBytes = lastOriginalBytes; lastFileName = lastPickedFile?.name || lastFileName; }
    }

    // Filename to send (auto .mp3 if converting)
    let name = ($('#fileName').value || lastFileName || 'skelly.bin').trim();
    if ($('#chkConvert')?.checked && !/\.mp3$/i.test(name)) {
        name = name.replace(/\.\w+$/,'') + '.mp3';
        $('#fileName').value = name;
    }
    if (!name) { log('Provide a device filename.', 'warn'); return; }
    warnIfNameConflicts(name, '#fileName');
    // Show heads-up unless user opted out
    const proceed = await ensureSlowWarning();
    if (!proceed) return;

    await sendFileToDevice(lastFileBytes, name);
    });


  $('#btnCancelFile').addEventListener('click', async ()=>{
    if (!transfer.inProgress) return;
    transfer.cancel = true;
    if (isConnected()) { try { await send(buildCmd('C4','', PAD_DEFAULT)); } catch {} }
  });

  // Files fetch button
  $('#btnRefreshFiles').addEventListener('click', () => startFetchFiles(false));

  // Files table actions (Play / Edit)
  $('#filesTable').addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (!isConnected()) return log('Not connected','warn');
    const serial = parseInt(btn.dataset.serial, 10);
    const item = files.items.get(serial);
    if (!item) return;

    if (btn.dataset.action === 'play') {
      send(buildCmd('C6', intToHex(serial,2) + '01', PAD_DEFAULT));
    } else if (btn.dataset.action === 'edit') {
      if (btn.disabled || !(advEdit && advEdit.checked)) return; // respect toggle
      openEditModal(item);
    }
  });

  // ---------- Edit modal ----------

    // --- Edit modal: Lighting Type (per-file) ---
    const edLightMode  = $('#edLightMode');
    const edSpeedBlock = $('#edSpeedBlock');
    const edSpeedRange = $('#edSpeedRange');
    const edSpeedNum   = $('#edSpeed');

    // Toggle speed UI for Static vs Strobe/Pulsing
    edLightMode?.addEventListener('change', () => {
    const v = parseInt(edLightMode.value, 10);
    edSpeedBlock.classList.toggle('hidden', v === 1); // hide when Static
    });

    // Sync speed inputs
    if (edSpeedRange && edSpeedNum) {
    edSpeedRange.addEventListener('input', e => edSpeedNum.value = e.target.value);
    edSpeedNum.addEventListener('input',  e => edSpeedRange.value = clamp(e.target.value, 0, 255));
    }

    // Apply lighting MODE for this specific file (F2)
    $('#edApplyMode')?.addEventListener('click', () => {
    if (!isConnected()) return log('Not connected', 'warn');
    const mode    = intToHex(parseInt($('#edLightMode').value, 10), 1);
    const cluster = intToHex(Math.max(0, parseInt($('#edCluster').value || '0', 10)), 4);
    const name    = ($('#edName').value || '').trim();

    // Per-file: channel FF (all) + cluster + filename
    let payload = 'FF' + mode + cluster;
    if (name) {
        const nameHex = utf16leHex(name);
        payload += intToHex((nameHex.length/2) + 2, 1) + '5C55' + nameHex;
    } else {
        payload += '00';
    }

    send(buildCmd('F2', payload, PAD_MEDIA));
    log(`Set Mode (F2) for file "${name || '(no name)'}" mode=${parseInt($('#edLightMode').value,10)} cluster=${parseInt($('#edCluster').value||'0',10)}`);
    });

    // Apply SPEED for this specific file (F6)
    $('#edApplySpeed')?.addEventListener('click', () => {
    if (!isConnected()) return log('Not connected', 'warn');
    const speed   = intToHex(clamp($('#edSpeed').value, 0, 255), 1);
    const cluster = intToHex(Math.max(0, parseInt($('#edCluster').value || '0', 10)), 4);
    const name    = ($('#edName').value || '').trim();

    let payload = 'FF' + speed + cluster;
    if (name) {
        const nameHex = utf16leHex(name);
        payload += intToHex((nameHex.length/2) + 2, 1) + '5C55' + nameHex;
    } else {
        payload += '00';
    }

    send(buildCmd('F6', payload, PAD_MEDIA));
    log(`Set Speed (F6) for file "${name || '(no name)'}" speed=${parseInt($('#edSpeed').value||'0',10)} cluster=${parseInt($('#edCluster').value||'0',10)}`);
    });

    document.getElementById('edName')?.addEventListener('input', () => {
    warnIfNameConflicts(document.getElementById('edName').value, '#edName');
    });

  const editModal = $('#editModal');
  const eyeGrid = $('#eyeGrid');
  const ed = { serial:null, cluster:0, name:'', eye:1 };

  function openEditModal(it) {
    if (!it) return;
    ed.serial = it.serial;
    ed.cluster = it.cluster;
    ed.name = it.name || '';
    ed.eye = it.eye || 1;

    $('#edSerial').value = it.serial;
    $('#edCluster').value = it.cluster;
    $('#edAction').value = 255;
    $('#edName').value = it.name || '';
    $('#edLightMode').value = '1';
    $('#edSpeed').value = 0; $('#edSpeedRange').value = 0;
    edSpeedBlock.classList.add('hidden'); // Static by default

    ['all','head','arm','torso'].forEach(p => $('#edMove')?.querySelector(`[data-part="${p}"]`)?.classList.remove('selected'));

    const edUploadFile = $('#edUploadFile');
    const edUploadBtn  = $('#edUploadBtn');
    const edUploadProg = $('#edUploadProg');

    // Warn on long audio when a file is selected in the Edit modal
    edUploadFile.onchange = async () => {
    const f = edUploadFile.files?.[0];
    if (!f) return;
    try {
        const dur = await getAudioDurationFromFile(f);
        maybeWarnLongTrack(dur);
    } catch {}

    // If filename field is empty, prefill with picked name and check conflict
    if (!$('#edName').value) $('#edName').value = f.name;
    warnIfNameConflicts($('#edName').value || f.name, '#edName');

    };
    
edUploadBtn.onclick = async () => {
  if (!isConnected()) return log('Not connected','warn');
  const f = edUploadFile.files?.[0];
  if (!f) return log('Pick a file in the Edit modal first.', 'warn');

  transfer.inProgress = true;
  transfer.cancel = false;
  transfer.chunks.clear();
  edUploadBtn.disabled = true;
  edUploadProg.textContent = 'Starting...';

  try {
    const tStart = performance.now();
    let u8, targetName;
    if ($('#edChkConvert')?.checked) {
      const kbps = parseInt($('#edMp3Kbps')?.value || '32', 10);
      edUploadProg.textContent = `Converting to MP3 8 kHz mono (${kbps} kbps)…`;
      const out = await convertFileToDeviceMp3(f, kbps);
      u8 = out.u8; targetName = ($('#edName').value || out.name).trim() || out.name;
      if (!$('#edName').value) $('#edName').value = out.name; // prefill
      log(`Converted: ${targetName} (${u8.length} bytes)`, 'warn');
    } else {
      const buf = await f.arrayBuffer();
      u8 = new Uint8Array(buf);
      targetName = ($('#edName').value || f.name).trim() || f.name;
      log(`Picked file (no convert): ${targetName} (${u8.length} bytes)`);
      warnIfNameConflicts(targetName, '#edName');
    }

    // ---- rest of your upload logic unchanged, but use u8 + targetName ----
  const size = u8.length;
  const per = IS_MACOS ? 160 : 500;
    const maxPack = Math.ceil(size / per);
    const nameHex = utf16leHex(targetName);

  // Small pre-C0 debounce on macOS
  if (IS_MACOS) await sleep(100);
  await send(buildCmd('C0', intToHex(size,4) + intToHex(maxPack,2) + '5C55' + nameHex));
    let c0 = await waitForAck('BBC0', 5000);
    if (!c0) throw new Error('Timeout waiting for BBC0');
    const c0Failed  = parseInt(c0.slice(4,6),16);
    const c0Written = parseInt(c0.slice(6,14),16) || 0;
    if (c0Failed !== 0) throw new Error('Device rejected start (BBC0 failed)');
    let startIdx = Math.floor(c0Written / per);
    if (startIdx > 0) log(`Resuming at chunk index ${startIdx} (written=${c0Written})`, 'warn');

    // Proactively send chunk 0 with response on macOS
    if (IS_MACOS && startIdx === 0 && maxPack > 0) {
      const off0 = 0;
      const dataHex0 = chunkToHex(u8, off0, per);
      const payload0 = intToHex(0,2) + dataHex0;
      transfer.chunks.set(0, payload0);
      log('macOS: Proactively sending chunk 0 with response (edit modal)...','warn');
  await send(buildCmd('C1', payload0, 0), { forceWithResponse: true });
  // Small delay aligned with current adaptive pacing
  await sleep(CHUNK_DELAY_MS); // will be replaced by paceMs once initialized below
      startIdx = 1;
      edUploadProg.textContent = `Uploading 1 / ${maxPack}`;
    }

  transfer.midStreamEndFail = false;
    transfer.retransmitQueue.length = 0;
    transfer.ending = false;
  // Adaptive pacing on macOS for edit modal
  let paceMs = CHUNK_DELAY_MS;
  let goodSinceBbc1 = 0;
  const PACE_FLOOR_MS = 80;
  const PACE_DECR_STEP = 10;
  const PACE_DECR_EVERY = 20;
  const PACE_INCR_STEP = 20;
  const PACE_MAX_MS = 250;
    for (let idx=startIdx; idx<maxPack; idx++) {
      if (!isConnected()) throw new Error('Disconnected during upload');
      if (transfer.cancel) throw new Error('Upload cancelled');
      if (transfer.midStreamEndFail || transfer.retransmitQueue.length) {
        log(`Edit: breaking C1 loop early at idx=${idx} due to ${transfer.midStreamEndFail ? 'BBC2 fail' : 'queued BBC1'}`, 'warn');
        break;
      }
      const off = idx * per;
      const dataHex = chunkToHex(u8, off, per);
      const payload = intToHex(idx,2) + dataHex;
      transfer.chunks.set(idx, payload);
      await send(buildCmd('C1', payload, 0));
      edUploadProg.textContent = `Uploading ${idx+1} / ${maxPack}`;
  await sleep(IS_MACOS ? paceMs : CHUNK_DELAY_MS);
      if (IS_MACOS) {
        goodSinceBbc1++;
        if (goodSinceBbc1 % PACE_DECR_EVERY === 0 && paceMs > PACE_FLOOR_MS) {
          const prev = paceMs; paceMs = Math.max(paceMs - PACE_DECR_STEP, PACE_FLOOR_MS);
          if (paceMs !== prev) log(`Adaptive pacing (edit): ${prev}ms → ${paceMs}ms`, 'warn');
        }
      }
    }

    // If BBC1 arrived mid-stream, process queued retransmits before C2
    if (transfer.retransmitQueue.length) {
      transfer.handlingRetransmits = true;
      const seen = new Set();
      while (transfer.retransmitQueue.length) {
        const rqIdx = transfer.retransmitQueue.shift();
        if (seen.has(rqIdx)) continue; seen.add(rqIdx);
        const payload = transfer.chunks.get(rqIdx);
        if (!payload) { log(`Edit: queued retransmit ${rqIdx} not found`, 'warn'); continue; }
        const forceWith = IS_MACOS && rqIdx === 0;
        log(`Edit: queued retransmit send chunk ${rqIdx}${forceWith?' (with-response)':''}`, 'warn');
        await send(buildCmd('C1', payload, 0), forceWith ? { forceWithResponse: true } : undefined);
        if (IS_MACOS) {
          const prev = paceMs; paceMs = Math.min(paceMs + PACE_INCR_STEP, PACE_MAX_MS);
          if (paceMs !== prev) log(`Adaptive pacing (edit): ${prev}ms → ${paceMs}ms (after retransmit)`, 'warn');
          goodSinceBbc1 = 0;
          await sleep(paceMs);
        } else {
          await sleep(CHUNK_DELAY_MS);
        }
      }
      transfer.handlingRetransmits = false;
    }

    // Send C2 and handle possible retransmit requests like the main upload flow.
    if (IS_MACOS) {
      const EXTRA_WAIT_MS = Math.max(500, (paceMs || CHUNK_DELAY_MS) * 3);
      log(`macOS: waiting ${EXTRA_WAIT_MS}ms for retransmit requests before sending C2 (edit modal)...`, 'warn');
      await sleep(EXTRA_WAIT_MS);
    }

    log('Edit modal: Sending C2 (end transfer)...', 'warn');
    transfer.ending = true;
    await send(buildCmd('C2', '', 8));

    // Use longer timeouts on macOS
    const ACK_WAIT_MS = IS_MACOS ? 8000 : 5000;
    let c2 = null;
    let retryAttempts = 0;
    const maxRetries = 100;
    transfer.handlingRetransmits = true;

    while (!c2 && retryAttempts < maxRetries) {
      const response = await Promise.race([
        waitForAck('BBC1', ACK_WAIT_MS).catch(() => null),
        waitForAck('BBC2', ACK_WAIT_MS).catch(() => null)
      ]);
      if (!response) { retryAttempts++; log(`Edit: no response, retry ${retryAttempts}/${maxRetries}`, 'warn'); continue; }
      if (response.startsWith('BBC2')) { c2 = response; log('Edit: BBC2 received', 'warn'); break; }
  if (response.startsWith('BBC1')) {
        let isFailed = parseInt(response.slice(4,6), 16);
        let chunkIndex = parseInt(response.slice(6,10), 16);
        if (isFailed === 1) {
          log(`Edit: Device requests retransmit of chunk ${chunkIndex}`, 'warn');
          const maxChunkRetrans = 6;
          const perAttemptWait = Math.max(1500, CHUNK_DELAY_MS * 4);
          for (let attempt = 1; attempt <= maxChunkRetrans; attempt++) {
            const payload = transfer.chunks.get(chunkIndex);
            if (!payload) { log(`Edit: Chunk ${chunkIndex} not found in cache`, 'warn'); break; }
            log(`Edit: Retransmit attempt ${attempt}/${maxChunkRetrans} for chunk ${chunkIndex}`,'warn');
    const forceWith = IS_MACOS && chunkIndex === 0;
    await send(buildCmd('C1', payload, 0), forceWith ? { forceWithResponse: true } : undefined);
            const resp = await Promise.race([
              waitForAck('BBC2', perAttemptWait).catch(() => null),
              waitForAck('BBC1', perAttemptWait).catch(() => null)
            ]);
            if (!resp) { await sleep(IS_MACOS ? paceMs : CHUNK_DELAY_MS); continue; }
            if (resp.startsWith('BBC2')) { c2 = resp; log('Edit: BBC2 received (during retransmit attempts)','warn'); break; }
            const nextFailed = parseInt(resp.slice(4,6), 16);
            const nextIdx = parseInt(resp.slice(6,10), 16);
            if (nextFailed === 1 && nextIdx !== chunkIndex) {
              log(`Edit: Switching retransmit target to chunk ${nextIdx} (was ${chunkIndex})`,'warn');
              chunkIndex = nextIdx; attempt = 0; continue;
            }
          }
        }
        retryAttempts++;
      }
    }

    transfer.handlingRetransmits = false;
    if (!c2) throw new Error('Timeout waiting for BBC2 (edit modal)');
    const c2Failed = parseInt(c2.slice(4,6),16);
    if (c2Failed !== 0) {
      if (IS_MACOS) {
        log('Edit modal: BBC2 failed on macOS — extra retransmit pass then retrying C2...', 'warn');
        transfer.handlingRetransmits = true;
    const extraWindow = 4000; const endAt = Date.now() + extraWindow;
        while (Date.now() < endAt) {
          const resp = await waitForAck('BBC1', Math.min(1000, endAt - Date.now())).catch(() => null);
          if (!resp) continue;
          const isFailed = parseInt(resp.slice(4,6), 16);
          if (isFailed === 1) {
            const chunkIndex = parseInt(resp.slice(6,10), 16);
            const payload = transfer.chunks.get(chunkIndex);
            if (payload) { log(`Edit extra-pass resend chunk ${chunkIndex}`, 'warn'); await send(buildCmd('C1', payload, 0)); await sleep(IS_MACOS ? paceMs : CHUNK_DELAY_MS); }
          }
        }
        transfer.handlingRetransmits = false;

        log('Edit modal: Resending C2 (macOS extra retry)...', 'warn');
        await send(buildCmd('C2','',8));
        const finalC2 = await waitForAck('BBC2', 10000).catch(() => null);
        if (!finalC2) throw new Error('Timeout waiting for BBC2 after macOS extra retry (edit modal)');
        const finalFailed = parseInt(finalC2.slice(4,6), 16);
        if (finalFailed !== 0) throw new Error('Device reported transfer failed even after macOS extra retry (edit modal)');
      } else {
        throw new Error('Device reported failure on end (edit modal)');
      }
    }

  // Short settle before C3
  await sleep(IS_MACOS ? 300 : 300);
    await send(buildCmd('C3', '5C55' + nameHex));
    const c3 = await waitForAck('BBC3', 15000);  // Long timeout for flash write (especially on macOS)
    if (!c3) throw new Error('Timeout waiting for BBC3');
    const c3Failed = parseInt(c3.slice(4,6),16);
    if (c3Failed !== 0) throw new Error('Device failed final rename');

  const tEnd = performance.now();
  const secs = (tEnd - tStart) / 1000;
  const kb = (size / 1024).toFixed(1);
  const rate = secs ? (size / secs / 1024).toFixed(1) : '∞';
  edUploadProg.textContent = `Upload complete ✔ (${kb} KB in ${secs.toFixed(2)}s, ~${rate} KB/s)`;
    log(`Edit modal upload complete for "${targetName}"`, 'warn');
    startFetchFiles();
  } catch (e) {
    edUploadProg.textContent = 'Upload error';
    log('Edit upload error: ' + e.message, 'warn');
  } finally {
    transfer.inProgress = false;
    edUploadBtn.disabled = false;
  }
};

    // build eye grid 1..18 using mapping
    eyeGrid.innerHTML = '';
        for (let imgIdx = 1; imgIdx <= 18; imgIdx++) {
        const eyeNum = EYE_IMG_TO_NUM[imgIdx] || imgIdx; // device value
        const div = document.createElement('div');
        div.className = 'eye-opt' + (eyeNum === ed.eye ? ' selected' : '');
        div.dataset.eye = String(eyeNum);               // device value in dataset
        div.innerHTML = eyeImgHTML(eyeNum);
        div.title = `Eye ${eyeNum}`;
        eyeGrid.appendChild(div);
    }
    editModal.classList.remove('hidden');
  }
  
  function closeEditModal() { editModal.classList.add('hidden'); }
  $('#edClose').addEventListener('click', closeEditModal);

    eyeGrid.addEventListener('click', (e) => {
    const cell = e.target.closest('.eye-opt');
    if (!cell) return;
    ed.eye = parseInt(cell.dataset.eye, 10);        // device value
    eyeGrid.querySelectorAll('.eye-opt').forEach(el => el.classList.remove('selected'));
    cell.classList.add('selected');
    });

  // C7: Delete (with confirmation)
  $('#edDelete').addEventListener('click', ()=>{
    if (!isConnected()) return log('Not connected','warn');
    const delName = ($('#edName').value || `serial #${$('#edSerial').value}`);
    if (!confirm(`Delete "${delName}" from device? This cannot be undone.`)) return;
    const serial = Math.max(0, parseInt($('#edSerial').value||'0',10));
    const cluster = Math.max(0, parseInt($('#edCluster').value||'0',10));
    send(buildCmd('C7', intToHex(serial,2) + intToHex(cluster,4)));
    log(`Delete request (C7) serial=${serial} cluster=${cluster}`, 'warn');
    closeEditModal();
  });

  // F9: Set eye (file metadata)
  $('#edApplyEye').addEventListener('click', ()=>{
    if (!isConnected()) return log('Not connected','warn');
    const cluster = Math.max(0, parseInt($('#edCluster').value||'0',10)) >>> 0;
    const name = ($('#edName').value || '').trim();
    let payload = intToHex(ed.eye,1) + '00' + intToHex(cluster,4);
    if (name) {
      const nameHex = utf16leHex(name);
      const nameLen = intToHex((nameHex.length/2) + 2, 1);
      payload += nameLen + '5C55' + nameHex;
    } else {
      payload += '00';
    }
    send(buildCmd('F9', payload, PAD_DEFAULT));
    log(`Set Eye (F9) icon=${ed.eye} cluster=${cluster}${name?` name="${name}"`:''}`);
  });

  // CA: Set animation
  $('#edApplyAnim').addEventListener('click', ()=>{
    if (!isConnected()) return log('Not connected','warn');
    const action = Math.max(0, Math.min(255, parseInt($('#edAction').value||'255',10)));
    const cluster = Math.max(0, parseInt($('#edCluster').value||'0',10));
    const name = ($('#edName').value || '').trim();
    const nameHex = utf16leHex(name);
    const nameLen = name ? intToHex((nameHex.length/2)+2, 1) : '00';
    const payload = intToHex(action,1) + '00' + intToHex(cluster,4) + (name ? nameLen + '5C55' + nameHex : nameLen);
    send(buildCmd('CA', payload));
    log(`Set Animation (CA) for "${name}" action=${action} cluster=${cluster}`);
  });

  // Feature detection
  if (!('bluetooth' in navigator)) {
    log('This browser does not support Web Bluetooth. Use Chrome/Edge on desktop or Android over HTTPS.', 'warn');
  }

  // --- Text-to-Speech: ElevenLabs cloud TTS → upload to device and auto-play ---
  const TTS_STORE_KEY = 'skelly_tts_eleven_key';
  const TTS_STORE_VOICE = 'skelly_tts_eleven_voice';
  function ttsLoadKey() { const v = localStorage.getItem(TTS_STORE_KEY) || ''; const el = $('#ttsElevenKey'); if (el) el.value = v; return v; }
  function ttsSaveKey() { const el = $('#ttsElevenKey'); if (el && el.value) localStorage.setItem(TTS_STORE_KEY, el.value.trim()); }
  function ttsLoadVoice() { return localStorage.getItem(TTS_STORE_VOICE) || ''; }
  function ttsSaveVoice(id) { localStorage.setItem(TTS_STORE_VOICE, id || ''); }

  // Cache last preview so Generate & Upload can reuse it if params match
  const ttsCache = { key: null, u8: null, convU8: null };
  function ttsComputeKey({ text, voiceId, modelId, stability, similarityBoost, style, speakerBoost }){
    return JSON.stringify({ text, voiceId, modelId,
      stability: (typeof stability==='number'&&!Number.isNaN(stability))?stability:null,
      similarityBoost: (typeof similarityBoost==='number'&&!Number.isNaN(similarityBoost))?similarityBoost:null,
      style: (typeof style==='number'&&!Number.isNaN(style))?style:null,
      speakerBoost: !!speakerBoost
    });
  }

  async function autoPlayByNameIfPossible(name, timeoutMs = 10000) {
    try {
      if (!isConnected()) return;
      await startFetchFiles(true);
      const t0 = performance.now();
      let found = null;
      while (performance.now() - t0 < timeoutMs) {
        found = deviceHasFileName(name);
        if (found) break;
        await sleep(500);
      }
      if (found) {
        const serial = found.serial >>> 0;
        log(`Auto-playing uploaded TTS: serial=${serial} name="${found.name}"`);
        await sleep(300);
        send(buildCmd('C6', intToHex(serial,2) + '01', PAD_DEFAULT));
      } else {
        log('Uploaded TTS not found in list yet; use Play once it appears.', 'warn');
      }
    } catch (e) {
      log('Auto-play error: ' + (e?.message || e), 'warn');
    }
  }

  async function ttsFetchVoices(apiKey) {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': apiKey }});
    if (!res.ok) throw new Error(`Voices fetch failed (${res.status})`);
    const data = await res.json();
    return data?.voices || [];
  }
  function ttsRenderVoices(voices, selected) {
    const sel = $('#ttsElevenVoice'); if (!sel) return;
    sel.innerHTML = voices.map(v => `<option value="${v.voice_id}" ${v.voice_id===selected?'selected':''}>${v.name}</option>`).join('');
  }
  async function ttsFetchModels(apiKey){
    // Try known public models overview first as fallback; prefer API if available
    // Some accounts can use GET /v1/models; falling back if blocked would be fine.
    try{
      const res = await fetch('https://api.elevenlabs.io/v1/models', { headers: { 'xi-api-key': apiKey } });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      // Normalize to list of TTS-capable models with id + label
      const models = (Array.isArray(data)?data: (data?.models||[]))
        .filter(m => typeof m?.model_id === 'string')
        .map(m => ({ id: m.model_id, name: m.name || m.model_id }))
        // prioritize common TTS models
        .sort((a,b)=> a.id.localeCompare(b.id));
      return models;
    } catch(e){
      throw new Error('Failed to fetch models: ' + (e?.message || e));
    }
  }
  function ttsRenderModels(models, selected){
    const sel = $('#ttsModel'); if (!sel) return;
    if (!Array.isArray(models) || !models.length){
      log('No models returned for this API key.', 'warn');
      return;
    }
    sel.innerHTML = models.map(m => `<option value="${m.id}" ${m.id===selected?'selected':''}>${m.name}</option>`).join('');
    // Re-apply tuning visibility for selected model
    updateTuningVisibility();
  }
  function isV3Model(id){ return typeof id === 'string' && /^eleven_v3(_alpha)?$/i.test(id.trim()); }
  async function ttsGenerate(apiKey, voiceId, text, { modelId, stability, similarityBoost, style, speakerBoost } = {}) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify((()=>{
        const mid = modelId || 'eleven_multilingual_v2';
        if (isV3Model(mid)){
          // V3: omit v2 voice_settings (not applicable)
          return { text, model_id: mid };
        } else {
          return {
            text,
            model_id: mid,
            voice_settings: {
              stability: typeof stability === 'number' ? stability : 0.5,
              similarity_boost: typeof similarityBoost === 'number' ? similarityBoost : 0.75,
              style: typeof style === 'number' ? style : 0.0,
              use_speaker_boost: !!speakerBoost
            }
          };
        }
      })())
    });
    if (!res.ok) throw new Error(`TTS failed (${res.status})`);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }

  // Preview helpers
  function getTtsParamsFromUI(){
    const apiKey = ($('#ttsElevenKey')?.value || '').trim();
    const voiceId = ($('#ttsElevenVoice')?.value || '').trim();
    const text = ($('#ttsText')?.value || '').trim();
    const modelOverride = ($('#ttsModelOverride')?.value || '').trim();
    const modelId = modelOverride || ($('#ttsModel')?.value || '').trim() || 'eleven_multilingual_v2';
    const stability = parseFloat(($('#ttsStability')?.value || '0.5'));
    const similarityBoost = parseFloat(($('#ttsSimilarity')?.value || '0.75'));
    const style = parseFloat(($('#ttsStyle')?.value || '0'));
    const speakerBoost = !!$('#ttsSpeakerBoost')?.checked;
    return { apiKey, voiceId, text, modelId, stability, similarityBoost, style, speakerBoost };
  }

  // Toggle tuning UI based on model selection/override
  function updateTuningVisibility(){
    const modelOverride = ($('#ttsModelOverride')?.value || '').trim();
    const modelId = modelOverride || ($('#ttsModel')?.value || '').trim();
    const hide = isV3Model(modelId);
    document.querySelectorAll('.tts-tuning').forEach(el => el.classList.toggle('hidden', hide));
  }
  $('#ttsModel')?.addEventListener('change', updateTuningVisibility);
  $('#ttsModelOverride')?.addEventListener('input', updateTuningVisibility);
  updateTuningVisibility();
  function setPreviewRateBindings(){
    const range = $('#ttsPreviewRate'); const num = $('#ttsPreviewRateNum'); const audio = $('#ttsAudio');
    if (!range || !num) return;
    const sync = (val) => { const v = Math.max(0.5, Math.min(1.5, parseFloat(val)||1)); range.value = String(v); num.value = String(v); if (audio) audio.playbackRate = v; };
    range.addEventListener('input', e => sync(e.target.value));
    num.addEventListener('input', e => sync(e.target.value));
    sync(range.value);
  }
  setPreviewRateBindings();

  $('#btnTtsPreview')?.addEventListener('click', async () => {
    const params = getTtsParamsFromUI();
    const { apiKey, voiceId, text, modelId, stability, similarityBoost, style, speakerBoost } = params;
    if (!text) return log('TTS: enter some text first.', 'warn');
    if (!apiKey || !voiceId) return log('Enter API key and select a voice.', 'warn');
    try{
      log('Generating preview…');
      const u8 = await ttsGenerate(apiKey, voiceId, text, { modelId, stability, similarityBoost, style, speakerBoost });
      // Update cache
      ttsCache.key = ttsComputeKey(params);
      ttsCache.u8 = u8;
      ttsCache.convU8 = null; // reset converted cache; will (re)build on upload if needed
  // Enable Upload Preview and update main button label to reflect cache presence
  const upBtn = $('#btnTtsUploadPreview'); if (upBtn) upBtn.disabled = false;
  const genBtn = $('#btnSendTTS'); if (genBtn) genBtn.textContent = 'Generate & Upload (New)';
      const blob = new Blob([u8], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = $('#ttsAudio');
      if (audio){
        audio.src = url;
        // ensure current preview rate is applied
        const rate = parseFloat($('#ttsPreviewRate')?.value || '1.0') || 1.0;
        audio.playbackRate = Math.max(0.5, Math.min(1.5, rate));
        await audio.play().catch(()=>{});
      }
      log('Preview ready.');
    } catch(e){
      log('Preview error: ' + (e?.message || e), 'warn');
    }
  });

  // Initialize stored key/voice
  (function initTTSUI(){
    const key = ttsLoadKey();
    const sel = $('#ttsElevenVoice');
    if (sel) {
      const saved = ttsLoadVoice();
      if (key) {
        ttsFetchVoices(key).then(vs => { ttsRenderVoices(vs, saved); }).catch(e => log('TTS voices error: '+e.message, 'warn'));
        // Attempt to fetch models for this key and populate dropdown
        ttsFetchModels(key).then(ms => {
          if (Array.isArray(ms) && ms.length) {
            const selected = ($('#ttsModelOverride')?.value || '').trim() || ($('#ttsModel')?.value || '').trim();
            ttsRenderModels(ms, selected);
            log(`Loaded ${ms.length} models for this key.`);
          }
        }).catch(e => log('TTS models error: ' + e.message, 'warn'));
      }
    }
  })();

  $('#btnTtsRefreshVoices')?.addEventListener('click', async () => {
    const key = ($('#ttsElevenKey')?.value || '').trim(); if (!key) return log('Enter your ElevenLabs API key.', 'warn');
    ttsSaveKey();
    try {
      const voices = await ttsFetchVoices(key);
      ttsRenderVoices(voices, ttsLoadVoice());
      log(`Loaded ${voices.length} voices.`);
    } catch(e) { log('TTS voices error: '+e.message, 'warn'); }
  });
  $('#btnTtsRefreshModels')?.addEventListener('click', async () => {
    const key = ($('#ttsElevenKey')?.value || '').trim(); if (!key) return log('Enter your ElevenLabs API key.', 'warn');
    ttsSaveKey();
    try{
      const models = await ttsFetchModels(key);
      const selected = ($('#ttsModelOverride')?.value || '').trim() || ($('#ttsModel')?.value || '').trim();
      ttsRenderModels(models, selected);
      log(`Loaded ${models.length} models.`);
    } catch(e){ log('TTS models error: ' + (e?.message || e), 'warn'); }
  });

  // Convert options (show/hide bitrate row)
  $('#ttsChkConvert')?.addEventListener('change', (e)=>{
    $('#ttsConvertOpts')?.classList.toggle('hidden', !e.target.checked);
  });

  async function convertIfNeeded(u8){
    if (!$('#ttsChkConvert')?.checked) return u8;
    const kbps = parseInt($('#ttsMp3Kbps')?.value || '32', 10);
    try{
      const blob = new Blob([u8], { type: 'audio/mpeg' });
      const { u8: convU8 } = await convertFileToDeviceMp3(blob, kbps);
      return convU8;
    } catch(e){
      log('TTS convert skipped: ' + (e?.message || e), 'warn');
      return u8;
    }
  }

  // Upload the currently previewed audio (no regeneration)
  $('#btnTtsUploadPreview')?.addEventListener('click', async () => {
    const text = ($('#ttsText').value || '').trim();
    if (!text) return log('TTS: enter some text first.', 'warn');
    if (!ttsCache.u8?.length) return log('No preview cached. Click Preview first.', 'warn');
    const desiredNameRaw = ($('#ttsOutName')?.value || '').trim();
    let name = desiredNameRaw || `tts_${Date.now()}.mp3`;
    if (!/\.mp3$/i.test(name)) name += '.mp3';
    try{
      let outU8 = ttsCache.convU8?.length ? ttsCache.convU8 : await convertIfNeeded(ttsCache.u8);
      if (!ttsCache.convU8?.length && $('#ttsChkConvert')?.checked) ttsCache.convU8 = outU8;
      await sendFileToDevice(outU8, name);
      log('TTS uploaded (preview). Play it from the Files table.', 'success');
    } catch(e){
      log('Upload preview error: ' + (e?.message || e), 'warn');
    }
  });

  $('#ttsElevenVoice')?.addEventListener('change', (e) => { ttsSaveVoice(e.target.value); });

  $('#btnSendTTS')?.addEventListener('click', async () => {
    const text = ($('#ttsText').value || '').trim();
    if (!text) return log('TTS: enter some text first.', 'warn');

    const params = getTtsParamsFromUI();
    const { apiKey, voiceId, modelId, stability, similarityBoost, style, speakerBoost } = params;
    const desiredNameRaw = ($('#ttsOutName')?.value || '').trim();
    if (!apiKey) return log('Enter your ElevenLabs API key.', 'warn');
    if (!voiceId) return log('Pick a voice (click Refresh Voices if empty).', 'warn');
    ttsSaveKey(); ttsSaveVoice(voiceId);

    try {
      const key = ttsComputeKey(params);
      let u8 = null;
      if (ttsCache.key === key && ttsCache.u8?.length) {
        log('Using cached preview audio (regenerate to create a new version).', 'warn');
        u8 = ttsCache.u8;
      } else {
        log('Generating TTS with ElevenLabs…');
        u8 = await ttsGenerate(apiKey, voiceId, text, { modelId, stability, similarityBoost, style, speakerBoost });
        ttsCache.key = key; ttsCache.u8 = u8; ttsCache.convU8 = null;
      }
      // Convert to device-friendly MP3 (8kHz mono, 32kbps) for best compatibility
      let outU8 = u8; let name = desiredNameRaw || `tts_${Date.now()}.mp3`;
      if (!/\.mp3$/i.test(name)) name += '.mp3';
      if (ttsCache.key === key && ttsCache.convU8?.length) {
        outU8 = ttsCache.convU8;
        log(`Using cached converted MP3 (${outU8.length} bytes).`);
      } else {
        outU8 = await convertIfNeeded(u8);
        if ($('#ttsChkConvert')?.checked) ttsCache.convU8 = outU8;
        if (outU8 !== u8) log(`Converted TTS to device MP3 (${outU8.length} bytes).`);
      }
      // Upload
      await sendFileToDevice(outU8, name);
      log('TTS uploaded. Play it from the Files table.', 'success');
    } catch (e) {
      log('TTS error: ' + e.message, 'warn');
    }
  });

  function setMoveSelection(rootId, {all=false, head=false, arm=false, torso=false}){
  const root = document.getElementById(rootId); if(!root) return;
  const set = (p, v)=> root.querySelector(`[data-part="${p}"]`)
                     ?.classList.toggle('selected', !!v);
  // “All” deselects others automatically in UI, but we set everything explicitly here.
  set('all',   all);
  set('head',  !all && head);
  set('arm',   !all && arm);
  set('torso', !all && torso);
}


// ===== Per-file color picker sync =====
const edColorPick = $('#edColorPick');
['edR','edG','edB'].forEach(id => {
  $('#'+id)?.addEventListener('input', () => {
    const rr = clamp($('#edR').value,0,255);
    const gg = clamp($('#edG').value,0,255);
    const bb = clamp($('#edB').value,0,255);
    const hex = `#${intToHex(rr,1)}${intToHex(gg,1)}${intToHex(bb,1)}`.toLowerCase();
    if (edColorPick && edColorPick.value !== hex) edColorPick.value = hex;
  });
});
edColorPick?.addEventListener('input', () => {
  const v = edColorPick.value.replace('#','');
  if (v.length === 6) {
    $('#edR').value = parseInt(v.slice(0,2),16);
    $('#edG').value = parseInt(v.slice(2,4),16);
    $('#edB').value = parseInt(v.slice(4,6),16);
  }
});

// Reset defaults when opening the modal
// (Put inside openEditModal after you set ed.eye/name/etc.)
if ($('#edColorPick')) {
  $('#edR').value = 255; $('#edG').value = 0; $('#edB').value = 0;
  $('#edColorPick').value = '#ff0000';
}

// Apply per-file color (F4, loop=0, ch=FF, +cluster+name)
$('#edApplyRGB')?.addEventListener('click', () => {
  if (!isConnected()) return log('Not connected','warn');

  const r = intToHex(clamp($('#edR').value,0,255), 1);
  const g = intToHex(clamp($('#edG').value,0,255), 1);
  const b = intToHex(clamp($('#edB').value,0,255), 1);
  const loop = '00'; // not cycling; just set this color
  const cluster = intToHex(Math.max(0, parseInt($('#edCluster').value || '0', 10)) >>> 0, 4);
  const name = ($('#edName').value || '').trim();

  let payload = 'FF' + r + g + b + loop + cluster;
  if (name) {
    const nameHex = utf16leHex(name);
    payload += intToHex((nameHex.length/2) + 2, 1) + '5C55' + nameHex;
  } else {
    payload += '00';
  }

  send(buildCmd('F4', payload, PAD_MEDIA));
  log(`Set Color (F4) for file "${name || '(no name)'}" rgb=${parseInt(r,16)},${parseInt(g,16)},${parseInt(b,16)} cluster=${parseInt(cluster,16)}`);
});


// ----- Audio -> MP3 (8 kHz mono) helpers -----
function floatTo16BitPCM(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    let s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return out;
}
function downmixToMono(audioBuffer) {
  if (audioBuffer.numberOfChannels === 1) return new Float32Array(audioBuffer.getChannelData(0));
  const len = audioBuffer.length;
  const out = new Float32Array(len);
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < len; i++) out[i] += data[i];
  }
  const n = audioBuffer.numberOfChannels;
  for (let i = 0; i < len; i++) out[i] /= n;
  return out;
}
function resampleLinear(src, srcRate, dstRate) {
  if (srcRate === dstRate) return src;
  const ratio = srcRate / dstRate;
  const dstLen = Math.max(1, Math.round(src.length / ratio));
  const out = new Float32Array(dstLen);
  for (let i = 0; i < dstLen; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, src.length - 1);
    const t = x - i0;
    out[i] = (1 - t) * src[i0] + t * src[i1];
  }
  return out;
}
/** Convert an input File/Blob to MP3 (mono, 8 kHz).
 *  Returns { u8: Uint8Array, name: string } */
async function convertFileToDeviceMp3(file, kbps = 32) {
  if (typeof lamejs === 'undefined' || !lamejs.Mp3Encoder)
    throw new Error('MP3 encoder library (lamejs) not loaded');

  const buf = await file.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('Web Audio not supported');
  const ctx = new Ctx(); // decode at native rate
  const audioBuf = await ctx.decodeAudioData(buf.slice(0));
  ctx.close?.();

  // mono + resample
  const mono = downmixToMono(audioBuf);
  const res = resampleLinear(mono, audioBuf.sampleRate, 8000);
  const pcm16 = floatTo16BitPCM(res);

  // MP3 encode (1 ch, 8000 Hz, kbps)
  const enc = new lamejs.Mp3Encoder(1, 8000, kbps|0 || 32);
  const block = 1152;
  const parts = [];
  for (let i = 0; i < pcm16.length; i += block) {
    const chunk = pcm16.subarray(i, Math.min(i + block, pcm16.length));
    const d = enc.encodeBuffer(chunk);
    if (d?.length) parts.push(d);
  }
  const end = enc.flush();
  if (end?.length) parts.push(end);

  const mp3Blob = new Blob(parts, { type: 'audio/mpeg' });
  const u8 = new Uint8Array(await mp3Blob.arrayBuffer());
  const outName = (file.name || 'audio').replace(/\.\w+$/i, '') + '.mp3';
  return { u8, name: outName };
}

// Show/hide convert option blocks
$('#chkConvert')?.addEventListener('change', (e)=>{
  $('#convertOpts')?.classList.toggle('hidden', !e.target.checked);
});
$('#edChkConvert')?.addEventListener('change', (e)=>{
  $('#edConvertOpts')?.classList.toggle('hidden', !e.target.checked);
});

const SLOW_ACK_KEY = 'skelly_slow_upload_ack';

/** Show the slow-upload modal unless user opted out. Resolves true to proceed. */
function ensureSlowWarning() {
  if (localStorage.getItem(SLOW_ACK_KEY) === '1') return Promise.resolve(true);
  const m = $('#slowModal'); if (!m) return Promise.resolve(true);
  m.classList.remove('hidden');

  return new Promise((resolve) => {
    const ok = () => {
      if ($('#slowDontShow')?.checked) localStorage.setItem(SLOW_ACK_KEY, '1');
      cleanup(); resolve(true);
    };
    const cancel = () => { cleanup(); resolve(false); };
    const cleanup = () => {
      $('#slowOk')?.removeEventListener('click', ok);
      $('#slowCancel')?.removeEventListener('click', cancel);
      m.classList.add('hidden');
    };
    $('#slowOk')?.addEventListener('click', ok);
    $('#slowCancel')?.addEventListener('click', cancel);
  });
}

function applyAdvVisibility() {
  advRawBlock.classList.toggle('hidden', !advRaw.checked);
  advFTBlock.classList.toggle('hidden',  !advFT.checked);
  const ftInfo = document.getElementById('ftInfoBlock');
  if (ftInfo) ftInfo.classList.toggle('hidden', !!advFT.checked); // show info when OFF, hide when ON
}

// Log platform-specific timing information and version
log('App version: 2025-10-21 v21 (macOS: <=160B chunks + proactive chunk 0 + C1 with-response + retransmit queue)', 'warn');
if (IS_MACOS) {
  log(`macOS detected - using ${CHUNK_DELAY_MS}ms delay between chunks`, 'warn');
}

})();

