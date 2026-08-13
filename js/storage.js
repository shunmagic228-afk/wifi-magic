// LocalStorage-backed settings store. All keys are prefixed to avoid collisions.
const Store = (() => {
  const PREFIX = 'wfm_';

  const DEFAULT_SSIDS = [
    'IODATA-e82b6c-2G',
    'SPWH_L13_9BB7CC',
    'xg100n-4a83f5-2',
    'xg100n-4a83f5-1',
    'SPWH_L13_05B609',
    '57620802-5G',
    'F8AA3F4B7725-2G',
    'ABA795764863-2G',
    'E00EE4B17153-2G',
    'aterm-7e1d6c-a',
    'SPWH_L13_05B5AF',
    '30F772B9A38B-2G',
    '30F772D25AF6-2G'
  ];

  const DEFAULTS = {
    mode: 'card',        // 'card' | 'custom'
    suit: '♠',
    rank: '3',
    customText: '',
    delaySeconds: 5,
    baseSsids: DEFAULT_SSIDS
  };

  function get(key) {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return DEFAULTS[key];
    try {
      return JSON.parse(raw);
    } catch (e) {
      return DEFAULTS[key];
    }
  }

  function set(key, value) {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  }

  function getAll() {
    const out = {};
    Object.keys(DEFAULTS).forEach(k => { out[k] = get(k); });
    return out;
  }

  return { get, set, getAll, DEFAULT_SSIDS };
})();
