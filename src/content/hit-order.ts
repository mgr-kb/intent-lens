export function nextIndex(current: number, count: number, direction: 'next' | 'prev'): number {
 if (!count) return -1;
 if (current < 0 || current >= count) return direction === 'next' ? 0 : count - 1;
 return (current + (direction === 'next' ? 1 : -1) + count) % count;
}
export function documentOrder(elements: readonly Element[]): readonly Element[] {
 return elements.filter(element => element.isConnected).toSorted((a, b) => a === b ? 0 : a.compareDocumentPosition(b) & 4 ? -1 : 1);
}
