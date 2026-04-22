import { invoke } from '@tauri-apps/api/core';

const API_KEY_PATH = 'C:\\Users\\Geoff\\.trademirror\\sheets-api-key.txt';
const SHEET_ID     = '1gyI-Eokk-_PMRA5JEvtFoUxgDWzgM3fYYCGQBAFFjMU';

export interface SheetRow {
  date:          string;
  open:          number;
  high:          number;
  low:           number;
  close:         number;
  volume:        number;
  volumeSma20:   number;
  atr14:         number;
  histVol:       number;
  bbUpper:       number;
  bbMiddle:      number;
  bbLower:       number;
  sma20:         number;
  sma50:         number;
  sma200:        number;
  ema9:          number;
  ema20:         number;
  ema50:         number;
  ema200:        number;
  macd:          number;
  macdSignal:    number;
  macdHistogram: number;
  r3:            number;
  r2:            number;
  r1:            number;
  s1:            number;
  s2:            number;
  s3:            number;
  keltnerUpper:  number;
  keltnerMiddle: number;
  keltnerLower:  number;
  rsi9:          number;
  stochRsiK:     number;
  stochRsiD:     number;
  rsi14:         number;
  cci:           number;
  diPlus:        number;
  diMinus:       number;
  adx:           number;
  tenkan:        number;
  kijun:         number;
  senkouA:       number;
  senkouB:       number;
  insideBar:     boolean;
}

function n(v: string | undefined): number {
  const x = parseFloat(v ?? '');
  return isNaN(x) ? 0 : x;
}

function parseRow(headers: string[], row: string[]): SheetRow {
  const get = (name: string) => row[headers.indexOf(name)] ?? '';
  return {
    date:          get('Date'),
    open:          n(get('Open')),
    high:          n(get('High')),
    low:           n(get('Low')),
    close:         n(get('Close')),
    volume:        n(get('Volume')),
    volumeSma20:   n(get('Vol SMA(20)')),
    atr14:         n(get('ATR(14)')),
    histVol:       n(get('Hist Vol')),
    bbUpper:       n(get('BB Upper')),
    bbMiddle:      n(get('BB Middle')),
    bbLower:       n(get('BB Lower')),
    sma20:         n(get('SMA(20)')),
    sma50:         n(get('SMA(50)')),
    sma200:        n(get('SMA(200)')),
    ema9:          n(get('EMA(9)')),
    ema20:         n(get('EMA(20)')),
    ema50:         n(get('EMA(50)')),
    ema200:        n(get('EMA(200)')),
    macd:          n(get('MACD')),
    macdSignal:    n(get('Signal')),
    macdHistogram: n(get('MACD Hist')),
    r3:            n(get('R3')),
    r2:            n(get('R2')),
    r1:            n(get('R1')),
    s1:            n(get('S1')),
    s2:            n(get('S2')),
    s3:            n(get('S3')),
    keltnerUpper:  n(get('Kelt Upper')),
    keltnerMiddle: n(get('Kelt Mid')),
    keltnerLower:  n(get('Kelt Lower')),
    rsi9:          n(get('RSI(9)')),
    stochRsiK:     n(get('StochRSI %K')),
    stochRsiD:     n(get('StochRSI %D')),
    rsi14:         n(get('RSI(14)')),
    cci:           n(get('CCI')),
    diPlus:        n(get('Plus DI14'))  / 10,
    diMinus:       n(get('Minus DI14')) / 10,
    adx:           n(get('ADX')),
    tenkan:        n(get('Tenkan')),
    kijun:         n(get('Kijun')),
    senkouA:       n(get('Senkou A')),
    senkouB:       n(get('Senkou B')),
    insideBar:     get('Inside Bar') === '1',
  };
}

export async function fetchSheetRows(count = 20): Promise<SheetRow[]> {
  const apiKey = await invoke<string>('read_credentials_file', { path: API_KEY_PATH })
    .then(s => s.trim())
    .catch(() => {
      throw new Error(
        `Setup required: create the file "${API_KEY_PATH}" and paste your Google Sheets API key into it. ` +
        `Get a key at console.cloud.google.com → APIs & Services → Credentials → Create API Key. ` +
        `Also set the sheet sharing to "Anyone with the link – Viewer".`
      );
    });

  // Fetch sheet metadata to discover the grid size so we can request the most recent rows.
  const metaRes  = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?key=${apiKey}&fields=sheets.properties`
  );
  const meta = await metaRes.json() as {
    sheets?: { properties?: { title?: string; gridProperties?: { rowCount?: number } } }[];
    error?: unknown;
  };
  if (!meta.sheets) throw new Error(`Metadata error: ${JSON.stringify(meta)}`);
  const sheetName = 'EURUSD_Daily';
  const rowCount  = meta.sheets.find(s => s.properties?.title === sheetName)
    ?.properties?.gridProperties?.rowCount ?? 5000;

  // Fetch all rows up to the grid boundary so slice(-count) returns the most recent rows,
  // which are the only ones that have fully-warmed EMA(50) and EMA(200) values.
  const range  = `${sheetName}!A1:CZ${rowCount}`;
  const url    = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${apiKey}`;

  const res  = await fetch(url);
  const data = await res.json() as { values?: string[][]; error?: unknown };
  if (!data.values) throw new Error(`Sheets error (sheet: "${sheetName}"): ${JSON.stringify(data)}`);

  const [headerRow, ...dataRows] = data.values;

  const valid  = dataRows.filter(r => r[0]?.trim());
  const recent = valid.slice(-count);

  return recent.map(row => parseRow(headerRow, row));
}
