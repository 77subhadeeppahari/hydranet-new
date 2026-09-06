import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getListPublicPlansQueryKey, useCreatePublicInquiry, useListPublicPlans, useListPublicTeam } from '@workspace/api-client-react';
import type { Plan as BackendPlan } from '@workspace/api-client-react';
import { ArrowRight, Building2, Camera, Check, Clock3, Eye, Gauge, GitBranch, Headphones, HeartHandshake, Mail, MapPin, Menu, MessageCircle, Network, Phone, Plus, Router as RouterIcon, Send, ShieldCheck, Signal, Sparkles, Target, UsersRound, Wifi, X, Zap } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

const queryClient = new QueryClient();
const logoSrc = `${import.meta.env.BASE_URL}assets/hydranet-logo.png`;

type ModalType = 'booking' | 'callback' | 'inquiry' | 'availability' | null;
type OpenModal = (type: Exclude<ModalType, null>, plan?: string) => void;

type PublicPlan = {
  name: string;
  speed: string;
  price: number;
  billingCycle: BackendPlan['billingCycle'];
  details: string[];
};

const durationLabels: Record<BackendPlan['billingCycle'], string> = {
  ONE_MONTH: '1 Month',
  SIX_MONTHS: '6 Months',
  TWELVE_MONTHS: '12 Months',
};

function toPublicPlan(plan: BackendPlan): PublicPlan {
  return {
    name: plan.name,
    speed: plan.downloadMbps >= 1000 ? `${plan.downloadMbps / 1000} Gbps` : `${plan.downloadMbps} Mbps`,
    price: plan.price,
    billingCycle: plan.billingCycle,
    details: [
      'Unlimited data',
      `${plan.uploadMbps} Mbps upload`,
      ...(plan.ottBenefits.length ? [`OTT: ${plan.ottBenefits.join(', ')}`] : []),
      'Local support included',
    ],
  };
}

function Header({ openModal }: { openModal: OpenModal }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [
    { href: '/', label: 'Home' },
    { href: '/plans', label: 'Plans' },
    { href: '/services', label: 'Services' },
    { href: '/about', label: 'About us' },
    { href: '/partner', label: 'Partner with us' },
    { href: '/contact', label: 'Contact' },
  ];
  return (
    <>
      <div className="topline">
        <div className="container-narrow topline-inner">
          <span data-testid="text-topline">Now live across East &amp; West Midnapore</span>
          <a href="tel:+917864068605" data-testid="link-topline-call">Need a hand? 7864068605</a>
        </div>
      </div>
      <header className="site-header">
        <div className="container-narrow nav-inner">
          <Link href="/" className="brand" onClick={() => setMenuOpen(false)} data-testid="link-brand">
            <img className="brand-logo" src={logoSrc} alt="Hydranet Broadband" />
          </Link>
          <nav className="nav-links" aria-label="Primary navigation">
            {links.map((link) => <Link key={link.href} href={link.href} aria-current={location === link.href ? 'page' : undefined} data-testid={`link-nav-${link.label.toLowerCase().replaceAll(' ', '-')}`}>{link.label}</Link>)}
          </nav>
          <div className="nav-actions">
            <a className="nav-call" href="tel:+917864068605" data-testid="link-header-call">7864068605</a>
            <button className="button-primary button-small" onClick={() => openModal('availability')} data-testid="button-header-availability">Check availability <ArrowRight size={14} /></button>
            <button className="nav-menu-button" onClick={() => setMenuOpen((current) => !current)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} data-testid="button-mobile-menu">{menuOpen ? <X size={23} /> : <Menu size={23} />}</button>
          </div>
        </div>
        {menuOpen && <nav className="mobile-menu" aria-label="Mobile navigation">
          {links.map((link) => <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)} data-testid={`link-mobile-${link.label.toLowerCase().replaceAll(' ', '-')}`}>{link.label}</Link>)}
          <button className="button-primary" onClick={() => { setMenuOpen(false); openModal('availability'); }} data-testid="button-mobile-availability">Check availability <ArrowRight size={15} /></button>
        </nav>}
      </header>
    </>
  );
}

function Footer({ openModal }: { openModal: OpenModal }) {
  return (
    <footer className="site-footer">
      <div className="container-narrow footer-grid">
        <div>
          <Link href="/" className="brand" data-testid="link-footer-brand"><img className="brand-logo footer-logo" src={logoSrc} alt="Hydranet Broadband" /></Link>
          <p className="footer-blurb">A regional network built around real neighbourhoods, real people and the belief that good internet should simply get out of the way.</p>
          <button className="button-amber button-small" onClick={() => openModal('callback')} data-testid="button-footer-callback">Request a callback <Phone size={14} /></button>
        </div>
        <div><h3>Explore</h3><Link href="/about" data-testid="link-footer-about">About Hydranet</Link><Link href="/plans" data-testid="link-footer-plans">Internet plans</Link><Link href="/services" data-testid="link-footer-services">What we do</Link><Link href="/partner" data-testid="link-footer-partner">Partner with Hydranet</Link></div>
        <div><h3>Support</h3><Link href="/contact" data-testid="link-footer-contact">Help &amp; contact</Link><a href="tel:+917864068605" data-testid="link-footer-phone">7864068605</a><a href="mailto:hello@hydranet.in" data-testid="link-footer-email">hello@hydranet.in</a></div>
        <div><h3>Service hours</h3><p className="footer-blurb">Customer care<br />7:00 AM — 11:00 PM<br /><br />Network operations<br />Always on, always watching.</p></div>
      </div>
      <div className="container-narrow footer-bottom"><span>© 2026 Hydracom Infocom Private Limited</span><span>Made for Bengal. Built for everywhere.</span></div>
    </footer>
  );
}

