import { BadgeCheck, Gift, ShieldCheck, TriangleAlert } from "lucide-react";
import { BSO_TOKEN_ADDRESS_SHORT, ETHERSCAN_TOKEN_URL } from "@/lib/site";
import Section from "./Section";

type Gen = {
  gen: string;
  chain: string;
  when: string;
  addr: string;
  href: string | null;
  status: string;
  badge: "past" | "now" | "next";
  badgeLabel: string;
};

const GENS: Gen[] = [
  {
    gen: "Gen 1",
    chain: "Avalanche",
    when: "2021",
    addr: "0x625f…bee9",
    href: "https://snowscan.xyz/address/0x625fc9bb971bb305a2ad63252665dcfe9098bee9",
    status: "origin",
    badge: "past",
    badgeLabel: "Origin",
  },
  {
    gen: "Gen 2",
    chain: "Ethereum",
    when: "2024",
    addr: "0xEA81…Bd8f",
    href: "https://etherscan.io/token/0xEA81DaB2e0EcBc6B5c4172DE4c22B6Ef6E55Bd8f",
    status: "upgradeable proxy",
    badge: "past",
    badgeLabel: "Previous",
  },
  {
    gen: "Gen 3",
    chain: "Ethereum",
    when: "2025",
    addr: BSO_TOKEN_ADDRESS_SHORT,
    href: ETHERSCAN_TOKEN_URL,
    status: "immutable · adminless",
    badge: "now",
    badgeLabel: "Current",
  },
];

export default function ImmutableUpgrade() {
  return (
    <Section
      id="immutable-upgrade"
      eyebrow="An immutable upgrade"
      question="Where BSO came from, and what’s changing."
      supporting="Three generations, each migrated 1:1 and verifiable on-chain. The current token is fully immutable and adminless. Holders received the final token through a passive 1:1 airdrop."
      quote="For a provenance coin, the history is the point."
    >
      <div className="lineage">
        <ol className="lineage-rail">
          {GENS.map((g) => (
            <li key={g.gen} className={`gen${g.badge === "now" ? " gen-next" : ""}`}>
              <span className="gen-head">
                <span className="gen-name">{g.gen}</span>
                <span className={`gen-badge gen-badge-${g.badge}`}>{g.badgeLabel}</span>
              </span>
              <span className="gen-chain">
                {g.chain} · {g.when}
              </span>
              {g.href ? (
                <a className="gen-addr" href={g.href} target="_blank" rel="noopener noreferrer">
                  {g.addr}
                </a>
              ) : (
                <span className="gen-addr gen-addr-pending">{g.addr}</span>
              )}
              <span className="gen-status">
                {g.badge === "past" && g.status === "upgradeable proxy" ? (
                  <TriangleAlert aria-hidden size={13} strokeWidth={1.9} />
                ) : g.badge === "now" ? (
                  <ShieldCheck aria-hidden size={13} strokeWidth={1.9} />
                ) : (
                  <BadgeCheck aria-hidden size={13} strokeWidth={1.9} />
                )}
                {g.status}
              </span>
            </li>
          ))}
        </ol>

        <p className="lineage-note">
          <Gift aria-hidden size={16} strokeWidth={1.8} />
          The migration was a passive 1:1 airdrop. You keep the same tokens and do nothing; the new
          immutable contract shows the correct Bitsocial branding everywhere.
        </p>
      </div>
    </Section>
  );
}
