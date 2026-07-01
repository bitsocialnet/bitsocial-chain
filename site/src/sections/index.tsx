import SoundMoney from "./SoundMoney";
import SettlementLayer from "./SettlementLayer";
import ValueAccrual from "./ValueAccrual";
import ImmutableUpgrade from "./ImmutableUpgrade";
import MasterPlan from "./MasterPlan";
import GetBso from "./GetBso";

export default function Sections() {
  return (
    <>
      <SoundMoney />
      <SettlementLayer />
      <ValueAccrual />
      <ImmutableUpgrade />
      <MasterPlan />
      <GetBso />
    </>
  );
}