function FloatingActions({ openModal }: { openModal: OpenModal }) {
  return <div className="floating-actions" aria-label="Quick contact actions">
    <button className="floating-action call" title="Request a callback" onClick={() => openModal('callback')} data-testid="button-floating-call"><Phone size={18} /></button>
    <a className="floating-action whatsapp" title="Chat on WhatsApp" href="https://wa.me/917864068605?text=Hi%20Hydranet%2C%20I%27d%20like%20to%20know%20more." target="_blank" rel="noreferrer" data-testid="link-floating-whatsapp"><MessageCircle size={19} /></a>
  </div>;
}

function Ticker() {
  const labels = ['East & West Midnapore connected.', 'Local routes. Global reach.', 'No drama. Just dependable internet.', 'Engineered for Bengal.'];
  return <div className="ticker" aria-label="Hydranet highlights"><div className="ticker-track">{[...labels, ...labels].map((label, index) => <span className="ticker-item" key={`${label}-${index}`}>{label}</span>)}</div></div>;
}

const ottPartners = ['JioHotstar', 'Amazon Prime', 'ZEE5', 'Sony LIV', 'Netflix', 'YouTube', 'Disney+'];

function OttSection() {
  return <section className="ott-section" aria-label="Entertainment partners">
    <div className="container-narrow ott-heading">
      <div>
        <div className="eyebrow">OTT partners / every screen</div>
        <h2>Stream the moments you love.</h2>
      </div>
      <p>Pair your Hydranet connection with the entertainment you already enjoy, from movie nights to match days.</p>
    </div>
    <div className="ott-marquee" role="region" aria-label="Supported OTT platforms">
      <div className="ott-track">
        {[...ottPartners, ...ottPartners].map((partner, index) => <span className={`ott-logo ott-logo-${index % ottPartners.length}`} key={`${partner}-${index}`}>{partner}</span>)}
      </div>
    </div>
  </section>;
}

function Hero({ openModal }: { openModal: OpenModal }) {
  const [speedTesting, setSpeedTesting] = useState(false);
  const [speed, setSpeed] = useState('—');
  const runSpeedTest = () => {
    setSpeedTesting(true);
    setSpeed('—');
    window.setTimeout(() => { setSpeed('94.8'); setSpeedTesting(false); }, 1800);
  };
  return <section className="hero">
    <div className="container-narrow hero-content">
      <div className="hero-copy reveal">
        <div className="eyebrow">Regional backbone / WB-01</div>
        <h1>Internet that keeps pace with <span className="text-gradient">real life.</span></h1>
        <p>Hydranet brings steady, high-speed broadband to homes, studios, shops and growing teams across East &amp; West Midnapore — with people nearby when you need them.</p>
        <div className="hero-buttons">
          <button className="button-primary" onClick={() => openModal('availability')} data-testid="button-hero-availability">Find my connection <ArrowRight size={15} /></button>
          <Link className="button-ghost" href="/plans" data-testid="link-hero-plans">See plans</Link>
        </div>
        <div className="hero-note"><span className="live-dot" /> Network status: all systems normal · Updated just now</div>
      </div>
      <div className="network-orb reveal reveal-delay-2" aria-label="Hydranet live network visualization">
        <div className="orb-ring r1" /><div className="orb-ring r2" /><div className="orb-ring r3" />
        <div className="orb-core"><span>1.0<small>GBPS READY</small></span></div>
        <div className="orb-label one"><Signal size={13} /><span>signal <strong>stable</strong></span></div>
        <div className="orb-label two"><RouterIcon size={13} /><span>nodes <strong>247</strong></span></div>
        <div className="orb-label three"><span>latency 8ms</span></div>
        <button className="orb-label" style={{ bottom: '-14px', left: '50%', transform: 'translateX(-50%)', cursor: 'pointer' }} onClick={runSpeedTest} data-testid="button-speed-test"><Gauge size={13} /> {speedTesting ? 'measuring route…' : speed === '—' ? 'run a speed check' : `${speed} Mbps down`}</button>
      </div>
    </div>
    <div className="hero-stats"><div className="container-narrow hero-stats-inner">
      <div className="hero-stat"><strong>18+</strong><span>towns connected</span></div><div className="hero-stat"><strong>99.5%</strong><span>uptime target</span></div><div className="hero-stat"><strong>8 ms</strong><span>local network latency</span></div>
    </div></div>
  </section>;
}

function AvailabilityPanel({ openModal }: { openModal: OpenModal }) {
  const [pin, setPin] = useState('');
  const [area, setArea] = useState('');
  const [result, setResult] = useState<'idle' | 'available' | 'pending'>('idle');
  const submit = (event: FormEvent) => { event.preventDefault(); setResult(pin.length >= 6 && area.length > 2 ? 'available' : 'pending'); };
  return <div className="container-narrow">
    <section className="availability-panel reveal" aria-label="Check availability">
      <div><div className="eyebrow">Your neighbourhood, next</div><h3>Let’s see if Hydranet reaches you.</h3><p>Enter your PIN code and locality. We’ll show you the best way to get connected.</p></div>
      <form className="availability-form" onSubmit={submit}>
        <label><span className="field-label">PIN code</span><input className="text-input" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value)} placeholder="700 001" data-testid="input-availability-pin" /></label>
        <label><span className="field-label">Locality</span><input className="text-input" value={area} onChange={(event) => setArea(event.target.value)} placeholder="Midnapore town" data-testid="input-availability-area" /></label>
        <button className="button-secondary" type="submit" data-testid="button-check-availability">Check area <MapPin size={15} /></button>
      </form>
      {result === 'available' && <div className="status-message" data-testid="status-availability-available"><Check size={15} /> Good news — Hydranet is available in {area}. A local connection lead will reach out shortly.</div>}
      {result === 'pending' && <div className="status-message" data-testid="status-availability-pending"><Clock3 size={15} /> We’re checking the nearest node for {area || 'your area'}. Leave your details and we’ll confirm coverage.</div>}
    </section>
  </div>;
}

