export type ServiceColumn =
  | "Cloud Services"
  | "IT Software Consultancy"
  | "Digital & IT Solutions"
  | "Product Development";

export type ServiceOffering = {
  title: string;
  description: string;
  icon: string; // SVG path data for <path d={icon} />
};

export type ServiceProcess = {
  step: string; // "01"–"05"
  title: string;
  duration: string;
  body: string;
};

export type ServiceTech = {
  name: string;
  category: string;
};

export type ServiceFaq = {
  q: string;
  a: string;
};

export type ServiceData = {
  slug: string;
  column: ServiceColumn;
  title: string;
  tagline: string;
  metaTitle: string;
  metaDescription: string;
  overview: string[];
  offerings: ServiceOffering[];
  process: ServiceProcess[];
  techStack: ServiceTech[];
  faqs: ServiceFaq[];
  relatedSlugs: string[];
};

// ─── ICON PATH CONSTANTS ────────────────────────────────────────────────────
export const ICONS = {
  globe: "M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582",
  code: "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5",
  chart: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
  server: "M21.75 17.25v.75a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25v-.75m19.5 0a2.25 2.25 0 00-2.25-2.25H4.5a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 18.409a2.25 2.25 0 01-1.07-1.916V17.25m19.5-9.75a2.25 2.25 0 00-2.25-2.25H4.5A2.25 2.25 0 002.25 7.5v9.75m19.5-9.75v9.75",
  shield: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
  cog: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  users: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z",
  document: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  cloud: "M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z",
  bolt: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
  database: "M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 2.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125",
  pencil: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10",
  upload: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5",
  search: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
  cube: "M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9",
  refresh: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99",
  rocket: "M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z",
  chat: "M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z",
  phone: "M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3m-3 3h3m-3 3h3",
  lock: "M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z",
  check: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  wrench: "M21.75 6.75a4.5 4.5 0 01-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 11-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 016.336-4.486l-3.276 3.276a3.004 3.004 0 002.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852z",
  building: "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z",
  wifi: "M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z",
  map: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z",
  lightbulb: "M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18",
  chip: "M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z",
  link: "M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244",
  bag: "M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
  star: "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z",
  broadcast: "M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46",
  sparkle: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z",
} as const;

// ─── SERVICE CATALOGUE (slug + nav metadata only; full data added per-service) ─
// When a service has full data, it appears in SERVICES below.
// Until then, only slug/title/column are needed for the mega menu.

export type ServiceNavItem = {
  slug: string;
  title: string;
  column: ServiceColumn;
};

export const SERVICE_NAV: ServiceNavItem[] = [
  // Column 1 — Cloud Services
  { slug: "site-migration", title: "Site Migration", column: "Cloud Services" },
  { slug: "cloud-infrastructure-setup", title: "Cloud Infrastructure Setup", column: "Cloud Services" },
  { slug: "whatsapp-business-api", title: "WhatsApp Business API Setup", column: "Cloud Services" },
  { slug: "cloud-architecture-review", title: "Cloud Architecture Review", column: "Cloud Services" },
  { slug: "devops-cicd", title: "DevOps & CI/CD", column: "Cloud Services" },
  { slug: "database-administration", title: "Database Administration", column: "Cloud Services" },
  // Column 2 — IT Software Consultancy
  { slug: "mobile-app-development", title: "Mobile App Development", column: "IT Software Consultancy" },
  { slug: "native-app-development", title: "Native App Development", column: "IT Software Consultancy" },
  { slug: "custom-software-development", title: "Custom Software Development", column: "IT Software Consultancy" },
  { slug: "cross-platform-development", title: "Cross Platform Development", column: "IT Software Consultancy" },
  { slug: "iot-development", title: "IoT Development", column: "IT Software Consultancy" },
  { slug: "ui-ux-design", title: "UI & UX Designing", column: "IT Software Consultancy" },
  { slug: "frontend-development", title: "Frontend Development", column: "IT Software Consultancy" },
  { slug: "backend-development", title: "Backend Development", column: "IT Software Consultancy" },
  { slug: "web-development", title: "Web Development", column: "IT Software Consultancy" },
  // Column 3 — Digital & IT Solutions
  { slug: "digital-transformation", title: "Digital Transformation", column: "Digital & IT Solutions" },
  { slug: "managed-it-services", title: "Managed IT Services", column: "Digital & IT Solutions" },
  { slug: "digital-marketing", title: "Digital Marketing Services", column: "Digital & IT Solutions" },
  { slug: "whatsapp-marketing-automation", title: "WhatsApp Marketing Automation", column: "Digital & IT Solutions" },
  { slug: "crm-integration", title: "CRM Integration & Setup", column: "Digital & IT Solutions" },
  { slug: "managed-service-provider", title: "Managed Service Provider", column: "Digital & IT Solutions" },
  { slug: "whatsapp-crm", title: "WhatsApp CRM", column: "Digital & IT Solutions" },
  { slug: "ai-solutions", title: "AI Solutions", column: "Digital & IT Solutions" },
  // Column 4 — Product Development
  { slug: "saas-product-development", title: "SaaS Product Development", column: "Product Development" },
  { slug: "mvp-development", title: "MVP Development", column: "Product Development" },
  { slug: "api-integration-development", title: "API & Integration Development", column: "Product Development" },
  { slug: "ecommerce-solutions", title: "E-commerce Solutions", column: "Product Development" },
  { slug: "b2b-platform-design", title: "B2B Platform Design", column: "Product Development" },
  { slug: "whatsapp-commerce", title: "WhatsApp Commerce Solutions", column: "Product Development" },
];

