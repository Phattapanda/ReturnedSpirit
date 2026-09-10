import React, { useEffect, useState } from "react";

import DeathAngelOverlay from "@/src/components/death-angel-overlay";
import { loadProgressionState } from "@/src/game/progression";
import type { PlayerAvatarId } from "@/src/game/player-avatar";
import type { NextRunBonuses } from "@/src/game/next-run";

type Props = {
  visible: boolean;
  busy?: boolean;
  error?: string | null;
  onStartNextRun: (bonuses: NextRunBonuses, avatarId: PlayerAvatarId) => void;
};

/** Uses the shared death → Karma → rebirth → avatar flow for non-dungeon deaths. */
export default function RunEndingOverlay({ visible, busy = false, error, onStartNextRun }: Props) {
  const [karmaPoints, setKarmaPoints] = useState(0);

  useEffect(() => {
    if (!visible) return;
    void loadProgressionState().then((state) => setKarmaPoints(state.karmaPoints));
  }, [visible]);

  return <DeathAngelOverlay
    visible={visible}
    karmaPoints={karmaPoints}
    busy={busy}
    error={error}
    onStartNextRun={onStartNextRun}
  />;
}
