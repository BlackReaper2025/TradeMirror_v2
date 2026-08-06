import { Panel, PanelHeader } from "../components/ui/Panel";

export function Strategy() {
  return (
    <div className="flex-1 overflow-y-auto" style={{ padding: "20px 24px 40px" }}>
      <div className="flex flex-col gap-4" style={{ maxWidth: 680 }}>

        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text-primary)" }}>Strategy</h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>
            Strategy validation and rule tracking, built on the shared indicator engine.
          </p>
        </div>

        <Panel>
          <PanelHeader label="Coming Soon" />
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            This screen is a placeholder. Strategy logic will be built here once Market Structure,
            Regime Detection, and Alerts are validated in Analytics V3.
          </p>
        </Panel>

      </div>
    </div>
  );
}
