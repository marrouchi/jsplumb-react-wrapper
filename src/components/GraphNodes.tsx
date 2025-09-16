import type React from 'react';
import type { FlowNode, NodePort } from '../types';
import { DEFAULT_PORT_ID } from '../utils/jsPlumbHelpers';

interface GraphNodesProps<TNodeData> {
  nodes: FlowNode<TNodeData>[];
  selectedNodeIds: string[];
  registerNode: (nodeId: string, element: HTMLDivElement | null) => void;
  registerPort: (nodeId: string, portId: string, element: HTMLElement | null) => void;
  onNodeClick: (node: FlowNode<TNodeData>, event: React.MouseEvent<HTMLDivElement>) => void;
  onNodeDoubleClick: (node: FlowNode<TNodeData>, event: React.MouseEvent<HTMLDivElement>) => void;
  onDeleteNode: (node: FlowNode<TNodeData>, event: React.MouseEvent<HTMLButtonElement>) => void;
}

const GraphNodes = <TNodeData,>({
  nodes,
  selectedNodeIds,
  registerNode,
  registerPort,
  onNodeClick,
  onNodeDoubleClick,
  onDeleteNode
}: GraphNodesProps<TNodeData>) => (
  <>
    {nodes.map((node) => {
      const ports = node.ports && node.ports.length > 0 ? node.ports : ([{ id: DEFAULT_PORT_ID }] as NodePort[]);
      const selected = selectedNodeIds.includes(node.id);
      const content =
        typeof node.render === 'function'
          ? node.render({ node, selected, data: node.data })
          : node.render;
      return (
        <div
          key={node.id}
          ref={(element) => registerNode(node.id, element)}
          className={['jr-node', node.className, selected ? 'jr-selected' : null].filter(Boolean).join(' ')}
          style={node.style}
          onClick={(event) => onNodeClick(node, event)}
          onDoubleClick={(event) => onNodeDoubleClick(node, event)}
        >
          <div className="jr-node-body">{content}</div>
          <button type="button" className="jr-node-delete" onClick={(event) => onDeleteNode(node, event)}>
            &times;
          </button>
          {ports.map((port) => (
            <div
              key={port.id}
              ref={(element) => registerPort(node.id, port.id, element)}
              className={['jr-port', port.className, `jr-port-${port.mode ?? 'bidirectional'}`].filter(Boolean).join(' ')}
              data-port-id={port.id}
              style={port.style}
            >
              {port.label}
            </div>
          ))}
        </div>
      );
    })}
  </>
);

export default GraphNodes;
