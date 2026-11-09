import type { WdfAdaptor, WdfElement, WdfModel } from './wdf';

export type WdfLayoutMode = 'ladder' | 'tree';
export type PortSide = 'left' | 'top' | 'right' | 'bottom';
type Size = { width: number; height: number };
export type LadderPlacement = {
  position: { x: number; y: number };
  /** Physical port order, independent of the adapted port and the root. */
  portSides: PortSide[];
};

/** Follow the unique source-to-load path, then place each section above it.
 * Resonators sit above their ladder adaptor, with their two elements beside them.
 * Neither placement nor port orientation depends on scattering/evaluation order.
 */
export function wdfLadderLayout(model: WdfModel, size: (id: string) => Size, gap = 100): Map<string, LadderPlacement> {
  const items = new Map<string, WdfAdaptor | WdfElement>([...model.adaptors, ...model.elements].map(item => [item.id, item]));
  const neighbors = (id: string) => {
    const item = items.get(id)!;
    return item.type === 'adaptor' ? item.ports.map(port => port.neighborId) : [item.parentId];
  };
  const path: string[] = [];
  function visit(id: string, parent?: string): boolean {
    path.push(id);
    if (id === 'load') return true;
    for (const next of neighbors(id)) if (next !== parent && visit(next, id)) return true;
    path.pop();
    return false;
  }
  visit('source');
  const main = new Set(path), placements = new Map<string, LadderPlacement>();
  const mainHeight = Math.max(...path.map(id => size(id).height));
  const branchHeight = Math.max(0, ...model.adaptors.filter(a => !main.has(a.id)).map(a => size(a.id).height),
    ...model.elements.filter(e => !main.has(e.id)).map(e => size(e.id).height));
  const branchY = -mainHeight / 2 - gap - branchHeight / 2;
  const place = (id: string, x: number, y: number, sides: PortSide[]) => {
    const { width, height } = size(id);
    placements.set(id, { position: { x: x - width / 2, y: y - height / 2 }, portSides: sides });
  };
  let cursor = 0;
  path.forEach((id, index) => {
    const item = items.get(id)!;
    const branch = item.type === 'adaptor' ? item.ports.find(port => !main.has(port.neighborId))?.neighborId : undefined;
    const branchItem = branch ? items.get(branch)! : undefined;
    const leaves = branchItem?.type === 'adaptor' ? branchItem.ports.filter(port => port.neighborId !== id).map(port => port.neighborId) : [];
    const left = leaves[0], right = leaves[1];
    const halfWidth = Math.max(size(id).width / 2, branch ? size(branch).width / 2 : 0);
    const leftWidth = halfWidth + (left ? gap + size(left).width : 0);
    const rightWidth = halfWidth + (right ? gap + size(right).width : 0);
    const x = cursor + leftWidth;
    place(id, x, 0, item.type === 'adaptor' ? item.ports.map(port => port.neighborId === path[index - 1] ? 'left'
      : port.neighborId === path[index + 1] ? 'right' : 'top') : [index === 0 ? 'right' : 'left']);
    if (branch && branchItem) {
      place(branch, x, branchY, branchItem.type === 'adaptor' ? branchItem.ports.map(port => port.neighborId === id ? 'bottom'
        : port.neighborId === left ? 'left' : 'right') : ['bottom']);
      if (left) place(left, x - size(branch).width / 2 - gap - size(left).width / 2, branchY, ['right']);
      if (right) place(right, x + size(branch).width / 2 + gap + size(right).width / 2, branchY, ['left']);
    }
    cursor = x + rightWidth + gap;
  });
  return placements;
}
