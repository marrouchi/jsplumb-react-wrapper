import type { BrowserJsPlumbInstance } from '@jsplumb/community';
import type {
  Connection,
  ConnectionDetachedParams,
  ConnectionEstablishedParams
} from '@jsplumb/core';
import type { DraftConnection } from '../types';

export const CONNECTION_ID_PARAM = 'jr-connection-id';
export const CONNECTION_CLASS_PARAM = 'jr-connection-class';
export const CONNECTION_HANDLERS_PARAM = 'jr-connection-handlers';
export const NODE_ID_ATTRIBUTE = 'data-node-id';
export const DEFAULT_PORT_ID = 'default';

type ConnectionInfo = ConnectionEstablishedParams<Element> | ConnectionDetachedParams<Element>;

export const flattenConnections = (instance: BrowserJsPlumbInstance): Connection[] => {
  const jp = instance as unknown as { getConnections?: (options?: unknown, flat?: boolean) => Connection[] };
  const connections = jp.getConnections ? jp.getConnections({}, true) : [];
  return Array.isArray(connections) ? connections : [];
};

export const getEndpointUuid = (nodeId: string, portId?: string) => `${nodeId}:${portId ?? DEFAULT_PORT_ID}`;

export const isSameUuid = (conn: Connection, source: string, target: string) => {
  const [currentSource, currentTarget] = conn.getUuids();
  return currentSource === source && currentTarget === target;
};

export const toDraftConnection = (info: ConnectionInfo): DraftConnection | null => {
  const sourcePortId = info.sourceEndpoint?.portId ?? undefined;
  const targetPortId = info.targetEndpoint?.portId ?? undefined;
  const sourceElement = info.sourceEndpoint?.element as HTMLElement | undefined;
  const targetElement = info.targetEndpoint?.element as HTMLElement | undefined;
  const sourceNode = sourceElement?.closest('.jr-node') as HTMLElement | null;
  const targetNode = targetElement?.closest('.jr-node') as HTMLElement | null;
  const sourceNodeId = sourceNode?.getAttribute(NODE_ID_ATTRIBUTE);
  const targetNodeId = targetNode?.getAttribute(NODE_ID_ATTRIBUTE);
  if (!sourceNodeId || !targetNodeId) {
    return null;
  }
  return {
    source: { nodeId: sourceNodeId, portId: sourcePortId === DEFAULT_PORT_ID ? undefined : sourcePortId },
    target: { nodeId: targetNodeId, portId: targetPortId === DEFAULT_PORT_ID ? undefined : targetPortId }
  };
};

export const getConnectionParameter = (connection: Connection, key: string) => {
  const withMethods = connection as unknown as {
    getParameter?: (name: string) => unknown;
    parameters?: Record<string, unknown>;
  };
  if (withMethods.getParameter) {
    return withMethods.getParameter(key);
  }
  return withMethods.parameters?.[key];
};

export const setConnectionParameter = (connection: Connection, key: string, value: unknown) => {
  const withMethods = connection as unknown as {
    setParameter?: (name: string, value: unknown) => void;
    parameters?: Record<string, unknown>;
  };
  if (withMethods.setParameter) {
    withMethods.setParameter(key, value);
  } else {
    if (!withMethods.parameters) {
      withMethods.parameters = {};
    }
    withMethods.parameters[key] = value;
  }
};
