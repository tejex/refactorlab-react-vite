export function Topbar() {
  return (
    <header className="topbar">
      <a className="brand" href="#">
        <span className="mark">fx</span>
        <span>fixer.ai</span>
      </a>
      <nav>
        <a href="#scan">Scan</a>
        <a href="#report">Report</a>
        <a href="#how">How it works</a>
      </nav>
    </header>
  );
}
