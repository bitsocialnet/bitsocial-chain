export function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function CoinGeckoIcon({ className }: { className?: string }) {
  return (
    <img
      src="https://static.coingecko.com/gecko-logo-new-color.svg"
      alt=""
      className={className}
      aria-hidden="true"
    />
  );
}

export function UniswapIcon({ className }: { className?: string }) {
  return (
    <img
      src="https://raw.githubusercontent.com/Uniswap/brand-assets/main/Uniswap%20Brand%20Assets/Uniswap_icon_pink.svg"
      alt=""
      className={className}
      aria-hidden="true"
    />
  );
}

export function EtherscanIcon({ className }: { className?: string }) {
  return (
    <img
      src="https://etherscan.io/images/brandassets/etherscan-logo-circle.svg"
      alt=""
      className={className}
      aria-hidden="true"
    />
  );
}
