import { cn } from "@/lib/utils";

function MonochromeBrandIcon({ src, className }: { src: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 bg-current", className)}
      style={{
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}

export function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function CoinGeckoIcon({ className }: { className?: string }) {
  return <MonochromeBrandIcon src="/icons/coingecko.svg" className={className} />;
}

export function UniswapIcon({ className }: { className?: string }) {
  return <MonochromeBrandIcon src="/icons/uniswap.svg" className={className} />;
}

export function EtherscanIcon({ className }: { className?: string }) {
  return <MonochromeBrandIcon src="/icons/etherscan.svg" className={className} />;
}
