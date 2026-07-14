import { Button } from "@/components/ui/button";

import {
  actionsDisabled,
  type ActionFeedback,
  type PacketAction,
} from "./resultsModel";

interface PacketActionsProps {
  actionFeedback: ActionFeedback | null;
  activeAction: PacketAction | null;
  packetAvailable: boolean;
  onCopyPacket: () => void;
  onDownloadPacket: () => void;
}

export function PacketActions({
  actionFeedback,
  activeAction,
  packetAvailable,
  onCopyPacket,
  onDownloadPacket,
}: PacketActionsProps) {
  const disabled = actionsDisabled(activeAction) || !packetAvailable;

  return (
    <div className="grid min-w-[220px] justify-items-stretch gap-2 max-[700px]:min-w-0">
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" size="lg" disabled={disabled} onClick={onCopyPacket}>
          {activeAction === "copying" ? "Copying…" : "Copy packet"}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="secondary"
          disabled={disabled}
          onClick={onDownloadPacket}
        >
          {activeAction === "downloading" ? "Downloading…" : "Download packet"}
        </Button>
      </div>
      <p
        className={actionFeedback?.kind === "error" ? "min-h-4 text-right text-xs font-medium text-destructive" : "min-h-4 text-right text-xs font-medium text-primary"}
        aria-live="polite"
      >
        {actionFeedback?.message ?? (!packetAvailable ? "Packet unavailable for this report" : "")}
      </p>
    </div>
  );
}
