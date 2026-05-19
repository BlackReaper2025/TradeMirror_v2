const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, Header, Footer, PageNumber
} = require('docx');
const fs = require('fs');

const BLUE = "1F4E79";
const LIGHT_BLUE = "D6E4F0";
const MID_BLUE = "2E75B6";
const DARK = "1A1A2E";
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const headerBorder = { style: BorderStyle.SINGLE, size: 1, color: "2E75B6" };
const headerBorders = { top: headerBorder, bottom: headerBorder, left: headerBorder, right: headerBorder };

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 120 },
    children: [new TextRun({ text, bold: true, size: 32, color: BLUE, font: "Arial" })]
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 80 },
    children: [new TextRun({ text, bold: true, size: 26, color: MID_BLUE, font: "Arial" })]
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 60 },
    children: [new TextRun({ text, bold: true, size: 22, color: DARK, font: "Arial" })]
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, size: 22, font: "Arial", ...opts })]
  });
}

function bullet(text, bold = false) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, size: 22, font: "Arial", bold })]
  });
}

function numbered(text) {
  return new Paragraph({
    numbering: { reference: "numbers", level: 0 },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, size: 22, font: "Arial" })]
  });
}

function divider() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: MID_BLUE, space: 1 } },
    spacing: { before: 200, after: 200 },
    children: []
  });
}

function mono(text) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    shading: { fill: "F2F2F2", type: ShadingType.CLEAR },
    children: [new TextRun({ text, size: 18, font: "Courier New", color: "333333" })]
  });
}

function makeTable(headers, rows, colWidths) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => new TableCell({
          borders: headerBorders,
          width: { size: colWidths[i], type: WidthType.DXA },
          shading: { fill: MID_BLUE, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20, font: "Arial", color: "FFFFFF" })] })]
        }))
      }),
      ...rows.map((row, ri) => new TableRow({
        children: row.map((cell, i) => new TableCell({
          borders,
          width: { size: colWidths[i], type: WidthType.DXA },
          shading: { fill: ri % 2 === 0 ? "F7FBFF" : "FFFFFF", type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: cell, size: 20, font: "Arial" })] })]
        }))
      }))
    ]
  });
}

// ─── DOCUMENT 1 ───────────────────────────────────────────────────────────────

