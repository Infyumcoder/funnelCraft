import { Bolt } from './Icons';

export default function Nav() {
  return (
    <nav className="nav">
      <div className="logo">
        <div className="logo-ic">
          <Bolt />
        </div>
        FunnelCraft
        <span className="logo-tag">AI</span>
      </div>
      <div className="nb">Claude AI Powered</div>
    </nav>
  );
}
