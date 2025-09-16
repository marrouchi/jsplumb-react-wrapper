import { useMemo, useRef, useState } from 'react';
import {
  FlowCanvas,
  FlowCanvasHandle,
  FlowConnection,
  FlowNode,
  DraftConnection,
  CanvasSelection
} from '..';
import './app.css';

const initialNodes: FlowNode[] = [
  {
    id: 'capture',
    position: { x: 140, y: 160 },
    render: ({ selected }) => (
      <div className="node-content">
        <h3>Capture Input</h3>
        <p>Validate customer form data before processing.</p>
        {selected && <span className="node-pill">Selected</span>}
      </div>
    ),
    ports: [
      { id: 'out', label: '→', mode: 'source' }
    ]
  },
  {
    id: 'enrich',
    position: { x: 440, y: 80 },
    render: () => (
      <div className="node-content">
        <h3>Enrich Profile</h3>
        <p>Fetch CRM attributes and compute risk score.</p>
      </div>
    ),
    ports: [
      { id: 'in', label: '←', mode: 'target', style: { left: '-8px', right: 'auto', transform: 'translate(-50%, -50%)' } },
      { id: 'out', label: '→', mode: 'source' }
    ]
  },
  {
    id: 'decision',
    position: { x: 720, y: 240 },
    render: ({ node }) => (
      <div className="node-content">
        <h3>Decision</h3>
        <p>Route customers into nurture or upsell track.</p>
        <span className="node-pill">{node.data?.segment ?? 'Nurture'}</span>
      </div>
    ),
    data: { segment: 'Upsell' },
    ports: [
      { id: 'in', label: '←', mode: 'target', style: { left: '-8px', right: 'auto', transform: 'translate(-50%, -50%)' } },
      { id: 'positive', label: '+', mode: 'source', style: { bottom: '-8px', top: 'auto', right: '50%', transform: 'translate(50%, 50%)' } },
      { id: 'negative', label: '-', mode: 'source', style: { top: '-8px', right: '50%', transform: 'translate(50%, -50%)' } }
    ]
  },
  {
    id: 'email',
    position: { x: 480, y: 360 },
    render: () => (
      <div className="node-content">
        <h3>Email Journey</h3>
        <p>Send onboarding sequence and collect engagement data.</p>
      </div>
    ),
    ports: [
      { id: 'in', label: '←', mode: 'target', style: { left: '-8px', right: 'auto', transform: 'translate(-50%, -50%)' } }
    ]
  }
];

const initialConnections: FlowConnection[] = [
  { id: 'edge-1', source: { nodeId: 'capture', portId: 'out' }, target: { nodeId: 'enrich', portId: 'in' }, label: 'Validate' },
  { id: 'edge-2', source: { nodeId: 'enrich', portId: 'out' }, target: { nodeId: 'decision', portId: 'in' }, label: 'Score' },
  { id: 'edge-3', source: { nodeId: 'decision', portId: 'positive' }, target: { nodeId: 'email', portId: 'in' }, label: 'Campaign' }
];

const matchesDraft = (connection: FlowConnection, draft: DraftConnection) => {
  const normalize = (endpoint: DraftConnection['source']) => `${endpoint.nodeId}:${endpoint.portId ?? 'default'}`;
  return (
    normalize(connection.source) === normalize(draft.source) &&
    normalize(connection.target) === normalize(draft.target)
  );
};

