import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import Link from "next/link";
import Image from "next/image";
import type { JSX } from "react";
import type { Metadata } from "next";
import PricingSection from "./pricing-section";

const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-br", weight: ["500", "600", "700", "800"] });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "WBMSG — WhatsApp Communication & Marketing Platform",
  description: "AI-powered WhatsApp communication & marketing platform. Manage contacts, automate campaigns, close deals — all from WhatsApp.",
};

const FEATURES = [
  { icon: "📥", tag: "Inbox", tc: "#0BBF77", tb: "#E6F9F1", title: "Shared Team Inbox", desc: "All WhatsApp conversations in one place. Multiple agents, real-time updates, Open/Pending/Resolved status — no message left behind." },
  { icon: "👥", tag: "Contacts", tc: "#0284C7", tb: "#E0F2FE", title: "Contact & Deal Management", desc: "Import contacts from CSV, build segments with 15+ filter conditions, track deals on a Kanban board with custom pipeline stages." },
  { icon: "🤖", tag: "AI", tc: "#7C3AED", tb: "#EDE9FE", title: "AI Smart Replies", desc: "AI reads the conversation and suggests a ready-to-send reply. Your agents review before sending — always in control." },
  { icon: "📢", tag: "Campaigns", tc: "#B45309", tb: "#FEF3C7", title: "Broadcast Campaigns", desc: "Send template or text campaigns to segments, groups, or labels. Schedule delivery and track sent, delivered, read, and replied per contact." },
  { icon: "⚡", tag: "Automation", tc: "#DC2626", tb: "#FEE2E2", title: "Visual Flow Builder", desc: "Drag-and-drop automation canvas. 10+ trigger types, action nodes, condition branches, keyword auto-replies — no code needed." },
  { icon: "📊", tag: "Analytics", tc: "#059669", tb: "#D1FAE5", title: "Team Analytics", desc: "Conversation trends, campaign delivery rates, agent leaderboard, first response time, and campaign performance in one dashboard." },
];

