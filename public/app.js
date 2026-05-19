'use strict';

const API_BASE = '../plugins/signalk-attitude-calibrator/api';
const AXES = ['pitch', 'roll', 'yaw'];

const elements = {
  statusText: document.getElementById('statusText'),
  runningBadge: document.getElementById('runningBadge'),
  sourceMode: document.getElementById('sourceMode'),
  sourcePolicy: document.getElementById('sourcePolicy'),
  lastSource: document.getElementById('lastSource'),
  sourceTimestamp: document.getElementById('sourceTimestamp'),
  actionMessage: document.getElementById('actionMessage'),
  sourceForm: document.getElementById('sourceForm'),
  sourceModeInput: document.getElementById('sourceModeInput'),
  specificSourceInput: document.getElementById('specificSourceInput'),
  groups: {
    raw: document.querySelector('[data-group="raw"]'),
    offsets: document.querySelector('[data-group="offsets"]'),
    calibrated: document.querySelector('[data-group="calibrated"]')
  }
};

let state = null;
let busy = false;
let sourceBusy = false;

function radiansToDegrees (value) {
  return value * 180 / Math.PI;
}

function formatNumber (value, digits) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '-';
}

function formatAngle (value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { rad: '-', deg: '-' };
  }

  return {
    rad: `${formatNumber(value, 5)} rad`,
    deg: `${formatNumber(radiansToDegrees(value), 2)} deg`
  };
}

function renderMetricGroup (container, values) {
  container.innerHTML = AXES.map(axis => {
    const angle = formatAngle(values ? values[axis] : undefined);
    return `
      <div class="metric">
        <div class="metric-label">${axis}</div>
        <div class="metric-value">
          <strong>${angle.deg}</strong>
          <span>${angle.rad}</span>
        </div>
      </div>
    `;
  }).join('');
}

function setButtonsDisabled (disabled) {
  document.querySelectorAll('button').forEach(button => {
    button.disabled = disabled;
  });
}

function renderSourceOptions (source) {
  const available = source && Array.isArray(source.available) ? source.available : [];
  const configured = source && source.specificSource ? source.specificSource : '';
  const selected = configured || (available[0] && available[0].id) || '';

  elements.specificSourceInput.innerHTML = '';

  if (!available.some(item => item.id === selected) && selected) {
    const option = document.createElement('option');
    option.value = selected;
    option.textContent = selected;
    elements.specificSourceInput.appendChild(option);
  }

  available.forEach(item => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.id;
    elements.specificSourceInput.appendChild(option);
  });

  if (!elements.specificSourceInput.options.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No source observed yet';
    elements.specificSourceInput.appendChild(option);
  }

  elements.sourceModeInput.value = source ? source.mode : 'all';
  elements.specificSourceInput.value = selected;
  elements.specificSourceInput.disabled = elements.sourceModeInput.value !== 'specific' || !selected;
}

function render () {
  const sourceSample = state && state.samples ? state.samples.source : null;
  const calibratedSample = state && state.samples ? state.samples.calibrated : null;
  const source = state ? state.source : null;
  const offsets = state ? state.offsets : null;

  elements.runningBadge.classList.toggle('is-running', Boolean(state && state.isRunning));
  elements.runningBadge.classList.toggle('is-error', Boolean(state && state.error));
  elements.runningBadge.textContent = state && state.error ? 'error' : state && state.isRunning ? 'running' : 'stopped';

  elements.statusText.textContent = state && state.error
    ? state.error
    : sourceSample
      ? 'Receiving attitude samples'
      : 'Waiting for attitude samples';

  elements.sourceMode.textContent = source ? source.mode : '-';
  elements.sourcePolicy.textContent = source ? source.policy : '-';
  elements.lastSource.textContent = source && source.last ? source.last : '-';
  elements.sourceTimestamp.textContent = sourceSample && sourceSample.timestamp
    ? new Date(sourceSample.timestamp).toLocaleString()
    : '-';

  if (!sourceBusy && document.activeElement !== elements.sourceModeInput && document.activeElement !== elements.specificSourceInput) {
    renderSourceOptions(source);
  }

  renderMetricGroup(elements.groups.raw, sourceSample ? sourceSample.value : null);
  renderMetricGroup(elements.groups.offsets, offsets);
  renderMetricGroup(elements.groups.calibrated, calibratedSample ? calibratedSample.value : null);
}

async function saveSource (event) {
  event.preventDefault();

  const mode = elements.sourceModeInput.value;
  const specificSource = elements.specificSourceInput.value;

  sourceBusy = true;
  setButtonsDisabled(true);
  elements.actionMessage.textContent = 'Saving source configuration...';

  try {
    const response = await fetch(`${API_BASE}/source`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, specificSource })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Source update failed: ${response.status}`);
    state = data;
    elements.actionMessage.textContent = 'Source configuration saved.';
    render();
  } catch (error) {
    elements.actionMessage.textContent = error.message;
  } finally {
    sourceBusy = false;
    setButtonsDisabled(false);
  }
}

async function requestState () {
  const response = await fetch(`${API_BASE}/state`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`State request failed: ${response.status}`);
  state = await response.json();
  render();
}

async function zero (mode) {
  const payload = {
    pitch: mode === 'pitch' || mode === 'both',
    roll: mode === 'roll' || mode === 'both'
  };

  busy = true;
  setButtonsDisabled(true);
  elements.actionMessage.textContent = 'Saving calibration...';

  try {
    const response = await fetch(`${API_BASE}/zero`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Calibration failed: ${response.status}`);
    state = data;
    elements.actionMessage.textContent = 'Calibration saved.';
    render();
  } catch (error) {
    elements.actionMessage.textContent = error.message;
  } finally {
    busy = false;
    setButtonsDisabled(false);
  }
}

document.querySelectorAll('[data-zero]').forEach(button => {
  button.addEventListener('click', () => zero(button.dataset.zero));
});

elements.sourceModeInput.addEventListener('change', () => {
  elements.specificSourceInput.disabled = elements.sourceModeInput.value !== 'specific';
});

elements.sourceForm.addEventListener('submit', saveSource);

requestState().catch(error => {
  elements.statusText.textContent = error.message;
});

setInterval(() => {
  if (!busy) {
    requestState().catch(error => {
      elements.statusText.textContent = error.message;
    });
  }
}, 1000);