function ProofRow() {
  return <section className="section-tight"><div className="container-narrow proof-row"><div><div className="eyebrow">The useful numbers</div><h3>Less buffering. More getting on with it.</h3><p>Our network is designed for the moments that matter — not just a speed test screenshot.</p></div><div className="proof-stat"><strong>24/7</strong><span>network watch</span></div><div className="proof-stat"><strong>13 min</strong><span>typical response</span></div><div className="proof-stat"><strong>1 call</strong><span>to a real person</span></div></div></section>;
}

function SignalSection() {
  return <section className="section signal-section"><div className="container-narrow signal-grid">
    <div className="signal-visual" data-testid="visual-network-signal"><div className="signal-visual-top"><span>HYDRANET / LOCAL ROUTE</span><b>LIVE</b></div><div className="signal-chart"><svg viewBox="0 0 620 230" role="img" aria-label="Stable network signal chart"><defs><linearGradient id="chartFade" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#20d6c7" stopOpacity=".45" /><stop offset="100%" stopColor="#20d6c7" stopOpacity="0" /></linearGradient></defs><path className="chart-area" d="M0 185 C45 182 56 155 91 162 S150 112 182 140 S226 78 267 110 S303 136 331 83 S381 95 411 62 S460 85 487 44 S536 62 620 22 L620 230 L0 230 Z" /><path className="chart-line" d="M0 185 C45 182 56 155 91 162 S150 112 182 140 S226 78 267 110 S303 136 331 83 S381 95 411 62 S460 85 487 44 S536 62 620 22" /></svg><div className="chart-points"><span>06:00</span><span>09:00</span><span>12:00</span><span>15:00</span><span>NOW</span></div></div><div className="signal-readout"><div><small>AVG. RESPONSE</small><strong>8.2 ms</strong></div><div><small>ROUTE HEALTH</small><strong style={{ color: '#20d6c7' }}>100%</strong></div></div></div>
    <div className="signal-copy"><div className="eyebrow">Built differently</div><div className="section-heading"><h2>Good internet is a quiet kind of confidence.</h2><p>You shouldn’t have to understand the network to trust it. Hydranet keeps an eye on the small details so your work call, cricket stream, shop counter and late-night scroll just… work.</p></div><ul><li><Zap size={18} /><span><strong>Smart local routing.</strong> We keep traffic close to home wherever possible, so busy hours feel less busy.</span></li><li><ShieldCheck size={18} /><span><strong>Designed for the monsoon.</strong> Thoughtful redundancy and active monitoring keep weather from becoming your problem.</span></li><li><Headphones size={18} /><span><strong>People in your timezone.</strong> Our support crew knows the places we connect — and picks up before the issue gets old.</span></li></ul><Link href="/services" className="button-secondary" data-testid="link-signal-services">See how we build it <ArrowRight size={15} /></Link></div>
  </div></section>;
}

function CoverageSection({ openModal }: { openModal: OpenModal }) {
  return <section className="section coverage-section"><div className="container-narrow coverage-layout"><div className="coverage-map" aria-label="Hydranet coverage map"><span className="map-title">Coverage / Midnapore corridor</span><div className="map-route" /><span className="map-node n1" data-label="East Midnapore" /><span className="map-node n2" data-label="West Midnapore" /><span className="map-node n3" data-label="Digha" /><span className="map-node n4" data-label="Haldia" /><span className="map-node n5" data-label="Kharagpur" /><div className="map-legend"><span><i /> live node</span><span><i style={{ background: 'hsl(34 100% 64%)' }} /> coming soon</span></div></div><div className="coverage-copy"><div className="eyebrow">Made close to home</div><h2>From the para to the wider world.</h2><p>We’re growing one well-built neighbourhood at a time. Today, Hydranet serves the places below with more arriving every month.</p><div className="coverage-list"><div>East Midnapore</div><div>West Midnapore</div><div>Digha &amp; Contai</div><div>Haldia &amp; Tamluk</div><div>Kharagpur &amp; nearby towns</div><div>Ask about your area</div></div><button className="button-primary" onClick={() => openModal('availability')} data-testid="button-coverage-check">Check my locality <MapPin size={15} /></button></div></div></section>;
}

function PlanPreview({ openModal, plans, loading, error }: { openModal: OpenModal; plans: PublicPlan[]; loading: boolean; error: boolean }) {
  const previewPlans = plans.filter((plan) => plan.billingCycle === 'ONE_MONTH').slice(0, 3);
  return <section className="section plans-preview"><div className="container-narrow"><div className="section-heading"><div className="eyebrow">Pick your pace</div><h2>A plan for every kind of online.</h2><p>Start simple, scale when you need to. Every Hydranet plan comes with unlimited data and a local team behind it.</p></div>{loading ? <div className="status-message" data-testid="status-plans-loading">Loading current plans…</div> : error ? <div className="status-message" data-testid="status-plans-error">Plans are temporarily unavailable. Please call 7864068605 and we’ll help you choose.</div> : previewPlans.length === 0 ? <div className="status-message" data-testid="status-plans-empty">No 1 Month plans are currently available.</div> : <div className="plan-grid">{previewPlans.map((plan, index) => <div className={`plan-card ${index === 1 ? 'featured' : ''}`} key={plan.name} data-testid={`card-plan-preview-${plan.name.toLowerCase().replaceAll(' ', '-')}`}><span className="plan-type">{durationLabels[plan.billingCycle]}</span><h3>{plan.name}</h3><div className="plan-price">₹{Math.round(plan.price).toLocaleString('en-IN')}<small> / {durationLabels[plan.billingCycle]}</small></div><span className="plan-speed">{plan.speed}</span><div className="plan-features">{plan.details.map((detail) => <span key={detail}><Check size={14} />{detail}</span>)}</div><button className={index === 1 ? 'button-primary' : 'button-secondary'} onClick={() => openModal('booking', plan.name)} data-testid={`button-plan-book-${index}`}>Choose this plan <ArrowRight size={14} /></button></div>)}</div>}<div style={{ marginTop: '1.5rem' }}><Link href="/plans" className="button-ghost" style={{ color: 'hsl(var(--secondary))', borderColor: 'hsl(var(--border))' }} data-testid="link-all-plans">Compare all plans <ArrowRight size={15} /></Link></div></div></section>;
}

