# jsplumb-react-wrapper

A React + TypeScript wrapper around the [@jsplumb/community](https://www.jsplumb.org/) library that exposes a declarative API for building node/link diagrams. It provides helpers for rendering custom React nodes, managing ports, creating connections and tracking selection, while keeping full control in React state.

## Features

- Render nodes with arbitrary React JSX layouts and custom metadata.
- Support for multiple ports per node with source/target/bidirectional modes.
- Drag nodes, create links, detach links and receive callbacks for user actions.
- Built-in multi-selection for nodes and links (Cmd/Ctrl/Shift click).
- Zoom, pan and programmatic focus helpers exposed through a React ref.
- Hover actions with delete buttons for nodes and links using pure CSS.
- Event callbacks for click, double click, creation and deletion.
- TypeScript definitions for all public APIs.
- Playground powered by Vite (`npm run dev`) using fake data.

## Getting started

Install peer dependencies and the package:

```bash
npm install react react-dom @jsplumb/community jsplumb-react-wrapper
```

Render a canvas by providing nodes and connections:

```tsx
import { FlowCanvas, type FlowNode, type FlowConnection } from 'jsplumb-react-wrapper';

const nodes: FlowNode[] = [
  {
    id: 'node-a',
    position: { x: 120, y: 160 },
    render: ({ selected }) => (
      <div>
        <h3>API Request</h3>
        {selected && <strong>Selected</strong>}
      </div>
    ),
    ports: [{ id: 'out', mode: 'source', label: '→' }]
  },
  {
    id: 'node-b',
    position: { x: 420, y: 160 },
    render: <h3>Process</h3>,
    ports: [{ id: 'in', mode: 'target', label: '←' }]
  }
];

const connections: FlowConnection[] = [
  { id: 'edge-1', source: { nodeId: 'node-a', portId: 'out' }, target: { nodeId: 'node-b', portId: 'in' } }
];

<FlowCanvas nodes={nodes} connections={connections} />;
```

## Development

- `npm run dev` – starts the Vite playground with a sample flow editor.
- `npm run build` – generates TypeScript declarations and the library bundle (Vite library mode).

The playground is located under `src/dev` and demonstrates how to wire the callbacks to maintain state entirely in React.

## License

MIT
