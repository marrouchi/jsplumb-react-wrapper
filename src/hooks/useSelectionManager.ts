import { useCallback, useMemo, useState } from 'react';
import type React from 'react';
import type { CanvasSelection } from '../types';
import { uniqueList } from '../utils/array';
import useLatest from './useLatest';

interface UseSelectionManagerOptions {
  selectedNodes?: string[];
  selectedConnections?: string[];
  allowMultiSelect: boolean;
  onSelectionChange?: (selection: CanvasSelection) => void;
}

const useSelectionManager = ({
  selectedNodes,
  selectedConnections,
  allowMultiSelect,
  onSelectionChange
}: UseSelectionManagerOptions) => {
  const [internalSelection, setInternalSelection] = useState<CanvasSelection>({ nodes: [], connections: [] });

  const allowMultiSelectRef = useLatest(allowMultiSelect);
  const onSelectionChangeRef = useLatest(onSelectionChange);

  const selection = useMemo<CanvasSelection>(
    () => ({
      nodes: selectedNodes ?? internalSelection.nodes,
      connections: selectedConnections ?? internalSelection.connections
    }),
    [internalSelection.connections, internalSelection.nodes, selectedConnections, selectedNodes]
  );

  const selectionRef = useLatest(selection);

  const emitSelection = useCallback(
    (nextNodes: string[], nextConnections: string[]) => {
      setInternalSelection((previous) => ({
        nodes: selectedNodes === undefined ? nextNodes : previous.nodes,
        connections: selectedConnections === undefined ? nextConnections : previous.connections
      }));
      const finalSelection: CanvasSelection = {
        nodes: selectedNodes ?? nextNodes,
        connections: selectedConnections ?? nextConnections
      };
      onSelectionChangeRef.current?.(finalSelection);
    },
    [onSelectionChangeRef, selectedConnections, selectedNodes]
  );

  const emitSelectionRef = useLatest(emitSelection);

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
    [allowMultiSelectRef, emitSelection, selectionRef]
  );

  const clearSelection = useCallback(() => {
    emitSelection([], []);
  }, [emitSelection]);

  return {
    selection,
    emitSelection,
    emitSelectionRef,
    selectionRef,
    allowMultiSelectRef,
    updateNodeSelection,
    clearSelection
  };
};

export default useSelectionManager;
