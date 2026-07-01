import { ArrowUpRight, Moon, Sun } from "lucide-react";
import MissingLayer from "./MissingLayer";
import Newsletter from "./Newsletter";
import PolygonMeshBackground from "./PolygonMeshBackground";
import Sections from "./sections";
import { LINKS } from "./lib/site";
import { useTheme } from "./lib/useTheme";

export default function App() {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <div className="shell">
      <PolygonMeshBackground />
      <header className="topbar" aria-label="Bitsocial Chain site navigation">
        <div className="topbar-inner">
          <a href="/" className="brand" aria-label="Bitsocial Chain home">
            <img
              src="/logo-small.png"
              width={32}
              height={32}
              alt=""
              aria-hidden="true"
              className="brand-logo"
            />
            <span className="brand-name">Bitsocial Chain</span>
          </a>
          <nav className="nav" aria-label="External links">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="nav-link"
              >
                {link.label}
                <ArrowUpRight aria-hidden="true" size={13} strokeWidth={1.75} />
              </a>
            ))}
            <button
              type="button"
              className="toggle"
              aria-label={`Switch to ${next} mode`}
              aria-pressed={theme === "dark"}
              onClick={toggle}
            >
              {theme === "dark" ? (
                <Sun aria-hidden="true" size={16} strokeWidth={1.8} />
              ) : (
                <Moon aria-hidden="true" size={16} strokeWidth={1.8} />
              )}
            </button>
          </nav>
        </div>
      </header>

      <main className="shell-main">
        <div className="hero-panel">
          <div className="hero">
            <div className="copy">
              <p className="eyebrow">
                <span className="tick" aria-hidden="true" />
                BSO / Bitsocial Chain
              </p>
              <h1 className="title">
                The missing <span className="mark">layer</span> of crypto
              </h1>
              <p className="sub">
                The token powering the planned Bitsocial Chain: an unstoppable, fully decentralized{" "}
                <a
                  className="sub-link"
                  href="https://ethereum.org/en/layer-2/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ethereum L2
                </a>
                .
              </p>
            </div>
            <div className="stage">
              <MissingLayer />
            </div>
          </div>
          <div className="hero-bottom-fade" aria-hidden="true" />
        </div>

        <div className="content-panel">
          <div className="content-panel-fade" aria-hidden="true" />
          <div className="sections">
            <Sections />
          </div>
          <Newsletter />
          <footer className="footer">
            <div className="footer-inner">
              <div className="footer-brand">
                <img
                  src="/logo-small.png"
                  width={24}
                  height={24}
                  alt=""
                  aria-hidden="true"
                  className="footer-logo"
                />
                <span>Bitsocial Chain</span>
              </div>
              <p className="footer-tagline">
                The token powering the planned Bitsocial Chain — an unstoppable, fully decentralized
                Ethereum L2.
              </p>
              <nav className="footer-links" aria-label="Footer links">
                {LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="footer-link"
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
