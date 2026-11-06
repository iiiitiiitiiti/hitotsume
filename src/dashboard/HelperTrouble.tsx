/** 係から取れなかったときの一言。つながらないときの案内は画面の上に1回だけ出す（App の helper-down） */
export function HelperTrouble({
  reason,
  onRetry,
  messages = {},
}: {
  reason: string;
  onRetry: () => void;
  messages?: Record<string, string>;
}) {
  if (reason === "offline") return <p className="box__quiet">係につながると出ます</p>;
  return (
    <p className="trouble">
      <span>{messages[reason] ?? "今は取れません"}</span>
      <button type="button" className="text-button" onClick={onRetry}>
        取り直す
      </button>
    </p>
  );
}
