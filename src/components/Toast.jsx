import { Check } from './Icons';

// Toast shows whenever `message` changes (App bumps a counter to re-trigger).
export default function Toast({ message, show }) {
  return (
    <div className={'toast' + (show ? ' show' : '')}>
      <Check />
      <span>{message}</span>
    </div>
  );
}
