// OpenShift API client - Direct connection using environment variables

// Get OpenShift credentials from environment variables (set in .env file)
const OPENSHIFT_API_URL = import.meta.env.VITE_OPENSHIFT_API_URL || "https://api.rm3.7wse.p1.openshiftapps.com:6443";
const OPENSHIFT_TOKEN = import.meta.env.VITE_OPENSHIFT_TOKEN || "";


async function openshiftFetch(path: string): Promise<unknown> {
  // Use local Vite proxy to avoid CORS issues
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `/api/openshift${normalizedPath}`;

  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error(
          'OpenShift token is expired or invalid (HTTP 401). ' +
          'Get a new token from the OpenShift console (username → Copy login command → Display Token) ' +
          'and update VITE_OPENSHIFT_TOKEN in project/.env and OPENSHIFT_TOKEN in project/backend/.env, then restart both servers.'
        );
      }
      const body = await res.text();
      let msg = `OpenShift API error: ${res.status}`;
      try {
        const parsed = JSON.parse(body);
        if (parsed.message) msg = parsed.message;
        else if (parsed.error) msg = parsed.error;
      } catch { /* use default */ }
      throw new Error(msg);
    }

    return res.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
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
  metadata: { name: string; namespace: string; uid: string; creationTimestamp: string };
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

// Use OpenShift Projects API (works with sandbox RBAC)
export async function getNamespaces(): Promise<OCNamespace[]> {
  const data = await openshiftFetch('/apis/project.openshift.io/v1/projects') as { items?: OCNamespace[] };
  return data.items || [];
}

// Fetch pods across all accessible namespaces (per-namespace to avoid 403)
export async function getPods(namespace?: string): Promise<OCPod[]> {
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
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value?.items) pods.push(...r.value.items);
  });
  return pods;
}

// Fetch nodes (may be restricted in sandbox)
export async function getNodes(): Promise<OCNode[]> {
  try {
    const data = await openshiftFetch('/api/v1/nodes') as { items?: OCNode[] };
    return data.items || [];
  } catch {
    return [];
  }
}

// Fetch deployments across all accessible namespaces
export async function getDeployments(namespace?: string): Promise<OCDeployment[]> {
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
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value?.items) deployments.push(...r.value.items);
  });
  return deployments;
}

// Fetch events across all accessible namespaces
export async function getEvents(namespace?: string): Promise<OCEvent[]> {
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
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value?.items) events.push(...r.value.items);
  });
  return events;
}

export async function getPodLogs(namespace: string, podName: string, container?: string): Promise<string> {
  let path = `/api/v1/namespaces/${namespace}/pods/${podName}/log?tailLines=100`;
  if (container) path += `&container=${container}`;
  const data = await openshiftFetch(path);
  return typeof data === 'string' ? data : JSON.stringify(data);
}

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
