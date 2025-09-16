import { useCallback, useRef } from 'react';

const useNodeRegistry = () => {
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  const portRefs = useRef(new Map<string, Map<string, HTMLElement>>());

  const registerNodeRef = useCallback((nodeId: string, element: HTMLDivElement | null) => {
    if (element) {
      nodeRefs.current.set(nodeId, element);
    } else {
      nodeRefs.current.delete(nodeId);
      portRefs.current.delete(nodeId);
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
      if (map.size === 0) {
        portRefs.current.delete(nodeId);
      }
    }
  }, []);

  return { nodeRefs, portRefs, registerNodeRef, registerPortRef };
};

export default useNodeRegistry;
