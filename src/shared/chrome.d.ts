// Narrow declarations for the Chrome 120+ APIs used here; no permissive `any` fallback.
declare namespace chrome {
 namespace action { const onClicked: { addListener(callback: (tab: tabs.Tab) => void): void }; }
 namespace runtime {
  const id: string;
  function getURL(path: string): string;
  interface MessageSender { readonly id?: string; readonly url?: string; readonly frameId?: number; readonly documentId?: string; readonly documentLifecycle?: string; readonly tab?: tabs.Tab }
  type MessageListener = (message: unknown, sender: MessageSender, respond: (response: unknown) => void) => boolean | void;
  const onMessage: { addListener(callback: MessageListener): void; removeListener(callback: MessageListener): void };
  function openOptionsPage(): Promise<void>;
  function sendMessage(message: unknown): Promise<unknown>;
 }
 namespace storage {
  interface Area { get(keys: string | readonly string[]): Promise<Record<string, unknown>>; set(value: object): Promise<void>; remove(key: string): Promise<void>; setAccessLevel(options: { accessLevel: 'TRUSTED_CONTEXTS' }): Promise<void> }
  const local: Area; const session: Area;
 }
 namespace tabs {
  interface Tab { readonly id?: number; readonly url?: string; readonly active?: boolean; readonly windowId?: number }
  function get(id: number): Promise<Tab>;
  function query(query: { active?: boolean; currentWindow?: boolean }): Promise<readonly Tab[]>;
  function sendMessage(id: number, message: unknown, options?: { documentId: string }): Promise<unknown>;
  const onRemoved: { addListener(callback: (id: number) => void): void };
  const onUpdated: { addListener(callback: (id: number, change: { url?: string; status?: string }, tab: Tab) => void): void };
  const onActivated: { addListener(callback: (info: { tabId: number; windowId: number }) => void): void };
 }
}