const App = () => {
  const canvasRef = useRef<FlowCanvasHandle | null>(null);
  const [nodes, setNodes] = useState<FlowNode[]>(initialNodes);
  const [connections, setConnections] = useState<FlowConnection[]>(initialConnections);
  const [selection, setSelection] = useState<CanvasSelection>({ nodes: [], connections: [] });
  const [logs, setLogs] = useState<string[]>([]);
  const connectionCounter = useRef(initialConnections.length + 1);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((previous) => [`[${timestamp}] ${message}`, ...previous].slice(0, 12));
  };

  const handleNodePositionChange = (nodeId: string, position: { x: number; y: number }) => {
    setNodes((previous) =>
      previous.map((node) => (node.id === nodeId ? { ...node, position } : node))
    );
    addLog(`Node ${nodeId} moved to (${Math.round(position.x)}, ${Math.round(position.y)})`);
  };

  const handleDeleteNode = (node: FlowNode) => {
    setNodes((previous) => previous.filter((item) => item.id !== node.id));
    setConnections((previous) =>
      previous.filter(
        (connection) =>
          connection.source.nodeId !== node.id && connection.target.nodeId !== node.id
      )
    );
    addLog(`Removed node ${node.id}`);
  };

  const handleDeleteLink = (connection: FlowConnection) => {
    setConnections((previous) => previous.filter((item) => item.id !== connection.id));
    addLog(`Removed link ${connection.id}`);
  };

  const handleLinkCreate = (draft: DraftConnection) => {
    const id = `edge-${connectionCounter.current++}`;
    setConnections((previous) => [
      ...previous,
      { id, source: draft.source, target: draft.target, label: 'New link' }
    ]);
    addLog(`Created link ${id}`);
    return true;
  };

  const handleLinkDetached = (draft: DraftConnection) => {
    setConnections((previous) => previous.filter((connection) => !matchesDraft(connection, draft)));
    addLog(`Detached link from ${draft.source.nodeId} to ${draft.target.nodeId}`);
  };

  const focusOnSelection = () => {
    const targetId = selection.nodes[0];
    if (targetId) {
      canvasRef.current?.focusNode(targetId);
    }
  };

  const selectedSummary = useMemo(() => {
    if (selection.nodes.length === 0 && selection.connections.length === 0) {
      return 'Nothing selected';
    }
    const nodePart = selection.nodes.length > 0 ? `Nodes: ${selection.nodes.join(', ')}` : '';
    const connectionPart = selection.connections.length > 0 ? `Links: ${selection.connections.join(', ')}` : '';
    return [nodePart, connectionPart].filter(Boolean).join(' | ');
  }, [selection]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h2>jsPlumb React Wrapper</h2>
        <p className="subtitle">
          Drag nodes, create connections and interact with the canvas to explore the API.
        </p>
        <div className="controls">
          <button type="button" onClick={() => canvasRef.current?.zoomIn()}>Zoom in</button>
          <button type="button" onClick={() => canvasRef.current?.zoomOut()}>Zoom out</button>
          <button type="button" onClick={() => canvasRef.current?.resetZoom()}>Reset view</button>
          <button type="button" onClick={focusOnSelection} disabled={selection.nodes.length === 0}>
            Focus selected node
          </button>
        </div>
        <div className="status-card">
          <h3>Selection</h3>
          <p>{selectedSummary}</p>
        </div>
        <div className="log-panel">
          <h3>Activity</h3>
          <div className="log-entries">
            {logs.map((entry, index) => (
              <div key={index} className="log-entry">
                {entry}
              </div>
            ))}
          </div>
        </div>
      </aside>
      <main className="canvas-panel">
        <FlowCanvas
          ref={canvasRef}
          nodes={nodes}
          connections={connections}
          onNodePositionChange={handleNodePositionChange}
          onDeleteNode={handleDeleteNode}
          onDeleteLink={handleDeleteLink}
          onLinkCreate={handleLinkCreate}
          onLinkDetached={handleLinkDetached}
          onSelectionChange={setSelection}
          onNodeClick={(node) => addLog(`Clicked node ${node.id}`)}
          onNodeDoubleClick={(node) => addLog(`Double-clicked node ${node.id}`)}
          onLinkClick={(connection) => addLog(`Clicked link ${connection.id}`)}
          onLinkDoubleClick={(connection) => addLog(`Double-clicked link ${connection.id}`)}
        />
      </main>
    </div>
  );
};

export default App;