// Full service data — populated one by one as pages are built
export const SERVICES: ServiceData[] = [
  // ─── Cloud Infrastructure Setup ──────────────────────────────────────────────
  {
    slug: "cloud-infrastructure-setup",
    column: "Cloud Services",
    title: "Cloud Infrastructure Setup",
    tagline: "Cloud Infrastructure Built for Indian Business Scale",
    metaTitle: "Cloud Infrastructure Setup Services India | AWS, GCP, Azure | Conveys",
    metaDescription: "Expert cloud infrastructure setup on AWS, GCP, and Azure for Indian businesses. Kubernetes, load balancing, VPN, monitoring — fixed pricing, in-house team.",
    overview: [
      "From day-one cloud setup to production-grade multi-region architectures — we design, provision, and manage your AWS, GCP, or Azure environment so your engineering team can ship without worrying about infrastructure.",
      "In-house DevOps engineers, fixed project pricing, and 24/7 alerting on every deployment we touch.",
    ],
    offerings: [
      {
        title: "Cloud Provider Setup",
        description: "Account structure, IAM roles, billing alerts, and VPC configuration on AWS, GCP, or Azure — built to your team's security and compliance requirements from day one.",
        icon: ICONS.cloud,
      },
      {
        title: "Kubernetes & Containers",
        description: "EKS, GKE, or AKS cluster provisioning, Helm chart management, autoscaling policies, and namespace RBAC so your services deploy reliably at any load.",
        icon: ICONS.cube,
      },
      {
        title: "Load Balancing & Autoscaling",
        description: "Application load balancers, target group routing, horizontal pod autoscaling, and CDN integration — your stack scales up under traffic and scales down to save cost.",
        icon: ICONS.refresh,
      },
      {
        title: "Network & VPN Security",
        description: "Private subnets, security groups, NAT gateways, site-to-site VPN, and AWS PrivateLink so your internal services are never exposed to the public internet.",
        icon: ICONS.shield,
      },
      {
        title: "Cost Optimisation",
        description: "Reserved instance planning, spot instance pools, right-sizing recommendations, and S3 lifecycle rules — we typically cut first-month cloud bills by 25–40%.",
        icon: ICONS.chart,
      },
      {
        title: "Monitoring & Alerting",
        description: "Datadog or Grafana dashboards, CloudWatch/GCP Monitoring alarms, PagerDuty on-call routing, and SLO tracking so you know before your users do.",
        icon: ICONS.chart,
      },
    ],
    process: [
      { step: "01", title: "Requirements & Cloud Selection", duration: "Day 1–2", body: "We map your workload, compliance needs, and team skills to pick the right cloud provider and region. You get a written architecture proposal before any provisioning begins." },
      { step: "02", title: "Architecture Design", duration: "Day 3–5", body: "VPC layout, subnet strategy, IAM structure, and service topology documented in diagrams you approve. No black-box decisions." },
      { step: "03", title: "Provisioning via IaC", duration: "Week 2", body: "Terraform or Pulumi scripts checked into your repo provision every resource — repeatable, auditable, and rollback-safe." },
      { step: "04", title: "Security Hardening", duration: "Week 2–3", body: "CIS benchmark review, secret rotation via AWS Secrets Manager or GCP Secret Manager, WAF rules, and penetration test sign-off." },
      { step: "05", title: "CI/CD Integration", duration: "Week 3", body: "GitHub Actions or GitLab CI pipelines deploy to your new cluster. Blue/green or canary rollout strategy agreed and tested." },
      { step: "06", title: "Handover & Training", duration: "Week 4", body: "Runbooks, architecture diagrams, and a 2-hour walkthrough for your team. Ongoing retainer available for DBA and infra support." },
    ],
    techStack: [
      { name: "AWS", category: "Cloud" },
      { name: "GCP", category: "Cloud" },
      { name: "Azure", category: "Cloud" },
      { name: "Terraform", category: "IaC" },
      { name: "Kubernetes", category: "Orchestration" },
      { name: "Docker", category: "Containers" },
      { name: "Nginx", category: "Ingress" },
      { name: "Cloudflare", category: "CDN / DNS" },
      { name: "Datadog", category: "Monitoring" },
      { name: "Grafana", category: "Dashboards" },
    ],
    faqs: [
      { q: "Which cloud provider do you recommend for Indian startups?", a: "AWS has the most mature Mumbai region (ap-south-1) with the widest service coverage — we recommend it for most new projects. GCP is strong for ML workloads, and Azure is best if your team is already on Microsoft 365. We are provider-agnostic and will recommend based on your specific workload." },
      { q: "How long does a cloud infrastructure setup take?", a: "A standard setup with VPC, EKS, RDS, Redis, and CI/CD pipelines takes 3–4 weeks. A more complex multi-region active-active architecture can take 6–8 weeks. We give you a precise timeline after the discovery call." },
      { q: "Do you handle ongoing infrastructure management after setup?", a: "Yes. We offer monthly infrastructure retainers that cover monitoring, incident response, cost optimisation, security patching, and capacity planning. Most clients keep us on for at least the first 6 months." },
      { q: "Can you migrate our existing on-premise or cPanel infrastructure to cloud?", a: "Yes — see our Site Migration service. We handle the full lift-and-shift or re-architect, including database migration, DNS cutover, and email continuity." },
      { q: "What compliance standards can you help us meet?", a: "We have experience setting up infrastructure for ISO 27001, SOC 2 Type II, and India's DPDP Act requirements. We document every control and produce the evidence your auditors need." },
    ],
    relatedSlugs: ["site-migration", "devops-cicd", "cloud-architecture-review"],
  },

  // ─── WhatsApp Business API Setup ─────────────────────────────────────────────
  {
    slug: "whatsapp-business-api",
    column: "Cloud Services",
    title: "WhatsApp Business API Setup",
    tagline: "Go Live on WhatsApp Business API in Under 7 Days",
    metaTitle: "WhatsApp Business API Setup India — Meta WABA Onboarding | Conveys",
    metaDescription: "Full Meta WhatsApp Business API onboarding — business verification, number registration, template approvals, webhook integration. Fixed pricing for Indian businesses.",
    overview: [
      "We handle the complete Meta WABA onboarding — business verification, phone number registration, message template approvals, and webhook integration — so you can start sending transactional and marketing messages on WhatsApp immediately.",
      "Official API only. No grey-area tools, no account ban risk. Your number, your WABA account, your data.",
    ],
    offerings: [
      {
        title: "Meta WABA Account Setup",
        description: "Business Manager creation, WABA provisioning, and business verification with Meta. We navigate the verification process and chase escalations so you are not waiting weeks.",
        icon: ICONS.chat,
      },
      {
        title: "Phone Number Registration",
        description: "Register a new number or migrate your existing WhatsApp Business App number to the API — we handle display name approval and two-step verification PIN setup.",
        icon: ICONS.phone,
      },
      {
        title: "Template Creation & Approval",
        description: "We write, format, and submit your utility, authentication, and marketing message templates for Meta approval — including variable mapping and header media.",
        icon: ICONS.document,
      },
      {
        title: "Webhook & API Integration",
        description: "Inbound message webhooks, delivery receipt handlers, and status update listeners integrated into your backend so every WhatsApp event is captured and acted on.",
        icon: ICONS.link,
      },
      {
        title: "Chatbot & Auto-Reply Setup",
        description: "Rule-based or AI-powered chatbot flows for lead qualification, order status queries, and FAQ handling — connected to your CRM or database.",
        icon: ICONS.sparkle,
      },
      {
        title: "Analytics & Reporting Dashboard",
        description: "Message delivery rates, read rates, opt-out tracking, and campaign performance — all visible in a dashboard your team can check without touching code.",
        icon: ICONS.chart,
      },
    ],
    process: [
      { step: "01", title: "Business Verification", duration: "Day 1–3", body: "We set up your Facebook Business Manager, submit verification documents, and manage the Meta review process. Most Indian businesses verify within 2–3 business days." },
      { step: "02", title: "WABA Provisioning", duration: "Day 2–4", body: "WABA account created, phone number registered, and display name submitted for approval. We handle the back-and-forth with Meta support." },
      { step: "03", title: "Template Submission", duration: "Day 3–5", body: "We write and submit your first batch of message templates — utility, authentication, and marketing categories. Typical approval time is 24–48 hours." },
      { step: "04", title: "Webhook Integration", duration: "Day 4–6", body: "Inbound and outbound webhook endpoints set up in your backend. Delivery receipts, read events, and opt-outs all handled and logged." },
      { step: "05", title: "Testing & Validation", duration: "Day 6–7", body: "End-to-end test of every message type, opt-out flow, and error scenario. You approve each flow before go-live." },
      { step: "06", title: "Go-Live & Handover", duration: "Day 7", body: "Production switch flipped. Monitoring set up on delivery rates and error queues. Runbook delivered for your team." },
    ],
    techStack: [
      { name: "Meta WhatsApp Cloud API", category: "Messaging" },
      { name: "Node.js", category: "Backend" },
      { name: "Fastify", category: "Framework" },
      { name: "PostgreSQL", category: "Database" },
      { name: "Redis", category: "Cache / Queue" },
      { name: "BullMQ", category: "Job Queue" },
      { name: "AWS", category: "Hosting" },
    ],
    faqs: [
      { q: "What is the difference between WhatsApp Business App and WhatsApp Business API?", a: "The WhatsApp Business App is a mobile app for small businesses — one user, one device, no automation. The Business API is a cloud platform that lets you send messages programmatically, integrate with your CRM, run bulk campaigns, and build chatbots. You need the API to do anything at scale." },
      { q: "How long does Meta template approval take?", a: "Marketing templates are reviewed within 24–48 hours. Utility and authentication templates are usually approved within a few hours. We write templates that pass first-time — poorly structured templates can be rejected and require re-submission." },
      { q: "Can I keep my existing WhatsApp Business App number?", a: "Yes, Meta allows migration of a number from the Business App to the API. The process takes 1–2 days and requires a brief offline period for the number. We manage this for you." },
      { q: "What does Meta charge per message?", a: "Meta charges per conversation (24-hour window), not per message. Rates for India are approximately ₹0.40–0.70 per marketing conversation and ₹0.10–0.15 per utility conversation. We give you a full cost estimate based on your expected volumes before you commit." },
      { q: "Do you provide ongoing support after setup?", a: "Yes. We monitor delivery rates, handle template re-submissions when Meta policy changes, and are available to add new integrations or chatbot flows. Monthly support retainers start at ₹8,000/month." },
    ],
    relatedSlugs: ["whatsapp-crm", "whatsapp-marketing-automation", "whatsapp-commerce"],
  },

  // ─── Cloud Architecture Review ────────────────────────────────────────────────
  {
    slug: "cloud-architecture-review",
    column: "Cloud Services",
    title: "Cloud Architecture Review",
    tagline: "Spot the Gaps Before They Become Outages",
    metaTitle: "Cloud Architecture Review & Audit India | AWS, GCP, Azure | Conveys",
    metaDescription: "Independent cloud architecture audit covering cost, security, reliability, and performance. Delivered in 5 business days with a prioritised action plan. Fixed fee.",
    overview: [
      "An independent audit of your cloud architecture — cost, security, reliability, and performance — with a prioritised action plan you can hand to your team or have us implement. No lock-in, no sales pitch.",
      "We follow AWS Well-Architected, Google Cloud Architecture Framework, and Azure Well-Architected — giving you a report your auditors will recognise.",
    ],
    offerings: [
      {
        title: "Architecture Audit",
        description: "Full review of your VPC design, service topology, IAM policies, and infrastructure-as-code — mapped against the Well-Architected pillars: operational excellence, security, reliability, performance, and cost.",
        icon: ICONS.search,
      },
      {
        title: "Cost Analysis",
        description: "We audit your billing exports, identify waste (idle resources, over-provisioned instances, orphaned snapshots), and model Reserved Instance or Savings Plan purchases to cut spend by 20–40%.",
        icon: ICONS.chart,
      },
      {
        title: "Security Assessment",
        description: "IAM least-privilege review, public-exposure audit, secret hygiene check, encryption-at-rest and in-transit verification, and a prioritised CVE list for your running images.",
        icon: ICONS.shield,
      },
      {
        title: "Performance Benchmarking",
        description: "Latency profiling, cache hit-rate analysis, database query review, and CDN configuration check — with before/after projections for each recommended change.",
        icon: ICONS.bolt,
      },
      {
        title: "Disaster Recovery Review",
        description: "RTO and RPO targets assessed against your actual backup schedules, replication lag, and failover runbooks. We identify single points of failure and model the cost of fixing them.",
        icon: ICONS.refresh,
      },
      {
        title: "Roadmap & Action Plan",
        description: "Every finding scored by severity and effort. You get a phased roadmap: quick wins in week 1, medium-term improvements in months 1–3, and strategic changes for the next 12 months.",
        icon: ICONS.document,
      },
    ],
    process: [
      { step: "01", title: "Access & Discovery", duration: "Day 1", body: "Read-only IAM access granted to our audit account. We never need write permissions — you can revoke access after the review." },
      { step: "02", title: "Automated Scan", duration: "Day 1–2", body: "Prowler, AWS Trusted Advisor, and Infracost run against your environment. Results feed into our manual review." },
      { step: "03", title: "Manual Deep Dive", duration: "Day 2–4", body: "Senior architect reviews your IaC, architecture diagrams, and billing exports. Every finding is evidence-backed with a screenshot or CLI output." },
      { step: "04", title: "Report Delivery", duration: "Day 5", body: "PDF report with executive summary, detailed findings, and the prioritised action plan. Delivered before noon." },
      { step: "05", title: "Review Call", duration: "Day 5–6", body: "60-minute walkthrough of every finding. You ask questions, we explain trade-offs. Recording provided." },
      { step: "06", title: "30-Day Follow-up", duration: "Day 30", body: "We check back on your progress. Findings that have been addressed are closed; blockers get a second opinion at no charge." },
    ],
    techStack: [
      { name: "AWS Well-Architected", category: "Framework" },
      { name: "GCP Architecture Framework", category: "Framework" },
      { name: "Prowler", category: "Security Scan" },
      { name: "Infracost", category: "Cost Analysis" },
      { name: "Terraform", category: "IaC" },
      { name: "Datadog", category: "Monitoring" },
      { name: "Grafana", category: "Dashboards" },
      { name: "Snyk", category: "Vulnerability Scan" },
    ],
    faqs: [
      { q: "What access do you need to run the audit?", a: "Read-only IAM access to your AWS, GCP, or Azure account. We use a dedicated audit IAM role with the minimum permissions required to run the tools. You can revoke access immediately after we deliver the report." },
      { q: "How long does the review take?", a: "Standard delivery is 5 business days from when we receive access. For large multi-account organisations or multi-cloud environments, allow 7–10 days." },
      { q: "Will you implement the recommendations?", a: "That is a separate engagement. Many clients use the review report to have their internal team or our cloud infrastructure team implement the changes. We can quote implementation alongside the audit if you prefer." },
      { q: "Is the report confidential?", a: "Yes. Everything we see is covered by an NDA signed before access is granted. We do not share your architecture, data, or findings with any third party." },
      { q: "What do I actually receive?", a: "A PDF report with an executive summary (suitable for your board or investors), detailed findings section with evidence screenshots, and a prioritised action plan spreadsheet. Plus the 60-minute review call recording." },
    ],
    relatedSlugs: ["cloud-infrastructure-setup", "devops-cicd", "managed-it-services"],
  },

  // ─── DevOps & CI/CD ───────────────────────────────────────────────────────────
  {
    slug: "devops-cicd",
    column: "Cloud Services",
    title: "DevOps & CI/CD",
    tagline: "Ship Faster, Break Less — DevOps & CI/CD Done Right",
    metaTitle: "DevOps & CI/CD Pipeline Setup India | GitHub Actions, Kubernetes | Conveys",
    metaDescription: "CI/CD pipelines, Docker containerisation, Kubernetes deployment, and infrastructure as code for Indian engineering teams. Fixed pricing, in-house DevOps engineers.",
    overview: [
      "We design and implement CI/CD pipelines, containerise your applications, and set up infrastructure as code so every push to production is automated, tested, and reversible.",
      "No more manual deployments, no more Friday-night hotfixes. Just a repeatable process that your whole team trusts.",
    ],
    offerings: [
      {
        title: "CI/CD Pipeline Setup",
        description: "GitHub Actions, GitLab CI, or Bitbucket Pipelines configured to run tests, lint, type-check, build Docker images, and deploy — all triggered on PR merge. Rollback in one click.",
        icon: ICONS.refresh,
      },
      {
        title: "Docker Containerisation",
        description: "Multi-stage Dockerfiles for every service — optimised for layer caching, minimal image size, and non-root runtime. Docker Compose for local dev parity.",
        icon: ICONS.cube,
      },
      {
        title: "Kubernetes Deployment",
        description: "Deployment manifests, Helm charts, HPA and VPA configuration, and readiness/liveness probes — so your services self-heal and scale without manual intervention.",
        icon: ICONS.server,
      },
      {
        title: "Infrastructure as Code",
        description: "Every cloud resource defined in Terraform or Pulumi, checked into your repository, and applied via a GitOps workflow. No more snowflake servers.",
        icon: ICONS.code,
      },
      {
        title: "Monitoring & Alerting",
        description: "Datadog or Grafana dashboards for deployment frequency, lead time, change failure rate, and MTTR — the four DORA metrics that tell you if your DevOps is working.",
        icon: ICONS.chart,
      },
      {
        title: "Security Scanning",
        description: "Snyk or Trivy vulnerability scanning in every pipeline run. SAST checks on pull requests. Secrets scanning so credentials never reach your repository.",
        icon: ICONS.shield,
      },
    ],
    process: [
      { step: "01", title: "Audit Current State", duration: "Day 1–2", body: "We document your current deployment process, find the manual steps, and identify the highest-risk failure points. You see exactly what we plan to automate and why." },
      { step: "02", title: "Pipeline Design", duration: "Day 3–4", body: "Stage-by-stage pipeline design agreed with your team: test → build → staging deploy → approval gate → production deploy. Branch strategy documented." },
      { step: "03", title: "Implementation", duration: "Week 2–3", body: "Pipelines built, Dockerfiles written, Kubernetes manifests created. Every step tested against your actual codebase — not a toy example." },
      { step: "04", title: "Staging Validation", duration: "Week 3", body: "Full end-to-end deployment run on staging. Rollback tested. Failure scenarios simulated. Your team runs a deployment while we watch." },
      { step: "05", title: "Production Go-Live", duration: "Week 3–4", body: "First automated production deployment run together. Monitoring confirmed. Alerting tested with a synthetic incident." },
      { step: "06", title: "Team Training", duration: "Week 4", body: "2-hour session covering pipeline debugging, rollback procedures, adding new services, and reading the dashboards. Runbook left in your repo." },
    ],
    techStack: [
      { name: "GitHub Actions", category: "CI/CD" },
      { name: "Docker", category: "Containers" },
      { name: "Kubernetes", category: "Orchestration" },
      { name: "Terraform", category: "IaC" },
      { name: "Helm", category: "K8s Packaging" },
      { name: "Datadog", category: "Monitoring" },
      { name: "Sentry", category: "Error Tracking" },
      { name: "Snyk", category: "Security" },
      { name: "AWS / Railway", category: "Cloud" },
    ],
    faqs: [
      { q: "Which CI/CD tool do you recommend?", a: "GitHub Actions for most teams — it is free for public repos, well-documented, and has the largest ecosystem of community actions. For teams on GitLab or Bitbucket, we use native CI. We do not push you to a paid CI tool unless your build times specifically require it." },
      { q: "Can you handle a monorepo with multiple services?", a: "Yes. We use Turborepo or Nx for JavaScript monorepos and path filtering in CI to only build and deploy the services affected by each commit. Build times stay fast even as the repo grows." },
      { q: "What is your rollback strategy?", a: "For Kubernetes deployments, rollback is a single kubectl rollout undo command — takes under 30 seconds. For Vercel and Railway, we use deployment snapshots. Every pipeline has a documented rollback runbook." },
      { q: "What do self-hosted CI runners cost?", a: "GitHub-hosted runners are free up to 2,000 minutes/month, then roughly $0.008/minute. For teams with heavy build loads we set up self-hosted runners on a small EC2 instance — typically ₹2,000–4,000/month — which is usually cheaper and faster." },
      { q: "How long does a full DevOps setup take?", a: "3–4 weeks for a single-repo project with one production environment. Multi-service, multi-environment setups take 5–6 weeks. We give you a precise timeline after reviewing your codebase." },
    ],
    relatedSlugs: ["cloud-infrastructure-setup", "backend-development", "cloud-architecture-review"],
  },

  // ─── Database Administration ──────────────────────────────────────────────────
  {
    slug: "database-administration",
    column: "Cloud Services",
    title: "Database Administration",
    tagline: "Databases That Never Let You Down",
    metaTitle: "Database Administration Services India | PostgreSQL, MySQL, MongoDB | Conveys",
    metaDescription: "Schema design, query optimisation, backup, HA, and migration by experienced DBAs. PostgreSQL, MySQL, MongoDB for Indian businesses. Fixed pricing.",
    overview: [
      "Schema design, query optimisation, automated backups, high availability, and migration support — managed by DBAs who have run databases for production systems handling millions of rows.",
      "We work with your existing stack or help you choose the right database for your workload — relational, document, or time-series.",
    ],
    offerings: [
      { title: "Schema Design & Modelling", description: "Normalised schema design, index strategy, and constraint modelling for relational databases — or document structure and aggregation pipeline design for MongoDB. Built for query performance, not just correctness.", icon: ICONS.database },
      { title: "Query & Index Optimisation", description: "EXPLAIN ANALYZE on your slowest queries, missing index identification, query rewrite, and connection pool tuning. We typically cut p95 query time by 60–80% on first engagement.", icon: ICONS.bolt },
      { title: "Backup & Recovery", description: "Automated daily snapshots, point-in-time recovery setup, off-site backup to S3, and a tested restoration runbook. We run a restore drill so you know the backup actually works before you need it.", icon: ICONS.upload },
      { title: "Replication & High Availability", description: "Primary-replica streaming replication, automatic failover with Patroni or RDS Multi-AZ, and read replica routing — so a single node failure does not take your app down.", icon: ICONS.refresh },
      { title: "Database Migration", description: "MySQL to PostgreSQL, MongoDB to relational, or any legacy DB to a modern ORM-managed schema — with row-count validation, data transformation scripts, and a zero-downtime cutover plan.", icon: ICONS.server },
      { title: "Security & Access Control", description: "Role-based access with least privilege, row-level security policies, encryption at rest and in transit, audit logging, and vulnerability scanning for known CVEs in your database version.", icon: ICONS.shield },
    ],
    process: [
      { step: "01", title: "Audit", duration: "Day 1–2", body: "We review your schema, slow query log, connection pool settings, and backup configuration. You get a written findings report with severity ratings." },
      { step: "02", title: "Design", duration: "Day 3–5", body: "Schema improvements, index additions, and migration plan documented and reviewed with your team before any changes touch production." },
      { step: "03", title: "Staging Implementation", duration: "Week 2", body: "All changes applied to a staging clone first. Performance benchmarks run before and after. Rollback scripts prepared." },
      { step: "04", title: "Production Rollout", duration: "Week 2–3", body: "Changes applied to production in a maintenance window or online (depending on the change type). Query performance monitored in real time." },
      { step: "05", title: "Monitoring Setup", duration: "Week 3", body: "pgBouncer connection pool metrics, slow query alerts, replication lag monitoring, and disk usage alerts configured in Datadog or Grafana." },
      { step: "06", title: "Ongoing DBA", duration: "Monthly", body: "Monthly retainer covers capacity planning, index maintenance, vacuum tuning, version upgrades, and ad-hoc query review." },
    ],
    techStack: [
      { name: "PostgreSQL", category: "Database" },
      { name: "MySQL", category: "Database" },
      { name: "MongoDB", category: "Database" },
      { name: "Redis", category: "Cache" },
      { name: "AWS RDS", category: "Managed DB" },
      { name: "Prisma ORM", category: "ORM" },
      { name: "pgBouncer", category: "Connection Pool" },
      { name: "TimescaleDB", category: "Time-Series" },
    ],
    faqs: [
      { q: "PostgreSQL or MySQL — which should I use?", a: "PostgreSQL for almost everything new. It has better concurrency (MVCC), richer data types (JSONB, arrays, ranges), row-level security, and a more active open-source community. MySQL is fine if you are migrating an existing app — we will not force a migration that is not necessary." },
      { q: "Should I use a managed database (RDS, Cloud SQL) or self-hosted?", a: "Managed for 95% of projects. AWS RDS or Cloud SQL handle automated backups, minor version patches, and Multi-AZ failover. The cost premium is worth it unless you have very high I/O or very strict compliance requirements that prevent using managed services." },
      { q: "How often should databases be backed up?", a: "Daily snapshots at minimum, with point-in-time recovery (PITR) enabled so you can restore to any second in the last 7–35 days. For financial or healthcare data, we recommend continuous WAL archiving to S3 and a tested monthly restore drill." },
      { q: "How do you handle migrations without downtime?", a: "We use expand-contract migrations: first add new columns/tables without removing old ones, deploy the new application code, then remove the old schema in a follow-up migration. For large tables, we use pg_repack or online schema change tools so locks are minimal." },
      { q: "Do you offer an ongoing DBA retainer?", a: "Yes. Monthly retainers cover capacity planning, index maintenance, vacuum tuning, version upgrades, query review, and incident response. Retainers start at ₹15,000/month for a single PostgreSQL instance." },
    ],
    relatedSlugs: ["backend-development", "cloud-infrastructure-setup", "site-migration"],
  },

  // ─── Native App Development ───────────────────────────────────────────────────
  {
    slug: "native-app-development",
    column: "IT Software Consultancy",
    title: "Native App Development",
    tagline: "Native iOS & Android Apps With No Compromise",
    metaTitle: "Native iOS & Android App Development India | Swift, Kotlin | Conveys",
    metaDescription: "Swift for iOS, Kotlin for Android — platform-native apps that leverage the full device API and pass App Store review first time. Fixed pricing for Indian businesses.",
    overview: [
      "Swift for iOS and Kotlin for Android — we build platform-native apps that use the full device API, meet Apple and Google design guidelines, and pass store review first time.",
      "When your product needs the absolute best performance, deepest OS integration, or a platform-specific experience that cross-platform frameworks cannot replicate, native is the right call.",
    ],
    offerings: [
      { title: "iOS App Development", description: "Native Swift apps targeting the latest iOS. We follow Apple's Human Interface Guidelines, use SwiftUI for modern layouts, and handle App Store submission including review escalations.", icon: ICONS.phone },
      { title: "Android App Development", description: "Kotlin-powered Android apps built with Jetpack Compose, targeting the full Android device ecosystem — phones, tablets, and foldables. Published to Google Play with full release management.", icon: ICONS.phone },
      { title: "App Store Submission", description: "App Store Connect and Google Play Console setup, screenshots, metadata, privacy policy, and age ratings — we manage the full submission and respond to reviewer questions on your behalf.", icon: ICONS.upload },
      { title: "In-App Purchases & Subscriptions", description: "StoreKit 2 (iOS) and Google Play Billing (Android) integration for one-time purchases, consumables, and auto-renewing subscriptions — with RevenueCat for cross-platform subscription management.", icon: ICONS.bag },
      { title: "Push Notifications", description: "APNs (iOS) and FCM (Android) push notification integration with segmentation, scheduling, and deep-link routing so taps land on the right screen.", icon: ICONS.broadcast },
      { title: "Offline Support", description: "CoreData or Room database for offline-first data storage, background sync, and conflict resolution — so your app is usable even on 2G or without any signal.", icon: ICONS.database },
    ],
    process: [
      { step: "01", title: "Discovery & Scope", duration: "Day 1–3", body: "Platform decision (iOS-first, Android-first, or both simultaneously), core feature list, and API contract agreed. Fixed-price quote issued." },
      { step: "02", title: "UX Design", duration: "Week 1–2", body: "Figma prototypes for every screen, following platform-specific HIG or Material 3 conventions. Design approved before development begins." },
      { step: "03", title: "Development Sprints", duration: "Week 2–8", body: "Two-week sprints with TestFlight (iOS) or Firebase App Distribution (Android) builds at each sprint end. You test on a real device every two weeks." },
      { step: "04", title: "QA & Performance", duration: "Week 8–9", body: "Device matrix testing, memory profiling, battery impact analysis, and accessibility audit (VoiceOver / TalkBack). Crash-free rate target: 99.9%." },
      { step: "05", title: "Store Submission", duration: "Week 9–10", body: "Full App Store and Play Store submission package prepared and submitted. We handle review responses — typical approval: 1–3 days for iOS, 2–7 days for Android." },
      { step: "06", title: "Post-Launch Support", duration: "Ongoing", body: "30-day free bug-fix period. After that, monthly retainer for OS compatibility updates, new device support, and feature additions." },
    ],
    techStack: [
      { name: "Swift / SwiftUI", category: "iOS" },
      { name: "Kotlin / Jetpack Compose", category: "Android" },
      { name: "Xcode", category: "IDE" },
      { name: "Android Studio", category: "IDE" },
      { name: "Firebase", category: "Backend Services" },
      { name: "TestFlight", category: "iOS Beta" },
      { name: "Fastlane", category: "Automation" },
      { name: "RevenueCat", category: "Subscriptions" },
      { name: "Sentry", category: "Crash Reporting" },
    ],
    faqs: [
      { q: "When does native make more sense than React Native?", a: "Native wins when you need deep OS integration (ARKit, HealthKit, on-device ML, background audio, custom camera pipelines), when performance is critical (60fps animations, real-time audio), or when your team already has Swift/Kotlin expertise. For most B2B apps and straightforward consumer apps, React Native is faster and cheaper." },
      { q: "How do you handle App Store rejections?", a: "We write rejection-proof submissions by reviewing Apple's common rejection reasons before submission. If a rejection does occur, we respond within 24 hours and have a 100% resolution rate — no project has been permanently rejected." },
      { q: "Is native more expensive than cross-platform?", a: "Yes — building two native apps costs roughly 1.6× a single React Native app that covers both platforms. The trade-off is better performance, deeper OS integration, and no dependency on a cross-platform framework's release cycle." },
      { q: "What is the typical timeline for a native app?", a: "A focused single-platform app with 10–15 screens takes 10–14 weeks from design to App Store. A dual-platform app with a custom backend takes 16–20 weeks. We do not cut corners on QA to hit an aggressive deadline." },
      { q: "Do you maintain the app after launch?", a: "Yes. iOS releases one major OS version per year that can require UI updates. Android has more fragmentation. We offer annual maintenance contracts that cover OS compatibility, security patches, and minor feature additions." },
    ],
    relatedSlugs: ["mobile-app-development", "cross-platform-development", "ui-ux-design"],
  },

  // ─── Custom Software Development ─────────────────────────────────────────────
  {
    slug: "custom-software-development",
    column: "IT Software Consultancy",
    title: "Custom Software Development",
    tagline: "Software Built Around Your Business, Not the Other Way Around",
    metaTitle: "Custom Software Development India | Web Apps, Portals, APIs | Conveys",
    metaDescription: "Custom web applications, enterprise portals, and internal tools for Indian businesses. In-house team, fixed pricing, full IP ownership. Next.js, Node.js, PostgreSQL.",
    overview: [
      "Off-the-shelf tools always compromise somewhere. We engineer custom web applications, enterprise dashboards, and internal tools that fit your exact workflow — with APIs that connect everything you already use.",
      "You own the IP, you own the code, and you get a team that treats your product like their own.",
    ],
    offerings: [
      { title: "Requirements Analysis & Scoping", description: "We run structured discovery workshops to extract every business rule, edge case, and integration requirement — then produce a written spec you approve before a line of code is written.", icon: ICONS.document },
      { title: "Web Application Development", description: "React and Next.js frontends backed by Fastify APIs and PostgreSQL — SSR for SEO, React Query for data, and Tailwind for a UI that your team can actually maintain.", icon: ICONS.globe },
      { title: "Enterprise Portals & Dashboards", description: "Role-based access portals, internal admin panels, reporting dashboards, and approval workflows for businesses that have outgrown spreadsheets and generic SaaS tools.", icon: ICONS.building },
      { title: "API Development & Integration", description: "REST APIs with OpenAPI documentation, webhook systems, third-party integrations (payment gateways, CRMs, ERPs), and OAuth flows — built with Fastify and typed end-to-end.", icon: ICONS.link },
      { title: "Legacy System Modernisation", description: "We migrate legacy PHP, Java, or .NET applications to modern Node.js + React stacks — incrementally, so the old system stays live while the new one is built alongside it.", icon: ICONS.refresh },
      { title: "Ongoing Support & Enhancement", description: "30-day free bug-fix period followed by a monthly retainer for feature additions, dependency updates, and performance tuning. We do not hand off and disappear.", icon: ICONS.wrench },
    ],
    process: [
      { step: "01", title: "Discovery", duration: "Week 1", body: "Stakeholder interviews, user journey mapping, and technical requirements gathering. Output: a written spec, wireframes, and a fixed-price quote." },
      { step: "02", title: "Architecture", duration: "Week 1–2", body: "Database schema, API contract, component hierarchy, and third-party integration map. All documented and reviewed before development starts." },
      { step: "03", title: "UX Design", duration: "Week 2–3", body: "Figma prototypes for every key screen. We iterate on design with you until it is approved — development starts only after sign-off." },
      { step: "04", title: "Development Sprints", duration: "Week 3–10", body: "Two-week agile sprints. You get a staging URL from day one and a working build at the end of every sprint. No black boxes." },
      { step: "05", title: "QA & UAT", duration: "Week 10–11", body: "Automated Vitest and Playwright tests, manual edge-case testing, and a structured user acceptance testing session with your team." },
      { step: "06", title: "Launch & Support", duration: "Week 12+", body: "Production deployment, monitoring setup, team training, and the 30-day free bug-fix period. Retainer options available from week 13." },
    ],
    techStack: [
      { name: "Next.js 15", category: "Frontend" },
      { name: "React 19", category: "UI" },
      { name: "TypeScript", category: "Language" },
      { name: "Fastify", category: "Backend" },
      { name: "PostgreSQL", category: "Database" },
      { name: "Prisma ORM", category: "ORM" },
      { name: "Docker", category: "Containers" },
      { name: "AWS / Vercel", category: "Hosting" },
      { name: "Stripe / Razorpay", category: "Payments" },
      { name: "Clerk", category: "Auth" },
    ],
    faqs: [
      { q: "Do you work on fixed price or time and materials?", a: "Both. For well-defined scopes we prefer fixed price — you know the total cost before we start. For evolving products we use time-and-materials with a monthly cap so there are never surprise invoices. We agree the commercial model in the discovery call." },
      { q: "How do you scope a project accurately?", a: "Discovery workshops where we extract every user story and integration requirement, followed by a written spec. If a requirement is unclear, we mark it as an assumption and flag it explicitly. We have delivered 94% of projects within the original quoted price." },
      { q: "Who owns the intellectual property?", a: "You do. All code, designs, and documentation are assigned to you at project completion. We do not retain any licence or rights to your codebase." },
      { q: "What happens after the project launches?", a: "30-day free bug-fix period for any defects in the delivered scope. After that, monthly retainers starting at ₹12,000/month cover feature additions, dependency upgrades, and on-call support." },
      { q: "How long does a custom software project take?", a: "A simple internal tool or portal takes 8–12 weeks. A complex multi-role system with third-party integrations takes 16–24 weeks. We give you a precise Gantt chart after the discovery workshop." },
    ],
    relatedSlugs: ["web-development", "saas-product-development", "api-integration-development"],
  },

  // ─── Cross Platform Development ───────────────────────────────────────────────
  {
    slug: "cross-platform-development",
    column: "IT Software Consultancy",
    title: "Cross Platform Development",
    tagline: "One Codebase. iOS, Android, Web — All Covered.",
    metaTitle: "Cross-Platform App Development India | React Native, Expo | Conveys",
    metaDescription: "React Native and Expo apps for iOS and Android from a single codebase. 80% code sharing, native performance, App Store ready. Fixed pricing for Indian businesses.",
    overview: [
      "React Native and Expo let us share up to 80% of code across iOS, Android, and web without sacrificing native performance or platform-specific UI conventions. You ship faster and maintain one codebase instead of three.",
      "The right choice for most B2B apps, marketplaces, and internal tools — where shipping speed and cost matter more than squeezing out the last 5% of native performance.",
    ],
    offerings: [
      { title: "React Native App Development", description: "Full-featured iOS and Android apps from a single TypeScript codebase — navigation, animations, gestures, and native module access all included.", icon: ICONS.phone },
      { title: "Expo Managed Workflow", description: "Expo SDK setup, EAS Build for cloud compilation, and EAS Submit for automated App Store and Play Store uploads — no Mac required to ship an iOS app.", icon: ICONS.cube },
      { title: "Code Sharing Strategy", description: "Monorepo setup with shared business logic, API clients, and state management — while platform-specific UI components stay isolated so each platform feels native.", icon: ICONS.code },
      { title: "Platform-Specific UI", description: "We use platform checks and native component libraries (React Native Paper, NativeBase) to deliver the correct native look and feel on each OS — not a generic lowest-common-denominator UI.", icon: ICONS.pencil },
      { title: "OTA Updates", description: "Expo Updates integration lets you ship bug fixes and non-native code changes to users instantly — without waiting for App Store review cycles.", icon: ICONS.refresh },
      { title: "App Store Submission", description: "Full App Store Connect and Google Play Console submission — screenshots, metadata, privacy manifest, and review management on both platforms.", icon: ICONS.upload },
    ],
    process: [
      { step: "01", title: "Discovery & Architecture", duration: "Day 1–3", body: "Platform targets, native module requirements, and shared/platform-specific split agreed. Monorepo or standalone project structure decided." },
      { step: "02", title: "UX Design", duration: "Week 1–2", body: "Figma screens for both iOS and Android — highlighting where platform conventions differ. Design approved before development." },
      { step: "03", title: "Development Sprints", duration: "Week 2–8", body: "Two-week sprints with EAS builds delivered at each sprint end — installable on your real devices via TestFlight and Firebase App Distribution." },
      { step: "04", title: "Platform Testing", duration: "Week 8–9", body: "Device matrix testing across popular Indian Android handsets and recent iPhones. Performance profiling with Flipper. Accessibility audit." },
      { step: "05", title: "Beta & Feedback", duration: "Week 9", body: "TestFlight and Play Store internal testing with your pilot users. Feedback loop before public submission." },
      { step: "06", title: "Store Submission", duration: "Week 10", body: "Both stores submitted in parallel. We manage review responses. Typical live date: 3–7 days after submission." },
    ],
    techStack: [
      { name: "React Native", category: "Framework" },
      { name: "Expo SDK", category: "Toolchain" },
      { name: "TypeScript", category: "Language" },
      { name: "Redux Toolkit", category: "State" },
      { name: "React Query", category: "Data Fetching" },
      { name: "Firebase", category: "Backend Services" },
      { name: "EAS Build", category: "CI/CD" },
      { name: "Fastlane", category: "Automation" },
    ],
    faqs: [
      { q: "React Native vs Flutter — which do you recommend?", a: "React Native for teams that already know JavaScript or TypeScript — zero context switch, shared code with your web frontend, and the largest ecosystem. Flutter for teams starting fresh who want pixel-perfect custom UI and are comfortable with Dart. We build in React Native; we do not currently offer Flutter." },
      { q: "Is React Native performance comparable to native?", a: "For 95% of app types — yes. The new architecture (JSI + Fabric) has eliminated the bridge bottleneck. Apps with heavy real-time graphics, AR, or on-device ML are better suited to native Swift/Kotlin." },
      { q: "Which platforms does Expo support?", a: "iOS, Android, and web (React Native Web). The same component tree can render in a browser, making it possible to ship a web version of your app with minimal additional work." },
      { q: "How do you handle platform-specific features?", a: "We use Expo's native modules for common features (camera, notifications, biometrics, location). For custom native functionality not covered by Expo, we write Expo Modules in Swift/Kotlin — keeping the cross-platform benefits while still accessing native APIs." },
      { q: "What is the timeline compared to separate native apps?", a: "A cross-platform app for both iOS and Android takes roughly the same time as a single-platform native app — typically 10–14 weeks for a focused app. That makes it roughly 40% faster and cheaper than building two native apps." },
    ],
    relatedSlugs: ["mobile-app-development", "native-app-development", "frontend-development"],
  },

  // ─── IoT Development ──────────────────────────────────────────────────────────
  {
    slug: "iot-development",
    column: "IT Software Consultancy",
    title: "IoT Development",
    tagline: "Connect Your Devices to the Cloud — Reliably",
    metaTitle: "IoT Development Services India | Firmware, Cloud, Dashboard | Conveys",
    metaDescription: "Full-stack IoT development — embedded firmware, cloud connectivity, real-time dashboards, and device management for Indian industrial and consumer applications.",
    overview: [
      "From embedded firmware on ESP32 microcontrollers to cloud dashboards that visualise real-time sensor data — we build the full IoT stack for industrial, agricultural, and consumer applications.",
      "We handle the hardware-software boundary, cloud architecture, and the operational complexity of managing thousands of devices in the field.",
    ],
    offerings: [
      { title: "Firmware & Embedded Development", description: "C/C++ firmware for ESP32, STM32, and Arduino-compatible boards — sensor drivers, power management, watchdog timers, and OTA firmware update support.", icon: ICONS.chip },
      { title: "Cloud Connectivity & MQTT", description: "Secure MQTT or HTTPS device-to-cloud communication with AWS IoT Core or custom brokers, TLS certificate provisioning, and device shadow for offline command queuing.", icon: ICONS.wifi },
      { title: "IoT Dashboard & Analytics", description: "Real-time Grafana or custom React dashboards with live telemetry, threshold alerting, historical trend analysis, and export to CSV for operations teams.", icon: ICONS.chart },
      { title: "Device Management Platform", description: "Fleet management UI for remote device status, firmware rollout, configuration push, and per-device audit logs — so your ops team can manage 10,000 devices as easily as 10.", icon: ICONS.cog },
      { title: "Protocol Implementation", description: "MQTT, CoAP, Modbus RTU/TCP, BACnet, and LoRaWAN — we implement the protocol your hardware or existing infrastructure requires, not the one that is easiest for us.", icon: ICONS.refresh },
      { title: "Security & OTA Updates", description: "Secure boot, encrypted storage, signed firmware images, and staged OTA rollout with automatic rollback if the new firmware causes device failures.", icon: ICONS.shield },
    ],
    process: [
      { step: "01", title: "Requirements & Hardware", duration: "Week 1", body: "Use case, sensor list, connectivity options (WiFi / cellular / LoRa), and power constraints mapped. Hardware BOM recommended or reviewed." },
      { step: "02", title: "Firmware Prototype", duration: "Week 2–3", body: "Working firmware on development board — sensor reading, connectivity, and basic OTA. You see data flowing to cloud in week 3." },
      { step: "03", title: "Cloud Backend", duration: "Week 3–5", body: "IoT Core rules, time-series database, REST API for the dashboard, and alerting pipeline built and tested with the prototype hardware." },
      { step: "04", title: "Dashboard", duration: "Week 5–6", body: "Real-time charts, device list, alert management, and user roles built in React or Grafana. Reviewed with your operations team." },
      { step: "05", title: "Field Testing", duration: "Week 7–8", body: "Devices deployed in a representative environment. Connectivity edge cases, power brownouts, and OTA updates tested under real conditions." },
      { step: "06", title: "Production & Handover", duration: "Week 8+", body: "Production firmware signed and locked. Device provisioning guide, cloud architecture docs, and runbooks delivered. Ongoing support available." },
    ],
    techStack: [
      { name: "ESP32 / STM32", category: "Hardware" },
      { name: "Arduino / ESP-IDF", category: "Firmware" },
      { name: "MQTT", category: "Protocol" },
      { name: "AWS IoT Core", category: "Cloud" },
      { name: "Node.js", category: "Backend" },
      { name: "InfluxDB", category: "Time-Series DB" },
      { name: "Grafana", category: "Dashboards" },
      { name: "PostgreSQL", category: "Database" },
      { name: "Docker", category: "Containers" },
    ],
    faqs: [
      { q: "Which microcontroller do you recommend?", a: "ESP32 for most new projects — dual-core, WiFi + BLE built in, large community, and cheap (under ₹300 per unit). For industrial applications needing real-time guarantees or -40°C operation, we evaluate STM32 or NXP options. We work with whatever hardware your supply chain can already source." },
      { q: "Which cloud platform should IoT devices connect to?", a: "AWS IoT Core for most projects — mature, well-documented, and integrates with the rest of the AWS ecosystem. For cost-sensitive high-volume deployments, we also work with self-hosted MQTT brokers (EMQX, Mosquitto) on EC2 or Railway." },
      { q: "WiFi vs cellular vs LoRaWAN — how do I choose?", a: "WiFi if devices are always near a router (home appliances, factory floors with WiFi coverage). Cellular (4G/LTE-M) if devices move or are in remote locations with no WiFi. LoRaWAN for battery-powered sensors that send small data packets over long distances with minimal power." },
      { q: "How do you handle data storage for large device fleets?", a: "Time-series data (telemetry) goes into InfluxDB or TimescaleDB — optimised for high write throughput and time-range queries. Device metadata, user accounts, and configuration go into PostgreSQL. We design the schema so queries stay fast at 10 million rows." },
      { q: "What is a typical IoT project timeline?", a: "A simple sensor-to-dashboard prototype takes 6–8 weeks. A production-ready system with fleet management, OTA, and multi-tenant support takes 14–20 weeks. Hardware sourcing and PCB design (if required) adds 4–8 weeks." },
    ],
    relatedSlugs: ["cloud-infrastructure-setup", "backend-development", "custom-software-development"],
  },

  // ─── UI & UX Designing ────────────────────────────────────────────────────────
  {
    slug: "ui-ux-design",
    column: "IT Software Consultancy",
    title: "UI & UX Designing",
    tagline: "Design That Converts, Not Just Impresses",
    metaTitle: "UI/UX Design Services India | Figma, Prototyping, Design Systems | Conveys",
    metaDescription: "UX research, wireframing, high-fidelity Figma prototyping, and design systems for Indian businesses. Pixel-perfect developer handoff included.",
    overview: [
      "UX research, wireframing, high-fidelity prototyping, and design systems — all in Figma. We hand off to developers with precise specs, interactive prototypes, and component libraries so what you approve is exactly what gets built.",
      "Good design is not decoration — it is the difference between a product users adopt and one they abandon after the first session.",
    ],
    offerings: [
      { title: "UX Research & User Testing", description: "User interviews, competitive analysis, heuristic evaluation, and Hotjar session review — so every design decision is grounded in evidence, not assumption.", icon: ICONS.search },
      { title: "Wireframing & Information Architecture", description: "Low-fidelity wireframes and IA maps that agree on structure and user flow before any visual design is produced. Faster iteration, lower revision cost.", icon: ICONS.document },
      { title: "High-Fidelity Prototyping", description: "Pixel-perfect Figma screens with interactive prototypes you can click through, share with stakeholders, and test with real users — before a developer writes a single line of code.", icon: ICONS.pencil },
      { title: "Design Systems & Style Guides", description: "Reusable component libraries in Figma with tokens for colour, typography, spacing, and motion — matched to your brand and ready for Storybook or Tailwind implementation.", icon: ICONS.cog },
      { title: "Usability Testing", description: "Moderated and unmoderated usability sessions with real users via Maze or UserTesting. Recordings, heatmaps, and a written findings report with prioritised fixes.", icon: ICONS.users },
      { title: "Developer Handoff (Figma)", description: "Annotated Figma files with redlines, responsive behaviour notes, motion specs, and asset exports. We answer developer questions during build to prevent design drift.", icon: ICONS.code },
    ],
    process: [
      { step: "01", title: "Research", duration: "Week 1", body: "User interviews (3–5 participants), competitor analysis, and analytics review. We understand who we are designing for before opening Figma." },
      { step: "02", title: "IA & Wireframes", duration: "Week 1–2", body: "Information architecture diagram and low-fidelity wireframes for every key screen. Structure approved before visual design begins." },
      { step: "03", title: "Visual Design", duration: "Week 2–4", body: "High-fidelity screens applying your brand — typography, colour, spacing, and iconography. Desktop and mobile breakpoints included." },
      { step: "04", title: "Prototype & Test", duration: "Week 4–5", body: "Interactive Figma prototype linked and tested with 5 real users. Findings documented and prioritised by severity." },
      { step: "05", title: "Iteration", duration: "Week 5–6", body: "Up to two revision rounds based on test findings and stakeholder feedback. Changes tracked in Figma version history." },
      { step: "06", title: "Handoff", duration: "Week 6", body: "Annotated Figma file, design token export, asset library, and a 1-hour handoff call with the development team. We stay available for questions during build." },
    ],
    techStack: [
      { name: "Figma", category: "Design" },
      { name: "FigJam", category: "Whiteboard" },
      { name: "Hotjar", category: "Analytics" },
      { name: "Maze", category: "User Testing" },
      { name: "Storybook", category: "Component Docs" },
      { name: "Lottie", category: "Animation" },
      { name: "Tailwind CSS", category: "Styling" },
      { name: "Zeroheight", category: "Design Docs" },
    ],
    faqs: [
      { q: "Do you do the development too, or just design?", a: "Both. Most clients engage us for design first, then development. You can also bring your own development team — we produce handoff-ready Figma files that any competent frontend developer can implement." },
      { q: "How many revision rounds are included?", a: "Two rounds of revisions per design phase are included in our standard engagement. Additional rounds are billed at ₹3,000–6,000 per session depending on scope. We find that two rounds is almost always enough when the wireframe phase has been approved properly." },
      { q: "What does a design system cost?", a: "A full design system (component library, token set, usage documentation) for a mid-sized product costs ₹80,000–1,50,000 depending on the number of components. A basic visual style guide (colours, typography, 10–15 core components) costs ₹30,000–60,000." },
      { q: "How long does UX design take for a new app?", a: "Research and IA: 1 week. Wireframes: 1 week. High-fidelity design for a 15–20 screen app: 2–3 weeks. Usability testing and iteration: 1–2 weeks. Full process: 5–7 weeks. Rushing design always costs more in development rework." },
      { q: "Do you use templates or design from scratch?", a: "We design from scratch using your brand guidelines. We do not use Envato or ThemeForest templates — every pixel is justified by your user research and business goals. We use component libraries (Radix UI, Headless UI) as a base for development, not for design." },
    ],
    relatedSlugs: ["frontend-development", "web-development", "custom-software-development"],
  },

  // ─── Frontend Development ─────────────────────────────────────────────────────
  {
    slug: "frontend-development",
    column: "IT Software Consultancy",
    title: "Frontend Development",
    tagline: "Fast, Accessible Frontends That Users Actually Enjoy",
    metaTitle: "Frontend Development Services India | React, Next.js, TypeScript | Conveys",
    metaDescription: "React 19, Next.js 15, TypeScript, and Tailwind CSS. Frontends that score 95+ on Lighthouse, load fast on 4G, and are WCAG 2.1 AA accessible. Fixed pricing.",
    overview: [
      "React 19, Next.js 15, TypeScript, and Tailwind CSS — we build frontends that score 95+ on Lighthouse, load in under 2 seconds on Indian 4G networks, and are accessible to every user from day one.",
      "No template themes, no bloated component libraries, no unnecessary dependencies — just clean, maintainable code that your team can own.",
    ],
    offerings: [
      { title: "React & Next.js Development", description: "App Router, server components, streaming SSR, and partial prerendering — we use the right Next.js rendering strategy for each page so you get the best possible performance and SEO.", icon: ICONS.code },
      { title: "Performance Optimisation", description: "Core Web Vitals audit, image optimisation, code splitting, bundle analysis, and font loading strategy. We target LCP under 2.5s and CLS under 0.1 on real Indian mobile devices.", icon: ICONS.bolt },
      { title: "Accessibility (WCAG 2.1 AA)", description: "Semantic HTML, ARIA labels, keyboard navigation, focus management, colour contrast audit, and screen reader testing with NVDA and VoiceOver. Accessibility is built in, not bolted on.", icon: ICONS.check },
      { title: "Animation & Micro-interactions", description: "Framer Motion page transitions, skeleton loaders, optimistic UI updates, and gesture-based interactions — the details that make a product feel premium without slowing it down.", icon: ICONS.sparkle },
      { title: "State Management", description: "Tanstack Query for server state, Zustand for UI state, and React Context where it fits — no Redux unless your complexity genuinely requires it.", icon: ICONS.cog },
      { title: "Component Testing", description: "Vitest unit tests for business logic, React Testing Library for component behaviour, and Playwright end-to-end tests for critical user journeys — all running in CI on every PR.", icon: ICONS.check },
    ],
    process: [
      { step: "01", title: "Design Review", duration: "Day 1–2", body: "We review your Figma files, identify inconsistencies, flag missing states (empty, loading, error), and agree on the component hierarchy before writing code." },
      { step: "02", title: "Component Architecture", duration: "Day 3–4", body: "Design system tokens, component library structure, and routing plan. Agreed with your backend team on API contract and data shapes." },
      { step: "03", title: "Development Sprints", duration: "Week 2–6", body: "Two-week sprints with a staging URL from day one. You see real components with real data — not static mocks." },
      { step: "04", title: "Performance Audit", duration: "Week 6", body: "Lighthouse CI run against every key page. Bundle size analysed. Any score below 90 is fixed before QA sign-off." },
      { step: "05", title: "Accessibility Audit", duration: "Week 6–7", body: "Automated axe-core scan plus manual keyboard navigation and screen reader testing. WCAG 2.1 AA compliance documented." },
      { step: "06", title: "QA & Handover", duration: "Week 7", body: "Cross-browser and cross-device testing, final PR merged, and a component documentation page left in the repo for your team." },
    ],
    techStack: [
      { name: "React 19", category: "UI Library" },
      { name: "Next.js 15", category: "Framework" },
      { name: "TypeScript", category: "Language" },
      { name: "Tailwind CSS", category: "Styling" },
      { name: "Framer Motion", category: "Animation" },
      { name: "Tanstack Query", category: "Data Fetching" },
      { name: "Zustand", category: "State" },
      { name: "Vitest", category: "Testing" },
      { name: "Playwright", category: "E2E Testing" },
    ],
    faqs: [
      { q: "Next.js App Router or Pages Router?", a: "App Router for all new projects. It enables React Server Components, streaming SSR, and partial prerendering — all of which meaningfully improve performance and SEO. We do not start new projects on Pages Router, but we maintain existing Pages Router projects." },
      { q: "SSR, SSG, or ISR — which should I use?", a: "SSR for pages with user-specific or frequently updated data. SSG for pages that are the same for everyone (marketing, blog). ISR for pages that change occasionally (product listings, pricing). Most real-world apps use all three — we choose per-route, not per-project." },
      { q: "Which browsers and devices do you support?", a: "The last 2 versions of Chrome, Firefox, Safari, and Edge. iOS Safari 16+ and Android Chrome (last 2 versions). We test on real devices — a Redmi and a mid-range Samsung represent the Indian market well. IE is not supported." },
      { q: "How do you handle design-to-development handoff?", a: "We use Figma's Dev Mode for measurements and tokens. Before coding, we do a design review to flag missing states and inconsistencies. During build, we check back with the designer on anything ambiguous rather than guessing." },
      { q: "How does frontend development affect SEO?", a: "Hugely. Server-rendered HTML is indexed immediately by Google. We use Next.js server components, correct heading hierarchy, structured data (JSON-LD), sitemap generation, canonical URLs, and Open Graph tags on every page." },
    ],
    relatedSlugs: ["web-development", "ui-ux-design", "backend-development"],
  },

  // ─── Backend Development ──────────────────────────────────────────────────────
  {
    slug: "backend-development",
    column: "IT Software Consultancy",
    title: "Backend Development",
    tagline: "APIs and Backends Built to Scale from Day One",
    metaTitle: "Backend Development Services India | Node.js, Fastify, PostgreSQL | Conveys",
    metaDescription: "Fastify REST APIs, PostgreSQL schemas, Redis caching, and BullMQ queues for Indian businesses. Secure, observable, production-ready backends. Fixed pricing.",
    overview: [
      "Fastify REST APIs, PostgreSQL schemas, Redis caching, and BullMQ queues — we engineer the server layer that powers your product. Secure, observable, and production-ready from the first deploy.",
      "Every API we ship has OpenAPI documentation, structured logging, rate limiting, and a test suite. No cowboy code, no technical debt handed to you on day one.",
    ],
    offerings: [
      { title: "REST API Design & Development", description: "OpenAPI-first API design, Fastify route handlers, request validation with Zod, and response serialisation — typed end-to-end with TypeScript so frontend and backend never disagree on data shapes.", icon: ICONS.server },
      { title: "Authentication & Authorisation", description: "JWT-based auth with Clerk or custom implementation, role-based access control, API key management, OAuth 2.0 / OpenID Connect integration, and session management.", icon: ICONS.lock },
      { title: "Database Design & ORM", description: "PostgreSQL schema design, Prisma ORM setup, migration management, query optimisation, and row-level security for multi-tenant applications.", icon: ICONS.database },
      { title: "Caching & Queue Architecture", description: "Redis caching strategy (cache-aside, write-through), BullMQ job queues for async work (emails, file processing, webhooks), and rate limiting to protect your API from abuse.", icon: ICONS.refresh },
      { title: "Microservices & Monolith", description: "We default to a well-structured monolith and extract services only when you have a genuine scalability or team boundary reason to do so — not because microservices are fashionable.", icon: ICONS.cube },
      { title: "API Documentation", description: "Auto-generated Swagger UI from your Fastify route schemas, plus a written integration guide for any third-party consumers. Your API is documented before it ships.", icon: ICONS.document },
    ],
    process: [
      { step: "01", title: "Architecture Design", duration: "Day 1–3", body: "Data model, API contract (OpenAPI spec), service boundaries, and integration map agreed with your team before implementation begins." },
      { step: "02", title: "API Spec", duration: "Day 3–5", body: "Full OpenAPI specification written and reviewed. Frontend team can start mock development immediately using the spec." },
      { step: "03", title: "Development", duration: "Week 2–6", body: "Fastify routes, Prisma schema, Redis integration, and BullMQ workers built in two-week sprints. Staging environment available from week 2." },
      { step: "04", title: "Testing", duration: "Week 6–7", body: "Vitest unit tests for business logic, integration tests against a real PostgreSQL instance, and load testing with k6 to verify your SLAs hold under traffic." },
      { step: "05", title: "Documentation", duration: "Week 7", body: "Swagger UI deployed to staging, integration guide written, and environment variable documentation added to the README." },
      { step: "06", title: "Deployment", duration: "Week 7–8", body: "Production deployment to Railway or AWS, health check endpoints, structured logging to Datadog, and Sentry error tracking configured." },
    ],
    techStack: [
      { name: "Node.js 20", category: "Runtime" },
      { name: "Fastify", category: "Framework" },
      { name: "TypeScript", category: "Language" },
      { name: "PostgreSQL", category: "Database" },
      { name: "Prisma ORM", category: "ORM" },
      { name: "Redis", category: "Cache" },
      { name: "BullMQ", category: "Job Queue" },
      { name: "Docker", category: "Containers" },
      { name: "Swagger / OpenAPI", category: "Docs" },
      { name: "Zod", category: "Validation" },
    ],
    faqs: [
      { q: "REST or GraphQL?", a: "REST for most projects — simpler to implement, easier to cache, and better understood by most teams. GraphQL when you have many different clients (web, mobile, third-party) with very different data requirements, or when over-fetching is a genuine performance problem. We build both." },
      { q: "Monolith or microservices?", a: "Monolith first, always. A well-structured monolith is faster to build, easier to debug, and simpler to deploy. We extract a service when you have a specific reason: independent scalability, team autonomy, or a polyglot requirement. Most startups that went microservices too early regret it." },
      { q: "How do you handle authentication?", a: "Clerk for new projects — it handles JWTs, sessions, MFA, social login, and organisation management out of the box, so we focus on your business logic. For projects with compliance requirements that prevent third-party auth, we implement a custom JWT stack with refresh token rotation." },
      { q: "How do you handle API versioning?", a: "URL prefix versioning (/v1/, /v2/) for public APIs that third parties consume. For internal APIs, we use a monorepo with a shared type package so breaking changes are caught at compile time before they reach production." },
      { q: "Do you implement rate limiting?", a: "Yes — always. We use Redis-backed sliding window rate limiting at the API gateway layer, with separate limits per route (e.g., stricter on auth endpoints). DDoS protection sits at Cloudflare before requests even reach your server." },
    ],
    relatedSlugs: ["api-integration-development", "frontend-development", "cloud-infrastructure-setup"],
  },

  // ─── Digital Transformation ───────────────────────────────────────────────────
  {
    slug: "digital-transformation",
    column: "Digital & IT Solutions",
    title: "Digital Transformation",
    tagline: "Move from Legacy Systems to Modern Infrastructure — Without the Risk",
    metaTitle: "Digital Transformation Services India | Legacy Modernisation | Conveys",
    metaDescription: "Digital strategy, legacy modernisation, process automation, and cloud migration for Indian businesses. Phased approach — the business never stops. Fixed pricing.",
    overview: [
      "Digital transformation is not a product you buy — it is a process you manage. We assess your current workflows, identify the highest-ROI modernisation opportunities, and implement changes in phases so the business never stops running while the transformation happens.",
      "We have helped Indian manufacturing, retail, and services businesses move from spreadsheets and on-premise servers to cloud-native, automated systems — without the horror stories.",
    ],
    offerings: [
      { title: "Digital Strategy & Roadmap", description: "A 12-month transformation roadmap prioritised by ROI, risk, and team capacity — not by what technology vendors are selling. Every initiative tied to a measurable business outcome.", icon: ICONS.lightbulb },
      { title: "Legacy System Modernisation", description: "Strangler fig pattern migration from legacy PHP, VB.NET, or Access systems to modern web applications — incrementally, so the old system stays live while the new one is built alongside it.", icon: ICONS.refresh },
      { title: "Business Process Automation", description: "Manual workflows identified, mapped, and automated using custom software, Zapier, or Make.com — reducing data entry errors and freeing staff for higher-value work.", icon: ICONS.cog },
      { title: "Cloud Migration", description: "On-premise servers, cPanel hosting, and data-centre workloads migrated to AWS, GCP, or Azure — with cost modelling, risk assessment, and a rollback plan.", icon: ICONS.cloud },
      { title: "Data Analytics & Reporting", description: "Business intelligence dashboards that give decision-makers real-time visibility into sales, operations, and finance — replacing weekly Excel reports with live data.", icon: ICONS.chart },
      { title: "Change Management", description: "Staff training plans, communication frameworks, and adoption tracking so technology investments actually get used — not shelfware.", icon: ICONS.users },
    ],
    process: [
      { step: "01", title: "Assessment", duration: "Week 1–2", body: "Current-state mapping: every system, workflow, integration, and pain point documented. Interviews with department heads and power users." },
      { step: "02", title: "Strategy", duration: "Week 2–3", body: "Transformation roadmap produced with initiatives ranked by ROI, effort, and risk. Board-ready presentation included." },
      { step: "03", title: "Pilot", duration: "Week 4–8", body: "Highest-ROI initiative implemented first — proves the approach, builds organisational confidence, and delivers a quick win." },
      { step: "04", title: "Rollout", duration: "Month 3–9", body: "Remaining initiatives delivered in priority order. Each phase has defined success metrics reviewed at completion." },
      { step: "05", title: "Optimisation", duration: "Month 9–12", body: "Analytics review, adoption measurement, and performance tuning across all implemented systems." },
      { step: "06", title: "Continuous Improvement", duration: "Ongoing", body: "Quarterly roadmap reviews to incorporate new business requirements and emerging technology opportunities." },
    ],
    techStack: [
      { name: "Next.js", category: "Frontend" },
      { name: "AWS / GCP", category: "Cloud" },
      { name: "PostgreSQL", category: "Database" },
      { name: "Power BI", category: "Analytics" },
      { name: "Zapier / Make.com", category: "Automation" },
      { name: "Prisma", category: "ORM" },
      { name: "Docker", category: "Containers" },
      { name: "Datadog", category: "Monitoring" },
    ],
    faqs: [
      { q: "How long does a digital transformation programme take?", a: "A full transformation for a 50-person business typically takes 12–18 months. However, individual initiatives deliver value within 6–8 weeks. We structure programmes so you see ROI in the first quarter, not only at the end." },
      { q: "Do we need to replace everything at once?", a: "No — and we strongly advise against it. The strangler fig approach replaces one system at a time while keeping the old system running. This reduces risk, allows learning between phases, and keeps the business operational throughout." },
      { q: "What ROI can we expect?", a: "Typical outcomes include 30–50% reduction in manual data entry time, 20–40% reduction in reporting cycle time, and 15–25% reduction in IT infrastructure cost after cloud migration. We model expected ROI in the strategy phase before any work begins." },
      { q: "Who manages the transformation internally?", a: "We recommend a named internal project owner who has decision-making authority. We supply the technical and project management expertise; they supply business knowledge and organisational access. Transformations without an empowered internal owner consistently fail." },
      { q: "What if staff resist the change?", a: "Resistance is normal and manageable. We build change management into every phase: early stakeholder involvement, transparent communication, training before go-live, and a feedback channel. We have not had a rollout fail due to staff resistance on any engagement." },
    ],
    relatedSlugs: ["managed-it-services", "cloud-infrastructure-setup", "custom-software-development"],
  },

  // ─── Managed IT Services ──────────────────────────────────────────────────────
  {
    slug: "managed-it-services",
    column: "Digital & IT Solutions",
    title: "Managed IT Services",
    tagline: "Your IT Team, Fully Managed — Without the Overhead",
    metaTitle: "Managed IT Services India | 24/7 Monitoring, Help Desk, Backup | Conveys",
    metaDescription: "24/7 infrastructure monitoring, help desk support, patch management, backup, and security for Indian businesses on a predictable monthly retainer.",
    overview: [
      "24/7 infrastructure monitoring, help desk support, patch management, backup, and security — all on a predictable monthly retainer. We act as your outsourced IT department so your team stays focused on the business.",
      "No surprise invoices, no escalation queues, no three-month notice periods. A named account manager and a defined SLA from day one.",
    ],
    offerings: [
      { title: "24/7 Infrastructure Monitoring", description: "Datadog or Grafana agents on every server. CPU, memory, disk, and network thresholds alert your account manager before users notice anything. Mean time to detect: under 3 minutes.", icon: ICONS.chart },
      { title: "Help Desk & User Support", description: "Tier 1–3 support via WhatsApp, email, and phone. Password resets and laptop issues handled in minutes; complex incidents escalated with SLA tracking in Jira Service Management.", icon: ICONS.users },
      { title: "Patch & Update Management", description: "Monthly OS and application patch cycles with pre-production testing, scheduled maintenance windows, and rollback procedures — so security updates never take down production.", icon: ICONS.refresh },
      { title: "Backup & Disaster Recovery", description: "Daily encrypted backups to a separate cloud region, weekly restore tests, and a documented DR runbook with defined RTO and RPO targets. You know exactly how fast you can recover.", icon: ICONS.database },
      { title: "Security Management", description: "Endpoint protection, firewall rule reviews, WAF configuration, SSL certificate management, and quarterly vulnerability scans — plus incident response if something does get through.", icon: ICONS.shield },
      { title: "IT Strategy & Budgeting", description: "Annual IT budgeting support, vendor contract reviews, technology roadmap, and hardware lifecycle planning — so IT decisions are proactive, not reactive.", icon: ICONS.lightbulb },
    ],
    process: [
      { step: "01", title: "Onboarding Audit", duration: "Week 1", body: "Full inventory of every server, device, licence, and vendor contract. We find the gaps — expired SSL certs, unmonitored servers, missing backups — before they become incidents." },
      { step: "02", title: "Runbook Creation", duration: "Week 1–2", body: "Documented procedures for every routine task and common incident type. Your infrastructure's tribal knowledge captured and structured." },
      { step: "03", title: "Monitoring Setup", duration: "Week 2", body: "Agents installed, thresholds tuned to your normal operating range, and alert routing configured. First false-positive-free week is the handover milestone." },
      { step: "04", title: "SLA Agreement", duration: "Week 2", body: "Response and resolution SLAs agreed per severity level (P1–P4). Escalation matrix signed off by both parties." },
      { step: "05", title: "Operations", duration: "Month 1+", body: "Monthly patch cycles, weekly backup verification, quarterly security scans, and a monthly service review call with your account manager." },
      { step: "06", title: "Quarterly Reviews", duration: "Quarterly", body: "SLA performance report, incident trend analysis, cost optimisation recommendations, and technology roadmap update." },
    ],
    techStack: [
      { name: "Datadog", category: "Monitoring" },
      { name: "PagerDuty", category: "Alerting" },
      { name: "Cloudflare", category: "Security / CDN" },
      { name: "AWS / Azure", category: "Cloud" },
      { name: "Veeam", category: "Backup" },
      { name: "Microsoft 365", category: "Productivity" },
      { name: "Fortinet", category: "Firewall" },
      { name: "Jira Service Management", category: "Help Desk" },
    ],
    faqs: [
      { q: "What is included in the monthly retainer?", a: "24/7 monitoring, help desk support (business hours for Tier 1, 24/7 for P1 incidents), monthly patch management, weekly backup verification, quarterly security scans, and a monthly review call. Everything is itemised in the service description so you know exactly what you are paying for." },
      { q: "What are your response time SLAs?", a: "P1 (system down): 15-minute response, 2-hour resolution target. P2 (major degradation): 1-hour response, 4-hour resolution. P3 (minor issue): 4-hour response, next-business-day resolution. P4 (information request): 8 business hours. SLAs are measured and reported monthly." },
      { q: "Do you provide hardware?", a: "We manage hardware but do not supply or lease it. We can advise on procurement, negotiate vendor contracts, and manage hardware lifecycles — but the assets remain yours." },
      { q: "How do you handle security incidents?", a: "Incidents trigger our IR runbook: isolate, assess, contain, eradicate, recover, document. For suspected breaches we engage our security partners for forensic analysis. You are notified within 15 minutes of a P1 security incident and receive a written post-incident report within 48 hours." },
      { q: "What is the minimum contract length?", a: "12 months, with a 30-day notice period after the initial term. We offer month-to-month after the first year. Shorter commitments are available for project-based engagements — speak to us about your situation." },
    ],
    relatedSlugs: ["managed-service-provider", "cloud-infrastructure-setup", "digital-transformation"],
  },

  // ─── Digital Marketing ────────────────────────────────────────────────────────
  {
    slug: "digital-marketing",
    column: "Digital & IT Solutions",
    title: "Digital Marketing Services",
    tagline: "More Leads. Less Spend. Measurable Results.",
    metaTitle: "Digital Marketing Services India | SEO, Google Ads, Meta Ads | Conveys",
    metaDescription: "SEO, Google Ads, Meta Ads, and content marketing for Indian SMBs. Every rupee tracked, every result reported. Fixed monthly management fee.",
    overview: [
      "SEO, Google Ads, Meta Ads, and content marketing — all managed by specialists who have run campaigns for Indian SMBs across manufacturing, retail, SaaS, and services. Every rupee tracked, every result reported.",
      "No vanity metrics. No mystery black boxes. You see exactly what you spent, what traffic it generated, and what leads or sales it produced.",
    ],
    offerings: [
      { title: "Search Engine Optimisation (SEO)", description: "Technical SEO audit, keyword research, on-page optimisation, content strategy, and backlink building — with monthly rank tracking and a transparent report you can understand without being an expert.", icon: ICONS.search },
      { title: "Google Ads Management", description: "Search, Display, and Performance Max campaigns with keyword strategy, ad copy, landing page recommendations, conversion tracking, and weekly bid optimisation.", icon: ICONS.bolt },
      { title: "Meta Ads (Facebook & Instagram)", description: "Audience research, creative strategy, A/B testing, retargeting sequences, and ROAS optimisation — for lead generation, app installs, or e-commerce conversions.", icon: ICONS.broadcast },
      { title: "Content Marketing & Blogging", description: "SEO-optimised blog posts, case studies, and landing page copy written by humans with industry knowledge — not AI content farms that Google is actively penalising.", icon: ICONS.pencil },
      { title: "Email Campaign Management", description: "Drip sequences, promotional broadcasts, and transactional email design via Resend or Mailchimp — with deliverability monitoring and list hygiene maintenance.", icon: ICONS.document },
      { title: "Analytics & Reporting", description: "GA4 setup and event tracking, Google Search Console integration, monthly performance reports, and a live dashboard you can check any time without asking us for a screenshot.", icon: ICONS.chart },
    ],
    process: [
      { step: "01", title: "Audit", duration: "Week 1", body: "Technical SEO audit, competitor analysis, current ad account review, and keyword opportunity mapping. We find what is working, what is broken, and what to prioritise." },
      { step: "02", title: "Strategy", duration: "Week 1–2", body: "Channel mix, budget allocation, 90-day content calendar, and campaign structure documented and approved before any spend goes live." },
      { step: "03", title: "Setup & Creative", duration: "Week 2–3", body: "Campaigns built, tracking verified (conversions firing correctly), and first creative assets produced. We do not go live until we can measure." },
      { step: "04", title: "Launch", duration: "Week 3", body: "Campaigns go live with conservative budgets. First 2 weeks are a learning phase — we collect data before making significant optimisation decisions." },
      { step: "05", title: "Optimisation", duration: "Week 5+", body: "Weekly bid adjustments, A/B test launches, negative keyword additions, and landing page experiments. Continuous improvement, not set-and-forget." },
      { step: "06", title: "Monthly Reporting", duration: "Monthly", body: "Full performance report: spend, impressions, clicks, conversions, CPL, ROAS, and organic rank changes. Delivered on the 1st of every month." },
    ],
    techStack: [
      { name: "Google Analytics 4", category: "Analytics" },
      { name: "Google Search Console", category: "SEO" },
      { name: "Google Ads", category: "Paid Search" },
      { name: "Meta Ads Manager", category: "Paid Social" },
      { name: "Semrush", category: "SEO Research" },
      { name: "Ahrefs", category: "Backlinks" },
      { name: "Hotjar", category: "Behaviour" },
      { name: "Resend / Mailchimp", category: "Email" },
    ],
    faqs: [
      { q: "How long before we see SEO results?", a: "For a new website with no domain authority: 4–6 months to see meaningful organic traffic. For an established domain with existing rankings: improvements visible in 6–8 weeks. SEO is a compounding investment — the results at month 12 are dramatically better than month 3." },
      { q: "What is the minimum ad budget you recommend?", a: "Google Ads: ₹30,000/month minimum to generate statistically meaningful data for optimisation. Meta Ads: ₹15,000/month minimum. Below these thresholds, you will not generate enough clicks to learn what works. Our management fee is separate from your ad spend." },
      { q: "Do you guarantee results?", a: "No agency can ethically guarantee specific rankings or ROAS — too many variables are outside our control (competition, seasonality, landing page quality). We guarantee a transparent process, documented strategy, and monthly reporting. Our track record shows average ROAS of 3.2× across e-commerce clients." },
      { q: "How do you track ROI?", a: "GA4 conversion events for every goal (form fills, calls, purchases), Google Ads conversion import, Meta Pixel + Conversions API for server-side tracking, and UTM parameters on every link. You see a clear attribution path from ad spend to revenue." },
      { q: "Can you take over existing campaigns?", a: "Yes. We audit your existing Google Ads and Meta accounts, document what we find, agree on a transition plan, and take over management. We typically find 30–40% wasted spend in inherited accounts within the first month." },
    ],
    relatedSlugs: ["whatsapp-marketing-automation", "crm-integration", "web-development"],
  },

  // ─── WhatsApp Marketing Automation ───────────────────────────────────────────
  {
    slug: "whatsapp-marketing-automation",
    column: "Digital & IT Solutions",
    title: "WhatsApp Marketing Automation",
    tagline: "Reach Every Lead on WhatsApp — Automatically",
    metaTitle: "WhatsApp Marketing Automation India | Official Meta API | Conveys",
    metaDescription: "Broadcast campaigns, drip sequences, and trigger-based WhatsApp messages via the official Meta API. No grey tools, no ban risk. Fixed setup + monthly fee.",
    overview: [
      "Broadcast campaigns, drip sequences, and trigger-based messages delivered via the official Meta WhatsApp Business API. No grey-area tools, no account bans — just compliant, high-deliverability WhatsApp marketing that actually reaches your audience.",
      "WhatsApp open rates in India average 85%+ — compared to 20% for email. Your messages get read.",
    ],
    offerings: [
      { title: "Campaign Strategy & Setup", description: "Audience segmentation, message sequence design, A/B test planning, and timing strategy built around your sales cycle and customer journey.", icon: ICONS.broadcast },
      { title: "Template Creation & Approval", description: "Compliant message templates written for Meta's marketing, utility, and authentication categories — submitted and approved before your first send.", icon: ICONS.document },
      { title: "Broadcast Scheduling", description: "One-time and recurring broadcast campaigns scheduled to segments of your contact list with personalisation variables (name, order ID, product) filled from your CRM or database.", icon: ICONS.bolt },
      { title: "Drip Sequence Automation", description: "Time-delayed or event-triggered message sequences — welcome series, lead nurture flows, cart abandonment recovery, and post-purchase follow-up — running automatically 24/7.", icon: ICONS.refresh },
      { title: "Contact Segmentation", description: "Dynamic segments based on behaviour (clicked, replied, purchased), demographics, and custom tags — so the right message reaches the right person at the right moment.", icon: ICONS.users },
      { title: "Analytics & Opt-out Management", description: "Delivery rate, read rate, reply rate, and opt-out tracking in a dashboard your team can check daily. Opt-outs are honoured immediately to keep you compliant.", icon: ICONS.chart },
    ],
    process: [
      { step: "01", title: "WABA Onboarding", duration: "Day 1–7", body: "If you do not have a WhatsApp Business API account, we set it up first. Phone number registered, business verified, initial templates submitted." },
      { step: "02", title: "Template Creation", duration: "Day 5–10", body: "First batch of templates written and submitted. Marketing templates require Meta approval (24–48 hours). We write templates that pass first time." },
      { step: "03", title: "List Segmentation", duration: "Week 2", body: "Contact list imported, cleaned, and segmented. Opt-in status verified for every contact — non-opted-in contacts are quarantined." },
      { step: "04", title: "Campaign Setup", duration: "Week 2–3", body: "Broadcast and drip sequences built in the platform. Personalisation variables tested. Delivery and opt-out webhooks verified." },
      { step: "05", title: "Testing", duration: "Week 3", body: "Full end-to-end test with a seed list. Delivery confirmed, opt-out flow tested, and personalisation variables verified before production send." },
      { step: "06", title: "Launch & Monitoring", duration: "Week 3+", body: "First campaign sent. Delivery rates monitored in real time for the first 24 hours. Monthly performance review and template refresh cycle established." },
    ],
    techStack: [
      { name: "Meta WhatsApp Cloud API", category: "Messaging" },
      { name: "BullMQ", category: "Job Queue" },
      { name: "Redis", category: "Cache / Queue" },
      { name: "PostgreSQL", category: "Database" },
      { name: "Node.js", category: "Backend" },
      { name: "Custom Analytics Dashboard", category: "Reporting" },
    ],
    faqs: [
      { q: "Is this different from the WhatsApp Business App?", a: "Yes — completely. The Business App is a mobile app limited to one user and no automation. The API allows programmatic sending, bulk broadcasts, drip sequences, and CRM integration. You need the API to do any kind of marketing at scale." },
      { q: "Can I send promotional messages on WhatsApp?", a: "Yes, since 2021 Meta allows marketing messages via the API. Recipients must have opted in to receive marketing messages from you. Templates must be pre-approved by Meta. Messages outside an active conversation window require a template — free-form messages are only allowed within 24 hours of a user-initiated conversation." },
      { q: "What are the per-message costs?", a: "Meta charges per conversation (a 24-hour window), not per message. India rates: approximately ₹0.58 per marketing conversation, ₹0.14 per utility conversation, and ₹0 for service conversations (user-initiated). We model your expected monthly cost before you commit." },
      { q: "How do opt-outs work?", a: "When a user replies STOP or blocks your number, we receive a webhook and immediately mark them as opted out. They will never receive another message from you. Violating this is a Meta policy breach and can result in your WABA being banned." },
      { q: "How many contacts can I reach per day?", a: "New WABA accounts start at Tier 1: 1,000 unique conversations per day. This scales to Tier 2 (10,000), Tier 3 (100,000), and Unlimited as you maintain a good quality rating. We manage your quality rating as part of the service." },
    ],
    relatedSlugs: ["whatsapp-business-api", "whatsapp-crm", "crm-integration"],
  },

  // ─── CRM Integration & Setup ──────────────────────────────────────────────────
  {
    slug: "crm-integration",
    column: "Digital & IT Solutions",
    title: "CRM Integration & Setup",
    tagline: "Connect Your CRM to Every Tool Your Team Uses",
    metaTitle: "CRM Integration & Setup Services India | HubSpot, Zoho, Salesforce | Conveys",
    metaDescription: "CRM selection, setup, data migration, and API integration with WhatsApp, email, and payments for Indian businesses. HubSpot, Zoho, Salesforce, and custom CRMs.",
    overview: [
      "We set up, configure, and integrate CRM platforms — HubSpot, Zoho, Salesforce, or a custom-built solution — with your existing tools: WhatsApp, email, payment gateways, and internal databases.",
      "A CRM that is not integrated with your sales workflow is just an expensive contact list. We make it the single source of truth your team actually uses.",
    ],
    offerings: [
      { title: "CRM Selection & Setup", description: "We assess your team size, sales process, and budget to recommend the right CRM — then configure pipelines, deal stages, custom fields, and user roles to match your exact workflow.", icon: ICONS.cog },
      { title: "Data Migration & Cleaning", description: "Contacts, companies, deals, and activity history migrated from spreadsheets, legacy CRMs, or databases — with deduplication, field mapping, and a validation report.", icon: ICONS.database },
      { title: "API & Webhook Integration", description: "Bi-directional sync with WhatsApp, email platforms, payment gateways, ERPs, and custom internal systems — so data flows automatically without manual re-entry.", icon: ICONS.link },
      { title: "Custom Workflow Automation", description: "Lead assignment rules, task creation triggers, deal stage automations, and notification flows — built inside the CRM or via Zapier/Make.com for cross-platform workflows.", icon: ICONS.refresh },
      { title: "Team Training", description: "Role-specific training sessions for sales reps, managers, and admins — plus written SOP documentation so new hires can get up to speed without one-on-one sessions.", icon: ICONS.users },
      { title: "Ongoing Support", description: "Monthly retainer for new integration requests, field additions, workflow changes, and user troubleshooting. Your CRM evolves as your business does.", icon: ICONS.wrench },
    ],
    process: [
      { step: "01", title: "Requirements", duration: "Day 1–2", body: "Sales process mapping, tool inventory, integration requirements, and data volume assessment. CRM recommendation with cost comparison." },
      { step: "02", title: "CRM Selection", duration: "Day 2–3", body: "Written comparison of shortlisted CRMs against your requirements. Decision made, licences procured, and admin access configured." },
      { step: "03", title: "Setup & Configuration", duration: "Week 1–2", body: "Pipelines, custom fields, user roles, and email templates configured. Reviewed with your sales manager before data import." },
      { step: "04", title: "Data Migration", duration: "Week 2", body: "Data exported from source, cleaned, mapped, and imported with validation. Row counts and field spot-checks verified before sign-off." },
      { step: "05", title: "Integration", duration: "Week 2–3", body: "API connections to WhatsApp, email, and other tools built and tested. Bi-directional sync verified with live data." },
      { step: "06", title: "Training & Go-Live", duration: "Week 3–4", body: "Role-specific training sessions, SOP documentation delivered, and a 2-week hypercare period where we are on-call for questions." },
    ],
    techStack: [
      { name: "HubSpot", category: "CRM" },
      { name: "Zoho CRM", category: "CRM" },
      { name: "Salesforce", category: "CRM" },
      { name: "Pipedrive", category: "CRM" },
      { name: "Zapier", category: "Automation" },
      { name: "Make.com", category: "Automation" },
      { name: "REST APIs", category: "Integration" },
      { name: "PostgreSQL", category: "Database" },
    ],
    faqs: [
      { q: "Which CRM do you recommend for Indian SMBs?", a: "Zoho CRM for price-sensitive businesses (₹800–1,200/user/month) with Indian-specific features. HubSpot for businesses that want a generous free tier and strong marketing automation. Salesforce for enterprises with complex multi-team sales processes and budget to match. We do not take referral fees from any CRM vendor." },
      { q: "How long does data migration take?", a: "A clean export from a single source with under 50,000 records takes 2–3 days. Messy data from multiple spreadsheets with duplicates takes 5–7 days for cleaning and import. We always run a validation report before declaring migration complete." },
      { q: "Can you integrate the CRM with WhatsApp?", a: "Yes. We integrate your CRM with the WhatsApp Business API so every WhatsApp conversation is logged against the contact record, and your team can reply from inside the CRM or a linked inbox. See our WhatsApp CRM service for the full capability." },
      { q: "Do you build custom CRMs?", a: "Yes — for businesses where off-the-shelf CRMs do not fit the workflow (field sales teams, non-linear sales processes, industry-specific requirements). A custom CRM takes 12–16 weeks and is priced on scope. Most businesses find a configured off-the-shelf CRM sufficient." },
      { q: "What is the ongoing cost after setup?", a: "CRM licence cost (paid directly to the vendor), plus our optional monthly support retainer (₹8,000–15,000/month for integration maintenance, new fields, and workflow changes). The setup is a one-time project fee." },
    ],
    relatedSlugs: ["whatsapp-crm", "whatsapp-marketing-automation", "digital-marketing"],
  },

  // ─── Managed Service Provider ─────────────────────────────────────────────────
  {
    slug: "managed-service-provider",
    column: "Digital & IT Solutions",
    title: "Managed Service Provider",
    tagline: "Full-Spectrum IT Management for Growing Businesses",
    metaTitle: "Managed Service Provider India | End-to-End IT Management | Conveys",
    metaDescription: "End-to-end IT management — infrastructure, security, helpdesk, vendor management, and technology roadmap for Indian businesses. Predictable monthly cost, named account manager.",
    overview: [
      "We act as your outsourced IT department — managing infrastructure, security, vendors, and helpdesk under a single SLA. Predictable monthly cost, no hidden fees, and a named account manager on every engagement.",
      "The difference between an MSP and break-fix IT support: we prevent problems, not just fix them. Proactive monitoring, patching, and planning mean fewer incidents and lower total IT cost.",
    ],
    offerings: [
      { title: "End-to-End Infrastructure Management", description: "Servers, networks, cloud resources, and endpoints all managed under one contract. Single point of contact for every IT issue — no more vendor finger-pointing.", icon: ICONS.server },
      { title: "Cybersecurity & Compliance", description: "Endpoint protection, email security (SPF, DKIM, DMARC), vulnerability management, security awareness training, and incident response — with documentation for DPDP Act and ISO 27001 requirements.", icon: ICONS.shield },
      { title: "Vendor Management", description: "We manage your technology vendor relationships — ISPs, hardware suppliers, software vendors, and cloud providers — negotiating renewals and handling escalations on your behalf.", icon: ICONS.building },
      { title: "Helpdesk & On-Site Support", description: "Remote helpdesk via WhatsApp, email, and phone — plus scheduled on-site visits to your Mumbai or Thane office for hardware issues and device setup that cannot be resolved remotely.", icon: ICONS.users },
      { title: "Business Continuity Planning", description: "Documented BCP and DR plan with defined RTO and RPO, tested annually, and updated whenever your infrastructure changes. You know exactly how your business recovers from any failure scenario.", icon: ICONS.database },
      { title: "Technology Roadmap Advisory", description: "Annual technology roadmap, budget planning, and board-level IT reporting — so technology decisions are strategic, not reactive.", icon: ICONS.lightbulb },
    ],
    process: [
      { step: "01", title: "Discovery", duration: "Week 1", body: "Full infrastructure audit: every server, device, software licence, vendor contract, and network diagram. Risk assessment completed." },
      { step: "02", title: "Onboarding", duration: "Week 2–3", body: "Monitoring agents installed, runbooks written, vendor contacts transferred, and helpdesk portal configured for your team." },
      { step: "03", title: "Transition", duration: "Week 3–4", body: "Handover from your previous IT provider or internal team. No service gap — we overlap for one week to ensure continuity." },
      { step: "04", title: "Operations", duration: "Month 1+", body: "Proactive monitoring, monthly patching, weekly backup verification, and on-demand helpdesk. Business as usual for your team." },
      { step: "05", title: "Reviews", duration: "Quarterly", body: "Quarterly service review: SLA performance, incident trends, cost report, security posture, and roadmap update." },
      { step: "06", title: "Renewal", duration: "Annual", body: "Contract review with updated scope and pricing. Most clients expand scope over time as they consolidate more vendors under our management." },
    ],
    techStack: [
      { name: "AWS / Azure", category: "Cloud" },
      { name: "Datadog", category: "Monitoring" },
      { name: "Veeam", category: "Backup" },
      { name: "Fortinet", category: "Security" },
      { name: "Microsoft 365", category: "Productivity" },
      { name: "Jira Service Mgmt", category: "Helpdesk" },
      { name: "PagerDuty", category: "Alerting" },
      { name: "Cloudflare", category: "CDN / Security" },
    ],
    faqs: [
      { q: "What makes an MSP different from managed IT services?", a: "Managed IT Services typically covers a defined set of tasks (monitoring, backup, patching). An MSP takes broader accountability — vendor management, strategic planning, and acting as your de facto IT director. We offer both; the MSP engagement is for businesses that want to fully outsource IT decision-making, not just operations." },
      { q: "What are your SLA response times?", a: "P1 (complete outage): 15-minute response, 2-hour resolution target. P2 (major degradation): 1-hour response, 4-hour resolution. P3 (minor issue): 4-hour response, next business day resolution. P4 (request): 8 business hours. All measured and reported monthly." },
      { q: "Do you support multi-site businesses?", a: "Yes. We manage businesses with offices across Mumbai, Pune, Delhi, and Bengaluru. Remote support handles 90% of issues; on-site visits to non-Mumbai locations are billed at cost plus travel." },
      { q: "What is the minimum contract term?", a: "12 months. After the initial term, month-to-month with 60 days notice. We invest significantly in the onboarding and runbook creation phase, so short-term contracts are not viable for either party." },
      { q: "Can you take over from our existing IT vendor?", a: "Yes — we handle this regularly. We run a parallel period of 2–4 weeks where we shadow the existing vendor, then take full responsibility on a defined handover date. Your staff will not notice the transition." },
    ],
    relatedSlugs: ["managed-it-services", "cloud-infrastructure-setup", "digital-transformation"],
  },

  // ─── SaaS Product Development ─────────────────────────────────────────────────
  {
    slug: "saas-product-development",
    column: "Product Development",
    title: "SaaS Product Development",
    tagline: "From Zero to SaaS — Full Product, Not Just Code",
    metaTitle: "SaaS Product Development India | Multi-Tenant, Stripe, Clerk | Conveys",
    metaDescription: "Multi-tenant SaaS products built end-to-end — architecture, billing, admin dashboard, API, and launch support. You own the IP. Fixed pricing for Indian founders.",
    overview: [
      "Multi-tenant architecture, subscription billing, admin dashboards, and API access — we build SaaS products end-to-end. You own the IP, we own the delivery.",
      "We have built SaaS products in fintech, HR, CRM, and e-commerce verticals. We know the patterns, the pitfalls, and the shortcuts that are worth taking.",
    ],
    offerings: [
      { title: "Product Strategy & Scoping", description: "Feature prioritisation, user persona definition, monetisation model design, and a phased roadmap — so you build what users will pay for, not what sounds impressive.", icon: ICONS.lightbulb },
      { title: "Multi-Tenant Architecture", description: "Shared PostgreSQL with row-level security for tenant isolation, or schema-per-tenant for strict data separation — chosen based on your compliance requirements and scale targets.", icon: ICONS.building },
      { title: "Subscription & Billing", description: "Stripe and Razorpay integration with plan management, usage-based billing, trial periods, dunning, and an upgrade/downgrade flow that retains customers instead of losing them at friction.", icon: ICONS.bag },
      { title: "Admin & Customer Dashboard", description: "A customer-facing dashboard for every tenant and a superadmin panel for your team — usage metrics, billing history, user management, and feature flags.", icon: ICONS.chart },
      { title: "REST API & Webhooks", description: "A public API with OpenAPI documentation and a webhook system so your customers can integrate your SaaS into their own tools — the feature that converts free users to paid.", icon: ICONS.link },
      { title: "Launch & GTM Support", description: "Production deployment, monitoring setup, onboarding email sequences, in-app tutorials, and a launch checklist so your first users have a polished experience from day one.", icon: ICONS.rocket },
    ],
    process: [
      { step: "01", title: "Discovery", duration: "Week 1", body: "User persona interviews, competitor analysis, feature scope, monetisation model, and a written product spec. Nothing is ambiguous before week 2." },
      { step: "02", title: "Architecture", duration: "Week 1–2", body: "Multi-tenancy strategy, data model, API contract, third-party service selection, and infrastructure design — all documented and reviewed." },
      { step: "03", title: "Alpha Build", duration: "Week 3–8", body: "Core features built in two-week sprints. You get a working staging environment at the end of week 4 — not a demo, a real product." },
      { step: "04", title: "Beta", duration: "Week 9–11", body: "Invite your first 10–20 users. We fix issues in real time, instrument analytics, and refine the onboarding flow based on actual usage data." },
      { step: "05", title: "Launch", duration: "Week 12", body: "Production go-live: Stripe live mode, custom domain, SSL, transactional emails, error monitoring, and uptime alerting configured." },
      { step: "06", title: "Growth", duration: "Month 4+", body: "Feature additions on a monthly retainer, performance tuning as scale increases, and infrastructure scaling plan as you hit the first revenue milestones." },
    ],
    techStack: [
      { name: "Next.js 15", category: "Frontend" },
      { name: "Fastify", category: "Backend" },
      { name: "PostgreSQL + RLS", category: "Database" },
      { name: "Prisma ORM", category: "ORM" },
      { name: "Stripe", category: "Billing" },
      { name: "Razorpay", category: "Billing (India)" },
      { name: "Clerk", category: "Auth" },
      { name: "BullMQ / Redis", category: "Queue / Cache" },
      { name: "Vercel / Railway", category: "Hosting" },
      { name: "Sentry", category: "Error Tracking" },
    ],
    faqs: [
      { q: "How long does it take to build a SaaS product?", a: "A focused MVP SaaS with core features and billing takes 10–14 weeks. A full-featured product with API, webhooks, admin panel, and a polished onboarding flow takes 16–24 weeks. We give you a precise timeline after the discovery workshop." },
      { q: "Who owns the intellectual property?", a: "You do, completely. All source code, designs, database schemas, and documentation are assigned to you at project completion. We sign an IP assignment agreement before work begins." },
      { q: "How do you handle multi-tenancy?", a: "Shared database with PostgreSQL row-level security (RLS) for most projects — it is simpler to operate and scales to thousands of tenants without sharding. For enterprises requiring strict data isolation (banking, healthcare), we implement schema-per-tenant or database-per-tenant." },
      { q: "How do you handle subscription billing for Indian customers?", a: "Razorpay for Indian customers (UPI, net banking, cards, EMI) and Stripe for international customers — both can run simultaneously. We implement plan management, trial periods, proration on upgrades, and dunning for failed payments." },
      { q: "What support do you provide after launch?", a: "30-day free bug-fix period. After that, monthly retainers cover feature development, performance tuning, dependency updates, and on-call support. Most SaaS clients keep us on as their ongoing engineering team." },
    ],
    relatedSlugs: ["mvp-development", "custom-software-development", "api-integration-development"],
  },

  // ─── MVP Development ──────────────────────────────────────────────────────────
  {
    slug: "mvp-development",
    column: "Product Development",
    title: "MVP Development",
    tagline: "Validate Your Idea in 8 Weeks — Not 8 Months",
    metaTitle: "MVP Development Services India | 8-Week Build | Conveys",
    metaDescription: "Focused MVP development in 8 weeks for Indian founders. We scope ruthlessly, build what matters, and ship before the window closes. Fixed price, you own the IP.",
    overview: [
      "A focused, fixed-scope MVP that proves your core hypothesis to early users and investors. We scope ruthlessly, build the minimum that matters, and ship before the window closes.",
      "An MVP is not a prototype. It is a real product — deployed, live, and in the hands of real users. We have shipped MVPs that raised seed rounds, and MVPs that proved the idea wrong early enough to pivot. Both outcomes are wins.",
    ],
    offerings: [
      { title: "Scope & Feature Prioritisation", description: "A structured workshop to separate must-haves from nice-to-haves. We apply the Jobs-to-be-Done framework to identify the one thing your MVP must prove — and cut everything that does not serve that goal.", icon: ICONS.check },
      { title: "UX Prototype", description: "Clickable Figma prototype for investor demos and user testing before development begins — so you can validate the concept without writing a line of code.", icon: ICONS.pencil },
      { title: "Core Feature Development", description: "The one or two features that prove your hypothesis, built to production quality. No scaffolding code, no shortcuts that create technical debt you will spend months paying back.", icon: ICONS.code },
      { title: "User Onboarding Flow", description: "A frictionless sign-up, activation, and first-value flow — because a working product that users do not understand is not an MVP, it is a prototype.", icon: ICONS.users },
      { title: "Analytics & Feedback Tools", description: "PostHog for product analytics (funnel tracking, session recording, feature flags) and an in-app feedback widget — so you collect evidence for your next roadmap decision from day one.", icon: ICONS.chart },
      { title: "Investor Demo Readiness", description: "Production deployment, custom domain, and a demo script walkthrough. Your MVP is presentable to investors and early customers from launch day.", icon: ICONS.rocket },
    ],
    process: [
      { step: "01", title: "Scope Workshop", duration: "Day 1–2", body: "3-hour structured workshop. One hypothesis, three user stories, a feature list that goes in and a cut list that does not. Fixed scope agreed before anything is quoted." },
      { step: "02", title: "UX Design", duration: "Week 1", body: "Figma screens for the critical user journey. Approved before development begins — this is not skipped even in an 8-week build." },
      { step: "03", title: "Sprint 1", duration: "Week 2–4", body: "Core infrastructure, authentication, and the primary feature built. Staging URL live by end of week 4." },
      { step: "04", title: "Sprint 2", duration: "Week 5–7", body: "Secondary features, onboarding flow, and analytics instrumentation. Beta users invited by end of week 6." },
      { step: "05", title: "Beta Testing", duration: "Week 7", body: "5–10 target users given access. Feedback collected, critical issues fixed, and non-critical items logged for post-launch." },
      { step: "06", title: "Launch", duration: "Week 8", body: "Production deployment, custom domain, monitoring configured. You own a live product in 8 weeks." },
    ],
    techStack: [
      { name: "Next.js 15", category: "Frontend" },
      { name: "Fastify", category: "Backend" },
      { name: "PostgreSQL", category: "Database" },
      { name: "Prisma ORM", category: "ORM" },
      { name: "Clerk", category: "Auth" },
      { name: "Stripe / Razorpay", category: "Payments" },
      { name: "Vercel", category: "Frontend Hosting" },
      { name: "Railway", category: "Backend Hosting" },
      { name: "PostHog", category: "Analytics" },
      { name: "Sentry", category: "Error Tracking" },
    ],
    faqs: [
      { q: "What qualifies as an MVP?", a: "A real, deployed product that lets you test one specific hypothesis with real users. Not a landing page, not a Figma prototype, not a feature-complete v1. The question an MVP answers is: will people use this? If yes, which parts? If no, why not?" },
      { q: "How do you decide what to cut?", a: "Everything that does not directly test the core hypothesis is cut. We use the Jobs-to-be-Done framework: what job is the user hiring this product to do? Features that do not serve that job go to the post-MVP backlog, not the build." },
      { q: "Fixed price or sprint-based billing?", a: "Fixed price for MVPs — the scope is agreed in the workshop and does not change. If new requirements emerge during build, they go on the post-MVP backlog. This keeps the 8-week timeline and the fixed price intact." },
      { q: "How long does an MVP take?", a: "8 weeks for a focused single-workflow MVP. 10–12 weeks if it requires third-party integrations or a mobile app component. We do not negotiate the timeline down — 8 weeks is already aggressive." },
      { q: "What happens after the MVP launches?", a: "You spend 4–8 weeks gathering user feedback and usage data. Then we run a post-MVP planning session to decide what to build next — informed by evidence, not assumptions. Most clients continue on a monthly retainer for iteration." },
    ],
    relatedSlugs: ["saas-product-development", "custom-software-development", "web-development"],
  },

  // ─── API & Integration Development ───────────────────────────────────────────
  {
    slug: "api-integration-development",
    column: "Product Development",
    title: "API & Integration Development",
    tagline: "Connect Every Tool in Your Stack — Without the Glue Code",
    metaTitle: "API & Integration Development India | REST, Webhooks, OAuth | Conveys",
    metaDescription: "REST APIs, webhooks, OAuth flows, and third-party integrations for Indian businesses. OpenAPI documentation included. Fastify, Node.js, TypeScript. Fixed pricing.",
    overview: [
      "REST APIs, webhooks, OAuth flows, and third-party integrations built by engineers who have connected 50+ services across payments, messaging, CRM, ERP, and cloud providers.",
      "Every integration we ship has error handling, retry logic, idempotency, and a test suite — because integrations that work 95% of the time create more problems than no integration at all.",
    ],
    offerings: [
      { title: "REST API Design & Development", description: "OpenAPI-first design, Fastify implementation, Zod request validation, and versioned endpoints — with a Swagger UI deployed alongside your API from day one.", icon: ICONS.link },
      { title: "Third-Party API Integration", description: "Payment gateways (Stripe, Razorpay, PayU), CRMs (HubSpot, Zoho, Salesforce), ERPs (SAP, Tally), and 40+ other services integrated with proper error handling and monitoring.", icon: ICONS.refresh },
      { title: "Webhook Implementation", description: "Inbound webhook endpoints with signature verification, idempotency keys, and dead-letter queues — so every event from Stripe, WhatsApp, or GitHub is captured and processed exactly once.", icon: ICONS.server },
      { title: "OAuth & API Key Management", description: "OAuth 2.0 and OpenID Connect flows for third-party app integrations, plus API key generation, scoping, rate limiting, and rotation — so you can build a developer platform on top of your product.", icon: ICONS.lock },
      { title: "Rate Limiting & Retry Logic", description: "Redis-backed sliding window rate limiting, exponential backoff with jitter for outbound calls, and circuit breakers for third-party dependencies — so your app degrades gracefully instead of failing completely.", icon: ICONS.shield },
      { title: "API Documentation (OpenAPI)", description: "Auto-generated Swagger UI, a written integration guide for external developers, and a Postman collection — because an undocumented API is not a product, it is a liability.", icon: ICONS.document },
    ],
    process: [
      { step: "01", title: "Integration Mapping", duration: "Day 1–2", body: "Every API to be consumed or exposed mapped with its authentication method, rate limits, data formats, and error response patterns. Gotchas documented before implementation." },
      { step: "02", title: "API Design", duration: "Day 2–4", body: "OpenAPI specification written for any new endpoints. Reviewed with frontend team and external consumers before implementation begins." },
      { step: "03", title: "Development", duration: "Week 2–4", body: "Endpoints and integrations built with full error handling. Webhook endpoints tested with real payloads from the third-party sandbox." },
      { step: "04", title: "Testing", duration: "Week 4–5", body: "Unit tests for business logic, integration tests against real sandbox APIs, and load tests for high-traffic endpoints. Edge cases — empty responses, rate limit hits, timeouts — all covered." },
      { step: "05", title: "Documentation", duration: "Week 5", body: "Swagger UI deployed, integration guide written, and Postman collection exported. External developers can self-serve from the docs." },
      { step: "06", title: "Deployment & Monitoring", duration: "Week 5–6", body: "Production deployment with Datadog monitoring on every third-party call — latency, error rate, and rate limit proximity tracked and alerted." },
    ],
    techStack: [
      { name: "Node.js", category: "Runtime" },
      { name: "Fastify", category: "Framework" },
      { name: "TypeScript", category: "Language" },
      { name: "OpenAPI / Swagger", category: "Docs" },
      { name: "Zod", category: "Validation" },
      { name: "PostgreSQL", category: "Database" },
      { name: "Redis", category: "Rate Limiting" },
      { name: "BullMQ", category: "Queue" },
      { name: "Postman", category: "Testing" },
    ],
    faqs: [
      { q: "Which payment gateways do you integrate?", a: "Razorpay and Stripe most commonly — Razorpay for India-first products (UPI, net banking, EMI), Stripe for international. We also integrate PayU, CCAvenue, PayTM, and PhonePe for specific requirements. All integrations include webhook handling for payment events." },
      { q: "Can you integrate with legacy SOAP or XML APIs?", a: "Yes. We wrap SOAP or XML APIs in a modern REST adapter so your application talks to a clean JSON interface while we handle the SOAP envelope transformation internally. Common for ERP and banking integrations in India." },
      { q: "How do you handle API errors and failures?", a: "Outbound calls use exponential backoff with jitter and a maximum retry count. Persistent failures trigger a dead-letter queue for manual review. Inbound webhooks are acknowledged immediately and processed asynchronously — so a slow processor does not cause the sender to time out and retry." },
      { q: "How do you handle API versioning?", a: "URL prefix versioning (/v1/, /v2/) for APIs with external consumers. We maintain old versions for a documented deprecation period (minimum 6 months) before sunset. Breaking changes always get a new version number." },
      { q: "How long does a typical integration take?", a: "A single well-documented third-party API integration (e.g., Stripe payments, Razorpay, HubSpot) takes 3–5 days. A complex ERP integration with custom data mapping takes 2–4 weeks. A full custom REST API build takes 4–8 weeks depending on scope." },
    ],
    relatedSlugs: ["backend-development", "saas-product-development", "crm-integration"],
  },

  // ─── E-commerce Solutions ─────────────────────────────────────────────────────
  {
    slug: "ecommerce-solutions",
    column: "Product Development",
    title: "E-commerce Solutions",
    tagline: "Online Stores Built to Sell — Not Just to Look Good",
    metaTitle: "E-commerce Development India | Razorpay, Stripe, Custom Store | Conveys",
    metaDescription: "Custom e-commerce stores with Razorpay and Stripe payment integration, inventory management, order tracking, and an admin panel. Built for conversion. Fixed pricing.",
    overview: [
      "Custom e-commerce stores with Razorpay and Stripe payment integration, inventory management, order tracking, and an admin panel your team can run without a developer. Built for conversion, not just aesthetics.",
      "We build custom stores because Shopify's transaction fees add up, WooCommerce becomes a plugin nightmare, and both impose limits your business will eventually outgrow. You own the code, the data, and the customer relationship.",
    ],
    offerings: [
      { title: "Store Design & Development", description: "Custom Next.js storefront with product listing pages, collection filters, search, and a checkout flow optimised for Indian buyers — UPI one-click, saved addresses, and GST invoice generation.", icon: ICONS.bag },
      { title: "Product Catalogue Management", description: "Sanity CMS or custom admin panel for your team to add products, manage variants (size, colour, weight), update pricing, and publish/unpublish listings without touching code.", icon: ICONS.pencil },
      { title: "Payment Gateway Integration", description: "Razorpay for India (UPI, net banking, cards, EMI, PayLater) and Stripe for international — with refund handling, partial captures, and failed payment recovery flows.", icon: ICONS.bolt },
      { title: "Order & Inventory Management", description: "Order pipeline from placement through fulfilment and delivery, inventory tracking with low-stock alerts, and return/exchange workflow — all manageable from your admin panel.", icon: ICONS.refresh },
      { title: "SEO & Performance", description: "Server-side rendered product pages, structured data (Product, BreadcrumbList, Review), XML sitemap, canonical URLs, and Core Web Vitals optimisation — so Google finds and ranks every product.", icon: ICONS.search },
      { title: "Admin Panel & Reports", description: "Sales dashboard, revenue by product/category, customer lifetime value, abandoned cart report, and inventory valuation — the numbers you need to run the business, not 47 metrics you never look at.", icon: ICONS.chart },
    ],
    process: [
      { step: "01", title: "Discovery", duration: "Week 1", body: "Product catalogue size, order volume projections, payment requirements, third-party integrations (ERP, logistics, WhatsApp), and design brief agreed." },
      { step: "02", title: "Design", duration: "Week 1–2", body: "Figma screens for homepage, listing, product detail, cart, and checkout. Mobile-first — 70% of Indian e-commerce traffic is mobile." },
      { step: "03", title: "Development", duration: "Week 3–8", body: "Storefront and admin panel built in parallel. Staging store live with test products by week 5. Payment sandbox tested end-to-end." },
      { step: "04", title: "Payment Setup", duration: "Week 7", body: "Razorpay or Stripe production credentials configured, webhook endpoints verified, and a live test transaction processed before launch." },
      { step: "05", title: "QA & Performance", duration: "Week 8", body: "Cross-device testing on real Android and iOS devices, Lighthouse audit on every page type, and a checkout flow walkthrough with your team." },
      { step: "06", title: "Launch", duration: "Week 8–9", body: "Production deployment, domain connected, SSL issued, Google Analytics 4 and Search Console configured, and sitemap submitted." },
    ],
    techStack: [
      { name: "Next.js 15", category: "Frontend" },
      { name: "PostgreSQL", category: "Database" },
      { name: "Prisma ORM", category: "ORM" },
      { name: "Razorpay", category: "Payments (India)" },
      { name: "Stripe", category: "Payments (Global)" },
      { name: "Sanity CMS", category: "CMS" },
      { name: "Vercel", category: "Hosting" },
      { name: "Cloudflare", category: "CDN" },
      { name: "AWS S3", category: "Media Storage" },
    ],
    faqs: [
      { q: "Shopify or custom store — which do you recommend?", a: "Shopify for businesses that want to launch in 2 weeks and are happy paying 0.5–2% transaction fees indefinitely. Custom store for businesses doing over ₹20 lakh/month in GMV (where fees add up), needing custom checkout logic, or wanting to own their tech stack. We build custom stores — we do not do Shopify development." },
      { q: "Which payment gateways work best for India?", a: "Razorpay is the default recommendation — UPI, net banking, all card networks, EMI, and PayLater in one integration. For international sales, add Stripe. We integrate both in a single checkout so Indian and global buyers have a native experience." },
      { q: "Can you generate GST invoices automatically?", a: "Yes. We build invoice generation into the order flow — GST number capture at checkout, correct CGST/SGST/IGST split based on buyer and seller state, and PDF invoice emailed automatically on order confirmation." },
      { q: "How do you handle product returns?", a: "Return requests created by customers in the order portal, reviewed and approved by your team in the admin panel, and refunds triggered via Razorpay or Stripe API. Inventory is automatically restocked on return approval." },
      { q: "What is the typical timeline for an e-commerce store?", a: "A store with up to 500 products, a custom design, and standard payment + order management takes 8–10 weeks. A multi-vendor marketplace or a store with ERP integration takes 14–18 weeks." },
    ],
    relatedSlugs: ["web-development", "saas-product-development", "digital-marketing"],
  },

  // ─── B2B Platform Design ──────────────────────────────────────────────────────
  {
    slug: "b2b-platform-design",
    column: "Product Development",
    title: "B2B Platform Design",
    tagline: "B2B Platforms That Enterprise Buyers Actually Use",
    metaTitle: "B2B Platform Design Services India | Portal UX, Design Systems | Conveys",
    metaDescription: "Stakeholder research, information architecture, and high-fidelity design for B2B portals, procurement platforms, and multi-role SaaS. Figma handoff included.",
    overview: [
      "Stakeholder research, information architecture, and high-fidelity design for portals, procurement platforms, and multi-role SaaS products. We design for complex workflows, not consumer simplicity.",
      "B2B platforms fail when designed like consumer apps. Enterprise buyers have different mental models, different success metrics, and zero tolerance for a beautiful UI that makes them less efficient.",
    ],
    offerings: [
      { title: "Stakeholder Research & Journey Mapping", description: "Interviews with buyers, approvers, admins, and end users — each with different goals, permissions, and frustration points. Journey maps that reveal where the current process breaks down.", icon: ICONS.users },
      { title: "Information Architecture", description: "Navigation taxonomy, permission hierarchy, and content structure designed for a user who will use the platform every day — not just for a demo.", icon: ICONS.document },
      { title: "Role-Based Dashboard Design", description: "Distinct UI experiences for each role (buyer, approver, admin, finance) — same platform, different information density and action sets based on what each role actually needs.", icon: ICONS.building },
      { title: "Design System Creation", description: "A component library in Figma with tokens for colour, typography, spacing, and density — matched to enterprise conventions your buyers recognise, not consumer trends.", icon: ICONS.cog },
      { title: "Usability Testing with Real Users", description: "Moderated sessions with 3–5 users from your target buyer persona — not internal stakeholders, not your sales team. Real users, real friction, real fixes.", icon: ICONS.search },
      { title: "Developer Handoff & UAT", description: "Annotated Figma files, interactive prototype for UAT, and presence during the first developer sprint to answer implementation questions and prevent design drift.", icon: ICONS.code },
    ],
    process: [
      { step: "01", title: "Discovery", duration: "Week 1", body: "Stakeholder interviews, competitor platform review, and current-state process documentation. We understand the workflow before designing a pixel." },
      { step: "02", title: "Information Architecture", duration: "Week 1–2", body: "Site map, navigation structure, and permission model. Reviewed with every role's representative before proceeding to wireframes." },
      { step: "03", title: "Wireframes", duration: "Week 2–3", body: "Low-fidelity screens for every key workflow — focused on structure and logic, not aesthetics. Faster to iterate at this stage than in high-fidelity." },
      { step: "04", title: "Visual Design", duration: "Week 3–5", body: "High-fidelity screens applying your brand. Data-dense layouts, clear hierarchy, and micro-interactions that communicate system state." },
      { step: "05", title: "Prototype Testing", duration: "Week 5–6", body: "Clickable prototype tested with real users from the target buyer persona. Findings reported with severity ratings and recommended fixes." },
      { step: "06", title: "Handoff", duration: "Week 6–7", body: "Annotated Figma file, component library, and a handoff call with the development team. Available for questions throughout the build." },
    ],
    techStack: [
      { name: "Figma", category: "Design" },
      { name: "FigJam", category: "Workshops" },
      { name: "Maze", category: "User Testing" },
      { name: "Hotjar", category: "Behaviour Analytics" },
      { name: "Storybook", category: "Component Docs" },
      { name: "Zeroheight", category: "Design System Docs" },
      { name: "Tailwind CSS", category: "Styling" },
      { name: "Next.js", category: "Frontend" },
    ],
    faqs: [
      { q: "What makes B2B UX different from B2C?", a: "B2B users are power users who use the platform for hours every day. They prioritise efficiency, information density, and keyboard shortcuts over visual delight. They have multiple roles to serve, complex approval workflows, and often switch between the platform and email/ERP constantly. Designing for them requires research, not assumptions." },
      { q: "How many user roles and personas do you typically design for?", a: "3–5 roles for most B2B platforms: end user, manager/approver, admin, and sometimes finance or external vendor. We design distinct experiences for each role rather than showing and hiding the same UI." },
      { q: "Do you do the frontend development too?", a: "Yes — we can design and build. Many clients engage us for design first, then development. Others have their own development team and just need a handoff-ready Figma file. We are flexible on scope." },
      { q: "How do you handle feedback from multiple stakeholders?", a: "We use Figma's commenting system and run structured feedback sessions with stakeholder groups separated by role. We document every piece of feedback, explain our design rationale for choices we push back on, and version the file so you can see the history of decisions." },
      { q: "What is the typical timeline for a B2B platform design?", a: "Discovery and IA: 2 weeks. Wireframes: 1–2 weeks. Visual design: 2–3 weeks. Testing and iteration: 1–2 weeks. Total: 6–9 weeks for a mid-complexity platform. Development adds 12–20 weeks depending on feature scope." },
    ],
    relatedSlugs: ["ui-ux-design", "saas-product-development", "custom-software-development"],
  },

  // ─── WhatsApp Commerce Solutions ──────────────────────────────────────────────
  {
    slug: "whatsapp-commerce",
    column: "Product Development",
    title: "WhatsApp Commerce Solutions",
    tagline: "Sell on WhatsApp — Where Your Customers Already Are",
    metaTitle: "WhatsApp Commerce Solutions India | Catalogue, Checkout, Payments | Conveys",
    metaDescription: "Product catalogues, WhatsApp-native checkout, payment links, order notifications, and inventory sync via the official Meta API. Sell at scale on WhatsApp.",
    overview: [
      "Product catalogues, checkout links, order confirmations, and payment integration — all delivered inside WhatsApp. We set up the full commerce stack on the official Meta API so you can transact at scale without a separate app or website.",
      "WhatsApp has 500 million active users in India. Your customers are already there — shopping on WhatsApp reduces the friction of sending them somewhere else to buy.",
    ],
    offerings: [
      { title: "WhatsApp Product Catalogue Setup", description: "Facebook Commerce Manager catalogue synced to your WhatsApp Business API account — products browsable inside WhatsApp with images, descriptions, and pricing.", icon: ICONS.bag },
      { title: "Checkout & Payment Link Integration", description: "Razorpay payment links generated and sent inside WhatsApp conversations — customer pays without leaving the chat. Order confirmation sent automatically on payment success.", icon: ICONS.bolt },
      { title: "Order Confirmation & Tracking Notifications", description: "Automated order confirmation, shipping update, and delivery confirmation messages sent via approved WhatsApp templates — keeping customers informed without manual follow-up.", icon: ICONS.chat },
      { title: "Inventory Sync", description: "Real-time catalogue sync from your inventory system or Sanity CMS — products go out of stock automatically on WhatsApp when inventory hits zero, preventing overselling.", icon: ICONS.refresh },
      { title: "Abandoned Cart Recovery", description: "Trigger-based messages sent to customers who added items to cart but did not complete payment — with a payment link and an optional discount code to recover the sale.", icon: ICONS.broadcast },
      { title: "Analytics & Reporting", description: "Catalogue view rates, add-to-cart events, payment link click-through, and conversion rates — tracked in a dashboard so you know which products sell on WhatsApp and which do not.", icon: ICONS.chart },
    ],
    process: [
      { step: "01", title: "WABA Setup", duration: "Day 1–7", body: "If you do not have a WhatsApp Business API account, we set it up — business verification, number registration, and initial template approval." },
      { step: "02", title: "Catalogue Upload", duration: "Day 5–10", body: "Facebook Commerce Manager catalogue created and synced to your WABA. First product set uploaded and verified visible in WhatsApp." },
      { step: "03", title: "Payment Integration", duration: "Week 2", body: "Razorpay integration for payment link generation. Webhook handler for payment success events. Order record created on payment confirmation." },
      { step: "04", title: "Notification Flows", duration: "Week 2–3", body: "Order confirmation, shipping update, and delivery notification templates submitted and approved. Automated trigger logic built and tested." },
      { step: "05", title: "Testing", duration: "Week 3", body: "End-to-end test: product browse → add to cart → payment link → payment → confirmation message. All flows verified with real Razorpay test transactions." },
      { step: "06", title: "Launch", duration: "Week 3–4", body: "Production go-live. First real order placed and confirmed. Monitoring on delivery rates and payment webhook reliability confirmed." },
    ],
    techStack: [
      { name: "Meta WhatsApp Cloud API", category: "Messaging" },
      { name: "Facebook Commerce Manager", category: "Catalogue" },
      { name: "Razorpay", category: "Payments" },
      { name: "Node.js", category: "Backend" },
      { name: "PostgreSQL", category: "Database" },
      { name: "Redis / BullMQ", category: "Queue" },
      { name: "Next.js Admin", category: "Dashboard" },
    ],
    faqs: [
      { q: "Is this like having a Shopify store on WhatsApp?", a: "Conceptually similar — customers browse products, add to cart, and pay — but the entire experience happens inside WhatsApp rather than a separate website. The catalogue uses Facebook Commerce Manager, and payment is handled via a Razorpay payment link sent in the chat." },
      { q: "Which payment methods can customers use?", a: "Razorpay supports UPI, net banking, all major credit and debit cards, EMI, and PayLater — all accessible via a payment link sent inside WhatsApp. The customer taps the link, pays on the Razorpay checkout page (optimised for mobile), and returns to the WhatsApp conversation." },
      { q: "Can customers pay directly inside WhatsApp without leaving the chat?", a: "WhatsApp Pay is available in India for peer-to-peer transfers, but the Meta Business API does not currently support native in-chat payments for merchants outside the WhatsApp Pay merchant programme (limited rollout). Payment links via Razorpay are the standard merchant solution — one tap opens the payment page." },
      { q: "How do you handle returns and refunds?", a: "Return requests are managed via a WhatsApp chatbot flow — customer replies with an order number, selects a reason, and receives a return confirmation. Refunds are processed via the Razorpay dashboard or API and a refund confirmation message is sent automatically." },
      { q: "How many products can the catalogue hold?", a: "Facebook Commerce Manager supports up to 100,000 products per catalogue. For most businesses, the practical limit is how fast catalogue images load for customers — we optimise image size as part of the setup." },
    ],
    relatedSlugs: ["whatsapp-business-api", "ecommerce-solutions", "whatsapp-marketing-automation"],
  },
];

export function getService(slug: string): ServiceData {
  const found = SERVICES.find((s) => s.slug === slug);
  if (!found) throw new Error(`Service not found: ${slug}`);
  return found;
}

export const COLUMNS: ServiceColumn[] = [
  "Cloud Services",
  "IT Software Consultancy",
  "Digital & IT Solutions",
  "Product Development",
];

export function getServicesByColumn(column: ServiceColumn): ServiceNavItem[] {
  return SERVICE_NAV.filter((s) => s.column === column);
}
