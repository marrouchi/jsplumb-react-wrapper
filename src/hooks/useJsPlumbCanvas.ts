import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type React from 'react';
import { BrowserJsPlumbInstance, EVENT_DRAG_STOP, newInstance } from '@jsplumb/community';
import type { DragStopEventParams } from '@jsplumb/community/types/browser-ui/drag-manager';
import {
  EVENT_CLICK,
  EVENT_CONNECTION,
  EVENT_CONNECTION_DETACHED,
  EVENT_DBL_CLICK,
  EVENT_MOUSEENTER,
  EVENT_MOUSEEXIT,
  Connection,
  Endpoint
} from '@jsplumb/core';
import type { CanvasSelection, DraftConnection, FlowConnection, FlowNode, NodePort } from '../types';
import { uniqueList } from '../utils/array';
import {
  CONNECTION_CLASS_PARAM,
  CONNECTION_HANDLERS_PARAM,
  CONNECTION_ID_PARAM,
  DEFAULT_PORT_ID,
  NODE_ID_ATTRIBUTE,
  flattenConnections,
  getConnectionParameter,
  getEndpointUuid,
  isSameUuid,
  setConnectionParameter,
  toDraftConnection
} from '../utils/jsPlumbHelpers';

interface UseJsPlumbCanvasOptions<TNodeData, TConnectionData> {
  graphRef: React.RefObject<HTMLDivElement | null>;
  nodes: FlowNode<TNodeData>[];
  connections: FlowConnection<TConnectionData>[];
  readonly: boolean;
  nodeRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  portRefs: React.MutableRefObject<Map<string, Map<string, HTMLElement>>>;
  instanceRef: React.MutableRefObject<BrowserJsPlumbInstance | null>;
  selection: CanvasSelection;
  selectionRef: React.MutableRefObject<CanvasSelection>;
  allowMultiSelectRef: React.MutableRefObject<boolean>;
  emitSelectionRef: React.MutableRefObject<(nodes: string[], connections: string[]) => void>;
  onLinkClickRef: React.MutableRefObject<((connection: FlowConnection<TConnectionData>, event: MouseEvent) => void) | undefined>;
  onLinkDoubleClickRef: React.MutableRefObject<((connection: FlowConnection<TConnectionData>, event: MouseEvent) => void) | undefined>;
  onDeleteLinkRef: React.MutableRefObject<((connection: FlowConnection<TConnectionData>) => void) | undefined>;
  onLinkCreateRef: React.MutableRefObject<((connection: DraftConnection) => boolean | void) | undefined>;
  onLinkDetachedRef: React.MutableRefObject<((connection: DraftConnection) => void) | undefined>;
  onNodePositionChangeRef: React.MutableRefObject<((nodeId: string, position: { x: number; y: number }) => void) | undefined>;
}

