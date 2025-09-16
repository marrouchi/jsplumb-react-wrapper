import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type React from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { BrowserJsPlumbInstance, EVENT_DRAG_STOP, newInstance } from '@jsplumb/community';
import type { DragStopEventParams } from '@jsplumb/community/types/browser-ui/drag-manager';
import {
  EVENT_CONNECTION,
  EVENT_CONNECTION_DETACHED,
  EVENT_DBL_CLICK,
  EVENT_MOUSEENTER,
  EVENT_MOUSEEXIT,
  EVENT_CLICK,
  Connection,
  ConnectionEstablishedParams,
  ConnectionDetachedParams,
  Endpoint
} from '@jsplumb/core';
import {
  CanvasSelection,
  DraftConnection,
  FlowCanvasHandle,
  FlowCanvasProps,
  FlowConnection,
  FlowNode,
  NodePort
} from '../types';
import '../styles/graph.css';

const CONNECTION_ID_PARAM = 'jr-connection-id';
const CONNECTION_CLASS_PARAM = 'jr-connection-class';
const CONNECTION_HANDLERS_PARAM = 'jr-connection-handlers';
const NODE_ID_ATTRIBUTE = 'data-node-id';
const DEFAULT_PORT_ID = 'default';

const flattenConnections = (instance: BrowserJsPlumbInstance): Connection[] => {
  const jp = instance as unknown as { getConnections?: (options?: unknown, flat?: boolean) => Connection[] };
  const connections = jp.getConnections ? jp.getConnections({}, true) : [];
  return Array.isArray(connections) ? connections : [];
};

const getEndpointUuid = (nodeId: string, portId?: string) => `${nodeId}:${portId ?? DEFAULT_PORT_ID}`;

const isSameUuid = (conn: Connection, source: string, target: string) => {
  const [currentSource, currentTarget] = conn.getUuids();
  return currentSource === source && currentTarget === target;
};

const uniqueList = (values: string[]) => Array.from(new Set(values));

