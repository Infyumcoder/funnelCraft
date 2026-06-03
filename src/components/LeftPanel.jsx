import { Bolt, Chevron } from './Icons';
import { EXAMPLES } from '../lib/data';
import ReferencePanel from './ReferencePanel';

const CHIPS = [
  ['+ Guarantee', '30-day money back guarantee.'],
  ['+ Social Proof', '500+ happy students with strong social proof.'],
  ['+ Bonuses', 'Bonuses: templates, swipe files, live Q&A.'],
  ['+ Urgency', 'Limited seats — only 20 spots left.'],
  ['+ Hinglish', 'Bold Hinglish tone use karo.'],
];

const EXAMPLE_ROWS = [
  { n: 1, bg: 'rgba(99,144,255,.15)', emoji: '📱', title: 'Digital Course', desc: 'Instagram Monetization — ₹5,999' },
  { n: 2, bg: 'var(--grs)', emoji: '🎯', title: 'High-Ticket Coaching', desc: '6-Figure Clarity — ₹75,000' },
  { n: 3, bg: 'var(--ams)', emoji: '📣', title: 'Agency Service', desc: 'Social Media Mgmt — ₹15,000/mo' },
];

export default function LeftPanel({ desc, setDesc, refs, setRefs, onGenerate, busy, toast }) {
  function addChip(t) {
    setDesc((prev) => (prev.trim() ? prev.trim() + '\n' : '') + t);
  }
  function loadEx(n) {
    setDesc(EXAMPLES[n]);
  }

  return (
    <div className="lp">
      <div className="ph">
        <div className="pt">Client Description</div>
        <div className="ps">Client info paste karo — AI complete funnel banavi dese</div>
      </div>

      <div className="pb">
        {/* DESCRIPTION */}
        <div>
          <div className="sl">
            Description <span style={{ color: 'var(--ac)' }}>*</span>
          </div>
          <textarea
            className="ta"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Example: Maro client ek Digital Marketing course vecho che. Course nu naam 'Growth Formula' che. Price ₹4,999. 6 modules, live Q&A, 500+ students, 30-day guarantee..."
          />
        </div>

        {/* QUICK ADD */}
        <div>
          <div className="sl">Quick Add</div>
          <div className="chips">
            {CHIPS.map(([label, text]) => (
              <button className="chip" key={label} onClick={() => addChip(text)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* EXAMPLES */}
        <div>
          <div className="sl">Examples</div>
          <div className="exs">
            {EXAMPLE_ROWS.map((ex) => (
              <div className="ex" key={ex.n} onClick={() => loadEx(ex.n)}>
                <div className="ex-ic" style={{ background: ex.bg }}>
                  {ex.emoji}
                </div>
                <div>
                  <div className="ex-t">{ex.title}</div>
                  <div className="ex-d">{ex.desc}</div>
                </div>
                <Chevron
                  style={{ marginLeft: 'auto', width: 11, height: 11, fill: 'none', stroke: 'var(--hi)', strokeWidth: 2 }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="dvd"></div>

        {/* REFERENCE FUNNELS */}
        <ReferencePanel refs={refs} setRefs={setRefs} toast={toast} />
      </div>

      <div className="pf">
        <button className="gb" disabled={busy} onClick={onGenerate}>
          {busy ? (
            <div className="dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          ) : (
            <>
              <Bolt />
              Generate Complete Funnel
            </>
          )}
        </button>
      </div>
    </div>
  );
}
