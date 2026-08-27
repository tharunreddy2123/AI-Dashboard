// OpenShift API client
// - Local dev:   fetches /api/openshift/* → proxied by Vite to the OpenShift cluster directly
// - Production:  fetches via FastAPI backend (BACKEND_URL/api/openshift/*)
//                which is itself proxied through the Netlify Function → Render backend

import { BACKEND_URL } from './api-client';

// Whether we are running the Vite dev server (proxy is available)
const IS_DEV = import.meta.env.DEV;

async function openshiftFetch(path: string): Promise<unknown> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // In dev: use Vite proxy (/api/openshift → OpenShift cluster directly)
  // In prod: use FastAPI backend which already handles /api/openshift/*
  const url = IS_DEV
    ? `/api/openshift${normalizedPath}`
    : `${BACKEND_URL}/api/openshift${normalizedPath}`;

  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error(
          'OpenShift token is expired or invalid (HTTP 401). ' +
          'Click the Token button in the header to refresh it.'
        );
      }
      const body = await res.text();
      let msg = `OpenShift API error: ${res.status}`;
      try {
        const parsed = JSON.parse(body);
        if (parsed.message) msg = parsed.message;
        else if (parsed.error) msg = parsed.error;
        else if (parsed.detail) msg = parsed.detail;
      } catch { /* use default */ }
      throw new Error(msg);
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return res.json();
    }
    return res.text();
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('Failed to connect to OpenShift API');
  }
}

export interface OCNamespace {
  metadata: { name: string; uid: string; creationTimestamp: string; labels?: Record<string, string> };
  spec: { finalizers: string[] };
  status: { phase: string };
}

export interface OCPodContainer {
  name: string;
  image: string;
  resources?: { requests?: { cpu?: string; memory?: string }; limits?: { cpu?: string; memory?: string } };
}

export interface OCPodContainerStatus {
  name: string;
  restartCount: number;
  state: Record<string, unknown>;
  ready: boolean;
  image: string;
}

export interface OCPod {
  metadata: {
    name: string;
    namespace: string;
    uid: string;
    creationTimestamp: string;
    ownerReferences?: Array<{ kind: string; name: string; uid: string }>;
  };
  spec: { nodeName?: string; containers: OCPodContainer[] };
  status: { phase: string; containerStatuses?: OCPodContainerStatus[] };
}

export interface OCNode {
  metadata: { name: string; uid: string; labels: Record<string, string>; creationTimestamp: string };
  status: { conditions: Array<{ type: string; status: string; reason: string; message: string }>; capacity: { cpu: string; memory: string; pods: string }; allocatable: { cpu: string; memory: string; pods: string } };
}

export interface OCDeployment {
  metadata: { name: string; namespace: string; uid: string; creationTimestamp: string };
  spec: { replicas: number; selector: Record<string, unknown>; template: Record<string, unknown> };
  status: { replicas: number; updatedReplicas: number; availableReplicas: number; readyReplicas: number; unavailableReplicas: number; conditions?: Array<{ type: string; status: string; reason: string; message: string; lastUpdateTime: string }> };
}

export interface OCEvent {
  metadata: { name: string; uid: string; creationTimestamp: string };
  involvedObject: { name: string; namespace: string; kind: string };
  reason: string;
  message: string;
  source: { component: string };
  type: string;
  count: number;
  lastTimestamp: string;
}

// ── API functions ─────────────────────────────────────────────────────────────
// In production these hit the FastAPI backend endpoints (main.py /api/openshift/*)
// which already map to the same data.

export async function getNamespaces(): Promise<OCNamespace[]> {
  if (IS_DEV) {
    const data = await openshiftFetch('/apis/project.openshift.io/v1/projects') as { items?: OCNamespace[] };
    return data.items || [];
  }
  // Production: FastAPI backend endpoint
  const data = await fetchBackend('/api/openshift/namespaces') as { namespaces?: OCNamespace[] };
  return data.namespaces || [];
}

export async function getPods(namespace?: string): Promise<OCPod[]> {
  if (IS_DEV) {
    if (namespace) {
      const data = await openshiftFetch(`/api/v1/namespaces/${namespace}/pods`) as { items?: OCPod[] };
      return data.items || [];
    }
    const namespaces = await getNamespaces();
    const results = await Promise.allSettled(
      namespaces.map(ns =>
        openshiftFetch(`/api/v1/namespaces/${ns.metadata.name}/pods`) as Promise<{ items?: OCPod[] }>
      )
    );
    const pods: OCPod[] = [];
    results.forEach(r => { if (r.status === 'fulfilled' && r.value?.items) pods.push(...r.value.items); });
    return pods;
  }
  // Production: FastAPI backend endpoint
  const url = namespace ? `/api/openshift/pods?namespace=${namespace}` : '/api/openshift/pods';
  const data = await fetchBackend(url) as { pods?: OCPod[] };
  return data.pods || [];
}