const doc1 = new Document({
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, font: "Arial", color: BLUE }, paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, font: "Arial", color: MID_BLUE }, paragraph: { spacing: { before: 280, after: 80 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 22, bold: true, font: "Arial", color: DARK }, paragraph: { spacing: { before: 200, after: 60 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    properties: {
      page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: MID_BLUE, space: 1 } },
          children: [new TextRun({ text: "TradeMirror — Live Indicator & Bot Execution Architecture", size: 18, font: "Arial", color: "666666" })]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: MID_BLUE, space: 1 } },
          children: [
            new TextRun({ text: "TradeMirror  |  Page ", size: 18, font: "Arial", color: "666666" }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, font: "Arial", color: "666666" })
          ]
        })]
      })
    },
    children: [
      // Title block
      new Paragraph({ spacing: { before: 0, after: 60 }, children: [new TextRun({ text: "TradeMirror", size: 52, bold: true, font: "Arial", color: BLUE })] }),
      new Paragraph({ spacing: { before: 0, after: 240 }, children: [new TextRun({ text: "Live Indicator & Bot Execution Architecture", size: 36, font: "Arial", color: MID_BLUE })] }),
      divider(),

      h1("Overview"),
      p("TradeMirror's bot and live analytics system are built on a single shared intelligence pipeline. The same engine that powers the live Analytics panels evaluates trade conditions and executes orders. There is no separate bot pipeline and no duplicated indicator logic."),
      new Paragraph({ spacing: { before: 120, after: 60 }, children: [new TextRun({ text: "Core principle:", bold: true, size: 22, font: "Arial", color: DARK }), new TextRun({ text: "  The Rust backend is the brain. The frontend is the display.", size: 22, font: "Arial", italics: true })] }),
      p("All time-sensitive work happens in the Rust backend:"),
      bullet("Price ingestion from OANDA"),
      bullet("Candle management per timeframe"),
      bullet("Indicator calculation"),
      bullet("Condition evaluation"),
      bullet("Trade execution"),
      bullet("Telegram notification"),
      p("The frontend receives push notifications from Rust and renders them. It never computes anything on the execution path."),
      divider(),

      h1("Full Data Flow"),

      h2("Step 1 — OANDA Streaming Price Feed"),
      p("A persistent WebSocket connection to OANDA receives tick-level price data for subscribed currency pairs. This is the entry point for all live data."),

      h2("Step 2 — Price Tick Handler (Rust)"),
      p("Each incoming tick is received by the Rust tick handler. It updates the current unclosed candle for every active timeframe simultaneously."),

      h2("Step 3 — Candle Buffer (Rust, In-Memory)"),
      p("Each pair and timeframe combination maintains its own rolling candle buffer in Rust memory. The buffer holds the last 200 closed candles plus the current live candle. When a new boundary is crossed (minute, 5-minute, hourly, etc.), the live candle is closed, appended to the buffer, and a new live candle begins."),
      p("Supported timeframes:  M1, M5, M15, H1, H4, D, W", { bold: false }),
      new Paragraph({ spacing: { before: 80, after: 80 }, children: [new TextRun({ text: "The candle buffer is held entirely in memory. No database read/write occurs on the live data path.", size: 22, font: "Arial", italics: true, color: "555555" })] }),

      h2("Step 4 — Indicator Engine (Rust, Incremental)"),
      p("On each tick or candle close, the indicator engine receives the candle buffer and produces a structured IndicatorSnapshot. Indicators computed include:"),
      p("Trend:", { bold: true }),
      bullet("EMA9, EMA20, EMA50, EMA100, EMA200"),
      bullet("ADX, DI+, DI-"),
      p("Momentum:", { bold: true }),
      bullet("RSI9, RSI14"),
      bullet("MACD, MACD Signal, MACD Histogram"),
      bullet("CCI, Williams %R, ROC"),
      p("Volatility:", { bold: true }),
      bullet("Bollinger Bands (upper, middle, lower)"),
      bullet("Keltner Channels (upper, middle, lower)"),
      bullet("ATR14"),
      bullet("Squeeze"),
      p("The IndicatorSnapshot also includes pre-computed boolean state flags for instant condition evaluation:"),
      bullet("macd_bullish_cross"),
      bullet("macd_bearish_cross"),
      bullet("rsi9_oversold  (RSI9 < 30)"),
      bullet("rsi9_overbought  (RSI9 > 70)"),
      bullet("rsi14_oversold  (RSI14 < 30)"),
      bullet("rsi14_overbought  (RSI14 > 70)"),

      h2("Step 5 — Two Simultaneous Consumers"),
      h3("Consumer A — Condition Engine (Rust)"),
      p("Evaluates strategy rules against the latest IndicatorSnapshot. When conditions are met, it acts immediately within the same Rust process — no inter-process communication, no round-trips."),
      h3("Consumer B — Tauri Push Events (Frontend)"),
      p("Pushes the IndicatorSnapshot to the Analytics UI. Panels re-render in real-time. No polling, no request/response round-trips."),

      h2("Step 6 — When a Condition Fires"),
      numbered("OANDA order is placed via direct API call (same Rust process)"),
      numbered("Telegram notification sent via HTTP to AlphaAlert bot"),
      numbered("Trade record written to SQLite for logging"),
      numbered("Tauri event pushed to frontend for alert panel update"),
      divider(),

      h1("Why Execution Logic Lives in Rust"),
      p("On a 1-minute timeframe, latency compounds quickly. Every millisecond removed from the path between signal detection and order submission matters."),

      h2("Path A — Condition Check in Frontend (Slow)"),
      mono("Tick arrives in Rust"),
      mono("  Rust sends event to frontend          +1-5ms"),
      mono("  Frontend receives and processes       +1-5ms"),
      mono("  Frontend evaluates condition          +1ms"),
      mono("  Frontend calls Rust to execute        +1-5ms"),
      mono("  Rust calls OANDA API                  +50-200ms (network floor)"),
      mono("  Unnecessary overhead: 10-20ms"),

      h2("Path B — Condition Check in Rust (Fast)"),
      mono("Tick arrives in Rust"),
      mono("  Rust updates indicators               <1ms"),
      mono("  Rust evaluates condition              <1ms"),
      mono("  Rust calls OANDA API                  +50-200ms (network floor)"),
      mono("  Unnecessary overhead: ~0ms"),

      p("The OANDA network call is the irreducible latency floor. Everything before it should be eliminated. On 1M candles, 10-20ms is the difference between acting on the candle that triggered the signal and acting on the next one."),
      divider(),

      h1("Example Strategy: MACD + RSI Divergence"),
      h2("Rule 1 — Bullish Entry"),
      bullet("MACD bullish cross confirmed"),
      bullet("RSI14 below 30 (oversold)"),
      bullet("Action: Place BUY order on OANDA", true),
      h2("Rule 2 — Bearish Entry"),
      bullet("MACD bearish cross confirmed"),
      bullet("RSI14 above 70 (overbought)"),
      bullet("Action: Place SELL order on OANDA", true),
      p("On condition fire: order placed, Telegram notification sent, trade logged. Rules are composable — multiple conditions across multiple timeframes can be combined. For example, H1 directional bias must be confirmed before a M5 entry signal is accepted."),
      divider(),

      h1("Shared Pipeline"),
      p("All systems consume the same candle buffer and indicator engine. There is never more than one indicator calculation per pair and timeframe."),
      new Paragraph({ spacing: { before: 120, after: 120 }, children: [] }),
      makeTable(
        ["System", "Candle Buffer", "Indicator Engine", "Notes"],
        [
          ["Analytics Panels", "Shared", "Shared", "Display only, receives push events"],
          ["Alerts Engine", "Shared", "Shared", "Condition monitoring, no execution"],
          ["Bot Condition Engine", "Shared", "Shared", "Evaluates rules, triggers orders"],
          ["Trade Execution", "—", "—", "Fires on condition trigger"],
          ["Backtester", "Separate (historical)", "Shared logic", "Replay mode, not live path"],
        ],
        [2340, 1560, 1560, 3900]
      ),
      divider(),

      h1("Build Order"),
      h2("Phase 1 — Live Analytics Foundation (Current)"),
      numbered("OANDA streaming WebSocket connection in Rust"),
      numbered("In-memory candle buffer per pair and timeframe"),
      numbered("Indicator engine — recomputes on tick/close, produces IndicatorSnapshot"),
      numbered("Tauri push events — streams IndicatorSnapshot to frontend"),
      numbered("Analytics panels updated to subscribe to events and display live indicators"),
      h2("Phase 2 — Bot Execution (Next, After Analytics Validated)"),
      numbered("Condition engine — evaluates strategy rules against IndicatorSnapshot"),
      numbered("OANDA order execution on condition trigger"),
      numbered("Telegram notification routing"),
      numbered("Trade logging and position tracking"),
      h2("Phase 3 — Multi-Strategy and Risk (Later)"),
      numbered("Rule composition across timeframes"),
      numbered("Risk engine — position sizing, max loss limits, drawdown protection"),
      numbered("Strategy management UI"),
      divider(),

      h1("What Does Not Change"),
      bullet("The existing daily SQLite pipeline remains untouched for historical replay"),
      bullet("The Analytics V3 UI layout and panel structure are preserved"),
      bullet("The existing OANDA daily sync continues for end-of-day persistence"),
      bullet("The existing Telegram bot (AlphaAlert) is reused as the notification router"),
    ]
  }]
});

