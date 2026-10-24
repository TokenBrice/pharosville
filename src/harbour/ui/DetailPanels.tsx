import dead from "@shared/data/dead-stablecoins.json";
import type { DeadStablecoin } from "@shared/types/market";
import prelaunch from "../data/prelaunch.json";
import { installDeadRecords } from "../model/obituary";
import { installYardBook } from "./yard";
import { Ledger } from "./Ledger";
import { SidePanel } from "./Panel";
import { Search } from "./Search";

// All metadata is present before any detail component mounts (including the first keyboard action).
installDeadRecords(dead as DeadStablecoin[]);
installYardBook(prelaunch.coins);

export default function DetailPanels({ closeLedger, closePanel, closeSearch }: {
  closeLedger: () => void;
  closePanel: () => void;
  closeSearch: () => void;
}) {
  return <><Ledger onClose={closeLedger} /><SidePanel onClose={closePanel} /><Search onClose={closeSearch} /></>;
}
