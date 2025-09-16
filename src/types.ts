import type { AnchorSpec } from '@jsplumb/core';
import type { CSSProperties, ReactNode } from 'react';

export type PortMode = 'source' | 'target' | 'bidirectional';

export interface NodePort {
  id: string;
  label?: ReactNode;
  anchor?: AnchorSpec;
  mode?: PortMode;
  className?: string;
  style?: CSSProperties;
}

export interface FlowNode<TData = unknown> {
  id: string;
  position: { x: number; y: number };
  render: ReactNode | ((context: NodeRenderContext<TData>) => ReactNode);
  ports?: NodePort[];
  data?: TData;
  className?: string;
  style?: CSSProperties;
  disableDrag?: boolean;
}

export interface NodeRenderContext<TData> {
  node: FlowNode<TData>;
  selected: boolean;
  data?: TData;
}

export interface FlowConnection<TData = unknown> {
  id: string;
  source: { nodeId: string; portId?: string };
  target: { nodeId: string; portId?: string };
  data?: TData;
  label?: string;
  className?: string;
  editable?: boolean;
}

export interface DraftConnection {
  source: { nodeId: string; portId?: string };
  target: { nodeId: string; portId?: string };
}

export interface CanvasSelection {
  nodes: string[];
  connections: string[];
}

export interface FlowCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setZoom: (value: number) => void;
  getZoom: () => number;
  focusNode: (nodeId: string) => void;
}

export interface FlowCanvasProps<TNodeData = unknown, TConnectionData = unknown> {
  nodes: FlowNode<TNodeData>[];
  connections: FlowConnection<TConnectionData>[];
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
  zoomStep?: number;
  selectedNodes?: string[];
  selectedConnections?: string[];
  allowMultiSelect?: boolean;
  readonly?: boolean;
  className?: string;
  style?: CSSProperties;
  onNodeClick?: (node: FlowNode<TNodeData>, event: MouseEvent) => void;
  onNodeDoubleClick?: (node: FlowNode<TNodeData>, event: MouseEvent) => void;
  onNodePositionChange?: (nodeId: string, position: { x: number; y: number }) => void;
  onLinkClick?: (connection: FlowConnection<TConnectionData>, event: MouseEvent) => void;
  onLinkDoubleClick?: (connection: FlowConnection<TConnectionData>, event: MouseEvent) => void;
  onDeleteNode?: (node: FlowNode<TNodeData>) => void;
  onDeleteLink?: (connection: FlowConnection<TConnectionData>) => void;
  onLinkCreate?: (connection: DraftConnection) => boolean | void;
  onLinkDetached?: (connection: DraftConnection) => void;
  onSelectionChange?: (selection: CanvasSelection) => void;
  onCanvasClick?: (event: MouseEvent) => void;
}
