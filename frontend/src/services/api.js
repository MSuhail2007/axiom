const API_BASE = '/api/v1';

export async function fetchLocationPage(query, offset = 0, limit = 40) {
  const res = await fetch(`${API_BASE}/catalog?q=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}`);
  if (!res.ok) throw new Error('Could not load the local catalog');
  return res.json();
}

export async function standardizeText(text, mode = 'auto', useOsm = true) {
  const res = await fetch(`${API_BASE}/standardize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, mode, use_osm: useOsm })
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Standardization request failed');
  }
  return res.json();
}

export async function standardizeUpload(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/standardize/upload`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'File upload parsing failed');
  }
  return res.json();
}

export async function fetchLocations(limit = 100) {
  const res = await fetch(`${API_BASE}/locations?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch locations');
  return res.json();
}

export async function searchLocations(query, limit = 30) {
  const res = await fetch(`${API_BASE}/locations/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export async function getLocationDetail(locationId) {
  const res = await fetch(`${API_BASE}/locations/${encodeURIComponent(locationId)}`);
  if (!res.ok) throw new Error('Failed to fetch location details');
  return res.json();
}

export async function fetchAnalyticsOverview() {
  const res = await fetch(`${API_BASE}/analytics/overview`);
  if (!res.ok) throw new Error('Failed to load analytics overview');
  return res.json();
}

export async function fetchReviewQueue() {
  const res = await fetch(`${API_BASE}/review/queue`);
  if (!res.ok) throw new Error('Failed to fetch review queue');
  return res.json();
}

export async function submitReviewDecision(itemId, { action, selectedCanonicalId, createFutureAlias = true }) {
  const res = await fetch(`${API_BASE}/review/${itemId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      selected_canonical_id: selectedCanonicalId,
      create_future_alias: createFutureAlias
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to submit review decision');
  }
  return res.json();
}

export async function checkBackendHealth() {
  try {
    const res = await fetch('/health');
    return res.ok;
  } catch {
    return false;
  }
}