const useJsPlumbCanvas = <TNodeData, TConnectionData>({
  graphRef,
  nodes,
  connections,
  readonly,
  nodeRefs,
  portRefs,
  instanceRef,
  selection,
  selectionRef,
  allowMultiSelectRef,
  emitSelectionRef,
  onLinkClickRef,
  onLinkDoubleClickRef,
  onDeleteLinkRef,
  onLinkCreateRef,
  onLinkDetachedRef,
  onNodePositionChangeRef
}: UseJsPlumbCanvasOptions<TNodeData, TConnectionData>) => {
  const endpointMapRef = useRef(new Map<string, Endpoint>());
  const connectionMapRef = useRef(new Map<string, Connection>());
  const syncingRef = useRef(false);

  const attachConnectionHandlers = useCallback(
    (connection: Connection, data: FlowConnection<TConnectionData>) => {
      if (getConnectionParameter(connection, CONNECTION_HANDLERS_PARAM)) {
        return;
      }
      setConnectionParameter(connection, CONNECTION_HANDLERS_PARAM, true);
      connection.bind(EVENT_CLICK, (_conn: Connection, originalEvent?: MouseEvent) => {
        if (!originalEvent) {
          return;
        }
        const multi =
          allowMultiSelectRef.current &&
          (originalEvent.metaKey || originalEvent.ctrlKey || originalEvent.shiftKey);
        const currentConnections = new Set(selectionRef.current.connections);
        if (multi) {
          if (currentConnections.has(data.id)) {
            currentConnections.delete(data.id);
          } else {
            currentConnections.add(data.id);
          }
        } else {
          currentConnections.clear();
          currentConnections.add(data.id);
        }
        const nextConnections = Array.from(currentConnections);
        const nextNodes = multi ? selectionRef.current.nodes : [];
        emitSelectionRef.current?.(uniqueList(nextNodes), uniqueList(nextConnections));
        onLinkClickRef.current?.(data, originalEvent);
      });

      connection.bind(EVENT_DBL_CLICK, (_conn: Connection, originalEvent?: MouseEvent) => {
        if (!originalEvent) {
          return;
        }
        onLinkDoubleClickRef.current?.(data, originalEvent);
      });

      connection.bind(EVENT_MOUSEENTER, () => {
        connection.addClass('jr-hover');
      });
      connection.bind(EVENT_MOUSEEXIT, () => {
        connection.removeClass('jr-hover');
      });
    },
    [allowMultiSelectRef, emitSelectionRef, onLinkClickRef, onLinkDoubleClickRef, selectionRef]
  );

  const ensureDeleteOverlay = useCallback(
    (connection: Connection, data: FlowConnection<TConnectionData>) => {
      const overlayId = `delete-${data.id}`;
      if (!connection.getOverlay(overlayId)) {
        connection.addOverlay([
          'Custom',
          {
            id: overlayId,
            location: 0.5,
            cssClass: 'jr-connection-delete',
            create: () => {
              const button = document.createElement('button');
              button.type = 'button';
              button.className = 'jr-connection-delete-button';
              button.innerHTML = '&times;';
              button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (connectionMapRef.current.has(data.id)) {
                  onDeleteLinkRef.current?.(data);
                }
              });
              return button;
            }
          }
        ] as any);
      }
    },
    [onDeleteLinkRef]
  );

  const updateConnectionMetadata = useCallback(
    (connection: Connection, data: FlowConnection<TConnectionData>) => {
      setConnectionParameter(connection, CONNECTION_ID_PARAM, data.id);
      const previousClass = getConnectionParameter(connection, CONNECTION_CLASS_PARAM) as string | undefined;
      if (previousClass && previousClass !== data.className) {
        connection.removeClass(previousClass);
      }
      if (data.className) {
        connection.addClass(data.className);
      }
      setConnectionParameter(connection, CONNECTION_CLASS_PARAM, data.className ?? '');
      connection.setDetachable(data.editable !== false);
      connection.addClass('jr-connection');
      connection.removeClass('jr-selected');
      if (selection.connections.includes(data.id)) {
        connection.addClass('jr-selected');
      }
      connection.setLabel(data.label ?? '');
    },
    [selection.connections]
  );

  useEffect(() => {
    if (!graphRef.current) {
      return;
    }
    const instance = newInstance({
      container: graphRef.current,
      elementsDraggable: !readonly,
      dragOptions: { cursor: 'move' }
    });
    instanceRef.current = instance;
    const jp = instance as unknown as {
      bind?: (event: string, handler: (...args: any[]) => void) => void;
      deleteConnection?: (connection: Connection, params?: any) => void;
    };

    const dragStop = (params: DragStopEventParams) => {
      const element = params.el as HTMLElement;
      if (!element) {
        return;
      }
      const nodeId = element.getAttribute(NODE_ID_ATTRIBUTE);
      if (!nodeId) {
        return;
      }
      const [x, y] = params.finalPos;
      onNodePositionChangeRef.current?.(nodeId, { x, y });
    };

    jp.bind?.(EVENT_DRAG_STOP, dragStop);

    jp.bind?.(EVENT_CONNECTION, (info: any, originalEvent?: MouseEvent) => {
      if (syncingRef.current || !originalEvent) {
        return;
      }
      const draft = toDraftConnection(info);
      if (!draft) {
        return;
      }
      const result = onLinkCreateRef.current?.(draft);
      if (result === false) {
        jp.deleteConnection?.(info.connection, { fireEvent: false });
      }
    });

    jp.bind?.(EVENT_CONNECTION_DETACHED, (info: any) => {
      if (syncingRef.current) {
        return;
      }
      const draft = toDraftConnection(info);
      if (!draft) {
        return;
      }
      onLinkDetachedRef.current?.(draft);
    });

    return () => {
      instance.destroy();
      instanceRef.current = null;
      endpointMapRef.current.clear();
      connectionMapRef.current.clear();
    };
  }, [graphRef, onLinkCreateRef, onLinkDetachedRef, onNodePositionChangeRef, readonly]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) {
      return;
    }
    const jp = instance as unknown as {
      elementsDraggable?: boolean;
      setDraggable?: (el: Element, draggable: boolean) => void;
    };
    jp.elementsDraggable = !readonly;
    nodes.forEach((node) => {
      const element = nodeRefs.current.get(node.id);
      if (element) {
        jp.setDraggable?.(element, !(readonly || node.disableDrag));
      }
    });
  }, [nodeRefs, nodes, readonly]);

  useLayoutEffect(() => {
    const instance = instanceRef.current;
    if (!instance || !graphRef.current) {
      return;
    }
    const jp = instance as unknown as {
      batch?: (fn: () => void) => void;
      getManagedElements?: () => Record<string, { el: Element }>;
      unmanage?: (el: Element, removeElement?: boolean) => void;
      setDraggable?: (el: Element, draggable: boolean) => void;
      revalidate?: (el: Element) => void;
      manage?: (el: Element, internalId?: string, recalc?: boolean) => void;
    };
    syncingRef.current = true;
    try {
      jp.batch?.(() => {
        const managed = jp.getManagedElements ? jp.getManagedElements() : {};
        const validNodeIds = new Set(nodes.map((node) => node.id));
        Object.values(managed).forEach((entry) => {
          const element = (entry as { el?: Element }).el as HTMLElement | undefined;
          const nodeId = element?.getAttribute(NODE_ID_ATTRIBUTE);
          if (nodeId && !validNodeIds.has(nodeId)) {
            if (element) {
              jp.unmanage?.(element, false);
            }
          }
        });

        nodes.forEach((node) => {
          const element = nodeRefs.current.get(node.id);
          if (!element) {
            return;
          }
          element.setAttribute(NODE_ID_ATTRIBUTE, node.id);
          element.style.left = `${node.position.x}px`;
          element.style.top = `${node.position.y}px`;
          jp.manage?.(element, node.id, true);
          jp.setDraggable?.(element, !(readonly || node.disableDrag));
          jp.revalidate?.(element);
        });
      });
    } finally {
      syncingRef.current = false;
    }
  }, [graphRef, nodeRefs, nodes, readonly]);

  const synchronizeEndpoints = useCallback(() => {
    const instance = instanceRef.current;
    if (!instance) {
      return;
    }
    const jp = instance as unknown as {
      addEndpoint?: (el: Element, options: Record<string, unknown>) => Endpoint;
      deleteEndpoint?: (endpoint: Endpoint) => void;
    };
    const nextEndpoints = new Map<string, Endpoint>();
    nodes.forEach((node) => {
      const element = nodeRefs.current.get(node.id);
      if (!element) {
        return;
      }
      const ports = node.ports && node.ports.length > 0 ? node.ports : ([{ id: DEFAULT_PORT_ID }] as NodePort[]);
      ports.forEach((port) => {
        const uuid = getEndpointUuid(node.id, port.id);
        const portMap = portRefs.current.get(node.id);
        const portElement = portMap?.get(port.id) ?? element;
        if (!portElement) {
          return;
        }
        let endpoint = endpointMapRef.current.get(uuid);
        if (!endpoint) {
          endpoint = jp.addEndpoint?.(portElement, {
            uuid,
            anchor: port.anchor ?? 'AutoDefault',
            portId: port.id,
            isSource: port.mode !== 'target',
            isTarget: port.mode !== 'source',
            maxConnections: -1
          }) as Endpoint;
        } else {
          endpoint.setAnchor(port.anchor ?? 'AutoDefault');
          endpoint.isSource = port.mode !== 'target';
          endpoint.isTarget = port.mode !== 'source';
        }
        nextEndpoints.set(uuid, endpoint);
      });
    });

    endpointMapRef.current.forEach((endpoint, key) => {
      if (!nextEndpoints.has(key)) {
        jp.deleteEndpoint?.(endpoint);
      }
    });

    endpointMapRef.current = nextEndpoints;
  }, [instanceRef, nodeRefs, nodes, portRefs]);

  useLayoutEffect(() => {
    synchronizeEndpoints();
  }, [synchronizeEndpoints]);

  useLayoutEffect(() => {
    const instance = instanceRef.current;
    if (!instance) {
      return;
    }
    const jp = instance as unknown as {
      batch?: (fn: () => void) => void;
      deleteConnection?: (connection: Connection, params?: any) => void;
      connect?: (params: Record<string, unknown>) => Connection | undefined;
    };
    syncingRef.current = true;
    try {
      jp.batch?.(() => {
        const existing = new Map<string, Connection>();
        const byUuid = new Map<string, Connection>();
        flattenConnections(instance).forEach((connection) => {
          const identifier = getConnectionParameter(connection, CONNECTION_ID_PARAM) as string | undefined;
          if (identifier) {
            existing.set(identifier, connection);
          }
          const [sourceUuid, targetUuid] = connection.getUuids();
          byUuid.set(`${sourceUuid}|${targetUuid}`, connection);
        });

        connections.forEach((data) => {
          const sourceUuid = getEndpointUuid(data.source.nodeId, data.source.portId);
          const targetUuid = getEndpointUuid(data.target.nodeId, data.target.portId);
          const sourceEndpoint = endpointMapRef.current.get(sourceUuid);
          const targetEndpoint = endpointMapRef.current.get(targetUuid);
          if (!sourceEndpoint || !targetEndpoint) {
            return;
          }
          let connection = existing.get(data.id);
          if (connection && !isSameUuid(connection, sourceUuid, targetUuid)) {
            jp.deleteConnection?.(connection, { fireEvent: false });
            connectionMapRef.current.delete(data.id);
            connection = undefined;
          }

          if (!connection) {
            const key = `${sourceUuid}|${targetUuid}`;
            const reused = byUuid.get(key);
            if (reused) {
              connection = reused;
              byUuid.delete(key);
            }
          }

          if (!connection) {
            const newConnection = jp.connect?.({
              uuids: [sourceUuid, targetUuid],
              detachable: data.editable !== false,
              deleteEndpointsOnDetach: false
            }) as Connection | undefined;
            if (!newConnection) {
              return;
            }
            attachConnectionHandlers(newConnection, data);
            ensureDeleteOverlay(newConnection, data);
            connection = newConnection;
          } else {
            attachConnectionHandlers(connection, data);
            ensureDeleteOverlay(connection, data);
          }

          if (connection) {
            connectionMapRef.current.set(data.id, connection);
            updateConnectionMetadata(connection, data);
          }
          existing.delete(data.id);
        });

        existing.forEach((connection, id) => {
          jp.deleteConnection?.(connection, { fireEvent: false });
          connectionMapRef.current.delete(id);
        });
      });
    } finally {
      syncingRef.current = false;
    }
  }, [attachConnectionHandlers, connections, ensureDeleteOverlay, instanceRef, updateConnectionMetadata]);

  useEffect(() => {
    connectionMapRef.current.forEach((connection, id) => {
      if (selection.connections.includes(id)) {
        connection.addClass('jr-selected');
      } else {
        connection.removeClass('jr-selected');
      }
    });
  }, [selection.connections]);
};

export default useJsPlumbCanvas;