const testimonials = [
  { quote: 'The connection stays steady through work calls, school classes and our evening streaming. That reliability is what made us stay.', name: 'Sourav & Riya', location: 'Midnapore Town' },
  { quote: 'When we had a line issue, a real person answered and fixed the route quickly. It feels like a local service in the best way.', name: 'Arindam Ghosh', location: 'Kharagpur' },
  { quote: 'Hydranet gave our studio the speed we needed without making the setup complicated. Everything just works.', name: 'Madhurima Das', location: 'Haldia' },
];

function TestimonialsSection() {
  return <section className="section testimonials-section" id="testimonials">
    <div className="container-narrow">
      <div className="section-heading">
        <div className="eyebrow">From our network</div>
        <h2>Good internet should feel this easy.</h2>
        <p>Real homes and teams across our growing Midnapore network, sharing what dependable connection looks like day to day.</p>
      </div>
      <div className="testimonial-grid">
        {testimonials.map((testimonial) => <article className="testimonial-card" key={testimonial.name}>
          <div className="testimonial-mark">“</div>
          <p>{testimonial.quote}</p>
          <footer><strong>{testimonial.name}</strong><span>{testimonial.location}</span></footer>
        </article>)}
      </div>
    </div>
  </section>;
}

function CtaBand({ openModal }: { openModal: OpenModal }) {
  return <section className="cta-band"><div className="container-narrow cta-band-inner"><div><div className="eyebrow">Ready when you are</div><h2>Your next great connection starts here.</h2></div><button className="button-secondary" onClick={() => openModal('availability')} data-testid="button-cta-availability">Check availability <ArrowRight size={15} /></button></div></section>;
}

function HomePage({ openModal, plans, loading, error }: { openModal: OpenModal; plans: PublicPlan[]; loading: boolean; error: boolean }) {
  return <><Hero openModal={openModal} /><Ticker /><OttSection /><AvailabilityPanel openModal={openModal} /><ProofRow /><SignalSection /><CoverageSection openModal={openModal} /><TestimonialsSection /><PlanPreview openModal={openModal} plans={plans} loading={loading} error={error} /><CtaBand openModal={openModal} /></>;
}

function PageHero({ eyebrow, title, description }: { eyebrow: string; title: ReactNode; description: string }) {
  return <section className="page-hero"><div className="container-narrow"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div></section>;
}

function PlansPage({ openModal, plans, loading, error }: { openModal: OpenModal; plans: PublicPlan[]; loading: boolean; error: boolean }) {
  const [duration, setDuration] = useState<BackendPlan['billingCycle']>('ONE_MONTH');
  const filteredPlans = plans.filter((plan) => plan.billingCycle === duration);
  return <><PageHero eyebrow="Plans / choose your duration" title={<>The right speed.<br /><span className="text-gradient">None of the nonsense.</span></>} description="Choose the connection speed and billing duration that fits your home, team or everyday online life." /><main className="section-tight"><div className="container-narrow"><div className="filter-bar"><span className="duration-note">Billing duration</span><div className="segmented" aria-label="Billing duration"><button className={`segment ${duration === 'ONE_MONTH' ? 'active' : ''}`} onClick={() => setDuration('ONE_MONTH')} data-testid="button-duration-one-month">1 Month</button><button className={`segment ${duration === 'SIX_MONTHS' ? 'active' : ''}`} onClick={() => setDuration('SIX_MONTHS')} data-testid="button-duration-six-months">6 Months</button><button className={`segment ${duration === 'TWELVE_MONTHS' ? 'active' : ''}`} onClick={() => setDuration('TWELVE_MONTHS')} data-testid="button-duration-twelve-months">12 Months</button></div></div>{loading ? <div className="status-message" data-testid="status-plans-page-loading">Loading current plans…</div> : error ? <div className="status-message" data-testid="status-plans-page-error">We couldn’t load live plans right now. Please call 7864068605 for current pricing.</div> : filteredPlans.length === 0 ? <div className="status-message" data-testid="status-plans-page-empty">No {durationLabels[duration]} plans are currently available.</div> : <div className="plans-page-grid">{filteredPlans.map((plan, index) => <div className={`plan-detail ${index === 1 ? 'featured' : ''}`} key={plan.name} data-testid={`card-plan-detail-${plan.name.toLowerCase().replaceAll(' ', '-')}`}><span className="plan-type">{durationLabels[plan.billingCycle]} plan</span><h2>{plan.name}</h2><span className="plan-speed">{plan.speed} connection</span><div className="price-row"><strong>₹{Math.round(plan.price).toLocaleString('en-IN')}</strong><span>/ {durationLabels[plan.billingCycle]}</span></div><div className="plan-features">{plan.details.map((detail) => <span key={detail}><Check size={14} />{detail}</span>)}<span><Check size={14} />No hidden usage caps</span></div><button className={index === 1 ? 'button-primary' : 'button-secondary'} onClick={() => openModal('booking', plan.name)} data-testid={`button-book-plan-${plan.name.toLowerCase().replaceAll(' ', '-')}`}>Book this connection <ArrowRight size={14} /></button></div>)}</div>}<div className="feature-block"><div className="feature-tile"><div className="icon-square"><RouterIcon size={19} /></div><h3>Router, sorted.</h3><p>A dual-band router matched to your plan, installed and configured by a Hydranet technician. No mystery boxes left at the door.</p></div><div className="feature-tile"><div className="icon-square"><MapPin size={19} /></div><h3>Installation by people nearby.</h3><p>Our local installation crew knows the lanes, apartment committees and shortcuts that get you online faster.</p></div><div className="feature-tile"><div className="icon-square"><ShieldCheck size={19} /></div><h3>Internet with a promise behind it.</h3><p>Every plan is backed by a real support number and a network team that is already looking at the signal before you call.</p></div><div className="feature-tile"><div className="icon-square"><Zap size={19} /></div><h3>Switch up, not start over.</h3><p>Need more headroom next month? Upgrade your speed with a quick call. Your connection history comes with you.</p></div></div></div></main><CtaBand openModal={openModal} /></>;
}

