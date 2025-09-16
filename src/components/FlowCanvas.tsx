import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import type React from 'react';
import type { BrowserJsPlumbInstance } from '@jsplumb/community';
import GraphNodes from './GraphNodes';
import useJsPlumbCanvas from '../hooks/useJsPlumbCanvas';
import useLatest from '../hooks/useLatest';
import useNodeRegistry from '../hooks/useNodeRegistry';
import usePanZoom from '../hooks/usePanZoom';
import useSelectionManager from '../hooks/useSelectionManager';
import type { FlowCanvasHandle, FlowCanvasProps, FlowNode } from '../types';
import '../styles/graph.css';

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

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<BrowserJsPlumbInstance | null>(null);

  const onNodeClickRef = useLatest(onNodeClick);
  const onNodeDoubleClickRef = useLatest(onNodeDoubleClick);
  const onNodePositionChangeRef = useLatest(onNodePositionChange);
  const onLinkClickRef = useLatest(onLinkClick);
  const onLinkDoubleClickRef = useLatest(onLinkDoubleClick);
  const onDeleteNodeRef = useLatest(onDeleteNode);
  const onDeleteLinkRef = useLatest(onDeleteLink);
  const onLinkCreateRef = useLatest(onLinkCreate);
  const onLinkDetachedRef = useLatest(onLinkDetached);
  const onCanvasClickRef = useLatest(onCanvasClick);

  const {
    selection,
    emitSelectionRef,
    selectionRef,
    allowMultiSelectRef,
    updateNodeSelection,
    clearSelection
  } = useSelectionManager({
    selectedNodes: selectedNodesProp,
    selectedConnections: selectedConnectionsProp,
    allowMultiSelect,
    onSelectionChange
  });

  const { setZoom, zoomIn, zoomOut, resetZoom, zoomRef, setPan, handleWheel, handleCanvasMouseDown } = usePanZoom({
    canvasRef,
    surfaceRef,
    instanceRef,
    zoom: zoomProp,
    minZoom,
    maxZoom,
    zoomStep
  });

  const { nodeRefs, portRefs, registerNodeRef, registerPortRef } = useNodeRegistry();

  useJsPlumbCanvas({
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
  });

  const handleNodeClick = useCallback(
    (node: FlowNode, event: React.MouseEvent<HTMLDivElement>) => {
      updateNodeSelection(node.id, event);
      onNodeClickRef.current?.(node, event.nativeEvent);
    },
    [onNodeClickRef, updateNodeSelection]
  );

  const handleNodeDoubleClick = useCallback(
    (node: FlowNode, event: React.MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      onNodeDoubleClickRef.current?.(node, event.nativeEvent);
    },
    [onNodeDoubleClickRef]
  );

  const handleDeleteNode = useCallback(
    (node: FlowNode, event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onDeleteNodeRef.current?.(node);
    },
    [onDeleteNodeRef]
  );

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest('.jr-node') || target.closest('.jr-port') || target.closest('.jr-connection-delete-button')) {
        return;
      }
      clearSelection();
      onCanvasClickRef.current?.(event.nativeEvent);
    },
    [clearSelection, onCanvasClickRef]
  );

  useImperativeHandle(
    ref,
    () => ({
      zoomIn,
      zoomOut,
      resetZoom,
      setZoom: (value: number) => {
        setZoom(value);
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
    [nodes, nodeRefs, setPan, setZoom, zoomIn, zoomOut, resetZoom, zoomRef]
  );

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
          <GraphNodes
            nodes={nodes}
            selectedNodeIds={selection.nodes}
            registerNode={registerNodeRef}
            registerPort={registerPortRef}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onDeleteNode={handleDeleteNode}
          />
        </div>
      </div>
    </div>
  );
});

FlowCanvas.displayName = 'FlowCanvas';

export default FlowCanvas;