const toDraftConnection = (info: ConnectionEstablishedParams<Element>): DraftConnection | null => {
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

const getConnectionParameter = (connection: Connection, key: string) => {
  const withMethods = connection as unknown as {
    getParameter?: (name: string) => unknown;
    parameters?: Record<string, unknown>;
  };
  if (withMethods.getParameter) {
    return withMethods.getParameter(key);
  }
  return withMethods.parameters?.[key];
};

const setConnectionParameter = (connection: Connection, key: string, value: unknown) => {
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

const FlowCanvas = forwardRef<FlowCanvasHandle, FlowCanvasProps>((props, ref) => {
  const {
    nodes,
    connections,
    zoom: zoomProp,
    minZoom = 0.25,
    maxZoom = 2,
    zoomStep = 0.1,
    selectedNodes: selectedNodesProp,
    selectedConnections: selectedConnectionsProp,
    allowMultiSelect = true,
    readonly = false,
    className,
    style,
    onNodeClick,
    onNodeDoubleClick,
    onNodePositionChange,
    onLinkClick,
    onLinkDoubleClick,
    onDeleteNode,
    onDeleteLink,
    onLinkCreate,
    onLinkDetached,
    onSelectionChange,
    onCanvasClick
  } = props;

  const [internalSelection, setInternalSelection] = useState<CanvasSelection>({ nodes: [], connections: [] });
  const [zoomState, setZoomState] = useState(zoomProp ?? 1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<BrowserJsPlumbInstance | null>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const portRefs = useRef<Map<string, Map<string, HTMLElement>>>(new Map());
  const endpointMapRef = useRef<Map<string, Endpoint>>(new Map());
  const connectionMapRef = useRef<Map<string, Connection>>(new Map());
  const syncingRef = useRef(false);

  const panStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);

  const selection: CanvasSelection = useMemo(
    () => ({
      nodes: selectedNodesProp ?? internalSelection.nodes,
      connections: selectedConnectionsProp ?? internalSelection.connections
    }),
    [internalSelection.connections, internalSelection.nodes, selectedConnectionsProp, selectedNodesProp]
  );

  const zoomRef = useRef(zoomState);
  const panRef = useRef(pan);
  const allowMultiSelectRef = useRef(allowMultiSelect);
  const selectionRef = useRef(selection);
  const onNodeClickRef = useRef(onNodeClick);
  const onNodeDoubleClickRef = useRef(onNodeDoubleClick);
  const onNodePositionChangeRef = useRef(onNodePositionChange);
  const onLinkClickRef = useRef(onLinkClick);
  const onLinkDoubleClickRef = useRef(onLinkDoubleClick);
  const onDeleteNodeRef = useRef(onDeleteNode);
  const onDeleteLinkRef = useRef(onDeleteLink);
  const onLinkCreateRef = useRef(onLinkCreate);
  const onLinkDetachedRef = useRef(onLinkDetached);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onCanvasClickRef = useRef(onCanvasClick);

  useEffect(() => {
    zoomRef.current = zoomState;
  }, [zoomState]);

  useEffect(() => {
    panRef.current = pan;
    if (surfaceRef.current) {
      surfaceRef.current.style.transform = `translate(${pan.x}px, ${pan.y}px)`;
    }
  }, [pan]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    allowMultiSelectRef.current = allowMultiSelect;
  }, [allowMultiSelect]);

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);
  useEffect(() => {
    onNodeDoubleClickRef.current = onNodeDoubleClick;
  }, [onNodeDoubleClick]);
  useEffect(() => {
    onNodePositionChangeRef.current = onNodePositionChange;
  }, [onNodePositionChange]);
  useEffect(() => {
    onLinkClickRef.current = onLinkClick;
  }, [onLinkClick]);
  useEffect(() => {
    onLinkDoubleClickRef.current = onLinkDoubleClick;
  }, [onLinkDoubleClick]);
  useEffect(() => {
    onDeleteNodeRef.current = onDeleteNode;
  }, [onDeleteNode]);
  useEffect(() => {
    onDeleteLinkRef.current = onDeleteLink;
  }, [onDeleteLink]);
  useEffect(() => {
    onLinkCreateRef.current = onLinkCreate;
  }, [onLinkCreate]);
  useEffect(() => {
    onLinkDetachedRef.current = onLinkDetached;
  }, [onLinkDetached]);
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);
  useEffect(() => {
    onCanvasClickRef.current = onCanvasClick;
  }, [onCanvasClick]);

  const clampZoom = useCallback(
    (value: number) => Math.min(maxZoom, Math.max(minZoom, value)),
    [maxZoom, minZoom]
  );

  const setZoomInternal = useCallback(
    (value: number) => {
      const clamped = clampZoom(value);
      setZoomState((current) => {
        if (current === clamped) {
          return current;
        }
        return clamped;
      });
      zoomRef.current = clamped;
      if (instanceRef.current) {
        const jp = instanceRef.current as unknown as { setZoom?: (zoom: number, repaint?: boolean) => void };
        jp.setZoom?.(clamped, true);
      }
      return clamped;
    },
    [clampZoom]
  );

  useEffect(() => {
    if (typeof zoomProp === 'number') {
      setZoomInternal(zoomProp);
    }
  }, [setZoomInternal, zoomProp]);

  const emitSelection = useCallback(
    (nextNodes: string[], nextConnections: string[]) => {
      setInternalSelection((previous) => ({
        nodes: selectedNodesProp === undefined ? nextNodes : previous.nodes,
        connections: selectedConnectionsProp === undefined ? nextConnections : previous.connections
      }));
      const finalSelection: CanvasSelection = {
        nodes: selectedNodesProp ?? nextNodes,
        connections: selectedConnectionsProp ?? nextConnections
      };
      onSelectionChangeRef.current?.(finalSelection);
    },
    [selectedConnectionsProp, selectedNodesProp]
  );

  const handlePanMove = useCallback((event: MouseEvent) => {
    const start = panStartRef.current;
    if (!start) {
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    setPan({ x: start.originX + dx, y: start.originY + dy });
  }, []);

  const handlePanEnd = useCallback(() => {
    panStartRef.current = null;
    window.removeEventListener('mousemove', handlePanMove);
    window.removeEventListener('mouseup', handlePanEnd);
  }, [handlePanMove]);

  const handleCanvasMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      const target = event.target as HTMLElement;
      if (target.closest('.jr-node') || target.closest('.jr-port') || target.closest('.jr-connection-delete-button')) {
        return;
      }
      event.preventDefault();
      panStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        originX: panRef.current.x,
        originY: panRef.current.y
      };
      window.addEventListener('mousemove', handlePanMove);
      window.addEventListener('mouseup', handlePanEnd);
    },
    [handlePanEnd, handlePanMove]
  );

  useEffect(() => () => {
    window.removeEventListener('mousemove', handlePanMove);
    window.removeEventListener('mouseup', handlePanEnd);
  }, [handlePanEnd, handlePanMove]);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!canvasRef.current) {
        return;
      }
      const zoomModifier = event.ctrlKey || event.metaKey;
      if (!zoomModifier) {
        return;
      }
      event.preventDefault();
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const pointerX = event.clientX - canvasRect.left;
      const pointerY = event.clientY - canvasRect.top;
      const graphX = (pointerX - panRef.current.x) / zoomRef.current;
      const graphY = (pointerY - panRef.current.y) / zoomRef.current;
      const direction = event.deltaY > 0 ? -1 : 1;
      const nextZoom = setZoomInternal(zoomRef.current + direction * zoomStep);
      const nextPanX = pointerX - graphX * nextZoom;
      const nextPanY = pointerY - graphY * nextZoom;
      setPan({ x: nextPanX, y: nextPanY });
    },
    [setZoomInternal, zoomStep]
  );

  const updateNodeSelection = useCallback(
    (nodeId: string, event: React.MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      const multi = allowMultiSelectRef.current && (event.metaKey || event.ctrlKey || event.shiftKey);
      const currentNodes = new Set(selectionRef.current.nodes);
      let nextNodes: string[];
      if (multi) {
        if (currentNodes.has(nodeId)) {
          currentNodes.delete(nodeId);
        } else {
          currentNodes.add(nodeId);
        }
        nextNodes = Array.from(currentNodes);
      } else {
        nextNodes = [nodeId];
      }
      const nextConnections = multi ? selectionRef.current.connections : [];
      emitSelection(uniqueList(nextNodes), uniqueList(nextConnections));
    },
    [emitSelection]
  );

  const setSelectionRef = useRef(emitSelection);
  useEffect(() => {
    setSelectionRef.current = emitSelection;
  }, [emitSelection]);

  const attachConnectionHandlers = useCallback(
    (connection: Connection, data: FlowConnection) => {
      if (getConnectionParameter(connection, CONNECTION_HANDLERS_PARAM)) {
        return;
      }
      setConnectionParameter(connection, CONNECTION_HANDLERS_PARAM, true);
      connection.bind(EVENT_CLICK, (conn: Connection, originalEvent?: MouseEvent) => {
        if (!originalEvent) {
          return;
        }
        const multi = allowMultiSelectRef.current && (originalEvent.metaKey || originalEvent.ctrlKey || originalEvent.shiftKey);
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
        setSelectionRef.current?.(uniqueList(nextNodes), uniqueList(nextConnections));
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
    []
  );

  const ensureDeleteOverlay = useCallback(
    (connection: Connection, data: FlowConnection) => {
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
                const connectionData = connectionMapRef.current.get(data.id);
                if (connectionData) {
                  onDeleteLinkRef.current?.(data);
                }
              });
              return button;
            }
          }
        ] as any);
      }
    },
    []
  );

  const updateConnectionMetadata = useCallback(
    (connection: Connection, data: FlowConnection) => {
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

    jp.bind?.(EVENT_CONNECTION, (info: ConnectionEstablishedParams<Element>, originalEvent?: MouseEvent) => {
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

    jp.bind?.(EVENT_CONNECTION_DETACHED, (info: ConnectionDetachedParams<Element>) => {
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
  }, [readonly]);

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
  }, [nodes, readonly]);

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
  }, [nodes, readonly]);

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
  }, [nodes]);

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
  }, [attachConnectionHandlers, connections, ensureDeleteOverlay, updateConnectionMetadata]);

  useEffect(() => {
    connectionMapRef.current.forEach((connection, id) => {
      if (selection.connections.includes(id)) {
        connection.addClass('jr-selected');
      } else {
        connection.removeClass('jr-selected');
      }
    });
  }, [selection.connections]);

  useEffect(() => {
    nodes.forEach((node) => {
      const element = nodeRefs.current.get(node.id);
      if (!element) {
        return;
      }
      if (selection.nodes.includes(node.id)) {
        element.classList.add('jr-selected');
      } else {
        element.classList.remove('jr-selected');
      }
    });
  }, [nodes, selection.nodes]);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => setZoomInternal(zoomRef.current + zoomStep),
      zoomOut: () => setZoomInternal(zoomRef.current - zoomStep),
      resetZoom: () => {
        setPan({ x: 0, y: 0 });
        setZoomInternal(1);
      },
      setZoom: (value: number) => {
        setZoomInternal(value);
      },
      getZoom: () => zoomRef.current,
      focusNode: (nodeId: string) => {
        const node = nodes.find((entry) => entry.id === nodeId);
        const element = nodeRefs.current.get(nodeId);
        if (!node || !element || !canvasRef.current) {
          return;
        }
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        const width = rect.width / zoomRef.current;
        const height = rect.height / zoomRef.current;
        const centerX = (node.position.x + width / 2) * zoomRef.current;
        const centerY = (node.position.y + height / 2) * zoomRef.current;
        const nextPanX = canvasRect.width / 2 - centerX;
        const nextPanY = canvasRect.height / 2 - centerY;
        setPan({ x: nextPanX, y: nextPanY });
      }
    }),
    [nodes, setZoomInternal, zoomStep]
  );

  const handleNodeClick = useCallback(
    (node: FlowNode, event: React.MouseEvent<HTMLDivElement>) => {
      updateNodeSelection(node.id, event);
      onNodeClickRef.current?.(node, event.nativeEvent);
    },
    [updateNodeSelection]
  );

  const handleNodeDoubleClick = useCallback((node: FlowNode, event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    onNodeDoubleClickRef.current?.(node, event.nativeEvent);
  }, []);

  const handleDeleteNode = useCallback((node: FlowNode, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onDeleteNodeRef.current?.(node);
  }, []);

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest('.jr-node') || target.closest('.jr-port') || target.closest('.jr-connection-delete-button')) {
        return;
      }
      emitSelection([], []);
      onCanvasClickRef.current?.(event.nativeEvent);
    },
    [emitSelection]
  );

  const registerNodeRef = useCallback((nodeId: string, element: HTMLDivElement | null) => {
    if (element) {
      nodeRefs.current.set(nodeId, element);
    } else {
      nodeRefs.current.delete(nodeId);
    }
  }, []);

  const registerPortRef = useCallback((nodeId: string, portId: string, element: HTMLElement | null) => {
    if (!portRefs.current.has(nodeId)) {
      portRefs.current.set(nodeId, new Map());
    }
    const map = portRefs.current.get(nodeId)!;
    if (element) {
      map.set(portId, element);
    } else {
      map.delete(portId);
    }
  }, []);

  return (
    <div
      ref={canvasRef}
      className={['jr-canvas', className].filter(Boolean).join(' ')}
      style={style}
      onMouseDown={handleCanvasMouseDown}
      onWheel={handleWheel}
      onClick={handleCanvasClick}
    >
      <div ref={surfaceRef} className="jr-surface">
        <div ref={graphRef} className="jr-graph">
          {nodes.map((node) => {
            const ports = node.ports && node.ports.length > 0 ? node.ports : ([{ id: DEFAULT_PORT_ID }] as NodePort[]);
            const content: ReactNode = typeof node.render === 'function'
              ? node.render({ node, selected: selection.nodes.includes(node.id), data: node.data })
              : node.render;
            return (
              <div
                key={node.id}
                ref={(element) => registerNodeRef(node.id, element)}
                className={['jr-node', node.className].filter(Boolean).join(' ')}
                style={node.style as CSSProperties}
                onClick={(event) => handleNodeClick(node, event)}
                onDoubleClick={(event) => handleNodeDoubleClick(node, event)}
              >
                <div className="jr-node-body">{content}</div>
                <button type="button" className="jr-node-delete" onClick={(event) => handleDeleteNode(node, event)}>
                  &times;
                </button>
                {ports.map((port) => (
                  <div
                    key={port.id}
                    ref={(element) => registerPortRef(node.id, port.id, element)}
                    className={['jr-port', port.className, `jr-port-${port.mode ?? 'bidirectional'}`]
                      .filter(Boolean)
                      .join(' ')}
                    data-port-id={port.id}
                    style={port.style as CSSProperties}
                  >
                    {port.label}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

FlowCanvas.displayName = 'FlowCanvas';

export default FlowCanvas;