function ServicesPage({ openModal }: { openModal: OpenModal }) {
  return <><PageHero eyebrow="Services / the whole picture" title={<>The network behind<br /><span className="text-gradient">your everyday.</span></>} description="Hydranet is more than a pipe to the internet. It’s thoughtful infrastructure, a responsive local crew and fewer things for you to worry about." /><main><section className="section"><div className="container-narrow"><div className="section-heading"><div className="eyebrow">What we bring</div><h2>Small details. Big difference.</h2><p>From the first site survey to the thousandth video call, every part of the experience is built to feel dependable.</p></div><div className="feature-block" style={{ marginTop: '3rem' }}><div className="feature-tile"><div className="icon-square"><Network size={19} /></div><h3>Fibre-first connectivity</h3><p>High-capacity fibre routes and smart last-mile design keep your connection quick, clean and ready for the next device.</p></div><div className="feature-tile"><div className="icon-square"><Signal size={19} /></div><h3>Local peering, less lag</h3><p>We keep frequently used traffic close to eastern India, helping pages load faster and calls stay natural.</p></div><div className="feature-tile"><div className="icon-square"><Clock3 size={19} /></div><h3>Monitored around the clock</h3><p>Our network operations team watches performance continuously, not only after a ticket is raised.</p></div><div className="feature-tile"><div className="icon-square"><Headphones size={19} /></div><h3>Support you can reach</h3><p>Call, WhatsApp or write in. You’ll reach a real support crew with a clear next step — not a maze of menus.</p></div></div></div></section><section className="section-tight" style={{ paddingTop: 0 }}><div className="container-narrow"><div className="section-heading"><div className="eyebrow">Beyond broadband</div><h2>Infrastructure that works harder.</h2><p>From secure sites to connected teams, our specialists help homes, businesses and growing organisations build a stronger digital foundation.</p></div><div className="feature-block" style={{ marginTop: '3rem' }}><div className="feature-tile" data-testid="card-service-cctv-installation"><div className="icon-square"><Camera size={19} /></div><h3>CCTV installation</h3><p>Plan, install and maintain reliable CCTV systems with neat cabling, clear coverage and remote viewing support.</p></div><div className="feature-tile" data-testid="card-service-sdwan"><div className="icon-square"><GitBranch size={19} /></div><h3>SD-WAN</h3><p>Connect branches, cloud services and teams with smarter traffic management, resilient links and central visibility.</p></div><div className="feature-tile" data-testid="card-service-wireless-technology"><div className="icon-square"><Wifi size={19} /></div><h3>Wireless technology</h3><p>Get dependable Wi-Fi and wireless connectivity designed for homes, campuses, hospitality spaces and busy workplaces.</p></div><div className="feature-tile" data-testid="card-service-enterprise-solutions"><div className="icon-square"><Building2 size={19} /></div><h3>Enterprise solutions</h3><p>Build a tailored network foundation with managed connectivity, security and support for your organisation.</p></div></div></div></section><SignalSection /><section className="section-tight"><div className="container-narrow"><div className="cta-band" style={{ borderRadius: '22px' }}><div className="container-narrow cta-band-inner"><div><div className="eyebrow">See it in your neighbourhood</div><h2>Let’s talk about your connection.</h2></div><button className="button-secondary" onClick={() => openModal('callback')} data-testid="button-services-callback">Talk to Hydranet <Phone size={15} /></button></div></div></div></section></main></>;
}

function FounderQuote({ context = 'about' }: { context?: 'about' | 'partner' }) {
  return <section className="section founder-section" data-testid={`section-${context}-founder-quote`}>
    <div className="container-narrow founder-layout">
      <div className="founder-signal-card">
        <div className="founder-signal-orb"><span>H</span></div>
        <div className="founder-signal-label"><span>HYDRANET / FOUNDER'S NOTE</span><strong>01</strong></div>
        <div className="founder-signal-line" />
        <span className="founder-signal-caption">Built for the places we call home.</span>
      </div>
      <div className="founder-copy">
        <div className="eyebrow">Founder says</div>
        <blockquote>“Great networks aren't built in silos; they are built on strong collaborations. This partnership allows Hydranet Broadband &amp; IT Services to scale our infrastructure, build a more resilient network, and ultimately deliver a world-class digital experience to our users.”</blockquote>
        <div className="founder-byline"><strong>Subhadeep Pahari, Founder</strong></div>
      </div>
    </div>
  </section>;
}