// ─── DOCUMENT 2 ───────────────────────────────────────────────────────────────

const doc2 = new Document({
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, font: "Arial", color: BLUE }, paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, font: "Arial", color: MID_BLUE }, paragraph: { spacing: { before: 280, after: 80 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 22, bold: true, font: "Arial", color: DARK }, paragraph: { spacing: { before: 200, after: 60 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    properties: {
      page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: MID_BLUE, space: 1 } },
          children: [new TextRun({ text: "TradeMirror — RAG: What It Is, What It Is Not, and How It Could Fit Later", size: 18, font: "Arial", color: "666666" })]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: MID_BLUE, space: 1 } },
          children: [
            new TextRun({ text: "TradeMirror  |  Page ", size: 18, font: "Arial", color: "666666" }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, font: "Arial", color: "666666" })
          ]
        })]
      })
    },
    children: [
      new Paragraph({ spacing: { before: 0, after: 60 }, children: [new TextRun({ text: "TradeMirror", size: 52, bold: true, font: "Arial", color: BLUE })] }),
      new Paragraph({ spacing: { before: 0, after: 240 }, children: [new TextRun({ text: "RAG: What It Is, What It Is Not, and How It Could Fit Later", size: 32, font: "Arial", color: MID_BLUE })] }),
      divider(),

      h1("What Is RAG?"),
      p("RAG stands for Retrieval-Augmented Generation. It is a technique used in AI systems that combine a large language model (LLM) with a document retrieval layer."),
      p("The standard pattern:"),
      numbered("A question or prompt is received"),
      numbered("A retrieval system searches a document store for relevant context"),
      numbered("That context is injected into the LLM prompt"),
      numbered("The LLM generates a response informed by the retrieved documents"),
      p("RAG is used to make LLMs more accurate and grounded when answering questions about specific knowledge bases — legal documents, product manuals, research papers, or proprietary internal data."),
      p("Common examples in practice:"),
      bullet("A customer support bot that retrieves relevant help articles before answering"),
      bullet("A research assistant that retrieves academic papers before summarizing findings"),
      bullet("A compliance system that retrieves regulatory documents before answering legal questions"),
      divider(),

      h1("What RAG Is Not"),
      p("RAG is not a trading execution pattern."),
      p("RAG does not:"),
      bullet("React to price ticks"),
      bullet("Evaluate numeric indicator conditions"),
      bullet("Execute orders"),
      bullet("Operate in milliseconds"),
      p("RAG involves LLM inference, which typically adds 500ms to several seconds of latency per query. This makes it fundamentally incompatible with the execution hot path of a rules-based trading bot."),
      new Paragraph({
        spacing: { before: 120, after: 120 },
        shading: { fill: "FFF3CD", type: ShadingType.CLEAR },
        children: [
          new TextRun({ text: "The TradeMirror bot execution path is:  ", size: 22, font: "Arial", bold: true }),
          new TextRun({ text: "Tick  →  Indicators  →  Rule check  →  Execute", size: 22, font: "Courier New", bold: true, color: DARK }),
        ]
      }),
      p("This is deterministic, fast, and fully auditable. Every trade can be explained by the exact indicator values and rule conditions that fired. There is no AI inference on this path and there should never be."),
      divider(),

      h1("How They Are Different"),
      new Paragraph({ spacing: { before: 120, after: 120 }, children: [] }),
      makeTable(
        ["Dimension", "TradeMirror Bot (Rules Engine)", "RAG System"],
        [
          ["Purpose", "Execute trades when conditions are met", "Answer questions using retrieved context"],
          ["Speed", "Sub-millisecond condition evaluation", "500ms to several seconds per query"],
          ["Input", "Structured numeric indicator values", "Natural language questions or prompts"],
          ["Output", "Buy/Sell order + Telegram notification", "Natural language response"],
          ["Determinism", "Fully deterministic", "Non-deterministic — LLM responses vary"],
          ["Auditability", "Every trade fully explainable", "Reasoning is partially opaque"],
          ["Position", "Core execution hot path", "Advisory or research layer only"],
          ["Latency tolerance", "Zero — acts on current candle", "High — seconds of latency acceptable"],
          ["When it runs", "On every price tick", "On demand, when a question is asked"],
        ],
        [2340, 3510, 3510]
      ),
      divider(),

      h1("Where RAG Could Fit in TradeMirror Later"),
      p("RAG is not relevant to the current build phase. However, there are legitimate future use cases where a RAG system could add value in TradeMirror. All of them are advisory. None of them are on the execution path."),

      h2("Use Case 1 — Strategy Research Assistant"),
      p("A RAG system built on top of a document store containing trading books, strategy notes, backtesting reports, and market research. A trader could ask: \"What does my confluence strategy say about entering in a ranging regime?\" The system retrieves relevant documents and generates a contextual answer. This does not affect trade execution."),

      h2("Use Case 2 — Trade Journal Intelligence"),
      p("TradeMirror logs every trade with indicator values and outcomes. A RAG system could retrieve past trades matching similar setups and surface patterns. Example query: \"Show me past trades where MACD crossed bullish with RSI below 30 on H1 — what was the average outcome?\" This is a retrospective analytical tool."),

      h2("Use Case 3 — BrainBot Market Context Layer"),
      p("The BrainBot system (described in Project.md) is intended to assist with directional bias, trade context, and entry evaluation. A RAG component could allow BrainBot to retrieve current regime analysis, recent news context, or historical pattern data before generating a market narrative. This would run on a slow advisory loop — updating a bias parameter every few minutes — never on the tick-level execution path."),

      h2("Use Case 4 — Regime and Narrative Interpretation"),
      p("Structured indicator outputs (ADX, ATR, Bollinger width, market structure state) could be passed to an LLM with retrieved context about current conditions. The LLM generates a plain-language narrative: \"EUR/USD is currently in a trending regime with expanding volatility. RSI is approaching oversold on H1.\" This is observability tooling, not execution logic."),
      divider(),

      h1("The Key Constraint"),
      p("If RAG is ever added to TradeMirror, it must operate on a separate advisory loop with its own latency budget. It must never sit between a condition trigger and an order submission."),
      new Paragraph({
        spacing: { before: 120, after: 120 },
        shading: { fill: "FFF3CD", type: ShadingType.CLEAR },
        children: [
          new TextRun({ text: "The execution path is and must remain:  ", size: 22, font: "Arial", bold: true }),
          new TextRun({ text: "Tick  →  Indicators  →  Rule check  →  Execute", size: 22, font: "Courier New", bold: true, color: DARK }),
        ]
      }),
      p("RAG output can inform parameters that feed into rule checks — for example, whether trading is enabled at all given current regime — but the final execution decision remains deterministic and rules-based."),
      divider(),

      h1("Summary"),
      p("RAG is a powerful tool for knowledge retrieval and language generation. It is not relevant to the current TradeMirror build phase. When it does appear in TradeMirror, it will serve as an intelligence and observability layer — helping the trader understand the market, review past performance, and interpret signals — while the execution engine remains fast, deterministic, and fully auditable."),
      new Paragraph({ spacing: { before: 0, after: 0 }, children: [] }),
      makeTable(
        ["Layer", "Technology", "Latency", "Purpose"],
        [
          ["Execution", "Rust rules engine", "< 1ms", "Place orders on condition trigger"],
          ["Analytics", "Rust + Tauri events", "< 5ms", "Live indicator display"],
          ["Alerts", "Rust + Telegram HTTP", "~ 1 second", "Notification on condition fire"],
          ["Advisory (future)", "RAG + LLM", "0.5 - 5 seconds", "Market narrative, research, journal"],
        ],
        [1872, 2340, 1404, 3744]
      ),
    ]
  }]
});

// ─── WRITE FILES ──────────────────────────────────────────────────────────────

Promise.all([
  Packer.toBuffer(doc1),
  Packer.toBuffer(doc2)
]).then(([buf1, buf2]) => {
  fs.writeFileSync('D:\\Dev\\TradeMirror_v2\\TradeMirror\\docs\\TradeMirror_Bot_Architecture.docx', buf1);
  fs.writeFileSync('D:\\Dev\\TradeMirror_v2\\TradeMirror\\docs\\TradeMirror_RAG_vs_Bot.docx', buf2);
  console.log('DONE: Both documents written.');
}).catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
