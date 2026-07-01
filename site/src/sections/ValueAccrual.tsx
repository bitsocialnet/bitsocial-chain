import { Activity, ArrowRight, Coins, Flame, RefreshCw, ShieldCheck } from "lucide-react";
import Section from "./Section";

const STEPS = [
  { icon: Activity, label: "Network activity", note: "communities, L3s, apps" },
  { icon: Coins, label: "Settles in BSO", note: "fees · staking · bonds · rent" },
  { icon: Flame, label: "Burned and staked", note: "a share burns, the rest secures" },
  { icon: ShieldCheck, label: "Scarcer and safer", note: "deflationary, fee-funded security" },
];

export default function ValueAccrual() {
  return (
    <Section
      id="value-accrual"
      eyebrow="Value accrual"
      question="How does BSO grow with the network?"
      supporting="Not through emissions or promises. Every layer of the network settles in BSO, a share of those fees is burned, and the rest pays for security. More usage means a scarcer, better-secured token."
    >
      <div className="flywheel">
        <ol className="flow-steps">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <li key={step.label} className="flow-step">
                <span className="flow-icon">
                  <Icon aria-hidden size={18} strokeWidth={1.8} />
                </span>
                <span className="flow-label">{step.label}</span>
                <span className="flow-note">{step.note}</span>
                {i < STEPS.length - 1 ? (
                  <ArrowRight aria-hidden size={16} strokeWidth={1.8} className="flow-arrow" />
                ) : null}
              </li>
            );
          })}
        </ol>
        <p className="flow-loop">
          <RefreshCw aria-hidden size={15} strokeWidth={1.8} />A scarcer, safer network draws more
          communities, and the loop compounds, with no inflation required.
        </p>
      </div>
    </Section>
  );
}
