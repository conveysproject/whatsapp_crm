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