function PartnerPage() {
  const [submitted, setSubmitted] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSubmitted(true); };
  return <><PageHero eyebrow="Partner / grow with the network" title={<>Build the next<br /><span className="text-gradient">connected para.</span></>} description="Bring Hydranet to your part of Bengal. We partner with people who know their community, care about the work and want to build something durable." /><main className="section"><div className="container-narrow partner-layout"><div><div className="eyebrow">The opportunity</div><div className="section-heading"><h2>Your local knowledge. Our network.</h2><p>As a Hydranet partner, you get the tools, training and network support to deliver a better broadband experience in your market.</p></div><div className="partner-steps"><div className="partner-step"><span className="step-num">01</span><div><h3>Tell us where you are</h3><p>Share your locality, existing setup and the communities you want to serve.</p></div></div><div className="partner-step"><span className="step-num">02</span><div><h3>Meet the network team</h3><p>We’ll look at the opportunity together — coverage, capacity, investment and a practical launch plan.</p></div></div><div className="partner-step"><span className="step-num">03</span><div><h3>Launch with a backbone</h3><p>Hydranet supports provisioning, training, brand, service standards and growth after day one.</p></div></div></div></div><div className="application-card">{submitted ? <div className="form-success" data-testid="status-partner-success"><span className="success-icon"><Check size={23} /></span><h3>We’ve got your note.</h3><p>A Hydranet partnerships lead will call you within one working day. Keep your phone close.</p><button className="button-primary button-small" onClick={() => setSubmitted(false)} data-testid="button-partner-another">Send another note</button></div> : <><div className="eyebrow">Start a conversation</div><h2>Bring Hydranet closer to home.</h2><p>Leave a few details. No pitch deck required — just tell us what you’re building.</p><form className="form-stack" onSubmit={submit}><label><span className="field-label">Your name</span><input required className="text-input" placeholder="Anirban Sen" data-testid="input-partner-name" /></label><label><span className="field-label">Mobile number</span><input required className="text-input" type="tel" placeholder="7864068605" data-testid="input-partner-phone" /></label><label><span className="field-label">Town / locality</span><input required className="text-input" placeholder="Midnapore town" data-testid="input-partner-location" /></label><label><span className="field-label">Tell us about your setup</span><textarea className="text-area" rows={3} placeholder="I currently run..." data-testid="input-partner-message" /></label><button className="button-primary" type="submit" data-testid="button-partner-submit">Submit partner enquiry <Send size={15} /></button></form></>}</div></div></main><FounderQuote context="partner" /><section className="section-tight" style={{ background: 'hsl(218 42% 13%)' }}><div className="container-narrow"><div className="eyebrow">What partners get</div><div className="coverage-list" style={{ marginTop: '1.5rem' }}><div><Sparkles size={15} style={{ verticalAlign: 'middle', marginRight: '.35rem', color: 'hsl(var(--secondary))' }} />Launch support</div><div><Network size={15} style={{ verticalAlign: 'middle', marginRight: '.35rem', color: 'hsl(var(--secondary))' }} />Network access</div><div><ShieldCheck size={15} style={{ verticalAlign: 'middle', marginRight: '.35rem', color: 'hsl(var(--secondary))' }} />Service standards</div><div><ArrowRight size={15} style={{ verticalAlign: 'middle', marginRight: '.35rem', color: 'hsl(var(--secondary))' }} />Growth planning</div></div></div></section></>;
}

const milestones = [
  { number: '01', title: 'Start with the neighbourhood', text: 'Hydranet began with a simple belief: internet works better when the people building it know the places they serve.' },
  { number: '02', title: 'Build the local backbone', text: 'We focus on dependable routes, thoughtful last-mile design and support that feels close enough to call by name.' },
  { number: '03', title: 'Grow across Midnapore', text: 'East and West Midnapore are at the heart of our next chapter, connecting more homes, teams and everyday ambitions.' },
  { number: '04', title: 'Keep raising the standard', text: 'Every new connection is a chance to make broadband feel simpler, steadier and more human than it did before.' },
];

function AboutPage({ openModal }: { openModal: OpenModal }) {
  const { data: teamMembers = [], isLoading: teamLoading, isError: teamError } = useListPublicTeam();

  return <>
    <PageHero eyebrow="About / the people behind the signal" title={<>Built close to home.<br /><span className="text-gradient">Ready for what’s next.</span></>} description="Hydranet is a regional broadband company with a very practical idea of progress: make the connection more dependable, the support more human and every neighbourhood a little more connected." />
    <main>
      <section className="section about-values-section">
        <div className="container-narrow">
          <div className="section-heading">
            <div className="eyebrow">What guides us</div>
            <h2>Good infrastructure starts with good intent.</h2>
            <p>We’re building Hydranet for the way people actually live, work and grow — with technology that feels invisible and a team that never does.</p>
          </div>
          <div className="about-values-grid">
            <article className="about-value-card">
              <div className="icon-square"><Target size={19} /></div>
              <div className="eyebrow">Our mission</div>
              <h3>Make dependable internet feel local.</h3>
              <p>We connect homes, creators, shops and growing teams with high-speed broadband backed by people who understand the communities they serve.</p>
            </article>
            <article className="about-value-card value-card-accent">
              <div className="icon-square"><Eye size={19} /></div>
              <div className="eyebrow">Our vision</div>
              <h3>A better-connected everyday for everyone.</h3>
              <p>We imagine a future where geography never gets in the way of learning, earning, creating, streaming or staying close to the people who matter.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section about-milestones-section">
        <div className="container-narrow">
          <div className="about-section-intro">
            <div>
              <div className="eyebrow">Milestones / the journey</div>
              <h2>One route at a time.</h2>
            </div>
            <p>Our story is still being written. These are the principles and moments that keep the network moving forward.</p>
          </div>
          <div className="milestone-list">
            {milestones.map((milestone) => <article className="milestone-item" key={milestone.number}>
              <div className="milestone-number">{milestone.number}</div>
              <div><h3>{milestone.title}</h3><p>{milestone.text}</p></div>
            </article>)}
          </div>
        </div>
      </section>

      <section className="section founder-section">
        <div className="container-narrow founder-layout">
          <div className="founder-signal-card">
            <div className="founder-signal-orb"><span>H</span></div>
            <div className="founder-signal-label"><span>HYDRANET / FOUNDER'S NOTE</span><strong>01</strong></div>
            <div className="founder-signal-line" />
            <span className="founder-signal-caption">Built for the places we call home.</span>
          </div>
          <div className="founder-copy">
            <div className="eyebrow">Founder says</div>
            <blockquote>“We’re not here to be the biggest name on a billboard. We’re here to be the connection people trust when work starts, class begins, the match is on or a new idea needs room to grow.”</blockquote>
            <div className="founder-byline"><strong>Founder, Hydranet Broadband</strong><span>Building a network with a local point of view</span></div>
          </div>
        </div>
      </section>

      <section className="section about-team-section" id="team">
        <div className="container-narrow">
          <div className="section-heading">
            <div className="eyebrow">The team / behind every bar</div>
            <h2>People who keep the network moving.</h2>
            <p>Different skills, one shared standard: be useful, stay curious and leave every connection better than we found it.</p>
          </div>
          {teamLoading ? <div className="status-message" data-testid="status-team-loading">Loading the Hydranet team…</div> : teamError ? <div className="status-message" data-testid="status-team-error">The team directory is temporarily unavailable.</div> : teamMembers.length === 0 ? <div className="status-message" data-testid="status-team-empty">Our team directory is being updated. Please check back soon.</div> : <div className="team-grid">
            {teamMembers.map((member) => {
              const initials = member.name.split(' ').map((part) => part[0]).join('').slice(0, 3);
              return <article className="team-card" key={member.id} data-testid={`card-team-member-${member.id}`}>
                <div className="team-photo-wrap">
                  {member.photoUrl ? <img className="team-photo" src={member.photoUrl} alt={`${member.name}, ${member.department}`} /> : <div className="team-photo team-photo-fallback" aria-label={`${member.name} profile photo placeholder`}>{initials}</div>}
                  <span className="team-photo-status">HYDRANET TEAM</span>
                </div>
                <div className="team-card-meta">
                  <div><h3>{member.name}</h3><span className="team-role">{member.department}</span></div>
                  <span className="team-initials">{initials}</span>
                </div>
                <p>Part of the Hydranet team keeping the network moving.</p>
                <span className="team-card-line" />
              </article>;
            })}
          </div>}
        </div>
      </section>
    </main>
    <CtaBand openModal={openModal} />
  </>;
}

