import { useEffect, useRef, useState } from 'react';
import { Bolt, ClockFill, CheckCircle, Monitor } from './Icons';

// Animated progress bar + step list, mirroring the original tick() logic.
export default function Progress({ hasRef }) {
  const [pct, setPct] = useState(0);
  const pctRef = useRef(0);

  useEffect(() => {
    const iv = setInterval(() => {
      pctRef.current = Math.min(pctRef.current + 0.7, 92);
      setPct(pctRef.current);
    }, 200);
    return () => clearInterval(iv);
  }, []);

  const stepState = (threshold, prevThreshold) => {
    if (pct >= threshold) return 'dn';
    if (prevThreshold === null || pct >= prevThreshold) return 'act';
    return '';
  };

  const steps = [
    {
      id: 1,
      t: 15,
      prev: null,
      icon: <ClockFill />,
      label: hasRef ? 'Analyzing reference design...' : 'Reading description...',
    },
    { id: 2, t: 38, prev: 15, icon: <CheckCircle />, label: 'Planning page structure...' },
    {
      id: 3,
      t: 68,
      prev: 38,
      icon: <Monitor />,
      label: hasRef ? 'Matching reference design...' : 'Writing copy and designing...',
    },
    { id: 4, t: 88, prev: 68, icon: <Bolt />, label: 'Final polish + preparing preview...' },
  ];

  return (
    <div className="prog">
      <div className="prog-top">
        <div className="prog-lbl">
          <Bolt width="13" height="13" style={{ fill: 'var(--ac)' }} />
          {hasRef ? 'Reference study + funnel design...' : 'Designing your funnel...'}
        </div>
        <div className="prog-pct">{Math.round(pct)}%</div>
      </div>
      <div className="prog-tr">
        <div className="prog-fl" style={{ width: pct + '%' }}></div>
      </div>
      <div className="prog-steps">
        {steps.map((s) => (
          <div className={'ps ' + stepState(s.t, s.prev)} key={s.id}>
            {s.icon}
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}
