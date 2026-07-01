import { ArrowUpRight, ListTree, ShieldAlert } from "lucide-react";
import Section from "./Section";

export default function GetBso() {
  return (
    <Section
      id="get-bso"
      eyebrow="Get BSO"
      question="How to get BSO, safely."
      supporting="The immutable contract launches with its official address published here and on Bitsocial’s official channels. Always verify the full address yourself before sending anything."
    >
      <div className="verify">
        <div className="verify-addr">
          <span className="verify-addr-main">
            <span className="verify-addr-label">Official BSO contract</span>
            <span className="verify-addr-value">0x⋯b50</span>
          </span>
          <span className="verify-badge">Published at launch</span>
        </div>

        <p className="verify-warn">
          <ShieldAlert aria-hidden size={18} strokeWidth={1.85} />
          <span>
            Verify before you trust. The address ending in <code>b50</code> is branding, not proof.
            Always check the full official address on this site and Bitsocial’s official channels,
            and beware impersonators.
          </span>
        </p>

        <div className="verify-links">
          <a
            className="verify-link"
            href="https://app.uniswap.org/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Trade on Uniswap
            <ArrowUpRight aria-hidden size={14} strokeWidth={1.85} />
          </a>
          <a className="verify-link" href="#immutable-upgrade">
            <ListTree aria-hidden size={14} strokeWidth={1.85} />
            View the on-chain lineage
          </a>
        </div>
      </div>
    </Section>
  );
}
