export const MODEL = 'jev-latest';
export const THRESHOLD_DEFAULT = 0.6;
export const THRESHOLD_MIN = 0.30;
export const THRESHOLD_MAX = 0.95;
export const THRESHOLD_STEP = 0.05;
export const THRESHOLD_SAVE_MS = 200;
export const PROMPT_VERSION = 'v1';
export const BATCH_MAX = 8;
export const CONCURRENT_MAX = 2;
export const TIMEOUT_MS = 20_000;
export const DEBOUNCE_MS = 300;
export const CACHE_MAX = 500;
export const REQUEST_CHAR_MAX = 6_000;
export const INTENT_MAX = 300;
export const TEXT_MAX = 8_000;
export const PARTS_PER_TARGET_MAX = 3;
export const REQUESTS_PER_DOCUMENT_MAX = 200;
export const MESSAGE_TARGET_MAX = 32;
export const QUEUE_MAX = 256;
export const API_KEY_MAX = 4096;
export const API_URL = 'https://api.typesafe.ai/v1/systemone';
export const MOCK = import.meta.env.VITE_JEV_MOCK === '1';
export const CONNECTION_INTENT = '接続確認';
export const CONNECTION_TARGET = { id: 'test', text: '接続確認のテストです。', context: '' } as const;
export const URL_POLL_MS = 500;
export const CONTENT_RESULT_TIMEOUT_MS = 90_000;

export const CONTENT_RESYNC_MS = 1_000;


export const BLOCK_MIN = 20;

export const REQUESTS_PER_TAB_WINDOW_MAX = 300;
export const TAB_WINDOW_MS = 10 * 60_000;
export const BAR_REPAIR_MS = 1_000;
