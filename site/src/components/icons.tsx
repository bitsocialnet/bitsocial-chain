import { cn } from "@/lib/utils";

// Official brand assets only. Sources:
// - CoinGecko: https://brand.coingecko.com/resources/brand-kit (CG-Symbol-1, CG-Symbol-2)
// - Etherscan: https://etherscan.io/brandassets (logo circle + light variant)
// - Uniswap: https://github.com/Uniswap/brand-assets (icon black + white)
// - DexScreener: https://dexscreener.com/manifest.json (/icon-512x512.png)

function ThemeBrandIcon({
  lightSrc,
  darkSrc,
  className,
}: {
  lightSrc: string;
  darkSrc: string;
  className?: string;
}) {
  return (
    <>
      <img src={lightSrc} alt="" aria-hidden="true" className={cn(className, "dark:hidden")} />
      <img src={darkSrc} alt="" aria-hidden="true" className={cn(className, "hidden dark:block")} />
    </>
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
  return (
    <ThemeBrandIcon
      lightSrc="/icons/coingecko-symbol-light.svg"
      darkSrc="/icons/coingecko-symbol-dark.svg"
      className={className}
    />
  );
}

export function UniswapIcon({ className }: { className?: string }) {
  return (
    <ThemeBrandIcon
      lightSrc="/icons/uniswap-icon-black.svg"
      darkSrc="/icons/uniswap-icon-white.svg"
      className={className}
    />
  );
}

export function DexScreenerIcon({ className }: { className?: string }) {
  return <img src="/icons/dexscreener-icon.png" alt="" aria-hidden="true" className={className} />;
}

export function EtherscanIcon({ className }: { className?: string }) {
  return (
    <ThemeBrandIcon
      lightSrc="/icons/etherscan-circle.svg"
      darkSrc="/icons/etherscan-circle-light.svg"
      className={className}
    />
  );
}