export async function getNodes(): Promise<OCNode[]> {
  if (IS_DEV) {
    try {
      const data = await openshiftFetch('/api/v1/nodes') as { items?: OCNode[] };
      return data.items || [];
    } catch { return []; }
  }
  // Production: FastAPI backend endpoint
  try {
    const data = await fetchBackend('/api/openshift/nodes') as { nodes?: OCNode[] };
    return data.nodes || [];
  } catch { return []; }
}

export async function getDeployments(namespace?: string): Promise<OCDeployment[]> {
  if (IS_DEV) {
    if (namespace) {
      const data = await openshiftFetch(`/apis/apps/v1/namespaces/${namespace}/deployments`) as { items?: OCDeployment[] };
      return data.items || [];
    }
    const namespaces = await getNamespaces();
    const results = await Promise.allSettled(
      namespaces.map(ns =>
        openshiftFetch(`/apis/apps/v1/namespaces/${ns.metadata.name}/deployments`) as Promise<{ items?: OCDeployment[] }>
      )
    );
    const deployments: OCDeployment[] = [];
    results.forEach(r => { if (r.status === 'fulfilled' && r.value?.items) deployments.push(...r.value.items); });
    return deployments;
  }
  // Production: FastAPI backend endpoint
  const url = namespace ? `/api/openshift/deployments?namespace=${namespace}` : '/api/openshift/deployments';
  const data = await fetchBackend(url) as { deployments?: OCDeployment[] };
  return data.deployments || [];
}

export async function getEvents(namespace?: string): Promise<OCEvent[]> {
  if (IS_DEV) {
    if (namespace) {
      const data = await openshiftFetch(`/api/v1/namespaces/${namespace}/events`) as { items?: OCEvent[] };
      return data.items || [];
    }
    const namespaces = await getNamespaces();
    const results = await Promise.allSettled(
      namespaces.map(ns =>
        openshiftFetch(`/api/v1/namespaces/${ns.metadata.name}/events`) as Promise<{ items?: OCEvent[] }>
      )
    );
    const events: OCEvent[] = [];
    results.forEach(r => { if (r.status === 'fulfilled' && r.value?.items) events.push(...r.value.items); });
    return events;
  }
  // Production: FastAPI backend endpoint
  const url = namespace ? `/api/openshift/events?namespace=${namespace}` : '/api/openshift/events';
  const data = await fetchBackend(url) as { events?: OCEvent[] };
  return data.events || [];
}

export async function getPodLogs(namespace: string, podName: string, container?: string): Promise<string> {
  // Always goes through the backend (both dev and prod) — the backend handles log fetching
  const params = new URLSearchParams();
  if (container) params.set('container', container);
  const qs = params.toString() ? `?${params}` : '';
  // In dev use BACKEND_URL directly (localhost:8000), in prod use BACKEND_URL (Netlify function)
  const res = await fetch(`${BACKEND_URL}/api/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'logs', kind: 'Pod', name: podName, namespace, container }),
  });
  if (!res.ok) throw new Error(`Failed to fetch logs: ${res.status}`);
  const data = await res.json() as { result?: string };
  return data.result || '(no output)';
}

// ── helper: fetch from FastAPI backend (production path) ─────────────────────

async function fetchBackend(path: string): Promise<unknown> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text();
    let msg = `Backend error: ${res.status}`;
    try {
      const parsed = JSON.parse(body);
      if (parsed.detail) msg = parsed.detail;
      else if (parsed.error) msg = parsed.error;
    } catch { /* use default */ }
    throw new Error(msg);
  }
  return res.json();
}

// ── utility functions (unchanged) ────────────────────────────────────────────

export function getPodAge(creationTimestamp: string): string {
  const created = new Date(creationTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days > 0) return `${days}d`;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours > 0) return `${hours}h`;
  const minutes = Math.floor(diffMs / (1000 * 60));
  return `${minutes}m`;
}

export function getPodHealthStatus(pod: OCPod): 'healthy' | 'warning' | 'critical' {
  const containerStatuses = pod.status.containerStatuses || [];
  const hasCrashLoop = containerStatuses.some(cs => {
    const waiting = cs.state as { waiting?: { reason: string } };
    return waiting?.waiting?.reason === 'CrashLoopBackOff';
  });
  const hasOOM = containerStatuses.some(cs => {
    const terminated = cs.state as { terminated?: { reason: string } };
    return terminated?.terminated?.reason === 'OOMKilled';
  });
  const highRestarts = containerStatuses.some(cs => cs.restartCount > 5);
  if (hasCrashLoop || hasOOM || pod.status.phase === 'Failed') return 'critical';
  if (highRestarts || pod.status.phase === 'Pending') return 'warning';
  return 'healthy';
}

export function getNodeRole(node: OCNode): string {
  const labels = node.metadata.labels || {};
  if (labels['node-role.kubernetes.io/master'] !== undefined || labels['node-role.kubernetes.io/control-plane'] !== undefined) return 'master';
  return 'worker';
}

export function getNodeConditions(node: OCNode): Array<{ type: string; status: string }> {
  return (node.status.conditions || []).map(c => ({ type: c.type, status: c.status }));
}

export function isNodeReady(node: OCNode): boolean {
  return node.status.conditions?.some(c => c.type === 'Ready' && c.status === 'True') || false;
}

// Made with Bob