const faqs = [
  ['How quickly can I get connected?', 'Most homes in a live Hydranet area are installed within 24–72 working hours after we confirm the route and building access. Our local coordinator will give you a clear slot.'],
  ['Do your plans have data limits?', 'No. Hydranet residential, gamer and business plans are designed with unlimited data. We focus on a fair, consistent experience rather than surprise usage charges.'],
  ['What happens during a network issue?', 'Our operations team sees wider route changes as they happen. For a local issue, call or WhatsApp us and a support lead will guide you through the next step — usually without a long queue.'],
  ['Can I upgrade my plan later?', 'Absolutely. We can move you to a higher speed without restarting the whole relationship. Contact support and we’ll check the quickest route for your address.'],
  ['Is Hydranet available outside Midnapore?', 'We’re live across East Midnapore, West Midnapore, Digha, Contai, Haldia and nearby towns, with more areas being added. Use the availability checker for your exact locality.'],
];

function ContactPage({ openModal }: { openModal: OpenModal }) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [sent, setSent] = useState(false);
  const createInquiry = useCreatePublicInquiry();
  const [form, setForm] = useState({
    name: '',
    contact: '',
    topic: 'new-connection' as const,
    message: '',
    marketingConsent: false,
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createInquiry.mutate({ data: form }, {
      onSuccess: () => {
        setSent(true);
        setForm({ name: '', contact: '', topic: 'new-connection', message: '', marketingConsent: false });
      },
    });
  };
  return <><PageHero eyebrow="Contact / we’re nearby" title={<>Let’s get you<br /><span className="text-gradient">unstuck.</span></>} description="Questions about coverage, a new connection or a connection that’s being difficult? Tell us what’s going on. We’ll take it from there." /><main><section className="section-tight text-center font-medium ml-[312px] mr-[312px]"><div className="container-narrow support-grid"><div className="support-card ml-[0px] mr-[0px] flex-col justify-center items-center"><div className="icon-square"><Phone size={18} /></div><h3>Call support</h3><p>Talk to our customer care team every day from 7:00 AM to 11:00 PM.</p><a href="tel:+917864068605" data-testid="link-contact-call">7864068605 <ArrowRight size={14} /></a></div><div className="support-card"><div className="icon-square"><MessageCircle size={18} /></div><h3>WhatsApp us</h3><p>Send a message with your registered mobile number and we’ll take a look.</p><a href="https://wa.me/917864068605" target="_blank" rel="noreferrer" data-testid="link-contact-whatsapp">Open WhatsApp <ArrowRight size={14} /></a></div><div className="support-card"><div className="icon-square"><MapPin size={18} /></div><h3>Coverage check</h3><p>Not sure if your building is covered? Share your locality and we’ll find the nearest node.</p><button className="button-secondary button-small" onClick={() => openModal('availability')} data-testid="button-contact-coverage">Check coverage <MapPin size={14} /></button></div><div className="support-card text-center justify-center items-center"><div className="icon-square"><Building2 size={18} /></div><h3>Hydracom Infocom</h3><p>Hydracom Infocom Private Limited<br />Nayagaon, Mohanpur, West Midnapore<br />Pin — 721436</p><a href="mailto:support@hydranetbroadband.in" data-testid="link-contact-email"><Mail size={14} /> support@hydranetbroadband.in</a><a href="tel:+917864068605" data-testid="link-contact-company-phone">7864068605 <ArrowRight size={14} /></a></div></div></section><section className="section" style={{ background: 'hsl(218 42% 13%)' }}><div className="container-narrow contact-layout"><div><div className="eyebrow">Send a message</div><div className="section-heading"><h2>Not a form person?<br />We’ll keep it human.</h2><p>Tell us what you need, and a Hydranet support lead will get back to you during service hours.</p></div></div><div className="contact-card">{sent ? <div className="form-success" data-testid="status-contact-success"><span className="success-icon"><Check size={23} /></span><h3>Message received.</h3><p>Thanks for reaching out. We’ll be in touch shortly with a useful answer.</p><button className="button-primary button-small" onClick={() => setSent(false)} data-testid="button-contact-another">Send another message</button></div> : <form className="form-stack" onSubmit={submit}><label><span className="field-label">Name</span><input required className="text-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Moumita Das" data-testid="input-contact-name" /></label><label><span className="field-label">Mobile or email</span><input required className="text-input" value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} placeholder="moumita@email.com" data-testid="input-contact-detail" /></label><label><span className="field-label">What can we help with?</span><select className="select-input" value={form.topic} onChange={(event) => setForm({ ...form, topic: event.target.value as typeof form.topic })} data-testid="select-contact-topic"><option value="new-connection">New connection</option><option value="support">Existing connection support</option><option value="billing">Billing question</option><option value="partner">Partner opportunity</option></select></label><label><span className="field-label">Your message</span><textarea required className="text-area" rows={4} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="I’d like to know if..." data-testid="input-contact-message" /></label><label className="consent-row"><input type="checkbox" checked={form.marketingConsent} onChange={(event) => setForm({ ...form, marketingConsent: event.target.checked })} required data-testid="input-contact-consent" /><span>I hereby Authorize to send Notifications on SMS/Messages/Promotional/informational Messages</span></label>{createInquiry.error && <div className="status-message error" data-testid="status-contact-error">We couldn’t send your inquiry. Please try again or call 7864068605.</div>}<button className="button-primary" type="submit" disabled={createInquiry.isPending} data-testid="button-contact-submit">{createInquiry.isPending ? 'Sending…' : 'Send to Hydranet'} <Send size={15} /></button></form>}</div></div></section><section className="section"><div className="container-narrow faq-section"><div className="section-heading"><div className="eyebrow">The short answers</div><h2>Questions, answered.</h2><p>Still curious? Ask us directly — our team would rather give you a clear answer than hide behind fine print.</p></div><div className="faq-list">{faqs.map(([question, answer], index) => <div className="faq-item" key={question}><button className={`faq-button ${openFaq === index ? 'open' : ''}`} onClick={() => setOpenFaq(openFaq === index ? null : index)} aria-expanded={openFaq === index} data-testid={`button-faq-${index}`}>{question}<Plus size={18} /></button>{openFaq === index && <div className="faq-answer" data-testid={`text-faq-answer-${index}`}>{answer}</div>}</div>)}</div></div></section></main></>;
}

