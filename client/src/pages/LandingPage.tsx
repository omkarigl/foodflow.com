import { Link } from 'react-router-dom';

const FEATURES = [
  { icon: '📷', title: 'Scan the QR', body: 'Every table and counter has its own code. Scanning pins you to that exact canteen and prep queue.' },
  { icon: '⚡', title: 'No queue, no shouting', body: 'Order, pay and get a pickup token. The kitchen sees your order the moment payment clears.' },
  { icon: '📦', title: 'Live stock', body: 'Availability comes straight from the counter, so the item you want is still there when you tap add.' },
  { icon: '👛', title: 'Wallet or Razorpay', body: 'Top up once and check out in one tap, or pay securely through Razorpay every time.' },
  { icon: '🔔', title: 'Track every stage', body: 'Accepted, preparing, ready — push updates land on your phone, with polling backup if the network drops.' },
  { icon: '🧾', title: 'Receipts & refunds', body: 'Every order keeps its full history. Cancel while preparing and your money goes straight back.' },
];

export function LandingPage() {
  return (
    <div className="landing">
      <header className="landing__nav">
        <span className="landing__brand">
          <span aria-hidden="true">🍽️</span> FoodFlow
        </span>
        <div className="landing__actions">
          <Link className="btn btn--ghost" to="/login">
            Sign in
          </Link>
          <Link className="btn btn--primary" to="/register">
            Get started
          </Link>
        </div>
      </header>

      <section className="landing__hero">
        <p className="landing__eyebrow">College canteen, minus the queue</p>
        <h1>
          Scan. Order. <span className="grad">Pick up.</span>
        </h1>
        <p className="landing__lead">
          FoodFlow turns the canteen counter into a smooth digital kitchen. Scan the QR on your table, order from the live menu, pay securely and watch your
          token move from the pass to your tray.
        </p>
        <div className="landing__cta">
          <Link className="btn btn--primary btn--lg" to="/register">
            Create student account
          </Link>
          <Link className="btn btn--secondary btn--lg" to="/login">
            I already have one
          </Link>
        </div>
        <ul className="landing__stats">
          <li>
            <strong>2 min</strong>
            <span>average order time</span>
          </li>
          <li>
            <strong>0</strong>
            <span>shouting required</span>
          </li>
          <li>
            <strong>Live</strong>
            <span>stock &amp; kitchen status</span>
          </li>
        </ul>
      </section>

      <section className="landing__grid">
        {FEATURES.map((feature) => (
          <article key={feature.title} className="feature">
            <span className="feature__icon" aria-hidden="true">
              {feature.icon}
            </span>
            <h3>{feature.title}</h3>
            <p>{feature.body}</p>
          </article>
        ))}
      </section>

      <footer className="landing__foot">
        <span>FoodFlow · built for campus kitchens</span>
        <Link to="/login">Staff sign in</Link>
      </footer>
    </div>
  );
}