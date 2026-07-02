import { ArrowUpRight, ListTree, ShieldAlert } from "lucide-react";
import {
  BSO_TOKEN_ADDRESS,
  BSO_TOKEN_ADDRESS_SHORT,
  ETHERSCAN_TOKEN_URL,
  UNISWAP_TOKEN_URL,
} from "@/lib/site";
import Section from "./Section";

export default function GetBso() {
  return (
    <Section
      id="get-bso"
      eyebrow="Get BSO"
      question="How to get BSO, safely."
      supporting="The immutable BSO contract is live on Ethereum. Always verify the full address yourself before sending anything."
    >
      <div className="verify">
        <div className="verify-addr">
          <span className="verify-addr-main">
            <span className="verify-addr-label">Official BSO contract</span>
            <a
              className="verify-addr-value"
              href={ETHERSCAN_TOKEN_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              {BSO_TOKEN_ADDRESS_SHORT}
            </a>
          </span>
          <span className="verify-badge">Live on Ethereum</span>
        </div>

        <p className="verify-warn">
          <ShieldAlert aria-hidden size={18} strokeWidth={1.85} />
          <span>
            Verify before you trust. The address ending in <code>DaB5A</code> is branding, not
            proof. Always check the full official address <code dir="ltr">{BSO_TOKEN_ADDRESS}</code>{" "}
            on this site and Bitsocial’s official channels, and beware impersonators.
          </span>
        </p>

        <div className="verify-links">
          <a
            className="verify-link"
            href={UNISWAP_TOKEN_URL}
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