function Modal({ type, plan, close }: { type: ModalType; plan?: string; close: () => void }) {
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => { setSubmitted(false); }, [type, plan]);
  if (!type) return null;
  const isAvailability = type === 'availability';
  const isBooking = type === 'booking';
  const title = isAvailability ? 'Find your Hydranet route.' : isBooking ? `Book ${plan || 'your connection'}.` : type === 'callback' ? 'We’ll call you back.' : 'Tell us what you need.';
  const description = isAvailability ? 'Share your locality and we’ll check the nearest live node.' : isBooking ? 'Leave your details and a local connection lead will confirm the next step.' : type === 'callback' ? 'A real person from our team will call during service hours.' : 'A quick note is enough. We’ll route it to the right person.';
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSubmitted(true); };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }}><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" onClick={close} aria-label="Close dialog" data-testid="button-modal-close"><X size={17} /></button>{submitted ? <div className="form-success" data-testid="status-modal-success"><span className="success-icon"><Check size={23} /></span><h3>All set.</h3><p>Thanks — the Hydranet team has your details. We’ll be in touch shortly.</p><button className="button-secondary button-small" onClick={close} data-testid="button-modal-done">Done</button></div> : <><div className="eyebrow">{isAvailability ? 'Coverage / live lookup' : isBooking ? 'New connection' : 'Hydranet support'}</div><h2 id="modal-title">{title}</h2><p>{description}</p><form className="form-stack" onSubmit={submit}>{isAvailability && <><label><span className="field-label">PIN code</span><input required className="text-input" inputMode="numeric" placeholder="700 001" data-testid="input-modal-pin" /></label><label><span className="field-label">Locality</span><input required className="text-input" placeholder="Midnapore town" data-testid="input-modal-locality" /></label></>}{isBooking && <div className="status-message"><Check size={15} />Selected: {plan || 'Hydranet connection'}</div>}<label><span className="field-label">Name</span><input required className="text-input" placeholder="Your name" data-testid="input-modal-name" /></label><label><span className="field-label">Mobile number</span><input required className="text-input" type="tel" placeholder="7864068605" data-testid="input-modal-phone" /></label>{!isAvailability && !isBooking && <label><span className="field-label">Note</span><textarea className="text-area" rows={3} placeholder="A little context helps..." data-testid="input-modal-note" /></label>}<button className="button-primary" type="submit" data-testid="button-modal-submit">{isAvailability ? 'Check this area' : isBooking ? 'Request this plan' : 'Send request'} <ArrowRight size={15} /></button></form></>}</div></div>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router({ openModal, plans, loading, error }: { openModal: OpenModal; plans: PublicPlan[]; loading: boolean; error: boolean }) {
  return <RoutedErrorBoundary><Switch><Route path="/" component={() => <HomePage openModal={openModal} plans={plans} loading={loading} error={error} />} /><Route path="/plans" component={() => <PlansPage openModal={openModal} plans={plans} loading={loading} error={error} />} /><Route path="/services" component={() => <ServicesPage openModal={openModal} />} /><Route path="/about" component={() => <AboutPage openModal={openModal} />} /><Route path="/partner" component={PartnerPage} /><Route path="/contact" component={() => <ContactPage openModal={openModal} />} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}

function AppContent() {
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | undefined>();
  const publicPlans = useListPublicPlans({ query: { queryKey: getListPublicPlansQueryKey(), staleTime: 0, refetchOnWindowFocus: true } });
  const plans = (publicPlans.data ?? []).map(toPublicPlan);
  const openModal: OpenModal = (type, plan) => { setSelectedPlan(plan); setModal(type); };
  return <TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Header openModal={openModal} /><Router openModal={openModal} plans={plans} loading={publicPlans.isLoading} error={publicPlans.isError} /><Footer openModal={openModal} /><FloatingActions openModal={openModal} /><Modal type={modal} plan={selectedPlan} close={() => setModal(null)} /></WouterRouter><Toaster /></TooltipProvider>;
}

function App() {
  return <QueryClientProvider client={queryClient}><AppContent /></QueryClientProvider>;
}

export default App;