export default function LandingPage(): JSX.Element {
  return (
    <div className={`${bricolage.variable} ${dmSans.variable} tr`}>
      <style>{`
        .tr {
          --g: #0BBF77; --g7: #089058; --g9: #08452E;
          --g50: #F0FBF6; --g100: #D9F5EB; --g200: #B0E8D0;
          --t1: #0C1A10; --t2: #374D3E; --t3: #738A7B;
          --bd: #E0EBE5; --wh: #ffffff;
          --r: 14px; --r-sm: 9px;
          --sh: 0 1px 4px rgba(0,20,10,.06),0 1px 2px rgba(0,20,10,.04);
          --sh2: 0 4px 20px rgba(0,20,10,.09),0 2px 6px rgba(0,20,10,.05);
          --sh3: 0 16px 48px rgba(0,20,10,.11),0 4px 16px rgba(0,20,10,.06);
          font-family: var(--font-dm), system-ui, sans-serif;
          color: var(--t1); background: #fff; overflow-x: hidden;
        }
        .br { font-family: var(--font-br), system-ui, sans-serif; }

        /* NAV */
        .nav {
          position: fixed; inset: 0 0 auto; height: 68px; z-index: 100;
          background: rgba(255,255,255,.95); backdrop-filter: blur(14px);
          border-bottom: 1px solid var(--bd);
          display: flex; align-items: center;
        }
        .nav-in { max-width: 1240px; width: 100%; margin: auto; padding: 0 1.5rem; display: flex; align-items: center; justify-content: space-between; }
        .logo { display: flex; align-items: center; gap: 9px; text-decoration: none; }
        .logo-ic { width: 36px; height: 36px; border-radius: 10px; background: var(--g); display: flex; align-items: center; justify-content: center; }
        .logo-tx { font-family: var(--font-br); font-weight: 800; font-size: 1.15rem; color: var(--t1); }
        .nav-lnks { display: flex; gap: 2rem; }
        .nav-lnk { font-size: .875rem; font-weight: 500; color: var(--t2); text-decoration: none; transition: color .15s; }
        .nav-lnk:hover { color: var(--t1); }
        .nav-act { display: flex; align-items: center; gap: 10px; }
        .btn-gh { font-size: .875rem; font-weight: 500; color: var(--t2); padding: 9px 18px; text-decoration: none; transition: color .15s; }
        .btn-gh:hover { color: var(--t1); }
        .btn-p { display: inline-flex; align-items: center; gap: 5px; background: var(--g); color: #fff; font-family: var(--font-br); font-weight: 700; font-size: .875rem; padding: 10px 20px; border-radius: var(--r-sm); text-decoration: none; transition: all .18s; }
        .btn-p:hover { background: var(--g7); box-shadow: 0 4px 16px rgba(11,191,119,.35); transform: translateY(-1px); }
        .btn-pl { display: inline-flex; align-items: center; gap: 8px; background: var(--g); color: #fff; font-family: var(--font-br); font-weight: 700; font-size: 1rem; padding: 14px 32px; border-radius: var(--r); text-decoration: none; transition: all .18s; }
        .btn-pl:hover { background: var(--g7); box-shadow: 0 6px 20px rgba(11,191,119,.35); transform: translateY(-1px); }
        .btn-ol { display: inline-flex; align-items: center; gap: 8px; background: #fff; color: var(--t2); font-weight: 600; font-size: 1rem; padding: 14px 28px; border-radius: var(--r); border: 1.5px solid var(--bd); text-decoration: none; transition: all .18s; }
        .btn-ol:hover { border-color: var(--g); color: var(--t1); }
        .btn-wh { display: inline-flex; align-items: center; gap: 8px; background: #fff; color: var(--g9); font-family: var(--font-br); font-weight: 800; font-size: 1rem; padding: 14px 32px; border-radius: var(--r); text-decoration: none; transition: all .18s; }
        .btn-wh:hover { background: var(--g50); transform: translateY(-1px); }
        .btn-gw { display: inline-flex; align-items: center; color: rgba(255,255,255,.65); font-weight: 600; font-size: 1rem; padding: 14px 28px; border-radius: var(--r); border: 1.5px solid rgba(255,255,255,.15); text-decoration: none; transition: all .18s; }
        .btn-gw:hover { color: #fff; border-color: rgba(255,255,255,.35); }

        /* HERO */
        .hero { position: relative; padding: 120px 0 80px; overflow: hidden; }
        .hero::before { content: ''; position: absolute; inset: 0; background-image: radial-gradient(circle, #c4dbd0 1px, transparent 1px); background-size: 30px 30px; opacity: .28; pointer-events: none; }
        .hero::after { content: ''; position: absolute; top: 0; right: 0; width: 52%; height: 100%; background: radial-gradient(ellipse 80% 80% at 80% 40%, #dff5ec 0%, #fff 65%); pointer-events: none; }
        .hero-in { position: relative; z-index: 1; max-width: 1240px; margin: auto; padding: 0 1.5rem; display: grid; grid-template-columns: 56fr 44fr; gap: 3rem; align-items: center; }
        .pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; font-size: .73rem; font-weight: 700; letter-spacing: .02em; background: var(--g100); color: var(--g7); border: 1px solid var(--g200); margin-bottom: 1.25rem; }
        .pill-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--g); animation: blink 2s infinite; }
        .h1 { font-family: var(--font-br); font-size: clamp(2.4rem,5vw,3.8rem); font-weight: 800; line-height: 1.07; letter-spacing: -.025em; color: var(--t1); margin-bottom: 1.25rem; }
        .h1-acc { color: var(--g); }
        .sub { font-size: 1.05rem; line-height: 1.75; color: var(--t2); margin-bottom: 2rem; max-width: 520px; }
        .hero-cta { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 3rem; }

        /* PHONE */
        .phone-wrap { display: flex; justify-content: flex-end; position: relative; }
        .phone { width: 288px; border-radius: 2.5rem; padding: 11px; background: #fff; box-shadow: var(--sh3), 0 0 0 1px var(--bd); animation: float 7s ease-in-out infinite; }
        .ph-bar { display: flex; justify-content: space-between; padding: 6px 16px 3px; font-size: 10px; color: var(--t3); }
        .ph-hd { background: #128C7E; border-radius: 20px 20px 0 0; padding: 10px 14px; display: flex; align-items: center; gap: 9px; }
        .ph-av { width: 34px; height: 34px; border-radius: 50%; background: #25D366; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: .85rem; color: #fff; flex-shrink: 0; }
        .ph-nm { font-size: .84rem; font-weight: 700; color: #fff; }
        .ph-st { font-size: .67rem; color: rgba(255,255,255,.7); }
        .chat { background: #f5fbf8; border-radius: 0 0 20px 20px; padding: 12px 10px; display: flex; flex-direction: column; gap: 9px; min-height: 308px; }
        .b-in { background: #fff; border: 1px solid #e5ede8; border-radius: 14px 14px 14px 3px; padding: 8px 12px; max-width: 80%; font-size: .69rem; line-height: 1.55; color: var(--t1); box-shadow: var(--sh); }
        .b-out { background: #d9fdd3; border-radius: 14px 14px 3px 14px; padding: 8px 12px; max-width: 80%; align-self: flex-end; font-size: .69rem; line-height: 1.55; color: var(--t1); }
        .b-ai { background: #fff; border: 1.5px solid var(--g200); border-radius: 14px 14px 3px 14px; padding: 9px 12px; max-width: 85%; align-self: flex-end; font-size: .69rem; line-height: 1.55; color: var(--t1); box-shadow: 0 2px 8px rgba(11,191,119,.1); }
        .msg-t { font-size: 9px; color: #9aaa9d; text-align: right; margin-top: 3px; }
        .ai-tag { display: inline-flex; align-items: center; gap: 4px; font-size: .62rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--g100); color: var(--g7); border: 1px solid var(--g200); margin-bottom: 3px; }
        .ai-acts { display: flex; gap: 6px; margin-top: 7px; padding-top: 6px; border-top: 1px solid var(--g100); }
        .ai-send { font-size: .62rem; font-weight: 700; padding: 3px 10px; border-radius: 6px; background: var(--g); color: #fff; cursor: pointer; }
        .ai-edit { font-size: .62rem; font-weight: 600; padding: 3px 10px; border-radius: 6px; background: var(--g50); color: var(--g7); border: 1px solid var(--g200); cursor: pointer; }
        .ph-inp { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid var(--bd); border-radius: 12px; padding: 8px 12px; margin: 6px 0 2px; }
        .ph-inp-t { font-size: .68rem; color: var(--t3); flex: 1; }
        .ph-snd { width: 27px; height: 27px; border-radius: 50%; background: var(--g); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .sticker { position: absolute; background: #fff; border: 1px solid var(--bd); border-radius: var(--r); padding: 9px 13px; box-shadow: var(--sh2); font-size: .71rem; }
        .sk-v { font-family: var(--font-br); font-weight: 700; color: var(--t1); }
        .sk-s { color: var(--t3); margin-top: 1px; }

        /* CREDENTIAL BAR */
        .cred-bar {
          background: var(--g9); border-top: 1px solid rgba(255,255,255,.06);
          border-bottom: 1px solid rgba(255,255,255,.06); padding: 1.25rem 0;
        }
        .cred-inner {
          max-width: 1240px; margin: auto; padding: 0 1.5rem;
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 1rem;
        }
        .cred-chips { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
        .cred-chip {
          display: flex; align-items: center; gap: 7px;
          font-size: .78rem; font-weight: 700; color: #6EE7B7;
          padding: 5px 13px; border-radius: 999px;
          border: 1px solid rgba(110,231,183,.2);
          background: rgba(110,231,183,.07);
        }
        .cred-sep { width: 1px; height: 32px; background: rgba(255,255,255,.1); flex-shrink: 0; }
        .ind-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .ind-chip {
          display: flex; align-items: center; gap: 7px;
          background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
          border-radius: var(--r-sm); padding: 6px 14px;
          font-size: .78rem; color: rgba(255,255,255,.55); font-weight: 500;
        }
        @media (max-width: 768px) { .cred-sep { display: none; } }

        /* SECTIONS */
        .sec { padding: 5.5rem 0; }
        .sec-alt { background: var(--g50); }
        .sec-dk { background: var(--g9); }
        .wrap { max-width: 1240px; margin: auto; padding: 0 1.5rem; }
        .sec-hd { text-align: center; margin-bottom: 3.5rem; }
        .h2 { font-family: var(--font-br); font-size: clamp(1.8rem,3.5vw,2.8rem); font-weight: 800; line-height: 1.1; letter-spacing: -.022em; color: var(--t1); margin-bottom: .9rem; }
        .h2-wh { color: #fff; }
        .sec-sub { font-size: 1.02rem; color: var(--t2); line-height: 1.7; max-width: 560px; margin: 0 auto; }

        /* FEATURE CARDS */
        .g3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 1.2rem; }
        .card { background: #fff; border: 1px solid var(--bd); border-radius: var(--r); padding: 1.6rem; box-shadow: var(--sh); transition: border-color .2s, box-shadow .2s, transform .2s; }
        .card:hover { border-color: var(--g200); box-shadow: var(--sh2); transform: translateY(-2px); }
        .card-ic { width: 50px; height: 50px; border-radius: 13px; display: flex; align-items: center; justify-content: center; font-size: 1.45rem; margin-bottom: 1.1rem; }
        .card-tg { display: inline-block; font-size: .63rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; margin-bottom: .55rem; }
        .card-tt { font-family: var(--font-br); font-size: 1.02rem; font-weight: 700; color: var(--t1); margin-bottom: .45rem; line-height: 1.3; }
        .card-ds { font-size: .83rem; color: var(--t2); line-height: 1.65; }

        /* STEPS */
        .steps { display: grid; grid-template-columns: repeat(3,1fr); gap: 1.5rem; }
        .step { background: #fff; border: 1px solid var(--bd); border-radius: var(--r); padding: 2rem 1.75rem; box-shadow: var(--sh); position: relative; overflow: hidden; transition: border-color .2s, box-shadow .2s; }
        .step:hover { border-color: var(--g200); box-shadow: var(--sh2); }
        .step-bg { position: absolute; top: -1rem; right: .5rem; font-family: var(--font-br); font-size: 6rem; font-weight: 800; color: var(--g50); line-height: 1; pointer-events: none; user-select: none; }
        .step-badge { width: 28px; height: 28px; border-radius: 50%; background: var(--g100); border: 1px solid var(--g200); display: flex; align-items: center; justify-content: center; font-family: var(--font-br); font-size: .75rem; font-weight: 800; color: var(--g7); margin-bottom: 1rem; }
        .step-ic { font-size: 2rem; margin-bottom: .9rem; }
        .step-tt { font-family: var(--font-br); font-size: 1.08rem; font-weight: 700; color: var(--t1); margin-bottom: .45rem; }
        .step-ds { font-size: .83rem; color: var(--t2); line-height: 1.65; }

        /* AI */
        .ai-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 4rem; align-items: center; }
        .ai-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; font-size: .73rem; font-weight: 700; background: #EDE9FE; color: #5B21B6; border: 1px solid #DDD6FE; margin-bottom: 1.1rem; }
        .ai-feats { display: flex; flex-direction: column; gap: .85rem; margin-top: 1.75rem; }
        .ai-ft { display: flex; gap: 13px; align-items: flex-start; padding: 1rem 1.1rem; background: #fff; border: 1px solid var(--bd); border-radius: var(--r); box-shadow: var(--sh); transition: border-color .18s; }
        .ai-ft:hover { border-color: var(--g200); }
        .ai-ft-ic { width: 36px; height: 36px; border-radius: 9px; flex-shrink: 0; background: var(--g50); display: flex; align-items: center; justify-content: center; font-size: .95rem; border: 1px solid var(--g100); }
        .ai-ft-tt { font-weight: 700; font-size: .88rem; color: var(--t1); margin-bottom: 2px; }
        .ai-ft-ds { font-size: .78rem; color: var(--t2); }
        .ai-panel { background: #fff; border: 1px solid var(--bd); border-radius: var(--r); padding: 1.4rem; box-shadow: var(--sh2); }
        .ai-ph { display: flex; align-items: center; gap: 11px; padding-bottom: .9rem; border-bottom: 1px solid var(--bd); margin-bottom: 1rem; }
        .ai-av { width: 40px; height: 40px; border-radius: 11px; background: linear-gradient(135deg,var(--g100),var(--g50)); border: 1px solid var(--g200); display: flex; align-items: center; justify-content: center; font-size: 1.15rem; }
        .ai-pn { font-family: var(--font-br); font-weight: 700; font-size: .88rem; color: var(--t1); }
        .ai-ps { font-size: .7rem; color: var(--t3); display: flex; align-items: center; gap: 5px; }
        .ai-ps::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--g); display: inline-block; }
        .ai-dots { display: flex; gap: 4px; margin-left: auto; }
        .ai-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--g200); }
        .ins { border-radius: var(--r-sm); padding: .95rem 1.05rem; margin-bottom: .7rem; }
        .ins:last-child { margin-bottom: 0; }
        .ins-lbl { font-size: .67rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 5px; }
        .ins-txt { font-size: .8rem; color: var(--t1); line-height: 1.55; }
        .ins-acts { display: flex; gap: 8px; margin-top: 9px; }
        .ins-btn-p { font-size: .7rem; padding: 5px 13px; border-radius: 7px; background: var(--g); color: #fff; font-weight: 700; text-decoration: none; }
        .ins-btn-o { font-size: .7rem; padding: 5px 13px; border-radius: 7px; border: 1px solid var(--bd); color: var(--t2); text-decoration: none; transition: border-color .18s; }
        .ins-btn-o:hover { border-color: var(--g); color: var(--t1); }

        /* FOOTER */
        .ft { padding: 4rem 0 2rem; border-top: 1px solid var(--bd); }
        .ft-g { display: grid; grid-template-columns: 2.5fr 1fr 1fr 1fr; gap: 3rem; margin-bottom: 3rem; }
        .ft-tag { font-size: .83rem; color: var(--t2); line-height: 1.65; max-width: 255px; margin-bottom: .7rem; }
        .ft-made { font-size: .73rem; color: var(--t3); }
        .ft-ch { font-size: .67rem; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--t3); margin-bottom: 1rem; }
        .ft-ls { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
        .ft-lk { font-size: .83rem; color: var(--t2); text-decoration: none; transition: color .15s; }
        .ft-lk:hover { color: var(--t1); }
        .ft-bot { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 1rem; padding-top: 1.5rem; border-top: 1px solid var(--bd); font-size: .73rem; color: var(--t3); }

        /* ANIMATIONS */
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }
        @keyframes blink { 0%,100% { opacity: .45; transform: scale(1); } 50% { opacity: 1; transform: scale(1.2); } }
        @keyframes in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes db { 0%,100% { opacity: .2; } 50% { opacity: 1; } }
        .m1 { animation: in .4s ease forwards .5s; opacity: 0; }
        .m2 { animation: in .4s ease forwards 1.2s; opacity: 0; }
        .m3 { animation: in .4s ease forwards 2s; opacity: 0; }
        .m4 { animation: in .4s ease forwards 2.8s; opacity: 0; }
        .s1 { animation: in .4s ease forwards 3.7s; opacity: 0; }
        .s2 { animation: in .4s ease forwards 4.3s; opacity: 0; }
        .d1 { animation: db 1.3s 0s infinite; }
        .d2 { animation: db 1.3s .22s infinite; }
        .d3 { animation: db 1.3s .44s infinite; }

        @media (max-width: 960px) {
          .hero-in, .ai-2col { grid-template-columns: 1fr; }
          .phone-wrap { justify-content: center; }
          .g3, .steps { grid-template-columns: 1fr 1fr; }
          .nav-lnks { display: none; }
          .ft-g { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 600px) {
          .g3, .steps, .ft-g { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* NAV */}
      <nav className="nav">
        <div className="nav-in">
          <Link href="/" className="logo">
            <Image src="/wbmsg_logo.png" alt="WBMSG" width={200} height={56} style={{ height: "36px", width: "auto" }} priority />
          </Link>
          <div className="nav-lnks">
            {["Features#features","How It Works#how-it-works","Pricing#pricing"].map(s => {
              const [label, hash] = s.split("#");
              return <a key={hash} href={`#${hash}`} className="nav-lnk">{label}</a>;
            })}
          </div>
          <div className="nav-act">
            <Link href="/sign-in" className="btn-gh">Log in</Link>
            <Link href="/sign-up" className="btn-p">Start Free →</Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-in">
          <div>
            <div className="pill"><span className="pill-dot" /> Meta Tech Provider</div>
            <h1 className="h1">
              Turn Every <span className="h1-acc">WhatsApp</span>{" "}
              Message Into Revenue
            </h1>
            <p className="sub">
              AI-powered CRM built for India&rsquo;s 64M+ SMBs. Manage contacts, automate campaigns, and close deals — all directly on WhatsApp. Transparent pricing, zero surprises.
            </p>
            <div className="hero-cta">
              <Link href="/sign-up" className="btn-pl">Start Free — No Credit Card</Link>
            </div>
          </div>

          <div className="phone-wrap">
            <div className="phone" style={{position:"relative"}}>
              <div className="ph-bar">
                <span>9:41</span>
                <div style={{display:"flex",gap:4}}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z"/></svg>
                </div>
              </div>
              <div className="ph-hd">
                <div className="ph-av">P</div>
                <div>
                  <div className="ph-nm">Priya Sharma</div>
                  <div className="ph-st">online</div>
                </div>
                <svg style={{marginLeft:"auto"}} width="16" height="16" viewBox="0 0 24 24" fill="rgba(255,255,255,0.6)"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
              </div>
              <div className="chat">
                <div className="m1 b-in">
                  Hi! Is your Growth plan available for my team? 🙏
                  <div className="msg-t">10:42</div>
                </div>
                <div className="m2 b-out" style={{alignSelf:"flex-end"}}>
                  Yes! Growth is ₹599/mo — 10 agents, 10K contacts & AI replies ✨
                  <div className="msg-t">10:42 ✓✓</div>
                </div>
                <div className="m3 b-in">
                  Sounds good! We&rsquo;re a team of 8. Can we try it? 😊
                  <div className="msg-t">10:43</div>
                </div>
                <div className="m4" style={{display:"flex",flexDirection:"column",alignItems:"flex-end"}}>
                  <div className="ai-tag">🤖 AI Draft</div>
                  <div className="b-ai">
                    Great! Start your 14-day free trial at wbmsg.com/sign-up — no credit card needed 🎉
                    <div className="ai-acts">
                      <button className="ai-send">Send ✓</button>
                      <button className="ai-edit">Edit</button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="ph-inp">
                <span className="ph-inp-t">Type a message...</span>
                <div className="ph-snd">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </div>
              </div>
              {/* Stickers */}
              <div className="sticker s1" style={{left:"-110px",top:"70px"}}>
                <div className="sk-v">+12 Leads Today</div>
                <div className="sk-s">from WhatsApp</div>
              </div>
              <div className="sticker s2" style={{right:"-100px",bottom:"90px",borderColor:"var(--g200)"}}>
                <div className="sk-v" style={{color:"var(--g7)"}}>94% Reply Rate</div>
                <div className="sk-s">AI-assisted</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CREDENTIAL BAR */}
      <div className="cred-bar">
        <div className="cred-inner">
          <div className="cred-chips">
            {[
              "✓ Meta Tech Provider",
              "✓ Business Verified by Meta",
              "✓ Official WhatsApp API",
            ].map((label) => (
              <div key={label} className="cred-chip">{label}</div>
            ))}
          </div>
          <div className="cred-sep" />
          <div className="ind-chips">
            {[["🛒","Retail"],["🏥","Healthcare"],["🎓","EdTech"],["🏠","Real Estate"],["🍕","Food & Bev"],["💼","Services"]].map(([ic,lb]) => (
              <div key={lb} className="ind-chip"><span style={{fontSize:"1rem"}}>{ic}</span> {lb}</div>
            ))}
          </div>
        </div>
      </div>

      {/* FEATURES */}
      <section id="features" className="sec">
        <div className="wrap">
          <div className="sec-hd">
            <div className="pill" style={{marginBottom:"1rem"}}>Everything in One Platform</div>
            <h2 className="h2">Not just a chat tool.<br />A complete growth OS.</h2>
            <p className="sec-sub">Every tool your team needs to acquire, manage, and retain customers — built natively for WhatsApp.</p>
          </div>
          <div className="g3">
            {FEATURES.map(f => (
              <div key={f.title} className="card">
                <div className="card-ic" style={{background:f.tb}}>{f.icon}</div>
                <div className="card-tg" style={{background:f.tb,color:f.tc}}>{f.tag}</div>
                <div className="card-tt">{f.title}</div>
                <div className="card-ds">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="sec sec-alt">
        <div className="wrap">
          <div className="sec-hd">
            <div className="pill" style={{marginBottom:"1rem"}}>Setup in Minutes</div>
            <h2 className="h2">Live in 3 steps</h2>
          </div>
          <div className="steps">
            {[
              {n:"01",ic:"🔗",tt:"Connect WhatsApp",ds:"Link your WhatsApp Business Account via Meta Embedded Signup. Your existing number, your data — zero downtime."},
              {n:"02",ic:"📋",tt:"Import & Organise",ds:"Bulk import contacts from CSV. Build dynamic segments with filter rules, create groups, assign labels — all in minutes."},
              {n:"03",ic:"🚀",tt:"Automate & Respond",ds:"Set up welcome messages, keyword auto-replies, and multi-step flows. AI suggests replies; your team closes faster."},
            ].map((s,i) => (
              <div key={s.n} className="step">
                <div className="step-bg">{s.n}</div>
                <div className="step-badge">{i+1}</div>
                <div className="step-ic">{s.ic}</div>
                <div className="step-tt">{s.tt}</div>
                <div className="step-ds">{s.ds}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI */}
      <section className="sec">
        <div className="wrap">
          <div className="ai-2col">
            <div>
              <div className="ai-pill">Powered by Claude AI</div>
              <h2 className="h2">AI that helps your team respond faster</h2>
              <p className="sec-sub" style={{margin:0,textAlign:"left"}}>
                Smart reply suggestions and intent-matching automation — AI works alongside your agents, not instead of them. Every suggestion is reviewed before it&rsquo;s sent.
              </p>
              <div className="ai-feats">
                {[
                  {ic:"💡",tt:"Intent Detection",ds:"AI routes incoming messages to the right automation based on what the customer is asking"},
                  {ic:"✍️",tt:"Smart Reply Drafts",ds:"Suggests a context-aware reply for your agent to review and send — or edit first"},
                  {ic:"📝",tt:"Conversation Summary",ds:"Condenses the thread so a new agent can pick up without reading everything"},
                ].map(f => (
                  <div key={f.tt} className="ai-ft">
                    <div className="ai-ft-ic">{f.ic}</div>
                    <div><div className="ai-ft-tt">{f.tt}</div><div className="ai-ft-ds">{f.ds}</div></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="ai-panel">
              <div className="ai-ph">
                <div className="ai-av">🧠</div>
                <div>
                  <div className="ai-pn">TrustAI Assistant</div>
                  <div className="ai-ps">Analyzing conversation</div>
                </div>
                <div className="ai-dots">
                  <div className="ai-dot d1"/><div className="ai-dot d2"/><div className="ai-dot d3"/>
                </div>
              </div>
              <div className="ins" style={{background:"#EDE9FE",border:"1px solid #DDD6FE"}}>
                <div className="ins-lbl" style={{color:"#5B21B6"}}>Intent Detected</div>
                <div className="ins-txt">🟢 High purchase intent — asked about pricing twice. Recommend Growth plan.</div>
              </div>
              <div className="ins" style={{background:"var(--g50)",border:"1px solid var(--g200)"}}>
                <div className="ins-lbl" style={{color:"var(--g7)"}}>Suggested Reply</div>
                <div className="ins-txt">&ldquo;Hi Priya! Growth plan is perfect for your 8-person team — ₹599/mo, 14-day free trial. Want to get started? 🚀&rdquo;</div>
                <div className="ins-acts">
                  <Link href="/sign-up" className="ins-btn-p">Send Now</Link>
                  <Link href="/sign-up" className="ins-btn-o">Edit Reply</Link>
                </div>
              </div>
              <div className="ins" style={{background:"#FEF3C7",border:"1px solid #FDE68A",marginBottom:0}}>
                <div className="ins-lbl" style={{color:"#92400E"}}>Summary</div>
                <div className="ins-txt">· Asked about pricing ×2<br/>· Team size: 8 agents<br/>· Ready to demo → <strong style={{color:"var(--g7)"}}>high-priority lead</strong></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <PricingSection />

      {/* FINAL CTA */}
      <section className="sec sec-dk" style={{textAlign:"center"}}>
        <div className="wrap">
          <div style={{fontSize:"2.2rem",marginBottom:"1rem"}}>🚀</div>
          <h2 className="h2 h2-wh">
            Your WhatsApp inbox is full.<br />
            <span style={{color:"#6EE7B7"}}>Let&rsquo;s fix that.</span>
          </h2>
          <p style={{fontSize:"1.02rem",color:"rgba(255,255,255,.55)",marginBottom:"2rem",maxWidth:"460px",margin:"1rem auto 2rem",lineHeight:1.7}}>
            WhatsApp CRM. Zero message markup. Your team, your conversations, your growth.
          </p>
          <div style={{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:"12px"}}>
            <Link href="/sign-up" className="btn-wh">Start Free — 14 Days</Link>
            <Link href="/sign-in" className="btn-gw">I Already Have an Account</Link>
          </div>
          <p style={{fontSize:".76rem",color:"rgba(255,255,255,.28)",marginTop:"1.5rem"}}>No credit card · Setup in 5 min · Cancel anytime · Data hosted in India (ap-south-1)</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="ft">
        <div className="wrap">
          <div className="ft-g">
            <div>
              <div className="logo" style={{marginBottom:"1rem"}}>
                <Image src="/wbmsg_logo.png" alt="WBMSG" width={200} height={56} style={{ height: "36px", width: "auto" }} />
              </div>
              <p className="ft-tag">WhatsApp-first CRM built for India&rsquo;s 64M+ SMBs. Transparent pricing, AI-powered, zero surprises.</p>
              <p className="ft-made">Made with ❤️ in India</p>
            </div>
            {[
              {h:"Product",ls:["Features","Pricing","Automation","Analytics","Changelog"]},
              {h:"Company",ls:["About","Blog","Careers","Contact"]},
            ].map(col => (
              <div key={col.h}>
                <div className="ft-ch">{col.h}</div>
                <ul className="ft-ls">
                  {col.ls.map(l => <li key={l}><a href="#" className="ft-lk">{l}</a></li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="ft-bot">
            <span>© 2026 WBMSG. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
